export interface ResData {
	"dist-tags": { latest: string };
}

export interface PackageData {
	name?: string;
	version?: string;
	dependencies?: object;
	devDependencies?: object;
	peerDependencies?: object;
}

export interface PackageLockData {
	name?: string;
	version?: string;
	lockfileVersion?: number;
	requires?: boolean;
	packages: object;
	dependencies?: object;
}

export interface DependenciesItem {
	version: string;
	resolved: string;
	integrity?: string;
	requires?: object;
	[propsname: string]: any;
}

export interface Options {
	npm?: boolean;
	cnpm?: boolean;
	yarn?: boolean;
	taobao?: boolean;
	token?: string;
	n?: boolean;
	c?: boolean;
	y?: boolean;
	t?: boolean;
	tk?: string;
}
