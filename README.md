<p style="border-radius: 25px;" align="center"><img width="244" height="244" alt="Gemini_Generated_Image_h2nytbh2nytbh2ny" src="https://github.com/user-attachments/assets/06230d91-7708-4e4d-91d3-bc2649044973" /><br>**apigee feature templater**</p>

🚀 New experimental version v3. The previous version v2 is available in the [v2 branch](https://github.com/apigee/apigee-templater/tree/v2).

# Apigee Feature Templater
Apigee Feature Templater is **an experimental tool** providing assisted API authoring through the use of **Feature** and **Feature Template** definitions in JSON or YAML formats created and managed through **CLI, MCP or REST** interfaces. The tool offers a **feature-driven** approach to API development, potentially scaling up API configuration and authoring to practioners in the organization who are not Apigee proxy developers. This tool is **experimental** and explores a feature-based approach to API proxy building and configuration.

## Workflow
1. Apigee proxy developers develop and test technical feature proxies (names prefixed with **Feature-**) that provide individual, reusable functionalities. The tooling for this development uses all of the amazing existing Apigee tooling such as [apigeecli](https://github.com/apigee/apigeecli), [apigee-go-gen](https://github.com/apigee/apigee-go-gen), Apigee console, etc...

2. The features are tested and published to a repository with documentation, metadata and parameter configuration information, making it easier for non-experts to understand the capabilities and use the features. A sample repository is in this repo in the [./repository](https://github.com/apigee/apigee-templater/tree/main/repository/features) directory.

3. Practioners can use the CLI, MCP agents or web tools using the REST interface to build and publish APIs using the feature building-blocks.

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
aft -i AI-Gateway-v1.yaml -a PROXY-Gemini-v1
aft -i AI-Gateway-v1.yaml -a PROXY-Mistral-v1
aft -i AI-Gateway-v1.yaml -a AUTH-Key-Header-v1
# when applying features with -a, we can use file or https paths,
# or names from the ./repository/features directory.
```

Notice now that our `AI-Gateway-v1.yaml` file includes the configuration parameters from the three features, as well as the endpoints. This is a **Feature Template** file which when deployed will merge all features into a complete proxy.

3. Export the **Feature Template** to an Apigee org.

```sh
PROJECT_ID=YOUR_PROJECT_ID
aft -i AI-Gateway-v1.yaml -o $PROJECT_ID:AI-Gateway-v1 -t $(gcloud auth print-access-token)
```

Open the Apigee console and deploy the **AI-Gateway-v1** proxy to an Apigee environment, you can use both **Gemini** and **Mistral** at the `v1/gemini` and `v1/mistral` paths, each with API key authorization.

## Concepts
### Features
A feature JSON or YAML file models an individual functionality that can be reused in many proxies. A feature file also includes documentation, input parameter descriptions, as well as the complete feature logic, including resources and policies, completely self-contained. You can import/export Apigee proxies to feature files, making it easy to leverage the Apigee console or existing tooling for building features.

### Example feature file
A feature file can be created from an Apigee proxy ZIP, folder, or remote from an org. The `-f feature` at the end is important because it says convert the proxy format to a feature format with input parameter configuration, making it more reusable.
```yaml
# import extracted apigee proxy (from ./test/proxies/DATA-HelloWorld-v1)
aft -i ./test/proxies/DATA-HelloWorld-v1 -o DATA-HelloWorld-v1.yaml -f feature
# OR import from an Apigee org
aft -i GCP_PROJECT_ID:Feature-DATA-HelloWorld-v1 -o DATA-HelloWorld-v1.yaml -f feature
```
The resulting example feature file contains all of the proxy logic, along with any propertysets converted into input parameters that can be configured. This feature takes a configurable message and adds it to the response payload, if it exists.
```yaml
name: DATA-HelloWorld-v1
type: feature
description: Proxy for DATA-HelloWorld-v1
parameters:
  - name: MESSAGE
    displayName: MESSAGE
    description: Configuration input for MESSAGE
    default: Hello world!
    examples: []
endpointFlows:
  - name: PostFlow
    mode: Response
    steps:
      - name: JS-AddHelloWorld
targetFlows: []
endpoints: []
targets: []
policies:
  - name: JS-AddHelloWorld
    type: Javascript
    content:
      Javascript:
        _attributes:
          continueOnError: "false"
          enabled: "true"
          timeLimit: "200"
          name: JS-AddHelloWorld
        DisplayName:
          _text: JS-AddHelloWorld
        Properties: {}
        ResourceURL:
          _text: jsc://hello-world.js
resources:
  - name: hello-world.js
    type: jsc
    content: |-
      var responseObject = response.content.asJSON;

      if (responseObject) {
        var message = context.getVariable("request.queryparam.message");
        if (!message)
          message = context.getVariable("propertyset.helloworld.MESSAGE");
        if (!message)
          message = "Hello world!";
        responseObject["message"] = message;
        context.setVariable("response.content", JSON.stringify(responseObject))
      }
  - name: helloworld.properties
    type: properties
    content: |
      MESSAGE={MESSAGE}
```
## Feature Templates
Feature template files bundle multiple features with configuration parameters and documentation, making it easier to manage for proxy deployments.

### Example feature template file
An empty feature template file can be created using `aft -o FILENAME` which simply creates an empty output file. We could also add `-f feature`, however this is the default and is not needed for new files.

```sh
# create empty feature template file
aft -o HttpBin-Proxy-v1.yaml

# apply HttpBin and HelloWorld features, -i means input file,
# and is the default -o output if nothing else is set
aft -i HttpBin-Proxy-v1.yaml -a ./repository/features/PROXY-HttpBin-v1.yaml
aft -i HttpBin-Proxy-v1.yaml -a ./repository/features/DATA-HelloWorld-v1.yaml
```
Here is the resulting feature template file after applying the above features.
```yaml
name: HttpBin-Proxy-v1
type: template
description: API template for HttpBin-Proxy-v1
features:
  - repository/features/PROXY-HttpBin-v1.yaml
  - repository/features/DATA-HelloWorld-v1.yaml
parameters:
  - name: DATA-HelloWorld-v1.MESSAGE
    displayName: MESSAGE
    description: Configuration input for MESSAGE
    default: Hello world!
    examples: []
endpoints:
  - name: httpbin
    basePath: /v1/httpbin
    routes:
      - name: default
        target: httpbin
targets:
  - name: httpbin
    url: https://httpbin.org
```
This feature template file references two features, and also includes all parameters, endpoints and targets from all features into one bundle that can be deployed. If there would have been a conflict, it would have been output as a warning (with the last conflict winning).

Export this feature template to an Apigee org, or convert to an Apigee zip and deploy via [apigeecli](https://github.com/apigee/apigeecli).

```sh
# export to an apigee org
aft -i HttpBin-Proxy-v1.yaml -o GCP_PROJECT_ID:HttpBinProxy-v1 -t $(gcloud auth print-access-token)
# export to an Apigee zip
aft -i HttpBin-Proxy-v1.yaml -o HttpBinProxy-v1.zip
```

## REST & MCP server
The above examples all use the `aft` CLI tool to work with features, however we can also use MCP or REST. After cloning this repository you can start the REST & MCP server using npm.
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
