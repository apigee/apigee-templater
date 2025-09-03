# Apigee Templater
Apigee Templater v3 provides templating & feature management services between Apigee proxy XML, JSON & YAML formats. It provides services through REST & MCP web service calls as well as through a CLI.

Apigee Templater v3 is currently in **alpha** status, if you test and find bugs please report as issues here in the repo.

## Prerequisites

* [Node.js](https://nodejs.org/) installed

## Install and run

You can use the CLI either by installing it globally on your system or with npx.

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
- MCP and CLI inputs cannot yet process parameters when applying features, so currently only default values are used for features.

## Contributing

See the [contributing instructions](./CONTRIBUTING.md) to get started.

## License

All solutions within this repository are provided under the
[Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0) license.
Please see the [LICENSE](./LICENSE) file for more detailed terms and conditions.

## Disclaimer

This repository and its contents are not an official Google product.
