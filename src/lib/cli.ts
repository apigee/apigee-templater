/**
 * Copyright 2022-2026 Google LLC
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
import { version } from "./version.js";
import { CompletionManager } from "./completion.js";
import { stdin } from "process";

const auth = new GoogleAuth({
  scopes: "https://www.googleapis.com/auth/cloud-platform",
});

process.on("uncaughtException", function (e) {
  console.error(`\n${chalk.bgRed.white.bold(" ERROR ")} ${chalk.red(e.message)}\n`);
});

/**
 * The CLI class parses and collects user inputs, and generates / deploys Apigee proxies, features and templates.
 */
export class cli {
  converter = new ApigeeConverter("./", false);
  apigeeService = new ApigeeTemplaterService("./", false);

  private printLogo() {
    const vStr = ("v" + version).padEnd(8);
    const logoText = `
  ┌───────────────────────────────────────────────────────────┐
  │            _   _                                          │
  │     __ _  / _| | |_         APIGEE                        │
  │    / _\` || |_  |  _|        FEATURE                       │
  │   | (_| ||  _| | |_         TEMPLATER                     │
  │    \\__,_||_|    \\__|                            ${vStr}  │
  └───────────────────────────────────────────────────────────┘`;
    console.log(chalk.cyan.bold(logoText));
  }

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
        "--listFeatures": Boolean,
        "--parameters": String,
        "--token": String,
        "--help": Boolean,
        "--version": Boolean,
        "--config": String,
        "--drz": String,
        "-i": "--input",
        "-n": "--name",
        "-b": "--basePath",
        "-u": "--targetUrl",
        "-o": "--output",
        "-f": "--format",
        "-a": "--applyFeature",
        "-r": "--removeFeature",
        "-l": "--listFeatures",
        "-p": "--parameters",
        "-t": "--token",
        "-h": "--help",
        "-v": "--version",
        "-c": "--config",
        "-d": "--drz",
      },
      {
        argv: rawArgs.slice(2),
      },
    );

    if ((args["--applyFeature"] || args["--removeFeature"]) && args["_"] && args["_"][0]) {
      args["--input"] = args["_"][0];
    } else if (args["_"] && args["_"][0] && args["--output"]) {
      args["--input"] = args["_"][0];
    } else if (args["_"] && args["_"][0]) {
      args["--output"] =
        !args["_"][0].toLowerCase().endsWith(".yaml") &&
        !args["_"][0].toLowerCase().endsWith(".json")
          ? args["_"][0] + ".yaml"
          : args["_"][0];
    }

    return {
      input: args["--input"] || "",
      name: args["--name"] || "",
      basePath: args["--basePath"] || "",
      targetUrl: args["--targetUrl"] || "",
      output: args["--output"] || "",
      format: args["--format"] || "",
      applyFeature: args["--applyFeature"] || "",
      removeFeature: args["--removeFeature"] || "",
      listFeatures: args["--listFeatures"] || false,
      parameters: args["--parameters"] || "",
      token: args["--token"] || "",
      help: args["--help"] || false,
      version: args["--version"] || false,
      config: args["--config"] || "",
      drz: args["--drz"] || "",
    };
  }

  async promptForMissingOptions(options: cliArgs): Promise<cliArgs> {
    const questions: any[] = [];

    if (options.output.includes(":")) {
      options.format = "proxy";
    }

    if (!options.name) {
      options.name = this.sanitizeName(options.output, options.input);
      if (options.name && options.output.endsWith(":")) {
        options.output += options.name;
      } else if (
        options.name &&
        fs.existsSync(options.output) &&
        fs.lstatSync(options.output).isDirectory()
      ) {
        if (!options.output.endsWith("/")) options.output += "/";
        options.output += options.name + ".yaml";
      } else if (options.name && options.input.endsWith(":")) {
        options.input += options.name;
      }

      // interactive mode
      if (!options.name && !options.input && !options.output) {
        questions.push({
          type: "input",
          name: "name",
          message: chalk.cyan("Let's create a new template! What should it be called?"),
          default: "MyTemplate",
          transformer: (input: string) => {
            return input.replace(/ /g, "-");
          },
        });

        if (!options.basePath) {
          questions.push({
            type: "input",
            name: "basePath",
            message: chalk.cyan("Which base path should be used, or none for now?"),
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
            message: chalk.cyan("Do you want to add a target url to receive traffic?"),
            default: "https://mocktarget.apigee.net",
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

  sanitizeName(primary: string, secondary: string): string {
    let result = "";
    if (primary.includes(":")) {
      let pieces = primary.split(":");
      if (pieces.length > 1 && pieces[1]) result = pieces[1];
      else {
        result = this.sanitizeName(secondary, "");
      }
    } else if (
      primary.toLowerCase().endsWith(".yaml") ||
      primary.toLowerCase().endsWith(".json") ||
      primary.toLowerCase().endsWith(".zip")
    ) {
      result = path.basename(primary, path.extname(primary));
    } else if (primary) {
      result = this.sanitizeName(secondary, "");
    }

    return result;
  }

  printHelp() {
    this.printLogo();
    console.log(
      `\n  ${chalk.bold.magenta("Apigee Feature Templater")} ${chalk.cyan(`v${version}`)}`
    );
    console.log(`  ${chalk.white("Provides tooling for feature development of Apigee proxies using YAML, JSON, and ZIP formats.")}\n`);

    console.log(`  ${chalk.bold.cyan("USAGE:")}`);
    console.log(`    ${chalk.green("aft")} ${chalk.yellow("[options]")} ${chalk.dim("[<input> | <output>]")}`);
    console.log(`    ${chalk.green("aft")} ${chalk.yellow("completion <install | zsh | bash | fish | powershell>")}\n`);

    console.log(`  ${chalk.bold.cyan("COMMANDS:")}`);
    console.log(`    ${chalk.bold.yellow("completion".padEnd(22))} ${chalk.white("Install or display shell tab-completion scripts (install, uninstall, zsh, bash, fish, powershell).")}\n`);

    console.log(`  ${chalk.bold.cyan("OPTIONS:")}`);
    for (const cmd of helpCommands) {
      const flags = chalk.bold.yellow(cmd.name.padEnd(22));
      const desc = chalk.white(cmd.description);
      console.log(`    ${flags} ${desc}`);
    }
    console.log();
  }

  handleCompletionCommand(target?: string) {
    if (target === "install") {
      CompletionManager.install();
    } else if (target === "uninstall") {
      CompletionManager.uninstall();
    } else if (target === "bash") {
      console.log(CompletionManager.getBashScript().trim());
    } else if (target === "zsh") {
      console.log(CompletionManager.getZshScript().trim());
    } else if (target === "fish") {
      console.log(CompletionManager.getFishScript().trim());
    } else if (target === "powershell" || target === "pwsh" || target === "ps") {
      console.log(CompletionManager.getPowerShellScript().trim());
    } else {
      CompletionManager.printInstructions();
    }
  }

  async handleCompletion(prevWord: string, currentWord: string) {
    try {
      if (["-a", "--applyFeature", "-r", "--removeFeature"].includes(prevWord)) {
        const features = await this.apigeeService.featuresList();
        const featureNames = features.map((f) => f.name);

        const localFiles: string[] = [];
        try {
          let targetDir = ".";
          if (currentWord.includes("/")) {
            if (currentWord.endsWith("/")) {
              targetDir = currentWord.replace(/\/+$/, "");
            } else {
              targetDir = path.dirname(currentWord);
            }
          }

          if (fs.existsSync(targetDir)) {
            const entries = fs.readdirSync(targetDir, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.isDirectory()) {
                if (!entry.name.startsWith(".")) {
                  const dirPath = targetDir === "." ? `${entry.name}/` : `${targetDir}/${entry.name}/`;
                  if (!currentWord || dirPath.startsWith(currentWord)) {
                    localFiles.push(dirPath);
                  }
                }
              } else if (
                entry.name.endsWith(".yaml") ||
                entry.name.endsWith(".yml") ||
                entry.name.endsWith(".json")
              ) {
                const filePath = targetDir === "." ? entry.name : `${targetDir}/${entry.name}`;
                if (!currentWord || filePath.startsWith(currentWord)) {
                  localFiles.push(filePath);
                }
              }
            }
          }
        } catch (e) {}

        const allCandidates = Array.from(new Set([...featureNames, ...localFiles])).filter(
          (name) => !currentWord || name.startsWith(currentWord)
        );
        if (allCandidates.length > 0) {
          console.log(allCandidates.join("\n"));
        }
        return;
      }

      if (["-f", "--format"].includes(prevWord)) {
        const formats = ["proxy", "template", "feature"].filter(
          (fmt) => !currentWord || fmt.startsWith(currentWord)
        );
        if (formats.length > 0) console.log(formats.join("\n"));
        return;
      }

      if (["-d", "--drz"].includes(prevWord)) {
        const regions = ["us", "eu", "in"].filter(
          (r) => !currentWord || r.startsWith(currentWord)
        );
        if (regions.length > 0) console.log(regions.join("\n"));
        return;
      }

      if (prevWord === "completion") {
        const actions = ["install", "uninstall", "zsh", "bash", "fish", "powershell", "pwsh"].filter(
          (a) => !currentWord || a.startsWith(currentWord)
        );
        if (actions.length > 0) console.log(actions.join("\n"));
        return;
      }

      if (currentWord.startsWith("-")) {
        const flags = [
          "--input",
          "--name",
          "--basePath",
          "--targetUrl",
          "--output",
          "--format",
          "--applyFeature",
          "--removeFeature",
          "--listFeatures",
          "--parameters",
          "--token",
          "--config",
          "--drz",
          "--help",
          "--version",
          "-i",
          "-n",
          "-b",
          "-u",
          "-o",
          "-f",
          "-a",
          "-r",
          "-l",
          "-p",
          "-t",
          "-c",
          "-d",
          "-h",
          "-v",
        ].filter((flag) => flag.startsWith(currentWord));
        if (flags.length > 0) console.log(flags.join("\n"));
        return;
      }

      if (currentWord === "completion") {
        console.log("completion");
        return;
      }

      // No output: shell automatically falls back to standard file / path completion
    } catch (e) {
      // Suppress errors during completion
    }
  }

  printVersion() {
    this.printLogo();
    console.log(`  ${chalk.bold.magenta("Apigee Feature Templater")} ${chalk.bold.yellow("v" + version)}\n`);
  }

  async printFeatures() {
    this.printLogo();
    console.log(`\n  ${chalk.bold.cyan("📦 Available Apigee Features:")}\n`);

    let allFeatures = await this.apigeeService.featuresList();

    if (allFeatures.length === 0) {
      console.log(`    ${chalk.yellow("No features found in repository.")}\n`);
      return;
    }

    for (let feature of allFeatures) {
      const nameBadge = chalk.bgMagenta.white.bold(` ${feature.name.padEnd(20)} `);
      const desc = chalk.italic.white(feature.description || "No description");
      console.log(`    ${nameBadge} ${desc}`);
    }
    console.log(`\n  ${chalk.dim(`Total features available: ${allFeatures.length}`)}\n`);
  }

  processDataSpec(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let receivedData = "";
      stdin.on("data", (data) => {
        receivedData += data;
      });
      stdin.on("end", () => {
        resolve(receivedData);
      });
    });
  }

  installSkill() {
    try {
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      if (!homeDir) return;

      const targetBaseDirs = [path.join(homeDir, ".agents", "skills")];

      const currentFileDir = path.dirname(new URL(import.meta.url).pathname);
      const possibleSkillSources = [
        path.join(currentFileDir, "..", "skills", "apigee-templater"),
        path.join(currentFileDir, "..", "..", "skills", "apigee-templater"),
        path.join(process.cwd(), "skills", "apigee-templater"),
      ];

      let sourceSkillDir = "";
      for (const sourceDir of possibleSkillSources) {
        if (fs.existsSync(path.join(sourceDir, "SKILL.md"))) {
          sourceSkillDir = sourceDir;
          break;
        }
      }

      if (!sourceSkillDir) return;

      for (const baseDir of targetBaseDirs) {
        try {
          if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
          }
          const targetSkillDir = path.join(baseDir, "apigee-templater");
          if (!fs.existsSync(targetSkillDir)) {
            fs.mkdirSync(targetSkillDir, { recursive: true });
          }
          fs.cpSync(sourceSkillDir, targetSkillDir, { recursive: true });
        } catch (e) {
          // Continue if one directory fails
        }
      }
    } catch (e) {
      // Ignore errors silently
    }
  }

  private printOverviewCard(title: string, summaryLines: string[], outputPath: string) {
    console.log(`\n  ${chalk.bgCyan.black.bold(" OVERVIEW ")} ${chalk.bold.magenta(title)}`);
    console.log(chalk.gray("  ─────────────────────────────────────────────────────────"));
    for (const line of summaryLines) {
      if (line.startsWith("Name:")) {
        console.log(`    ${chalk.bold("Name:")}        ${chalk.cyan(line.replace("Name: ", ""))}`);
      } else if (line.startsWith("Endpoints:")) {
        console.log(`    ${chalk.bold("Endpoints:")}`);
      } else if (line.startsWith("Targets:")) {
        console.log(`    ${chalk.bold("Targets:")}`);
      } else if (line.startsWith("Policies:")) {
        console.log(`    ${chalk.bold("Policies:")}`);
      } else if (line.startsWith("Resources:")) {
        console.log(`    ${chalk.bold("Resources:")}`);
      } else if (line.startsWith("- ")) {
        console.log(`      ${chalk.green("•")} ${chalk.white(line.substring(2))}`);
      } else {
        console.log(`    ${line}`);
      }
    }
    console.log(chalk.gray("  ─────────────────────────────────────────────────────────"));
    console.log(`  ${chalk.green.bold("✔ Output written to:")} ${chalk.bold.yellow(outputPath)}\n`);
  }

  async process(args: string[]) {
    // Fast path for shell auto-completion queries
    if (args.length > 2 && args[2] === "--complete") {
      const prevWord = args[3] || "";
      const currentWord = args[4] || "";
      await this.handleCompletion(prevWord, currentWord);
      return;
    }

    // Command route for shell auto-completion setup
    if (args.length > 2 && args[2] === "completion") {
      const target = args[3];
      this.handleCompletionCommand(target);
      return;
    }

    this.installSkill();

    if (!stdin.setRawMode) {
      await this.processDataSpec();
      console.log(`\n  ${chalk.yellow("⚠ Data piping from stdin is not yet supported.")}\n`);
      return;
    }

    let options: cliArgs = this.parseArgumentsIntoOptions(args);

    if (options.help) {
      this.printHelp();
      return;
    }

    if (options.version) {
      this.printVersion();
      return;
    }

    if (options.listFeatures) {
      await this.printFeatures();
      return;
    }

    if (options.config) {
      if (!options.token) {
        let token = await auth.getAccessToken();
        if (token) options.token = token;
      }
      let apigeeConfig = await this.apigeeService.apigeeConfigGet(
        options.config,
        options.drz,
        "Bearer " + options.token,
      );

      console.log(JSON.stringify(apigeeConfig, null, 2));
      return;
    }

    if (!options.input) {
      this.printLogo();
      console.log(
        `  ${chalk.bold.magenta("Welcome to Apigee Feature Templater " + version)}`
      );
      console.log(`  ${chalk.green("Use -h to view all command line options.")}\n`);
    }

    options = await this.promptForMissingOptions(options);

    let template: Template | undefined = undefined;
    let feature: Feature | undefined = undefined;
    let proxy: Proxy | undefined = undefined;
    let startDir = process.cwd();

    // Parse parameters
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
      // Create new template
      let basePath = options.basePath;
      if (options.format == "feature") {
        feature = new Feature();
        feature.name = options.name;
      } else {
        // console.log(`  ${chalk.cyan("ℹ Template created, converting to feature...")}`);
        template = this.converter.templateCreate(options.name, basePath, options.targetUrl);
        if (!options.format && options.basePath && options.targetUrl) options.format = "feature";
      }
      if (!options.output) options.output = options.name + ".yaml";
    } else if (
      options.input.includes(":") &&
      !options.input.toLowerCase().startsWith("https://") &&
      !options.input.toLowerCase().startsWith("http://")
    ) {
      // Apigee proxy reference ORG:PROXY
      let pieces = options.input.split(":");
      if (pieces && pieces.length > 1 && pieces[0] && pieces[1]) {
        if (!options.token) {
          let token = await auth.getAccessToken();
          if (token) options.token = token;
        }
        if (!options.name) options.name = pieces[1];
        let apigeePath = await this.apigeeService.apigeeProxyGet(
          pieces[1],
          pieces[0],
          options.drz,
          "Bearer " + options.token,
        );
        if (apigeePath) {
          let importParameters = options.format == "feature";
          proxy = await this.converter.apigeeZipToProxy(options.name, apigeePath, importParameters);
          fs.rmSync(apigeePath);
        } else {
          // Try shared flows
          let sharedFlowPath = await this.apigeeService.apigeeSharedFlowGet(
            pieces[1],
            pieces[0],
            options.drz,
            "Bearer " + options.token,
          );

          if (sharedFlowPath) {
            proxy = await this.converter.apigeeSharedFlowZipToProxy(options.name, sharedFlowPath);
            fs.rmSync(sharedFlowPath);
          }
        }

        if (proxy && !proxy.description) proxy.description = "Proxy for " + proxy.name;
      }
    } else if (fs.existsSync(options.input)) {
      let file = await this.loadFile(options.name, options.input);
      if (file && file["type"] === "template") template = file as Template;
      else if (file && file["type"] === "proxy") proxy = file as Proxy;
      else if (file && file["type"] === "feature") feature = file as Feature;
      else if (file) {
        console.log(
          `  ${chalk.red.bold("✖ Error reading '" + options.input + "', could not determine its type:")}\n  ${JSON.stringify(file, null, 2)}`
        );
        return;
      }
      let dirName = path.dirname(options.input);
      process.chdir(dirName);
    } else {
      // Remote repository load
      if (
        options.input.toLowerCase().startsWith("https://") ||
        options.input.toLowerCase().startsWith("http://")
      ) {
        let file = await this.loadRemoteFile(options.input);
        if (file && file["type"] === "template") template = file as Template;
        else if (file && file["type"] === "proxy") proxy = file as Proxy;
        else if (file && file["type"] === "feature") feature = file as Feature;
      } else {
        template = await this.apigeeService.templateGet(options.input);
        if (!template) feature = await this.apigeeService.featureGet(options.input);
      }
    }

    if (!template && !proxy && !feature) {
      if (!options.token) {
        let token = await auth.getAccessToken();
        if (token) options.token = token;
      }
      if (options.input.endsWith(":")) options.input = options.input.replace(":", "");
      let proxyList = await this.apigeeService.apigeeProxiesList(
        options.input,
        options.drz,
        `Bearer ${options.token}`,
      );
      if (!options.output && proxyList && proxyList["proxies"] && proxyList["proxies"].length > 0) {
        console.log(
          `\n  ${chalk.cyan.bold("Apigee org " + options.input + " proxies:")} ${chalk.gray("(get proxy info with -i '" + options.input + ":NAME')")}`
        );
        for (let p of proxyList["proxies"]) {
          console.log(`    ${chalk.green("•")} ${p["name"]}`);
        }
        console.log();
      }
      return;
    } else {
      if (options.applyFeature) {
        process.chdir(startDir);
        if (!options.output) options.output = options.input;

        if (options.output.includes(":") && !inputParameters["PROJECT_ID"]) {
          let pieces = options.output.split(":");
          if (pieces.length >= 1 && pieces[0]) inputParameters["PROJECT_ID"] = pieces[0];
        }

        let relativePath = options.applyFeature;
        if (
          fs.existsSync(options.applyFeature) &&
          path.dirname(options.output) != "." &&
          fs.existsSync(path.dirname(options.output))
        ) {
          relativePath = path.relative(path.dirname(options.output), options.applyFeature);
        }
        let applyFeature = await this.apigeeService.featureGet(options.applyFeature);

        if (template && applyFeature)
          template = this.converter.templateApplyFeature(
            template,
            applyFeature,
            relativePath,
            inputParameters,
          );
        else if (proxy && applyFeature) {
          proxy = this.converter.proxyApplyFeature(proxy, applyFeature, inputParameters);
        } else if (feature && applyFeature) {
          feature = this.converter.featureApplyFeature(feature, applyFeature, inputParameters);
        } else if (!applyFeature) {
          console.error(`  ${chalk.red.bold("✖ Could not load feature:")} ${relativePath}`);
        }
      } else if (options.removeFeature) {
        process.chdir(startDir);
        if (!options.output) options.output = options.input;
        if (template) {
          let templateFeatures: Feature[] = [];
          for (let featurePath of template.features) {
            let relativePath = featurePath;
            relativePath = path.relative(path.dirname(options.output), relativePath);
            let tempFeature = await this.apigeeService.featureGet(relativePath);
            if (tempFeature) templateFeatures.push(tempFeature);
          }

          let relativePath = options.removeFeature;
          relativePath = path.relative(path.dirname(options.output), relativePath);
          let removeFeature = await this.apigeeService.featureGet(relativePath);
          if (removeFeature)
            template = this.converter.templateRemoveFeature(
              template,
              templateFeatures,
              relativePath,
              removeFeature,
            );
        } else if (feature) {
          let relativePath = options.removeFeature;
          relativePath = path.relative(path.dirname(options.output), relativePath);
          let removeFeature = await this.apigeeService.featureGet(relativePath);
          if (removeFeature) this.converter.featureRemoveFeature(feature, removeFeature);
        }
      }

      // Determine output format
      if (proxy) {
        if (!options.format) options.format = "proxy";
      } else if (template) {
        if (!options.format) options.format = "template";
      } else if (feature) {
        if (!options.format) options.format = "feature";
      } else {
        console.log(
          `  ${chalk.red.bold("✖ Input '" + options.input + "' could not be loaded. Please check spelling or path.")}`
        );
        return;
      }

      // WRITE OUTPUT
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
          if (options.applyFeature) {
            let testFeature = await this.apigeeService.featureGet(options.applyFeature);
            if (testFeature)
              proxy = this.converter.proxyApplyFeature(proxy, testFeature, inputParameters);
          }
        }
        process.chdir(startDir);
        let removeDir = options.output.toLowerCase().endsWith(".dir") ? false : true;
        if (proxy) outputPath = await this.converter.proxyToApigeeZip(proxy, removeDir);
        if (proxy && outputPath) {
          if (options.output.toLowerCase().endsWith(".dir")) {
            fs.rmSync(outputPath);
            fs.cpSync(outputPath.replace(".zip", ""), options.output.replace(".dir", ""), {
              recursive: true,
            });
            fs.rmdirSync(outputPath.replace(".zip", ""), { recursive: true });
          } else if (outputPath != options.output && outputPath != "./" + options.output) {
            fs.copyFileSync(outputPath, options.output);
            fs.rmSync(outputPath);
          }

          this.printOverviewCard(
            `Proxy ${proxy.name}`,
            this.converter.proxyToStringArray(proxy),
            options.output
          );
        } else {
          console.log(`  ${chalk.red.bold("✖ Error: Could not write proxy zip.")}`);
          return;
        }
      } else if (options.output && options.format == "proxy") {
        if (options.output.includes(":") && !inputParameters["PROJECT_ID"]) {
          let pieces = options.output.split(":");
          if (pieces.length >= 1 && pieces[0]) inputParameters["PROJECT_ID"] = pieces[0];
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
          if (options.name) proxy.name = options.name;
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
            if (!options.name) options.name = proxy.name;
            let pieces = options.output.split(":");
            let lastRevision = "";

            if (!options.token) {
              let token = await auth.getAccessToken();
              if (token) options.token = token;
            }

            try {
              if (pieces && pieces.length > 1 && pieces[0]) {
                lastRevision = await this.apigeeService.apigeeProxyExport(
                  options.name,
                  outputPath,
                  pieces[0],
                  options.drz,
                  "Bearer " + options.token,
                );
                if (!lastRevision) throw new Error("Proxy could not be exported.");
              }
              if (pieces && pieces.length > 2 && pieces[0] && pieces[2] && lastRevision) {
                let serviceAccount = "";
                let environment = pieces[2];
                if (pieces.length === 4 && pieces[3]) serviceAccount = pieces[3];
                let deployResult = await this.apigeeService.apigeeProxyRevisionDeploy(
                  options.name,
                  lastRevision,
                  serviceAccount,
                  environment,
                  pieces[0],
                  options.drz,
                  "Bearer " + options.token,
                );
                if (!deployResult) throw new Error("Proxy could not be deployed.");
              }
            } catch (ex) {
              fs.rmSync(outputPath);
              throw ex;
            }

            fs.rmSync(outputPath);
          }

          this.printOverviewCard(
            `Proxy ${proxy.name}`,
            this.converter.proxyToStringArray(proxy),
            options.output
          );
        } else {
          console.log(`  ${chalk.red.bold("✖ Error: Could not create proxy.")}`);
          return;
        }
      } else if (options.output && options.format == "template") {
        if (proxy) {
          template = this.converter.proxyToTemplate(proxy);
        }
        process.chdir(startDir);

        if (template) {
          if (options.name) template.name = options.name;
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

          this.printOverviewCard(
            `Template ${template.name}`,
            this.converter.templateToString(template).split("\n"),
            options.output
          );
        }
      } else if (options.output && options.format == "feature") {
        if (proxy) {
          if (options.removeFeature) {
            let testFeature = await this.apigeeService.featureGet(options.removeFeature);
            if (testFeature) proxy = this.converter.proxyRemoveFeature(proxy, testFeature) ?? proxy;
          }
          if (proxy) feature = this.converter.proxyToFeature(proxy);
        } else if (template) {
          let tempProxy = this.converter.templateToProxy(template, []);
          feature = this.converter.proxyToFeature(tempProxy);
        }
        process.chdir(startDir);
        if (feature) {
          if (options.name) feature.name = options.name;
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

          this.printOverviewCard(
            `Feature ${feature.name}`,
            this.converter.featureToString(feature).split("\n"),
            options.output
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
        input = this.converter.apigeeFolderToProxy(name, inputPath);
      }

      resolve(input || undefined);
    });
  }

  async loadRemoteFile(inputUrl: string): Promise<any | undefined> {
    return new Promise(async (resolve, reject) => {
      let input: any | undefined = undefined;
      let inputString = "";

      let response = await fetch(inputUrl);
      if (response.status === 200) inputString = await response.text();

      if (inputUrl.toLowerCase().endsWith(".yaml") || inputUrl.toLowerCase().endsWith(".yml")) {
        if (inputString) input = YAML.parse(inputString);
      } else if (
        inputUrl.toLowerCase().endsWith(".json") ||
        inputUrl.toLowerCase().endsWith(".js")
      ) {
        if (inputString) input = JSON.parse(inputString);
      }

      resolve(input || undefined);
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
  listFeatures = false;
  parameters = "";
  token = "";
  help = false;
  version = false;
  config = "";
  drz = "";
}

const helpCommands = [
  {
    name: "--input, -i",
    description: "Input path to ZIP, JSON or YAML file, or an Apigee proxy in ORG:PROXY format.",
  },
  {
    name: "--name, -n",
    description: "The name for the output template, feature or proxy.",
  },
  {
    name: "--output, -o",
    description: "An optional file output name and type (e.g. AI-Template-v1.yaml).",
  },
  {
    name: "--format, -f",
    description: "An optional format to convert input into: 'proxy', 'template' or 'feature'.",
  },
  {
    name: "--applyFeature, -a",
    description: "A feature name or path to apply to a template.",
  },
  {
    name: "--removeFeature, -r",
    description: "A feature name or path to remove from a template.",
  },
  {
    name: "--listFeatures, -l",
    description: "List all features that can be applied to a template.",
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
      "If generating a proxy from a template, parameter substitutions (param1=val1,param2=val2).",
  },
  {
    name: "--config, -c",
    description: "Display configuration information for an Apigee X org.",
  },
  {
    name: "--token, -t",
    description:
      "Google Cloud token for Apigee API (uses Application Default Credentials if omitted).",
  },
  {
    name: "--help, -h",
    description: "Display version and help.",
  },
  {
    name: "--version, -v",
    description: "Display version info.",
  },
  {
    name: "--drz, -d",
    description: "Use a DRZ Apigee endpoint (us, eu, in) for API calls.",
  },
];

export default cli;
