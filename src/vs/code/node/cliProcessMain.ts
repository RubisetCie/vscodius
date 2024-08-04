/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { isSigPipeError, onUnexpectedError, setUnexpectedErrorHandler } from 'vs/base/common/errors';
import { Disposable } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { isAbsolute, join } from 'vs/base/common/path';
import { isWindows } from 'vs/base/common/platform';
import { cwd } from 'vs/base/common/process';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationService } from 'vs/platform/configuration/common/configurationService';
import { IDownloadService } from 'vs/platform/download/common/download';
import { DownloadService } from 'vs/platform/download/common/downloadService';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { NativeEnvironmentService } from 'vs/platform/environment/node/environmentService';
import { ExtensionGalleryServiceWithNoStorageService } from 'vs/platform/extensionManagement/common/extensionGalleryService';
import { IExtensionGalleryService, InstallOptions } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionManagementCLI } from 'vs/platform/extensionManagement/common/extensionManagementCLI';
import { IExtensionsProfileScannerService } from 'vs/platform/extensionManagement/common/extensionsProfileScannerService';
import { IExtensionsScannerService } from 'vs/platform/extensionManagement/common/extensionsScannerService';
import { ExtensionManagementService, INativeServerExtensionManagementService } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { ExtensionsScannerService } from 'vs/platform/extensionManagement/node/extensionsScannerService';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILanguagePackService } from 'vs/platform/languagePacks/common/languagePacks';
import { NativeLanguagePackService } from 'vs/platform/languagePacks/node/languagePacks';
import { ConsoleLogger, getLogLevel, ILogger, ILoggerService, ILogService, LogLevel } from 'vs/platform/log/common/log';
import { FilePolicyService } from 'vs/platform/policy/common/filePolicyService';
import { IPolicyService, NullPolicyService } from 'vs/platform/policy/common/policy';
import { NativePolicyService } from 'vs/platform/policy/node/nativePolicyService';
import product from 'vs/platform/product/common/product';
import { IProductService } from 'vs/platform/product/common/productService';
import { IRequestService } from 'vs/platform/request/common/request';
import { RequestService } from 'vs/platform/request/node/requestService';
import { SaveStrategy, StateReadonlyService } from 'vs/platform/state/node/stateService';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { IUserDataProfile, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { UserDataProfilesReadonlyService } from 'vs/platform/userDataProfile/node/userDataProfile';
import { ExtensionsProfileScannerService } from 'vs/platform/extensionManagement/node/extensionsProfileScannerService';
import { LogService } from 'vs/platform/log/common/logService';
import { LoggerService } from 'vs/platform/log/node/loggerService';
import { localize } from 'vs/nls';
import { FileUserDataProvider } from 'vs/platform/userData/common/fileUserDataProvider';
import { addUNCHostToAllowlist, getUNCHost } from 'vs/base/node/unc';

class CliMain extends Disposable {

	constructor(
		private argv: NativeParsedArgs
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {

		// Dispose on exit
		process.once('exit', () => this.dispose());
	}

	async run(): Promise<void> {

		// Services
		const instantiationService = await this.initServices();

		return instantiationService.invokeFunction(async accessor => {
			const logService = accessor.get(ILogService);
			const fileService = accessor.get(IFileService);
			const environmentService = accessor.get(INativeEnvironmentService);
			const userDataProfilesService = accessor.get(IUserDataProfilesService);

			// Log info
			logService.info('CLI main', this.argv);

			// Error handler
			this.registerErrorHandler(logService);

			// Run based on argv
			await this.doRun(environmentService, fileService, userDataProfilesService, instantiationService);

			return;
		});
	}

	private async initServices(): Promise<IInstantiationService> {
		const services = new ServiceCollection();

		// Product
		const productService = { _serviceBrand: undefined, ...product };
		services.set(IProductService, productService);

		// Environment
		const environmentService = new NativeEnvironmentService(this.argv, productService);
		services.set(INativeEnvironmentService, environmentService);

		// Init folders
		await Promise.all([
			this.allowWindowsUNCPath(environmentService.appSettingsHome.with({ scheme: Schemas.file }).fsPath),
			this.allowWindowsUNCPath(environmentService.extensionsPath)
		].map(path => path ? fs.promises.mkdir(path, { recursive: true }) : undefined));

		// Logger
		const loggerService = new LoggerService(getLogLevel(environmentService), environmentService.logsHome);
		services.set(ILoggerService, loggerService);

		// Log
		const logger = this._register(loggerService.createLogger('cli', { name: localize('cli', "CLI") }));
		const otherLoggers: ILogger[] = [];
		if (loggerService.getLogLevel() === LogLevel.Trace) {
			otherLoggers.push(new ConsoleLogger(loggerService.getLogLevel()));
		}

		const logService = this._register(new LogService(logger, otherLoggers));
		services.set(ILogService, logService);

		// Files
		const fileService = this._register(new FileService(logService));
		services.set(IFileService, fileService);

		const diskFileSystemProvider = this._register(new DiskFileSystemProvider(logService));
		fileService.registerProvider(Schemas.file, diskFileSystemProvider);

		// Uri Identity
		const uriIdentityService = new UriIdentityService(fileService);
		services.set(IUriIdentityService, uriIdentityService);

		// User Data Profiles
		const stateService = new StateReadonlyService(SaveStrategy.DELAYED, environmentService, logService, fileService);
		const userDataProfilesService = new UserDataProfilesReadonlyService(stateService, uriIdentityService, environmentService, fileService, logService);
		services.set(IUserDataProfilesService, userDataProfilesService);

		// Use FileUserDataProvider for user data to
		// enable atomic read / write operations.
		fileService.registerProvider(Schemas.vscodeUserData, new FileUserDataProvider(Schemas.file, diskFileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, logService));

		// Policy
		const policyService = isWindows && productService.win32RegValueName ? this._register(new NativePolicyService(logService, productService.win32RegValueName))
			: environmentService.policyFile ? this._register(new FilePolicyService(environmentService.policyFile, fileService, logService))
				: new NullPolicyService();
		services.set(IPolicyService, policyService);

		// Configuration
		const configurationService = this._register(new ConfigurationService(userDataProfilesService.defaultProfile.settingsResource, fileService, policyService, logService));
		services.set(IConfigurationService, configurationService);

		// Initialize
		await Promise.all([
			stateService.init(),
			configurationService.initialize()
		]);

		// Initialize user data profiles after initializing the state
		userDataProfilesService.init();

		// URI Identity
		services.set(IUriIdentityService, new UriIdentityService(fileService));

		// Request
		const requestService = new RequestService(configurationService, environmentService, logService, loggerService);
		services.set(IRequestService, requestService);

		// Download Service
		services.set(IDownloadService, new SyncDescriptor(DownloadService, undefined, true));

		// Extensions
		services.set(IExtensionsProfileScannerService, new SyncDescriptor(ExtensionsProfileScannerService, undefined, true));
		services.set(IExtensionsScannerService, new SyncDescriptor(ExtensionsScannerService, undefined, true));
		services.set(INativeServerExtensionManagementService, new SyncDescriptor(ExtensionManagementService, undefined, true));
		services.set(IExtensionGalleryService, new SyncDescriptor(ExtensionGalleryServiceWithNoStorageService, undefined, true));

		// Localizations
		services.set(ILanguagePackService, new SyncDescriptor(NativeLanguagePackService, undefined, false));

		return new InstantiationService(services);
	}

	private allowWindowsUNCPath(path: string): string {
		if (isWindows) {
			const host = getUNCHost(path);
			if (host) {
				addUNCHostToAllowlist(host);
			}
		}

		return path;
	}

	private registerErrorHandler(logService: ILogService): void {

		// Install handler for unexpected errors
		setUnexpectedErrorHandler(error => {
			const message = toErrorMessage(error, true);
			if (!message) {
				return;
			}

			logService.error(`[uncaught exception in CLI]: ${message}`);
		});

		// Handle unhandled errors that can occur
		process.on('uncaughtException', err => {
			if (!isSigPipeError(err)) {
				onUnexpectedError(err);
			}
		});
		process.on('unhandledRejection', (reason: unknown) => onUnexpectedError(reason));
	}

	private async doRun(environmentService: INativeEnvironmentService, fileService: IFileService, userDataProfilesService: IUserDataProfilesService, instantiationService: IInstantiationService): Promise<void> {
		let profile: IUserDataProfile | undefined = undefined;
		if (environmentService.args.profile) {
			profile = userDataProfilesService.profiles.find(p => p.name === environmentService.args.profile);
			if (!profile) {
				throw new Error(`Profile '${environmentService.args.profile}' not found.`);
			}
		}
		const profileLocation = (profile ?? userDataProfilesService.defaultProfile).extensionsResource;

		// List Extensions
		if (this.argv['list-extensions']) {
			return instantiationService.createInstance(ExtensionManagementCLI, new ConsoleLogger(LogLevel.Info, false)).listExtensions(!!this.argv['show-versions'], this.argv['category'], profileLocation);
		}

		// Install Extension
		else if (this.argv['install-extension'] || this.argv['install-builtin-extension']) {
			const installOptions: InstallOptions = { isMachineScoped: !!this.argv['do-not-sync'], installPreReleaseVersion: !!this.argv['pre-release'], profileLocation };
			return instantiationService.createInstance(ExtensionManagementCLI, new ConsoleLogger(LogLevel.Info, false)).installExtensions(this.asExtensionIdOrVSIX(this.argv['install-extension'] || []), this.asExtensionIdOrVSIX(this.argv['install-builtin-extension'] || []), installOptions, !!this.argv['force']);
		}

		// Uninstall Extension
		else if (this.argv['uninstall-extension']) {
			return instantiationService.createInstance(ExtensionManagementCLI, new ConsoleLogger(LogLevel.Info, false)).uninstallExtensions(this.asExtensionIdOrVSIX(this.argv['uninstall-extension']), !!this.argv['force'], profileLocation);
		}

		else if (this.argv['update-extensions']) {
			return instantiationService.createInstance(ExtensionManagementCLI, new ConsoleLogger(LogLevel.Info, false)).updateExtensions(profileLocation);
		}

		// Locate Extension
		else if (this.argv['locate-extension']) {
			return instantiationService.createInstance(ExtensionManagementCLI, new ConsoleLogger(LogLevel.Info, false)).locateExtension(this.argv['locate-extension']);
		}
	}

	private asExtensionIdOrVSIX(inputs: string[]): (string | URI)[] {
		return inputs.map(input => /\.vsix$/i.test(input) ? URI.file(isAbsolute(input) ? input : join(cwd(), input)) : input);
	}
}

export async function main(argv: NativeParsedArgs): Promise<void> {
	const cliMain = new CliMain(argv);

	try {
		await cliMain.run();
	} finally {
		cliMain.dispose();
	}
}
