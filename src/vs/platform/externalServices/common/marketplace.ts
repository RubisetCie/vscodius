/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IHeaders } from 'vs/base/parts/request/common/request';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { getServiceMachineId } from 'vs/platform/externalServices/common/serviceMachineId';
import { IFileService } from 'vs/platform/files/common/files';
import { IProductService } from 'vs/platform/product/common/productService';
import { IStorageService } from 'vs/platform/storage/common/storage';

export async function resolveMarketplaceHeaders(version: string,
	productService: IProductService,
	environmentService: IEnvironmentService,
	configurationService: IConfigurationService,
	fileService: IFileService,
	storageService: IStorageService | undefined): Promise<IHeaders> {
	const headers: IHeaders = {
		'X-Market-Client-Id': `VSCode ${version}`,
		'X-Market-User-Id': await getServiceMachineId(environmentService, fileService, storageService),
		'User-Agent': `VSCode ${version} (${productService.nameShort})`
	};
	return headers;
}
