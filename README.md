# Apigee Templater
Apigee Templater v3 provides templating & feature management for Apigee proxies in **XML**, **JSON** & **YAML** formats. It provides services through a **REST** and **MCP** server, and a local **CLI**.
Apigee Templater v3 is currently in **beta** status, if you test and find bugs please report as issues here in the repo.

### Prerequisites
* [Node.js](https://nodejs.org/)

### Features
- Convert Apigee exported ZIP proxies into an opinionated JSON and YAML format. All policies, resources and other XML files are converted into JSON or YAML and saved in the same document, resulting in a single JSON or YAML output file.
- Convert JSON or YAML file back into an Apigee ZIP proxy file that can be deployed to any Apigee instance.
- Convert Apigee ZIP proxies into feature files, which can be applied to other proxies. The purpose is to make it easy to add / remove features to proxies without configuring individual Apigee policies, but just using feature configurations.
- Apply or remove feature definitions from JSON or YAML proxies. This can easily be done through chat using the MCP service, or through REST or CLI calls.

## Getting started
- Check out the `SimpleProxy-v1` test data definition in ZIP, JSON and YAML format.
```sh
# Install globally
npm i -g apigee-templater

# Run with npx
npx apigee-templater
```
## Limitations
Currently these features are not yet supported:
- Apigee proxy conditional endpoints are not yet supported.
- Apigee fault rules and fault handling is not yet supported when converting between zip and json.
- MCP and CLI inputs cannot yet process parameters when applying features, so currently only default values are used.

## Contributing

See the [contributing instructions](./CONTRIBUTING.md) to get started.

## License

All solutions within this repository are provided under the
[Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0) license.
Please see the [LICENSE](./LICENSE) file for more detailed terms and conditions.

## Disclaimer

This repository and its contents are not an official Google product.
