/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWeb } from 'vs/base/common/platform';
import { format2 } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { IHeaders } from 'vs/base/parts/request/common/request';
import { IFileService } from 'vs/platform/files/common/files';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProductService } from 'vs/platform/product/common/productService';
import { RemoteAuthorities } from 'vs/base/common/network';
import { getRemoteServerRootPath } from 'vs/platform/remote/common/remoteHosts';

export const WEB_EXTENSION_RESOURCE_END_POINT = 'web-extension-resource';

export const IExtensionResourceLoaderService = createDecorator<IExtensionResourceLoaderService>('extensionResourceLoaderService');

/**
 * A service useful for reading resources from within extensions.
 */
export interface IExtensionResourceLoaderService {
	readonly _serviceBrand: undefined;

	/**
	 * Read a certain resource within an extension.
	 */
	readExtensionResource(uri: URI): Promise<string>;

	/**
	 * Returns whether the gallery provides extension resources.
	 */
	readonly supportsExtensionGalleryResources: boolean;

	/**
	 * Computes the URL of a extension gallery resource. Returns `undefined` if gallery does not provide extension resources.
	 */
	getExtensionGalleryResourceURL(galleryExtension: { publisher: string; name: string; version: string }, path?: string): URI | undefined;
}


export abstract class AbstractExtensionResourceLoaderService implements IExtensionResourceLoaderService {

	readonly _serviceBrand: undefined;

	private readonly _webExtensionResourceEndPoint: string;
	private readonly _extensionGalleryResourceUrlTemplate: string | undefined;
	private readonly _extensionGalleryAuthority: string | undefined;

	constructor(
		protected readonly _fileService: IFileService,
		private readonly _productService: IProductService
	) {
		this._webExtensionResourceEndPoint = `${getRemoteServerRootPath(_productService)}/${WEB_EXTENSION_RESOURCE_END_POINT}/`;
		if (_productService.extensionsGallery) {
			this._extensionGalleryResourceUrlTemplate = _productService.extensionsGallery.resourceUrlTemplate;
			this._extensionGalleryAuthority = this._extensionGalleryResourceUrlTemplate ? this._getExtensionGalleryAuthority(URI.parse(this._extensionGalleryResourceUrlTemplate)) : undefined;
		}
	}

	public get supportsExtensionGalleryResources(): boolean {
		return this._extensionGalleryResourceUrlTemplate !== undefined;
	}

	public getExtensionGalleryResourceURL(galleryExtension: { publisher: string; name: string; version: string }, path?: string): URI | undefined {
		if (this._extensionGalleryResourceUrlTemplate) {
			const uri = URI.parse(format2(this._extensionGalleryResourceUrlTemplate, { publisher: galleryExtension.publisher, name: galleryExtension.name, version: galleryExtension.version, path: 'extension' }));
			return this._isWebExtensionResourceEndPoint(uri) ? uri.with({ scheme: RemoteAuthorities.getPreferredWebSchema() }) : uri;
		}
		return undefined;
	}


	public abstract readExtensionResource(uri: URI): Promise<string>;

	protected isExtensionGalleryResource(uri: URI) {
		return this._extensionGalleryAuthority && this._extensionGalleryAuthority === this._getExtensionGalleryAuthority(uri);
	}

	protected async getExtensionGalleryRequestHeaders(): Promise<IHeaders> {
		const headers: IHeaders = {
			'X-Client-Name': `${this._productService.applicationName}${isWeb ? '-web' : ''}`,
			'X-Client-Version': this._productService.version
		};
		if (this._productService.commit) {
			headers['X-Client-Commit'] = this._productService.commit;
		}
		return headers;
	}

	private _getExtensionGalleryAuthority(uri: URI): string | undefined {
		if (this._isWebExtensionResourceEndPoint(uri)) {
			return uri.authority;
		}
		const index = uri.authority.indexOf('.');
		return index !== -1 ? uri.authority.substring(index + 1) : undefined;
	}

	protected _isWebExtensionResourceEndPoint(uri: URI): boolean {
		return uri.path.startsWith(this._webExtensionResourceEndPoint);
	}

}
