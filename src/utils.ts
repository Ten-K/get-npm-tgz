import fs from "node:fs";
import axios from "axios";
import { join } from "node:path";
import { Options, PackageLockData } from "./types";
import { REGISTER, REQUIRED_NPM_VERSION } from "./constans";

/**
 * 获取源地址
 * @param options 命令行参数
 */
export const getRegistry = (options: Options) => {
	if (options.c) return REGISTER.CNPM;
	if (options.y) return REGISTER.YARN;
	if (options.t) return REGISTER.TAOBAO;
	return REGISTER.NPM;
};

/**
 * 获取文件路径
 * @param filename 文件名
 * @returns
 */
export const getFilePath = (filename: string) => {
	return join(process.cwd(), filename);
};

/**
 * 获取npm包的tgz下载地址
 * @param filename npm包名
 * @param version npm包版本号
 * @returns
 */
export const getTgzDownloadUrl = (filename: string, version: string) => {
	let name = filename;
	if (filename.includes("@")) {
		name = filename.split("/")[1];
	}
	return `${REGISTER.TAOBAO}${filename}/-/${name}-${version}.tgz`;
};

/**
 * 向文件追加内容
 * @param filename 文件名
 * @param content 追加的文件内容
 * @returns 返回一个Promise，成功时返回true，失败时返回错误信息
 */
export const appendFileRecord = (
	filename: string,
	content: string
): Promise<boolean | Error> => {
	return new Promise((resolve, reject) => {
		fs.appendFile(filename, content + "\n", "utf8", function (error) {
			if (error) {
				reject(error);
			} else {
				resolve(true);
			}
		});
	});
};

/**
 * 创建文件夹
 * @param dir 文件夹路径
 */
export const createDirectory = (dir: string) => {
	if (fs.existsSync(dir)) return console.log("tgz文件夹已存在");
	fs.mkdirSync(dir);
	console.log("tgz文件夹创建成功");
};

/**
 * 删除文件夹
 * @param dir 文件夹路径
 */
export const delDirectory = (dir: string) => {
	try {
		// 检查目录是否存在
		if (!fs.existsSync(dir)) return;

		// 实际删除操作
		fs.rmSync(dir, { recursive: true, force: true });
		console.log("删除tgz文件夹成功");
	} catch (err) {
		console.error("tgz文件夹删除失败", err);
	}
};

/**
 * 删除文件
 * @param file 文件路径
 */
export const delFile = (file: string) => {
	fs.access(file, fs.constants.F_OK, (err) => {
		if (err) return;
		fs.unlinkSync(file);
		console.log("error.txt文件删除成功");
	});
};

/**
 * 解析URL并生成文件名，同时进行简单的URL有效性检查
 * @param url 文件的下载地址
 * @returns
 */
export const parseURL = (url: string): { url: string; fileName: string } => {
	const parsedUrl = new URL(url);
	if (!parsedUrl.protocol.startsWith("http")) {
		throw new Error(`无效的URL: ${url}`);
	}
	const pathParts = parsedUrl.pathname.split("/-/");
	if (pathParts.length < 2) {
		throw new Error(`无法解析文件名从URL: ${url}`);
	}
	const fileName = pathParts[1];

	return { url, fileName };
};

/**
 * 异步下载文件。
 *
 * 从指定的URL下载文件，并将其保存到本地文件系统。如果提供了token，则会在请求头中添加Authorization字段。
 *
 * @param url 文件的下载地址
 * @param fileName 下载后文件的名称
 * @param token 可选的认证令牌，用于授权访问
 */
export const downloadFile = async (
	url: string,
	fileName: string,
	token?: string
) => {
	try {
		// 发起GET请求下载文件，以流的形式处理响应数据。
		const response = await axios.get(url, {
			responseType: "stream",
			headers: token ? { Authorization: `Basic ${token}` } : {}
		});

		// 指定文件保存的路径。
		const filePath = `./tgz/${fileName}`;

		// 创建一个写入流，用于将接收到的文件数据写入到本地文件系统。
		const writeStream = fs.createWriteStream(filePath);

		// 将响应数据写入流中
		response.data
			.pipe(writeStream)
			.on("finish", () => {
				console.log(`${fileName} 文件写入成功`);
			})
			.on("error", (err: Error) => {
				console.error(`${fileName} 文件写入错误: ${err}`);

				// 发生错误时，将url追加到error.txt文件中
				appendFileRecord("error.txt", `${url}\n`).catch((appendError) => {
					console.error(`${url}添加失败: ${appendError}`);
				});
			});
	} catch (error) {
		console.error(`${url}下载错误: ${error}`);

		// 下载失败时，将url追加到error.txt文件中
		appendFileRecord("error.txt", `${url}\n`).catch((appendError) => {
			console.error(`${url}添加失败: ${appendError}`);
		});
	}
};

/**
 * 解析 package-lock.json 文件的数据
 * @param data 字符串形式的 package-lock.json 文件内容。
 * @returns 返回解析后的 packageLockData 对象。
 */
export async function parsePackageLockData(
	data: string
): Promise<PackageLockData> {
	let packageLockData;
	try {
		packageLockData = JSON.parse(data);
	} catch (error) {
		throw new Error(`解析 package-lock.json 文件错误: ${error}`);
	}

	// 检查npm的返回字段是否发生变化
	if (
		!packageLockData ||
		(packageLockData.packages === undefined &&
			packageLockData.dependencies === undefined)
	) {
		throw new Error(
			`npm依赖字段有变动，请联系作者。如需正常使用，请使用${REQUIRED_NPM_VERSION}版本的npm`
		);
	}

	return packageLockData;
}

/**
 * 读取并解析package-lock.json文件。
 * @returns {Promise<PackageLockData>} 返回一个承诺，该承诺解析为package-lock.json文件的解析数据。
 */
export async function readAndParsePackageLockJson(): Promise<PackageLockData> {
	const packageLockPath = getFilePath("package-lock.json");
	let data;
	try {
		data = await fs.promises.readFile(packageLockPath, "utf-8");
	} catch (error) {
		throw new Error(`读取 package-lock.json 文件错误: ${error}`);
	}

	return parsePackageLockData(data);
}
