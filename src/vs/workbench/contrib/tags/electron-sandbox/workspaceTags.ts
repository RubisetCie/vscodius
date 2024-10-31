/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getHashedRemotesFromConfig as baseGetHashedRemotesFromConfig } from '../common/workspaceTags.js';
import { hashAsync } from '../../../../base/common/hash.js';

export async function getHashedRemotesFromConfig(text: string, stripEndingDotGit: boolean = false): Promise<string[]> {
	return baseGetHashedRemotesFromConfig(text, stripEndingDotGit, hashAsync);
}
