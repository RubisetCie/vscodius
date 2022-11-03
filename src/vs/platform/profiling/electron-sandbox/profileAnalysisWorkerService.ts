/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { DefaultWorkerFactory } from 'vs/base/browser/defaultWorkerFactory';
import { URI } from 'vs/base/common/uri';
import { SimpleWorkerClient } from 'vs/base/common/worker/simpleWorker';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IV8Profile } from 'vs/platform/profiling/common/profiling';
import { BottomUpSample } from 'vs/platform/profiling/common/profilingModel';


export const enum ProfilingOutput {
	Failure,
	Irrelevant,
	Interesting,
}

export interface IScriptUrlClassifier {
	(scriptUrl: string): string;
}

export const IProfileAnalysisWorkerService = createDecorator<IProfileAnalysisWorkerService>('IProfileAnalysisWorkerService');

export interface IProfileAnalysisWorkerService {
	readonly _serviceBrand: undefined;
	analyseBottomUp(profile: IV8Profile, callFrameClassifier: IScriptUrlClassifier, perfBaseline: number): Promise<ProfilingOutput>;
	analyseByLocation(profile: IV8Profile, locations: [location: URI, id: string][]): Promise<[category: string, aggregated: number][]>;
}


// ---- impl

class ProfileAnalysisWorkerService implements IProfileAnalysisWorkerService {

	declare _serviceBrand: undefined;

	private readonly _workerFactory = new DefaultWorkerFactory('CpuProfileAnalysis');

	constructor() {}

	private async _withWorker<R>(callback: (worker: Proxied<IProfileAnalysisWorker>) => Promise<R>): Promise<R> {

		const worker = new SimpleWorkerClient<Proxied<IProfileAnalysisWorker>, {}>(
			this._workerFactory,
			'vs/platform/profiling/electron-sandbox/profileAnalysisWorker',
			{ /* host */ }
		);

		try {
			const r = await callback(await worker.getProxyObject());
			return r;
		} finally {
			worker.dispose();
		}
	}

	async analyseBottomUp(profile: IV8Profile, callFrameClassifier: IScriptUrlClassifier, perfBaseline: number): Promise<ProfilingOutput> {
		return this._withWorker(async worker => {
			const result = await worker.analyseBottomUp(profile);
			return result.kind;
		});
	}

	async analyseByLocation(profile: IV8Profile, locations: [location: URI, id: string][]): Promise<[category: string, aggregated: number][]> {
		return this._withWorker(async worker => {
			const result = await worker.analyseByUrlCategory(profile, locations);
			return result;
		});
	}
}

// ---- worker contract

export interface BottomUpAnalysis {
	kind: ProfilingOutput;
	samples: BottomUpSample[];
}

export interface CategoryAnalysis {
	category: string;
	percentage: number;
	aggregated: number;
	overallDuration: number;
}

export interface IProfileAnalysisWorker {
	analyseBottomUp(profile: IV8Profile): BottomUpAnalysis;
	analyseByUrlCategory(profile: IV8Profile, categories: [url: URI, category: string][]): [category: string, aggregated: number][];
}

// TODO@jrieken move into worker logic
type Proxied<T> = { [K in keyof T]: T[K] extends (...args: infer A) => infer R
	? (...args: A) => Promise<Awaited<R>>
	: never
};


registerSingleton(IProfileAnalysisWorkerService, ProfileAnalysisWorkerService, InstantiationType.Delayed);
