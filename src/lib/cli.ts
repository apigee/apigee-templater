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

import arg from "arg";
import fs from "fs";
import path from "path";
import inquirer from "inquirer";
import chalk from "chalk";
import * as YAML from "yaml";
import { ApigeeConverter } from "./converter.js";
import { Proxy, Feature, Template } from "./interfaces.js";
import { ApigeeTemplaterService } from "./service.js";
import { GoogleAuth } from "google-auth-library";

const auth = new GoogleAuth({
  scopes: "https://www.googleapis.com/auth/cloud-platform",
});

import { stdin } from "process";

process.on("uncaughtException", function (e) {
  console.error(
    `${chalk.redBright("! Error: An unexpected error occurred. " + e.message)}`,
  );
});

/**
 * The CLI class parses and collects the user inputs, and generates / depoys the proxy on-demand.
 * @date 1/31/2022 - 8:47:32 AM
 *
 * @export
 * @class cli
 */
export class cli {
  converter = new ApigeeConverter("./", false);
  apigeeService = new ApigeeTemplaterService("./", false);

  parseArgumentsIntoOptions(rawArgs: string[]): cliArgs {
    const args = arg(
      {
        "--input": String,
        "--name": String,
        "--basePath": String,
        "--targetUrl": String,
        "--output": String,
        "--format": String,
        "--applyFeature": String,
        "--removeFeature": String,
        "--parameters": String,
        "--token": String,
        "--help": Boolean,
        "-i": "--input",
        "-n": "--name",
        "-b": "--basePath",
        "-u": "--targetUrl",
        "-o": "--output",
        "-f": "--format",
        "-a": "--applyFeature",
        "-r": "--removeFeature",
        "-p": "--parameters",
        "-t": "--token",
        "-h": "--help",
      },
      {
        argv: rawArgs.slice(2),
      },
    );
    return {
      input: args["--input"] || "",
      name: args["--name"] || "",
      basePath: args["--basePath"] || "",
      targetUrl: args["--targetUrl"] || "",
      output: args["--output"] || "",
      format: args["--format"] || "",
      applyFeature: args["--applyFeature"] || "",
      removeFeature: args["--removeFeature"] || "",
      parameters: args["--parameters"] || "",
      token: args["--token"] || "",
      help: args["--help"] || false,
    };
  }

  async promptForMissingOptions(options: cliArgs): Promise<cliArgs> {
    const questions: any[] = [];
    if (options.output.endsWith(".js"))
      options.output = options.output.replace(".js", ".json");
    if (options.output.endsWith(".yml"))
      options.output = options.output.replace(".yml", ".yaml");
    if (options.output.includes(":")) options.format = "proxy";

    if (!options.name) {
      if (options.output) {
        if (options.output.includes(":")) {
          let pieces = options.output.split(":");
          if (pieces.length > 1 && pieces[1]) options.name = pieces[1];
        } else {
          options.name = path.basename(
            options.output,
            path.extname(options.output),
          );
        }
      } else if (options.input && options.input.includes(":")) {
        let pieces = options.input.split(":");
        if (pieces.length > 1 && pieces[1]) options.name = pieces[1];
      } else if (options.input) {
        options.name = path.basename(
          options.input,
          path.extname(options.input),
        );
      } else {
        questions.push({
          type: "input",
          name: "name",
          message: "Let's create a new template! What should it be called?",
          default: "MyTemplate",
          transformer: (input: string) => {
            return input.replace(/ /g, "-");
          },
        });

        if (!options.basePath) {
          questions.push({
            type: "input",
            name: "basePath",
            message: "Which base path should be used, or none for now?",
            default: options.name ? "/" + options.name : "/v1/coolapi",
            transformer: (input: string) => {
              return input.replace(/ /g, "-");
            },
          });
        }

        if (!options.targetUrl) {
          questions.push({
            type: "input",
            name: "targetUrl",
            message: "Do you want to add a target url to receive traffic?",
            default: "https://httpbin.org",
            transformer: (input: string) => {
              return input.replace(/ /g, "-");
            },
          });
        }
      }
    }

    const answers = await inquirer.prompt(questions);

    if (answers.basePath && !answers.basePath.startsWith("/")) {
      answers.basePath = "/" + answers.basePath;
    }
    if (answers.targetUrl && !answers.targetUrl.startsWith("https://")) {
      answers.targetUrl = "https://" + answers.targetUrl;
    }

    return {
      ...options,
      name: options.name || answers.name,
      basePath: options.basePath || answers.basePath,
      targetUrl: options.targetUrl || answers.targetUrl,
      output: options.output || answers.output,
    };
  }

  printHelp() {
    console.log(
      `${chalk.bold(chalk.magentaBright("> Welcome to Apigee Templater! Here are all the parameters:"))}`,
    );
    for (const line of helpCommands) {
      console.log(
        `${line.name}: ${chalk.italic(chalk.magentaBright(line.description))} `,
      );
    }
  }

  processDataSpec(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let receivedData = "";
      stdin.on("data", (data) => {
        receivedData += data;
      });
      stdin.on("end", () => {
        // Input will have a \n appended
        // receivedData = receivedData.slice(0, -1);
        resolve(receivedData);
      });
    });
  }

  /**
   * Process the user inputs and generates / deploys the proxy
   * @date 1/31/2022 - 8:42:28 AM
   *
   * @async
   * @param {cliArgs} args The user input args to the process
   */
  async process(args: string[]) {
    if (!stdin.setRawMode) {
      // We have received raw data piped in, so do our spec generation
      let payloadInput = await this.processDataSpec();

      console.log(
        `${chalk.bold(chalk.magentaBright("> Data piping from stdin is not yet supported."))}`,
      );

      return;
    }

    let options: cliArgs = this.parseArgumentsIntoOptions(args);

    if (options.help) {
      this.printHelp();
      return;
    }

    if (!options.input) {
      console.log(
        `${chalk.bold(chalk.magentaBright("> Welcome to Apigee Templater"))}, ${chalk.green("use -h to view all command line options.")} `,
      );
    }

    options = await this.promptForMissingOptions(options);

    let template: Template | undefined = undefined;
    let feature: Feature | undefined = undefined;
    let proxy: Proxy | undefined = undefined;
    let startDir = process.cwd();
    // parse parameters
    let inputParameters: { [key: string]: string } = {};
    if (options.parameters) {
      let paramPairs = options.parameters.split(",");
      for (let paramPair of paramPairs) {
        let paramPieces = paramPair.split("=");
        if (paramPieces.length == 2 && paramPieces[0] && paramPieces[1])
          inputParameters[paramPieces[0]] = paramPieces[1];
      }
    }

    if (!options.input) {
      // create new template
      template = this.converter.templateCreate(
        options.name,
        options.basePath,
        options.targetUrl,
      );
      if (!options.output) options.output = options.name + ".yaml";
    } else if (options.input.includes(":")) {
      // this is an apigee proxy reference
      let pieces = options.input.split(":");
      if (pieces && pieces.length > 1 && pieces[0] && pieces[1]) {
        if (!options.token) {
          let token = await auth.getAccessToken();
          if (token) options.token = token;
        }
        let apigeePath = await this.apigeeService.apigeeProxyGet(
          pieces[1],
          pieces[0],
          "Bearer " + options.token,
        );
        if (apigeePath) {
          proxy = await this.converter.apigeeZipToProxy(
            options.name,
            apigeePath,
          );
          fs.rmSync(apigeePath);
        } else {
          // try shared flows
          let sharedFlowPath = await this.apigeeService.apigeeSharedFlowGet(
            pieces[1],
            pieces[0],
            "Bearer " + options.token,
          );

          if (sharedFlowPath) {
            proxy = await this.converter.apigeeSharedFlowZipToProxy(
              options.name,
              sharedFlowPath,
            );
            fs.rmSync(sharedFlowPath);
          }
        }

        if (proxy && !proxy.description)
          proxy.description = "Proxy for " + proxy.name;
      }
    } else if (fs.existsSync(options.input)) {
      let file = await this.loadFile(options.name, options.input);
      if (file && file["type"] === "template") template = file as Template;
      else if (file && file["type"] === "proxy") proxy = file as Proxy;
      else if (file && file["type"] === "feature") feature = file as Feature;
      else if (file) {
        console.log(
          `${chalk.bold(chalk.redBright(`> Error reading '${options.input}', could not determine its type: \n ${JSON.stringify(file, null, 2)}`))}`,
        );
        return;
      }
      // change working directory so that path resolutions will work
      let dirName = path.dirname(options.input);
      process.chdir(dirName);
    } else {
      // try to load it from remote repositories
      template = await this.apigeeService.templateGet(options.input);
      if (!template)
        feature = await this.apigeeService.featureGet(options.input);
    }

    if (!template && !proxy && !feature) {
      // as a last test, maybe the input is an apigee org and we can get a proxy list
      if (!options.token) {
        let token = await auth.getAccessToken();
        if (token) options.token = token;
      }
      let proxyList = await this.apigeeService.apigeeProxiesList(
        options.input,
        `Bearer ${options.token}`,
      );
      if (
        proxyList &&
        proxyList["proxies"] &&
        proxyList["proxies"].length > 0
      ) {
        console.log(
          `${chalk.bold(chalk.magentaBright(`> Apigee org ${options.input} proxies, get proxy info with -i '${options.input}:NAME'`))}`,
        );
        for (let proxy of proxyList["proxies"]) {
          console.log(` - ${proxy["name"]}`);
        }
      } else {
        console.log(
          `${chalk.bold(chalk.redBright(`> Input '${options.input}' could not be loaded, maybe incorrect spelling?`))}`,
        );
      }
      return;
    } else {
      if (options.applyFeature) {
        process.chdir(startDir);
        if (!options.output) options.output = options.input;
        let relativePath = options.applyFeature;
        if (fs.existsSync(options.applyFeature)) {
          // this is a path, get relative path
          relativePath = path.relative(
            path.dirname(options.output),
            options.applyFeature,
          );
        }
        let applyFeature = await this.apigeeService.featureGet(
          options.applyFeature,
        );

        if (template && applyFeature)
          template = this.converter.templateApplyFeature(
            template,
            applyFeature,
            relativePath,
            inputParameters,
          );
        else if (proxy && applyFeature) {
          proxy = this.converter.proxyApplyFeature(
            proxy,
            applyFeature,
            inputParameters,
          );
        }
      } else if (options.removeFeature) {
        process.chdir(startDir);
        if (!options.output) options.output = options.input;
        let relativePath = options.removeFeature;
        if (fs.existsSync(options.removeFeature)) {
          // this is a path, get relative path
          relativePath = path.relative(
            path.dirname(options.output),
            options.removeFeature,
          );
        }
        let removeFeature = await this.apigeeService.featureGet(
          options.removeFeature,
        );
        if (template && removeFeature)
          template = this.converter.templateRemoveFeature(
            template,
            removeFeature,
            relativePath,
          );
      }

      // generally print generated output overview
      if (proxy) {
        console.log(
          `${chalk.bold(chalk.magentaBright(`> Proxy ${proxy.name} overview: `))}`,
        );
        console.log(this.converter.proxyToString(proxy));
        if (!options.format) options.format = "proxy";
      } else if (template) {
        console.log(
          `${chalk.bold(chalk.magentaBright(`> Template ${template.name} overview: `))}`,
        );
        console.log(this.converter.templateToString(template));
        if (!options.format) options.format = "template";
      } else if (feature) {
        console.log(
          `${chalk.bold(chalk.magentaBright(`> Feature ${feature.name} overview: `))}`,
        );
        console.log(this.converter.featureToString(feature));
        if (!options.format) options.format = "feature";
      } else {
        console.log(
          `${chalk.bold(chalk.redBright(`> Input '${options.input}' could not be loaded, maybe incorrect spelling?`))}`,
        );
        return;
      }

      // write output
      if (
        options.output &&
        (options.output.toLowerCase().endsWith(".zip") ||
          options.output.toLowerCase().endsWith(".dir"))
      ) {
        let outputPath: string = "";
        if (template) {
          proxy = await this.apigeeService.templateObjectToProxy(
            template,
            this.converter,
            inputParameters,
          );
        } else if (feature) {
          proxy = this.converter.featureToProxy(feature, inputParameters);
        }
        process.chdir(startDir);
        let removeDir = options.output.toLowerCase().endsWith(".dir")
          ? false
          : true;
        if (proxy)
          outputPath = await this.converter.proxyToApigeeZip(proxy, removeDir);
        if (proxy && outputPath) {
          if (options.output.toLowerCase().endsWith(".dir")) {
            // remove zip
            fs.rmSync(outputPath);
            fs.cpSync(
              outputPath.replace(".zip", ""),
              options.output.replace(".dir", ""),
              { recursive: true },
            );
            fs.rmdirSync(outputPath.replace(".zip", ""), { recursive: true });
          } else if (
            outputPath != options.output &&
            outputPath != "./" + options.output
          ) {
            fs.copyFileSync(outputPath, options.output);
            fs.rmSync(outputPath);
          }

          console.log(
            `${chalk.bold(chalk.magentaBright("> Proxy written to " + options.output))}`,
          );
        } else {
          console.log(
            `${chalk.bold(chalk.redBright("> Error, could not write proxy zip."))}`,
          );
          return;
        }
      } else if (options.output && options.format == "proxy") {
        if (options.output.includes(":") && !inputParameters["PROJECT_ID"]) {
          // set PROJECT_ID with included project
          let pieces = options.output.split(":");
          if (pieces.length >= 1 && pieces[0])
            inputParameters["PROJECT_ID"] = pieces[0];
        }
        if (template) {
          proxy = await this.apigeeService.templateObjectToProxy(
            template,
            this.converter,
            inputParameters,
          );
        } else if (feature) {
          proxy = this.converter.featureToProxy(feature, inputParameters);
        }

        process.chdir(startDir);
        if (proxy) {
          if (options.output.toLowerCase().endsWith(".json")) {
            fs.writeFileSync(options.output, JSON.stringify(proxy, null, 2));
          } else if (options.output.toLowerCase().endsWith(".yaml")) {
            fs.writeFileSync(
              options.output,
              YAML.stringify(proxy, {
                aliasDuplicateObjects: false,
                blockQuote: "literal",
              }),
            );
          } else if (options.output.includes(":")) {
            let outputPath = await this.converter.proxyToApigeeZip(proxy);
            let pieces = options.output.split(":");
            let lastRevision = "";
            // export to apigee
            if (!options.token) {
              let token = await auth.getAccessToken();
              if (token) options.token = token;
            }
            if (pieces && pieces.length > 1 && pieces[0]) {
              lastRevision = await this.apigeeService.apigeeProxyExport(
                options.name,
                outputPath,
                pieces[0],
                "Bearer " + options.token,
              );
            }
            // deploy to apigee
            if (
              pieces &&
              pieces.length > 2 &&
              pieces[0] &&
              pieces[2] &&
              lastRevision
            ) {
              let serviceAccount = "";
              let environment = pieces[2];
              if (pieces.length === 4 && pieces[3]) serviceAccount = pieces[3];
              this.apigeeService.apigeeProxyRevisionDeploy(
                options.name,
                lastRevision,
                serviceAccount,
                environment,
                pieces[0],
                "Bearer " + options.token,
              );
            }

            // delete proxy zip
            fs.rmSync(outputPath);
          }

          console.log(
            `${chalk.bold(chalk.magentaBright("> Proxy written to " + options.output))}`,
          );
        } else {
          console.log(
            `${chalk.bold(chalk.redBright("> Error, could not create proxy."))}`,
          );
          return;
        }
      } else if (options.output && options.format == "template") {
        if (proxy) {
          template = this.converter.proxyToTemplate(proxy);
        }
        process.chdir(startDir);

        if (template) {
          this.converter.templateUpdateParamters(template, inputParameters);
          if (options.output.toLowerCase().endsWith(".json")) {
            fs.writeFileSync(options.output, JSON.stringify(template, null, 2));
          } else if (options.output.toLowerCase().endsWith(".yaml")) {
            fs.writeFileSync(
              options.output,
              YAML.stringify(template, {
                aliasDuplicateObjects: false,
                blockQuote: "literal",
              }),
            );
          }

          console.log(
            `${chalk.bold(chalk.magentaBright("> Template written to " + options.output))}`,
          );
        }
      } else if (options.output && options.format == "feature") {
        if (proxy) {
          feature = this.converter.proxyToFeature(proxy);
        }
        process.chdir(startDir);
        if (feature) {
          this.converter.featureUpdateParameters(feature, inputParameters);
          if (options.output.toLowerCase().endsWith(".json")) {
            fs.writeFileSync(options.output, JSON.stringify(feature, null, 2));
          } else if (options.output.toLowerCase().endsWith(".yaml")) {
            fs.writeFileSync(
              options.output,
              YAML.stringify(feature, {
                aliasDuplicateObjects: false,
                blockQuote: "literal",
              }),
            );
          }

          console.log(
            `${chalk.bold(chalk.magentaBright("> Feature written to " + options.output))}`,
          );
        }
      }
    }
  }

  async loadFile(name: string, inputPath: string): Promise<any | undefined> {
    return new Promise(async (resolve, reject) => {
      let input: any | undefined = undefined;

      if (inputPath.toLowerCase().endsWith(".zip")) {
        input = await this.converter.apigeeZipToProxy(name, inputPath);
      } else if (
        inputPath.toLowerCase().endsWith(".yaml") ||
        inputPath.toLowerCase().endsWith(".yml")
      ) {
        let inputString = fs.readFileSync(inputPath, "utf8");
        if (inputString) input = YAML.parse(inputString);
      } else if (
        inputPath.toLowerCase().endsWith(".json") ||
        inputPath.toLowerCase().endsWith(".js")
      ) {
        let inputString = fs.readFileSync(inputPath, "utf8");
        if (inputString) input = JSON.parse(inputString);
      } else {
        // try to load extracted proxy zip dir
        input = this.converter.apigeeFolderToProxy(name, inputPath);
      }

      if (input) {
        resolve(input);
      } else {
        resolve(undefined);
      }
    });
  }
}

class cliArgs {
  input = "";
  name = "";
  basePath = "";
  targetUrl = "";
  output = "";
  format = "";
  applyFeature = "";
  removeFeature = "";
  parameters = "";
  token = "";
  help = false;
}

const helpCommands = [
  {
    name: "--input, -i",
    description:
      "Input path to ZIP, JSON or YAML file, or an Apigee proxy in ORG:PROXY format.",
  },
  {
    name: "--name, -n",
    description: "The name for the output template, feature or proxy.",
  },
  {
    name: "--output, -o",
    description:
      "An optional file output name and type (e.g. AI-Template-v1.yaml).",
  },
  {
    name: "--format, -f",
    description:
      "An optional format to convert the input into: 'proxy', 'template' or 'feature'.",
  },
  {
    name: "--applyFeature, -a",
    description: "A feature name or path to apply to a template.",
  },
  {
    name: "--removeFeature, -r",
    description: "A feature name or path to remove from a template",
  },
  {
    name: "--basePath, -b",
    description: "If creating a new proxy or template, the base path to use.",
  },
  {
    name: "--targetUrl, -u",
    description: "If creating a new proxy or template, the target URL to use.",
  },
  {
    name: "--parameters, -p",
    description:
      "If generating a proxy from a template, these parameters are used for substitutions (param1=value1,param2=value2).",
  },
  {
    name: "--token, -t",
    description: "A Google Cloud token to use with the Apigee API",
  },
];

export default cli;
