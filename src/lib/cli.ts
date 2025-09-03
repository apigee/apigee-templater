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
import { performance } from "perf_hooks";
import inquirer from "inquirer";
import chalk from "chalk";
import * as YAML from "yaml";
import { ApigeeConverter } from "./converter.js";
import { Proxy, Feature } from "./interfaces.js";
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
      questions.push({
        type: "input",
        name: "name",
        message: "What should the proxy be named?",
        default: "MyProxy",
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
        choices: ["json", "yaml", "zip"],
        default: "json",
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

    let proxy: Proxy | undefined = undefined;

    if (!options.file) {
      // create new proxy
      proxy = this.apigeeService.proxyCreate(
        options.name,
        options.basePath,
        options.targetUrl,
        this.converter,
      );
    } else {
      // We have a file input, let's check if local or remote..
      if (fs.existsSync(options.file)) {
        proxy = await this.loadFile(options.name, options.file);
      } else {
        console.log(
          `${chalk.bold(chalk.redBright("> Proxy could not be loaded, maybe the file or name is wrong?"))}`,
        );
        return;
      }
    }

    if (!proxy) {
      console.log(
        `${chalk.bold(chalk.redBright("> Proxy could not be loaded, maybe the file or name is wrong?"))}`,
      );
      return;
    } else {
      if (options.applyFeatureFile || options.removeFeatureFile) {
        let featureString = fs.readFileSync(options.applyFeatureFile, "utf8");
        if (!featureString) {
          console.log(
            `${chalk.bold(chalk.redBright("> Feature could not be loaded, maybe the file or name is wrong?"))}`,
          );
          return;
        } else {
          if (options.applyFeatureFile) {
            let feature = JSON.parse(options.applyFeatureFile);
            proxy = this.converter.jsonApplyFeature(proxy, feature);
          } else if (options.removeFeatureFile) {
            let feature = JSON.parse(options.removeFeatureFile);
            proxy = this.converter.jsonRemoveFeature(proxy, feature);
          }
        }
      }

      if (
        options.outputFormat.toLowerCase() === "zip" ||
        options.outputFormat.toLowerCase() === "xml"
      ) {
        let outputPath: string = await this.converter.jsonToZip(
          options.name,
          proxy,
        );
        console.log(
          `${chalk.bold(chalk.magentaBright("> Proxy successfully written to " + outputPath))}`,
        );
        return;
      } else if (
        options.outputFormat.toLowerCase() === "yaml" ||
        options.outputFormat.toLowerCase() === "yml"
      ) {
        fs.writeFileSync("./" + proxy.name + ".yaml", YAML.stringify(proxy));
        console.log(
          `${chalk.bold(chalk.magentaBright("> Proxy successfully written to ./" + proxy.name + ".yaml"))}`,
        );
        return;
      } else if (
        options.outputFormat.toLowerCase() === "json" ||
        options.outputFormat.toLowerCase() === "js"
      ) {
        fs.writeFileSync(
          "./" + proxy.name + ".json",
          JSON.stringify(proxy, null, 2),
        );
        console.log(
          `${chalk.bold(chalk.magentaBright("> Proxy successfully written to ./" + proxy.name + ".json"))}`,
        );
        return;
      }
    }

    // console.log(
    //   `${chalk.green(">")} Flow ${chalk.bold(chalk.blue(generateResult.template.name))} generated to ${chalk.magentaBright(chalk.bold(generateResult.localPath))} in ${chalk.bold(chalk.green(Math.round(generateResult.duration) + " milliseconds"))}.`,
    // );
  }

  async loadFile(name: string, inputPath: string): Promise<Proxy | undefined> {
    return new Promise<Proxy | undefined>(async (resolve, reject) => {
      let proxy: Proxy | undefined = undefined;
      if (inputPath.toLowerCase().endsWith(".zip")) {
        proxy = await this.converter.zipToJson(name, inputPath);
      } else if (
        inputPath.toLowerCase().endsWith(".yaml") ||
        inputPath.toLowerCase().endsWith(".yml")
      ) {
        let proxyString = fs.readFileSync(inputPath, "utf8");
        if (proxyString) proxy = YAML.parse(proxyString);
      } else if (
        inputPath.toLowerCase().endsWith(".json") ||
        inputPath.toLowerCase().endsWith(".js")
      ) {
        let proxyString = fs.readFileSync(inputPath, "utf8");
        if (proxyString) proxy = JSON.parse(proxyString);
      }

      resolve(proxy);
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
      "The output format to save the resulting proxy to, either ZIP, JSON or YAML.",
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
