<p align="center"><img width="244" height="244" alt="aft logo" src="https://github.com/tyayers/public-files/blob/main/apigee/aft-4.jpg?raw=true" />

# Apigee Feature Templater (aft) 🛥

**Apigee Feature Templater** is a command line tool to help manage Apigee templates & proxies. It can easily convert between **Apigee X proxies,** **Apigee exported bundles**, **YAML** & **JSON** formats, as well as merge capabilities for features and templates.

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

The easiest way to get started is to do some Apigee proxy conversions.

## Conversions

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

### Feature templating
Feature templating is a powerful way to abstract feature definitions and apply them flexibly to proxy templates. 

With feature templating, Apigee expert teams can create the features, and anyone can then create and deploy full secured & compliant API proxies, with canonical features like security, authn/authz, logging, transformations, etc.. built-in.

Let's create an AI model proxy for Gemini in a few simple feature commands.

### Create a template
```bash
aft AI-Gemini.yaml
```

## Add a proxy feature
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

Notice the `-f feature` command line parameter - this means save this proxy as a feature, with extra metadata for parameters, documentation and more.

## License 📜

[Apache 2.0](./LICENSE) - Not an official Google product (but still awesome).
