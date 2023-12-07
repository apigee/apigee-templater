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
import { ApigeeTemplatePlugin, PlugInResult, FlowRunPoint, RunPoint, proxyEndpoint } from '../interfaces.js'

class Step {
  name: string = "";
  condition: string = "";

  constructor(name: string, condition: string) {
    this.name = name;
    this.condition = condition;
  }
}

/**
 * Plugin for generating targets
 * @date 2/14/2022 - 8:15:26 AM
 *
 * @export
 * @class TargetsPlugin
 * @typedef {TargetsPlugin}
 * @implements {ApigeeTemplatePlugin}
 */
export class TargetsPlugin implements ApigeeTemplatePlugin {
  snippet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<TargetEndpoint name="{{targetName}}">
    <PreFlow name="PreFlow">
        <Request>
          {{#if preflow_request_assign}}
          <Step>
            <Name>AM-SetAutoTargetHeaders</Name>
          </Step>
          {{/if}}
          {{#each preTargetPolicies}}
          <Step>
            <Name>{{this.name}}</Name>
            {{#if this.condition}}
            <Condition>{{this.condition}}</Condition>
            {{/if}}
          </Step>
          {{/each}}          
        </Request>
        <Response />
    </PreFlow>
    <Flows/>
    <PostFlow name="PostFlow">
        <Request>
        </Request>
        <Response>
          {{#each postTargetPolicies}}
          <Step>
            <Name>{{this.name}}</Name>
            {{#if this.condition}}
            <Condition>{{this.condition}}</Condition>
            {{/if}}
          </Step>
          {{/each}}
        </Response>
    </PostFlow>
    <HTTPTargetConnection>
        <URL>{{targetUrl}}</URL>
    </HTTPTargetConnection>
</TargetEndpoint>`;

  preFlowAssignMessageSnippet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<AssignMessage continueOnError="false" enabled="true" name="AM-SetAutoTargetHeaders">
  <DisplayName>AM-SetAutoTargetHeaders</DisplayName>
  <Properties/>
  <Set>
    <Headers>
    {{#each headers}}
      <Header name="{{@key}}">{{this}}</Header>
    {{/each}}    
    </Headers>
  </Set>
  <IgnoreUnresolvedVariables>true</IgnoreUnresolvedVariables>
  <AssignTo createNew="false" transport="http" type="request"/>
</AssignMessage>
`;

  template = Handlebars.compile(this.snippet);
  messageAssignTemplate = Handlebars.compile(this.preFlowAssignMessageSnippet);

  /**
   * Templates the targets configurations
   * @date 2/14/2022 - 8:15:57 AM
   *
   * @param {proxyEndpoint} inputConfig
   * @param {Map<string, object>} processingVars
   * @return {Promise<PlugInResult>}
   */
  applyTemplate(inputConfig: proxyEndpoint): Promise<PlugInResult> {
    return new Promise((resolve) => {
      const fileResult: PlugInResult = new PlugInResult(this.constructor.name)

      if (inputConfig.target) {

        const preTargetPolicies: Step[] = [];
        const postTargetPolicies: Step[] = [];
    
        // Now collect all of our policies that should be triggered
        if (inputConfig.fileResults)
          for (let plugResult of inputConfig.fileResults) {
            for (let fileResult of plugResult.files) {
              if (fileResult.policyConfig) {
                for (let flowRunPoint of fileResult.policyConfig.flowRunPoints) {
                  for(let runPoint of flowRunPoint.runPoints)
                    if (runPoint == RunPoint.preTarget)
                      preTargetPolicies.push(new Step(fileResult.policyConfig.name, flowRunPoint.stepCondition));
                    else if (runPoint == RunPoint.postTarget)
                      postTargetPolicies.push(new Step(fileResult.policyConfig.name, flowRunPoint.stepCondition));
                }
              }
            }
          }

        // Make sure the target has the https prefix
        if (inputConfig.target.url && !inputConfig.target.url.startsWith("http")) {
          inputConfig.target.url = "https://" + inputConfig.target.url;
        }

        let context: any = { 
          targetName: inputConfig.target.name, 
          targetUrl: inputConfig.target.url, 
          preflow_request_assign: (inputConfig.target.headers && Object.keys(inputConfig.target.headers).length > 0),
          preTargetPolicies: preTargetPolicies,
          postTargetPolicies: postTargetPolicies
        };

        fileResult.files = [
          {
            path: '/targets/' + inputConfig.target.name + '.xml',
            contents: this.template(context)
          }
        ];

        if (context.preflow_request_assign) {
          let assignContext: any = {
            headers: inputConfig.target.headers
          };

          fileResult.files.push({
            path: "/policies/AM-SetAutoTargetHeaders.xml",
            contents: this.messageAssignTemplate(assignContext)
          });
        }
      }

      resolve(fileResult)
    })
  }
}
