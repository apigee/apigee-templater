# Apigee Feature Templater
Apigee Feature Templater is a tool providing assisted & streamlined Apigee proxy authoring through the use of **Feature** and **Template** definitions in JSON or YAML format. It is especially useful for practioners who are not Apigee experts to create & configure advanced APIs, without needing detailed knowledge of the proxy logic.

## Getting started
1. To begin let's install the tool in our local shell.
```sh
# install apigee-templater with npm
npm i apigee-templater -g
# or update to the latest version
npm update apigee-templater -g
```

2. Next let's create an empty template for an **AI Gateway API** that will proxy both **Gemini** and **Mistral** endpoints from Vertex AI, along with API key authorization.

```sh
# create an empty template, -o means output file
aft -o AI-Gateway-v1.yaml
# apply Gemini and Mistral features, -i means input file and -a means apply feature
aft -i AI-Gateway-v1.yaml -a MODEL-Gemini-v1.yaml
aft -i AI-Gateway-v1.yaml -a MODEL-Mistral-v1.yaml
aft -i AI-Gateway-v1.yaml -a AUTH-Key-Header-v1.yaml
# we could reference the features as file paths, or if no path is given it is attempted
# to fetch them from the repository/features directory in this repository.
```

You'll notice now that our `AI-Gateway-v1.yaml` file includes the configuration parameters from the three features, as well as the endpoints. This is a **Template** file which when deployed will merge all features into a complete **User Proxy**.

3. Let's deploy the **Template** to an Apigee org.

```sh
PROJECT_ID=YOUR_PROJECT_ID
aft -i AI-Gateway-v1.yaml -o $PROJECT_ID:AI-Gateway-v1 -t $(gcloud auth print-access-token)
```

Now if you open the Apigee console and deploy the **AI-Gateway-v1** proxy to an Apigee environment, you can use both **Gemini** and **Mistral** at the `v1/gemini` and `v1/mistral` paths, each with API key authorization.

You'll notice that we deployed an AI Gateway with no Apigee proxy configuration needed - the **Features** took care of all of the proxy configuration details. Since **Apigee Feature Templater** offers **CLI, REST and MCP** interfaces, this opens up API creation and configuration to a wide audience of API, AI & cloud practioners in the organization, while API teams can focus on resuable feature development.

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
- The MCP service does not yet use parameters when applying features, so currently only default values are used.

## Contributing

See the [contributing instructions](./CONTRIBUTING.md) to get started.

## License

All solutions within this repository are provided under the
[Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0) license.
Please see the [LICENSE](./LICENSE) file for more detailed terms and conditions.

## Disclaimer

This repository and its contents are not an official Google product.
