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
          URL: https://auth.internal.company.com/validate
```

---

## 6. API Product Data Type & Modeling

Apigee Templater supports defining, importing, and exporting Apigee X API Products using concise YAML definitions (`type: product`).

### A. Concise Product YAML Definition
```yaml
name: gemini-api-product
displayName: Gemini API Product
type: product
description: Access to Gemini and AI proxy operations with rate limiting
approvalType: auto
environments:
  - test
  - prod
proxies:
  - gemini-proxy-v1
quota: "1000"
quotaInterval: "1"
quotaTimeUnit: month
attributes:
  - name: access
    value: public
operations:
  - apiSource: gemini-proxy-v1
    operations:
      - name: /models
        methods:
          - GET
      - name: /chat
        methods:
          - POST
        quota:
          limit: "100"
          interval: "1"
          timeUnit: minute
llmOperations:
  - apiSource: gemini-proxy-v1
    operations:
      - name: /chat/completions
        model: gemini-1.5-pro
        methods:
          - POST
payloadOperations:
  - apiSource: gemini-proxy-v1
    operations:
      - name: /upload
        methods:
          - POST
```

### B. Template Product Referencing
Templates can reference an array of products (by filename/name or inline definition). When deploying to an Apigee environment, all referenced products are automatically deployed and associated with the environment and proxy:

```yaml
name: gemini-api-template
type: template
gateway: apigee
schemaVersion: 1.0.0
description: Complete Gemini API proxy and product bundle
endpoints:
  - name: default
    basePath: /v1/gemini
targets:
  - name: default
    url: https://generativelanguage.googleapis.com
products:
  - gemini-api-product.yaml
  - name: gemini-premium-product
    displayName: Gemini Premium Product
    type: product
    description: Unlimited premium access
    approvalType: manual
```

### C. CLI Product Commands
- **Create new Product file:**
  ```bash
  aft -f product -n my-product -o my-product.yaml
  ```
- **Export Product to Apigee X:**
  ```bash
  aft -i my-product.yaml -o my-org:my-product:eval
  ```
- **Import Product from Apigee X:**
  ```bash
  aft -i my-org:my-product -o my-product.yaml
  ```
- **Deploy Template and its Products & Users to Apigee X:**
  ```bash
  aft -i my-template.yaml -o my-org:my-proxy:eval
  ```

---

## 7. Apigee Users (Developers, Apps, and Credentials)

Apigee Templater supports a unified `user` data type that bundles an Apigee Developer, their Apps, and API Credentials / Keys in one YAML specification.

### A. User Structure (`type: user`)
```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/apigee/apigee-templater/main/schema/gateway.schema.1.0.json
name: dev-john-doe
type: user
gateway: 1.0.0
schemaVersion: 1.0.0
displayName: John Doe
email: john.doe@example.com
firstName: John
lastName: Doe
userName: jdoe
status: active
attributes:
  - name: department
    value: engineering
apps:
  - name: john-analytics-app
    displayName: John Analytics App
    description: Internal data analysis app
    callbackUrl: https://analytics.example.com/callback
    status: approved
    products:
      - standard-api-product
    scopes:
      - read
    credentials:
      - consumerKey: jdoe-client-id-12345
        consumerSecret: jdoe-client-secret-67890
        status: approved
        products:
          - standard-api-product
```

### B. Referencing Users in Templates
Templates reference products and users by file path or repository lookup name:
```yaml
name: my-service-template
type: template
gateway: 1.0.0
schemaVersion: 1.0.0
features:
  - api-key-auth.yaml
products:
  - standard-api-product.yaml
users:
  - dev-john-doe.yaml
```

### C. CLI User Commands
- **Create new User file:**
  ```bash
  aft -f user -n dev-john -o dev-john.yaml
  ```
- **Export / Deploy User to Apigee X:**
  ```bash
  aft -i dev-john.yaml -o my-org
  ```
- **Import User from Apigee X:**
  ```bash
  aft -i my-org:john.doe@example.com -f user -o dev-john.yaml
  ```
- **List Users in Apigee Org:**
  ```bash
  aft -i my-org -f user
  ```

---

## 8. SharedFlows & Features Integration

Apigee Templater provides direct bi-directional mapping between **Features** and **Apigee SharedFlows**.

### A. Concept & Mapping
- A Feature's `defaultEndpoint.flows` (steps and conditions), `defaultEndpoint.faultRules`, `policies`, and `resources` map directly to `sharedflowbundle/sharedflows/default.xml`, `sharedflowbundle/policies/`, and `sharedflowbundle/resources/`.
- SharedFlows do not contain routing or target endpoints; target definitions are omitted during conversion.
- Original feature metadata (displayName, description, parameters, priority) is preserved in `sharedflowbundle/resources/jsc/metadata.js` during export, and restored when importing back to a Feature.

### B. CLI SharedFlow Commands
- **Export Feature to SharedFlow ZIP Bundle:**
  ```bash
  aft -i cors-feature.yaml -f sharedflow -o cors-sharedflow.zip
  ```
- **Export Feature to SharedFlow Folder (`.dir`):**
  ```bash
  aft -i cors-feature.yaml -f sharedflow -o ./cors-bundle.dir
  ```
- **Deploy Feature directly as SharedFlow to Apigee X:**
  ```bash
  aft -i cors-feature.yaml -f sharedflow -o my-org:cors-security-sf:eval:sa@my-org.iam.gserviceaccount.com
  # Or with flags:
  aft -i cors-feature.yaml -f sf --organization my-org --environment eval
  ```
- **Import SharedFlow from Apigee X to Feature YAML:**
  ```bash
  aft -i my-org:cors-security-sf -f sharedflow -o cors-feature.yaml
  ```
- **Import local SharedFlow ZIP/Directory to Feature YAML:**
  ```bash
  aft -i cors-sharedflow.zip -f feature -o cors-feature.yaml
  aft -i ./cors-bundle/ -f feature -o cors-feature.yaml
  ```

---

## 9. IDE JSON Schema Validation
Apigee Templater includes a JSON Schema at `schema/gateway.schema.1.0.json`.

To enable autocomplete and error checking in **VS Code** or **Zed**:

### In-File Header Annotation
Add a schema comment directive at the top of your YAML file:
```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/apigee/apigee-templater/main/schema/gateway.schema.1.0.json
name: my-user
type: user
```

---

---

## 10. Remote Repository Resolution & Multi-Type Precedence

`aft` automatically resolves templates, features, products, and users from local paths and GitHub repositories without requiring manual downloads or full URLs.

### A. Repository Configuration
- Default Repository: `https://github.com/gcp-samples/apigee-templates-repository`
- Environment Variables:
  - `AFT_REPOSITORY`: Override base repository URL.
  - `AFT_TEMPLATES_REPOSITORY`: Custom templates path or repository URL.
  - `AFT_FEATURES_REPOSITORY`: Custom features path or repository URL.
  - `AFT_PRODUCTS_REPOSITORY`: Custom products path or repository URL.
  - `AFT_USERS_REPOSITORY`: Custom users path or repository URL.

### B. Type Resolution Precedence
When an input name is specified without a fixed format or type (e.g. `aft auth-oauth21-server --organization my-org`), `aft` evaluates resources in this order:
1. **Templates** (`templates/`)
2. **Features** (`features/`)
3. **Products** (`products/`)
4. **Users** (`users/`)

### C. Name Matching & Variants
- Lookups automatically check variations: `name`, `name.yaml`, `name.yml`, category prefixes (`category--feature-name`), single hyphens, and double hyphens.
- Fast direct raw downloads bypass GitHub API rate limiting.

---

## 11. API Products & Streamlined Operations (MCP, LLM, GraphQL, gRPC, REST)

Apigee API Products support flat, concise operations arrays where all operation-specific attributes (`apiSource`, `quota`, `model`, `protocol`, `attributes`) live directly on each list item:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/apigee/apigee-templater/main/schema/gateway.schema.1.0.json
gateway: apigee
schemaVersion: 1.0.0
name: ai-mcp-agent-starter
displayName: AI & MCP Agent Starter Product
type: product
description: Unified product bundling Gemini 2.5 completions with MCP tool orchestration
access: public # public, private, or internal
approvalType: auto # auto or manual
environments:
  - dev
proxies:
  - REST-AI-Completions
  - MCP-CustomerService
quota: "50000"
quotaInterval: "1"
quotaTimeUnit: month

# Streamlined LLM Operations
llmOperations:
  - name: /v1/chat/completions
    apiSource: REST-AI-Completions
    model: gemini-2.5-flash
    methods:
      - POST
    quota:
      limit: "10000"
      interval: "1"
      timeUnit: minute

# Streamlined MCP Payload Operations
payloadOperations:
  - name: tools/list
    apiSource: MCP-CustomerService
    protocol: MCP
    quota:
      limit: "600"
      interval: "1"
      timeUnit: minute
  - name: tools/call
    apiSource: MCP-CustomerService
    protocol: MCP
    attributes:
      - name: tool
        value: get_customer_profile
    quota:
      limit: "120"
      interval: "1"
      timeUnit: minute
```

### Operation Conventions:
- **`operations`**: REST path operations with `name`, `methods`, `apiSource`, and `quota`.
- **`llmOperations`**: Generative AI routes with `name`, `model` (e.g., `gemini-2.5-pro`), `methods`, `apiSource`, and `quota`.
- **`payloadOperations`**: MCP tool/resource/prompt operations with `name` (`tools/list`, `tools/call`, `resources/list`, `prompts/list`), `protocol: MCP`, `apiSource`, `attributes` (e.g. `tool: <tool_name>`), and `quota`.
- **`graphqlOperations`**: GraphQL schema operations with `operation`, `operationTypes`, `apiSource`, and `quota`.
- **`grpcOperations`**: gRPC service endpoints with `service`, `methods`, `apiSource`, and `quota`.

---

## 12. Exporting Proxies, Products & Users from Apigee X to YAML

You can export existing assets from an Apigee X organization to local YAML files using the `-f` format guide and `--organization`:

### A. Exporting API Products
```bash
# Export a single product
aft my-product --organization my-apigee-org -f product -o my-product.yaml

# Export all products in an organization to a directory
aft --organization my-apigee-org -f product -o ./products/

# Export all products into a single multi-item YAML file
aft --organization my-apigee-org -f product -o products.yaml
```

### B. Exporting Developers, Apps & Credentials (Users)
```bash
# Export a single developer user (by email or username)
aft dev@example.com --organization my-apigee-org -f user -o dev.yaml

# Export all developers, apps, and credentials to a directory
aft --organization my-apigee-org -f user -o ./users/

# Export all developers, apps, and credentials to a single YAML file
aft --organization my-apigee-org -f user -o users.yaml
```

### C. Exporting API Proxies
```bash
# Export a single proxy
aft my-proxy --organization my-apigee-org -o my-proxy.yaml

# Export all proxies in an organization to a directory
aft --organization my-apigee-org -o ./proxies/
```

---

## 13. Full-Stack Template Deployment (Proxy + Features + Products + Users)

Apigee templates can compose proxies from features while bundling referenced **Products** and **Users** (Developers & Developer Apps). When deploying a template to Apigee, `aft` creates and deploys the entire ecosystem in a single command:

1. Assembles and deploys the API Proxy (and referenced Features).
2. Deploys all referenced API Products (resolving relative paths, substituting parameters, and associating proxies/environments).
3. Deploys all referenced Users (developers and developer apps with credential keys and product associations).
4. Prints visual Overview Cards for each deployed asset.

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/apigee/apigee-templater/main/schema/gateway.schema.1.0.json
gateway: apigee
schemaVersion: 1.0.0
name: template-enterprise-gateway
type: template
description: Enterprise gateway proxy bundle with features, products, and developer onboarding
features:
  - feature-01-api-key-auth.yaml
  - feature-02-rate-limiting.yaml
endpoints:
  - name: default
    basePath: /v1/enterprise
targets:
  - name: default
    url: https://internal.enterprise.com
products:
  - product-03-enterprise-suite.yaml
users:
  - user-02-partner.yaml
```

Deploy everything in one command:
```bash
aft template-enterprise-gateway.yaml --organization my-apigee-org --environment dev
```

---

## 13. Resource Deletion (`--delete`)

To clean up resources created from a template, product, user, or proxy, provide `--delete` along with the target `--organization` (or colon-separated output):

```bash
# Delete template resources (deletes Users first -> Products second -> Proxy third)
aft template-enterprise-gateway.yaml --delete --organization my-apigee-org

# Delete standalone product
aft product-01-standard-api.yaml --delete --organization my-apigee-org

# Delete standalone user (developer and apps)
aft user-01-developer.yaml --delete --organization my-apigee-org

# Delete proxy (undeploys from all environments first, then deletes proxy)
aft my-proxy-name --delete --organization my-apigee-org
```

---

## 14. Organization Configuration Inspection (`-c` / `--config`)

Use `--config` (or `-c`) to inspect organization topology, runtime settings, and environments:

- **Default**: Renders a formatted overview card showing organization name, project, analytics region, billing type, evaluation expiration date, environments list, and environment groups with attached hostnames.
- **`-f json` / `-f yaml`**: Emits raw JSON or YAML.

```bash
# Visual formatted card
aft -c my-apigee-org

# Raw JSON or YAML
aft -c my-apigee-org -f json
aft -c my-apigee-org -f yaml
```

---

## 15. Checklist & Best Practices
- [ ] Check if `setValue` is used instead of `value` for all KVM `put` operations.
- [ ] Ensure `response.content` assignments occur in `mode: Response` flows (`PostFlow` or target response flows).
- [ ] Attach `EventFlow` on target responses when processing streaming / SSE data.
- [ ] Include required `resources` if JavaScript policies use `includeUrl` (e.g. `jsc://ai-functions.js`).
- [ ] Use `-f sharedflow` or `-f sf` when exporting Features as Apigee SharedFlow bundles or deploying SharedFlows to Apigee X.
- [ ] When fetching from repositories, reference names directly without needing full URLs or file extensions (e.g. `aft auth-oauth21-server --organization my-org`).
- [ ] Use direct flat list items for `operations`, `llmOperations`, and `payloadOperations` in Product YAML files for cleaner structure.
- [ ] When deploying a template to an Apigee organization/environment, referenced `products` and `users` are deployed automatically alongside the proxy.
- [ ] Use `--delete` to tear down resources in reverse dependency order (User -> Product -> Proxy).
- [ ] Use `aft -c <org>` for a formatted overview of the Apigee organization and its environments/hostnames.


