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

import { ApigeeTemplatePlugin, proxyEndpoint, PlugInResult, FlowRunPoint, RunPoint } from '../interfaces.js'

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

      fileResult.files.push({
        policyConfig: {
            name: `${config.name}`,
            flowRunPoints: config.flowRunPoints
        },
        path: '/policies/' + config.name + '.xml',
        contents: OBJtoXML(config.properties)
      });

      resolve(fileResult)
    });
  }
}

function OBJtoXML(obj: any): string {
  var xml = '';
  for (var prop in obj) {
    xml += obj[prop] instanceof Array ? '' : "<" + prop + ">";
    if (obj[prop] instanceof Array) {
      for (var array in obj[prop]) {
        xml += "<" + prop + ">";
        xml += OBJtoXML(new Object(obj[prop][array]));
        xml += "</" + prop + ">";
      }
    } else if (typeof obj[prop] == "object") {
      xml += OBJtoXML(new Object(obj[prop]));
    } else {
      xml += obj[prop];
    }
    xml += obj[prop] instanceof Array ? '' : "</" + prop + ">";
  }
  var xml = xml.replace(/<\/?[0-9]{1,}>/g, '');
  return xml
}
