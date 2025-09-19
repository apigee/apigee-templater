# Apigee Templater v3
Apigee Templater is a [Node.js](https://nodejs.org/) tool written in [Typescript](https://www.typescriptlang.org/) providing assisted & streamlined Apigee proxy authoring through the use of **template** and **feature** definitions.

## Concepts

- **Template** - a template is file used to generate Apigee proxies. It includes basic endpoint, target and feature configurations that describe a proxy, however it doesn't include the details of the included features. This makes it clean and optimized. Here is an [example template YAML file](https://github.com/apigee/apigee-templater/blob/main/repository/templates/AI-API-v1.yaml) that gives a definition for AI API composed of several features.

Here is an example template in YAML format to create a simple proxy to httpbin.org:
```yaml
---
name: HttpBin-v1
type: template
description: A simple proxy to httpbin.
features: []
endpoints:
- name: default
  basePath: "/v1/httpbin"
  routes:
  - name: default
    target: default
targets:
- name: default
  url: https://httpbin.org
```

- **Feature** - a feature is a piece of composable functionality that can be added to templates, and includes all details needed to implement the functionality. Here is an [example feature definition YAML file](https://github.com/apigee/apigee-templater/blob/main/repository/features/AI-Gemini-v1.yaml) that a Gemini endpoint and target to a template. Apigee proxies that model individual features, let's call them feature proxies, can be converted to features easily using Apigee Templater.

- **Proxy** - a proxy is a finished API generated from a template and all referenced features, and can be either in JSON, YAML or ZIP format. It includes all details of the API logic and handling, and can be directly deployed to any Apigee instance. Here is an [example proxy output YAML file](https://github.com/apigee/apigee-templater/blob/main/test/proxies/AI-Proxy-v1.yaml) that has been generated from the AI Template.

Using **templates** and **features** it's possible to compose Apigee **proxies** from pre-defined building blocks, without having to directly write or create Apigee proxy definitions in XML. If templates and features cannot be found locally, the [repository directory](https://github.com/apigee/apigee-templater/tree/main/repository) is checked as a central repository. If you would like to add useful templates or features to the repository, just open a pull request.

Apigee Templater provides **REST**, **MCP** and **CLI** interfaces to build, manage & apply templates and features to create or modify Apigee proxies. Apigee Templater v3 is currently in **BETA** status, if you test and find bugs or have feature requests please report them as [Issues](https://github.com/apigee/apigee-templater/issues).

## Getting started
- Check out the `SimpleProxy-v1` proxy [ZIP](https://github.com/apigee/apigee-templater/tree/main/test/templates/SimpleProxy-v1/apiproxy), [JSON](https://github.com/apigee/apigee-templater/blob/main/test/templates/SimpleProxy-v1.json) and [YAML](https://github.com/apigee/apigee-templater/blob/main/test/templates/SimpleProxy-v1.yaml) formats. The proxy receives traffic at the `/v1/simple-proxy` base path, and directs traffic to two targets based on the path. A Javascript policy also adds "hello world" to the response.
- Check out the feature `auth-apikey-header` [JSON](https://github.com/apigee/apigee-templater/blob/main/test/features/auth-apikey-header.json) definition.
- Check out the `SimpleProxy-v2` [JSON definition](https://github.com/apigee/apigee-templater/blob/main/test/templates/SimpleProxy-v2.json) after the feature `auth-apikey-header` has been applied, adding auth to the proxy.
- Test the [Apigee Templater Agent](https://apigee-templater-agent-609874082793.europe-west1.run.app) built with [ADK](https://google.github.io/adk-docs/) and using the Apigee Templater MCP server to create templates and add / remove features.
- Run the unit tests for the above flow after cloning the repository with `npm i && npm run test`.
## CLI
You can use the **apigee-templater** CLI locally or using npx, using either **apigee-templater** or **geet** as command.
```sh
# install
npm i -g apigee-templater

# list commands
geet -h

# get a description of the proxy Gemini-v1 from Apigee org apigee-prod13
geet -i apigee-prod13:Gemini-v1 -t $(gcloud auth print-access-token)

# export the Apigee proxy Gemini-v1 from the org apigee-prod13 as a yaml proxy file
geet -i apigee-prod13:Gemini-v1 -o Gemini-v1.yaml -t $(gcloud auth print-access-token)

# build the AI Template into a proxy zip that can be deployed to Apigee (-f format is not needed since .zip can only mean the apigee proxy format).
geet -i AI-API-v1 -o AI-API-v1.zip
```
## REST & MCP server
After cloning this repository you can start the REST & MCP server like this.
```sh
# install dependencies
npm i
# start server
npm start
```
Sample REST calls can be found in the [wiki](https://github.com/apigee/apigee-templater/wiki).

Test the MCP server in a sample ADK agent [here](https://apigee-templater-agent-609874082793.europe-west1.run.app).

Sample agent requests:

> *List all proxies in the apigee org apigee-prod13.*

> *Describe the proxy Llama-v1 in the org apigee-prod13.*

> *Import the proxy Llama-v1 to a feature with the name AI-Llama-v1.*

> *Create a new template named AI-Proxy-v1 with the features AI-Llama-v1, AI-Gemini-v1 and Auth-Key-Header-v1 applied.*

> *Export a proxy from the template AI-Proxy-v1 and deploy it to the apigee org apigee-prod13 and environment dev.*

## Limitations
Currently these features are not yet supported:
- MCP and CLI inputs cannot yet process parameters when applying features, so currently only default values are used.

## Contributing

See the [contributing instructions](./CONTRIBUTING.md) to get started.

## License

All solutions within this repository are provided under the
[Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0) license.
Please see the [LICENSE](./LICENSE) file for more detailed terms and conditions.

## Disclaimer

This repository and its contents are not an official Google product.
