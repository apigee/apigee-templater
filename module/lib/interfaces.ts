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

/** A proxy target describes a target URL to route traffic to */
export class proxyTarget {
  name = 'default';
  url?= '';
  query?= '';
  table?= '';
  googleIdToken?: proxyTargetAuth;
  googleAccessToken?: proxyTargetAuth;
  headers?: { [key: string]: string } = {};
}

export class proxyTargetAuth {
  audience?: string='';
  headerName: string='';
  scopes?: string[]= [];
}

/** A proxy endpoint describes a basepath, targets and other proxy features */
export class proxyEndpoint {
  name = 'TestProxy';
  basePath = '/test';
  target: proxyTarget = {
    name: 'default',
    url: 'https://httpbin.org'
  };
  auth?: authConfig[];
  quotas?: quotaConfig[];
  spikeArrest?: spikeArrestConfig;
  parameters: {[key: string]: string} = {};
  extensionSteps: step[] = [];
  fileResults?: PlugInResult[] = [];
}

export class step {
  type: string = "";
  name: string = "";
  flowRunPoints: FlowRunPoint[] = [];
}

/** Describes a proxy to be templated */
export class ApigeeTemplateInput {
  name = 'MyProxy';
  profile = 'default';
  sharedFlow?: proxyEndpoint = undefined;
  endpoints: proxyEndpoint[] = [];

  /**
   * Creates an instance of ApigeeTemplateInput.
   * @date 3/16/2022 - 10:18:44 AM
   *
   * @constructor
   * @public
   * @param {?Partial<ApigeeTemplateInput>} [init]
   */
  public constructor(init?: Partial<ApigeeTemplateInput>) {
    Object.assign(this, init)
  }
}

/** Authorization config for an endpoint */
export class authConfig {
  type: authTypes = authTypes.apiKey;
  parameters: { [key: string]: string } = {};
}

/** Quota config for an endpoint */
export class quotaConfig {
  count = 5;
  timeUnit = 'minute';
  condition?: string;
}

/** Spike arrest config for an endpoint */
export class spikeArrestConfig {
  rate = '30s';
}

export enum authTypes {
  // eslint-disable-next-line no-unused-vars
  none = 'none',
  basic = 'basic',
  bearer = 'bearer',
  apiKey = 'apiKey',
  oauth2 = 'oauth2',
  openIdConnect = 'openIdConnect',
  sharedflow = 'sharedflow'
}

/** The result of the template generation */
export class GenerateResult {
  success = false;
  duration = 0;
  message = '';
  localPath = '';
  template?: ApigeeTemplateInput;
}

/** The result of plugin processing */
export class PlugInResult {
  source: string = "";
  files: PlugInFile[] = [];

  constructor(owner: string) {
    this.source = owner;
  }
}

/** Plugin file results to be written to disk */
export class PlugInFile {
  policyConfig? = new PlugInFilePolicyConfig();
  path = '';
  contents = '';
}

export class PlugInFilePolicyConfig {
  name = 'default';
  flowRunPoints: FlowRunPoint[] = [];
}

export class FlowRunPoint {
  name = '';
  flowCondition?: string = "";
  stepCondition?: string = "";
  runPoints: RunPoint[] = [];
}

export enum RunPoint {
  none = 'none',
  preRequest = 'preRequest',
  postRequest = 'postRequest',
  preTarget = 'preTarget',
  postTarget = 'postTarget',
  preResponse = 'preResponse',
  postResponse = 'postResponse',
  postClientResponse = 'postClientResponse',
  endpointFault = 'endpointFault',
  targetFault = 'targetFault'
}

export class ConditionalFlowSteps {
  name: string = "";
  requestSteps: FlowStep[] = [];
  responseSteps: FlowStep[] = [];

  constructor(name: string) {
    this.name = name;
  }
}

export class FlowStep {
  name: string = "";
  condition: string = "";

  constructor(name: string, condition: string | undefined) {
    this.name = name;
    if (condition) this.condition = condition;
  }
}

/** Profile definition with plugins to be used for conversion */
export class ApigeeTemplateProfile {
  plugins: ApigeeTemplatePlugin[] = [];
  extensionPlugins: {[key: string]: ApigeeTemplatePlugin} = {};
  finalizePlugins: ApigeeTemplatePlugin[] = [];
}

export interface ApigeeTemplatePlugin {
  applyTemplate(inputConfig: proxyEndpoint, additionalData?: any): Promise<PlugInResult>
}

export interface ApigeeConverterPlugin {
  convertInput(input: string): Promise<ApigeeTemplateInput>
}

export interface OpenAPIConverterPlugin {
  convertInput(input: string, servers: string[], authType: authTypes, addDataExamples: boolean, addDataDescriptions: boolean): Promise<string>
}

export enum SpecType {
  Data,
  CRUD
}

export interface ApigeeTemplateService {
  setProfile(profileName: string, profile: ApigeeTemplateProfile): void;
  setPluginInProfile(profileName: string, plugin: ApigeeTemplatePlugin): void;
  setExtensionPluginInProfile(profileName: string, name: string, plugin: ApigeeTemplatePlugin): void;
  convertStringToProxyInput(inputString: string): Promise<ApigeeTemplateInput>;
  generateProxyFromString(inputString: string, outputDir: string): Promise<GenerateResult>;
  generateProxy(inputConfig: ApigeeTemplateInput, outputDir: string): Promise<GenerateResult>;
  generateSpec(input: string, type: SpecType, servers: string[], authType: authTypes, addDataExamples: boolean, addDataDescriptions: boolean, additionalData?: any): Promise<string>;
}