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

import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { ApigeeTemplateService, ApigeeTemplateInput, ApigeeTemplateProfile, PlugInResult, PlugInFile, ApigeeConverterPlugin, GenerateResult, proxyEndpoint, ApigeeTemplatePlugin, SpecType, authTypes } from './interfaces.js';
import { Json1Converter } from './converters/json1.converter.js';
import { Json2Converter } from './converters/json2.converter.js';
import { OpenApiV3Converter } from './converters/yaml.openapiv3.converter.js';
import { YamlConverter } from './converters/yaml.converter.js';
import { OpenAPIDataConverter } from './converters/openAPI.data.converter.js';
import { ProxyPlugin } from './plugins/final.proxy.plugin.js';
import { FlowPlugin } from './plugins/final.sharedflow.plugin.js';
import { FlowCalloutPlugin } from './plugins/flow.callout.plugin.js';
import { TargetsPlugin } from './plugins/targets.plugin.js';
import { TargetsBigQueryPlugin } from './plugins/targets.bigquery.plugin.js';
import { AuthSfPlugin } from './plugins/auth.sf.plugin.js';
import { AuthApiKeyPlugin } from './plugins/auth.apikey.plugin.js';
import { QuotaPlugin } from './plugins/traffic.quota.plugin.js';
import { SpikeArrestPlugin } from './plugins/traffic.spikearrest.plugin.js';
import { ExtractVariablesPlugin } from './plugins/mediation.exvars.plugin.js';
import { AssignMessagePlugin } from './plugins/mediation.assignm.plugin.js';
import { MessageLoggingPlugin } from './plugins/messagelogging.plugin.js';
import { AnyPlugin } from './plugins/any.plugin.js';
import { ResourceFilePlugin } from './plugins/resources.file.js';

/**
 * ApigeeGenerator runs the complete templating operation with all injected plugins
 * @date 2/14/2022 - 8:22:47 AM
 *
 * @export
 * @class ApigeeTemplater
 * @typedef {ApigeeTemplater}
 * @implements {ApigeeTemplateService}
 */
export class ApigeeTemplater implements ApigeeTemplateService {
  converterPlugins: ApigeeConverterPlugin[] = [
    new Json1Converter(),
    new Json2Converter(),
    new YamlConverter(),
    new OpenApiV3Converter()
  ];

  profiles: Record<string, ApigeeTemplateProfile> = {
    default: {
      plugins: [
        new SpikeArrestPlugin(),
        new AuthApiKeyPlugin(),
        new AuthSfPlugin(),
        new QuotaPlugin()
      ],
      extensionPlugins: {
        "ExtractVariables": new ExtractVariablesPlugin(),
        "AssignMessage": new AssignMessagePlugin(),
        "FlowCallout": new FlowCalloutPlugin(),
        "MessageLogging": new MessageLoggingPlugin(),
        "resourceFiles": new ResourceFilePlugin(),
        "": new AnyPlugin()
      },
      finalizePlugins: [
        new TargetsPlugin(),
        new ProxyPlugin()
      ]
    },
    sharedflow: {
      plugins: [
        new SpikeArrestPlugin(),
        new AuthApiKeyPlugin(),
        new AuthSfPlugin(),
        new QuotaPlugin()
      ],
      extensionPlugins: {        
        "ExtractVariables": new ExtractVariablesPlugin(),
        "AssignMessage": new AssignMessagePlugin(),
        "MessageLogging": new MessageLoggingPlugin(),
        "resourceFiles": new ResourceFilePlugin(),
        "": new AnyPlugin()
      },
      finalizePlugins: [
        new TargetsPlugin(), 
        new FlowPlugin()
      ]
    },
    bigquery: {
      plugins: [
        new SpikeArrestPlugin(),
        new AuthApiKeyPlugin(),
        new AuthSfPlugin(),
        new QuotaPlugin()
      ],
      extensionPlugins: {},
      finalizePlugins: [
        new TargetsBigQueryPlugin(),
        new ProxyPlugin()
      ]
    }
  };

  // eslint-disable-next-line valid-jsdoc
  /**
   * Creates an instance of ApigeeGenerator.
   * @date 3/16/2022 - 9:09:47 AM
   *
   * @constructor
   * @param {?Record<string, ApigeeTemplateProfile>} [customProfiles]
   * @param {?ApigeeConverterPlugin[]} [customInputConverters]
   */
  constructor(customProfiles?: Record<string, ApigeeTemplateProfile>, customInputConverters?: ApigeeConverterPlugin[]) {
    // Override any profiles passed optionally in constructor
    if (customProfiles) {
      for (const [key, value] of Object.entries(customProfiles)) {
        this.profiles[key] = value
      }
    }
    // Replace input converters if any passed in contructor
    if (customInputConverters) {
      this.converterPlugins = customInputConverters
    }
  }

  /**
   * Generates an OpenAPI spec for the input payload of the specified type
   * @param payloadInput input payload text
   * @param type 0=Data, 1=CRUD
   */
  generateSpec(payloadInput: string, type: SpecType, servers: string[], authType: authTypes, addDataExamples: boolean, addDataDescriptions: boolean, additionalData?: any): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let converter: OpenAPIDataConverter = new OpenAPIDataConverter();

      converter.convertInput(payloadInput, servers, authType, addDataExamples, addDataDescriptions, additionalData).then((result) => {
        resolve(result);
      });
    });
  }

  /**
   * Sets a complete profile
   * @param profileName 
   * @param profile 
   */
  setProfile(profileName: string, profile: ApigeeTemplateProfile): void {
    this.profiles[profileName] = profile;
  }

  /**
   * Sets a plugin in the profile
   *
   * @param profileName 
   * @param plugin 
   */
  setPluginInProfile(profileName: string, plugin: ApigeeTemplatePlugin): void {
    if (this.profiles[profileName]) {
      // Replace normal plugins, if exists
      let foundPlugin = false;
      for (var i=0; i<this.profiles[profileName].plugins.length; i++) {
        console.log("Checking plugin: " + this.profiles[profileName].plugins[i].constructor.name + " against " + plugin.constructor.name);
        if (this.profiles[profileName].plugins[i].constructor.name == plugin.constructor.name) {
          console.log("Found plugin, replacing: " + plugin.constructor.name);
          this.profiles[profileName].plugins[i] = plugin;
          foundPlugin = true;
          break;
        }
      }

      // If did not find in normal plugins, check finalize plugins
      if (!foundPlugin)
        for (var i=0; i<this.profiles[profileName].finalizePlugins.length; i++) {
          console.log("Checking plugin: " + this.profiles[profileName].finalizePlugins[i].constructor.name + " against " + plugin.constructor.name);
          if (this.profiles[profileName].finalizePlugins[i].constructor.name == plugin.constructor.name) {
            console.log("Found plugin, replacing: " + plugin.constructor.name);
            this.profiles[profileName].finalizePlugins[i] = plugin;
            foundPlugin = true;
            break;
          }
        }

      // If did not find in normal plugins or finalize plugins, check extension plugins
      if (!foundPlugin)
        for (const [key, value] of Object.entries(this.profiles[profileName].extensionPlugins)) {
          if (value.constructor.name == plugin.constructor.name) {
            console.log("Found plugin, replacing: " + plugin.constructor.name);
            this.profiles[profileName].extensionPlugins[key] = plugin;
            foundPlugin = true;
            break;
          }          
        }

      if (!foundPlugin)
        console.log("Could not find plugin to set: " + plugin.constructor.name);
    }
  }

  /**
   * Sets an extension plugin in the profile
   *
   * @param profileName 
   * @param plugin 
   */
  setExtensionPluginInProfile(profileName: string, name: string, plugin: ApigeeTemplatePlugin): void {
    if (this.profiles[profileName]) {
      this.profiles[profileName].extensionPlugins[name] = plugin;
    }
  }

  /**
   * Converts an input string into a template input object
   * @date 2/14/2022 - 8:24:03 AM
   *
   * @param {string} inputString
   * @return {Promise<ApigeeTemplateInput>}
   */
  convertStringToProxyInput(inputString: string): Promise<ApigeeTemplateInput> {
    return new Promise((resolve, reject) => {
      const conversions: Promise<ApigeeTemplateInput>[] = []
      for (const plugin of this.converterPlugins) {
        conversions.push(plugin.convertInput(inputString))
      }

      Promise.allSettled(conversions).then((values) => {
        let conversionSuccessful = false

        for (const value of values) {
          if (value.status == 'fulfilled') {
            conversionSuccessful = true
            resolve(value.value)
            break
          }
        }

        if (!conversionSuccessful) { reject(new Error('No conversion was found for the input string!')) }
      })
    })
  }

  /**
   * Generates a proxy bundle based on an input string
   * @date 2/14/2022 - 8:25:31 AM
   *
   * @param {string} inputString
   * @param {string} outputDir
   * @return {Promise<GenerateResult>} Result including path to generated proxy bundle
   */
  generateProxyFromString(inputString: string, outputDir: string): Promise<GenerateResult> {
    return new Promise((resolve, reject) => {
      this.convertStringToProxyInput(inputString).then((result) => {
        this.generateProxy(result, outputDir).then((generateResult) => {
          resolve(generateResult)
        })
      }).catch((error) => {
        console.error(error)
        reject(error)
      })
    })
  }

  /**
   * Main generate proxy method with correct input object
   * @date 2/14/2022 - 8:26:00 AM
   *
   * @param {ApigeeTemplateInput} genInput
   * @param {string} outputDir
   * @return {Promise<GenerateResult>} GenerateResult object including path to generated proxy bundle
   */
  generateProxy(genInput: ApigeeTemplateInput, outputDir: string): Promise<GenerateResult> {
    return new Promise((resolve, reject) => {
      const startTime = performance.now();

      const result: GenerateResult = {
        success: true,
        duration: 0,
        message: '',
        localPath: ''
      };

      // const processingVars: Map<string, object> = new Map<string, object>();

      let newOutputDir = "";

      if (genInput.sharedFlow != undefined) 
        newOutputDir = outputDir + '/' + genInput.name + '/sharedflowbundle';
      else
        newOutputDir = outputDir + '/' + genInput.name + '/apiproxy';

      fs.mkdirSync(newOutputDir, { recursive: true });

      if (genInput.sharedFlow != undefined)
        fs.mkdirSync(newOutputDir + '/sharedflows', { recursive: true });
      else
        fs.mkdirSync(newOutputDir + '/proxies', { recursive: true });

      fs.mkdirSync(newOutputDir + '/targets', { recursive: true });
      fs.mkdirSync(newOutputDir + '/policies', { recursive: true });
      fs.mkdirSync(newOutputDir + '/resources', { recursive: true });

      let promises: Promise<PlugInResult[]>[] = [];
      if (genInput.endpoints != undefined && genInput.endpoints.length > 0) {
        for (const endpoint of genInput.endpoints) {
          // First, call normal plugins
          let newPromise = this.callPlugins(genInput, endpoint, newOutputDir);
          promises.push(newPromise);
          newPromise.then((results) => {
            endpoint.fileResults = results;

            // Now call flow plugins
            let extensionPromise = this.callExtensionPlugins(genInput, endpoint, newOutputDir);
            promises.push(extensionPromise);
            extensionPromise.then((extensionResults) => {
              endpoint.fileResults = endpoint.fileResults?.concat(extensionResults);

              // And finally call finalizer plugin
              let finalizerPromise = this.callFinalizerPlugins(genInput, endpoint, newOutputDir);
              promises.push(finalizerPromise);
              finalizerPromise.then((finalizerResults) => {
                  endpoint.fileResults = endpoint.fileResults?.concat(finalizerResults);
              });
            });
          });
        }
      }
      else if (genInput.sharedFlow != undefined) {
        // First call normal plugins
        let newPromise = this.callPlugins(genInput, genInput.sharedFlow, newOutputDir);
        promises.push(newPromise);
        newPromise.then((results) => {
          if (genInput.sharedFlow) {
            genInput.sharedFlow.fileResults = results;

            // Now call flow plugins
            let extensionPromise = this.callExtensionPlugins(genInput, genInput.sharedFlow, newOutputDir);
            promises.push(extensionPromise);
            extensionPromise.then((extensionResults) => {
              if (genInput.sharedFlow) {
                genInput.sharedFlow.fileResults = genInput.sharedFlow.fileResults?.concat(extensionResults);
                let finalizerPromise = this.callFinalizerPlugins(genInput, genInput.sharedFlow, newOutputDir);
                promises.push(finalizerPromise);
                finalizerPromise.then((finalizerResults) => {
                  // Call finalizer plugin for flow
                  if (genInput.sharedFlow && genInput.sharedFlow.fileResults) {
                    genInput.sharedFlow.fileResults = genInput.sharedFlow.fileResults.concat(finalizerResults);
                  }
                });
              }
            });
          }
        });
      }

      Promise.all(promises).then((endpointPluginResults) => {
        const archive = archiver('zip')
        archive.on('error', function (err: Error) {
          reject(err);
        });
  
        archive.directory(outputDir + '/' + genInput.name, false);
  
        const output = fs.createWriteStream(outputDir + '/' + genInput.name + '.zip');
  
        archive.on('end', () => {
          // Zip is finished, cleanup files
          fs.rmSync(outputDir + '/' + genInput.name, { recursive: true });
          const endTime = performance.now();
          result.duration = endTime - startTime;
          result.message = `Proxy generation completed in ${Math.round(result.duration)} milliseconds.`;
          result.localPath = outputDir + '/' + genInput.name + '.zip';
          result.template = genInput;
  
          resolve(result);
        });
  
        archive.pipe(output);
        archive.finalize();
      })      
    })
  }

  callPlugins(genInput: ApigeeTemplateInput, endpoint: proxyEndpoint, newOutputDir: string): Promise<PlugInResult[]> {
    return new Promise((resolve, reject) => {
      if (process.env.PROJECT) {
        if (!endpoint.parameters) endpoint.parameters = {};
        endpoint.parameters.PROJECT = process.env.PROJECT;
      }

      if (Object.keys(this.profiles).includes(genInput.profile)) {
        let promises: Promise<PlugInResult>[] = [];

        for (const plugin of this.profiles[genInput.profile].plugins) {
          promises.push(plugin.applyTemplate(endpoint));
        }

        Promise.all(promises).then((values) => {
          for (let newResult of values) {
            for (let file of newResult.files) {
              fs.mkdirSync(path.dirname(newOutputDir + file.path), { recursive: true });
              fs.writeFileSync(newOutputDir + file.path, file.contents);
            }
          }
          resolve(values);
        }).catch((error) => {
          console.error(error);
          console.error("Error calling plugins, aborting.");
          reject("Error calling plugins, aborting.");
        });        
      }
    });
  }

  callFinalizerPlugins(genInput: ApigeeTemplateInput, endpoint: proxyEndpoint, newOutputDir: string): Promise<PlugInResult[]> {
    return new Promise((resolve, reject) => {
      if (process.env.PROJECT) {
        if (!endpoint.parameters) endpoint.parameters = {};
        endpoint.parameters.PROJECT = process.env.PROJECT;
      }

      if (Object.keys(this.profiles).includes(genInput.profile)) {
        let promises: Promise<PlugInResult>[] = [];

        for (const plugin of this.profiles[genInput.profile].finalizePlugins) {
          promises.push(plugin.applyTemplate(endpoint));
        }

        Promise.all(promises).then((values) => {

          for (let newResult of values) {
            for (let file of newResult.files) {
              fs.mkdirSync(path.dirname(newOutputDir + file.path), { recursive: true });
              fs.writeFileSync(newOutputDir + file.path, file.contents);
            }
          }
          resolve(values);
        }).catch((error) => {
          console.error(error);
          console.error("Error calling finalizer plugins, aborting.");
          reject("Error calling plugins, aborting.");
        });
      }
    });
  }

  callExtensionPlugins(genInput: ApigeeTemplateInput, endpoint: proxyEndpoint, newOutputDir: string): Promise<PlugInResult[]> {
    return new Promise((resolve, reject) => {
      if (process.env.PROJECT) {
        endpoint.parameters.PROJECT = process.env.PROJECT;
      }

      if (Object.keys(this.profiles).includes(genInput.profile)) {
        let promises: Promise<PlugInResult>[] = [];

        if (endpoint.extensionSteps) {
          for (const step of endpoint.extensionSteps) {
            // Set the generic Any plugin that converts JSON to XML for any plugin where type is not set (default)
            if (step.type == undefined) step.type = "";

            if (this.profiles[genInput.profile].extensionPlugins[step.type]) {
              // We have a plugin
              promises.push(this.profiles[genInput.profile].extensionPlugins[step.type].applyTemplate(endpoint, step));
            }
            else {
              console.error(`Plugin ${step.type} not found in profile ${genInput.profile}`);
            }
          }
        }

        Promise.all(promises).then((values) => {
          for (let newResult of values) {
            for (let file of newResult.files) {
              fs.mkdirSync(path.dirname(newOutputDir + file.path), { recursive: true });
              fs.writeFileSync(newOutputDir + file.path, file.contents);
            }
          }
          resolve(values);
        }).catch((error) => {
          console.error(error);
          console.error("Error calling extension plugins, aborting.");
          reject("Error calling extension plugins, aborting.");
        });        
      }
    });
  }
}
