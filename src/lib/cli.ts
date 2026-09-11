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
import yauzl from "yauzl";
import { ApigeeConverter } from "./converter.js";
import { Proxy, Feature, Template, Product, Products, User, Users, ApigeeConfig } from "./interfaces.js";
import { ApigeeTemplaterService } from "./service.js";
import { GoogleAuth } from "google-auth-library";
import { version } from "./version.js";
import { CompletionManager } from "./completion.js";
import { stdin } from "process";
import CliAnimation, { AnimationStage } from "./animation.js";

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
  animation = new CliAnimation();

  public startAnimation(stages?: AnimationStage[]): void {
    this.animation.start(stages);
  }

  public async stopAnimation(): Promise<void> {
    await this.animation.stop();
  }

  private printLogo() {
    const vStr = ("v" + version).padEnd(8);
    const logoText = `
  ┌───────────────────────────────────────────────────────────┐
  │                           _                               │
  │              __ _  _ __  (_)  __ _   ___   ___            │
  │             / _\` || '_ \\ | | / _\` | / _ \\ / _ \\           │
  │            | (_| || |_) || || (_| ||  __/|  __/           │
  │             \\__,_|| .__/ |_| \\__, | \\___| \\___|           │
  │                   |_|        |___/                ${vStr}│
  └───────────────────────────────────────────────────────────┘`;
    console.log(chalk.cyan.bold(logoText));
  }

  parseArgumentsIntoOptions(rawArgs: string[]): cliArgs {
    let argv = rawArgs.slice(2);
    let command = "convert";
    let explicitCommand = false;
    if (argv[0] === "convert") {
      command = "convert";
      explicitCommand = true;
      argv = argv.slice(1);
    } else if (argv[0] === "describe") {
      command = "describe";
      explicitCommand = true;
      argv = argv.slice(1);
    } else if (argv[0] === "reset") {
      command = "reset";
      explicitCommand = true;
      argv = argv.slice(1);
    }

    if (command === "describe") {
      const flagsWithValue = new Set([
        "-i", "--input",
        "-n", "--name",
        "-b", "--basePath",
        "-u", "--targetUrl",
        "-o", "--output",
        "-f", "--format",
        "-a", "--applyFeature",
        "-r", "--removeFeature",
        "-p", "--parameters",
        "-t", "--token",
        "-d", "--drz",
        "--environment", "--env",
        "--service-account", "--sa",
      ]);
      for (let i = 0; i < argv.length; i++) {
        if (["--project", "--org", "--organization"].includes(argv[i])) {
          const next = argv[i + 1];
          if (!next || next.startsWith("-")) {
            let posIdx = -1;
            for (let j = 0; j < argv.length; j++) {
              if (j === i) continue;
              if (argv[j].startsWith("-")) continue;
              if (j > 0 && flagsWithValue.has(argv[j - 1])) continue;
              posIdx = j;
              break;
            }
            if (posIdx !== -1) {
              const [val] = argv.splice(posIdx, 1);
              const insertAt = posIdx < i ? i : i + 1;
              argv.splice(insertAt, 0, val);
            }
          }
        }
      }
    }

    const args = arg(
      {
        "--input": String,
        "--name": String,
        "--basePath": String,
        "--targetUrl": String,
        "--output": String,
        "--organization": String,
        "--org": "--organization",
        "--project": "--organization",
        "--environment": String,
        "--env": "--environment",
        "--service-account": String,
        "--sa": "--service-account",
        "--format": String,
        "--applyFeature": [String],
        "--removeFeature": [String],
        "--listFeatures": Boolean,
        "--list": "--listFeatures",
        "--listTemplates": "--listFeatures",
        "--parameters": String,
        "--token": String,
        "--help": Boolean,
        "--version": Boolean,
        "--delete": Boolean,
        "--drz": String,
        "--no-animation": Boolean,
        "--no-anim": "--no-animation",
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
        "-d": "--drz",
      },
      {
        argv,
      },
    );

    if (args["_"] && args["_"][0] === "convert") {
      command = "convert";
      explicitCommand = true;
      args["_"].shift();
    } else if (args["_"] && args["_"][0] === "describe") {
      command = "describe";
      explicitCommand = true;
      args["_"].shift();
    } else if (args["_"] && args["_"][0] === "reset") {
      command = "reset";
      explicitCommand = true;
      args["_"].shift();
    }

    const rawApply: string[] = args["--applyFeature"] || [];
    const applyFeatures: string[] = rawApply
      .flatMap((f: string) => f.split(","))
      .map((f: string) => f.trim())
      .filter(Boolean);

    const rawRemove: string[] = args["--removeFeature"] || [];
    const removeFeatures: string[] = rawRemove
      .flatMap((f: string) => f.split(","))
      .map((f: string) => f.trim())
      .filter(Boolean);

    let singlePositionalInput = "";

    if (command === "describe") {
      if (!args["--input"] && args["_"] && args["_"][0]) {
        args["--input"] = args["_"][0];
      }
    } else if (command === "reset") {
      if (!args["--input"] && args["_"] && args["_"][0]) {
        args["--input"] = args["_"][0];
      }
      if (!args["--output"] && args["_"] && args["_"][1]) {
        args["--output"] = args["_"][1];
      }
    } else {
      if (args["_"] && args["_"].length >= 2 && !args["--input"] && !args["--output"]) {
        args["--input"] = args["_"][0];
        args["--output"] = args["_"][1];
      } else if ((applyFeatures.length > 0 || removeFeatures.length > 0) && args["_"] && args["_"][0]) {
        args["--input"] = args["_"][0];
      } else if (
        args["_"] &&
        args["_"][0] &&
        (args["--output"] ||
          args["--organization"] ||
          (args as any)["--org"] ||
          (args as any)["--project"] ||
          args["--environment"] ||
          (args as any)["--env"] ||
          args["--service-account"] ||
          (args as any)["--sa"] ||
          args["--delete"] ||
          args["--format"])
      ) {
        args["--input"] = args["_"][0];
      } else if (args["_"] && args["_"][0]) {
        if (!explicitCommand) {
          command = "describe";
          args["--input"] = args["_"][0];
          singlePositionalInput = args["_"][0];
        } else {
          args["--output"] =
            !args["_"][0].toLowerCase().endsWith(".yaml") &&
            !args["_"][0].toLowerCase().endsWith(".json")
              ? args["_"][0] + ".yaml"
              : args["_"][0];
        }
      } else if (
        !explicitCommand &&
        args["--input"] &&
        !args["--output"] &&
        !args["--organization"] &&
        !(args as any)["--org"] &&
        !(args as any)["--project"] &&
        !args["--delete"] &&
        applyFeatures.length === 0 &&
        removeFeatures.length === 0 &&
        !args["--basePath"] &&
        !args["--targetUrl"] &&
        !args["--environment"] &&
        !(args as any)["--env"] &&
        !args["--service-account"] &&
        !(args as any)["--sa"] &&
        !args["--format"]
      ) {
        command = "describe";
      }
    }

    const isList = args["--listFeatures"] || false;
    const org =
      args["--organization"] ||
      (args as any)["--org"] ||
      (args as any)["--project"] ||
      (args["--output"] && args["--output"].includes(":")
        ? args["--output"].split(":")[0]
        : args["--output"] && !args["--output"].match(/\.(yaml|yml|json|zip|dir)$/i)
          ? args["--output"]
          : "");

    const rawSa = args["--service-account"] || (args as any)["--sa"] || "";
    const sa = this.formatServiceAccount(rawSa, org);
    const noAnimation = Boolean(args["--no-animation"]);
    if (noAnimation) {
      this.animation.disable();
    }

    return {
      command: command,
      singlePositionalInput: singlePositionalInput,
      input: args["--input"] || "",
      name: args["--name"] || "",
      basePath: args["--basePath"] || "",
      targetUrl: args["--targetUrl"] || "",
      output: args["--output"] || "",
      organization: args["--organization"] || (args as any)["--org"] || (args as any)["--project"] || "",
      environment: args["--environment"] || (args as any)["--env"] || "",
      serviceAccount: sa,
      format: args["--format"] || "",
      applyFeature: applyFeatures.join(","),
      applyFeatures: applyFeatures,
      removeFeature: removeFeatures.join(","),
      removeFeatures: removeFeatures,
      list: isList,
      listFeatures: isList,
      parameters: args["--parameters"] || "",
      token: args["--token"] || "",
      help: args["--help"] || false,
      version: args["--version"] || false,
      delete: args["--delete"] || false,
      drz: args["--drz"] || "",
      noAnimation: noAnimation,
    };
  }

  async promptForMissingOptions(options: cliArgs): Promise<cliArgs> {
    const questions: any[] = [];

    if (
      !options.format &&
      (options.output.includes(":") ||
        options.organization ||
        options.environment ||
        options.serviceAccount)
    ) {
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
      if (!options.name && !options.input && !options.output && !options.organization) {
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

    const targetOrg =
      options.organization ||
      (options.output && options.output.includes(":")
        ? options.output.split(":")[0]
        : options.output && !options.output.match(/\.(yaml|yml|json|zip|dir)$/i)
          ? options.output
          : "");
    if (options.serviceAccount && targetOrg) {
      options.serviceAccount = this.formatServiceAccount(options.serviceAccount, targetOrg);
    }

    return {
      ...options,
      name: options.name || answers.name,
      basePath: options.basePath || answers.basePath,
      targetUrl: options.targetUrl || answers.targetUrl,
      output: options.output || answers.output,
    };
  }

  formatServiceAccount(serviceAccount: string, projectId: string): string {
    if (!serviceAccount) return "";
    const sa = serviceAccount.trim();
    if (!sa) return "";
    if (!sa.includes("@") && projectId && projectId.trim()) {
      return `${sa}@${projectId.trim()}.iam.gserviceaccount.com`;
    }
    return sa;
  }

  sanitizeName(primary: string, secondary: string): string {
    let result = "";
    if (!primary && secondary) {
      return this.sanitizeName(secondary, "");
    }
    if (!primary) return "";

    const isDir =
      primary.endsWith("/") ||
      primary.endsWith("\\") ||
      (fs.existsSync(primary) && fs.statSync(primary).isDirectory());

    if (isDir) {
      if (secondary) return this.sanitizeName(secondary, "");
      return "";
    }

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
      result = primary;
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
    console.log(`    ${chalk.green("aft")} ${chalk.yellow("[convert]")} ${chalk.yellow("[options]")} ${chalk.dim("[<input> | <output>]")}`);
    console.log(`    ${chalk.green("aft")} ${chalk.yellow("describe")} ${chalk.yellow("[options]")} ${chalk.dim("[<input>]")}`);
    console.log(`    ${chalk.green("aft")} ${chalk.yellow("reset")} ${chalk.yellow("[options]")} ${chalk.dim("<input> [<output>]")}`);
    console.log(`    ${chalk.green("aft")} ${chalk.yellow("completion <install | zsh | bash | fish | powershell>")}`);
    console.log(`    ${chalk.green("aft")} ${chalk.yellow("skill <install | uninstall>")}`);
    console.log(`    ${chalk.green("aft")} ${chalk.yellow("cache <clear>")}\n`);

    console.log(`  ${chalk.bold.cyan("COMMANDS:")}`);
    console.log(`    ${chalk.bold.yellow("convert".padEnd(22))} ${chalk.white("Convert between Apigee proxies, features & templates (default command).")}`);
    console.log(`    ${chalk.bold.yellow("describe".padEnd(22))} ${chalk.white("Describe an Apigee template, proxy, feature, product, user, or organization (--project) in the terminal summary.")}`);
    console.log(`    ${chalk.bold.yellow("reset".padEnd(22))} ${chalk.white("Reset a template, proxy, or feature file to default empty contents.")}`);
    console.log(`    ${chalk.bold.yellow("completion".padEnd(22))} ${chalk.white("Install or display shell tab-completion scripts (install, uninstall, zsh, bash, fish, powershell).")}`);
    console.log(`    ${chalk.bold.yellow("skill".padEnd(22))} ${chalk.white("Install or uninstall Apigee Templater skill for AI coding assistants.")}`);
    console.log(`    ${chalk.bold.yellow("cache".padEnd(22))} ${chalk.white("Manage local cache of templates and features (clear).")}\n`);

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

  async handleSkillCommand(target?: string) {
    if (target === "install") {
      await this.installSkillCommand();
    } else if (target === "uninstall") {
      this.uninstallSkillCommand();
    } else {
      console.log(`\n  ${chalk.bold.cyan("📦 Apigee Templater AI Agent Skill:")}\n`);
      console.log(`  ${chalk.white("Installs the Apigee Templater skill for AI assistants (Antigravity, Gemini CLI, Claude Code, Cursor, Codex, etc.).")}\n`);
      console.log(`  ${chalk.bold.cyan("USAGE:")}`);
      console.log(`    ${chalk.green("aft skill install")}     ${chalk.white("Install skill to ~/.agents/skills/apigee-templater")}`);
      console.log(`    ${chalk.green("aft skill uninstall")}   ${chalk.white("Remove installed skill")}\n`);
    }
  }

  async installSkillCommand() {
    try {
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      if (!homeDir) {
        console.log(`\n  ${chalk.red("❌ Could not determine user home directory.")}\n`);
        return;
      }

      const targetDir = path.join(homeDir, ".agents", "skills", "apigee-templater");
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

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

      if (sourceSkillDir) {
        fs.cpSync(sourceSkillDir, targetDir, { recursive: true });
        console.log(`\n  ${chalk.green.bold("✔ Successfully installed Apigee Templater skill!")}`);
        console.log(`    Location: ${chalk.cyan(targetDir)}`);
        console.log(`    Compatible with: ${chalk.dim("Antigravity, Gemini CLI, Claude Code, Cursor, Codex, and other AI agents.")}\n`);
      } else {
        console.log(`  ${chalk.dim("Fetching latest skill definition from GitHub...")}`);
        const skillUrl = "https://raw.githubusercontent.com/apigee/apigee-templater/main/skills/apigee-templater/SKILL.md";
        const res = await fetch(skillUrl);
        if (res.status === 200) {
          const content = await res.text();
          fs.writeFileSync(path.join(targetDir, "SKILL.md"), content, "utf8");
          console.log(`\n  ${chalk.green.bold("✔ Successfully installed Apigee Templater skill!")}`);
          console.log(`    Location: ${chalk.cyan(targetDir)}`);
          console.log(`    Compatible with: ${chalk.dim("Antigravity, Gemini CLI, Claude Code, Cursor, Codex, and other AI agents.")}\n`);
        } else {
          console.log(`\n  ${chalk.red("❌ Could not locate or download apigee-templater skill.")}\n`);
        }
      }
    } catch (e: any) {
      console.log(`\n  ${chalk.red("❌ Failed to install skill:")} ${e.message}\n`);
    }
  }

  uninstallSkillCommand() {
    try {
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      if (!homeDir) return;
      const targetDir = path.join(homeDir, ".agents", "skills", "apigee-templater");
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
        console.log(`\n  ${chalk.green.bold("✔ Successfully uninstalled Apigee Templater skill.")}\n`);
      } else {
        console.log(`\n  ${chalk.yellow("ℹ Skill is not currently installed.")}\n`);
      }
    } catch (e: any) {
      console.log(`\n  ${chalk.red("❌ Failed to uninstall skill:")} ${e.message}\n`);
    }
  }

  handleCacheCommand(target?: string) {
    if (target === "clear" || target === "clean" || target === "purge" || target === "delete") {
      const { cleared, errors } = this.apigeeService.clearCache();
      if (errors.length > 0) {
        console.log(`\n  ${chalk.yellow("⚠ Errors clearing cache:")} ${errors.join(", ")}\n`);
      } else {
        console.log(`\n  ${chalk.green.bold("✔ Local cache cleared successfully.")} ${chalk.dim(`(${this.apigeeService.getCacheDir()})`)}\n`);
      }
    } else {
      const cacheDir = this.apigeeService.getCacheDir();
      console.log(`\n  ${chalk.bold.cyan("💾 AFT Local File Cache:")}\n`);
      console.log(`    Location: ${chalk.cyan(cacheDir)}`);
      if (fs.existsSync(cacheDir)) {
        const files = fs.readdirSync(cacheDir);
        if (files.length === 0) {
          console.log(`    ${chalk.dim("Cache is currently empty.")}`);
        } else {
          for (const file of files) {
            const stats = fs.statSync(path.join(cacheDir, file));
            const ageHours = Math.round((Date.now() - stats.mtimeMs) / (1000 * 60 * 60));
            console.log(`    - ${chalk.bold(file)}: ${chalk.dim(`${stats.size} bytes, modified ${ageHours}h ago`)}`);
          }
        }
      } else {
        console.log(`    ${chalk.dim("Cache directory does not exist yet.")}`);
      }
      console.log(`\n  Usage:`);
      console.log(`    ${chalk.green("aft cache clear")}   ${chalk.white("Clear cached templates and features")}\n`);
    }
  }

  private getCompletionFiles(currentWord: string): string[] {
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
    return localFiles;
  }

  async handleCompletion(prevWord: string, currentWord: string) {
    try {
      if (["-a", "--applyFeature", "-r", "--removeFeature"].includes(prevWord)) {
        const features = await this.apigeeService.featuresList();
        const featureNames = features.map((f) => f.name);
        const localFiles = this.getCompletionFiles(currentWord);

        const allCandidates = Array.from(new Set([...featureNames, ...localFiles])).filter(
          (name) => !currentWord || name.startsWith(currentWord)
        );
        if (allCandidates.length > 0) {
          console.log(allCandidates.join("\n"));
        }
        return;
      }

      if (["-i", "--input", "describe"].includes(prevWord)) {
        const [templates, features] = await Promise.all([
          this.apigeeService.templatesList(),
          this.apigeeService.featuresList(),
        ]);
        const repoNames = [
          ...templates.map((t) => t.name),
          ...features.map((f) => f.name),
        ];
        const localFiles = this.getCompletionFiles(currentWord);

        const allCandidates = Array.from(new Set([...repoNames, ...localFiles])).filter(
          (name) => !currentWord || name.startsWith(currentWord)
        );
        if (allCandidates.length > 0) {
          console.log(allCandidates.join("\n"));
        }
        return;
      }

      if (prevWord === "reset") {
        const localFiles = this.getCompletionFiles(currentWord);
        const filtered = localFiles.filter((name) => !currentWord || name.startsWith(currentWord));
        if (filtered.length > 0) {
          console.log(filtered.join("\n"));
        }
        return;
      }

      if (["-f", "--format"].includes(prevWord)) {
        const formats = ["proxy", "template", "feature", "product", "user", "sharedflow", "sf"].filter(
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

      if (prevWord === "skill") {
        const actions = ["install", "uninstall"].filter(
          (a) => !currentWord || a.startsWith(currentWord)
        );
        if (actions.length > 0) console.log(actions.join("\n"));
        return;
      }

      if (prevWord === "cache") {
        const actions = ["clear"].filter(
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
          "--organization",
          "--org",
          "--project",
          "--environment",
          "--env",
          "--service-account",
          "--sa",
          "--format",
          "--applyFeature",
          "--removeFeature",
          "--listFeatures",
          "--list",
          "--parameters",
          "--token",
          "--delete",
          "--drz",
          "--no-animation",
          "--no-anim",
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
          "-d",
          "-h",
          "-v",
        ].filter((flag) => flag.startsWith(currentWord));
        if (flags.length > 0) console.log(flags.join("\n"));
        return;
      }

      const commands = [
        "convert",
        "describe",
        "reset",
        "list",
        "completion",
        "skill",
        "cache",
      ];
      if (!currentWord.startsWith("-") && (!prevWord || ["aft", "apigee-templater"].includes(prevWord))) {
        const templates = await this.apigeeService.templatesList();
        const templateNames = templates.map((t) => t.name);
        const localFiles = this.getCompletionFiles(currentWord);

        const allCandidates = Array.from(new Set([...commands, ...templateNames, ...localFiles])).filter(
          (name) => !currentWord || name.startsWith(currentWord)
        );
        if (allCandidates.length > 0) {
          console.log(allCandidates.join("\n"));
        }
        return;
      }

      const matchingCommands = commands.filter((cmd) => cmd.startsWith(currentWord));
      if (matchingCommands.length > 0) {
        console.log(matchingCommands.join("\n"));
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

  async printFeatures(format?: string) {
    this.startAnimation();
    let [allTemplates, allFeatures] = await Promise.all([
      this.apigeeService.templatesList(),
      this.apigeeService.featuresList(),
    ]);

    await this.stopAnimation();

    if (format === "json" || format === "yaml" || format === "yml") {
      const catalog = {
        templates: allTemplates.map((t) => ({
          name: t.name,
          description: t.description || undefined,
          features:
            t.features && t.features.length > 0
              ? t.features.map((f) => path.basename(f, path.extname(f)))
              : undefined,
          parameters:
            t.parameters && t.parameters.length > 0
              ? t.parameters.map((p) => ({
                  name: p.name,
                  description: p.description || p.displayName || undefined,
                  default: p.default || undefined,
                }))
              : undefined,
        })),
        features: allFeatures.map((f) => ({
          name: f.name,
          description: f.description || undefined,
          parameters:
            f.parameters && f.parameters.length > 0
              ? f.parameters.map((p) => ({
                  name: p.name,
                  description: p.description || p.displayName || undefined,
                  default: p.default || undefined,
                }))
              : undefined,
        })),
      };

      if (format === "json") {
        console.log(JSON.stringify(catalog, null, 2));
      } else {
        console.log(YAML.stringify(catalog, { aliasDuplicateObjects: false }));
      }
      return;
    }

    this.printLogo();

    const maxLen = Math.max(
      22,
      ...allTemplates.map((t) => (t.name || "").length),
      ...allFeatures.map((f) => (f.name || "").length),
    );

    console.log(`\n  ${chalk.bold.cyan("📑 Available Apigee Templates:")}\n`);
    if (allTemplates.length === 0) {
      console.log(`    ${chalk.yellow("No templates found in repository.")}\n`);
    } else {
      for (let template of allTemplates) {
        const nameBadge = chalk.bgBlue.white.bold(` ${template.name.padEnd(maxLen)} `);
        const desc = chalk.italic.white(template.description || "No description");
        console.log(`    ${nameBadge} ${desc}`);
      }
      console.log(`\n  ${chalk.dim(`Total templates available: ${allTemplates.length}`)}\n`);
    }

    console.log(`  ${chalk.bold.cyan("📦 Available Apigee Features:")}\n`);
    if (allFeatures.length === 0) {
      console.log(`    ${chalk.yellow("No features found in repository.")}\n`);
    } else {
      for (let feature of allFeatures) {
        const nameBadge = chalk.bgMagenta.white.bold(` ${feature.name.padEnd(maxLen)} `);
        const desc = chalk.italic.white(feature.description || "No description");
        console.log(`    ${nameBadge} ${desc}`);
      }
      console.log(`\n  ${chalk.dim(`Total features available: ${allFeatures.length}`)}\n`);
    }
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

  private async printOverviewCard(title: string, summaryLines: string[], outputPath?: string) {
    await this.stopAnimation();
    console.log(`\n  ${chalk.bgCyan.black.bold(" OVERVIEW ")} ${chalk.bold.magenta(title)}`);
    console.log(chalk.gray("  ─────────────────────────────────────────────────────────"));
    for (const line of summaryLines) {
      if (line.startsWith("Name:")) {
        console.log(`    ${chalk.bold("Name:")}        ${chalk.cyan(line.replace("Name: ", ""))}`);
      } else if (line.startsWith("Display Name:")) {
        console.log(`    ${chalk.bold("Display Name:")} ${chalk.cyan(line.replace("Display Name: ", ""))}`);
      } else if (line.startsWith("Email:")) {
        console.log(`    ${chalk.bold("Email:")}       ${chalk.cyan(line.replace("Email: ", ""))}`);
      } else if (line.startsWith("Username:")) {
        console.log(`    ${chalk.bold("Username:")}    ${chalk.white(line.replace("Username: ", ""))}`);
      } else if (line.startsWith("Full Name:")) {
        console.log(`    ${chalk.bold("Full Name:")}   ${chalk.white(line.replace("Full Name: ", ""))}`);
      } else if (line.startsWith("Status:")) {
        console.log(`    ${chalk.bold("Status:")}      ${chalk.white(line.replace("Status: ", ""))}`);
      } else if (line.startsWith("Attributes:")) {
        console.log(`    ${chalk.bold("Attributes:")}  ${chalk.white(line.replace("Attributes: ", ""))}`);
      } else if (line.startsWith("Description:")) {
        console.log(`    ${chalk.bold("Description:")} ${chalk.white(line.replace("Description: ", ""))}`);
      } else if (line.startsWith("Approval Type:")) {
        console.log(`    ${chalk.bold("Approval Type:")} ${chalk.white(line.replace("Approval Type: ", ""))}`);
      } else if (line.startsWith("Access:")) {
        console.log(`    ${chalk.bold("Access:")}       ${chalk.white(line.replace("Access: ", ""))}`);
      } else if (line.startsWith("Environments:")) {
        console.log(`    ${chalk.bold("Environments:")}  ${chalk.white(line.replace("Environments: ", ""))}`);
      } else if (line.startsWith("Proxies:")) {
        console.log(`    ${chalk.bold("Proxies:")}       ${chalk.white(line.replace("Proxies: ", ""))}`);
      } else if (line.startsWith("Quota:")) {
        console.log(`    ${chalk.bold("Quota:")}         ${chalk.yellow(line.replace("Quota: ", ""))}`);
      } else if (line.endsWith(": none")) {
        const title = line.replace(": none", ":");
        console.log(`    ${chalk.bold(title)}   ${chalk.dim("none")}`);
      } else if (line.startsWith("Endpoints:")) {
        console.log(`    ${chalk.bold("Endpoints:")}`);
      } else if (line.startsWith("Targets:")) {
        console.log(`    ${chalk.bold("Targets:")}`);
      } else if (line.startsWith("Policies:")) {
        console.log(`    ${chalk.bold("Policies:")}`);
      } else if (line.startsWith("Resources:")) {
        console.log(`    ${chalk.bold("Resources:")}`);
      } else if (line.startsWith("Features:")) {
        console.log(`    ${chalk.bold("Features:")}`);
      } else if (line.startsWith("Parameters:")) {
        console.log(`    ${chalk.bold("Parameters:")}`);
      } else if (line.startsWith("Endpoint flows:")) {
        console.log(`    ${chalk.bold("Endpoint flows:")}`);
      } else if (line.startsWith("Target flows:")) {
        console.log(`    ${chalk.bold("Target flows:")}`);
      } else if (line.startsWith("Operations:")) {
        console.log(`    ${chalk.bold("Operations:")}    ${chalk.white(line.replace("Operations: ", ""))}`);
      } else if (line.startsWith("Apps:")) {
        console.log(`    ${chalk.bold("Apps:")}          ${chalk.white(line.replace("Apps: ", ""))}`);
      } else if (line.startsWith("  - ")) {
        console.log(`        ${chalk.dim("└─")} ${chalk.white(line.substring(4))}`);
      } else if (line.startsWith("- ")) {
        console.log(`      ${chalk.green("•")} ${chalk.white(line.substring(2))}`);
      } else {
        console.log(`    ${line}`);
      }
    }
    console.log(chalk.gray("  ─────────────────────────────────────────────────────────"));
    if (outputPath) {
      console.log(`  ${chalk.green.bold("✔ Output written to:")} ${chalk.bold.yellow(outputPath)}\n`);
    } else {
      console.log();
    }
  }

  private async printOrgConfig(orgName: string, config: ApigeeConfig) {
    await this.stopAnimation();
    const org = config.org || {};
    console.log(
      `\n  ${chalk.bgCyan.black.bold(" CONFIG ")} ${chalk.bold.magenta("Organization " + (org.name || orgName))}`,
    );
    console.log(chalk.gray("  ─────────────────────────────────────────────────────────"));
    if (org.name) console.log(`    ${chalk.bold("Name:")}             ${chalk.cyan(org.name)}`);
    if (org.displayName)
      console.log(`    ${chalk.bold("Display Name:")}     ${chalk.cyan(org.displayName)}`);
    if (org.project)
      console.log(`    ${chalk.bold("GCP Project:")}      ${chalk.white(org.project)}`);
    if (org.analyticsRegion)
      console.log(`    ${chalk.bold("Analytics Region:")} ${chalk.yellow(org.analyticsRegion)}`);
    if (org.runtimeType)
      console.log(`    ${chalk.bold("Runtime Type:")}     ${chalk.white(org.runtimeType)}`);
    if (org.billingType || org.type)
      console.log(
        `    ${chalk.bold("Billing Type:")}     ${chalk.green(org.billingType || org.type)}`,
      );
    if (org.state) console.log(`    ${chalk.bold("State:")}            ${chalk.green(org.state)}`);

    let expiresAt = org.expiresAt;
    if (!expiresAt && org.properties && Array.isArray(org.properties.property)) {
      const expProp = org.properties.property.find(
        (p: any) => p.name === "expiresAt" || p.name === "features.isEvaluation",
      );
      if (expProp && expProp.name === "expiresAt") expiresAt = expProp.value;
    }
    if (expiresAt) {
      const expNum = Number(expiresAt);
      const expDate = !isNaN(expNum) ? new Date(expNum) : new Date(expiresAt);
      if (!isNaN(expDate.getTime())) {
        const daysLeft = Math.round((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const daysText = daysLeft > 0 ? ` (expires in ${daysLeft} days)` : ` (expired)`;
        console.log(
          `    ${chalk.bold("Expires At:")}       ${chalk.red(expDate.toISOString().split("T")[0] + daysText)}`,
        );
      } else {
        console.log(`    ${chalk.bold("Expires At:")}       ${chalk.red(expiresAt)}`);
      }
    }

    if (config.environments && config.environments.length > 0) {
      console.log(`    ${chalk.bold("Environments:")}`);
      for (const env of config.environments) {
        const envName = typeof env === "string" ? env : env.name || JSON.stringify(env);
        console.log(`      ${chalk.green("•")} ${chalk.white(envName)}`);
      }
    }

    if (config.environmentGroups && config.environmentGroups.length > 0) {
      console.log(`    ${chalk.bold("Environment Groups:")}`);
      for (const group of config.environmentGroups) {
        const attachedEnvs =
          group.attachments && group.attachments.length > 0
            ? group.attachments
                .map((a: any) => a.environment || a.environmentName || a)
                .join(", ")
            : "";
        const envSuffix = attachedEnvs ? chalk.yellow(` [attached: ${attachedEnvs}]`) : "";
        console.log(`      ${chalk.green("•")} ${chalk.cyan(group.name)}${envSuffix}`);
        if (group.hostnames && group.hostnames.length > 0) {
          for (const host of group.hostnames) {
            console.log(`        ${chalk.yellow("↳ Host:")} ${chalk.white(host)}`);
          }
        }
      }
    }
    console.log(chalk.gray("  ─────────────────────────────────────────────────────────\n"));
  }

  private async handleResetCommand(options: cliArgs) {
    if (!options.input) {
      await this.stopAnimation();
      console.log(`  ${chalk.red.bold("✖ Error: Please specify an input file to reset.")}\n`);
      return;
    }

    if (
      options.input.includes(":") ||
      options.organization ||
      options.input.toLowerCase().startsWith("http://") ||
      options.input.toLowerCase().startsWith("https://")
    ) {
      await this.stopAnimation();
      console.log(`  ${chalk.red.bold("✖ Error: The 'reset' command only supports local files.")}\n`);
      return;
    }

    if (!fs.existsSync(options.input)) {
      if (fs.existsSync(options.input + ".yaml")) {
        options.input = options.input + ".yaml";
      } else if (fs.existsSync(options.input + ".yml")) {
        options.input = options.input + ".yml";
      } else if (fs.existsSync(options.input + ".json")) {
        options.input = options.input + ".json";
      }
    }

    if (!fs.existsSync(options.input)) {
      await this.stopAnimation();
      console.log(`  ${chalk.red.bold(`✖ Error: Input file '${options.input}' does not exist.`)}\n`);
      return;
    }

    if (fs.statSync(options.input).isDirectory()) {
      await this.stopAnimation();
      console.log(`  ${chalk.red.bold(`✖ Error: '${options.input}' is a directory. The 'reset' command only supports files.`)}\n`);
      return;
    }

    const ext = path.extname(options.input).toLowerCase();
    if (ext !== ".yaml" && ext !== ".yml" && ext !== ".json") {
      await this.stopAnimation();
      console.log(`  ${chalk.red.bold(`✖ Error: The 'reset' command only supports YAML and JSON files.`)}\n`);
      return;
    }

    const name = options.name || this.sanitizeName("", options.input);
    const file = await this.loadFile(name, options.input);
    if (!file) {
      await this.stopAnimation();
      console.log(
        `  ${chalk.red.bold("✖ Error reading '" + options.input + "', could not determine its type:")}\n  ${JSON.stringify(file, null, 2)}\n`,
      );
      return;
    }

    let template: Template | undefined = undefined;
    let proxy: Proxy | undefined = undefined;
    let feature: Feature | undefined = undefined;
    let product: Product | undefined = undefined;
    let user: User | undefined = undefined;

    if (file && file["type"] === "template") template = file as Template;
    else if (file && file["type"] === "proxy") proxy = file as Proxy;
    else if (file && file["type"] === "feature") feature = file as Feature;
    else if (file && file["type"] === "product") product = file as Product;
    else if (file && file["type"] === "user") user = file as User;
    else if (file && options.format === "template") template = file as Template;
    else if (file && options.format === "proxy") proxy = file as Proxy;
    else if (file && (options.format === "feature" || options.format === "sharedflow" || options.format === "sf")) feature = file as Feature;
    else if (file && options.format === "product") product = file as Product;
    else if (file && options.format === "user") user = file as User;
    else if (file && file["endpoints"] && file["features"]) template = file as Template;
    else if (file && file["endpoints"]) proxy = file as Proxy;
    else if (file && file["features"]) template = file as Template;
    else if (file && file["policies"]) feature = file as Feature;
    else if (file && (file["approvalType"] || file["operationGroup"])) product = file as Product;
    else if (file && (file["email"] || file["developerId"])) user = file as User;
    else {
      await this.stopAnimation();
      console.log(
        `  ${chalk.red.bold("✖ Error reading '" + options.input + "', could not determine its type:")}\n  ${JSON.stringify(file, null, 2)}\n`,
      );
      return;
    }

    let resetObject: any;
    let title = "";
    let summaryLines: string[] = [];

    if (template) {
      template = this.converter.templateReset(template);
      resetObject = template;
      title = `Template ${template.name}`;
      summaryLines = this.converter.templateToStringArray(template);
    } else if (feature) {
      feature = this.converter.featureReset(feature);
      resetObject = feature;
      title = `Feature ${feature.name}`;
      summaryLines = this.converter.featureToStringArray(feature);
    } else if (proxy) {
      proxy = this.converter.proxyReset(proxy);
      resetObject = proxy;
      title = `Proxy ${proxy.name}`;
      summaryLines = this.converter.proxyToStringArray(proxy);
    } else if (product) {
      product = this.converter.productReset(product);
      resetObject = product;
      title = `Product ${product.name}`;
      summaryLines = this.converter.productToStringArray(product);
    } else if (user) {
      user = this.converter.userReset(user);
      resetObject = user;
      title = `User ${user.name || user.email}`;
      summaryLines = this.converter.userToStringArray(user);
    }

    const outputPath = options.output || options.input;
    if (outputPath.toLowerCase().endsWith(".json")) {
      fs.writeFileSync(outputPath, JSON.stringify(resetObject, null, 2) + "\n", "utf8");
    } else {
      let yamlStr = YAML.stringify(resetObject, {
        aliasDuplicateObjects: false,
        blockQuote: "literal",
      });
      try {
        const originalContent = fs.readFileSync(options.input, "utf8");
        const schemaCommentMatch = originalContent.match(/^(# yaml-language-server: [^\r\n]+)/);
        if (schemaCommentMatch) {
          yamlStr = schemaCommentMatch[1] + "\n" + yamlStr;
        }
      } catch (e) {}
      fs.writeFileSync(outputPath, yamlStr, "utf8");
    }

    await this.stopAnimation();
    await this.printOverviewCard(title, summaryLines, outputPath);
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

    // Command route for AI agent skill installation
    if (args.length > 2 && args[2] === "skill") {
      const target = args[3];
      await this.handleSkillCommand(target);
      return;
    }

    // Command route for cache management
    if (args.length > 2 && args[2] === "cache") {
      const subcommand = args[3];
      this.handleCacheCommand(subcommand);
      return;
    }

    // Command route for listing repository templates and features
    if (args.length > 2 && args[2] === "list") {
      let options: cliArgs = this.parseArgumentsIntoOptions(args);
      await this.printFeatures(options.format);
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

    if (options.listFeatures || options.list) {
      await this.printFeatures(options.format);
      return;
    }

    try {
      if (options.singlePositionalInput || options.input || options.organization) {
        this.startAnimation();
      }

    if (options.singlePositionalInput) {
      const fileExists = fs.existsSync(options.singlePositionalInput);
      const isRemoteUrl =
        options.singlePositionalInput.toLowerCase().startsWith("http://") ||
        options.singlePositionalInput.toLowerCase().startsWith("https://");
      const hasDirectory =
        options.singlePositionalInput.includes("/") ||
        options.singlePositionalInput.includes("\\");

      let repoItem: any = undefined;
      if (!fileExists && !isRemoteUrl && !hasDirectory) {
        repoItem = await this.apigeeService.repositoryGet(options.singlePositionalInput);
      }

      if (!fileExists && !repoItem && !isRemoteUrl) {
        options.command = "convert";
        options.output =
          !options.singlePositionalInput.toLowerCase().endsWith(".yaml") &&
          !options.singlePositionalInput.toLowerCase().endsWith(".json")
            ? options.singlePositionalInput + ".yaml"
            : options.singlePositionalInput;
        options.input = "";
        options.name = this.sanitizeName(options.output, options.input);
      } else {
        options.command = "describe";
        options.input = options.singlePositionalInput;
        options.output = "";
      }
    }

    if (options.command === "reset") {
      await this.handleResetCommand(options);
      return;
    }

    if (options.command === "describe") {
      if (!options.input && !options.organization) {
        await this.stopAnimation();
        console.log(`  ${chalk.red.bold("✖ Error: Please specify an input to describe.")}\n`);
        return;
      }
      this.startAnimation();
      if (options.organization && (!options.input || options.input === options.organization)) {
        if (!options.token) {
          let token = await auth.getAccessToken();
          if (token) options.token = token;
        }
        let apigeeConfig = await this.apigeeService.apigeeConfigGet(
          options.organization,
          options.drz,
          "Bearer " + options.token,
        );

        await this.stopAnimation();
        if (options.format === "json") {
          console.log(JSON.stringify(apigeeConfig, null, 2));
        } else if (options.format === "yaml" || options.format === "yml") {
          console.log(YAML.stringify(apigeeConfig, { aliasDuplicateObjects: false }));
        } else {
          await this.printOrgConfig(options.organization, apigeeConfig);
        }
        return;
      }
      if (!options.name && options.input) {
        options.name = this.sanitizeName("", options.input);
      }
    } else {
      if (!options.input) {
        await this.stopAnimation();
        this.printLogo();
        console.log(
          `  ${chalk.bold.magenta("Welcome to Apigee Feature Templater " + version)}`
        );
        console.log(`  ${chalk.green("Use -h to view all command line options.")}\n`);
      }

      options = await this.promptForMissingOptions(options);
      this.startAnimation();
    }

    let template: Template | undefined = undefined;
    let feature: Feature | undefined = undefined;
    let proxy: Proxy | undefined = undefined;
    let product: Product | undefined = undefined;
    let user: User | undefined = undefined;
    let startDir = process.cwd();
    let templateDir = "";

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

    if (!options.input && !options.organization) {
      // Create new template
      let basePath = options.basePath;
      if (options.format == "feature") {
        feature = new Feature();
        feature.name = options.name;
      } else if (options.format == "product") {
        product = this.converter.productCreate(
          options.name,
          "",
          [options.name],
          [options.environment || "test"],
        );
      } else if (options.format == "user") {
        user = this.converter.userCreate(
          options.name,
          "",
          options.name + "-app",
          [],
        );
      } else {
        // console.log(`  ${chalk.cyan("ℹ Template created, converting to feature...")}`);
        template = this.converter.templateCreate(options.name, basePath, options.targetUrl);
        if (!options.format && options.basePath && options.targetUrl) options.format = "feature";
      }
      if (!options.output) options.output = options.name + ".yaml";
    } else {
      const hasColonInput =
        options.input.includes(":") &&
        !options.input.toLowerCase().startsWith("https://") &&
        !options.input.toLowerCase().startsWith("http://");

      const hasFileOutput = Boolean(
        options.output &&
        !options.output.includes(":") &&
        (
          Boolean(options.organization) ||
          options.output.match(/\.(yaml|yml|json|zip|dir)$/i) ||
          options.output.endsWith("/") ||
          options.output.endsWith("\\") ||
          options.output.includes("/") ||
          options.output.includes("\\") ||
          fs.existsSync(options.output)
        )
      );

      const fetchResourceFromApigee = async (apigeeOrg: string, resourceName: string) => {
        if (!apigeeOrg || !resourceName) return;
        if (!options.token) {
          let token = await auth.getAccessToken();
          if (token) options.token = token;
        }
        if (!options.name) options.name = resourceName;

        if (options.format == "product") {
          let apigeeProductData = await this.apigeeService.apigeeProductGet(
            resourceName,
            apigeeOrg,
            options.drz,
            "Bearer " + options.token,
          );
          if (apigeeProductData) {
            product = this.converter.apigeeProductToProduct(apigeeProductData);
          }
        } else if (options.format == "user") {
          let apigeeUserData = await this.apigeeService.apigeeUserGet(
            resourceName,
            apigeeOrg,
            options.drz,
            "Bearer " + options.token,
          );
          if (apigeeUserData) {
            user = apigeeUserData;
          }
        } else if (options.format == "sharedflow" || options.format == "sf") {
          let sharedFlowPath = await this.apigeeService.apigeeSharedFlowGet(
            resourceName,
            apigeeOrg,
            options.drz,
            "Bearer " + options.token,
          );
          if (sharedFlowPath) {
            feature = await this.converter.apigeeSharedFlowZipToFeature(
              options.name || resourceName,
              sharedFlowPath,
            );
            if (fs.existsSync(sharedFlowPath)) fs.rmSync(sharedFlowPath);
          }
        } else {
          let apigeePath = await this.apigeeService.apigeeProxyGet(
            resourceName,
            apigeeOrg,
            options.drz,
            "Bearer " + options.token,
          );
          if (apigeePath) {
            let importParameters = options.format == "feature";
            proxy = await this.converter.apigeeZipToProxy(
              options.name,
              apigeePath,
              importParameters,
            );
            if (fs.existsSync(apigeePath)) fs.rmSync(apigeePath);
          } else {
            // Try shared flows
            let sharedFlowPath = await this.apigeeService.apigeeSharedFlowGet(
              resourceName,
              apigeeOrg,
              options.drz,
              "Bearer " + options.token,
            );

            if (sharedFlowPath) {
              feature = await this.converter.apigeeSharedFlowZipToFeature(
                options.name || resourceName,
                sharedFlowPath,
              );
              if (fs.existsSync(sharedFlowPath)) fs.rmSync(sharedFlowPath);
            } else {
              // Try product
              let apigeeProductData = await this.apigeeService.apigeeProductGet(
                resourceName,
                apigeeOrg,
                options.drz,
                "Bearer " + options.token,
              );
              if (apigeeProductData) {
                product = this.converter.apigeeProductToProduct(apigeeProductData);
              } else {
                // Try user
                let apigeeUserData = await this.apigeeService.apigeeUserGet(
                  resourceName,
                  apigeeOrg,
                  options.drz,
                  "Bearer " + options.token,
                );
                if (apigeeUserData) {
                  user = apigeeUserData;
                }
              }
            }
          }
        }

        if (proxy && !proxy.description) proxy.description = "Proxy for " + proxy.name;

        if (!options.output && !options.organization && (product || user || proxy || feature)) {
          if (product) options.output = (product.name || resourceName) + ".yaml";
          else if (user) options.output = (user.name || user.email || resourceName) + ".yaml";
          else if (feature) options.output = (feature.name || resourceName) + ".yaml";
          else if (proxy) options.output = (proxy.name || resourceName) + ".yaml";
        }
      };

      if (
        hasColonInput ||
        (hasFileOutput && options.organization && !(options.input && fs.existsSync(options.input)))
      ) {
        // Apigee proxy, product, user, or shared flow reference
        const pieces = hasColonInput ? options.input.split(":") : [];
        const apigeeOrg = options.organization || (pieces.length > 0 ? pieces[0] : "");
        const resourceName = hasColonInput
          ? pieces[1]
          : options.input && options.input !== apigeeOrg
            ? options.input
            : "";
        await fetchResourceFromApigee(apigeeOrg, resourceName);
      } else if (options.input && fs.existsSync(options.input)) {
        templateDir = path.dirname(path.resolve(options.input));
        let file = await this.loadFile(options.name, options.input);
        if (file && file["type"] === "template") template = file as Template;
        else if (file && file["type"] === "proxy") proxy = file as Proxy;
        else if (file && file["type"] === "feature") feature = file as Feature;
        else if (file && file["type"] === "product") product = file as Product;
        else if (file && file["type"] === "user") user = file as User;
        else if (file && options.format === "template") template = file as Template;
        else if (file && options.format === "proxy") proxy = file as Proxy;
        else if (file && (options.format === "feature" || options.format === "sharedflow" || options.format === "sf")) feature = file as Feature;
        else if (file && options.format === "product") product = file as Product;
        else if (file && options.format === "user") user = file as User;
        else if (file && file["endpoints"] && file["features"]) template = file as Template;
        else if (file && file["endpoints"]) proxy = file as Proxy;
        else if (file && file["features"]) template = file as Template;
        else if (file && file["policies"]) feature = file as Feature;
        else if (file && (file["approvalType"] || file["operationGroup"])) product = file as Product;
        else if (file && (file["email"] || file["developerId"])) user = file as User;
        else if (file) {
          console.log(
            `  ${chalk.red.bold("✖ Error reading '" + options.input + "', could not determine its type:")}\n  ${JSON.stringify(file, null, 2)}`,
          );
          return;
        }
        let dirName = path.dirname(options.input);
        process.chdir(dirName);
      } else if (options.input) {
        // Remote repository load
        if (
          options.input.toLowerCase().startsWith("https://") ||
          options.input.toLowerCase().startsWith("http://")
        ) {
          let file = await this.loadRemoteFile(options.input);
          if (file && file["type"] === "template") template = file as Template;
          else if (file && file["type"] === "proxy") proxy = file as Proxy;
          else if (file && file["type"] === "feature") feature = file as Feature;
          else if (file && file["type"] === "product") product = file as Product;
          else if (file && file["type"] === "user") user = file as User;
          else if (file && options.format === "template") template = file as Template;
          else if (file && options.format === "proxy") proxy = file as Proxy;
          else if (file && (options.format === "feature" || options.format === "sharedflow" || options.format === "sf")) feature = file as Feature;
          else if (file && options.format === "product") product = file as Product;
          else if (file && options.format === "user") user = file as User;
          else if (file && file["endpoints"] && file["features"]) template = file as Template;
          else if (file && file["endpoints"]) proxy = file as Proxy;
          else if (file && file["features"]) template = file as Template;
          else if (file && file["policies"]) feature = file as Feature;
          else if (file && (file["approvalType"] || file["operationGroup"])) product = file as Product;
          else if (file && (file["email"] || file["developerId"])) user = file as User;
        } else {
          if (options.format == "template") {
            template = await this.apigeeService.templateGet(options.input);
          } else if (
            options.format == "feature" ||
            options.format == "sharedflow" ||
            options.format == "sf"
          ) {
            feature = await this.apigeeService.featureGet(options.input);
          } else if (options.format == "product") {
            product = await this.apigeeService.productGet(options.input);
          } else if (options.format == "user") {
            user = await this.apigeeService.userGet(options.input);
          } else {
            let resolved = await this.apigeeService.repositoryGet(options.input);
            if (resolved) {
              if (resolved.type === "template") template = resolved.data as Template;
              else if (resolved.type === "feature") feature = resolved.data as Feature;
              else if (resolved.type === "product") product = resolved.data as Product;
              else if (resolved.type === "user") user = resolved.data as User;
            }
          }
          if (!template && !proxy && !feature && !product && !user && options.organization) {
            // Fallback: Check if resource exists in the Apigee organization
            await fetchResourceFromApigee(options.organization, options.input);
          }
        }
      }
    }

    if (template && !template.name && options.input) {
      template.name = path.basename(options.input).replace(/\.(yaml|yml|json)$/i, "");
    }
    if (proxy && !proxy.name && options.input) {
      proxy.name = path.basename(options.input).replace(/\.(yaml|yml|json)$/i, "");
    }
    if (feature && !feature.name && options.input) {
      feature.name = path.basename(options.input).replace(/\.(yaml|yml|json)$/i, "");
    }
    if (product && !product.name && options.input) {
      product.name = path.basename(options.input).replace(/\.(yaml|yml|json)$/i, "");
    }
    if (user && !user.name && !user.email && options.input) {
      user.name = path.basename(options.input).replace(/\.(yaml|yml|json)$/i, "");
    }

    if (options.command === "describe") {
      process.chdir(startDir);
      await this.stopAnimation();
      if (template) {
        await this.printOverviewCard(`Template ${template.name}`, this.converter.templateToStringArray(template));
      } else if (proxy) {
        await this.printOverviewCard(`Proxy ${proxy.name}`, this.converter.proxyToStringArray(proxy));
      } else if (feature) {
        const title = (options.format === "sharedflow" || options.format === "sf")
          ? `SharedFlow ${feature.name}`
          : `Feature ${feature.name}`;
        await this.printOverviewCard(title, this.converter.featureToStringArray(feature));
      } else if (product) {
        await this.printOverviewCard(`Product ${product.name}`, this.converter.productToStringArray(product));
      } else if (user) {
        await this.printOverviewCard(`User ${user.name || user.email}`, this.converter.userToStringArray(user));
      } else {
        console.log(`  ${chalk.red.bold(`✖ Error: Could not resolve input '${options.input}' to describe.`)}\n`);
      }
      return;
    }

    if (!template && !proxy && !feature && !product && !user) {
      if (!options.token) {
        let token = await auth.getAccessToken();
        if (token) options.token = token;
      }
      const targetOrg = options.organization || (options.input.endsWith(":") ? options.input.slice(0, -1) : options.input);
      if (!targetOrg) {
        console.log(`  ${chalk.red.bold("✖ Error: No input template, proxy, product, user, or organization specified.")}`);
        return;
      }

      if (options.input && options.input !== targetOrg && !options.input.endsWith(":")) {
        console.log(
          `  ${chalk.red.bold(`✖ Error: Could not resolve input '${options.input}' locally, from repository, or from Apigee organization '${targetOrg}'.`)}\n`,
        );
        return;
      }

      if (options.format == "product") {
        let productList = await this.apigeeService.apigeeProductsList(
          targetOrg,
          options.drz,
          `Bearer ${options.token}`,
        );
        if (productList && productList["apiProduct"] && productList["apiProduct"].length > 0) {
          if (options.output) {
            const isDir =
              options.output.endsWith("/") ||
              options.output.endsWith("\\") ||
              (fs.existsSync(options.output) && fs.statSync(options.output).isDirectory()) ||
              (!options.output.toLowerCase().endsWith(".yaml") &&
                !options.output.toLowerCase().endsWith(".yml") &&
                !options.output.toLowerCase().endsWith(".json"));

            const products: Product[] = [];
            for (let p of productList["apiProduct"]) {
              let pData = p;
              if (!pData.operationGroup && !pData.quota) {
                let fullP = await this.apigeeService.apigeeProductGet(
                  p.name,
                  targetOrg,
                  options.drz,
                  `Bearer ${options.token}`,
                );
                if (fullP) pData = fullP;
              }
              products.push(this.converter.apigeeProductToProduct(pData));
            }

            if (isDir) {
              if (!fs.existsSync(options.output)) {
                fs.mkdirSync(options.output, { recursive: true });
              }
              for (let prod of products) {
                const outPath = path.join(options.output, `${prod.name}.yaml`);
                fs.writeFileSync(
                  outPath,
                  YAML.stringify(prod, { aliasDuplicateObjects: false, blockQuote: "literal" }),
                );
                await this.printOverviewCard(
                  `Product ${prod.name}`,
                  this.converter.productToStringArray(prod),
                  outPath,
                );
              }
            } else {
              if (options.output.toLowerCase().endsWith(".json")) {
                fs.writeFileSync(options.output, JSON.stringify(products, null, 2));
              } else {
                fs.writeFileSync(
                  options.output,
                  YAML.stringify(products, { aliasDuplicateObjects: false, blockQuote: "literal" }),
                );
              }
              await this.stopAnimation();
              console.log(
                `\n  ${chalk.green.bold("✔")} Exported ${chalk.cyan(products.length)} products to ${chalk.bold.yellow(options.output)}\n`,
              );
            }
            return;
          }

          await this.stopAnimation();
          console.log(
            `\n  ${chalk.cyan.bold("Apigee org " + targetOrg + " products:")} ${chalk.gray("(export product with -i NAME --organization " + targetOrg + " -f product)")}`,
          );
          for (let p of productList["apiProduct"]) {
            console.log(`    ${chalk.green("•")} ${p["name"]}`);
          }
          console.log();
        }
        return;
      } else if (options.format == "user") {
        let userList = await this.apigeeService.apigeeUsersList(
          targetOrg,
          options.drz,
          `Bearer ${options.token}`,
        );
        if (userList && userList["developer"] && userList["developer"].length > 0) {
          if (options.output) {
            const isDir =
              options.output.endsWith("/") ||
              options.output.endsWith("\\") ||
              (fs.existsSync(options.output) && fs.statSync(options.output).isDirectory()) ||
              (!options.output.toLowerCase().endsWith(".yaml") &&
                !options.output.toLowerCase().endsWith(".yml") &&
                !options.output.toLowerCase().endsWith(".json"));

            let users: User[] = [];
            for (let u of userList["developer"]) {
              const email = u.email || u.userName;
              const usr = await this.apigeeService.apigeeUserGet(
                email,
                targetOrg,
                options.drz,
                `Bearer ${options.token}`,
              );
              if (usr) users.push(usr);
            }

            if (isDir) {
              if (!fs.existsSync(options.output)) {
                fs.mkdirSync(options.output, { recursive: true });
              }
              for (let usr of users) {
                const outPath = path.join(options.output, `${usr.name || usr.email}.yaml`);
                fs.writeFileSync(
                  outPath,
                  YAML.stringify(usr, { aliasDuplicateObjects: false, blockQuote: "literal" }),
                );
                await this.printOverviewCard(
                  `User ${usr.name || usr.email}`,
                  this.converter.userToStringArray(usr),
                  outPath,
                );
              }
            } else {
              if (options.output.toLowerCase().endsWith(".json")) {
                fs.writeFileSync(options.output, JSON.stringify(users, null, 2));
              } else {
                fs.writeFileSync(
                  options.output,
                  YAML.stringify(users, { aliasDuplicateObjects: false, blockQuote: "literal" }),
                );
              }
              await this.stopAnimation();
              console.log(
                `\n  ${chalk.green.bold("✔")} Exported ${chalk.cyan(users.length)} users to ${chalk.bold.yellow(options.output)}\n`,
              );
            }
            return;
          }

          await this.stopAnimation();
          console.log(
            `\n  ${chalk.cyan.bold("Apigee org " + targetOrg + " developers/users:")} ${chalk.gray("(export user with -i EMAIL --organization " + targetOrg + " -f user)")}`,
          );
          for (let u of userList["developer"]) {
            console.log(`    ${chalk.green("•")} ${u["email"] || u["userName"]}`);
          }
          console.log();
        }
        return;
      }
      let proxyList = await this.apigeeService.apigeeProxiesList(
        targetOrg,
        options.drz,
        `Bearer ${options.token}`,
      );
      if (proxyList && proxyList["proxies"] && proxyList["proxies"].length > 0) {
        if (options.output) {
          const isDir =
            options.output.endsWith("/") ||
            options.output.endsWith("\\") ||
            (fs.existsSync(options.output) && fs.statSync(options.output).isDirectory()) ||
            (!options.output.toLowerCase().endsWith(".yaml") &&
              !options.output.toLowerCase().endsWith(".yml") &&
              !options.output.toLowerCase().endsWith(".json"));

          if (isDir) {
            if (!fs.existsSync(options.output)) {
              fs.mkdirSync(options.output, { recursive: true });
            }
            for (let p of proxyList["proxies"]) {
              let apigeePath = await this.apigeeService.apigeeProxyGet(
                p.name,
                targetOrg,
                options.drz,
                `Bearer ${options.token}`,
              );
              if (apigeePath) {
                let prx = await this.converter.apigeeZipToProxy(p.name, apigeePath, false);
                fs.rmSync(apigeePath);
                const outPath = path.join(options.output, `${prx.name}.yaml`);
                fs.writeFileSync(
                  outPath,
                  YAML.stringify(prx, { aliasDuplicateObjects: false, blockQuote: "literal" }),
                );
                await this.printOverviewCard(
                  `Proxy ${prx.name}`,
                  this.converter.proxyToStringArray(prx),
                  outPath,
                );
              }
            }
            return;
          }
        }

        await this.stopAnimation();
        console.log(
          `\n  ${chalk.cyan.bold("Apigee org " + targetOrg + " proxies:")} ${chalk.gray("(export proxy with -i NAME --organization " + targetOrg + ")")}`,
        );
        for (let p of proxyList["proxies"]) {
          console.log(`    ${chalk.green("•")} ${p["name"]}`);
        }
        console.log();
      }
      return;
    } else {
      const applyList =
        options.applyFeatures && options.applyFeatures.length > 0
          ? options.applyFeatures
          : options.applyFeature
            ? [options.applyFeature]
            : [];
      const removeList =
        options.removeFeatures && options.removeFeatures.length > 0
          ? options.removeFeatures
          : options.removeFeature
            ? [options.removeFeature]
            : [];

      if (applyList.length > 0) {
        process.chdir(startDir);
        if (!options.output && !options.organization) options.output = options.input;

        const targetOrg =
          options.organization ||
          (options.output && options.output.includes(":")
            ? options.output.split(":")[0]
            : options.output && !options.output.match(/\.(yaml|yml|json|zip|dir)$/i)
              ? options.output
              : "");
        if (targetOrg && !inputParameters["PROJECT_ID"]) {
          inputParameters["PROJECT_ID"] = targetOrg;
        }

        for (const featName of applyList) {
          let relativePath = featName;
          if (
            fs.existsSync(featName) &&
            path.dirname(options.output) != "." &&
            fs.existsSync(path.dirname(options.output))
          ) {
            relativePath = path.relative(path.dirname(options.output), featName);
          }
          let applyFeature = await this.apigeeService.featureGet(featName);

          if (template && applyFeature) {
            template = this.converter.templateApplyFeature(
              template,
              applyFeature,
              relativePath,
              inputParameters,
            );
          } else if (proxy && applyFeature) {
            proxy = this.converter.proxyApplyFeature(proxy, applyFeature, inputParameters);
          } else if (feature && applyFeature) {
            feature = this.converter.featureApplyFeature(feature, applyFeature, inputParameters);
          } else if (!applyFeature) {
            console.error(`  ${chalk.red.bold("✖ Could not load feature:")} ${relativePath}`);
          }
        }
      } else if (removeList.length > 0) {
        process.chdir(startDir);
        if (!options.output && !options.organization) options.output = options.input;

        for (const featName of removeList) {
          if (template) {
            let templateFeatures: Feature[] = [];
            const relDir = options.input ? path.dirname(options.input) : undefined;
            for (let featurePath of template.features) {
              let tempFeature = await this.apigeeService.featureGet(featurePath, relDir);
              if (tempFeature) templateFeatures.push(tempFeature);
            }

            let relativePath = featName;
            if (
              fs.existsSync(featName) &&
              path.dirname(options.output) != "." &&
              fs.existsSync(path.dirname(options.output))
            ) {
              relativePath = path.relative(path.dirname(options.output), featName);
            }
            let removeFeature = await this.apigeeService.featureGet(featName, relDir);
            if (removeFeature)
              template = this.converter.templateRemoveFeature(
                template,
                templateFeatures,
                relativePath,
                removeFeature,
              );
          } else if (feature) {
            let removeFeature = await this.apigeeService.featureGet(featName);
            if (removeFeature) this.converter.featureRemoveFeature(feature, removeFeature);
          } else if (proxy) {
            let removeFeature = await this.apigeeService.featureGet(featName);
            if (removeFeature) proxy = this.converter.proxyRemoveFeature(proxy, removeFeature) ?? proxy;
          }
        }
      }

      // Determine output format
      if (proxy) {
        if (!options.format) options.format = "proxy";
      } else if (template) {
        if (!options.format) options.format = "template";
      } else if (feature) {
        if (!options.format) options.format = "feature";
      } else if (product) {
        if (!options.format) options.format = "product";
      } else if (user) {
        if (!options.format) options.format = "user";
      } else {
        console.log(
          `  ${chalk.red.bold("✖ Input '" + options.input + "' could not be loaded. Please check spelling or path.")}`,
        );
        return;
      }

      if (options.delete) {
        process.chdir(startDir);
        let pieces =
          options.output && options.output.includes(":") ? options.output.split(":") : [];
        let org = options.organization || (pieces.length > 0 ? pieces[0] : "");
        if (!org && options.output && !options.output.match(/\.(yaml|yml|json|zip|dir)$/i)) {
          org = options.output;
        }

        if (!org) {
          console.log(
            `  ${chalk.red.bold("✖ Error: Organization is required for deleting Apigee resources. Specify with --organization or target.")}`,
          );
          return;
        }

        if (!options.token) {
          let token = await auth.getAccessToken();
          if (token) options.token = token;
        }

        if (template || options.format === "template") {
          // 1. Delete Users first
          if (template && template.users && template.users.length > 0) {
            for (let userItem of template.users) {
              let userObj = await this.apigeeService.loadUser(userItem, templateDir);
              if (userObj) {
                this.converter.userUpdateParameters(userObj, inputParameters);
                const userKey = userObj.email || userObj.name;
                let del = await this.apigeeService.apigeeUserDelete(
                  userKey,
                  org,
                  options.drz,
                  "Bearer " + options.token,
                );
                if (del) {
                  console.log(
                    `  ${chalk.green.bold("✔")} Deleted User: ${chalk.cyan(userKey)} from org ${chalk.cyan(org)}`,
                  );
                } else {
                  console.log(
                    `  ${chalk.yellow.bold("⚠")} Could not delete User: ${chalk.cyan(userKey)}`,
                  );
                }
              }
            }
          }

          // 2. Delete Products second
          if (template && template.products && template.products.length > 0) {
            for (let prodItem of template.products) {
              let prodObj = await this.apigeeService.loadProduct(prodItem, templateDir);
              if (prodObj) {
                this.converter.productUpdateParameters(prodObj, inputParameters);
                let del = await this.apigeeService.apigeeProductDelete(
                  prodObj.name,
                  org,
                  options.drz,
                  "Bearer " + options.token,
                );
                if (del) {
                  console.log(
                    `  ${chalk.green.bold("✔")} Deleted Product: ${chalk.cyan(prodObj.name)} from org ${chalk.cyan(org)}`,
                  );
                } else {
                  console.log(
                    `  ${chalk.yellow.bold("⚠")} Could not delete Product: ${chalk.cyan(prodObj.name)}`,
                  );
                }
              }
            }
          }

          // 3. Delete Proxy third
          const proxyName = options.name || (template ? template.name : "");
          if (proxyName) {
            let del = await this.apigeeService.apigeeProxyDelete(
              proxyName,
              org,
              options.drz,
              "Bearer " + options.token,
            );
            if (del) {
              console.log(
                `  ${chalk.green.bold("✔")} Deleted Proxy: ${chalk.cyan(proxyName)} from org ${chalk.cyan(org)}`,
              );
            } else {
              console.log(
                `  ${chalk.yellow.bold("⚠")} Could not delete Proxy: ${chalk.cyan(proxyName)}`,
              );
            }
          }
        } else if (user || options.format === "user") {
          const userKey = user ? (user.email || user.name) : options.name;
          if (userKey) {
            let del = await this.apigeeService.apigeeUserDelete(
              userKey,
              org,
              options.drz,
              "Bearer " + options.token,
            );
            if (del) {
              console.log(
                `  ${chalk.green.bold("✔")} Deleted User: ${chalk.cyan(userKey)} from org ${chalk.cyan(org)}`,
              );
            } else {
              console.log(
                `  ${chalk.yellow.bold("⚠")} Could not delete User: ${chalk.cyan(userKey)}`,
              );
            }
          }
        } else if (product || options.format === "product") {
          const prodName = product ? product.name : options.name;
          if (prodName) {
            let del = await this.apigeeService.apigeeProductDelete(
              prodName,
              org,
              options.drz,
              "Bearer " + options.token,
            );
            if (del) {
              console.log(
                `  ${chalk.green.bold("✔")} Deleted Product: ${chalk.cyan(prodName)} from org ${chalk.cyan(org)}`,
              );
            } else {
              console.log(
                `  ${chalk.yellow.bold("⚠")} Could not delete Product: ${chalk.cyan(prodName)}`,
              );
            }
          }
        } else {
          // Feature / Proxy / SharedFlow
          if (feature && (options.format === "sharedflow" || options.format === "sf")) {
            const sfName = options.name || feature.name;
            let del = await this.apigeeService.apigeeSharedFlowDelete(
              sfName,
              org,
              options.drz,
              "Bearer " + options.token,
            );
            if (del) {
              console.log(
                `  ${chalk.green.bold("✔")} Deleted SharedFlow: ${chalk.cyan(sfName)} from org ${chalk.cyan(org)}`,
              );
            } else {
              console.log(
                `  ${chalk.yellow.bold("⚠")} Could not delete SharedFlow: ${chalk.cyan(sfName)}`,
              );
            }
          } else {
            const proxyName = options.name || (proxy ? proxy.name : (feature ? feature.name : ""));
            if (proxyName) {
              let del = await this.apigeeService.apigeeProxyDelete(
                proxyName,
                org,
                options.drz,
                "Bearer " + options.token,
              );
              if (del) {
                console.log(
                  `  ${chalk.green.bold("✔")} Deleted Proxy: ${chalk.cyan(proxyName)} from org ${chalk.cyan(org)}`,
                );
              } else {
                console.log(
                  `  ${chalk.yellow.bold("⚠")} Could not delete Proxy: ${chalk.cyan(proxyName)}`,
                );
              }
            }
          }
        }
        return;
      }

      // WRITE OUTPUT
      if (product || (options.output && options.format == "product")) {
        process.chdir(startDir);
        if (product) {
          if (options.name && !product.name) product.name = options.name;
          this.converter.productUpdateParameters(product, inputParameters);

          let pieces =
            options.output && options.output.includes(":") ? options.output.split(":") : [];
          let org = options.organization || (pieces.length > 0 ? pieces[0] : "");
          if (!org && options.output && !options.output.match(/\.(yaml|yml|json|zip|dir)$/i)) {
            org = options.output;
          }
          let env = options.environment || (pieces.length > 2 ? pieces[2] : "");

          if (options.output && options.output.toLowerCase().endsWith(".json")) {
            fs.writeFileSync(options.output, JSON.stringify(product, null, 2));
          } else if (
            options.output &&
            (options.output.toLowerCase().endsWith(".yaml") ||
              options.output.toLowerCase().endsWith(".yml"))
          ) {
            fs.writeFileSync(
              options.output,
              YAML.stringify(product, {
                aliasDuplicateObjects: false,
                blockQuote: "literal",
              }),
            );
          } else if (
            (options.output && options.output.includes(":")) ||
            options.organization ||
            (options.output && !options.output.match(/\.(yaml|yml|json|zip|dir)$/i))
          ) {
            if (!options.token) {
              let token = await auth.getAccessToken();
              if (token) options.token = token;
            }
            if (env && product.environments && !product.environments.includes(env)) {
              product.environments.push(env);
            } else if (env && !product.environments) {
              product.environments = [env];
            }
            if (org) {
              let exportResult = await this.apigeeService.apigeeProductExport(
                product,
                org,
                options.drz,
                "Bearer " + options.token,
              );
              if (!exportResult) throw new Error("Product could not be exported.");
            }
          }

          let displayDestination = options.output;
          if (
            !displayDestination ||
            !displayDestination.match(/\.(yaml|yml|json|zip|dir)$/i)
          ) {
            displayDestination = [org, options.name || product.name, env]
              .filter(Boolean)
              .join(":");
          }

          await this.printOverviewCard(
            `Product ${product.name}`,
            this.converter.productToStringArray(product),
            displayDestination || options.output,
          );
        }
      } else if (user || (options.output && options.format == "user")) {
        process.chdir(startDir);
        if (user) {
          if (options.name && !user.name) user.name = options.name;
          this.converter.userUpdateParameters(user, inputParameters);

          let pieces =
            options.output && options.output.includes(":") ? options.output.split(":") : [];
          let org = options.organization || (pieces.length > 0 ? pieces[0] : "");
          if (!org && options.output && !options.output.match(/\.(yaml|yml|json|zip|dir)$/i)) {
            org = options.output;
          }

          if (options.output && options.output.toLowerCase().endsWith(".json")) {
            fs.writeFileSync(options.output, JSON.stringify(user, null, 2));
          } else if (
            options.output &&
            (options.output.toLowerCase().endsWith(".yaml") ||
              options.output.toLowerCase().endsWith(".yml"))
          ) {
            fs.writeFileSync(
              options.output,
              YAML.stringify(user, {
                aliasDuplicateObjects: false,
                blockQuote: "literal",
              }),
            );
          } else if (
            (options.output && options.output.includes(":")) ||
            options.organization ||
            (options.output && !options.output.match(/\.(yaml|yml|json|zip|dir)$/i))
          ) {
            if (!options.token) {
              let token = await auth.getAccessToken();
              if (token) options.token = token;
            }
            if (org) {
              let exportResult = await this.apigeeService.apigeeUserExport(
                user,
                org,
                options.drz,
                "Bearer " + options.token,
              );
              if (!exportResult) throw new Error("User could not be exported.");
            }
          }

          let displayDestination = options.output;
          if (
            !displayDestination ||
            !displayDestination.match(/\.(yaml|yml|json|zip|dir)$/i)
          ) {
            displayDestination = [org, options.name || user.name || user.email]
              .filter(Boolean)
              .join(":");
          }

          await this.printOverviewCard(
            `User ${user.name || user.email}`,
            this.converter.userToStringArray(user),
            displayDestination || options.output,
          );
        }
      } else if (
        options.output &&
        (options.output.toLowerCase().endsWith(".zip") ||
          options.output.toLowerCase().endsWith(".dir"))
      ) {
        let outputPath: string = "";
        let isSharedFlow = options.format == "sharedflow" || options.format == "sf";

        if (isSharedFlow) {
          if (proxy) feature = this.converter.proxyToFeature(proxy);
          else if (template) {
            let tempProxy = this.converter.templateToProxy(template, []);
            feature = this.converter.proxyToFeature(tempProxy);
          }
          if (feature) {
            if (options.name) feature.name = options.name;
            process.chdir(startDir);
            let removeDir = options.output.toLowerCase().endsWith(".dir") ? false : true;
            outputPath = await this.converter.featureToSharedFlowZip(
              feature,
              removeDir,
              inputParameters,
            );
            if (outputPath) {
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

              await this.printOverviewCard(
                `SharedFlow ${feature.name}`,
                this.converter.featureToStringArray(feature),
                options.output,
              );
              return;
            } else {
              console.log(`  ${chalk.red.bold("✖ Error: Could not write sharedflow zip.")}`);
              return;
            }
          }
        }

        if (template) {
          proxy = await this.apigeeService.templateObjectToProxy(
            template,
            this.converter,
            inputParameters,
          );
        } else if (feature) {
          proxy = this.converter.featureToProxy(feature, inputParameters);
          const applyList =
            options.applyFeatures && options.applyFeatures.length > 0
              ? options.applyFeatures
              : options.applyFeature
                ? [options.applyFeature]
                : [];
          if (applyList.length > 0) {
            for (const featName of applyList) {
              let testFeature = await this.apigeeService.featureGet(featName);
              if (testFeature)
                proxy = this.converter.proxyApplyFeature(proxy, testFeature, inputParameters);
            }
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

          await this.printOverviewCard(
            `Proxy ${proxy.name}`,
            this.converter.proxyToStringArray(proxy),
            options.output,
          );
        } else {
          console.log(`  ${chalk.red.bold("✖ Error: Could not write proxy zip.")}`);
          return;
        }
      } else if (
        (options.output || options.organization) &&
        (options.format == "proxy" ||
          options.format == "sharedflow" ||
          options.format == "sf" ||
          options.organization ||
          options.output.includes(":"))
      ) {
        let isSharedFlow = options.format == "sharedflow" || options.format == "sf";
        if (isSharedFlow) {
          if (proxy) feature = this.converter.proxyToFeature(proxy);
          else if (template) {
            let tempProxy = this.converter.templateToProxy(template, []);
            feature = this.converter.proxyToFeature(tempProxy);
          }
          process.chdir(startDir);
          if (feature) {
            if (options.name) feature.name = options.name;
            let pieces =
              options.output && options.output.includes(":") ? options.output.split(":") : [];
            let org = options.organization || (pieces.length > 0 ? pieces[0] : "");
            if (!org && options.output && !options.output.match(/\.(yaml|yml|json|zip|dir)$/i)) {
              org = options.output;
            }
            let env = options.environment || (pieces.length > 2 ? pieces[2] : "");
            let rawSa = options.serviceAccount || (pieces.length > 3 ? pieces[3] : "");
            let sa = this.formatServiceAccount(rawSa, org);
            if (sa) options.serviceAccount = sa;
            let lastRevision = "";

            if (!options.token) {
              let token = await auth.getAccessToken();
              if (token) options.token = token;
            }

            try {
              if (org) {
                let sfZip = await this.converter.featureToSharedFlowZip(
                  feature,
                  true,
                  inputParameters,
                );
                lastRevision = await this.apigeeService.apigeeSharedFlowExport(
                  options.name || feature.name,
                  sfZip,
                  org,
                  options.drz,
                  "Bearer " + options.token,
                );
                if (fs.existsSync(sfZip)) fs.rmSync(sfZip);
                if (!lastRevision) throw new Error("SharedFlow could not be exported.");
              }
              if (org && env && lastRevision) {
                let deployResult = await this.apigeeService.apigeeSharedFlowRevisionDeploy(
                  options.name || feature.name,
                  lastRevision,
                  sa,
                  env,
                  org,
                  options.drz,
                  "Bearer " + options.token,
                );
                if (!deployResult) throw new Error("SharedFlow could not be deployed.");
              }

              let displayDestination = "";
              if (
                (options.output && options.output.includes(":")) ||
                options.organization ||
                (options.output && !options.output.match(/\.(yaml|yml|json|zip|dir)$/i))
              ) {
                displayDestination = [org, options.name || feature.name, env, sa]
                  .filter(Boolean)
                  .join(":");
              }

              await this.printOverviewCard(
                `SharedFlow ${feature.name}`,
                this.converter.featureToStringArray(feature),
                displayDestination || options.output,
              );
            } catch (e: any) {
              console.log(`  ${chalk.red.bold("✖ Error: " + (e?.message || e))}`);
            }
            return;
          }
        }

        const targetOrg =
          options.organization ||
          (options.output && options.output.includes(":")
            ? options.output.split(":")[0]
            : options.output && !options.output.match(/\.(yaml|yml|json|zip|dir)$/i)
              ? options.output
              : "");
        if (targetOrg && !inputParameters["PROJECT_ID"]) {
          inputParameters["PROJECT_ID"] = targetOrg;
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
          let deployedProducts: Product[] = [];
          let deployedUsers: User[] = [];
          if (options.name) proxy.name = options.name;
          if (options.output && options.output.toLowerCase().endsWith(".json")) {
            if (path.dirname(options.output) && !fs.existsSync(path.dirname(options.output))) {
              fs.mkdirSync(path.dirname(options.output), { recursive: true });
            }
            fs.writeFileSync(options.output, JSON.stringify(proxy, null, 2));
          } else if (
            options.output &&
            (options.output.toLowerCase().endsWith(".yaml") ||
              options.output.toLowerCase().endsWith(".yml"))
          ) {
            if (path.dirname(options.output) && !fs.existsSync(path.dirname(options.output))) {
              fs.mkdirSync(path.dirname(options.output), { recursive: true });
            }
            fs.writeFileSync(
              options.output,
              YAML.stringify(proxy, {
                aliasDuplicateObjects: false,
                blockQuote: "literal",
              }),
            );
          } else if (
            (options.output && options.output.includes(":")) ||
            options.organization ||
            (options.output && !options.output.match(/\.(yaml|yml|json|zip|dir)$/i))
          ) {
            let outputPath = await this.converter.proxyToApigeeZip(proxy);
            if (!options.name) options.name = proxy.name;
            let pieces =
              options.output && options.output.includes(":") ? options.output.split(":") : [];
            let org = options.organization || (pieces.length > 0 ? pieces[0] : "");
            if (!org && options.output && !options.output.match(/\.(yaml|yml|json|zip|dir)$/i)) {
              org = options.output;
            }
            let env = options.environment || (pieces.length > 2 ? pieces[2] : "");
            let rawSa = options.serviceAccount || (pieces.length > 3 ? pieces[3] : "");
            let sa = this.formatServiceAccount(rawSa, org);
            if (sa) options.serviceAccount = sa;
            let lastRevision = "";

            if (!options.token) {
              let token = await auth.getAccessToken();
              if (token) options.token = token;
            }

            try {
              if (org) {
                lastRevision = await this.apigeeService.apigeeProxyExport(
                  options.name,
                  outputPath,
                  org,
                  options.drz,
                  "Bearer " + options.token,
                );
                if (!lastRevision) throw new Error("Proxy could not be exported.");
              }
              if (org && env && lastRevision) {
                let deployResult = await this.apigeeService.apigeeProxyRevisionDeploy(
                  options.name,
                  lastRevision,
                  sa,
                  env,
                  org,
                  options.drz,
                  "Bearer " + options.token,
                );
                if (!deployResult) throw new Error("Proxy could not be deployed.");
              }

              if (org && template && template.products && template.products.length > 0) {
                for (let prodItem of template.products) {
                  let prodObj: Product | undefined = await this.apigeeService.loadProduct(
                    prodItem,
                    templateDir,
                  );
                  if (prodObj) {
                    this.converter.productUpdateParameters(prodObj, inputParameters);
                    if (env && prodObj.environments && !prodObj.environments.includes(env)) {
                      prodObj.environments.push(env);
                    } else if (env && !prodObj.environments) {
                      prodObj.environments = [env];
                    }
                    const proxyName = options.name || proxy.name;
                    if (
                      proxyName &&
                      prodObj.proxies &&
                      !prodObj.proxies.includes(proxyName)
                    ) {
                      prodObj.proxies.push(proxyName);
                    }
                    let exportResult = await this.apigeeService.apigeeProductExport(
                      prodObj,
                      org,
                      options.drz,
                      "Bearer " + options.token,
                    );
                    if (exportResult) {
                      deployedProducts.push(prodObj);
                    } else {
                      throw new Error(`Product ${prodObj.name} could not be exported.`);
                    }
                  } else {
                    console.log(
                      `  ${chalk.yellow.bold("⚠ Warning: Could not resolve product:")} ${typeof prodItem === "string" ? prodItem : JSON.stringify(prodItem)}`,
                    );
                  }
                }
              }

              if (org && template && template.users && template.users.length > 0) {
                for (let userItem of template.users) {
                  let userObj: User | undefined = await this.apigeeService.loadUser(
                    userItem,
                    templateDir,
                  );
                  if (userObj) {
                    this.converter.userUpdateParameters(userObj, inputParameters);
                    let exportResult = await this.apigeeService.apigeeUserExport(
                      userObj,
                      org,
                      options.drz,
                      "Bearer " + options.token,
                    );
                    if (exportResult) {
                      deployedUsers.push(userObj);
                    } else {
                      throw new Error(`User ${userObj.name || userObj.email} could not be exported.`);
                    }
                  } else {
                    console.log(
                      `  ${chalk.yellow.bold("⚠ Warning: Could not resolve user:")} ${typeof userItem === "string" ? userItem : JSON.stringify(userItem)}`,
                    );
                  }
                }
              }
            } catch (ex: any) {
              if (fs.existsSync(outputPath)) fs.rmSync(outputPath);
              console.log(`  ${chalk.red.bold("✖ Error: " + (ex?.message || ex))}`);
              return;
            }

            fs.rmSync(outputPath);
          }

          let displayDestination = options.output;
          let pieces =
            options.output && options.output.includes(":") ? options.output.split(":") : [];
          let org = options.organization || (pieces.length > 0 ? pieces[0] : "");
          if (!org && options.output && !options.output.match(/\.(yaml|yml|json|zip|dir)$/i)) {
            org = options.output;
          }
          let env = options.environment || (pieces.length > 2 ? pieces[2] : "");
          let rawSa = options.serviceAccount || (pieces.length > 3 ? pieces[3] : "");
          let sa = this.formatServiceAccount(rawSa, org);
          if (sa) options.serviceAccount = sa;
          if (
            !displayDestination ||
            !displayDestination.match(/\.(yaml|yml|json|zip|dir)$/i)
          ) {
            displayDestination = [org, options.name || proxy.name, env, sa]
              .filter(Boolean)
              .join(":");
          }

          await this.printOverviewCard(
            `Proxy ${proxy.name}`,
            this.converter.proxyToStringArray(proxy),
            displayDestination || options.output,
          );

          if (deployedProducts && deployedProducts.length > 0) {
            for (let prod of deployedProducts) {
              let prodDest = [org, prod.name, env].filter(Boolean).join(":");
              await this.printOverviewCard(
                `Product ${prod.name}`,
                this.converter.productToStringArray(prod),
                prodDest,
              );
            }
          }

          if (deployedUsers && deployedUsers.length > 0) {
            for (let usr of deployedUsers) {
              let userDest = [org, usr.name || usr.email].filter(Boolean).join(":");
              await this.printOverviewCard(
                `User ${usr.name || usr.email}`,
                this.converter.userToStringArray(usr),
                userDest,
              );
            }
          }
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

          await this.printOverviewCard(
            `Template ${template.name}`,
            this.converter.templateToString(template).split("\n"),
            options.output,
          );
        }
      } else if (
        options.output &&
        (options.format == "feature" || options.format == "sharedflow" || options.format == "sf")
      ) {
        if (proxy) {
          const removeList =
            options.removeFeatures && options.removeFeatures.length > 0
              ? options.removeFeatures
              : options.removeFeature
                ? [options.removeFeature]
                : [];
          if (removeList.length > 0) {
            for (const featName of removeList) {
              let testFeature = await this.apigeeService.featureGet(featName);
              if (testFeature)
                proxy = this.converter.proxyRemoveFeature(proxy, testFeature) ?? proxy;
            }
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

          await this.printOverviewCard(
            `Feature ${feature.name}`,
            this.converter.featureToString(feature).split("\n"),
            options.output,
          );
        }
      }
    }
  } finally {
    await this.stopAnimation();
  }
}

  async loadFile(name: string, inputPath: string): Promise<any | undefined> {
    return new Promise(async (resolve, reject) => {
      let input: any | undefined = undefined;

      if (inputPath.toLowerCase().endsWith(".zip")) {
        try {
          let isSharedFlow = false;
          await new Promise<void>((res) => {
            yauzl.open(inputPath, { lazyEntries: true }, (err, zipfile) => {
              if (err) return res();
              zipfile.readEntry();
              zipfile.on("entry", (entry) => {
                if (entry.fileName.startsWith("sharedflowbundle/")) {
                  isSharedFlow = true;
                }
                zipfile.readEntry();
              });
              zipfile.on("close", () => res());
              zipfile.on("error", () => res());
            });
          });
          if (isSharedFlow) {
            input = await this.converter.apigeeSharedFlowZipToFeature(name, inputPath);
          } else {
            input = await this.converter.apigeeZipToProxy(name, inputPath);
          }
        } catch (e) {
          input = await this.converter.apigeeZipToProxy(name, inputPath);
        }
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
      } else if (fs.existsSync(inputPath + "/sharedflowbundle")) {
        input = this.converter.apigeeSharedFlowFolderToFeature(name, inputPath);
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
  command = "convert";
  singlePositionalInput = "";
  input = "";
  name = "";
  basePath = "";
  targetUrl = "";
  output = "";
  organization = "";
  environment = "";
  serviceAccount = "";
  format = "";
  applyFeature = "";
  applyFeatures: string[] = [];
  removeFeature = "";
  removeFeatures: string[] = [];
  list = false;
  listFeatures = false;
  parameters = "";
  token = "";
  help = false;
  version = false;
  delete = false;
  drz = "";
  noAnimation = false;
}

const helpCommands = [
  {
    name: "--input, -i",
    description: "Input path to a ZIP, JSON, or YAML file, or an Apigee resource name.",
  },
  {
    name: "--name, -n",
    description: "The name for the output template, feature or proxy.",
  },
  {
    name: "--output, -o",
    description: "An optional file or directory output path (e.g. AI-Template-v1.yaml, ./proxies/).",
  },
  {
    name: "--organization, --org, --project",
    description: "Apigee organization or GCP project name to export from, deploy to, or describe.",
  },
  {
    name: "--environment, --env",
    description: "Apigee environment name to deploy the proxy revision to.",
  },
  {
    name: "--service-account, --sa",
    description: "Google Cloud service account email or name for proxy deployment.",
  },
  {
    name: "--format, -f",
    description: "An optional format to convert input into: 'proxy', 'template', 'feature', 'product', 'user', or 'sharedflow'.",
  },
  {
    name: "--applyFeature, -a",
    description: "A feature name or comma-separated list of features to apply to a template or proxy (e.g. -a feat1,feat2 or -a feat1 -a feat2).",
  },
  {
    name: "--removeFeature, -r",
    description: "A feature name or comma-separated list of features to remove from a template or proxy.",
  },
  {
    name: "--list, -l",
    description: "List all templates and features available in the repository (supports -f json/yaml for structured catalog; alias: --listFeatures).",
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
    name: "--delete",
    description: "Delete Apigee resources defined in input template, product, user, or proxy.",
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
  {
    name: "--no-animation, --no-anim",
    description: "Disable working animation and spinner during execution.",
  },
];

export default cli;
