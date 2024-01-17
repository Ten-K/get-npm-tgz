import fs from "node:fs";
import { cac } from "cac";
import url from "node:url";
import path from "node:path";
import request from "request";

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
	return path.join(process.cwd(), fliename);
};

/**
 * 收集npm离线包下载url
 * @param data 依赖对象
 * @returns
 */
const pushResolved = (data: object) => {
	if (!data) return;
	Object.keys(data).forEach((item: string) => {
		if (!item.length) return;
		viewList.push(
			(data[item as keyof typeof data] as dependenciesItem).resolved
		);
	});
};

/**
 * 删除文件夹
 * @param dir 文件夹路径
 */
const delDirectory = (dir: string) => {
	let files = [];
	if (fs.existsSync(dir)) {
		files = fs.readdirSync(dir);
		files.forEach((file) => {
			const curPath = path.join(dir, file);
			const stat = fs.statSync(curPath);
			if (stat.isDirectory()) {
				delDirectory(curPath); //递归删除文件夹
			} else if (stat.isFile()) {
				fs.unlinkSync(curPath); //删除文件
			}
		});
		fs.rmdirSync(dir);
		console.log("删除tgz文件夹成功");
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
	let data = await fs.readFileSync(packagePath).toString();
	// fs.readFile(packagePath, 'utf-8', (err, data) => {
	// 	if (err) console.error('读取 package.json 文件错误', err.message)

	const { dependencies = {}, devDependencies = {} } = JSON.parse(
		data
	) as packageData;
	const obj = {
		...dependencies,
		...devDependencies
	};
	return obj;
	// })
};

/**
 * 根据依赖名称获取依赖的相关依赖
 */
const getDependenciesForPackageName = (packages: object, registry: string) => {
	Reflect.ownKeys(packages).forEach((name) => {
		const url = `${registry}${name as string}`;
		// @ts-ignore
		let version = packages[name];
		request(url, function (error, response, body) {
			if (error) return console.log(error);
			const packageInfo = JSON.parse(body);

			//TODO 这种情况的版本号未处理 ">= 0.12 < 0.13" - tgz package.json 命令不可用 (semver库待研究)
			if (version.charAt(0) === "*") {
				version = packageInfo["dist-tags"].latest;
			} else if (version.charAt(0) === "^" || version.charAt(0) === "~") {
				version = isNaN(version.charAt(0)) ? version.slice(1) : version;
			}
			const url = `${registry}${name as string}/-/${
				name as string
			}-${version}.tgz`;
			viewList.push(url);
			const packageJSON = packageInfo.versions[version];
			const obj = Object.assign(
				packageJSON?.dependencies || {},
				packageJSON?.devDependencies || {}
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
		const path = url.parse(ele).path as string;
		const writestream = fs.createWriteStream("./tgz/" + path.split("/-/")[1]);
		const readstream = request(ele);
		readstream.pipe(writestream);
		readstream.on("end", function () {
			console.log(path.split("/-/")[1] + "文件下载成功");
		});
		readstream.on("error", function (err) {
			console.log("错误信息:" + err);
			fs.appendFile("error.txt", ele + "\n", "utf8", function (error) {
				if (error) {
					console.log(error);
					return false;
				}
			});
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
	fs.readFile(packageLockPath, "utf-8", (err, data) => {
		if (err) console.error("读取 package-lock.json 文件错误", err.message);
		const { packages, dependencies } = JSON.parse(data) as packageLockData;
		if (!packages && !dependencies) {
			throw new Error(
				"npm依赖字段有变动，请联系作者。如需正常使用，请使用9.8.1版本的npm"
			);
		}
		pushResolved(packages || dependencies);
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

const parsed = cli.parse();
