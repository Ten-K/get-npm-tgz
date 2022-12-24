import fs from 'fs'
import url from 'url'
import path from 'path'
import request from 'request'

import { packageData, dependenciesItem } from './types'

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

const packageLockPath = getFilePath('package-lock.json')
const viewList: Array<string> = []

const start = () => {
	fs.readFile(packageLockPath, 'utf-8', (err, data) => {
		if (err) console.error('读取 package-lock.json 文件错误', err.message)

		const { dependencies } = JSON.parse(data) as packageData
		pushResolved(dependencies)

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
	})
}

/** 开始开始 */
start()
