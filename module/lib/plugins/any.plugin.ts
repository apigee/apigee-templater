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

import { ApigeeTemplatePlugin, proxyEndpoint, PlugInResult, FlowRunPoint, RunPoint } from '../interfaces.js';
import * as xmljs from "xml-js";

export class AnyConfig {
  name: string = "";
  flowRunPoints: FlowRunPoint[] = [];
  properties: any = {};
}

export class AnyPlugin implements ApigeeTemplatePlugin {

  applyTemplate (inputConfig: proxyEndpoint, additionalData?: any): Promise<PlugInResult> {
    return new Promise((resolve) => {
      
      const fileResult: PlugInResult = new PlugInResult(this.constructor.name);

      let config: AnyConfig = additionalData;
      let xmlString: string = xmljs.js2xml(config.properties, {compact: true, ignoreComment: true, spaces: 2})

      fileResult.files.push({
        policyConfig: {
            name: `${config.name}`,
            flowRunPoints: config.flowRunPoints
        },
        path: '/policies/' + config.name + '.xml',
        contents: xmlString
      });

      resolve(fileResult)
    });
  }
}