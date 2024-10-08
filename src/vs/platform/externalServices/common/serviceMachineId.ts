/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { generateUuid } from '../../../base/common/uuid.js';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';

export async function getServiceMachineId(storageService: IStorageService | undefined): Promise<string> {
	let uuid: string | null = storageService ? storageService.get('storage.serviceMachineId', StorageScope.APPLICATION) || null : null;
	if (uuid) {
		return uuid;
	}

	uuid = generateUuid();
	storageService?.store('storage.serviceMachineId', uuid, StorageScope.APPLICATION, StorageTarget.MACHINE);

	return uuid;
}
