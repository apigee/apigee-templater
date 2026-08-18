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

import os from "os";
import path from "path";
import fs from "fs";
import chalk from "chalk";

export class CompletionManager {
  private static MARKER_START = "# >>> aft completion >>>";
  private static MARKER_END = "# <<< aft completion <<<";

  static getBashScript(): string {
    return `
_aft_completions() {
  local cur prev completions
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  if [[ "$prev" == "-a" || "$prev" == "--applyFeature" || "$prev" == "-r" || "$prev" == "--removeFeature" || "$prev" == "-f" || "$prev" == "--format" || "$prev" == "-d" || "$prev" == "--drz" || "$prev" == "completion" || "$cur" == -* ]]; then
    completions="$(aft --complete "$prev" "$cur" 2>/dev/null)"
    if [[ -n "$completions" ]]; then
      COMPREPLY=( $(compgen -W "$completions" -- "$cur") )
      return 0
    fi
  fi

  COMPREPLY=( $(compgen -f -o plusdirs -- "$cur") )
}
complete -o filenames -o default -o bashdefault -F _aft_completions aft
complete -o filenames -o default -o bashdefault -F _aft_completions apigee-templater
`;
  }

  static getZshScript(): string {
    return `
#compdef aft apigee-templater

_aft_completions() {
  local prev="\${words[CURRENT-1]}"
  local cur="\${words[CURRENT]}"
  local -a completions

  if [[ "$prev" == "-a" || "$prev" == "--applyFeature" || "$prev" == "-r" || "$prev" == "--removeFeature" || "$prev" == "-f" || "$prev" == "--format" || "$prev" == "-d" || "$prev" == "--drz" || "$prev" == "completion" || "$cur" == -* ]]; then
    completions=("\${(@f)$(aft --complete "$prev" "$cur" 2>/dev/null)}")
    completions=("\${(@)completions:#}")

    if [[ \${#completions[@]} -gt 0 ]]; then
      compadd -a completions
      return 0
    fi
  fi

  _files
}

compdef _aft_completions aft
compdef _aft_completions apigee-templater
`;
  }

  static getFishScript(): string {
    return `
function __fish_aft_needs_complete
  set -l cmd (commandline -poc)
  set -l prev "$cmd[-1]"
  set -l cur (commandline -ct)
  string match -q -r '^-' -- "$cur"; or string match -q -r '^(-a|--applyFeature|-r|--removeFeature|-f|--format|-d|--drz|completion)$' -- "$prev"
end

function __fish_aft_complete
  set -l cmd (commandline -poc)
  set -l prev "$cmd[-1]"
  set -l cur (commandline -ct)
  aft --complete "$prev" "$cur" 2>/dev/null
end

complete -c aft -n '__fish_aft_needs_complete' -f -a '(__fish_aft_complete)'
complete -c apigee-templater -n '__fish_aft_needs_complete' -f -a '(__fish_aft_complete)'
`;
  }

  static getPowerShellScript(): string {
    return `
Register-ArgumentCompleter -Native -CommandName 'aft', 'apigee-templater', 'aft.exe', 'apigee-templater.exe' -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)

    $elements = $commandAst.Elements
    $prev = ""
    if ($elements.Count -gt 1) {
        $prev = $elements[$elements.Count - 2].Extent.Text
    }

    if ($prev -match '^(-a|--applyFeature|-r|--removeFeature|-f|--format|-d|--drz|completion)$' -or $wordToComplete -like '-*') {
        $completions = & aft --complete "$prev" "$wordToComplete" 2>$null
        if ($completions) {
            $completions | ForEach-Object {
                [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
            }
            return
        }
    }

    Get-ChildItem -Path "$wordToComplete*" -ErrorAction SilentlyContinue | ForEach-Object {
        $name = if ($_.PSIsContainer) { "$($_.Name)/" } else { $_.Name }
        [System.Management.Automation.CompletionResult]::new($name, $name, 'ProviderItem', $name)
    }
}
`;
  }

  static detectShellConfig(): { shell: string; configPath: string } | null {
    const shellEnv = process.env.SHELL || "";
    const homeDir = os.homedir();

    if (shellEnv.includes("zsh")) {
      return { shell: "zsh", configPath: path.join(homeDir, ".zshrc") };
    }
    if (shellEnv.includes("bash")) {
      const bashProfile = path.join(homeDir, ".bash_profile");
      const bashrc = path.join(homeDir, ".bashrc");
      const configPath =
        process.platform === "darwin" && fs.existsSync(bashProfile)
          ? bashProfile
          : bashrc;
      return { shell: "bash", configPath };
    }
    if (shellEnv.includes("fish")) {
      return {
        shell: "fish",
        configPath: path.join(homeDir, ".config", "fish", "completions", "aft.fish"),
      };
    }
    if (
      shellEnv.includes("pwsh") ||
      shellEnv.includes("powershell") ||
      process.platform === "win32" ||
      process.env.PSModulePath
    ) {
      if (process.platform === "win32") {
        const psCoreProfile = path.join(
          homeDir,
          "Documents",
          "PowerShell",
          "Microsoft.PowerShell_profile.ps1"
        );
        const winPsProfile = path.join(
          homeDir,
          "Documents",
          "WindowsPowerShell",
          "Microsoft.PowerShell_profile.ps1"
        );
        const configPath =
          fs.existsSync(winPsProfile) && !fs.existsSync(psCoreProfile)
            ? winPsProfile
            : psCoreProfile;
        return { shell: "powershell", configPath };
      } else {
        return {
          shell: "powershell",
          configPath: path.join(
            homeDir,
            ".config",
            "powershell",
            "Microsoft.PowerShell_profile.ps1"
          ),
        };
      }
    }
    return null;
  }

  static install(): boolean {
    const detection = this.detectShellConfig();
    if (!detection) {
      console.log(
        chalk.red(
          "✖ Could not automatically detect your shell ($SHELL is not zsh, bash, fish, or powershell)."
        )
      );
      console.log(
        chalk.yellow("Run 'aft completion <zsh|bash|fish|powershell>' to view the shell completion script.")
      );
      return false;
    }

    const { shell, configPath } = detection;
    const script =
      shell === "zsh"
        ? this.getZshScript()
        : shell === "bash"
        ? this.getBashScript()
        : shell === "fish"
        ? this.getFishScript()
        : this.getPowerShellScript();

    const snippet = `\n${this.MARKER_START}\n# Auto-generated by aft for ${shell}\n${script.trim()}\n${this.MARKER_END}\n`;

    try {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });

      let currentContent = fs.existsSync(configPath)
        ? fs.readFileSync(configPath, "utf8")
        : "";

      const regex = new RegExp(
        `${this.MARKER_START}[\\s\\S]*?${this.MARKER_END}`,
        "g"
      );
      if (regex.test(currentContent)) {
        currentContent = currentContent.replace(regex, snippet.trim());
        fs.writeFileSync(configPath, currentContent, "utf8");
        console.log(
          chalk.green(
            `✔ Updated auto-complete script in ${chalk.bold(configPath)}`
          )
        );
      } else {
        fs.appendFileSync(configPath, snippet, "utf8");
        console.log(
          chalk.green(
            `✔ Installed auto-complete script into ${chalk.bold(configPath)}`
          )
        );
      }

      console.log(`\n  ${chalk.cyan("To activate completions now, run:")}`);
      if (shell === "powershell") {
        console.log(`  ${chalk.bold(`. $PROFILE`)}\n`);
      } else {
        console.log(`  ${chalk.bold(`source ${configPath}`)}\n`);
      }
      return true;
    } catch (err: any) {
      console.error(
        chalk.red(`✖ Failed to write to ${configPath}: ${err.message}`)
      );
      return false;
    }
  }

  static uninstall(): boolean {
    const detection = this.detectShellConfig();
    if (!detection) {
      console.log(
        chalk.red(
          "✖ Could not automatically detect your shell ($SHELL is not zsh, bash, fish, or powershell)."
        )
      );
      return false;
    }

    const { configPath } = detection;
    if (!fs.existsSync(configPath)) {
      console.log(chalk.yellow(`ℹ Config file ${configPath} does not exist.`));
      return false;
    }

    try {
      let content = fs.readFileSync(configPath, "utf8");
      const regex = new RegExp(
        `\n?${this.MARKER_START}[\\s\\S]*?${this.MARKER_END}\n?`,
        "g"
      );
      if (regex.test(content)) {
        content = content.replace(regex, "\n");
        fs.writeFileSync(configPath, content, "utf8");
        console.log(
          chalk.green(
            `✔ Removed auto-complete setup from ${chalk.bold(configPath)}`
          )
        );
        return true;
      } else {
        console.log(
          chalk.yellow(`ℹ No auto-complete setup found in ${configPath}`)
        );
        return false;
      }
    } catch (err: any) {
      console.error(
        chalk.red(`✖ Failed to update ${configPath}: ${err.message}`)
      );
      return false;
    }
  }

  static printInstructions(): void {
    console.log(`\n  ${chalk.bold.cyan("Shell Auto-Completion Setup:")}\n`);
    console.log(
      `    ${chalk.yellow("aft completion install")}     ${chalk.white("Automatically detect shell & install tab-completions")}`
    );
    console.log(
      `    ${chalk.yellow("aft completion uninstall")}   ${chalk.white("Remove auto-complete scripts from shell configuration")}`
    );
    console.log(
      `    ${chalk.yellow("aft completion zsh")}         ${chalk.white("Print Zsh completion script (default on macOS)")}`
    );
    console.log(
      `    ${chalk.yellow("aft completion bash")}        ${chalk.white("Print Bash completion script")}`
    );
    console.log(
      `    ${chalk.yellow("aft completion fish")}        ${chalk.white("Print Fish completion script")}`
    );
    console.log(
      `    ${chalk.yellow("aft completion powershell")}  ${chalk.white("Print PowerShell completion script (alias: pwsh)")}\n`
    );
  }
}
