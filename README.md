# Apigee Templater
Apigee Templater v3 provides templating & feature management for Apigee proxies in **XML**, **JSON** & **YAML** formats. It provides services through a **REST** and **MCP** server, and a local **CLI**.
Apigee Templater v3 is currently in **ALPHA** status, if you test and find bugs please report as [Issues](https://github.com/apigee/apigee-templater/issues).

### Prerequisites
* [Node.js](https://nodejs.org/)

### Features
- Convert Apigee exported ZIP proxies into an opinionated JSON and YAML format. All policies, resources and other XML files are converted into JSON or YAML and saved in the same document, resulting in a single JSON or YAML output file.
- Convert JSON or YAML file back into an Apigee ZIP proxy file that can be deployed to any Apigee instance.
- Convert Apigee ZIP proxies into feature files, which can be applied to other proxies. The purpose is to make it easy to add / remove features to proxies without configuring individual Apigee policies, but just using feature configurations.
- Apply or remove feature definitions from JSON or YAML proxies. This can easily be done through chat using the MCP service, or through REST or CLI calls.

## Getting started
- Check out the `SimpleProxy-v1` proxy [ZIP](https://github.com/apigee/apigee-templater/tree/main/test/proxies/SimpleProxy-v1/apiproxy), [JSON](https://github.com/apigee/apigee-templater/blob/main/test/proxies/SimpleProxy-v1.json) and [YAML](https://github.com/apigee/apigee-templater/blob/main/test/proxies/SimpleProxy-v1.yaml) formats. The proxy receives traffic at the `/v1/simple-proxy` base path, and directs traffic to two targets based on the path. A Javascript policy also adds "hello world" to the response.
- Check out the feature `auth-apikey-header` [JSON](https://github.com/apigee/apigee-templater/blob/main/test/features/auth-apikey-header.json) definition.
- Check out the `SimpleProxy-v2` [JSON definition](https://github.com/apigee/apigee-templater/blob/main/test/proxies/SimpleProxy-v2.json) after the feature `auth-apikey-header` has been applied, adding auth to the proxy.
- Test an [ADK agent](https://google.github.io/adk-docs/) using the MCP server to create proxies and add / remove features here: https://apigee-templater-agent-609874082793.europe-west1.run.app.
- Run the unit tests for the above flow after cloning the repository with `npm i && npm run test`.
## CLI
You can use the **apigee-templater** CLI CLI locally or run using npx. Currently the CLI can do conversions and apply / remove features to proxies.
```sh
# Install globally
npm i -g apigee-templater

# Run with npx
npx apigee-templater

# Convert Apigee proxy ZIP to JSON
npx apigee-templater -f SimpleProxy-v1.zip -n SimpleProxy-v1 -o json
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
- Apigee fault rules and fault handling is not yet supported when converting between zip and json.
- MCP and CLI inputs cannot yet process parameters when applying features, so currently only default values are used.
- Find out the best way to leverage **Shared Flows** - currently features can have Flow Callout policies as part of their feature logic, but maybe it would be useful to convert a shared flow to a feature, or something similar...
- Since this in ALPHA status and only test data is being used, there is currently no auth to the REST and MCP server, as well as in the test agent.

## Plans & ideas
These are some future ideas for additions, feel free to suggest any changes under Issues or Discussions.
- Add proxy conditional endpoints and fault rules, as documented under limitations above.
- Allow features to also have targets and endpoints, this could be interesting to compose proxies from features (for example compose Gemini and Mistral features into an AI proxy).
- Allow proxies to be synced directly to Apigee orgs using a user OAuth flow.

## Contributing

See the [contributing instructions](./CONTRIBUTING.md) to get started.

## License

All solutions within this repository are provided under the
[Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0) license.
Please see the [LICENSE](./LICENSE) file for more detailed terms and conditions.

## Disclaimer

This repository and its contents are not an official Google product.
