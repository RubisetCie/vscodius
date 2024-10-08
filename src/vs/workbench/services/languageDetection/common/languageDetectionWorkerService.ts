/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const ILanguageDetectionService = createDecorator<ILanguageDetectionService>('ILanguageDetectionService');

export const LanguageDetectionLanguageEventSource = 'languageDetection';

export interface ILanguageDetectionService {
	readonly _serviceBrand: undefined;

	/**
	 * @param languageId The languageId to check if language detection is currently enabled.
	 * @returns whether or not language detection is on for this language.
	 */
	isEnabledForLanguage(languageId: string): boolean;

	/**
	 * @param resource The resource to detect the language for.
	 * @param supportedLangs Optional. When populated, the model will only return languages from the provided list
	 * @returns the language id for the given resource or undefined if the model is not confident enough.
	 */
	detectLanguage(resource: URI, supportedLangs?: string[]): Promise<string | undefined>;
}

export type LanguageDetectionHintConfig = {
	untitledEditors: boolean;
	notebookEditors: boolean;
};
