# get-npm-tgz

对于大多数内网开发人员来说，不能直接从 `npm` 下载依赖是很痛苦的，所以搭建内网 `npm` 私服是很有必要的。这个时候就需要下载大量 `npm` 的 `tgz` 包上传到 `npm` 私服，所以 `get-npm-tgz` 就出现了。搭建内网可参考文章[Linux安装Nexus3搭建Npm私服](https://tenk-notebook.netlify.app/article/article/%E6%90%AD%E5%BB%BAnpm%E7%A7%81%E6%9C%8D.html)

## 📦 安装

```bash
  npm i get-npm-tgz -g
```

## 🚗 用法

根据 `package-lock.json` 全量下载，在 `package-lock.json` 所在目录下执行

```bash
 # 已全局安装get-npm-tgz
  tgz
  # 在不使用全局安装的情况下可直接使用
  npx get-npm-tgz
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
  -k, --token <token> 传入token, 在下载需要认证的私服tgz时, 必须传入
```

## 🤗 说明

- 执行完命令后会在根目录生成一个 `tgz` 文件夹，里面存放的就是 `package` 对应的 `tgz` 包
- 下载失败的包会在 `error.txt` 文件记录
- 如果下载失败的包不是很多，建议手动重新下载一下失败的包
- [获取 token 的方式](https://github.com/Ten-K/get-npm-tgz/blob/3ad7c3faeafef4e6b30c829eb8108cead90ec048/src/utils.ts#L152)

## ⚠️ 注意

- 低版本的 `npm` 支持有限，建议使用 `npm@9.8.1` 及以上版本
- 指定下载包时需要指定版本号
- 不指定下载包时根目录必须存在 `package-lock.json`
- 目前只支持项目使用npm下载的依赖（即根目录存在 `package-lock.json` ），如果使用 `pnpm` 、`yarn` 等请使用转化工具转换出 `package-lock.json` ，或重新使用 `npm` 下载依赖
- [synp](https://github.com/imsnif/synp)：将 `yarn.lock` 转化为 `package-lock.json`
- [pnpm-lock-to-npm-lock](https://github.com/jakedoublev/pnpm-lock-to-npm-lock)：将 `pnpm-lock.yaml` 转化为 `package-lock.json`
