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

import Handlebars from 'handlebars'
import { ApigeeTemplatePlugin, PlugInResult, proxyEndpoint } from '../interfaces.js'

/**
 * Creates shared flows for the template
 * @date 2/14/2022 - 8:14:22 AM
 *
 * @export
 * @class ProxiesPlugin
 * @typedef {SharedFlowPlugin}
 * @implements {ApigeeTemplatePlugin}
 */
export class FlowPlugin implements ApigeeTemplatePlugin {
  snippet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <SharedFlow name="default">
    {{#each preflow_request_policies}}
      <Step>
        <Name>{{this.name}}</Name>
      </Step>
    {{/each}}
  </SharedFlow>`;

  template = Handlebars.compile(this.snippet);

  /**
   * Apply template for proxy endpoints
   * @date 2/14/2022 - 8:15:04 AM
   *
   * @param {proxyEndpoint} inputConfig
   * @param {Map<string, object>} processingVars
   * @return {Promise<PlugInResult>}
   */
  applyTemplate(inputConfig: proxyEndpoint, processingVars: Map<string, object>): Promise<PlugInResult> {
    return new Promise((resolve) => {
    const fileResult: PlugInResult = new PlugInResult()
      fileResult.files = [
        {
          path: '/sharedflows/default.xml',
          contents: this.template(
            {
              preflow_request_policies: processingVars.get('preflow_request_policies')
            })
        }
      ]

      resolve(fileResult)
    })
  }
}
