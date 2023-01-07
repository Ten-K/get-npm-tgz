# get-npm-tgz

对于大多数内网开发人员来说，不能直接从npm下载依赖是很痛苦的，所以搭建内网npm私服是很有必要的。这个时候就需要下载大量npm的`tgz`包上传到npm私服，所以`get-npm-tgz`就出现了

## 📦 安装

```bash
  npm i get-npm-tgz -g
```

## 🚗 用法

根据 `package-lock.json` 全量下载，在package-lock.json所在目录下执行

```bash
  tgz
```

指定下载包：

```bash
  tgz axios@0.18.0 cac@6.7.11 -n // 默认使用npm源下载
```

```bash
  -n, --npm      使用npm源下载
  -c, --cnpm     使用cnpm源下载
  -y, --yarn     使用yarn源下载
  -t, --taobao   使用taobao源下载
```

## 🤗 说明

- 执行完命令后会在根目录生成一个tgz文件夹，里面存放的就是package对应的tgz包
- 下载失败的包会在error.txt文件记录
- 如果下载失败的包不是很多，建议手动重新下载一下失败的包

## ⚠️ 注意

- 指定下载包时需要指定版本号
- 不指定下载包时根目录必须存在 **package-lock.json**
- 目前只支持项目使用npm下载的依赖（即根目录存在 **package-lock.json** ），如果使用pnpm、yarn等请使用转化工具转换出 **package-lock.json** ，或重新使用npm下载依赖
