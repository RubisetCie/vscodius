/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtHostWorkspaceProvider } from '../common/extHostWorkspace.js';
import { ConfigurationInspect, ExtHostConfigProvider } from '../common/extHostConfiguration.js';
import { IExtensionHostInitData } from '../../services/extensions/common/extensionHostProtocol.js';
import { ExtHostExtensionService } from './extHostExtensionService.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService, LogLevel as LogServiceLevel } from '../../../platform/log/common/log.js';
import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { LogLevel, createHttpPatch, createProxyResolver, createTlsPatch, ProxySupportSetting, ProxyAgentParams, createNetPatch, loadSystemCertificates, ResolveProxyWithRequest } from '@vscode/proxy-agent';
import { AuthInfo } from '../../../platform/request/common/request.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { createRequire } from 'node:module';
import type * as undiciType from 'undici-types';
import type * as tlsType from 'tls';
import { lookupKerberosAuthorization } from '../../../platform/request/node/requestService.js';
import * as proxyAgent from '@vscode/proxy-agent';

const require = createRequire(import.meta.url);
const http = require('http');
const https = require('https');
const tls: typeof tlsType = require('tls');
const net = require('net');

const systemCertificatesV2Default = false;
const useElectronFetchDefault = false;

export function connectProxyResolver(
	extHostWorkspace: IExtHostWorkspaceProvider,
	configProvider: ExtHostConfigProvider,
	extensionService: ExtHostExtensionService,
	extHostLogService: ILogService,
	initData: IExtensionHostInitData,
	disposables: DisposableStore,
) {

	const isRemote = initData.remote.isRemote;
	const useHostProxyDefault = initData.environment.useHostProxy ?? !isRemote;
	const fallbackToLocalKerberos = useHostProxyDefault;
	const loadLocalCertificates = useHostProxyDefault;
	const isUseHostProxyEnabled = () => !isRemote || configProvider.getConfiguration('http').get<boolean>('useLocalProxyConfiguration', useHostProxyDefault);
	const params: ProxyAgentParams = {
		resolveProxy: url => extHostWorkspace.resolveProxy(url),
		lookupProxyAuthorization: lookupProxyAuthorization.bind(undefined, extHostWorkspace, extHostLogService, configProvider, {}, {}, initData.remote.isRemote, fallbackToLocalKerberos),
		getProxyURL: () => getExtHostConfigValue<string>(configProvider, isRemote, 'http.proxy'),
		getProxySupport: () => getExtHostConfigValue<ProxySupportSetting>(configProvider, isRemote, 'http.proxySupport') || 'off',
		getNoProxyConfig: () => getExtHostConfigValue<string[]>(configProvider, isRemote, 'http.noProxy') || [],
		isAdditionalFetchSupportEnabled: () => getExtHostConfigValue<boolean>(configProvider, isRemote, 'http.fetchAdditionalSupport', true),
		addCertificatesV1: () => certSettingV1(configProvider, isRemote),
		addCertificatesV2: () => certSettingV2(configProvider, isRemote),
		log: extHostLogService,
		getLogLevel: () => {
			const level = extHostLogService.getLevel();
			switch (level) {
				case LogServiceLevel.Trace: return LogLevel.Trace;
				case LogServiceLevel.Debug: return LogLevel.Debug;
				case LogServiceLevel.Info: return LogLevel.Info;
				case LogServiceLevel.Warning: return LogLevel.Warning;
				case LogServiceLevel.Error: return LogLevel.Error;
				case LogServiceLevel.Off: return LogLevel.Off;
				default: return never(level);
			}
			function never(level: never) {
				extHostLogService.error('Unknown log level', level);
				return LogLevel.Debug;
			}
		},
		proxyResolveTelemetry: () => { }, // Required, out of my control.
		isUseHostProxyEnabled,
		loadAdditionalCertificates: async () => {
			const promises: Promise<string[]>[] = [];
			if (initData.remote.isRemote) {
				promises.push(loadSystemCertificates({ log: extHostLogService }));
			}
			if (loadLocalCertificates) {
				extHostLogService.trace('ProxyResolver#loadAdditionalCertificates: Loading certificates from main process');
				const certs = extHostWorkspace.loadCertificates(); // Loading from main process to share cache.
				certs.then(certs => extHostLogService.trace('ProxyResolver#loadAdditionalCertificates: Loaded certificates from main process', certs.length));
				promises.push(certs);
			}
			// Using https.globalAgent because it is shared with proxy.test.ts and mutable.
			if (initData.environment.extensionTestsLocationURI && (https.globalAgent as any).testCertificates?.length) {
				extHostLogService.trace('ProxyResolver#loadAdditionalCertificates: Loading test certificates');
				promises.push(Promise.resolve((https.globalAgent as any).testCertificates as string[]));
			}
			return (await Promise.all(promises)).flat();
		},
		env: process.env,
	};
	const { resolveProxyWithRequest, resolveProxyURL } = createProxyResolver(params);
	const target = (proxyAgent as any).default || proxyAgent;
	target.resolveProxyURL = resolveProxyURL;

	patchGlobalFetch(params, configProvider, initData, resolveProxyURL, disposables);

	const lookup = createPatchedModules(params, resolveProxyWithRequest);
	return configureModuleLoading(extensionService, lookup);
}

const unsafeHeaders = [
	'content-length',
	'host',
	'trailer',
	'te',
	'upgrade',
	'cookie2',
	'keep-alive',
	'transfer-encoding',
	'set-cookie',
];

function patchGlobalFetch(params: ProxyAgentParams, configProvider: ExtHostConfigProvider, initData: IExtensionHostInitData, resolveProxyURL: (url: string) => Promise<string | undefined>, disposables: DisposableStore) {
	if (!(globalThis as any).__vscodeOriginalFetch) {
		const originalFetch = globalThis.fetch;
		(globalThis as any).__vscodeOriginalFetch = originalFetch;
		const patchedFetch = proxyAgent.createFetchPatch(params, originalFetch, resolveProxyURL);
		(globalThis as any).__vscodePatchedFetch = patchedFetch;
		let useElectronFetch = false;
		if (!initData.remote.isRemote) {
			useElectronFetch = configProvider.getConfiguration('http').get<boolean>('electronFetch', useElectronFetchDefault);
			disposables.add(configProvider.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration('http.electronFetch')) {
					useElectronFetch = configProvider.getConfiguration('http').get<boolean>('electronFetch', useElectronFetchDefault);
				}
			}));
		}
		// https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
		globalThis.fetch = async function fetch(input: string | URL | Request, init?: RequestInit) {
			function getRequestProperty(name: keyof Request & keyof RequestInit) {
				return init && name in init ? init[name] : typeof input === 'object' && 'cache' in input ? input[name] : undefined;
			}
			// Limitations: https://github.com/electron/electron/pull/36733#issuecomment-1405615494
			// net.fetch fails on manual redirect: https://github.com/electron/electron/issues/43715
			const urlString = typeof input === 'string' ? input : 'cache' in input ? input.url : input.toString();
			const isDataUrl = urlString.startsWith('data:');
			const isBlobUrl = urlString.startsWith('blob:');
			const isManualRedirect = getRequestProperty('redirect') === 'manual';
			const integrity = getRequestProperty('integrity');
			if (!useElectronFetch || isDataUrl || isBlobUrl || isManualRedirect || integrity) {
				const response = await patchedFetch(input, init);
				monitorResponseProperties(response, urlString);
				return response;
			}
			// Unsupported headers: https://source.chromium.org/chromium/chromium/src/+/main:services/network/public/cpp/header_util.cc;l=32;drc=ee7299f8961a1b05a3554efcc496b6daa0d7f6e1
			if (init?.headers) {
				const headers = new Headers(init.headers);
				for (const header of unsafeHeaders) {
					headers.delete(header);
				}
				init = { ...init, headers };
			}
			// Support for URL: https://github.com/electron/electron/issues/43712
			const electronInput = input instanceof URL ? input.toString() : input;
			const electron = require('electron');
			const response = await electron.net.fetch(electronInput, init);
			monitorResponseProperties(response, urlString);
			return response;
		};
	}
}

function monitorResponseProperties(response: Response, urlString: string) {
	const originalUrl = response.url;
	Object.defineProperty(response, 'url', {
		get() {
			return originalUrl || urlString;
		}
	});
	const originalType = response.type;
	Object.defineProperty(response, 'type', {
		get() {
			return originalType !== 'default' ? originalType : 'basic';
		}
	});
}

function createPatchedModules(params: ProxyAgentParams, resolveProxy: ResolveProxyWithRequest) {

	function mergeModules(module: any, patch: any) {
		const target = module.default || module;
		target.__vscodeOriginal = Object.assign({}, target);
		return Object.assign(target, patch);
	}

	return {
		http: mergeModules(http, createHttpPatch(params, http, resolveProxy)),
		https: mergeModules(https, createHttpPatch(params, https, resolveProxy)),
		net: mergeModules(net, createNetPatch(params, net)),
		tls: mergeModules(tls, createTlsPatch(params, tls))
	};
}

function certSettingV1(configProvider: ExtHostConfigProvider, isRemote: boolean) {
	return !getExtHostConfigValue<boolean>(configProvider, isRemote, 'http.experimental.systemCertificatesV2', systemCertificatesV2Default) && !!getExtHostConfigValue<boolean>(configProvider, isRemote, 'http.systemCertificates');
}

function certSettingV2(configProvider: ExtHostConfigProvider, isRemote: boolean) {
	return !!getExtHostConfigValue<boolean>(configProvider, isRemote, 'http.experimental.systemCertificatesV2', systemCertificatesV2Default) && !!getExtHostConfigValue<boolean>(configProvider, isRemote, 'http.systemCertificates');
}

const modulesCache = new Map<IExtensionDescription | undefined, { http?: typeof http; https?: typeof https; undici?: typeof undiciType }>();
function configureModuleLoading(extensionService: ExtHostExtensionService, lookup: ReturnType<typeof createPatchedModules>): Promise<void> {
	return extensionService.getExtensionPathIndex()
		.then(extensionPaths => {
			const node_module = require('module');
			const original = node_module._load;
			node_module._load = function load(request: string, parent: { filename: string }, isMain: boolean) {
				if (request === 'net') {
					return lookup.net;
				}

				if (request === 'tls') {
					return lookup.tls;
				}

				if (request !== 'http' && request !== 'https' && request !== 'undici') {
					return original.apply(this, arguments);
				}

				const ext = extensionPaths.findSubstr(URI.file(parent.filename));
				let cache = modulesCache.get(ext);
				if (!cache) {
					modulesCache.set(ext, cache = {});
				}
				if (!cache[request]) {
					if (request === 'undici') {
						const undici = original.apply(this, arguments);
						proxyAgent.patchUndici(undici);
						cache[request] = undici;
					} else {
						const mod = lookup[request];
						cache[request] = <any>{ ...mod }; // Copy to work around #93167.
					}
				}
				return cache[request];
			};
		});
}

async function lookupProxyAuthorization(
	extHostWorkspace: IExtHostWorkspaceProvider,
	extHostLogService: ILogService,
	configProvider: ExtHostConfigProvider,
	proxyAuthenticateCache: Record<string, string | string[] | undefined>,
	basicAuthCache: Record<string, string | undefined>,
	isRemote: boolean,
	fallbackToLocalKerberos: boolean,
	proxyURL: string,
	proxyAuthenticate: string | string[] | undefined,
	state: { kerberosRequested?: boolean; basicAuthCacheUsed?: boolean; basicAuthAttempt?: number }
): Promise<string | undefined> {
	const cached = proxyAuthenticateCache[proxyURL];
	if (proxyAuthenticate) {
		proxyAuthenticateCache[proxyURL] = proxyAuthenticate;
	}
	extHostLogService.trace('ProxyResolver#lookupProxyAuthorization callback', `proxyURL:${proxyURL}`, `proxyAuthenticate:${proxyAuthenticate}`, `proxyAuthenticateCache:${cached}`);
	const header = proxyAuthenticate || cached;
	const authenticate = Array.isArray(header) ? header : typeof header === 'string' ? [header] : [];
	if (authenticate.some(a => /^(Negotiate|Kerberos)( |$)/i.test(a)) && !state.kerberosRequested) {
		state.kerberosRequested = true;

		try {
			const spnConfig = getExtHostConfigValue<string>(configProvider, isRemote, 'http.proxyKerberosServicePrincipal');
			const response = await lookupKerberosAuthorization(proxyURL, spnConfig, extHostLogService, 'ProxyResolver#lookupProxyAuthorization');
			return 'Negotiate ' + response;
		} catch (err) {
			extHostLogService.debug('ProxyResolver#lookupProxyAuthorization Kerberos authentication failed', err);
		}

		if (isRemote && fallbackToLocalKerberos) {
			extHostLogService.debug('ProxyResolver#lookupProxyAuthorization Kerberos authentication lookup on host', `proxyURL:${proxyURL}`);
			const auth = await extHostWorkspace.lookupKerberosAuthorization(proxyURL);
			if (auth) {
				return 'Negotiate ' + auth;
			}
		}
	}
	const basicAuthHeader = authenticate.find(a => /^Basic( |$)/i.test(a));
	if (basicAuthHeader) {
		try {
			const cachedAuth = basicAuthCache[proxyURL];
			if (cachedAuth) {
				if (state.basicAuthCacheUsed) {
					extHostLogService.debug('ProxyResolver#lookupProxyAuthorization Basic authentication deleting cached credentials', `proxyURL:${proxyURL}`);
					delete basicAuthCache[proxyURL];
				} else {
					extHostLogService.debug('ProxyResolver#lookupProxyAuthorization Basic authentication using cached credentials', `proxyURL:${proxyURL}`);
					state.basicAuthCacheUsed = true;
					return cachedAuth;
				}
			}
			state.basicAuthAttempt = (state.basicAuthAttempt || 0) + 1;
			const realm = / realm="([^"]+)"/i.exec(basicAuthHeader)?.[1];
			extHostLogService.debug('ProxyResolver#lookupProxyAuthorization Basic authentication lookup', `proxyURL:${proxyURL}`, `realm:${realm}`);
			const url = new URL(proxyURL);
			const authInfo: AuthInfo = {
				scheme: 'basic',
				host: url.hostname,
				port: Number(url.port),
				realm: realm || '',
				isProxy: true,
				attempt: state.basicAuthAttempt,
			};
			const credentials = await extHostWorkspace.lookupAuthorization(authInfo);
			if (credentials) {
				extHostLogService.debug('ProxyResolver#lookupProxyAuthorization Basic authentication received credentials', `proxyURL:${proxyURL}`, `realm:${realm}`);
				const auth = 'Basic ' + Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
				basicAuthCache[proxyURL] = auth;
				return auth;
			} else {
				extHostLogService.debug('ProxyResolver#lookupProxyAuthorization Basic authentication received no credentials', `proxyURL:${proxyURL}`, `realm:${realm}`);
			}
		} catch (err) {
			extHostLogService.error('ProxyResolver#lookupProxyAuthorization Basic authentication failed', err);
		}
	}
	return undefined;
}

function getExtHostConfigValue<T>(configProvider: ExtHostConfigProvider, isRemote: boolean, key: string, fallback: T): T;
function getExtHostConfigValue<T>(configProvider: ExtHostConfigProvider, isRemote: boolean, key: string): T | undefined;
function getExtHostConfigValue<T>(configProvider: ExtHostConfigProvider, isRemote: boolean, key: string, fallback?: T): T | undefined {
	if (isRemote) {
		return configProvider.getConfiguration().get<T>(key) ?? fallback;
	}
	const values: ConfigurationInspect<T> | undefined = configProvider.getConfiguration().inspect<T>(key);
	return values?.globalLocalValue ?? values?.defaultValue ?? fallback;
}
