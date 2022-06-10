/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as performance from 'vs/base/common/performance';
import { URI } from 'vs/base/common/uri';
import { MainContext } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostConfigProvider, IExtHostConfiguration } from 'vs/workbench/api/common/extHostConfiguration';
import { nullExtensionDescription } from 'vs/workbench/services/extensions/common/extensions';
import * as vscode from 'vscode';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IExtensionApiFactory, IExtensionRegistries } from 'vs/workbench/api/common/extHost.api.impl';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ExtensionPaths, IExtHostExtensionService } from 'vs/workbench/api/common/extHostExtensionService';
import { platform } from 'vs/base/common/process';
import { ILogService } from 'vs/platform/log/common/log';
import { escapeRegExpCharacters } from 'vs/base/common/strings';


interface LoadFunction {
	(request: string): any;
}

interface IAlternativeModuleProvider {
	alternativeModuleName(name: string): string | undefined;
}

interface INodeModuleFactory extends Partial<IAlternativeModuleProvider> {
	readonly nodeModuleName: string | string[];
	load(request: string, parent: URI, original: LoadFunction): any;
}

export abstract class RequireInterceptor {

	protected readonly _factories: Map<string, INodeModuleFactory>;
	protected readonly _alternatives: ((moduleName: string) => string | undefined)[];

	constructor(
		private _apiFactory: IExtensionApiFactory,
		private _extensionRegistry: IExtensionRegistries,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IExtHostConfiguration private readonly _extHostConfiguration: IExtHostConfiguration,
		@IExtHostExtensionService private readonly _extHostExtensionService: IExtHostExtensionService,
		@IExtHostInitDataService private readonly _initData: IExtHostInitDataService,
		@ILogService private readonly _logService: ILogService,
	) {
		this._factories = new Map<string, INodeModuleFactory>();
		this._alternatives = [];
	}

	async install(): Promise<void> {

		this._installInterceptor();

		performance.mark('code/extHost/willWaitForConfig');
		const configProvider = await this._extHostConfiguration.getConfigProvider();
		performance.mark('code/extHost/didWaitForConfig');
		const extensionPaths = await this._extHostExtensionService.getExtensionPathIndex();

		this.register(new VSCodeNodeModuleFactory(this._apiFactory, extensionPaths, this._extensionRegistry, configProvider, this._logService));
		this.register(this._instaService.createInstance(KeytarNodeModuleFactory));
		this.register(this._instaService.createInstance(NodeModuleAliasingModuleFactory));
		if (this._initData.remote.isRemote) {
			this.register(this._instaService.createInstance(OpenNodeModuleFactory, this._initData.environment.appUriScheme));
		}
	}

	protected abstract _installInterceptor(): void;

	public register(interceptor: INodeModuleFactory | IAlternativeModuleProvider): void {
		if ('nodeModuleName' in interceptor) {
			if (Array.isArray(interceptor.nodeModuleName)) {
				for (const moduleName of interceptor.nodeModuleName) {
					this._factories.set(moduleName, interceptor);
				}
			} else {
				this._factories.set(interceptor.nodeModuleName, interceptor);
			}
		}

		if (typeof interceptor.alternativeModuleName === 'function') {
			this._alternatives.push((moduleName) => {
				return interceptor.alternativeModuleName!(moduleName);
			});
		}
	}
}

//#region --- module renames

class NodeModuleAliasingModuleFactory implements IAlternativeModuleProvider {
	/**
	 * Map of aliased internal node_modules, used to allow for modules to be
	 * renamed without breaking extensions. In the form "original -> new name".
	 */
	private static readonly aliased: ReadonlyMap<string, string> = new Map([
		['vscode-ripgrep', '@vscode/ripgrep'],
		['vscode-windows-registry', '@vscode/windows-registry'],
	]);

	private readonly re?: RegExp;

	constructor(@IExtHostInitDataService initData: IExtHostInitDataService) {
		if (initData.environment.appRoot && NodeModuleAliasingModuleFactory.aliased.size) {
			const root = escapeRegExpCharacters(this.forceForwardSlashes(initData.environment.appRoot.fsPath));
			// decompose ${appRoot}/node_modules/foo/bin to ['${appRoot}/node_modules/', 'foo', '/bin'],
			// and likewise the more complex form ${appRoot}/node_modules.asar.unpacked/@vcode/foo/bin
			// to ['${appRoot}/node_modules.asar.unpacked/',' @vscode/foo', '/bin'].
			const npmIdChrs = `[a-z0-9_.-]`;
			const npmModuleName = `@${npmIdChrs}+\\/${npmIdChrs}+|${npmIdChrs}+`;
			const moduleFolders = 'node_modules|node_modules\\.asar(?:\\.unpacked)?';
			this.re = new RegExp(`^(${root}/${moduleFolders}\\/)(${npmModuleName})(.*)$`, 'i');
		}
	}

	public alternativeModuleName(name: string): string | undefined {
		if (!this.re) {
			return;
		}

		const result = this.re.exec(this.forceForwardSlashes(name));
		if (!result) {
			return;
		}

		const [, prefix, moduleName, suffix] = result;
		const dealiased = NodeModuleAliasingModuleFactory.aliased.get(moduleName);
		if (dealiased === undefined) {
			return;
		}

		console.warn(`${moduleName} as been renamed to ${dealiased}, please update your imports`);

		return prefix + dealiased + suffix;
	}

	private forceForwardSlashes(str: string) {
		return str.replace(/\\/g, '/');
	}
}

//#endregion

//#region --- vscode-module

class VSCodeNodeModuleFactory implements INodeModuleFactory {
	public readonly nodeModuleName = 'vscode';

	private readonly _extApiImpl = new Map<string, typeof vscode>();
	private _defaultApiImpl?: typeof vscode;

	constructor(
		private readonly _apiFactory: IExtensionApiFactory,
		private readonly _extensionPaths: ExtensionPaths,
		private readonly _extensionRegistry: IExtensionRegistries,
		private readonly _configProvider: ExtHostConfigProvider,
		private readonly _logService: ILogService,
	) {
	}

	public load(_request: string, parent: URI): any {

		// get extension id from filename and api for extension
		const ext = this._extensionPaths.findSubstr(parent);
		if (ext) {
			let apiImpl = this._extApiImpl.get(ExtensionIdentifier.toKey(ext.identifier));
			if (!apiImpl) {
				apiImpl = this._apiFactory(ext, this._extensionRegistry, this._configProvider);
				this._extApiImpl.set(ExtensionIdentifier.toKey(ext.identifier), apiImpl);
			}
			return apiImpl;
		}

		// fall back to a default implementation
		if (!this._defaultApiImpl) {
			let extensionPathsPretty = '';
			this._extensionPaths.forEach((value, index) => extensionPathsPretty += `\t${index} -> ${value.identifier.value}\n`);
			this._logService.warn(`Could not identify extension for 'vscode' require call from ${parent}. These are the extension path mappings: \n${extensionPathsPretty}`);
			this._defaultApiImpl = this._apiFactory(nullExtensionDescription, this._extensionRegistry, this._configProvider);
		}
		return this._defaultApiImpl;
	}
}

//#endregion


//#region --- keytar-module

interface IKeytarModule {
	getPassword(service: string, account: string): Promise<string | null>;
	setPassword(service: string, account: string, password: string): Promise<void>;
	deletePassword(service: string, account: string): Promise<boolean>;
	findPassword(service: string): Promise<string | null>;
	findCredentials(service: string): Promise<Array<{ account: string; password: string }>>;
}

class KeytarNodeModuleFactory implements INodeModuleFactory {
	public readonly nodeModuleName: string = 'keytar';

	private alternativeNames: Set<string> | undefined;
	private _impl: IKeytarModule;

	constructor(
		@IExtHostRpcService rpcService: IExtHostRpcService,
		@IExtHostInitDataService initData: IExtHostInitDataService
	) {
		const { environment } = initData;
		const mainThreadKeytar = rpcService.getProxy(MainContext.MainThreadKeytar);

		if (environment.appRoot) {
			let appRoot = environment.appRoot.fsPath;
			if (platform === 'win32') {
				appRoot = appRoot.replace(/\\/g, '/');
			}
			if (appRoot[appRoot.length - 1] === '/') {
				appRoot = appRoot.substr(0, appRoot.length - 1);
			}
			this.alternativeNames = new Set();
			this.alternativeNames.add(`${appRoot}/node_modules.asar/keytar`);
			this.alternativeNames.add(`${appRoot}/node_modules/keytar`);
		}
		this._impl = {
			getPassword: (service: string, account: string): Promise<string | null> => {
				return mainThreadKeytar.$getPassword(service, account);
			},
			setPassword: (service: string, account: string, password: string): Promise<void> => {
				return mainThreadKeytar.$setPassword(service, account, password);
			},
			deletePassword: (service: string, account: string): Promise<boolean> => {
				return mainThreadKeytar.$deletePassword(service, account);
			},
			findPassword: (service: string): Promise<string | null> => {
				return mainThreadKeytar.$findPassword(service);
			},
			findCredentials(service: string): Promise<Array<{ account: string; password: string }>> {
				return mainThreadKeytar.$findCredentials(service);
			}
		};
	}

	public load(_request: string, parent: URI): any {
		return this._impl;
	}

	public alternativeModuleName(name: string): string | undefined {
		const length = name.length;
		// We need at least something like: `?/keytar` which requires
		// more than 7 characters.
		if (length <= 7 || !this.alternativeNames) {
			return undefined;
		}
		const sep = length - 7;
		if ((name.charAt(sep) === '/' || name.charAt(sep) === '\\') && name.endsWith('keytar')) {
			name = name.replace(/\\/g, '/');
			if (this.alternativeNames.has(name)) {
				return 'keytar';
			}
		}
		return undefined;
	}
}

//#endregion


//#region --- opn/open-module

interface OpenOptions {
	wait: boolean;
	app: string | string[];
}

interface IOriginalOpen {
	(target: string, options?: OpenOptions): Thenable<any>;
}

interface IOpenModule {
	(target: string, options?: OpenOptions): Thenable<void>;
}

class OpenNodeModuleFactory implements INodeModuleFactory {

	public readonly nodeModuleName: string[] = ['open', 'opn'];

	private _original?: IOriginalOpen;
	private _impl: IOpenModule;

	constructor(
		private readonly _appUriScheme: string,
		@IExtHostRpcService rpcService: IExtHostRpcService,
	) {
		const mainThreadWindow = rpcService.getProxy(MainContext.MainThreadWindow);

		this._impl = (target, options) => {
			const uri: URI = URI.parse(target);
			// If we have options use the original method.
			if (options) {
				return this.callOriginal(target, options);
			}
			if (uri.scheme === 'http' || uri.scheme === 'https') {
				return mainThreadWindow.$openUri(uri, target, { allowTunneling: true });
			} else if (uri.scheme === 'mailto' || uri.scheme === this._appUriScheme) {
				return mainThreadWindow.$openUri(uri, target, {});
			}
			return this.callOriginal(target, options);
		};
	}

	public load(request: string, parent: URI, original: LoadFunction): any {
		this._original = original(request);
		return this._impl;
	}

	private callOriginal(target: string, options: OpenOptions | undefined): Thenable<any> {
		return this._original!(target, options);
	}
}

//#endregion
