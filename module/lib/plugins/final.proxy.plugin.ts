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
import { ApigeeTemplatePlugin, PlugInResult, policyInsertPlaces, proxyEndpoint } from '../interfaces.js'

/**
 * Creates proxy endpoints for the template
 * @date 2/14/2022 - 8:14:22 AM
 *
 * @export
 * @class ProxiesPlugin
 * @typedef {ProxiesPlugin}
 * @implements {ApigeeTemplatePlugin}
 */
export class ProxyPlugin implements ApigeeTemplatePlugin {
  snippet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ProxyEndpoint name="default">
    <PreFlow name="PreFlow">
        <Request>
          {{#each preRequestPolicies}}
          <Step>
            <Name>{{this}}</Name>
          </Step>
          {{/each}}
        </Request>
        <Response>
          {{#each postRequestPolicies}}
          <Step>
            <Name>{{this}}</Name>
          </Step>
          {{/each}}
        </Response>
    </PreFlow>
    <Flows/>
    <PostFlow name="PostFlow">
        <Request>
          {{#each preResponsePolicies}}
          <Step>
            <Name>{{this}}</Name>
          </Step>
          {{/each}}          
        </Request>
        <Response>
          {{#each postResponsePolicies}}
          <Step>
            <Name>{{this}}</Name>
          </Step>
          {{/each}}              
        </Response>
    </PostFlow>
    <HTTPProxyConnection>
        <BasePath>{{basePath}}</BasePath>
    </HTTPProxyConnection>
    <RouteRule name="{{targetName}}">
        <TargetEndpoint>{{targetName}}</TargetEndpoint>
    </RouteRule>
</ProxyEndpoint>`;

  template = Handlebars.compile(this.snippet);

  /**
   * Apply template for proxy endpoints
   * @date 2/14/2022 - 8:15:04 AM
   *
   * @param {proxyEndpoint} inputConfig
   * @param {Map<string, object>} processingVars
   * @return {Promise<PlugInResult>}
   */
  applyTemplate(inputConfig: proxyEndpoint): Promise<PlugInResult> {
    return new Promise((resolve) => {
      const fileResult: PlugInResult = new PlugInResult(this.constructor.name)

      const preRequestPolicies: string[] = [];
      const postRequestPolicies: string[] = [];
      const preResponsePolicies: string[] = [];
      const postResponsePolicies: string[] = [];
  
      // Now collect all of our policies that should be triggered
      if (inputConfig.fileResults)
        for (let plugResult of inputConfig.fileResults) {
          for (let fileResult of plugResult.files) {
            if (fileResult.policyConfig) {
              for (let policyTrigger of fileResult.policyConfig.triggers) {
                if (policyTrigger == policyInsertPlaces.preRequest)
                  preRequestPolicies.push(fileResult.policyConfig.name);
                else if (policyTrigger == policyInsertPlaces.postRequest)
                  postRequestPolicies.push(fileResult.policyConfig.name);
                else if (policyTrigger == policyInsertPlaces.preResponse)
                  preResponsePolicies.push(fileResult.policyConfig.name);
                else if (policyTrigger == policyInsertPlaces.postResponse)
                  postResponsePolicies.push(fileResult.policyConfig.name);
              }
            }
          }
        }

      fileResult.files = [
        {
          path: '/proxies/' + inputConfig.name + '.xml',
          contents: this.template(
            {
              basePath: inputConfig.basePath,
              targetName: inputConfig.target.name,
              preRequestPolicies: preRequestPolicies,
              preResponsePolicies: preResponsePolicies,
              postRequestPolicies: postRequestPolicies,
              postResponsePolicies: postResponsePolicies,
            })
        }
      ]

      resolve(fileResult)
    })
  }
}
