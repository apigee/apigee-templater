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

## Documentation & Reference

For comprehensive developer documentation with interactive search, category filters, complete command reference, and real-world recipes, visit:

👉 **[https://apigee.github.io/apigee-templater](https://apigee.github.io/apigee-templater)**

* **Real-Time Search & Filter**: Search across all commands, flags, parameters, and examples.
* **Complete Command Coverage**: In-depth syntax and options for `convert`, `describe`, `list`, `completion`, `skill`, `cache`, and Apigee X deployments.
* **Copy-Pasteable Recipes**: End-to-end examples for AI model gateways, API key enforcement, SharedFlow bundles, and GitOps migrations.

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

The proxy YAML & JSON formats is easy to understand and edit, with all proxy flows, policies, & resources in one YAML / JSON structure. Check the [Documentation](https://apigee.github.io/apigee-templater) for complete syntax and schema details.

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/apigee/apigee-templater/main/schema/gateway.schema.1.0.json
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
aft -i SimpleProxy-v1.yaml --organization MyApigeeOrg

# Or first convert to an Apigee bundle, and then deploy with apigeecli
aft -i SimpleProxy-v1.yaml -o SimpleProxy-v1.zip
apigeecli apis create bundle -f SimpleProxy-v1.zip --name SimpleProxy-v1 -o MyApigeeOrg --default-token
```

## Conversions & Exports

The easiest way to get started is to do some Apigee proxy, product, and user conversions and exports.

### Convert an Apigee bundle to YAML
```sh
aft -i ./test/proxies/SimpleProxy-v1.zip -o SimpleProxy-v1.yaml
```

### Export a deployed Apigee X proxy to YAML or JSON
Authorization to the Apigee X API will be done using your gcloud default application credentials, or pass a token with `-t`. You can use `--organization`, `--org`, or `--project` interchangeably.
```bash
aft SimpleProxy-v1 --organization MyApigeeOrg -o SimpleProxy-v1.yaml
# Or use the shorter --org or --project aliases:
aft SimpleProxy-v1 --org MyApigeeOrg -o SimpleProxy-v1.yaml
aft SimpleProxy-v1 --project MyApigeeOrg -o SimpleProxy-v1.json

# Export all proxies in an organization to a directory
aft --organization MyApigeeOrg -o ./proxies/
```

### Export Apigee Products to YAML
Export API products from an Apigee organization to clean YAML files:

```bash
# Export a single product to YAML
aft my-product --organization MyApigeeOrg -f product -o my-product.yaml

# Export all products in an organization to individual YAML files in a directory
aft --organization MyApigeeOrg -f product -o ./products/

# Export all products to a single YAML file
aft --organization MyApigeeOrg -f product -o products.yaml
```

### Export Developers, Apps & Credentials to YAML
Export developer users along with their registered developer apps and API credentials:

```bash
# Export a single developer user (by email or username)
aft dev@example.com --organization MyApigeeOrg -f user -o dev.yaml

# Export all developers, apps, and credentials to individual YAML files in a directory
aft --organization MyApigeeOrg -f user -o ./users/

# Export all developers, apps, and credentials to a single YAML file
aft --organization MyApigeeOrg -f user -o users.yaml
```

### Convert a Proxy YAML to an Apigee bundle
```bash
aft -i SimpleProxy-v1.yaml -o SimpleProxy-v1.zip
```

### Convert and deploy a proxy YAML to Apigee X
```bash
# Simple deploy to environment
aft -i SimpleProxy-v1.yaml --organization MyApigeeOrg --environment MyApigeeEnvironment

# Deploy with a service account to the dev environment (supports full email or short name via --service-account or --sa)
aft -i SimpleProxy-v1.yaml --org MyApigeeOrg --environment dev --sa mysa
# mysa will automatically expand to mysa@MyApigeeOrg.iam.gserviceaccount.com
```

### Describe Resources
Use `aft describe <input>` (or simply `aft <file/resource>`) to inspect and summarize any input (proxy, template, feature, product, user, or remote Apigee resource) directly in the terminal overview card without writing any files or showing the banner:

```bash
# Describe an existing file or repository resource directly without overwriting
aft SimpleProxy-v1.yaml
aft MyTemplate.yaml

# If the file does not exist and is not in the repository, aft creates an empty template:
aft NewProxy.yaml
# -> creates NewProxy.yaml as an empty template proxy

# Or explicitly using the describe command
aft describe SimpleProxy-v1.yaml
aft describe MyTemplate.yaml
aft describe MyFeature.yaml
aft describe MyProduct.yaml
aft describe MyUser.yaml

# Describe a remote Apigee proxy or resource
aft describe SimpleProxy-v1 --org MyApigeeOrg
```

> [!TIP]
> **Compatibility Note**: The legacy colon syntax (e.g. `aft -i MyApigeeOrg:SimpleProxy-v1 -o SimpleProxy-v1.yaml` or `-o MyApigeeOrg:Proxy:dev:sa`) is still supported for backwards compatibility.

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
aft REST-AI-Gateway.yaml --organization MyApigeeOrg --environment dev
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
