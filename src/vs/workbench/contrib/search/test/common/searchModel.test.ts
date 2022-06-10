/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as sinon from 'sinon';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { IModelService } from 'vs/editor/common/services/model';
import { ModelService } from 'vs/editor/common/services/modelService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IFileMatch, IFolderQuery, ISearchComplete, ISearchProgressItem, ISearchQuery, ISearchService, ITextSearchMatch, OneLineRange, TextSearchMatch } from 'vs/workbench/services/search/common/search';
import { SearchModel } from 'vs/workbench/contrib/search/common/searchModel';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { FileService } from 'vs/platform/files/common/fileService';
import { NullLogService } from 'vs/platform/log/common/log';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';

const lineOneRange = new OneLineRange(1, 0, 1);

suite('SearchModel', () => {

	let instantiationService: TestInstantiationService;
	let restoreStubs: sinon.SinonStub[];

	const folderQueries: IFolderQuery[] = [
		{ folder: URI.parse('file://c:/') }
	];

	setup(() => {
		restoreStubs = [];
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IModelService, stubModelService(instantiationService));
		instantiationService.stub(ISearchService, {});
		instantiationService.stub(ISearchService, 'textSearch', Promise.resolve({ results: [] }));
		instantiationService.stub(IUriIdentityService, new UriIdentityService(new FileService(new NullLogService())));

		const config = new TestConfigurationService();
		config.setUserConfiguration('search', { searchOnType: true });
		instantiationService.stub(IConfigurationService, config);
	});

	teardown(() => {
		restoreStubs.forEach(element => {
			element.restore();
		});
	});

	function searchServiceWithResults(results: IFileMatch[], complete: ISearchComplete | null = null): ISearchService {
		return <ISearchService>{
			textSearch(query: ISearchQuery, token?: CancellationToken, onProgress?: (result: ISearchProgressItem) => void): Promise<ISearchComplete> {
				return new Promise(resolve => {
					queueMicrotask(() => {
						results.forEach(onProgress!);
						resolve(complete!);
					});
				});
			}
		};
	}

	function canceleableSearchService(tokenSource: CancellationTokenSource): ISearchService {
		return <ISearchService>{
			textSearch(query: ISearchQuery, token?: CancellationToken, onProgress?: (result: ISearchProgressItem) => void): Promise<ISearchComplete> {
				if (token) {
					token.onCancellationRequested(() => tokenSource.cancel());
				}

				return new Promise(resolve => {
					queueMicrotask(() => {
						resolve(<any>{});
					});
				});
			}
		};
	}

	test('Search Model: Search adds to results', async () => {
		const results = [
			aRawMatch('file://c:/1',
				new TextSearchMatch('preview 1', new OneLineRange(1, 1, 4)),
				new TextSearchMatch('preview 1', new OneLineRange(1, 4, 11))),
			aRawMatch('file://c:/2', new TextSearchMatch('preview 2', lineOneRange))];
		instantiationService.stub(ISearchService, searchServiceWithResults(results));

		const testObject: SearchModel = instantiationService.createInstance(SearchModel);
		await testObject.search({ contentPattern: { pattern: 'somestring' }, type: 1, folderQueries });

		const actual = testObject.searchResult.matches();

		assert.strictEqual(2, actual.length);
		assert.strictEqual('file://c:/1', actual[0].resource.toString());

		let actuaMatches = actual[0].matches();
		assert.strictEqual(2, actuaMatches.length);
		assert.strictEqual('preview 1', actuaMatches[0].text());
		assert.ok(new Range(2, 2, 2, 5).equalsRange(actuaMatches[0].range()));
		assert.strictEqual('preview 1', actuaMatches[1].text());
		assert.ok(new Range(2, 5, 2, 12).equalsRange(actuaMatches[1].range()));

		actuaMatches = actual[1].matches();
		assert.strictEqual(1, actuaMatches.length);
		assert.strictEqual('preview 2', actuaMatches[0].text());
		assert.ok(new Range(2, 1, 2, 2).equalsRange(actuaMatches[0].range()));
	});

	test('Search Model: Search results are cleared during search', async () => {
		const results = [
			aRawMatch('file://c:/1',
				new TextSearchMatch('preview 1', new OneLineRange(1, 1, 4)),
				new TextSearchMatch('preview 1', new OneLineRange(1, 4, 11))),
			aRawMatch('file://c:/2',
				new TextSearchMatch('preview 2', lineOneRange))];
		instantiationService.stub(ISearchService, searchServiceWithResults(results));
		const testObject: SearchModel = instantiationService.createInstance(SearchModel);
		await testObject.search({ contentPattern: { pattern: 'somestring' }, type: 1, folderQueries });
		assert.ok(!testObject.searchResult.isEmpty());

		instantiationService.stub(ISearchService, searchServiceWithResults([]));

		testObject.search({ contentPattern: { pattern: 'somestring' }, type: 1, folderQueries });
		assert.ok(testObject.searchResult.isEmpty());
	});

	test('Search Model: Previous search is cancelled when new search is called', async () => {
		const tokenSource = new CancellationTokenSource();
		instantiationService.stub(ISearchService, canceleableSearchService(tokenSource));
		const testObject: SearchModel = instantiationService.createInstance(SearchModel);

		testObject.search({ contentPattern: { pattern: 'somestring' }, type: 1, folderQueries });
		instantiationService.stub(ISearchService, searchServiceWithResults([]));
		testObject.search({ contentPattern: { pattern: 'somestring' }, type: 1, folderQueries });

		assert.ok(tokenSource.token.isCancellationRequested);
	});

	test('getReplaceString returns proper replace string for regExpressions', async () => {
		const results = [
			aRawMatch('file://c:/1',
				new TextSearchMatch('preview 1', new OneLineRange(1, 1, 4)),
				new TextSearchMatch('preview 1', new OneLineRange(1, 4, 11)))];
		instantiationService.stub(ISearchService, searchServiceWithResults(results));

		const testObject: SearchModel = instantiationService.createInstance(SearchModel);
		await testObject.search({ contentPattern: { pattern: 're' }, type: 1, folderQueries });
		testObject.replaceString = 'hello';
		let match = testObject.searchResult.matches()[0].matches()[0];
		assert.strictEqual('hello', match.replaceString);

		await testObject.search({ contentPattern: { pattern: 're', isRegExp: true }, type: 1, folderQueries });
		match = testObject.searchResult.matches()[0].matches()[0];
		assert.strictEqual('hello', match.replaceString);

		await testObject.search({ contentPattern: { pattern: 're(?:vi)', isRegExp: true }, type: 1, folderQueries });
		match = testObject.searchResult.matches()[0].matches()[0];
		assert.strictEqual('hello', match.replaceString);

		await testObject.search({ contentPattern: { pattern: 'r(e)(?:vi)', isRegExp: true }, type: 1, folderQueries });
		match = testObject.searchResult.matches()[0].matches()[0];
		assert.strictEqual('hello', match.replaceString);

		await testObject.search({ contentPattern: { pattern: 'r(e)(?:vi)', isRegExp: true }, type: 1, folderQueries });
		testObject.replaceString = 'hello$1';
		match = testObject.searchResult.matches()[0].matches()[0];
		assert.strictEqual('helloe', match.replaceString);
	});

	function aRawMatch(resource: string, ...results: ITextSearchMatch[]): IFileMatch {
		return { resource: URI.parse(resource), results };
	}

	function stubModelService(instantiationService: TestInstantiationService): IModelService {
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IThemeService, new TestThemeService());
		return instantiationService.createInstance(ModelService);
	}

});
