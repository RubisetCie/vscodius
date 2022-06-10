/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { URI } from 'vs/base/common/uri';

export type Tags = { [index: string]: boolean | number | string | undefined };

export const IWorkspaceTagsService = createDecorator<IWorkspaceTagsService>('workspaceTagsService');

export interface IWorkspaceTagsService {
	readonly _serviceBrand: undefined;

	getTags(): Promise<Tags>;

	getHashedRemotesFromUri(workspaceUri: URI, stripEndingDotGit?: boolean): Promise<string[]>;
}
