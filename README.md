<p align="center"><img width="244" height="244" alt="aft logo" src="https://iili.io/ByNbtwb.png" />

# Apigee Feature Templater (aft) v4

![image](https://img.shields.io/badge/Google_Cloud-4285F4?style=for-the-badge&logo=google-cloud&logoColor=white)
![image](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![image](https://img.shields.io/badge/Node%20js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![image](https://img.shields.io/badge/Apache--2.0-green?style=for-the-badge)

**Apigee Feature Templater** is a command line tool to help manage Apigee templates & proxies. It can easily convert between **Apigee X proxies,** **Apigee exported bundles**, **YAML** & **JSON** formats, as well as bringing merge capabilities for features and templates.

## Features
* 🔋 **Batteries included** - all conversions in all directions from a simple CLI, with complete resources and policies in a single YAML or JSON file.
* 🎨 Optimized and beautiful **YAML & JSON** exports, no funny artifacts or strange attributes.
* 💯 **100% compatibility** to the Apigee bundle format - all policies and structures can be converted to and from YAML / JSON. If something doesn't work, create an issue and it will be fixed.
* ⛲ **Feature Driven Development** - create reusable feature files that can be easily applied to many proxies, teams & deployments.

## Install the CLI
```sh
# install to use the 'aft' command
npm i apigee-templater -g
# or update
npm update apigee-templater -g
```

Optionally clone this repository to run the below examples.

```sh
git clone https://github.com/apigee/apigee-templater.git
cd apigee-templater
```

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
      url: https://mocktarget.apigee.net
policies:
  - name: JS-SetResponse
    type: Javascript
    content:
      javascript:
        metadata:
          continueOnError: "false"
          enabled: "true"
          timeLimit: "200"
          name: JS-SetResponse
        displayName: JS-SetResponse
        properties: {}
    source: |-
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
aft -i SimpleProxy-v1.yaml -o MyApigeeOrg:SimpleProxy-v1:MyApigeeEnvironment
# deploy with a service account
aft -i SimpleProxy-v1.yaml -o MyApigeeOrg:SimpleProxy-v1:MyApigeeEnvironment:mysa@myproject.iam.gserviceaccount.com
```

## Feature templating
Feature templating is a powerful way to abstract feature definitions and apply them flexibly to proxy templates. 

With feature templating, Apigee expert teams can create the features, and anyone can then create and deploy full secured & compliant API proxies, with canonical features like security, authn/authz, logging, transformations, etc.. built-in.

Let's create an AI model proxy for Gemini in a few simple feature commands.

### Create a template
```bash
aft AI-Gemini.yaml
```

### Add a proxy feature
You can find the built-in features for each release in this repository under `./repository/features', or just create your own and reference as files.

```bash
aft -i AI-Gemini.yaml -a ai-proxy-gemini -p "GeminiBasePath=/llm"
```

Notice the `-p "GeminiBasePath=/gemini"` command line parameter. This sets a parameter for the feature with a custom value (instead of the default value). In this case the base path that the AI proxy will receive traffic on will be `/llm` instead of the default `/gemini`.

### Add an auth feature
Our canonical AI Auth feature uses API key authn/authz, but could easily support OAuth, SAML, JWTs, or any external IDP.
```bash
aft -i AI-Gemini.yaml -a ai-auth
```

### Deploy the template
Now we're going to deploy our AI Gemini template, creating a proxy that includes the Gemini feauture from `ai-proxy-gemini`, along with authn/authz through the `ai-auth` feature.

```bash
aft -i AI-Gemini.yaml -o MyApigeeOrg:AI-Gemini:MyApigeeEnvironment:mysa@myproject.iam.gserviceaccount.com
```

Since we have our own auth for the API, we will do a token exchange and use the `mysa` service account to authorize the call with the Gemini backend.

### Create a feature
It's easy to create a feature, just start with an Apigee proxy configuration that does exactly what you need, and export it as a feature.

You can easily deploy a feature YAML to an Apigee org to develop and test it.

```bash
aft -i ./repository/features/response-helloworld.yaml -o MyApigeeOrg:HelloWorldFeature
```

### Export a proxy to a feature
You can always take the changed proxy, and convert back to a feature definition, with documentation and parameter descriptions.

```bash
aft -i MyApigeeOrg:HelloWorldFeature -o response-helloworld.yaml -f feature
```

Notice the `-f feature` command line parameter - this means save this proxy as a feature, with extra metadata for parameters, documentation and other metadata.

### Common variables

These Apigee variable names are commonly used in features, making extension and re-use esaier.

* **ai.model** - The name of the AI model being used or requested, for example **gemini-flash-latest**.
* **ai.requestType** - The type of AI request being made, either **streaming** or **non-streaming**.
* **ai.apiType** - The API type of the AI request, currently eitehr **agentplatform** for Model Garden requests, or **oai** for the standard messaging format.
* **ai.requestPrompt** - The user's request prompt to the AI model.
* **ai.requestTokenCount** - The request token count to the AI model.
* **ai.responseTokenCount** - The response token count data from the AI model.
* **ai.totalTokenCount** - The total request and response token count.
* **ai.timeToFirstToken** - The number of milliseconds until the first token is returned by the AI model.

### Common data collectors

These data collectors are commonly used in features, making extension and re-use easier.

* **dc_ai_model** - STRING - The name of the AI model being used or requested.
* **dc_ai_cost_center** - STRING - The name of the cost center of the user.
* **dc_ai_total_token_count** - INTEGER - The total token count of the request & response.
* **dc_ai_prompt_token_count** - INTEGER - The request prompt token count.
* **dc_ai_response_token_count** - INTEGER - The response prompt token count.
* **dc_ai_response_type** - STRING - either `streaming` or `non-streaming`.
* **dc_ai_time_first_token** - INTEGER - The time in milliseconds to the first token response of the model.

## License 📜

[Apache 2.0](./LICENSE) - Not an official Google product (but still awesome).
