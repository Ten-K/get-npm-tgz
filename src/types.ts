/** npm registry API 返回的包信息 */
export interface ResData {
	"dist-tags": { latest: string };
	versions: Record<string, PackageVersionData>;
}

/** npm 包的版本信息 */
export interface PackageVersionData {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
}

/** package.json 数据结构 */
export interface PackageData {
	name?: string;
	version?: string;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
}

/** package-lock.json 数据结构 */
export interface PackageLockData {
	name?: string;
	version?: string;
	lockfileVersion?: number;
	requires?: boolean;
	packages?: Record<string, DependenciesItem>;
	dependencies?: Record<string, DependenciesItem>;
}

/** package-lock.json 中单个依赖项的结构 */
export interface DependenciesItem {
	version: string;
	resolved?: string;
	integrity?: string;
	requires?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	dependencies?: Record<string, string>;
}

/** CLI 命令行选项 */
export interface Options {
	/** 使用 npm 官方源 */
	npm?: boolean;
	/** 使用 cnpm 源 */
	cnpm?: boolean;
	/** 使用 yarn 源 */
	yarn?: boolean;
	/** 使用淘宝镜像源 */
	taobao?: boolean;
	/** 认证 token */
	token?: string;
	/** cac 解析的短选项名 */
	n?: boolean;
	c?: boolean;
	y?: boolean;
	t?: boolean;
	[key: string]: unknown;
}

/** 依赖映射：包名 → 版本号 */
export type DependencyMap = Record<string, string>;
