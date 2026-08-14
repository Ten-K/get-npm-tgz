# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

`get-npm-tgz` 是一个批量下载 npm 包 `.tgz` 文件的 CLI 工具，面向需要将大量包上传到内网 npm 私服（如 Nexus）的开发者。源码为 TypeScript，发布的 CLI 命令是 `tgz`（`bin/www.js`）。

## 常用命令

```bash
pnpm build   # 通过 tsup 打包 src/ → dist/index.js（CJS、压缩）。dist/ 已被 gitignore
pnpm dev     # pnpm build && cd play && tgz —— 先构建，再在 play/ 测试目录中运行 CLI
```

- 包管理器为 **pnpm**（`packageManager: pnpm@11.21.0`，版本管理与构建脚本白名单配置在 `pnpm-workspace.yaml`）。不要用 npm/yarn 安装依赖。
- 需要 Node `>=24.19.0`（`.nvmrc` 固定 `24.19.0`）。
- **没有 lint 和测试配置**。可用 `npx tsc --noEmit` 做类型检查（tsconfig.json 为 `strict`）。
- `commit.sh <msg>` 是一个便捷脚本：`git add . && commit && pull && push`。

## 工作原理

CLI 用 `cac` 解析参数（定义在 `src/index.ts`），接收可选包列表 + registry 源标志。流程：

- **不带包参数** → 读取当前目录下的 `package-lock.json`，遍历 `packages`（回退到 `dependencies`），收集所有 `resolved` 直链地址；同时解析 `peerDependencies`（当 peer 版本无法用 `semver` 转换时，会查询 registry 获取最新版本）。
- **带包参数**（`name@version`，如 `axios@0.18.0`）→ 直接构建每个下载地址。特殊参数 `package.json` 会以当前目录 `package.json` 为起点递归遍历依赖树，向 registry 查询嵌套依赖（最大深度 5）。
- **下载** → 文件写入当前目录 `./tgz/<文件名>`（每次运行会清空并重建该目录）。下载失败的包会追加记录到 `./error.txt`。并发数上限为 `MAX_CONCURRENT_REQUESTS`（5，见 `src/constants.ts`）。
- **Registry 标志**：`-n/--npm`（默认）、`-c/--cnpm`、`-y/--yarn`、`-t/--taobao`（均定义在 `src/constants.ts` 的 `REGISTRIES`）。`-k/--token` 会发送 `Authorization: Basic <token>`（用于需要认证的私服）。

## 代码架构

- `bin/www.js` — shebang 入口，仅 `require('../dist')`。发布后 `tgz` 命令指向的就是这个文件。
- `src/index.ts` — CLI 入口。按四个注释区块组织：收集 lock 文件 URL、递归收集 package.json 依赖、下载管理（`downloadAll` 按 `MAX_CONCURRENT_REQUESTS` 分批；`prepareAndDownload` 负责清理并创建 `tgz/` 目录）、`cac` CLI 定义。
- `src/utils.ts` — registry 选择、`buildTgzUrl`（对 `@scope/name` 等 scoped 包做 URL 编码）、`parseURL`（从 `/name/-/name-version.tgz` 中提取文件名）、文件系统辅助函数、`downloadFile`（axios 流 → 写入流）、以及 package-lock 解析（`parsePackageLockData` 校验 `packages`/`dependencies` 字段）。
- `src/types.ts` — 共享接口：`ResData`（registry API 响应）、`PackageData`、`PackageLockData`、`DependenciesItem`、`Options`（CLI 标志，注意 `n/c/y/t` 短选项别名是独立 key）、`DependencyMap`。
- `src/constants.ts` — `REGISTRIES`（npm/cnpm/yarn/taobao 地址）和 `MAX_CONCURRENT_REQUESTS`。

## 开发测试目录

`play/` 是 `pnpm dev` 使用的独立测试应用，自带 `package.json` 和 `package-lock.json`，运行工具后生成的 `tgz/` 和 `error.txt`（均被 gitignore）。该目录里的 `package-lock.json` 可能是一份较旧的快照——它是临时实验区，不代表当前安装的依赖。
