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

export class AssignMessageConfig {
  type: string = "";
  name: string = "";
  triggers: policyInsertPlaces[] = [];
  continueOnError: boolean = false;
  ignoreUnresolvedVariables: boolean = false;
  assignTo: string = "";
  assignVariables: AssignVariableConfig[] = [];
  add: AssignBlockConfig[] = [];
  copy: AssignBlockConfig[] = [];
  remove: AssignBlockConfig[] = [];
  set: AssignBlockConfig[] = [];
}

export class AssignVariableConfig {
  name: string = "";
  propertySetRef: string = "";
  ref: string = "";
  resourceURL: string = "";
  template: string = "";
  value: string = "";
}

export class AssignBlockConfig {
  formParams: AssignElementConfig[] = [];
  headers: AssignElementConfig[] = [];
  queryParams: AssignElementConfig[] = [];
  path: boolean = false;
  payload: boolean = false;
  statusCode: boolean = false;
  verb: boolean = false;
  version: boolean = false;
}

export class AssignElementConfig {
  name: string = "";
  value: string = "";
}

/**
 * Plugin for assigning data to message
 * @date 2/14/2022 - 8:17:36 AM
 *
 * @export
 * @class ExtractVariablesPlugin
 * @typedef {AssignMessagePlugin}
 * @implements {AssignMessagePlugin}
 */
export class AssignMessagePlugin implements ApigeeTemplatePlugin {
    
  snippet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<AssignMessage continueOnError="false" enabled="true" name="AM-{{name}}">
  <DisplayName>AM-{{name}}</DisplayName>

  <Add>
    {{#each add}}
    <FormParams>
      {{#each this.formParmas}}
      <FormParam name="{{this.name}}">{{this.value}}</FormParam>
      {{/each}}
    </FormParams>
    {{/each}}
  </Add>  

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

      let config: AssignMessageConfig = additionalData;
      console.log(JSON.stringify(config));

      fileResult.files.push({
        policyConfig: {
          name: "AM-" + config.name,
          triggers: config.triggers
        },
        path: '/policies/AM-' + config.name + '.xml',
        contents: this.template(config)
      });

      resolve(fileResult)
    })
  }
}
