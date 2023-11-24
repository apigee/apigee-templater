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
import { ApigeeTemplatePlugin, proxyEndpoint, PlugInResult, policyInsertPlaces } from '../interfaces.js'

/**
 * Plugin for traffic quota templating
 * @date 2/14/2022 - 8:17:36 AM
 *
 * @export
 * @class ExtractVariablesPlugin
 * @typedef {ExtractVariablesPlugin}
 * @implements {ApigeeTemplatePlugin}
 */
export class ExtractVariablesPlugin implements ApigeeTemplatePlugin {
    
  snippet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ExtractVariables continueOnError="false" enabled="true" name="EV-{{name}}">
  <DisplayName>EV-{{name}}</DisplayName>
  <URIPath>
{{#each URIPaths}}
    <Pattern ignoreCase="{{this.ignoreCase}}">{{this.pattern}}</Pattern>
{{/each}}
  </URIPath>
{{#each URIPaths}}
  <QueryParam name="{{this.name}}">
    <Pattern ignoreCase="{{this.ignoreCase}}">{{this.pattern}}</Pattern>
  </QueryParam>  
{{/each}}
{{#each headers}}
  <Header name="{{this.name}}">
    <Pattern ignoreCase="{{this.ignoreCase}}">{{this.pattern}}</Pattern>
  </Header>  
{{/each}}
{{#each formParams}}
  <FormParam name="{{this.name}}">
    <Pattern>{{this.pattern}}</Pattern>
  </FormParam>
{{/each}}
{{#each variables}}
  <FormParam name="{{this.name}}">
    <Pattern>{{this.pattern}}</Pattern>
  </FormParam>
{{/each}}
{{#each JSONPaths}}
  <JSONPayload>
    <Variable name="{{this.name}}">
      <JSONPath>{{this.path}}</JSONPath>
    </Variable>
  </JSONPayload>
{{/each}}
{{#each XMLPaths}}
  <XMLPayload stopPayloadProcessing="false">
    <Namespaces/>
    <Variable name="{{this.name}}" type="{{this.type}}">
      <XPath>{{this.path}}</XPath>
    </Variable>
  </XMLPayload>
{{/each}}
  <Source clearPayload="false">message</Source>
  <VariablePrefix>{{prefix}}</VariablePrefix>
  <IgnoreUnresolvedVariables>{{ignoreUnresolved}}</IgnoreUnresolvedVariables>
</ExtractVariables>`;

  template = Handlebars.compile(this.snippet);

  /**
   * Applies the template logic for traffic quotas
   * @date 2/14/2022 - 8:18:32 AM
   *
   * @param {proxyEndpoint} inputConfig
   * @param {Map<string, any>} processingVars
   * @return {Promise<PlugInResult>}
   */
  applyTemplate (inputConfig: proxyEndpoint): Promise<PlugInResult> {
    return new Promise((resolve) => {
      const fileResult: PlugInResult = new PlugInResult(this.constructor.name)

      if (inputConfig.quotas && inputConfig.quotas.length > 0) {
        fileResult.files = []
        for (const i in inputConfig.quotas) {
          if (inputConfig.quotas[i].count > 0) {
            fileResult.files.push({
              policyConfig: {
                name: 'Quota-' + (Number(i) + 1).toString(),
                triggers: [policyInsertPlaces.preRequest]
              },
              path: '/policies/Quota-' + (Number(i) + 1).toString() + '.xml',
              contents: this.template({
                index: (Number(i) + 1),
                count: inputConfig.quotas[i].count,
                timeUnit: inputConfig.quotas[i].timeUnit
              })
            });
          }
        }
      }

      resolve(fileResult)
    })
  }
}
