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

export class AssignMessageConfig {
  type: string = "";
  name: string = "";
  flowRunPoints: FlowRunPoint[] = [];
  continueOnError: boolean = false;
  ignoreUnresolvedVariables: boolean = false;
  assignTo: string = "";
  assignVariables: AssignVariableConfig[] = [];
  add?: AssignContentConfig;
  copy?: AssignContentConfig;
  remove?: AssignContentConfig;
  set?: AssignSetContentConfig;
}

export class AssignVariableConfig {
  name: string = "";
  propertySetRef: string = "";
  ref: string = "";
  resourceURL: string = "";
  templateVariable: string = "";
  templateMessage: string = "";
  value: string = "";
}

export class AssignContentConfig {
  formParams: AssignElementConfig[] = [];
  headers: AssignElementConfig[] = [];
  queryParams: AssignElementConfig[] = [];
  path: boolean = false;
  payload: boolean = false;
  statusCode: boolean = false;
  verb: boolean = false;
  version: boolean = false;
}

export class AssignSetContentConfig {
  formParams: AssignElementConfig[] = [];
  headers: AssignElementConfig[] = [];
  queryParams: AssignElementConfig[] = [];
  path?: string;
  payload?: {contentType: string, variablePrefix: string, variableSuffix: string, newPayload: string};
  statusCode?: string;
  verb?: string;
  version?: string;
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
<AssignMessage continueOnError="false" enabled="true" name="{{name}}">
  <DisplayName>{{name}}</DisplayName>

  {{#if ignoreUnresolvedVariables}}
  <IgnoreUnresolvedVariables>{{ignoreUnresolvedVariables}}</IgnoreUnresolvedVariables>
  {{/if}}

  {{#each assignVariables}}
  <AssignVariable>
    <Name>{{this.name}}</Name>
    {{#if this.PropertySetRef}}
    <PropertySetRef>{{this.propertySetRef}}</PropertySetRef>
    {{/if}}
    {{#if this.ref}}
    <Ref>{{this.ref}}</Ref>
    {{/if}}
    {{#if this.resourceURL}}
    <ResourceURL>{{this.resourceURL}}</ResourceURL>
    {{/if}}
    {{#if this.templateMessage}}
    <Template>{{this.templateMessage}}</Template>
    {{/if}}
    {{#if this.templateVariable}}
    <Template ref="{{this.templateVariable}}"></Template>
    {{/if}}
    {{#if this.value}}
    <Value>{{this.value}}</Value>
    {{/if}}
  </AssignVariable>
  {{/each}}

  {{#if add}}
  <Add>
    {{#if add.formParams}}
    <FormParams>
      {{#each add.formParmas}}
      <FormParam name="{{this.name}}">{{this.value}}</FormParam>
      {{/each}}
    </FormParams>
    {{/if}}
    {{#if add.headers}}
    <Headers>
      {{#each add.headers}}
      <Header name="{{this.name}}">{{this.value}}</Header>
      {{/each}}
    </Headers>
    {{/if}}
    {{#if add.queryParams}}
    <QueryParams>
      {{#each add.queryParams}}
        <QueryParam name="{{this.name}}">{{this.value}}</QueryParam>
      {{/each}}
    </QueryParams>
    {{/if}}
  </Add>
  {{/if}}

  {{#if copy}}
  <Copy>
    {{#if copy.formParams}}
    <FormParams>
      {{#each copy.formParams}}
      <FormParam name="{{this.name}}">{{this.value}}</FormParam>
      {{/each}}
    </FormParams>
    {{/if}}
    {{#if copy.headers}}
    <Headers>
      {{#each copy.headers}}
      <Header name="{{this.name}}">{{this.value}}</Header>
      {{/each}}
    </Headers>
    {{/if}}
    {{#if copy.queryParams}}
    <QueryParams>
      {{#each copy.queryParams}}
        <QueryParam name="{{this.name}}">{{this.value}}</QueryParam>
      {{/each}}
    </QueryParams>
    {{/if}}
    {{#if copy.path}}
    <Path>{{copy.path}}</Path>
    {{/if}}
    {{#if copy.payload}}
    <Payload>{{copy.payload}}</Payload>
    {{/if}}
    {{#if copy.statusCode}}
    <StatusCode>{{copy.statusCode}}</StatusCode>
    {{/if}}
    {{#if copy.verb}}
    <Verb>{{copy.verb}}</Verb>
    {{/if}}
    {{#if copy.version}}
    <Version>{{copy.version}}</Version>
    {{/if}}
  </Copy>
  {{/if}}

  {{#if remove}}
  <Remove>
    {{#if remove.formParams}}
    <FormParams>
      {{#each remove.formParams}}
      <FormParam name="{{this.name}}">{{this.value}}</FormParam>
      {{/each}}
    </FormParams>
    {{/if}}
    {{#if remove.headers}}
    <Headers>
      {{#each remove.headers}}
      <Header name="{{this.name}}">{{this.value}}</Header>
      {{/each}}
    </Headers>
    {{/if}}
    {{#if remove.queryParams}}
    <QueryParams>
      {{#each remove.queryParams}}
        <QueryParam name="{{this.name}}">{{this.value}}</QueryParam>
      {{/each}}
    </QueryParams>
    {{/if}}
    {{#if remove.payload}}
    <Payload>{{remove.payload}}</Payload>
    {{/if}}
  </Remove>
  {{/if}}

  {{#if set}}
  <Set>
    {{#if set.formParams}}
    <FormParams>
      {{#each set.formParmas}}
      <FormParam name="{{this.name}}">{{this.value}}</FormParam>
      {{/each}}
    </FormParams>
    {{/if}}
    {{#if set.headers}}
    <Headers>
      {{#each set.headers}}
      <Header name="{{this.name}}">{{this.value}}</Header>
      {{/each}}
    </Headers>
    {{/if}}
    {{#if set.queryParams}}
    <QueryParams>
      {{#each set.queryParams}}
        <QueryParam name="{{this.name}}">{{this.value}}</QueryParam>
      {{/each}}
    </QueryParams>
    {{/if}}
    {{#if set.path}}
    <Path>{{set.path}}</Path>
    {{/if}}
    {{#if set.payload}}
    <Payload contentType="{{set.payload.contentType}}" variablePrefix="{{set.payload.variablePrefix}}" variableSuffix="{{set.payload.variableSuffix}}>{{set.payload.newPayload}}</Payload>
    {{/if}}
    {{#if set.statusCode}}
    <StatusCode>{{set.statusCode}}</StatusCode>
    {{/if}}
    {{#if set.verb}}
    <Verb>{{set.verb}}</Verb>
    {{/if}}
    {{#if set.version}}
    <Version>{{set.version}}</Version>
    {{/if}}
  </Set>
  {{/if}}
</AssignMessage>`;

  template = Handlebars.compile(this.snippet);

  /**
   * Applies the template logic for AssignMessage
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

      fileResult.files.push({
        policyConfig: {
          name: config.name,
          flowRunPoints: config.flowRunPoints
        },
        path: '/policies/' + config.name + '.xml',
        contents: this.template(config)
      });

      resolve(fileResult);
    })
  }
}
