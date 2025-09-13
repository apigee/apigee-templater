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
        "--file": String,
        "--name": String,
        "--basePath": String,
        "--targetUrl": String,
        "--outputFormat": String,
        "--applyFeatureFile": String,
        "--removeFeatureFile": String,
        "--help": Boolean,
        "-f": "--file",
        "-n": "--name",
        "-b": "--basePath",
        "-t": "--targetUrl",
        "-o": "--outputFormat",
        "-a": "--applyFeature",
        "-r": "--removeFeature",
        "-h": "--help",
      },
      {
        argv: rawArgs.slice(2),
      },
    );
    return {
      file: args["--file"] || "",
      name: args["--name"] || "",
      basePath: args["--basePath"] || "",
      targetUrl: args["--targetUrl"] || "",
      outputFormat: args["--outputFormat"] || "",
      applyFeatureFile: args["--applyFeatureFile"] || "",
      removeFeatureFile: args["--removeFeatureFile"] || "",
      help: args["--help"] || false,
    };
  }

  async promptForMissingOptions(options: cliArgs): Promise<cliArgs> {
    const questions: any[] = [];
    if (!options.name) {
      let defaultName = "MyAPI";
      if (options.file)
        defaultName = path.basename(options.file, path.extname(options.file));

      questions.push({
        type: "input",
        name: "name",
        message: "What should the proxy be named?",
        default: defaultName,
        transformer: (input: string) => {
          return input.replace(/ /g, "-");
        },
      });
    }

    if (!options.outputFormat) {
      questions.push({
        type: "list",
        name: "outputFormat",
        message: "Which output format should be used?",
        choices: [
          "proxy-zip",
          "proxy-json",
          "proxy-yaml",
          "template-json",
          "template-yaml",
          "feature-json",
          "feature-yaml",
        ],
        default: "proxy-yaml",
      });
    }

    if (!options.file) {
      if (!options.basePath) {
        questions.push({
          type: "input",
          name: "basePath",
          message: "Which base path should the proxy use?",
          default: "/my-proxy",
          transformer: (input: string) => {
            return input.replace(/ /g, "-");
          },
        });
      }

      if (!options.targetUrl) {
        questions.push({
          type: "input",
          name: "targetUrl",
          message: "Which target URL should be used?",
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
      outputFormat: options.outputFormat || answers.outputFormat,
    };
  }

  printHelp() {
    console.log("");
    console.log(`${chalk.bold(chalk.magentaBright("> Simple examples:"))}`);
    console.log(
      `> apigee-templater ${chalk.italic(chalk.magentaBright("# Start interactive mode to enter the parameters."))}`,
    );
    console.log(
      `> apigee-templater -n TestProxy -b /httpbin -t https://httpbin.org' ${chalk.italic(chalk.magentaBright("# Create a proxy called TestProxy with the base path /test to target https://httpbin.org > will produce a TestProxy.zip bundle."))}`,
    );
    console.log(
      `> apigee-templater -f ./input-proxy.zip -o json' ${chalk.italic(chalk.magentaBright("# Convert an Apigee proxy from zip to json format."))}`,
    );
    console.log(
      `> apigee-templater -f ./input-proxy.zip -o zip -a ./auth-apikey-header.json' ${chalk.italic(chalk.magentaBright("# Apply the feature auth-apikey-header to input-proxy and return in zip format."))}`,
    );

    console.log("");
    console.log(`${chalk.bold(chalk.magentaBright("All parameters:"))}`);
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

    console.log(
      `${chalk.bold(chalk.magentaBright("> Welcome to Apigee Templater"))}, ${chalk.green("use -h for more command line options.")} `,
    );

    if (options.help) {
      this.printHelp();
      return;
    }

    options = await this.promptForMissingOptions(options);

    let template: Template | undefined = undefined;
    let feature: Feature | undefined = undefined;
    let proxy: Proxy | undefined = undefined;

    if (!options.file) {
      // create new template
      template = this.apigeeService.templateCreate(
        options.name,
        options.basePath,
        options.targetUrl,
        this.converter,
      );
    } else if (fs.existsSync(options.file)) {
      let file = await this.loadFile(options.name, options.file);
      if (file && file instanceof Template) template = file as Template;
      else if (file && file instanceof Proxy) proxy = file as Proxy;
    }

    if (!template && !proxy) {
      console.log(
        `${chalk.bold(chalk.redBright("> File could not be loaded, maybe the file or name is wrong?"))}`,
      );
      return;
    } else {
      // if (options.applyFeatureFile || options.removeFeatureFile) {
      //   let featureString = fs.readFileSync(options.applyFeatureFile, "utf8");
      //   if (!featureString) {
      //     console.log(
      //       `${chalk.bold(chalk.redBright("> Feature could not be loaded, maybe the file or name is wrong?"))}`,
      //     );
      //     return;
      //   } else {
      //     if (options.applyFeatureFile) {
      //       let feature = JSON.parse(options.applyFeatureFile);
      //       template = this.converter.proxyApplyFeature(template, feature);
      //     } else if (options.removeFeatureFile) {
      //       let feature = JSON.parse(options.removeFeatureFile);
      //       template = this.converter.jsonRemoveFeature(template, feature);
      //     }
      //   }
      // }

      if (options.outputFormat.toLowerCase() === "proxy-zip") {
        let outputPath: string = "";
        if (template) {
          proxy = await this.apigeeService.templateToProxy(
            options.name,
            this.converter,
          );
        }

        if (proxy) outputPath = await this.converter.proxyToApigeeZip(proxy);
        if (proxy && outputPath)
          console.log(
            `${chalk.bold(chalk.magentaBright("> Proxy successfully written to " + outputPath))}`,
          );
        else {
          console.log(
            `${chalk.bold(chalk.redBright("> Error, could not convert to proxy-zip."))}`,
          );
          return;
        }
      } else if (options.outputFormat.startsWith("proxy-")) {
        if (template) {
          proxy = await this.apigeeService.templateObjectToProxy(
            template,
            this.converter,
          );
        }

        if (proxy) {
          if (options.outputFormat.endsWith("-json")) {
            fs.writeFileSync(
              "./" + proxy.name + ".yaml",
              JSON.stringify(proxy, null, 2),
            );
          } else if (options.outputFormat.endsWith("-yaml")) {
            fs.writeFileSync(
              "./" + proxy.name + ".yaml",
              YAML.stringify(proxy, null, 2),
            );
          }

          console.log(
            `${chalk.bold(chalk.magentaBright("> Proxy successfully written to ./" + proxy.name + ".yaml"))}`,
          );
        }
      } else if (options.outputFormat.startsWith("template-")) {
        if (proxy) {
          template = this.converter.proxyToTemplate(proxy);
        }

        if (template) {
          if (options.outputFormat.endsWith("-json")) {
            fs.writeFileSync(
              "./" + template.name + ".yaml",
              JSON.stringify(template, null, 2),
            );
          } else if (options.outputFormat.endsWith("-yaml")) {
            fs.writeFileSync(
              "./" + template.name + ".yaml",
              YAML.stringify(template, null, 2),
            );
          }

          console.log(
            `${chalk.bold(chalk.magentaBright("> Template successfully written to ./" + template.name + ".yaml"))}`,
          );
        }
      } else if (options.outputFormat.startsWith("feature-")) {
        if (proxy) {
          feature = this.converter.proxyToFeature(proxy);
        }

        if (feature) {
          if (options.outputFormat.endsWith("-json")) {
            fs.writeFileSync(
              "./" + feature.name + ".yaml",
              JSON.stringify(feature, null, 2),
            );
          } else if (options.outputFormat.endsWith("-yaml")) {
            fs.writeFileSync(
              "./" + feature.name + ".yaml",
              YAML.stringify(feature, null, 2),
            );
          }

          console.log(
            `${chalk.bold(chalk.magentaBright("> Feature successfully written to ./" + feature.name + ".yaml"))}`,
          );
        }

        // console.log(
        //   `${chalk.green(">")} Flow ${chalk.bold(chalk.blue(generateResult.template.name))} generated to ${chalk.magentaBright(chalk.bold(generateResult.localPath))} in ${chalk.bold(chalk.green(Math.round(generateResult.duration) + " milliseconds"))}.`,
        // );
      }
    }
  }

  async loadFile(
    name: string,
    inputPath: string,
  ): Promise<Proxy | Template | undefined> {
    return new Promise(async (resolve, reject) => {
      let input: any | undefined = undefined;

      if (inputPath.toLowerCase().endsWith(".zip")) {
        let proxy = await this.converter.apigeeZipToProxy(name, inputPath);
        resolve(proxy);
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
      }

      if (input) {
        if (input["type"] && input["type"] == "proxy") {
          resolve(input as Proxy);
        } else if (input["type"] && input["type"] == "template") {
          resolve(input as Template);
        }
      }
    });
  }
}

class cliArgs {
  file = "";
  name = "";
  basePath = "";
  targetUrl = "";
  outputFormat = "";
  applyFeatureFile = "";
  removeFeatureFile = "";
  help = false;
}

const helpCommands = [
  {
    name: "--file, -f",
    description:
      "Path to an input proxy file in either ZIP, JSON, or YAML format.",
  },
  {
    name: "--name, -n",
    description: "The name for the output proxy.",
  },
  {
    name: "--applyFeatureFile, -a",
    description: "The path to a feature file to apply to the proxy.",
  },
  {
    name: "--removeFeatureFile, -r",
    description: "The path to a feature file to remove from the proxy.",
  },
  {
    name: "--outputFormat, -o",
    description:
      "The output format to save the resulting proxy to, either proxy-zip, proxy-json, proxy-yaml, template-json, template-yaml, feature-json, feature-yaml.",
  },
  {
    name: "--basePath, -b",
    description: "If creating a new proxy, the base path to use.",
  },
  {
    name: "--targetUrl, -t",
    description: "If creating a new proxy, the target URL to use.",
  },
];

export default cli;
