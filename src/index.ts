import fs from "node:fs";
import { cac } from "cac";
import axios from "axios";
import { coerce } from "semver";
import { version } from "../package.json";
import { MAX_CONCURRENT_REQUESTS } from "./constants";
import {
	Options,
	ResData,
	PackageData,
	DependenciesItem,
	DependencyMap
} from "./types";
import {
	buildTgzUrl,
	delFile,
	parseURL,
	getRegistry,
	getFilePath,
	delDirectory,
	downloadFile,
	createDirectory,
	readAndParsePackageLockJson
} from "./utils";

// ============================================================
// 第一部分：从 package-lock.json 收集依赖
// ============================================================

/**
 * 从 package-lock.json 的 dependencies/packages 中收集所有 tgz 下载地址
 *
 * 遍历依赖树，收集 resolved 字段中的直链地址，
 * 同时递归处理 peerDependencies。
 *
 * @param dependencies 依赖对象（packages 或 dependencies 字段）
 * @param registry     registry 源地址
 * @returns 去重后的 tgz 下载 URL 集合
 */
const collectLockFileUrls = async (
	dependencies: Record<string, DependenciesItem> | undefined,
	registry: string
): Promise<Set<string>> => {
	const urls = new Set<string>();

	if (!dependencies) return urls;

	await Promise.all(
		Object.entries(dependencies).map(async ([name, item]) => {
			// 收集已记录的 resolved 直链地址
			if (item.resolved) {
				urls.add(item.resolved);
			} else if (name) {
				console.log(`【${name}】未提供下载地址，请自行下载`);
			}

			// 收集 peerDependencies
			const peerDeps = item.peerDependencies;
			if (!peerDeps) return;

			await Promise.all(
				Object.entries(peerDeps).map(async ([peerName, peerVersion]) => {
					const version = coerce(peerVersion)?.raw;
					if (version) {
						urls.add(buildTgzUrl(peerName, version, registry));
					} else {
						try {
							const response = await axios.get(
								`${registry}${encodeURIComponent(peerName)}`
							);
							const resData = response.data as ResData;
							urls.add(
								buildTgzUrl(peerName, resData["dist-tags"].latest, registry)
							);
						} catch (error) {
							console.log(`获取 ${peerName} 最新版本时发生错误:`, error);
						}
					}
				})
			);
		})
	);

	return urls;
};

/**
 * 读取并处理 package-lock.json，收集所有 tgz 下载地址
 * @param registry registry 源地址
 * @returns 去重后的 tgz 下载 URL 集合
 */
const processPackageLock = async (registry: string): Promise<Set<string>> => {
	console.log("正在准备下载 tgz 包，请耐心等待...");
	const packageLockData = await readAndParsePackageLockJson();
	const dependencies = packageLockData.packages || packageLockData.dependencies;
	return collectLockFileUrls(dependencies, registry);
};

// ============================================================
// 第二部分：从 package.json 递归收集依赖
// ============================================================

/**
 * 读取 package.json 的顶层依赖
 * @returns 依赖映射 { 包名: 版本号 }
 */
const readPackageDependencies = async (): Promise<DependencyMap> => {
	const packagePath = getFilePath("package.json");
	const data = fs.readFileSync(packagePath, "utf8");
	const {
		dependencies = {},
		devDependencies = {},
		peerDependencies = {}
	} = JSON.parse(data) as PackageData;
	return { ...dependencies, ...devDependencies, ...peerDependencies };
};

/**
 * 递归收集依赖及其所有嵌套依赖的 tgz 下载地址
 *
 * 从顶层依赖开始，逐层递归查询每个包的依赖信息，
 * 并为每个包构建 tgz 下载地址。通过 Set 自动去重。
 *
 * @param allDependencies 顶层依赖映射
 * @param registry        registry 源地址
 * @param maxDepth        最大递归深度（防止无限递归）
 * @returns 去重后的 tgz 下载 URL 集合
 */
const collectRecursiveDependencies = async (
	allDependencies: DependencyMap,
	registry: string,
	maxDepth = 5
): Promise<Set<string>> => {
	const urls = new Set<string>();
	const visited = new Set<string>();

	const fetchPackageInfo = async (
		name: string,
		version: string,
		depth: number
	): Promise<void> => {
		if (depth > maxDepth) return;
		if (visited.has(name)) return;
		visited.add(name);

		try {
			const response = await axios.get(
				`${registry}${encodeURIComponent(name)}`
			);
			const resolvedVersion =
				coerce(version)?.raw || response.data["dist-tags"].latest;

			// 构建 tgz 下载地址
			urls.add(buildTgzUrl(name, resolvedVersion, registry));

			// 收集嵌套依赖
			const packageVersionData = response.data.versions[resolvedVersion] as
				| PackageData
				| undefined;
			const nestedDeps = {
				...(packageVersionData?.dependencies || {}),
				...(packageVersionData?.devDependencies || {}),
				...(packageVersionData?.peerDependencies || {})
			};

			await Promise.all(
				Object.entries(nestedDeps).map(([depName, depVersion]) =>
					fetchPackageInfo(depName, depVersion as string, depth + 1)
				)
			);
		} catch (error) {
			console.error(`获取 ${name} 的依赖信息时出错:`, error);
		}
	};

	await Promise.all(
		Object.entries(allDependencies).map(([name, version]) =>
			fetchPackageInfo(name, version, 0)
		)
	);

	return urls;
};

// ============================================================
// 第三部分：下载管理
// ============================================================

/**
 * 并发下载所有 tgz 文件
 *
 * 将待下载列表分批处理，每批并发数不超过 MAX_CONCURRENT_REQUESTS。
 *
 * @param urls  下载 URL 集合
 * @param token 可选认证 token
 */
const downloadAll = async (
	urls: Set<string>,
	token?: string
): Promise<void> => {
	if (urls.size === 0) {
		console.log("没有需要下载的文件");
		return;
	}

	const entries = [...urls].map(parseURL);
	let batch: Promise<void>[] = [];

	for (const { url, fileName } of entries) {
		if (batch.length >= MAX_CONCURRENT_REQUESTS) {
			await Promise.all(batch);
			batch = [];
		}
		batch.push(downloadFile(url, fileName, token));
	}

	await Promise.all(batch);
};

/**
 * 准备下载环境并执行下载
 *
 * 清理旧文件 → 创建 tgz 目录 → 开始并发下载
 *
 * @param urls  下载 URL 集合
 * @param token 可选认证 token
 */
const prepareAndDownload = async (
	urls: Set<string>,
	token?: string
): Promise<void> => {
	const tgzDir = getFilePath("tgz");
	const errFile = getFilePath("error.txt");

	delDirectory(tgzDir);
	delFile(errFile);
	createDirectory(tgzDir);

	await downloadAll(urls, token);
};

// ============================================================
// 第四部分：CLI 入口
// ============================================================

const cli = cac("tgz");
cli.version(version);

cli
	.command("[...pkgs]", "批量下载 npm 包的 tgz 文件")
	.option("-n, --npm", "使用 npm 官方源下载")
	.option("-c, --cnpm", "使用 cnpm 源下载")
	.option("-y, --yarn", "使用 yarn 源下载")
	.option("-t, --taobao", "使用淘宝镜像源下载")
	.option("-k, --token <token>", "从需要认证的私服下载时，必须提供登录令牌")
	.action(async (pkgs: string[], options: Options) => {
		const registry = getRegistry(options);
		const token = options.token;

		// ---- 无参数：从 package-lock.json 下载所有依赖 ----
		if (!pkgs || pkgs.length === 0) {
			const urls = await processPackageLock(registry);
			await prepareAndDownload(urls, token);
			return;
		}

		// ---- 有参数：下载指定包 ----
		const allUrls = new Set<string>();

		for (const pkg of pkgs) {
			if (pkg === "package.json") {
				// 从 package.json 递归下载所有依赖
				const dependencies = await readPackageDependencies();
				const urls = await collectRecursiveDependencies(dependencies, registry);
				for (const url of urls) allUrls.add(url);
			} else {
				// 单个包：格式 "包名@版本号"
				const atIndex = pkg.indexOf("@");
				if (atIndex <= 0) {
					console.log(`请使用 "包名@版本号" 的格式指定包: ${pkg}`);
					continue;
				}
				const name = pkg.slice(0, atIndex);
				const version = pkg.slice(atIndex + 1);
				if (!version) {
					console.log(`请指定 【${name}】 的版本号`);
					continue;
				}
				allUrls.add(buildTgzUrl(name, version, registry));
			}
		}

		if (allUrls.size > 0) {
			await prepareAndDownload(allUrls, token);
		}
	});

cli.help();
cli.parse();
