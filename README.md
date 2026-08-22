<p align="center"><img width="244" height="244" alt="aft logo" src="https://amalbagee.web.app/apigee/aft-logo.png" />

# Apigee Feature Templater (aft) v5

![image](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![image](https://img.shields.io/badge/Bun-101010?style=for-the-badge&logo=bun&logoColor=white)
![image](https://img.shields.io/badge/Google_Cloud-4285F4?style=for-the-badge&logo=google-cloud&logoColor=white)
![image](https://img.shields.io/badge/Status-Beta-orange?style=for-the-badge)
![image](https://img.shields.io/badge/Apache--2.0-green?style=for-the-badge)

> [!NOTE]
> **AFT v5 is currently in Beta testing!** We've refactored `aft` to run natively on Bun with zero-dependency standalone binaries. If you encounter any bugs or have feature requests, please [open an issue](https://github.com/apigee/apigee-templater/issues).

> [!IMPORTANT]
> 🚀 **Exciting News: Native Apigee X & `gcloud` YAML Proxy Support is now in BETA!**
> 
> Google Cloud has launched native [Apigee YAML Proxy Configurations](https://docs.cloud.google.com/apigee/docs/api-platform/fundamentals/configure-proxy-with-yaml) and [`gcloud beta apigee apis import`](https://docs.cloud.google.com/sdk/gcloud/reference/beta/apigee/apis/import)!
> 
> **AFT v5** is fully aligned with the official Apigee YAML schema, giving you a seamless bridge between local feature templating and native `gcloud` / Apigee X deployments.

**Apigee Feature Templater** is a fast CLI tool to help manage Apigee templates & proxies. It can easily convert between **Apigee X proxies,** **Apigee exported bundles**, **YAML** & **JSON** formats, as well as bringing merge capabilities for features and templates.

## Features
* 🔋 **Batteries included** - all conversions in all directions from a simple CLI, with complete resources and policies in a single YAML or JSON file.
* 🎨 Optimized and beautiful **YAML & JSON** exports, no funny artifacts or strange attributes.
* 💯 **100% compatibility** to the Apigee bundle format - all policies and structures can be converted to and from YAML / JSON. If something doesn't work, create an issue and it will be fixed.
* ⛲ **Feature Driven Development** - create reusable feature files that can be easily applied to many proxies, teams & deployments.

## Install the CLI

### Option 1: One-Line Installer (Zero dependencies)

The easiest way to install `aft` globally on your machine without requiring Node.js or Bun:

**macOS & Linux**:
```sh
curl -fsSL https://raw.githubusercontent.com/apigee/apigee-templater/main/install.sh | sh
```

**Windows (PowerShell)**:
```powershell
iwr -useb https://raw.githubusercontent.com/apigee/apigee-templater/main/install.ps1 | iex
```

### Option 2: Manual Binary Download

Download pre-compiled, zero-dependency binaries directly from [GitHub Releases](https://github.com/apigee/apigee-templater/releases):

* 🐧 **Linux (x64)**: `aft-linux-x64`
* 🐧 **Linux (ARM64)**: `aft-linux-arm64`
* 🍎 **macOS (Apple Silicon)**: `aft-darwin-arm64`
* 🍎 **macOS (Intel)**: `aft-darwin-x64`
* 🪟 **Windows (x64)**: `aft-windows-x64.exe`

Make the downloaded binary executable (`chmod +x aft-linux-x64`) and place it in your `PATH`.

### Shell Auto-Completion (Tab-to-Complete)

Enable dynamic shell auto-completion for feature names (`-a`, `-r`), formats (`-f`), and CLI flags across **macOS (Zsh/Bash)**, **Linux (Bash/Zsh/Fish)**, and **Windows (PowerShell)**:

```bash
# Automatically detect shell (Zsh, Bash, Fish, PowerShell) and install
aft completion install
```

To view or manually source the raw completion script:
```bash
aft completion zsh         # macOS / Linux default
aft completion bash        # Bash
aft completion fish        # Fish
aft completion powershell  # Windows PowerShell (alias: pwsh)
```

### AI Agent Skill Installation

Install the native `apigee-templater` skill for AI coding assistants (such as Google Antigravity, Gemini CLI, Claude Code, Cursor, Codex, and others):

```bash
# Installs the apigee-templater skill to ~/.agents/skills/apigee-templater
aft skill install

# To remove the skill later
aft skill uninstall
```

### Cache Management

`aft` caches remote templates and features in a lightweight local file cache (`~/.aft/cache/`). The cache is automatically refreshed once it is older than 24 hours. You can inspect or clear the cache at any time:

```bash
# Clear local cached templates and features
aft cache clear
```

### Updating `aft`

To update to the latest release, re-run the install script:

**macOS & Linux**:
```sh
curl -fsSL https://raw.githubusercontent.com/apigee/apigee-templater/main/install.sh | sh
```

**Windows (PowerShell)**:
```powershell
iwr -useb https://raw.githubusercontent.com/apigee/apigee-templater/main/install.ps1 | iex
```

### Uninstalling `aft`

To completely remove `aft`, its shell completions, skills, and cache:

```bash
# 1. Remove shell completions, AI skill, and local cache
aft completion uninstall
aft skill uninstall
aft cache clear

# 2. Remove the binary
# macOS & Linux:
rm -f ~/.local/bin/aft
# (or /usr/local/bin/aft if installed as root)
```

**Windows (PowerShell)**:
```powershell
# 1. Remove shell completions and AI skill
aft completion uninstall
aft skill uninstall
aft cache clear

# 2. Remove the binary directory
Remove-Item -Recurse -Force "$env:LocalAppData\Programs\aft"
```

---

## Display help
```bash
aft -h
```

### Example proxy YAML

Click [here](https://iili.io/ByOhMmJ.png) for an interactive explanation of the YAML proxy format.

<a href="https://apigee.github.io/apigee-templater">
  <img src="https://iili.io/ByOhMmJ.png" alt="Alt Text" width="300" />
</a>

The proxy YAML & JSON formats is easy to understand and edit, with all proxy flows, policies, & resources in one YAML / JSON structure.

```yaml
name: SimpleProxy-v1
displayName: SimpleProxy-v1
type: proxy
gateway: apigee
schemaVersion: 1.0.0
description: A simple proxy to the Apigee mock target.
endpoints:
  - name: default
    basePath: /v1/simple-proxy
    routes:
      - name: default
        target: default
    flows:
      - name: PostFlow
        mode: Response
        steps:
          - name: JS-SetResponse
    faultRules: []
targets:
  - name: default
    url: https://mocktarget.apigee.net
    flows: []
    faultRules: []
    httpTargetConnection:
      Properties: {}
      URL: https://mocktarget.apigee.net
policies:
  - name: JS-SetResponse
    type: Javascript
    content:
      Javascript:
        metadata:
          continueOnError: "false"
          enabled: "true"
          timeLimit: "200"
          name: JS-SetResponse
        DisplayName: JS-SetResponse
        Properties: {}
        Source: |-
          print("hello world!!");
          context.proxyResponse.content += "hello world!";
resources: []
```

To deploy this proxy in your org, you could do **either** of these steps:

```bash
# Deploy directly from YAML to Apigee X
aft -i SimpleProxy-v1.yaml -o MyApigeeOrg:SimpleProxy-v1

# Or first convert to an Apigee bundle, and then deploy with apigeecli
aft -i SimpleProxy-v1.yaml -o SimpleProxy-v1.zip
apigeecli apis create bundle -f SimpleProxy-v1.zip --name SimpleProxy-v1 -o MyApigeeOrg --default-token
```

## Conversions

The easiest way to get started is to do some Apigee proxy conversions.

### Convert an Apigee bundle to YAML
```sh
aft -i ./test/proxies/SimpleProxy-v1.zip -o SimpleProxy-v1.yaml
```

### Convert a deployed Apigee X proxy to YAML or JSON
Authorization to the Apigee X API will be done using your gcloud default application credentials, or pass a token with `-t`.
```bash
aft -i MyApigeeOrg:SimpleProxy-v1 -o SimpleProxy-v1.yaml
aft -i MyApigeeOrg:SimpleProxy-v1 -o SimpleProxy-v1.json
```

### Convert a Proxy YAML to an Apigee bundle
```bash
aft -i SimpleProxy-v1.yaml -o SimpleProxy-v1.zip
```

### Convert and deploy a proxy YAML to Apigee X
```bash
# simple import
aft -i SimpleProxy-v1.yaml -o MyApigeeOrg:SimpleProxy-v1:MyApigeeEnvironment
# deploy with a service account to the dev environment
aft -i SimpleProxy-v1.yaml -o MyApigeeOrg:SimpleProxy-v1:dev:mysa@myproject.iam.gserviceaccount.com
```

## Feature templating
Feature templating is a powerful way to abstract feature definitions and apply them flexibly to proxy templates. 

With feature templating, Apigee expert teams can create the features, and anyone can then create and deploy full secured & compliant API proxies, with canonical features like security, authn/authz, logging, transformations, etc.. built-in.

Let's create an AI model proxy for Gemini in a few simple feature commands.

### Create a feature
```bash
aft -n REST-AI-Gemini -b /v1/models -u https://generativelanguage.googleapis.com/v1/models
```

You should have a `REST-AI-Gemini.yaml` feature YAML file that has a simple proxy to the Gemini API endpoints.

### Create a template
A template collects features that will be deployed as one proxy to Apigee. We can create a template with a command, and add our Gemini feature.

```bash
# create a template
aft REST-AI-Gateway.yaml
# apply the Gemini feature
aft REST-AI-Gateway.yaml -a REST-AI-Gemini.yaml
# deploy to Apigee X to the dev environment
aft REST-AI-Gateway.yaml -o MyApigeeOrg:REST-AI-Gateway:dev
```

### Convert between templates, features and proxies

You can convert any Apigee proxy to/from a feature just by using the **-f feature** flag, which turns any proxy into a feature, with parameters and the possibility to apply policies to all endpoints and targets in destination proxies (the **default** endpoint and **default** target policies are applied to all endpoints and targets in a destination proxy, which can be useful to apply general flows like auth or traffic management).

### Common variables

These Apigee variable names are commonly used in features, making extension and re-use esaier.

* **ai.model** - The name of the AI model being used or requested, for example **gemini-flash-latest**.
* **ai.user** - The actual user using the model (email, user_id).
* **ai.provider** - The provider of the model.
* **ai.protocol** - The API protocol format of the calls (either google, openai, anthropic, or other)
* **ai.requestType** - The type of AI request being made, either **streaming** or **non-streaming**.
* **ai.apiType** - The API type of the AI request, currently eitehr **googlecloud** for Model Garden requests, or **oai** for the standard messaging format.
* **ai.requestPrompt** - The user's request prompt to the AI model.
* **ai.requestTokenCount** - The request token count to the AI model.
* **ai.responseTokenCount** - The response token count data from the AI model.
* **ai.totalTokenCount** - The total request and response token count.
* **ai.timeToFirstToken** - The number of milliseconds until the first token is returned by the AI model.
* **ai.prices** - A price list for models in this format: {"default": { "requestPerMillionTokens": 1, "responsePerMillionTokens": 3 }, "claude-sonnet-5": { "requestPerMillionTokens": 3, "responsePerMillionTokens": 15 }}

### Common data collectors

These data collectors are commonly used in features, making extension and re-use easier.

* **dc_ai_model** - STRING - The name of the AI model being used or requested.
* **dc_ai_user** - STRING - The actual user id (email or id) of the model.
* **dc_ai_provider** - STRING - The provider of the model.
* **dc_ai_cost_center** - STRING - The name of the cost center of the user.
* **dc_ai_total_token_count** - INTEGER - The total token count of the request & response.
* **dc_ai_prompt_token_count** - INTEGER - The request prompt token count.
* **dc_ai_response_token_count** - INTEGER - The response prompt token count.
* **dc_ai_response_type** - STRING - either `streaming` or `non-streaming`.
* **dc_ai_time_first_token** - INTEGER - The time in milliseconds to the first token response of the model.
* **dc_ai_request_cost** - FLOAT - The cost of the model request.
* **dc_ai_response_cost** - FLOAT - The cost of the model response.
* **dc_ai_total_cost** - FLOAT - The total cost of the call.

## License 📜

[Apache 2.0](./LICENSE) - Not an official Google product (but still awesome).
