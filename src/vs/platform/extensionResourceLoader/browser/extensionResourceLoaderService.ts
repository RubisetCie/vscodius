/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { FileAccess, Schemas } from 'vs/base/common/network';
import { IProductService } from 'vs/platform/product/common/productService';
import { ILogService } from 'vs/platform/log/common/log';
import { AbstractExtensionResourceLoaderService, IExtensionResourceLoaderService } from 'vs/platform/extensionResourceLoader/common/extensionResourceLoader';

class ExtensionResourceLoaderService extends AbstractExtensionResourceLoaderService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IFileService fileService: IFileService,
		@IProductService productService: IProductService,
		@ILogService private readonly _logService: ILogService,
	) {
		super(fileService, productService);
	}

	async readExtensionResource(uri: URI): Promise<string> {
		uri = FileAccess.uriToBrowserUri(uri);

		if (uri.scheme !== Schemas.http && uri.scheme !== Schemas.https && uri.scheme !== Schemas.data) {
			const result = await this._fileService.readFile(uri);
			return result.value.toString();
		}

		const requestInit: RequestInit = {};
		if (this.isExtensionGalleryResource(uri)) {
			requestInit.headers = await this.getExtensionGalleryRequestHeaders();
			requestInit.mode = 'cors'; /* set mode to cors so that above headers are always passed */
		}

		const response = await fetch(uri.toString(true), requestInit);
		if (response.status !== 200) {
			this._logService.info(`Request to '${uri.toString(true)}' failed with status code ${response.status}`);
			throw new Error(response.statusText);
		}
		return response.text();
	}
}

registerSingleton(IExtensionResourceLoaderService, ExtensionResourceLoaderService, InstantiationType.Delayed);
