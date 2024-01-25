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

import { ApigeeTemplatePlugin, proxyEndpoint, PlugInResult, FlowRunPoint } from '../interfaces.js'

export class MessageLoggingConfig {
  name: string = "";
  flowRunPoints: FlowRunPoint[] = [];
  logLevel: string = "ALERT";
  cloudLoggingConfig?: CloudLoggingConfig = undefined;
  syslogConfig?: SyslogConfig = undefined;
}

export class CloudLoggingConfig {
  logName: string = "";
  message: string = "";
  messageContentType: string = "application/json";
  labels: { [key: string]: string } = {};
  resourceType: string = "";
}

export class SyslogConfig {
  message: string = "";
  host: string = "";
  port: number = 0;
  protocol: string = "TCP";
  formatMessage: boolean = true;
  dateFormat: string = "yyMMdd-HH:mm:ss.SSS";
}

/**
 * Plugin for message logging policies
 * @date 2/14/2022 - 8:17:36 AM
 *
 * @export
 * @class MessageLoggingPlugin
 * @typedef {MessageLoggingPlugin}
 * @implements {MessageLoggingPlugin}
 */
export class MessageLoggingPlugin implements ApigeeTemplatePlugin {

  /**
   * Applies the template logic for message logging
   * @date 2/14/2022 - 8:18:32 AM
   *
   * @param {proxyEndpoint} inputConfig
   * @param {Map<string, any>} processingVars
   * @return {Promise<PlugInResult>}
   */
  applyTemplate (inputConfig: proxyEndpoint, additionalData?: any): Promise<PlugInResult> {
    return new Promise((resolve) => {
      const fileResult: PlugInResult = new PlugInResult(this.constructor.name);

      let config: MessageLoggingConfig = additionalData;
      
      fileResult.files.push({
        policyConfig: {
          name: `ML-${config.name}`,
          flowRunPoints: config.flowRunPoints
        },
        path: '/policies/ML-' + config.name + '.xml',
        contents: `
<MessageLogging name="ML-${config.name}">
    ${config.cloudLoggingConfig ? `
    <CloudLogging>
        <LogName>${config.cloudLoggingConfig.logName}</LogName>
        <Message contentType="${config.cloudLoggingConfig.messageContentType}">${config.cloudLoggingConfig.message}</Message>
        ${config.cloudLoggingConfig?.labels ? `
        <Labels>
            ${Object.keys(config.cloudLoggingConfig.labels).map(key => `
              <Label>
                  <Key>${key}</Key>
                  <Value>${config.cloudLoggingConfig?.labels[key]}</Value>
              </Label>`)}
        </Labels>` : ""}
        ${config.cloudLoggingConfig.resourceType ? `
        <ResourceType>${config.cloudLoggingConfig.resourceType}</ResourceType>`
        : ""}
    </CloudLogging>` : ""}
    ${config.syslogConfig ? `
    <Syslog>
        <Message>${config.syslogConfig?.message}</Message>
        <Host>{${config.syslogConfig?.host}</Host>
        <Port>${config.syslogConfig?.port}</Port>
        <Protocol>${config.syslogConfig?.protocol}</Protocol>
        <FormatMessage>${config.syslogConfig?.formatMessage}</FormatMessage>
        <DateFormat>${config.syslogConfig?.dateFormat}</DateFormat>
    </Syslog>` : ""}
    <logLevel>${config.logLevel}</logLevel>
</MessageLogging>`
      });

      resolve(fileResult)
    });
  }
}
