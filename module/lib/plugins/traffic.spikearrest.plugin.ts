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
import { ApigeeTemplatePlugin, proxyEndpoint, PlugInResult, RunPoint } from '../interfaces.js'

/**
 * Plugin for templating spike arrests
 * @date 2/14/2022 - 8:21:02 AM
 *
 * @export
 * @class SpikeArrestPlugin
 * @typedef {SpikeArrestPlugin}
 * @implements {ApigeeTemplatePlugin}
 */
export class SpikeArrestPlugin implements ApigeeTemplatePlugin {
  snippet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
  <SpikeArrest continueOnError="false" enabled="true" name="SA-SpikeArrest">
      <DisplayName>SA-SpikeArrest</DisplayName>
      <Properties/>
      <Identifier ref="request.header.some-header-name"/>
      <MessageWeight ref="request.header.weight"/>
      <Rate>{{rate}}</Rate>
  </SpikeArrest>`;

  template = Handlebars.compile(this.snippet);

  /**
   * Applies the template logic for spike arrests
   * @date 2/14/2022 - 8:21:23 AM
   *
   * @param {proxyEndpoint} inputConfig
   * @param {Map<string, object>} processingVars
   * @return {Promise<PlugInResult>}
   */
  applyTemplate (inputConfig: proxyEndpoint): Promise<PlugInResult> {
    return new Promise((resolve) => {
      const fileResult: PlugInResult = new PlugInResult(this.constructor.name)

      if (inputConfig.spikeArrest) {
        fileResult.files = [
          {
            policyConfig: {
              name: 'SA-SpikeArrest',
              flowRunPoints: [
                {
                  name: "QuotaStart",
                  flowCondition: '',
                  stepCondition: '',
                  runPoints: [RunPoint.preRequest]
                }
              ]
            },
            path: '/policies/SA-SpikeArrest.xml',
            contents: this.template({
              rate: inputConfig.spikeArrest.rate
            })
          }
        ];
      }

      resolve(fileResult)
    })
  }
}
