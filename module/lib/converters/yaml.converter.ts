/**
 * Copyright 2022 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import yaml from 'js-yaml'
import { ApigeeConverterPlugin, ApigeeTemplateInput } from '../interfaces.js'

/**
 * Converter from OpenAPI spec v3 format to ApigeeTemplateInput
 * @date 2/11/2022 - 10:36:31 AM
 *
 * @export
 * @class OpenApiV3Converter
 * @typedef {OpenApiV3Converter}
 * @implements {ApigeeConverterPlugin}
 */
export class YamlConverter implements ApigeeConverterPlugin {
  /**
   * Converts input string in OpenAPI v3 YAML format to ApigeeTemplateInput (if possible)
   * @date 2/11/2022 - 10:36:51 AM
   *
   * @param {string} input Input string in OpenAPI v3 YAML format
   * @return {Promise<ApigeeTemplateInput>} ApigeeTemplateInput object (or undefined if not possible to convert)
   */
  convertInput(input: string): Promise<ApigeeTemplateInput> {
    return new Promise((resolve, reject) => {
      let result: ApigeeTemplateInput

      try {
        const inputData: any = yaml.load(input)

        if (inputData && inputData.name && ((inputData.endpoints || inputData.sharedFlow))) {
          result = inputData as ApigeeTemplateInput
          resolve(result)
        } else {
          reject(new Error('Conversion not possible'))
        }
      } catch (error) {
        reject(error)
      }
    })
  }
}
