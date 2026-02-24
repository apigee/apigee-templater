<p align="center"><img width="244" height="244" alt="Gemini_Generated_Image_62tjhy62tjhy62tj" src="https://github.com/user-attachments/assets/e977197c-f5c5-4593-bcc6-b60194280b74" />
<br><b>Apigee Feature Templater</b></p>

# Apigee Feature Templater (aft) 🚀

**Apigee Feature Templater** is your new best friend for API authoring. Forget repetitive boilerplate—**Feature** 🧩 and **Template** 🏗️ definitions let you compose APIs like a pro. Deploy them as Apigee proxies 📦 and go grab a coffee ☕.

## Get the Party Started 🎉

```sh
npm i apigee-templater -g
```

## Concepts & Formats 🧠

### 1. Feature 🧩
Think of this as a Lego brick for your API logic. Policies, resources, parameters—all wrapped up nicely.

Example `my-feature.yaml`:
```yaml
name: response-hello-world
type: feature
description: Adds a hello world message to the response.
parameters:
  - name: MESSAGE
    default: Hello world!
policies:
  - name: JS-AddMessage
    type: Javascript
    content:
      javascript:
        resourceUrl: jsc://add-message.js
resources:
  - name: add-message.js
    type: jsc
    content: |
      context.setVariable("response.content", "Hello world!");
```

### 2. Template 🏗️
The blueprint. Mix and match features to build your dream API.

Example `my-template.yaml`:
```yaml
name: AI-Gateway-v1
type: template
description: API template for AI-Gateway-v1
features:
  - target-llm-gemini
  - auth-key-header
parameters:
  - name: auth-key-header.API_KEY_HEADER_NAME
    default: x-api-key
endpoints:
  - name: default
    basePath: /v1/gemini
    routes:
      - name: default
        target: llm-gemini
targets:
  - name: llm-gemini
    url: https://aiplatform.googleapis.com/v1/projects/{organization.name}/locations/global/endpoints/openapi/chat/completions
    auth: GoogleAccessToken
```

### 3. Proxy 📦
The final package. Ready to ship to Apigee. It is also the format used internally when a Template is processed.

Example `my-proxy.yaml`:
```yaml
name: SimpleProxy-v1
type: proxy
description: A simple proxy definition.
endpoints:
  - name: default
    basePath: /v1/simple
    routes:
      - name: default
        target: default
targets:
  - name: default
    url: https://mocktarget.apigee.net
```

## Magic Spells (Commands) 🧙‍♂️

- **Conjure a new template**: 🪄
  ```sh
  aft my-template.yaml
  ```

- **Enchant a template with a feature**: ✨
  ```sh
  aft my-template.yaml -a target-httpbin
  ```

- **Launch (Deploy) to Apigee**: 🚀
  ```sh
  PROJECT_ID=my-gcp-project
  aft -i my-template.yaml -o $PROJECT_ID:my-proxy-name
  ```

## License 📜

[Apache 2.0](./LICENSE) - Not an official Google product (but still awesome).
