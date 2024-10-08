/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { IExtHostRpcService } from './extHostRpcService.js';

export interface IExtHostApiDeprecationService {
	readonly _serviceBrand: undefined;

	report(apiId: string, extension: IExtensionDescription, migrationSuggestion: string): void;
}

export const IExtHostApiDeprecationService = createDecorator<IExtHostApiDeprecationService>('IExtHostApiDeprecationService');

export class ExtHostApiDeprecationService implements IExtHostApiDeprecationService {

	declare readonly _serviceBrand: undefined;

	private readonly _reportedUsages = new Set<string>();

	constructor(
		@IExtHostRpcService rpc: IExtHostRpcService,
		@ILogService private readonly _extHostLogService: ILogService,
	) {
	}

	public report(apiId: string, extension: IExtensionDescription, migrationSuggestion: string): void {
		const key = this.getUsageKey(apiId, extension);
		if (this._reportedUsages.has(key)) {
			return;
		}
		this._reportedUsages.add(key);

		if (extension.isUnderDevelopment) {
			this._extHostLogService.warn(`[Deprecation Warning] '${apiId}' is deprecated. ${migrationSuggestion}`);
		}
	}

	private getUsageKey(apiId: string, extension: IExtensionDescription): string {
		return `${apiId}-${extension.identifier.value}`;
	}
}


export const NullApiDeprecationService = Object.freeze(new class implements IExtHostApiDeprecationService {
	declare readonly _serviceBrand: undefined;

	public report(_apiId: string, _extension: IExtensionDescription, _warningMessage: string): void {
		// noop
	}
}());
