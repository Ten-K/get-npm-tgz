// ============================================================
// npm 源地址
// ============================================================
export const REGISTRIES = {
	/** npm 官方源 */
	NPM: "https://registry.npmjs.org/",
	/** cnpm 源 */
	CNPM: "https://r.cnpmjs.org/",
	/** yarn 源 */
	YARN: "https://registry.yarnpkg.com/",
	/** 淘宝镜像源（推荐中国大陆用户使用） */
	TAOBAO: "https://registry.npmmirror.com/"
} as const;

/** 并发下载请求限制数 */
export const MAX_CONCURRENT_REQUESTS = 5;

/** 下载空闲超时：超过该时长无任何数据传输则视为断流（毫秒） */
export const DOWNLOAD_IDLE_TIMEOUT = 5 * 60 * 1000;
