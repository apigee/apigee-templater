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
import { ApigeeTemplatePlugin, proxyEndpoint, PlugInResult } from '../interfaces.js'

/**
 * Plugin for traffic quota templating
 * @date 2/14/2022 - 8:17:36 AM
 *
 * @export
 * @class QuotaPlugin
 * @typedef {QuotaPlugin}
 * @implements {ApigeeTemplatePlugin}
 */
export class FlowCalloutPlugin implements ApigeeTemplatePlugin {
  
  sharedFlowSnippet = `
<FlowCallout continueOnError="false" enabled="true" name="FC-{{flowName}}">
  <DisplayName>FC-{{flowName}}</DisplayName>
  <Parameters/>
  <SharedFlowBundle>{{flowName}}</SharedFlowBundle>
</FlowCallout>
  `;


  template = Handlebars.compile(this.sharedFlowSnippet);

  /**
   * Applies the template logic for traffic quotas
   * @date 2/14/2022 - 8:18:32 AM
   *
   * @param {proxyEndpoint} inputConfig
   * @param {Map<string, any>} processingVars
   * @return {Promise<PlugInResult>}
   */
  applyTemplate (inputConfig: proxyEndpoint, processingVars: Map<string, object>): Promise<PlugInResult> {
    return new Promise((resolve) => {
      const fileResult: PlugInResult = new PlugInResult()

      // Now set pre target flow callouts
      if (inputConfig.target.preFlows && inputConfig.target.preFlows.length > 0) {
        for (const flow of inputConfig.target.preFlows) {
          fileResult.files.push({
            path: "/policies/FC-" + flow + ".xml",
            contents: this.template({flowName: flow})
          });
        }
      }

      // Now set post target flow callouts
      if (inputConfig.target.postFlows && inputConfig.target.postFlows.length > 0) {
        for (const flow of inputConfig.target.postFlows) {
          fileResult.files.push({
            path: "/policies/FC-" + flow + ".xml",
            contents: this.template({flowName: flow})
          });
        }          
      }

      resolve(fileResult)
    })
  }
}
