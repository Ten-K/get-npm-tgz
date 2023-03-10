export interface packageData {
	name?: string
	version?: string
	lockfileVersion?: number
	requires?: boolean
	packages?: object
	dependencies: object
}

export interface dependenciesItem {
	version: string
	resolved: string
	integrity?: string
	requires?: object
	[propsname: string]: any
}
