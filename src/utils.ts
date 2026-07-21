import fs from "node:fs";
import { appendFile } from "node:fs/promises";
import axios from "axios";
import { join } from "node:path";
import { Options, PackageLockData } from "./types";
import { REGISTRIES } from "./constants";

// ============================================================
// Registry 相关
// ============================================================

/**
 * 根据命令行选项获取 registry 源地址
 * @param options 命令行参数
 * @returns registry URL
 */
export const getRegistry = (options: Options): string => {
	if (options.cnpm || options.c) return REGISTRIES.CNPM;
	if (options.yarn || options.y) return REGISTRIES.YARN;
	if (options.taobao || options.t) return REGISTRIES.TAOBAO;
	return REGISTRIES.NPM;
};

/**
 * 获取当前工作目录下的文件路径
 * @param filename 文件名
 */
export const getFilePath = (filename: string): string => {
	return join(process.cwd(), filename);
};

// ============================================================
// URL 构建
// ============================================================

/**
 * 构建 npm 包的 .tgz 下载地址
 *
 * 支持 scoped package（如 @scope/name），自动处理 URL 编码。
 *
 * @param name     包名
 * @param version  版本号
 * @param registry registry 地址
 * @returns tgz 下载 URL
 */
export const buildTgzUrl = (
	name: string,
	version: string,
	registry: string
): string => {
	const encodedName = encodeURIComponent(name);
	return `${registry}${encodedName}/-/${encodedName}-${version}.tgz`;
};

/**
 * 从 tgz 下载 URL 中解析出文件名
 * @param url tgz 下载地址
 * @returns 解析后的 URL 和文件名
 * @throws 当 URL 无效或无法解析时抛出错误
 */
export const parseURL = (url: string): { url: string; fileName: string } => {
	const parsedUrl = new URL(url);
	if (!parsedUrl.protocol.startsWith("http")) {
		throw new Error(`无效的 URL 协议: ${url}`);
	}
	const pathParts = parsedUrl.pathname.split("/-/");
	if (pathParts.length < 2) {
		throw new Error(`无法从 URL 中解析文件名: ${url}`);
	}
	return { url, fileName: pathParts[1] };
};

// ============================================================
// 文件系统操作
// ============================================================

/**
 * 向文件追加内容
 * @param filePath 文件路径
 * @param content  要追加的内容
 */
export const appendFileRecord = async (
	filePath: string,
	content: string
): Promise<void> => {
	await appendFile(filePath, content + "\n", "utf8");
};

/**
 * 创建文件夹（如果不存在则创建）
 * @param dir 文件夹路径
 */
export const createDirectory = (dir: string): void => {
	if (fs.existsSync(dir)) {
		console.log(`文件夹已存在: ${dir}`);
		return;
	}
	fs.mkdirSync(dir, { recursive: true });
	console.log(`文件夹创建成功: ${dir}`);
};

/**
 * 递归删除文件夹
 * @param dir 文件夹路径
 */
export const delDirectory = (dir: string): void => {
	try {
		if (!fs.existsSync(dir)) return;
		fs.rmSync(dir, { recursive: true, force: true });
		console.log(`删除文件夹成功: ${dir}`);
	} catch (err) {
		console.error(`文件夹删除失败: ${dir}`, err);
	}
};

/**
 * 删除文件（如果存在）
 * @param filePath 文件路径
 */
export const delFile = (filePath: string): void => {
	try {
		if (!fs.existsSync(filePath)) return;
		fs.unlinkSync(filePath);
		console.log(`文件删除成功: ${filePath}`);
	} catch (err) {
		console.error(`文件删除失败: ${filePath}`, err);
	}
};

// ============================================================
// 下载
// ============================================================

/** 记录下载失败信息到 error.txt */
const recordDownloadError = async (url: string): Promise<void> => {
	try {
		await appendFileRecord("error.txt", url);
	} catch (err) {
		console.error(`写入错误记录失败: ${url}`, err);
	}
};

/**
 * 异步下载文件
 *
 * @param url      文件下载地址
 * @param fileName 保存的文件名
 * @param token    可选的 Basic Auth token
 *
 * token 生成方式（Node.js 环境）：
 * ```js
 * Buffer.from(`${username}:\${password}`).toString('base64');
 * ```
 */
export const downloadFile = async (
	url: string,
	fileName: string,
	token?: string
): Promise<void> => {
	try {
		const response = await axios.get(url, {
			responseType: "stream",
			headers: token ? { Authorization: `Basic ${token}` } : {}
		});

		const filePath = `./tgz/${fileName}`;
		const writeStream = fs.createWriteStream(filePath);

		return new Promise<void>((resolve, reject) => {
			response.data
				.pipe(writeStream)
				.on("finish", () => {
					console.log(`${fileName} 下载完成`);
					resolve();
				})
				.on("error", async (err: Error) => {
					console.error(`${fileName} 写入错误:`, err);
					await recordDownloadError(url);
					reject(err);
				});

			writeStream.on("error", async (err: Error) => {
				console.error(`${fileName} 写入流错误:`, err);
				await recordDownloadError(url);
				reject(err);
			});
		});
	} catch (error) {
		console.error(`${url} 下载错误:`, error);
		await recordDownloadError(url);
	}
};

// ============================================================
// package-lock.json 解析
// ============================================================

/**
 * 解析 package-lock.json 数据
 * @param data package-lock.json 文件内容字符串
 * @returns 解析后的 PackageLockData
 */
export async function parsePackageLockData(
	data: string
): Promise<PackageLockData> {
	let packageLockData: PackageLockData;
	try {
		packageLockData = JSON.parse(data);
	} catch (error) {
		throw new Error(`解析 package-lock.json 失败: ${error}`);
	}

	if (
		!packageLockData ||
		(packageLockData.packages === undefined &&
			packageLockData.dependencies === undefined)
	) {
		throw new Error(
			"package-lock.json 格式不正确：缺少 packages 或 dependencies 字段"
		);
	}

	return packageLockData;
}

/**
 * 读取并解析 package-lock.json 文件
 * @returns 解析后的 PackageLockData
 */
export const readAndParsePackageLockJson =
	async (): Promise<PackageLockData> => {
		const filePath = getFilePath("package-lock.json");
		const content = fs.readFileSync(filePath, "utf8");
		return parsePackageLockData(content);
	};
