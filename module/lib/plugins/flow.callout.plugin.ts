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
import { ApigeeTemplatePlugin, proxyEndpoint, PlugInResult, FlowRunPoint } from '../interfaces.js'

export class FlowCalloutConfig {
  flowName: string = "";
  continueOnError: boolean = true;
  flowRunPoints: FlowRunPoint[] = [];
}

/**
 * Plugin for making shared flow callouts
 * @date 2/14/2022 - 8:17:36 AM
 *
 * @export
 * @class FlowCalloutPlugin
 * @typedef {FlowCalloutPlugin}
 * @implements {FlowCalloutPlugin}
 */
export class FlowCalloutPlugin implements ApigeeTemplatePlugin {
  
  sharedFlowSnippet = `
<FlowCallout continueOnError="{{contiueOnError}}" enabled="true" name="FC-{{flowName}}">
  <DisplayName>FC-{{flowName}}</DisplayName>
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
  applyTemplate (inputConfig: proxyEndpoint, additionalData?: any): Promise<PlugInResult> {
    return new Promise((resolve) => {
      const fileResult: PlugInResult = new PlugInResult(this.constructor.name);

      let config: FlowCalloutConfig = additionalData;

      fileResult.files.push({
        policyConfig: {
          name: "FC-" + config.flowName,
          flowRunPoints: config.flowRunPoints
        },
        path: '/policies/FC-' + config.flowName + '.xml',
        contents: this.template(config)
      });

      resolve(fileResult)
    })
  }
}
