/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AzureActiveDirectoryService, onDidChangeSessions } from './AADHelper';

export async function activate(context: vscode.ExtensionContext) {
	const { name, version, aiKey } = context.extension.packageJSON as { name: string; version: string; aiKey: string };

	const loginService = new AzureActiveDirectoryService(context);
	await loginService.initialize();

	context.subscriptions.push(vscode.authentication.registerAuthenticationProvider('microsoft', 'Microsoft', {
		onDidChangeSessions: onDidChangeSessions.event,
		getSessions: (scopes: string[]) => loginService.getSessions(scopes),
		createSession: async (scopes: string[]) => {
			try {
				/* __GDPR__
					"login" : {
						"owner": "TylerLeonhardt",
						"comment": "Used to determine the usage of the Microsoft Auth Provider.",
						"scopes": { "classification": "PublicNonPersonalData", "purpose": "FeatureInsight", "comment": "Used to determine what scope combinations are being requested." }
					}
				*/
				const session = await loginService.createSession(scopes.sort());
				onDidChangeSessions.fire({ added: [session], removed: [], changed: [] });
				return session;
			} catch (e) {
				/* __GDPR__
					"loginFailed" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users run into issues with the login flow." }
				*/
				throw e;
			}
		},
		removeSession: async (id: string) => {
			try {
				/* __GDPR__
					"logout" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often users log out." }
				*/
				const session = await loginService.removeSessionById(id);
				if (session) {
					onDidChangeSessions.fire({ added: [], removed: [session], changed: [] });
				}
			} catch (e) {
				/* __GDPR__
					"logoutFailed" : { "owner": "TylerLeonhardt", "comment": "Used to determine how often fail to log out." }
				*/
			}
		}
	}, { supportsMultipleAccounts: true }));

	return;
}

// this method is called when your extension is deactivated
export function deactivate() { }
