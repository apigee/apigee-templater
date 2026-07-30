---
name: apigee-templater
description: Building and editing Apigee Templater YAML files (proxies, templates, features), common policies (API Key, Data Capture, KVM, Service Callout), no-target proxies, SSE event handling (EventFlow), and Templater quirks.
---

# Apigee Templater YAML Development Guide

This skill provides patterns, templates, policy examples, and known quirks for creating and modifying Apigee Templater proxy and feature YAML files.

---

## 1. Structure of an Apigee Templater YAML File

An Apigee Templater file defines proxies, templates, or features. Top-level keys include:

```yaml
name: my-proxy-v1
displayName: My Proxy v1
type: feature # or proxy/template
description: API Proxy description
parameters: []
defaultEndpoint:
  name: default
  basePath: /v1/myapi
  routes:
    - name: default
      target: default
  flows:
    - name: PreFlow
      mode: Request
      steps:
        - name: Verify-API-Key
    - name: PostFlow
      mode: Response
      steps:
        - name: JS-Analytics
faultRules: []
targets:
  - name: default
    url: https://target.example.com
    flows: []
policies: []
resources: []
```

---

## 2. Standard Target Proxy Template

Use when proxying requests to a backend target URL.

```yaml
name: target-proxy-v1
displayName: Target Proxy v1
type: feature
description: Proxies incoming requests to a backend target service.
defaultEndpoint:
  name: default
  basePath: /v1/service
  routes:
    - name: default
      target: default
  flows:
    - name: PreFlow
      mode: Request
      steps:
        - name: Verify-API-Key
targets:
  - name: default
    url: https://api.backend.com
    flows:
      - name: PostFlow
        mode: Response
        steps:
          - name: JS-TransformResponse
policies:
  - name: Verify-API-Key
    type: VerifyAPIKey
    content:
      verifyAPIKey:
        metadata:
          name: Verify-API-Key
        apiKey:
          ref: request.header.x-api-key
  - name: JS-TransformResponse
    type: Javascript
    content:
      javascript:
        metadata:
          name: JS-TransformResponse
        source: |
          // Modify response content in response flow
          var data = JSON.parse(response.content);
          data.processedBy = "Apigee";
          response.content = JSON.stringify(data);
```

---

## 3. No-Target Proxy Template

Use when handling logic entirely within Apigee (e.g. mock responses, edge logic, router functions) without forwarding to a backend target.

> [!IMPORTANT]
> **Response Modification Rule:** In Apigee, `response.content` can ONLY be set or modified in **Response** flows (e.g. `PostFlow` in `mode: Response` or target response flows). Modifying `response.content` during `Request` mode will be ignored or cause runtime errors.

```yaml
name: no-target-v1
displayName: No Target Proxy v1
type: feature
description: Local edge processing or mock response without a backend target.
defaultEndpoint:
  name: default
  basePath: /v1/mock
  flows:
    - name: PreFlow
      mode: Request
      steps:
        - name: JS-ProcessRequest
    - name: PostFlow
      mode: Response
      steps:
        - name: JS-GenerateResponse
policies:
  - name: JS-ProcessRequest
    type: Javascript
    content:
      javascript:
        metadata:
          name: JS-ProcessRequest
        source: |
          // Read request data and set context variables
          context.setVariable("request.processed", "true");
  - name: JS-GenerateResponse
    type: Javascript
    content:
      javascript:
        metadata:
          name: JS-GenerateResponse
        source: |
          // Generate/modify response content in Response flow
          var mockData = {
            status: "success",
            timestamp: Date.now()
          };
          response.content = JSON.stringify(mockData);
```

---

## 4. SSE / Streaming Event Handling (`EventFlow`)

When proxying Server-Sent Events (SSE) or chunked streams, use `EventFlow` in target response flows to process individual stream chunks or attach policy logic.

```yaml
targets:
  - name: streaming-target
    url: https://api.openai.com
    flows:
      - name: EventFlow
        mode: Response
        steps:
          - name: JS-StreamingAnalytics
            condition: ai.responseTokenCount == null
          - name: DC-TokenAnalytics
            condition: ai.promptTokenCount != null
policies:
  - name: JS-StreamingAnalytics
    type: Javascript
    content:
      javascript:
        metadata:
          name: JS-StreamingAnalytics
        includeUrl: jsc://ai-functions.js
        source: |
          var usage = getUsageData(response.content);
          if (usage && usage.totalTokenCount > 0) {
            context.setVariable("ai.totalTokenCount", usage.totalTokenCount);
          }
```

---

## 5. Common Policy Configurations

### A. Key-Value Map Operations (KVM) — CRITICAL QUIRK
> [!CAUTION]
> **KVM `setValue` Quirk:** When writing (`PUT`) or mutating KVM entries in Apigee Templater YAML, you **MUST** use `setValue` instead of `value`. In Templater's schema parser, `value` is reserved for literal text nodes (`_text`), whereas `setValue` correctly outputs the required `<Value>` tag for `PUT` operations.

```yaml
# Correct KVM PUT operation
policies:
  - name: KVM-SaveToken
    type: KeyValueMapOperations
    content:
      keyValueMapOperations:
        metadata:
          name: KVM-SaveToken
          mapIdentifier: AuthTokens
        put:
          setValue:
            - ref: private.access_token
          key:
            parameter:
              ref: request.header.client_id
```

```yaml
# KVM GET operation
policies:
  - name: KVM-LoadConfig
    type: KeyValueMapOperations
    content:
      keyValueMapOperations:
        metadata:
          name: KVM-LoadConfig
          mapIdentifier: GlobalConfig
        get:
          assignTo: private.target_api_key
          key:
            parameter: TargetApiKey
```

### B. API Key Validation
```yaml
policies:
  - name: Verify-API-Key
    type: VerifyAPIKey
    content:
      verifyAPIKey:
        metadata:
          name: Verify-API-Key
        apiKey:
          ref: request.header.x-api-key
```

### C. Data Collectors (`DataCapture`)
```yaml
policies:
  - name: DC-Analytics
    type: DataCapture
    content:
      dataCapture:
        metadata:
          name: DC-Analytics
          continueOnError: "true"
          enabled: "true"
        capture:
          - collect:
              metadata:
                ref: ai.model
                default: unknown
            dataCollector: dc_ai_model
          - collect:
              metadata:
                ref: ai.promptTokenCount
                default: "0"
            dataCollector: dc_ai_prompt_token_count
```

### D. Service Callout
```yaml
policies:
  - name: SC-ValidateUser
    type: ServiceCallout
    content:
      serviceCallout:
        metadata:
          name: SC-ValidateUser
        request:
          variable: authRequest
          ignoreUnresolvedVariables: "false"
        response: authResponse
        httpTargetConnection:
          url: https://auth.internal.company.com/validate
```

## 6. IDE JSON Schema Validation
Apigee Templater includes a JSON Schema at `schema/apigee-templater.schema.json`.

To enable autocomplete and error checking in **VS Code** or **Zed**:

### VS Code (`.vscode/settings.json`)
```json
{
  "yaml.schemas": {
    "./node_modules/apigee-templater/dist/schema/apigee-templater.schema.json": [
      "*.yaml",
      "repository/features/*.yaml"
    ]
  }
}
```

### In-File Header Annotation
You can also add a schema comment directive at the top of your YAML file:
```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/apigee/apigee-templater/main/schema/apigee-templater.schema.json
name: my-feature-v1
type: feature
```

---

## 7. Checklist & Best Practices
- [ ] Check if `setValue` is used instead of `value` for all KVM `put` operations.
- [ ] Ensure `response.content` assignments occur in `mode: Response` flows (`PostFlow` or target response flows).
- [ ] Attach `EventFlow` on target responses when processing streaming / SSE data.
- [ ] Include required `resources` if JavaScript policies use `includeUrl` (e.g. `jsc://ai-functions.js`).
