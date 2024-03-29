/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { IProductService } from 'vs/platform/product/common/productService';
import { asTextOrError, IRequestService } from 'vs/platform/request/common/request';
import { CancellationToken } from 'vs/base/common/cancellation';
import { AbstractExtensionResourceLoaderService, IExtensionResourceLoaderService } from 'vs/platform/extensionResourceLoader/common/extensionResourceLoader';

export class ExtensionResourceLoaderService extends AbstractExtensionResourceLoaderService {

	constructor(
		@IFileService fileService: IFileService,
		@IProductService productService: IProductService,
		@IRequestService private readonly _requestService: IRequestService,
	) {
		super(fileService, productService);
	}

	async readExtensionResource(uri: URI): Promise<string> {
		if (this.isExtensionGalleryResource(uri)) {
			const headers = await this.getExtensionGalleryRequestHeaders();
			const requestContext = await this._requestService.request({ url: uri.toString(), headers }, CancellationToken.None);
			return (await asTextOrError(requestContext)) || '';
		}
		const result = await this._fileService.readFile(uri);
		return result.value.toString();
	}

}

registerSingleton(IExtensionResourceLoaderService, ExtensionResourceLoaderService, InstantiationType.Delayed);
