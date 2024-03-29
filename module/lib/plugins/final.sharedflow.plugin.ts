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
import { ApigeeTemplatePlugin, PlugInResult, RunPoint, FlowStep, proxyEndpoint } from '../interfaces.js'

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
    {{#each preRequestPolicies}}
    <Step>
      <Name>{{this.name}}</Name>
      {{#if this.condition}}
      <Condition>{{this.condition}}</Condition>
      {{/if}}
    </Step>
    {{/each}}
    {{#each postRequestPolicies}}
    <Step>
      <Name>{{this.name}}</Name>
      {{#if this.condition}}
      <Condition>{{this.condition}}</Condition>
      {{/if}}
    </Step>
    {{/each}}
    {{#each preResponsePolicies}}
    <Step>
      <Name>{{this.name}}</Name>
      {{#if this.condition}}
      <Condition>{{this.condition}}</Condition>
      {{/if}}
    </Step>
    {{/each}}
    {{#each postResponsePolicies}}
    <Step>
      <Name>{{this.name}}</Name>
      {{#if this.condition}}
      <Condition>{{this.condition}}</Condition>
      {{/if}}
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
  applyTemplate(inputConfig: proxyEndpoint): Promise<PlugInResult> {
    return new Promise((resolve) => {
      const fileResult: PlugInResult = new PlugInResult(this.constructor.name);
      
      const preRequestPolicies: FlowStep[] = [];
      const postRequestPolicies: FlowStep[] = [];
      const preResponsePolicies: FlowStep[] = [];
      const postResponsePolicies: FlowStep[] = [];

      // Now collect all of our policies that should be triggered
      if (inputConfig.fileResults)
        for (let plugResult of inputConfig.fileResults) {
          for (let fileResult of plugResult.files) {
            if (fileResult.policyConfig) {
              for (let policyRunPoint of fileResult.policyConfig.flowRunPoints) {
                for (let point of policyRunPoint.runPoints) {
                  if (point == RunPoint.preRequest)
                    preRequestPolicies.push(new FlowStep(fileResult.policyConfig.name, policyRunPoint.stepCondition));
                  else if (point == RunPoint.postRequest)
                    postRequestPolicies.push(new FlowStep(fileResult.policyConfig.name, policyRunPoint.stepCondition));
                  else if (point == RunPoint.preResponse)
                    preResponsePolicies.push(new FlowStep(fileResult.policyConfig.name, policyRunPoint.stepCondition));
                  else if (point == RunPoint.postResponse)
                    postResponsePolicies.push(new FlowStep(fileResult.policyConfig.name, policyRunPoint.stepCondition));
                }
              }
            }
          }
        }

      fileResult.files = [
        {
          path: '/sharedflows/default.xml',
          contents: this.template(
            {
              preRequestPolicies: preRequestPolicies,
              postRequestPolicies: postRequestPolicies,
              preResponsePolicies: preResponsePolicies,
              postResponsePolicies: postResponsePolicies
            })
        }
      ]

      resolve(fileResult)
    });
  }
}
