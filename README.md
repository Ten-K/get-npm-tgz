# download-npm-tgz

对于大多数内网开发人员来说，不能直接从npm下载依赖是很痛苦的，所以搭建内网npm私服是很有必要的。这个时候就需要下载大量npm的`tgz`包上传到npm私服，所以`download-npm-tgz`就出现了

## 📦 安装

```bash
  npm i download-npm-tgz -g
```

## 🚗 用法

在package-lock.json所在目录下执行

```bash
  tgz
```

## 🤗 说明

- 执行完命令后会在根目录生成一个tgz文件夹，里面存放的就是package对应的tgz包
- 下载失败的包会在error.txt文件记录
- 如果下载失败的包不是很多，建议手动重新下载一下失败的包

## ⚠️ 注意

- 根目录必须存在**package-lock.json**
- 目前只支持项目使用npm下载的依赖，如果使用pnpm、yarn等请使用转化工具转换出**package-lock.json**，或重新使用npm下载依赖
