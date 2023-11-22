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
              <Name>Set-Target-Message</Name>
            </Step>
          {{/if}}
        </Request>
        <Response/>
    </PreFlow>
    <Flows/>
    <PostFlow name="PostFlow">
        <Request>
        {{#each pre_flows}}
          <Step>
            <Name>FC-{{this}}</Name>
          </Step>
        {{/each}}
        </Request>
        <Response>
        {{#each post_flows}}
          <Step>
            <Name>{{FC-this}}</Name>
          </Step>
        {{/each}}
        </Response>
    </PostFlow>
    <HTTPTargetConnection>
        <URL>{{targetUrl}}</URL>
    </HTTPTargetConnection>
</TargetEndpoint>`;

  preFlowAssignMessageSnippet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<AssignMessage continueOnError="false" enabled="true" name="Set-Target-Message">
  <DisplayName>Set-Target-Message</DisplayName>
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

  sharedFlowSnippet = `
<FlowCallout continueOnError="false" enabled="true" name="FC-{{flowName}}">
  <DisplayName>FC-{{flowName}}</DisplayName>
  <Parameters/>
  <SharedFlowBundle>{{flowName}}</SharedFlowBundle>
</FlowCallout>
  `;

  template = Handlebars.compile(this.snippet);
  messageAssignTemplate = Handlebars.compile(this.preFlowAssignMessageSnippet);
  sharedFlowTemplate = Handlebars.compile(this.sharedFlowSnippet);
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
      const fileResult: PlugInResult = new PlugInResult()

      if (inputConfig.target) {

        // Make sure the target has the https prefix
        if (inputConfig.target.url && !inputConfig.target.url.startsWith("http")) {
          inputConfig.target.url = "https://" + inputConfig.target.url;
        }

        let context: any = { 
          targetName: inputConfig.target.name, 
          targetUrl: inputConfig.target.url, 
          preflow_request_assign: (inputConfig.target.headers && Object.keys(inputConfig.target.headers).length > 0),
          pre_flows: inputConfig.target.preFlows,
          post_flows: inputConfig.target.postFlows
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
            path: "/policies/Set-Target-Message.xml",
            contents: this.messageAssignTemplate(assignContext)
          });
        }
      }

      resolve(fileResult)
    })
  }
}
