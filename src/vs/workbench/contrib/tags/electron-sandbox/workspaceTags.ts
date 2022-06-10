/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { sha1Hex } from 'vs/base/browser/hash';
import { getRemotes } from 'vs/platform/extensionManagement/common/configRemotes';

export async function getHashedRemotesFromConfig(text: string, stripEndingDotGit: boolean = false): Promise<string[]> {
	return Promise.all(getRemotes(text, stripEndingDotGit).map(remote => sha1Hex(remote)));
}

