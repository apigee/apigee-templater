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
import { performance } from "perf_hooks";
import inquirer from "inquirer";
import chalk from "chalk";
import * as YAML from "yaml";
import { ApigeeConverter } from "./converter.js";
import { Proxy, Feature, Template } from "./interfaces.js";
import { ApigeeTemplaterService } from "./service.js";

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
  converter = new ApigeeConverter("./", "./", "./");
  apigeeService = new ApigeeTemplaterService("./", "./", "./");

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
      token: args["--token"] || "",
      help: args["--help"] || false,
    };
  }

  async promptForMissingOptions(options: cliArgs): Promise<cliArgs> {
    const questions: any[] = [];
    if (options.output.endsWith(".js"))
      options.output = options.output.replace(".js", ".json");
    if (options.output.endsWith("-yml"))
      options.output = options.output.replace(".yml", ".yaml");

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
          message: "Which name should be used?",
          default: "MyProxy",
          transformer: (input: string) => {
            return input.replace(/ /g, "-");
          },
        });
      }

      // if (
      //   options.output &&
      //   (options.output.endsWith("-json") ||
      //     options.output.endsWith("-yaml") ||
      //     options.output.endsWith("-zip"))
      // )
      //   questions.push({
      //     type: "input",
      //     name: "name",
      //     message: "Which name should be used?",
      //     default: defaultName,
      //     transformer: (input: string) => {
      //       return input.replace(/ /g, "-");
      //     },
      //   });
      // else options.name = defaultName;
    }

    // if (!options.output) {
    //   questions.push({
    //     type: "list",
    //     name: "outputFormat",
    //     message: "Which output format should be used?",
    //     choices: [
    //       "proxy-zip",
    //       "proxy-json",
    //       "proxy-yaml",
    //       "template-json",
    //       "template-yaml",
    //       "feature-json",
    //       "feature-yaml",
    //     ],
    //     default: "proxy-yaml",
    //   });
    // }

    if (!options.input) {
      if (!options.basePath) {
        questions.push({
          type: "input",
          name: "basePath",
          message: "Which base path be used?",
          default: options.name ? "/" + options.name : "/my-proxy",
          transformer: (input: string) => {
            return input.replace(/ /g, "-");
          },
        });
      }

      if (!options.targetUrl) {
        questions.push({
          type: "input",
          name: "targetUrl",
          message: "Add an optional target?",
          default: "https://httpbin.org",
          transformer: (input: string) => {
            return input.replace(/ /g, "-");
          },
        });
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
      `${chalk.bold(chalk.magentaBright("> Welcome to Apigee Templater. All parameters:"))}`,
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

    if (!options.input) {
      // create new template
      template = this.converter.templateCreate(
        options.name,
        options.basePath,
        options.targetUrl,
      );
      if (!options.output) options.output = options.name + ".json";
    } else if (options.input.includes(":")) {
      // this is an apigee proxy reference
      let pieces = options.input.split(":");
      if (pieces && pieces.length > 1 && pieces[0] && pieces[1]) {
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
        }
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
    } else {
      // try to load it from remote repositories
      template = await this.apigeeService.templateGet(options.input);
      if (!template)
        feature = await this.apigeeService.featureGet(options.input);
    }

    if (!template && !proxy && !feature) {
      // as a last test, maybe the input is an apigee org and we can get a proxy list
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
        let applyFeature = await this.apigeeService.featureGet(
          options.applyFeature,
        );
        if (template && applyFeature)
          template = this.converter.templateApplyFeature(
            template,
            applyFeature,
          );
        else if (proxy && applyFeature)
          proxy = this.converter.proxyApplyFeature(proxy, applyFeature);
      } else if (options.removeFeature) {
        let removeFeature = await this.apigeeService.featureGet(
          options.applyFeature,
        );
        if (template && removeFeature)
          template = this.converter.templateRemoveFeature(
            template,
            removeFeature,
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
          );
        }
        let removeDir = options.output.toLowerCase().endsWith(".dir")
          ? false
          : true;
        if (proxy)
          outputPath = await this.converter.proxyToApigeeZip(proxy, removeDir);
        if (proxy && outputPath) {
          console.log(
            `${chalk.bold(chalk.magentaBright("> Proxy written to " + outputPath))}`,
          );

          if (options.output.toLowerCase().endsWith(".dir")) {
            // remove zip
            fs.rmSync(outputPath);
            fs.cpSync(
              outputPath.replace(".zip", ""),
              options.output.replace(".dir", ""),
              { recursive: true },
            );
            fs.rmdirSync(outputPath.replace(".zip", ""), { recursive: true });
          } else {
            fs.copyFileSync(outputPath, options.output);
            fs.rmSync(outputPath);
          }
        } else {
          console.log(
            `${chalk.bold(chalk.redBright("> Error, could not write proxy zip."))}`,
          );
          return;
        }
      } else if (options.output && options.format == "proxy") {
        if (template) {
          proxy = await this.apigeeService.templateObjectToProxy(
            template,
            this.converter,
          );
        }
        if (proxy) {
          if (options.output.toLowerCase().endsWith(".json")) {
            fs.writeFileSync(options.output, JSON.stringify(proxy, null, 2));
          } else if (options.output.toLowerCase().endsWith(".yaml")) {
            fs.writeFileSync(
              options.output,
              YAML.stringify(proxy, { aliasDuplicateObjects: false }),
            );
          } else if (options.output.toLowerCase().includes(":")) {
            let outputPath = await this.converter.proxyToApigeeZip(proxy);
            let pieces = options.output.split(":");
            let lastRevision = "";
            // export to apigee
            if (pieces && pieces.length > 1 && pieces[0]) {
              lastRevision = await this.apigeeService.apigeeProxyExport(
                options.name,
                outputPath,
                pieces[0],
                options.token,
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
                options.token,
              );
            }
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

        if (template) {
          if (options.output.toLowerCase().endsWith(".json")) {
            fs.writeFileSync(options.output, JSON.stringify(template, null, 2));
          } else if (options.output.toLowerCase().endsWith(".yaml")) {
            fs.writeFileSync(
              options.output,
              YAML.stringify(template, { aliasDuplicateObjects: false }),
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

        if (feature) {
          if (options.output.toLowerCase().endsWith(".json")) {
            fs.writeFileSync(options.output, JSON.stringify(feature, null, 2));
          } else if (options.output.toLowerCase().endsWith(".yaml")) {
            fs.writeFileSync(
              options.output,
              YAML.stringify(feature, { aliasDuplicateObjects: false }),
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
    name: "--applyFeature, -a",
    description: "A feature name to apply to a template.",
  },
  {
    name: "--removeFeature, -r",
    description: "A feature name to remove from a template",
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
    name: "--basePath, -b",
    description: "If creating a new proxy or template, the base path to use.",
  },
  {
    name: "--targetUrl, -u",
    description: "If creating a new proxy or template, the target URL to use.",
  },
  {
    name: "--token, -t",
    description: "A Google Cloud token to use with the Apigee API",
  },
];

export default cli;
