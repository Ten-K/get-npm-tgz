import fs from 'fs'
import url from 'url'
import path from 'path'
import { cac } from 'cac'
import request from 'request'

import { version } from '../package.json'
import { packageData, dependenciesItem } from './types'
import { REGISTER } from './constans'

/**
 * 获取源地址
 * @param options 命令行参数
 */
const getRegistry = (options: any) => {
	if (options.c) {
		return REGISTER.CNPM
	}
	if (options.y) {
		return REGISTER.YARN
	}
	if (options.t) {
		return REGISTER.TAOBAO
	}
	return REGISTER.NPM
}

/**
 * 获取文件路径
 * @param fliename 文件名
 * @returns
 */
const getFilePath = (fliename: string) => {
	return path.join(process.cwd(), fliename)
}

/**
 * 收集npm离线包下载url
 * @param data 依赖对象
 * @returns
 */
const pushResolved = (data: object) => {
	if (!data) return
	Object.keys(data).forEach((item: string) => {
		if (!item.length) return
		viewList.push(
			(data[item as keyof typeof data] as dependenciesItem).resolved
		)
	})
}

/**
 * 删除文件夹
 * @param dir 文件夹路径
 */
const delDirectory = (dir: string) => {
	let files = []
	if (fs.existsSync(dir)) {
		files = fs.readdirSync(dir)
		files.forEach((file) => {
			const curPath = path.join(dir, file)
			const stat = fs.statSync(curPath)
			if (stat.isDirectory()) {
				delDirectory(curPath) //递归删除文件夹
			} else if (stat.isFile()) {
				fs.unlinkSync(curPath) //删除文件
			}
		})
		fs.rmdirSync(dir)
		console.log('删除tgz文件夹成功')
	}
}

/**
 * 删除文件
 * @param file 文件路径
 */
const delFile = (file: string) => {
	fs.access(file, fs.constants.F_OK, (err) => {
		if (err) return
		fs.unlinkSync(file)
		console.log('error.txt文件删除成功')
	})
}

/**
 * 创建文件夹
 * @param dir 文件夹路径
 */
const createDirectory = (dir: string) => {
	if (fs.existsSync(dir)) return console.log('tgz文件夹已存在')
	fs.mkdirSync(dir)
	console.log('tgz文件夹创建成功')
}

/**
 * 下载tgz包
 */
const downloadTgz = () => {
	viewList.forEach((ele) => {
		const path = url.parse(ele).path as string
		const writestream = fs.createWriteStream(
			'./tgz/' + path.split('/-/')[1]
		)
		const readstream = request(ele)
		readstream.pipe(writestream)
		readstream.on('end', function () {
			console.log(path.split('/-/')[1] + '文件下载成功')
		})
		readstream.on('error', function (err) {
			console.log('错误信息:' + err)
			fs.appendFile('error.txt', ele + '\n', 'utf8', function (error) {
				if (error) {
					console.log(error)
					return false
				}
			})
		})

		writestream.on('finish', function () {
			console.log(path.split('/-/')[1] + '文件写入成功')
			writestream.end()
		})
	})
}

const downloadHandle = () => {
	/** 删除tgz文件夹 */
	const tgzDirectoryPath = getFilePath('tgz')
	delDirectory(tgzDirectoryPath)
	/** 删除error文件 */
	const errFilePath = getFilePath('error.txt')
	delFile(errFilePath)
	/** 创建tgz文件夹 */
	createDirectory(tgzDirectoryPath)
	/** 下载tgz包 */
	downloadTgz()
}

const packageLockPath = getFilePath('package-lock.json')
const viewList: Array<string> = []

const start = () => {
	fs.readFile(packageLockPath, 'utf-8', (err, data) => {
		if (err) console.error('读取 package-lock.json 文件错误', err.message)

		const { dependencies } = JSON.parse(data) as packageData
		pushResolved(dependencies)
    downloadHandle()
	})
}

const cli = cac('tgz')
cli.version(version)

cli.command('[...pkgs]', '批量下载tgz')
	.option('-n, --npm', '使用npm源下载')
	.option('-c, --cnpm', '使用cnpm源下载')
	.option('-y, --yarn', '使用yarn源下载')
	.option('-t, --taobao', '使用taobao源下载')
	.action(async (pkgs, options) => {
		const pkgsLength = pkgs.length
		/** 没有指定下载包，默认查询<package-lock.json>文件下载所有依赖tgz包 */
		if (!pkgsLength) {
			return start()
		}
		for (const pkg of pkgs) {
			const [name, version] = pkg.split('@')
			if (!version) return console.log(`请指定【${name}】的版本号`)
			const registry = getRegistry(options)
			const url = `${registry}${name}/-/${name}-${version}.tgz`
			viewList.push(url)
		}
		if (viewList.length !== pkgsLength) return
		downloadHandle()
	})

cli.help()

const parsed = cli.parse()
