<p align="center"><img width="244" height="244" alt="Gemini_Generated_Image_62tjhy62tjhy62tj" src="https://github.com/user-attachments/assets/e977197c-f5c5-4593-bcc6-b60194280b74" />
<br><b>Apigee Feature Templater</b></p>

# Apigee Feature Templater (aft)

**Apigee Feature Templater** simplifies API authoring by using reusable **Feature** and **Template** definitions. It allows you to build APIs by composing features into templates, which can then be deployed as Apigee proxies.

## Installation

```sh
npm i apigee-templater -g
```

## Concepts & Formats

### 1. Feature
A **Feature** is a reusable unit of API logic (policies, resources, parameters).
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

### 2. Template
A **Template** composes multiple features into a proxy definition.
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

### 3. Proxy
A **Proxy** is a complete, standalone API definition that can be deployed directly. It is also the format used internally when a Template is processed.
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

## Easy Commands

- **Create a new template**:
  ```sh
  aft my-template.yaml
  ```

- **Apply a feature to a template**:
  ```sh
  aft my-template.yaml -a target-httpbin
  ```

- **Deploy a template (or proxy) to Apigee**:
  ```sh
  PROJECT_ID=my-gcp-project
  aft -i my-template.yaml -o $PROJECT_ID:my-proxy-name
  ```

## License

[Apache 2.0](./LICENSE) - Not an official Google product.
