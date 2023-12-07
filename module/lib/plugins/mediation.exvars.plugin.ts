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

export class ExtractVariablesConfig {
  type: string = "";
  name: string = "";
  flowRunPoints: FlowRunPoint[] = [];
  ignoreUnresolvedVariables: boolean = true;
  URIPaths: PatternConfig[] = [];
  queryParams: PatternConfig[] = [];
  headers: PatternConfig[] = [];
  formParams: PatternConfig[] = [];
  variables: PatternConfig[] = [];
  JSONPaths: PathConfig[] = [];
  XMLPaths: PathConfig[] = [];
}

export class PathConfig {
  name: string = "";
  path: string = "";
  type: string = "";
}

export class PatternConfig {
  name: string = "";
  ignoreCase: boolean = true;
  pattern: string = "";
}

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
  {{#each queryParams}}
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
  <Variable name="{{this.name}}">
    <Pattern>{{this.pattern}}</Pattern>
  </Variable>
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
  applyTemplate (inputConfig: proxyEndpoint, additionalData?: any): Promise<PlugInResult> {
    return new Promise((resolve) => {
      const fileResult: PlugInResult = new PlugInResult(this.constructor.name)

      let config: ExtractVariablesConfig = additionalData;

      fileResult.files.push({
        policyConfig: {
          name: "EV-" + config.name,
          flowRunPoints: config.flowRunPoints
        },
        path: '/policies/EV-' + config.name + '.xml',
        contents: this.template(config)
      });

      resolve(fileResult)
    })
  }
}
