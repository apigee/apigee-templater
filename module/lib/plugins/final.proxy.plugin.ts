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
import { ApigeeTemplatePlugin, PlugInResult, RunPoint, FlowStep, ConditionalFlowSteps, proxyEndpoint } from '../interfaces.js'

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

    <FaultRules>
        {{#each faultRulePolicies}}
        <FaultRule name="this.name">
            <Step>
                <Name>{{this.name}}</Name>
            </Step>
            {{#if this.condition}}
            <Condition>{{this.condition}}</Condition>
            {{/if}}
        </FaultRule>
        {{/each}}
    </FaultRules>

    <PreFlow name="PreFlow">
        <Request>
            {{#each preRequestPolicies}}
            <Step>
              <Name>{{this.name}}</Name>
              {{#if this.condition}}
              <Condition>{{this.condition}}</Condition>
              {{/if}}
            </Step>
            {{/each}}
        </Request>
        <Response>
            {{#each postRequestPolicies}}
            <Step>
              <Name>{{this.name}}</Name>
              {{#if this.condition}}
              <Condition>{{this.condition}}</Condition>
              {{/if}}
            </Step>
            {{/each}}
        </Response>
    </PreFlow>

    <Flows>
    {{#each conditionalFlowPolicies}}
      <Flow name="{{this.name}}">
        <Request>
          {{#each this.requestSteps}}
          <Step>
              <Name>{{this.name}}</Name>
              {{#if this.condition}}
              <Condition>{{this.condition}}</Condition>
              {{/if}}
          </Step>
          {{/each}}
        </Request>
        <Response>
          {{#each this.responseSteps}}
          <Step>
              <Name>{{this.name}}</Name>
              {{#if this.condition}}
              <Condition>{{this.condition}}</Condition>
              {{/if}}
          </Step>
          {{/each}}
        </Response>
        <Condition>{{@key}}</Condition>
      </Flow>
    {{/each}}
    </Flows>
    
    <PostFlow name="PostFlow">
        <Request>
            {{#each preResponsePolicies}}
            <Step>
                <Name>{{this.name}}</Name>
                {{#if this.condition}}
                <Condition>{{this.condition}}</Condition>
                {{/if}}
            </Step>
            {{/each}}          
        </Request>
        <Response>
            {{#each postResponsePolicies}}
            <Step>
                <Name>{{this.name}}</Name>
                {{#if this.condition}}
                <Condition>{{this.condition}}</Condition>
                {{/if}}
            </Step>
            {{/each}}              
        </Response>
    </PostFlow>

    <PostClientFlow name="PostClientFlow">
        <Response>
            {{#each postClientResponsePolicies}}
            <Step>
              <Name>{{this.name}}</Name>
            </Step>
            {{/each}}              
        </Response>
    </PostClientFlow>

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

      const preRequestPolicies: FlowStep[] = [];
      const postRequestPolicies: FlowStep[] = [];
      const faultRulePolicies: FlowStep[] = [];
      const conditionalFlowPolicies: { [key: string]: ConditionalFlowSteps } = {};
      const preResponsePolicies: FlowStep[] = [];
      const postResponsePolicies: FlowStep[] = [];
      const postClientResponsePolicies: FlowStep[] = [];

      let conditionalFlowCounter = 0;
      // Now collect all of our policies that should be triggered
      if (inputConfig.fileResults)
        for (let plugResult of inputConfig.fileResults) {
          for (let fileResult of plugResult.files) {
            if (fileResult.policyConfig) {
              for (let policyRunPoint of fileResult.policyConfig.flowRunPoints) {

                if (policyRunPoint.flowCondition) {
                  if (!conditionalFlowPolicies[policyRunPoint.flowCondition]) {
                    conditionalFlowCounter++;
                    let conditionName = policyRunPoint.name;
                    if (!conditionName) conditionName = "CFlow_" + conditionalFlowCounter.toString();

                    conditionalFlowPolicies[policyRunPoint.flowCondition] = new ConditionalFlowSteps(conditionName);
                  }
                  
                  for (let point of policyRunPoint.runPoints) {
                    if (point == RunPoint.preRequest || point == RunPoint.preResponse)
                      conditionalFlowPolicies[policyRunPoint.flowCondition].requestSteps.push(new FlowStep(fileResult.policyConfig.name, policyRunPoint.stepCondition));
                    else if (point == RunPoint.postRequest || point == RunPoint.postResponse)
                      conditionalFlowPolicies[policyRunPoint.flowCondition].responseSteps.push(new FlowStep(fileResult.policyConfig.name, policyRunPoint.stepCondition));
                  }
                }
                else {
                  for (let point of policyRunPoint.runPoints) {
                    if (point == RunPoint.preRequest)
                      preRequestPolicies.push(new FlowStep(fileResult.policyConfig.name, policyRunPoint.stepCondition));
                    else if (point == RunPoint.postRequest)
                      postRequestPolicies.push(new FlowStep(fileResult.policyConfig.name, policyRunPoint.stepCondition));
                    else if (point == RunPoint.preResponse)
                      preResponsePolicies.push(new FlowStep(fileResult.policyConfig.name, policyRunPoint.stepCondition));
                    else if (point == RunPoint.postResponse)
                      postResponsePolicies.push(new FlowStep(fileResult.policyConfig.name, policyRunPoint.stepCondition));
                    else if (point == RunPoint.postClientResponse)
                      postClientResponsePolicies.push(new FlowStep(fileResult.policyConfig.name, policyRunPoint.stepCondition));
                    else if (point == RunPoint.endpointFault)
                      faultRulePolicies.push(new FlowStep(fileResult.policyConfig.name, policyRunPoint.stepCondition));
                  }
                }
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
              conditionalFlowPolicies: conditionalFlowPolicies,
              preRequestPolicies: preRequestPolicies,
              preResponsePolicies: preResponsePolicies,
              postRequestPolicies: postRequestPolicies,
              postResponsePolicies: postResponsePolicies,
              postClientResponsePolicies: postClientResponsePolicies,
              faultRulePolicies: faultRulePolicies
            })
        }
      ]

      resolve(fileResult)
    })
  }
}
