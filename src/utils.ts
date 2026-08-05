import fs from "node:fs";
import { appendFile } from "node:fs/promises";
import axios from "axios";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { Options, PackageLockData } from "./types";
import { DOWNLOAD_IDLE_TIMEOUT, REGISTRIES } from "./constants";

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
	// npm tarball URL 中文件名部分不含 scope 前缀
	// （如 @babel/helper-string-parser → helper-string-parser-7.24.8.tgz）
	const basename = name.startsWith("@")
		? name.slice(name.indexOf("/") + 1)
		: name;
	const encodedBase = encodeURIComponent(basename);
	return `${registry}${encodedName}/-/${encodedBase}-${version}.tgz`;
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
		await appendFileRecord(getFilePath("error.txt"), url);
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
): Promise<boolean> => {
	try {
		const response = await axios.get(url, {
			responseType: "stream",
			// 关闭 axios 默认的 2xx 校验，由下方显式判断，
			// 以便统一销毁失败响应的流（未消费的流会让进程挂起）
			validateStatus: () => true,
			headers: token ? { Authorization: `Basic ${token}` } : {}
		});

		// 非 2xx 状态码：记录失败并销毁响应流，避免进程挂起
		if (response.status < 200 || response.status >= 300) {
			console.error(`${url} 下载失败，HTTP 状态码 ${response.status}`);
			response.data?.destroy?.();
			await recordDownloadError(url);
			return false;
		}

		const filePath = `./tgz/${fileName}`;
		const writeStream = fs.createWriteStream(filePath);

		return new Promise<boolean>((resolve) => {
			// 源流出错/连接关闭时多个监听器都可能触发，
			// 用 settled 标志保证只处理一次（避免 error.txt 重复记录）
			let settled = false;
			let sourceEnded = false;
			let idleTimer: ReturnType<typeof setTimeout> | undefined;

			const succeed = () => {
				if (settled) return;
				settled = true;
				clearTimeout(idleTimer);
				console.log(`${fileName} 下载完成`);
				resolve(true);
			};

			const fail = async (err: Error, stage: string): Promise<void> => {
				if (settled) return;
				settled = true;
				clearTimeout(idleTimer);
				console.error(`${fileName} ${stage}:`, err);
				// 停止源流与写流，释放底层连接，避免进程挂起
				response.data?.destroy?.();
				writeStream.destroy?.();
				// 清理写入失败的半截文件
				try {
					fs.unlinkSync(filePath);
				} catch {
					// 文件不存在等场景忽略
				}
				await recordDownloadError(url);
				resolve(false);
			};

			// 空闲超时兜底：半开连接/静默断流时流不会触发 error 或 finish。
			// 不依赖流的 setTimeout/complete（压缩响应经 axios 解压后返回的
			// Transform 流不具备这些方法），改为监听 data 事件重置计时器，
			// 长时间无数据传输即视为断流强制失败，避免永久挂起
			const armIdleTimer = () => {
				clearTimeout(idleTimer);
				idleTimer = setTimeout(() => {
					fail(
						new Error(
							`下载超时：超过 ${DOWNLOAD_IDLE_TIMEOUT / 1000} 秒无数据传输`
						),
						"空闲超时"
					);
				}, DOWNLOAD_IDLE_TIMEOUT);
			};
			armIdleTimer();

			response.data
				.pipe(writeStream)
				.on("finish", succeed)
				.on("error", (err: Error) => fail(err, "读取错误"));
			writeStream.on("error", (err: Error) => fail(err, "写入错误"));
			// 兜底：部分环境连接中途关闭时只触发 close 而非 error。
			// 以是否正常读完（end）判断是否断流，兼容任意流类型
			response.data.on("data", armIdleTimer);
			response.data.on("end", () => {
				sourceEnded = true;
			});
			response.data.on("close", () => {
				if (!settled && !sourceEnded) {
					fail(new Error("连接中断，响应未完整接收"), "连接关闭");
				}
			});
		});
	} catch (error) {
		console.error(`${url} 下载错误:`, error);
		// 网络层错误时销毁可能残留的响应流，避免进程挂起
		if (axios.isAxiosError(error) && error.response?.data) {
			(error.response.data as Readable).destroy?.();
		}
		await recordDownloadError(url);
		return false;
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
