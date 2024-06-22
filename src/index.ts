import fs from "node:fs";
import { cac } from "cac";
import axios from "axios";
import { coerce } from "semver";
import { version } from "../package.json";
import { REGISTER, MAX_CONCURRENT_REQUESTS } from "./constans";
import { Options, ResData, PackageData, DependenciesItem } from "./types";
import {
	delFile,
	parseURL,
	getRegistry,
	getFilePath,
	delDirectory,
	downloadFile,
	createDirectory,
	getTgzDownloadUrl,
	readAndParsePackageLockJson
} from "./utils";

/** 命令行参数 */
let cmdOptions: Options = {};
/** 收集下载地址 */
const viewList: Array<string> = [];

/**
 * 收集npm离线包下载url
 * @param data 依赖对象
 * @returns
 */
const pushResolved = (data: Record<string, any>) => {
	return new Promise(async (resolve, reject) => {
		if (!data) return resolve(undefined);

		const dataArray = Object.keys(data);

		const processDependency = async (key: string) => {
			const obj: DependenciesItem = data[key];

			if (obj.resolved) {
				viewList.push(obj.resolved);
			} else {
				if (key) console.log(`【${key}】未提供下载地址, 请自行下载`);
			}

			const peerDependencies = obj.peerDependencies;
			if (!peerDependencies) return;

			const peerDependencyPromises = Object.keys(peerDependencies).map(
				async (peerDependenciesName) => {
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
					} else {
						try {
							const response = await axios.get(
								`${REGISTER.TAOBAO}${peerDependenciesName}`
							);
							const resData: ResData = response.data;
							const url = getTgzDownloadUrl(
								peerDependenciesName,
								resData["dist-tags"].latest
							);

							if (viewList.indexOf(url) === -1) {
								viewList.push(url);
							}
						} catch (error) {
							console.log(`处理${peerDependenciesName}时发生错误:`, error);
						}
					}
				}
			);

			await Promise.all(peerDependencyPromises);
		};

		try {
			await Promise.all(
				dataArray.map(async (key) => {
					await processDependency(key);
				})
			);

			resolve(undefined);
		} catch (error) {
			reject(error);
		}
	});
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
	} = JSON.parse(data) as PackageData;
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
const getDependenciesForPackageName = async (
	allDependencies: Record<string, string>,
	registry = REGISTER.TAOBAO
): Promise<void> => {
	const viewList: string[] = [];

	const fetchPackageInfo = async (name: string, version: string) => {
		try {
			const url = `${registry}${encodeURIComponent(name)}`;
			const res = await axios.get(url);
			let v = coerce(version)?.raw;
			if (!v) {
				v = res.data["dist-tags"].latest;
			}

			const u = `${registry}${encodeURIComponent(name)}/-/${encodeURIComponent(
				name
			)}-${v}.tgz`;
			viewList.push(url);

			const packageJSON = res.data.versions[v as string];
			const dependencies = {
				...(packageJSON?.dependencies || {}),
				...(packageJSON?.devDependencies || {}),
				...(packageJSON?.peerDependencies || {})
			};

			for (const [name, version] of Object.entries(dependencies)) {
				await fetchPackageInfo(name, version as string);
			}
		} catch (error) {
			console.error(
				`Error fetching or processing package info for ${name}:`,
				error
			);
		}
	};

	for (const [name, version] of Object.entries(allDependencies)) {
		await fetchPackageInfo(name, version);
	}
};

const downloadTgz = async () => {
	if (!viewList.length) {
		console.log("viewList为空，没有文件需要下载");
		return;
	}

	// 存储待执行的Promise函数数组
	const downloadPromises = [];
	// 命令行参数传入的token
	const token = cmdOptions?.token;
	// 解析URL并生成文件名
	const urlsToDownload = viewList.map(parseURL);

	// 控制并发下载数量
	for (const { url, fileName } of urlsToDownload) {
		if (downloadPromises.length >= MAX_CONCURRENT_REQUESTS) {
			await Promise.all(downloadPromises);
			downloadPromises.length = 0; // 清空已处理的请求
		}
		downloadPromises.push(downloadFile(url, fileName, token));
	}

	await Promise.all(downloadPromises);
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

/**
 * 读取并处理package-lock.json文件。
 */
const readPackageLockJson = async () => {
	try {
		console.log("正在准备下载tgz包, 请耐心等待...");
		const packageLockData = await readAndParsePackageLockJson();
		await pushResolved(
			packageLockData.packages || packageLockData.dependencies
		);
		downloadHandle();
	} catch (error) {
		throw new Error(`处理 package-lock.json 数据时发生错误: ${error}`);
	}
};

const cli = cac("tgz");
cli.version(version);

cli
	.command("[...pkgs]", "批量下载tgz")
	.option("-n, --npm", "使用npm源下载")
	.option("-c, --cnpm", "使用cnpm源下载")
	.option("-y, --yarn", "使用yarn源下载")
	.option("-t, --taobao", "使用taobao源下载")
	.option("-k , --token <token>", "从需要认证的私服下载时，必须要有登录令牌")
	.action(async (pkgs: string[], options: Options) => {
		cmdOptions = options || {};
		const pkgsLength = pkgs.length;

		/** 没有指定下载包，默认查询<package-lock.json>文件下载所有依赖tgz包 */
		if (!pkgsLength) return readPackageLockJson();
		const registry = getRegistry(options);
		for (const pkg of pkgs) {
			// TODO 支持package.json下载tgz
			if (pkg === "package.json") {
				const allDependencies = await getPackageJsonDependencies();
				getDependenciesForPackageName(allDependencies, registry);
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
