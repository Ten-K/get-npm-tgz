import fs from "node:fs";
import { cac } from "cac";
import request from "request";
import { coerce } from "semver";
import { parse } from "node:url";
import { join } from "node:path";
import rp from "request-promise";

import { REGISTER } from "./constans";
import { version } from "../package.json";
import { packageData, packageLockData, dependenciesItem } from "./types";

/**
 * 获取源地址
 * @param options 命令行参数
 */
const getRegistry = (options: any) => {
	if (options.c) {
		return REGISTER.CNPM;
	}
	if (options.y) {
		return REGISTER.YARN;
	}
	if (options.t) {
		return REGISTER.TAOBAO;
	}
	return REGISTER.NPM;
};

/**
 * 获取文件路径
 * @param fliename 文件名
 * @returns
 */
const getFilePath = (fliename: string) => {
	return join(process.cwd(), fliename);
};

/**
 * 获取npm包的tgz下载地址
 * @param fliename npm包名
 * @param version npm包版本号
 * @returns
 */
const getTgzDownloadUrl = (fliename: string, version: string) => {
	let name = fliename;
	if (fliename.includes("@")) {
		name = fliename.split("/")[1];
	}
	return `${REGISTER.TAOBAO}${fliename}/-/${name}-${version}.tgz`;
};

/**
 * 向文件追加内容
 * @param fliename 文件名
 * @param content 追加的文件内容
 */
const appendFileRecord = (fliename: string, content: string) => {
	fs.appendFile(fliename, content + "\n", "utf8", function (error) {
		if (error) {
			console.log(error);
			return false;
		}
	});
};

/**
 * 收集npm离线包下载url
 * @param data 依赖对象
 * @returns
 */
const pushResolved = (data: object) => {
	return new Promise(async (resolve, reject) => {
		if (!data) return;
		const dataArray = Object.keys(data);

		for (const [OuterIndex, item] of dataArray.entries()) {
			if (!item.length) continue;
			const obj = data[item as keyof typeof data] as dependenciesItem;
			if (obj.resolved) {
				viewList.push(obj.resolved);
			} else {
				console.log(`【${item}】未提供下载地址, 请自行下载`);
			}

			const peerDependencies = obj.peerDependencies;
			if (!peerDependencies && OuterIndex === dataArray.length - 1) {
				return resolve(1);
			}
			if (!peerDependencies) continue;
			const peerDependenciesKeys = Object.keys(peerDependencies);

			for (const [
				index,
				peerDependenciesName
			] of peerDependenciesKeys.entries()) {
				if (!peerDependenciesName.length) continue;
				const peerDependencyVersion = coerce(
					peerDependencies[peerDependenciesName]
				)?.raw;
				if (peerDependencyVersion) {
					const url = getTgzDownloadUrl(
						peerDependenciesName,
						peerDependencyVersion
					);
					if (viewList.indexOf(url) === -1) {
						viewList.push(url);
					}

					// TODO 因为peerDependencies内的依赖还有依赖无法获取下载地址，暂时不做处理（待优化）
					// appendFileRecord(
					// 	"peerDependencies.txt",
					// 	`"${peerDependenciesName}" : "${peerDependencyVersion}"`
					// );

					if (
						index === peerDependenciesKeys.length - 1 &&
						OuterIndex === dataArray.length - 1
					) {
						resolve(1);
					}
				} else {
					try {
						const res = await rp(
							`${REGISTER.TAOBAO}${peerDependenciesName}`
						);

						const resData = JSON.parse(res);
						const url = getTgzDownloadUrl(
							peerDependenciesName,
							resData["dist-tags"].latest
						);

						// TODO 因为peerDependencies内的依赖还有依赖无法获取下载地址，暂时不做处理（待优化）
						/**
						 * 目前手动解决办法，生成 `peerDependencies.txt` ，新建一个 `package.json` 文件
						 * 然后在 `package.json` 内将 `peerDependencies.txt` 的内容写入 `dependencies` （按实际需求去除重复的健，一般保留最高版本的依赖）
						 * 执行 `npm i` 生成 `package-lock.json` ，然后再执行 `tgz` 进行 `npm` 离线包下载
						 */
						// appendFileRecord(
						// 	"peerDependencies.txt",
						// 	`"${peerDependenciesName}" : "${peerDependencyVersion}"`
						// );

						if (viewList.indexOf(url) === -1) {
							viewList.push(url);
						}
						if (
							index === peerDependenciesKeys.length - 1 &&
							OuterIndex === dataArray.length - 1
						) {
							resolve(1);
						}
					} catch (error) {
						console.log("🚀 ~ peerDependenciesKeys.entries ~ error:", error);
					}
				}
			}
		}
	});
};

/**
 * 删除文件夹
 * @param dir 文件夹路径
 */
const delDirectory = (dir: string) => {
	try {
		if (!fs.existsSync(dir)) return;
		fs.rmSync(dir, { recursive: true });
		console.log("删除tgz文件夹成功");
	} catch (err) {
		console.error("tgz文件夹删除失败", err);
	}
};

/**
 * 删除文件
 * @param file 文件路径
 */
const delFile = (file: string) => {
	fs.access(file, fs.constants.F_OK, (err) => {
		if (err) return;
		fs.unlinkSync(file);
		console.log("error.txt文件删除成功");
	});
};

/**
 * 创建文件夹
 * @param dir 文件夹路径
 */
const createDirectory = (dir: string) => {
	if (fs.existsSync(dir)) return console.log("tgz文件夹已存在");
	fs.mkdirSync(dir);
	console.log("tgz文件夹创建成功");
};

/**
 * 获取package.json的相关依赖
 */
const getPackageJsonDependencies = async () => {
	const packagePath = getFilePath("package.json");
	const data = fs.readFileSync(packagePath).toString();

	const {
		dependencies = {},
		devDependencies = {},
		peerDependencies = {}
	} = JSON.parse(data) as packageData;
	const obj = {
		...dependencies,
		...devDependencies,
		...peerDependencies
	};
	return obj;
};

/**
 * 根据依赖名称获取依赖的相关依赖
 */
const getDependenciesForPackageName = (
	packages: object,
	registry = REGISTER.TAOBAO
) => {
	Reflect.ownKeys(packages).forEach((name) => {
		const url = `${registry}${name as string}`;

		// @ts-ignore
		let version = packages[name];
		request(url, function (error, response, body) {
			if (error) return console.log(error);
			const packageInfo = JSON.parse(body);

			// @ts-ignore
			version = coerce(packages[name])?.raw;
			if (!version) {
				version = packageInfo["dist-tags"].latest;
			}

			const url = `${registry}${name as string}/-/${
				name as string
			}-${version}.tgz`;
			viewList.push(url);
			const packageJSON = packageInfo.versions[version];
			const obj = Object.assign(
				packageJSON?.dependencies || {},
				packageJSON?.devDependencies || {},
				packageJSON?.peerDependencies || {}
			);
			getDependenciesForPackageName(obj, registry);
		});
	});
};

/**
 * 下载tgz包
 */
const downloadTgz = () => {
	viewList.forEach((ele) => {
		const path = parse(ele).path as string;
		const writestream = fs.createWriteStream("./tgz/" + path.split("/-/")[1]);
		const readstream = request(ele);
		readstream.pipe(writestream);
		readstream.on("error", function (err) {
			console.log("错误信息:" + err);
			appendFileRecord("error.txt", ele + "\n");
		});

		writestream.on("finish", function () {
			console.log(path.split("/-/")[1] + "文件写入成功");
			writestream.end();
		});
	});
};

const downloadHandle = () => {
	/** 删除tgz文件夹 */
	const tgzDirectoryPath = getFilePath("tgz");
	delDirectory(tgzDirectoryPath);

	/** 删除error文件 */
	const errFilePath = getFilePath("error.txt");
	delFile(errFilePath);

	/** 创建tgz文件夹 */
	createDirectory(tgzDirectoryPath);

	/** 下载tgz包 */
	downloadTgz();
};

const viewList: Array<string> = [];

const readPackageLockJson = () => {
	const packageLockPath = getFilePath("package-lock.json");
	fs.readFile(packageLockPath, "utf-8", async (err, data) => {
		if (err) console.error("读取 package-lock.json 文件错误", err.message);
		const { packages, dependencies } = JSON.parse(data) as packageLockData;
		if (!packages && !dependencies) {
			throw new Error(
				"npm依赖字段有变动，请联系作者。如需正常使用，请使用9.8.1版本的npm"
			);
		}

		console.log("正在准备下载tgz包, 请耐心等待...");
		await pushResolved(packages || dependencies);
		downloadHandle();
	});
};

const cli = cac("tgz");
cli.version(version);

cli
	.command("[...pkgs]", "批量下载tgz")
	.option("-n, --npm", "使用npm源下载")
	.option("-c, --cnpm", "使用cnpm源下载")
	.option("-y, --yarn", "使用yarn源下载")
	.option("-t, --taobao", "使用taobao源下载")
	.action(async (pkgs, options) => {
		const pkgsLength = pkgs.length;

		/** 没有指定下载包，默认查询<package-lock.json>文件下载所有依赖tgz包 */
		if (!pkgsLength) {
			return readPackageLockJson();
		}
		const registry = getRegistry(options);
		for (const pkg of pkgs) {
			// TODO 支持package.json下载tgz
			if (pkg === "package.json") {
				const dependencies =
					(await getPackageJsonDependencies()) as unknown as object;
				getDependenciesForPackageName(dependencies, registry);
			} else {
				const [name, version] = pkg.split("@");
				if (!version) return console.log(`请指定【${name}】的版本号`);
				const url = `${registry}${name}/-/${name}-${version}.tgz`;
				viewList.push(url);
			}
		}
		if (viewList.length !== pkgsLength) return;
		downloadHandle();
	});

cli.help();

cli.parse();
