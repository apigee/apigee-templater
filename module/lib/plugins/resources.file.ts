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
import request from 'sync-request';
import fs from 'fs';

export class ResourceFileConfig {
  name: string = "";
  flowRunPoints: FlowRunPoint[] = [];
  files: { [key: string]: string } = {};
}

export class ResourceFilePlugin implements ApigeeTemplatePlugin {

  applyTemplate (inputConfig: proxyEndpoint, additionalData?: any): Promise<PlugInResult> {
    return new Promise((resolve) => {
      const fileResult: PlugInResult = new PlugInResult(this.constructor.name);

      let config: ResourceFileConfig = additionalData;

      for (const [key, value] of Object.entries(config.files)) {

        let fileContents: string = value;

        if (value.startsWith("https://")) {
          // The value is a remote file, so get it
          var res = request('GET', value, {
            headers: {
              'user-agent': 'example-user-agent',
            },
          });

          fileContents = res.getBody().toString();
        }
        else {
          
          if (fs.existsSync(fileContents)) {
            // The value is a file, so load the file.
            fileContents = fs.readFileSync(fileContents, 'utf-8');
          }
        }

        fileResult.files.push({
          policyConfig: {
              name: `RS-${config.name}`,
              flowRunPoints: [{
                  name: "file",
                  runPoints: [RunPoint.none]
              }]
          },
          path: '/resources/' + key,
          contents: fileContents
        });

      }

      resolve(fileResult);
    });
  }
}