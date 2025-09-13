# Apigee Templater v3
Apigee Templater is a [Node.js](https://nodejs.org/) tool written in [Typescript](https://www.typescriptlang.org/) providing assisted & streamlined Apigee proxy authoring through the use of **template** and **feature** definitions.

## Concepts

- **Template** - a template is file used to generate Apigee proxies. It includes basic endpoint, target and feature configurations that describe a proxy, however it doesn't include the details of the included features. This makes it clean and optimized.

Example template in YAML for a no-target proxy:
```yaml
---
name: SimpleProxy-v1
features: []
endpoints:
- name: default
  path: "/v1/simple-proxy"
  routes:
  - name: default
targets: []
policies: []
resources: []
```

- **Feature** - a feature is a piece of composable functionality that can be added to templates, and includes all details needed to implement the functionality. Here is an [example feature definition](https://github.com/apigee/apigee-templater/blob/main/test/features/auth-apikey-header.json) that adds API key authentication polices. Apigee proxies can be converted to features easily using Apigee Templater.

- **Proxy** - a proxy is a finished API generated from one template and multiple features, and can be either in JSON, YAML or ZIP format. It includes all details of the API logic and handling, and can be directly deployed to any Apigee instance.

Using **templates**, **features** and **proxies** it's possible to compose Apigee proxies from pre-defined building blocks, without having to directly write or create Apigee proxy definitions. If templates and features cannot be found locally, the [repository directory](https://github.com/apigee/apigee-templater/tree/main/repository) here is checked as a central repository. If you would like to add useful templates or features to the repository, just open a pull request.

Apigee Templater provides **REST**, **MCP** and **CLI** interfaces to build, manage & apply templates and features to create or modify Apigee proxies. Apigee Templater v3 is currently in **ALPHA** status, if you test and find bugs or have feature requests please report them as [Issues](https://github.com/apigee/apigee-templater/issues).

## Getting started
- Check out the `SimpleProxy-v1` proxy [ZIP](https://github.com/apigee/apigee-templater/tree/main/test/templates/SimpleProxy-v1/apiproxy), [JSON](https://github.com/apigee/apigee-templater/blob/main/test/templates/SimpleProxy-v1.json) and [YAML](https://github.com/apigee/apigee-templater/blob/main/test/templates/SimpleProxy-v1.yaml) formats. The proxy receives traffic at the `/v1/simple-proxy` base path, and directs traffic to two targets based on the path. A Javascript policy also adds "hello world" to the response.
- Check out the feature `auth-apikey-header` [JSON](https://github.com/apigee/apigee-templater/blob/main/test/features/auth-apikey-header.json) definition.
- Check out the `SimpleProxy-v2` [JSON definition](https://github.com/apigee/apigee-templater/blob/main/test/templates/SimpleProxy-v2.json) after the feature `auth-apikey-header` has been applied, adding auth to the proxy.
- Test the [Apigee Templater Agent](https://apigee-templater-agent-609874082793.europe-west1.run.app) built with [ADK](https://google.github.io/adk-docs/) and using the Apigee Templater MCP server to create templates and add / remove features.
- Run the unit tests for the above flow after cloning the repository with `npm i && npm run test`.
## CLI
You can use the **apigee-templater** CLI locally or using npx. Currently the CLI can do conversions and apply / remove features to proxies.
```sh
# Install globally
npm i -g apigee-templater

# Run with npx
npx apigee-templater

# Convert Apigee proxy ZIP to a template in YAML format
cd test/templates
npx apigee-templater -f SimpleProxy-v1.zip -n SimpleProxy-v1 -o yaml
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

## Limitations
Currently these features are not yet supported:
- Apigee proxy conditional endpoints are not yet supported.
- Apigee fault rules and fault handling is not yet supported.
- MCP and CLI inputs cannot yet process parameters when applying features, so currently only default values are used.
- Find out the best way to leverage **Shared Flows** - currently features can have Flow Callout policies as part of their feature logic, but maybe it would be useful to convert a shared flow to a feature, or something similar...
- Since this in ALPHA status and only test data is being used, there is currently no auth to the REST and MCP server.

## Plans & ideas
These are some future ideas for additions, feel free to suggest any changes under Issues or Discussions.
- Add proxy conditional endpoints and fault rules, as documented under limitations above.
- Allow features to also have targets and endpoints, this could be interesting to compose proxies from features (for example compose Gemini and Mistral features into an AI proxy).
- Allow templates to be applied directly to Apigee orgs using OAuth to authenticate to the Apigee API.

## Contributing

See the [contributing instructions](./CONTRIBUTING.md) to get started.

## License

All solutions within this repository are provided under the
[Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0) license.
Please see the [LICENSE](./LICENSE) file for more detailed terms and conditions.

## Disclaimer

This repository and its contents are not an official Google product.
