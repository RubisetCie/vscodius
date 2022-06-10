/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import fetch, { Response } from 'node-fetch';
import { AuthProviderType } from './github';
import { Log } from './common/logger';

const NETWORK_ERROR = 'network error';

class UriEventHandler extends vscode.EventEmitter<vscode.Uri> implements vscode.UriHandler {
	constructor(private readonly Logger: Log) {
		super();
	}

	public handleUri(uri: vscode.Uri) {
		this.Logger.trace('Handling Uri...');
		this.fire(uri);
	}
}

export interface IGitHubServer extends vscode.Disposable {
	login(scopes: string): Promise<string>;
	getUserInfo(token: string): Promise<{ id: string; accountName: string }>;
	friendlyName: string;
	type: AuthProviderType;
}

async function getScopes(token: string, serverUri: vscode.Uri, logger: Log): Promise<string[]> {
	try {
		logger.info('Getting token scopes...');
		const result = await fetch(serverUri.toString(), {
			headers: {
				Authorization: `token ${token}`,
				'User-Agent': 'Visual-Studio-Code'
			}
		});

		if (result.ok) {
			const scopes = result.headers.get('X-OAuth-Scopes');
			return scopes ? scopes.split(',').map(scope => scope.trim()) : [];
		} else {
			logger.error(`Getting scopes failed: ${result.statusText}`);
			throw new Error(result.statusText);
		}
	} catch (ex) {
		logger.error(ex.message);
		throw new Error(NETWORK_ERROR);
	}
}

async function getUserInfo(token: string, serverUri: vscode.Uri, logger: Log): Promise<{ id: string; accountName: string }> {
	let result: Response;
	try {
		logger.info('Getting user info...');
		result = await fetch(serverUri.toString(), {
			headers: {
				Authorization: `token ${token}`,
				'User-Agent': 'Visual-Studio-Code'
			}
		});
	} catch (ex) {
		logger.error(ex.message);
		throw new Error(NETWORK_ERROR);
	}

	if (result.ok) {
		try {
			const json = await result.json();
			logger.info('Got account info!');
			return { id: json.id, accountName: json.login };
		} catch (e) {
			logger.error(`Unexpected error parsing response from GitHub: ${e.message ?? e}`);
			throw e;
		}
	} else {
		// either display the response message or the http status text
		let errorMessage = result.statusText;
		try {
			const json = await result.json();
			if (json.message) {
				errorMessage = json.message;
			}
		} catch (err) {
			// noop
		}
		logger.error(`Getting account info failed: ${errorMessage}`);
		throw new Error(errorMessage);
	}
}

export class GitHubServer implements IGitHubServer {
	friendlyName = 'GitHub';
	type = AuthProviderType.github;

	private _disposable: vscode.Disposable;
	private _uriHandler = new UriEventHandler(this._logger);

	constructor(_supportDeviceCodeFlow: boolean, private readonly _logger: Log) {
		this._disposable = vscode.window.registerUriHandler(this._uriHandler);
	}

	dispose() {
		this._disposable.dispose();
	}

	public async login(scopes: string): Promise<string> {
		this._logger.info(`Logging in for the following scopes: ${scopes}`);

		// Used for showing a friendlier message to the user when the explicitly cancel a flow.
		let userCancelled: boolean | undefined;
		try {
			return await this.doLoginWithPat(scopes);
		} catch (e) {
			this._logger.error(e);
			userCancelled = e.message ?? e === 'User Cancelled';
		}

		throw new Error(userCancelled ? 'Cancelled' : 'No auth flow succeeded.');
	}

	private async doLoginWithPat(scopes: string): Promise<string> {
		this._logger.info(`Trying to retrieve PAT... (${scopes})`);
		const token = await vscode.window.showInputBox({ prompt: 'GitHub Personal Access Token', ignoreFocusOut: true });
		if (!token) { throw new Error('User Cancelled'); }

		const tokenScopes = await getScopes(token, this.getServerUri('/'), this._logger); // Example: ['repo', 'user']
		const scopesList = scopes.split(' '); // Example: 'read:user repo user:email'
		if (!scopesList.every(scope => {
			const included = tokenScopes.includes(scope);
			if (included || !scope.includes(':')) {
				return included;
			}

			return scope.split(':').some(splitScopes => {
				return tokenScopes.includes(splitScopes);
			});
		})) {
			throw new Error(`The provided token does not match the requested scopes: ${scopes}`);
		}

		return token;
	}

	private getServerUri(path: string = '') {
		const apiUri = vscode.Uri.parse('https://api.github.com');
		return vscode.Uri.parse(`${apiUri.scheme}://${apiUri.authority}${path}`);
	}

	public getUserInfo(token: string): Promise<{ id: string; accountName: string }> {
		return getUserInfo(token, this.getServerUri('/user'), this._logger);
	}

	public async checkEnterpriseVersion(token: string): Promise<void> {
		try {

			const result = await fetch(this.getServerUri('/meta').toString(), {
				headers: {
					Authorization: `token ${token}`,
					'User-Agent': 'Visual-Studio-Code'
				}
			});

			if (!result.ok) {
				return;
			}

			/* __GDPR__
				"ghe-session" : {
					"owner": "TylerLeonhardt",
					"version": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
				}
			*/
		} catch {
			// No-op
		}
	}
}

export class GitHubEnterpriseServer implements IGitHubServer {
	friendlyName = 'GitHub Enterprise';
	type = AuthProviderType.githubEnterprise;

	constructor(private readonly _logger: Log) { }

	dispose() { }

	public async login(scopes: string): Promise<string> {
		this._logger.info(`Logging in for the following scopes: ${scopes}`);

		const token = await vscode.window.showInputBox({ prompt: 'GitHub Personal Access Token', ignoreFocusOut: true });
		if (!token) { throw new Error('Sign in failed: No token provided'); }

		const tokenScopes = await getScopes(token, this.getServerUri('/'), this._logger); // Example: ['repo', 'user']
		const scopesList = scopes.split(' '); // Example: 'read:user repo user:email'
		if (!scopesList.every(scope => {
			const included = tokenScopes.includes(scope);
			if (included || !scope.includes(':')) {
				return included;
			}

			return scope.split(':').some(splitScopes => {
				return tokenScopes.includes(splitScopes);
			});
		})) {
			throw new Error(`The provided token does not match the requested scopes: ${scopes}`);
		}

		return token;
	}

	private getServerUri(path: string = '') {
		const apiUri = vscode.Uri.parse(vscode.workspace.getConfiguration('github-enterprise').get<string>('uri') || '', true);
		return vscode.Uri.parse(`${apiUri.scheme}://${apiUri.authority}/api/v3${path}`);
	}

	public async getUserInfo(token: string): Promise<{ id: string; accountName: string }> {
		return getUserInfo(token, this.getServerUri('/user'), this._logger);
	}
}
