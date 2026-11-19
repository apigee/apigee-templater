---
name: aft
description: Comprehensive expert guide for authoring, converting, and optimizing Apigee YAML projects using aft (Apigee Templater). Master workflows for creating standalone proxy YAMLs, converting proxies to modular feature YAMLs, and building composite template YAMLs. Includes deep policy configurations (VerifyAPIKey, Quota, SpikeArrest, AssignMessage, ExtractVariables, KeyValueMapOperations, DataCapture, RaiseFault, BasicAuth, OAuthV2, Cache), custom JavaScript policies with full context/variable manipulation, and ServiceCallout patterns for external service integrations.
---

# AFT (Apigee Templater) Expert Skill Guide

This guide provides end-to-end instructions, architectural patterns, policy schemas, JavaScript recipes, and ServiceCallout integration workflows for developing, converting, and optimizing Apigee YAML projects with `aft`.

---

## 1. Overview & Core Building Blocks

Apigee Templater (`aft`) provides a concise, declarative YAML framework for the full Apigee API lifecycle:

| Type | YAML Type | Purpose & Scope | Common Workflow |
| :--- | :--- | :--- | :--- |
| **Proxy** | `type: proxy` | Self-contained, complete API proxy with endpoints, routes, targets, policies, and resources. | Prototype, build, and test standalone proxies locally or deploy directly to Apigee X. |
| **Feature** | `type: feature` | Modular, reusable slice of policy logic (auth, rate limiting, logging, CORS, transformation). Direct 1:1 mapping with Apigee SharedFlows. | Decompose cross-cutting concerns from proxies into reusable building blocks; export as SharedFlows. |
| **Template** | `type: template` | Composable API proxy blueprint defining endpoints and targets while composing multiple features, API products, and developer credentials. | Assemble production proxies by combining modular features like LEGO bricks. |
| **Product** | `type: product` | Apigee API Product bundling proxies, environments, quotas, and REST/LLM/MCP operations. | Define API governance, entitlements, and developer access. |
| **User** | `type: user` | Apigee Developer with nested Developer Apps, API credentials (consumer keys/secrets), and product associations. | Declarative developer onboarding and credential management. |
| **Deployment** | `type: deployment` | Unified full-stack manifest bundling proxies, templates, KVMs, products, users, data collectors, reports, and tests. | Single-command deployment and teardown across environments. |

---

## 2. Core Workflows: Proxy ➔ Feature ➔ Template

`aft` supports smooth progression across all stages of API development:
```
┌─────────────────────────────────┐
│     Step 1: Proxy YAML          │  Rapid prototyping & standalone implementation
│       (type: proxy)             │  Contains endpoints, flows, targets, policies
└──────────────┬──────────────────┘
               │  aft -i proxy.yaml -f feature -o feature.yaml
               ▼
┌─────────────────────────────────┐
│     Step 2: Feature YAML        │  Modularize reusable policies & logic
│      (type: feature)            │  Direct 1:1 parity with Apigee SharedFlows
└──────────────┬──────────────────┘
               │  aft -i proxy.yaml -f template -o template.yaml (or compose features)
               ▼
┌─────────────────────────────────┐
│     Step 3: Template YAML       │  Compose features into production proxies
│      (type: template)           │  Bundles Products + Users + Tests
└──────────────┬──────────────────┘
               │  aft -i template.yaml -f proxy -o compiled-proxy.yaml
               ▼
┌─────────────────────────────────┐
│  Compiled Proxy / Deployment    │  Local testing (Emulator) or deploy to Apigee X
│   (type: proxy / deployment)    │
└─────────────────────────────────┘
```

---

### Workflow 1: Authoring Standalone Proxy YAMLs (`type: proxy`)

Start with a standalone proxy YAML when building a new API from scratch or prototyping. A proxy YAML contains both client-facing endpoints and backend target connections.

#### A. Target Proxy Pattern (Forwarding to Backend)

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/apigee/apigee-templater/main/schema/gateway.schema.1.0.json
gateway: apigee
schemaVersion: 1.0.0
name: customer-service-v1
displayName: Customer Service API v1
type: proxy
description: Production customer service proxy with API key validation, rate limiting, and response masking
priority: 1
categories:
  - customers
  - core-services
parameters:
  - name: BACKEND_URL
    displayName: Backend URL
    description: Target host URL for customer service
    default: https://mocktarget.apigee.net
endpoints:
  - name: default
    basePath: /v1/customers
    routes:
      - name: default
        target: default
    flows:
      - name: PreFlow
        mode: Request
        steps:
          - name: Verify-API-Key
          - name: SA-SpikeArrest
      - name: GetCustomerProfile
        mode: Request
        condition: (proxy.pathsuffix MatchesPath "/{id}") and (request.verb = "GET")
        steps:
          - name: JS-EnrichRequest
      - name: PostFlow
        mode: Response
        steps:
          - name: JS-MaskSensitiveData
    postClientFlow:
      name: PostClientFlow
      steps:
        - name: DC-Analytics
    faultRules:
      - name: InvalidApiKeyFault
        condition: fault.name = "InvalidApiKey"
        steps:
          - name: AM-UnauthorizedFault
targets:
  - name: default
    url: "{BACKEND_URL}"
    flows:
      - name: PreFlow
        mode: Request
        steps: []
      - name: PostFlow
        mode: Response
        steps: []
policies:
  - name: Verify-API-Key
    type: VerifyAPIKey
    content:
      verifyAPIKey:
        metadata:
          name: Verify-API-Key
        apiKey:
          ref: request.header.x-api-key
  - name: SA-SpikeArrest
    type: SpikeArrest
    content:
      spikeArrest:
        metadata:
          name: SA-SpikeArrest
        rate: 100pm
  - name: JS-EnrichRequest
    type: Javascript
    content:
      javascript:
        metadata:
          name: JS-EnrichRequest
        source: |
          context.setVariable("request.header.x-client-timestamp", Date.now().toString());
  - name: JS-MaskSensitiveData
    type: Javascript
    content:
      javascript:
        metadata:
          name: JS-MaskSensitiveData
        source: |
          try {
            var data = JSON.parse(response.content);
            if (data.ssn) data.ssn = "***-**-" + data.ssn.slice(-4);
            response.content = JSON.stringify(data);
          } catch(e) {}
  - name: DC-Analytics
    type: DataCapture
    content:
      dataCapture:
        metadata:
          name: DC-Analytics
        capture:
          - collect:
              metadata:
                ref: client.ip
                default: 0.0.0.0
              dataCollector: dc_client_ip
  - name: AM-UnauthorizedFault
    type: AssignMessage
    content:
      assignMessage:
        metadata:
          name: AM-UnauthorizedFault
        set:
          statusCode: 401
          reasonPhrase: Unauthorized
          payload:
            metadata:
              contentType: application/json
            value: '{"error": "Unauthorized", "message": "Invalid or missing API key"}'
```

#### B. No-Target Proxy Pattern (Edge / Mock / Router)

Use when proxy logic executes entirely within Apigee without forwarding to an external backend (e.g., mock services, authorization endpoints, orchestrators).

> [!IMPORTANT]
> **Response Modification Rule:** In Apigee, `response.content` can **ONLY** be assigned or modified in **Response** flows (e.g. `PostFlow` in `mode: Response` or target response flows). Writing `response.content` during `Request` mode is ignored or throws errors.

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/apigee/apigee-templater/main/schema/gateway.schema.1.0.json
gateway: apigee
schemaVersion: 1.0.0
name: mock-order-service-v1
type: proxy
description: Edge mock service returning simulated orders without target backend
endpoints:
  - name: default
    basePath: /v1/mock-orders
    flows:
      - name: PreFlow
        mode: Request
        steps:
          - name: JS-ExtractOrderParams
      - name: PostFlow
        mode: Response
        steps:
          - name: JS-BuildMockResponse
policies:
  - name: JS-ExtractOrderParams
    type: Javascript
    content:
      javascript:
        metadata:
          name: JS-ExtractOrderParams
        source: |
          var orderId = context.getVariable("request.queryparam.orderId") || "ORD-001";
          context.setVariable("flow.orderId", orderId);
  - name: JS-BuildMockResponse
    type: Javascript
    content:
      javascript:
        metadata:
          name: JS-BuildMockResponse
        source: |
          var mockResponse = {
            orderId: context.getVariable("flow.orderId"),
            status: "CONFIRMED",
            amount: 99.50,
            currency: "USD",
            created: new Date().toISOString()
          };
          response.content = JSON.stringify(mockResponse);
          context.setVariable("response.header.Content-Type", "application/json");
```

---

### Workflow 2: Converting Proxy YAMLs to Feature YAMLs (`type: feature`)

As projects mature, extract reusable policies (authentication, spike arrest, CORS, logging, ServiceCallouts) into modular **Feature YAMLs**.

#### A. Conversion Command
```bash
# Convert an existing proxy YAML to a feature YAML
aft -i customer-service-v1.yaml -f feature -o feature-customer-core.yaml
```

#### B. What Conversion Does
1. Retains all `flows`, `steps`, `conditions`, `policies`, and `resources`.
2. Decouples target URLs and endpoint basePaths into a reusable component.
3. Sets `type: feature`.

#### C. Modular Feature Example (Extracting API Key Security)
```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/apigee/apigee-templater/main/schema/gateway.schema.1.0.json
gateway: apigee
schemaVersion: 1.0.0
name: feature-api-key-auth
displayName: API Key Authentication Feature
type: feature
description: Modular security feature verifying API keys from custom header or query param
priority: 10
categories:
  - security
  - authentication
parameters:
  - name: API_KEY_HEADER
    displayName: API Key Header Name
    description: Request header containing client API key
    default: x-api-key
defaultEndpoint:
  name: default
  flows:
    - name: PreFlow
      mode: Request
      steps:
        - name: Verify-API-Key
policies:
  - name: Verify-API-Key
    type: VerifyAPIKey
    content:
      verifyAPIKey:
        metadata:
          name: Verify-API-Key
        apiKey:
          ref: request.header.{API_KEY_HEADER}
```

#### D. Direct SharedFlow Integration
Features have 1:1 parity with Apigee **SharedFlows**:
- **Export Feature to SharedFlow ZIP Bundle:**
  ```bash
  aft -i feature-api-key-auth.yaml -f sharedflow -o api-key-auth-sf.zip
  ```
- **Export Feature to SharedFlow Directory:**
  ```bash
  aft -i feature-api-key-auth.yaml -f sharedflow -o ./api-key-auth-bundle.dir
  ```
- **Deploy Feature directly as SharedFlow to Apigee X:**
  ```bash
  aft -i feature-api-key-auth.yaml -f sharedflow -o my-org:api-key-auth-sf:eval
  ```
- **Import SharedFlow from Apigee X into Feature YAML:**
  ```bash
  aft -i my-org:api-key-auth-sf -f sharedflow -o feature-api-key-auth.yaml
  ```

---

### Workflow 3: Building Template YAMLs (`type: template`) from Feature YAMLs

Templates assemble multiple features into a coherent proxy definition. They define the endpoint base paths, target URLs, and list the composed feature files.

#### A. Converting Proxy Directly to Template
```bash
aft -i customer-service-v1.yaml -f template -o customer-service-template.yaml
```

#### B. Template Structure Composing Modular Features
```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/apigee/apigee-templater/main/schema/gateway.schema.1.0.json
gateway: apigee
schemaVersion: 1.0.0
name: template-enterprise-customer-api
displayName: Enterprise Customer API Template
type: template
description: Assembled proxy composing security, rate limiting, and telemetry features
features:
  - feature-api-key-auth.yaml
  - feature-rate-limiting.yaml
  - feature-cors-security.yaml
parameters:
  - name: API_KEY_HEADER
    default: x-api-key
  - name: RATE
    default: 200pm
endpoints:
  - name: default
    basePath: /v1/enterprise/customers
    routes:
      - name: default
        target: default
targets:
  - name: default
    url: https://customers-backend.internal.net
products:
  - product-customer-standard.yaml
users:
  - user-dev-partner.yaml
tests:
  - name: Health Check
    path: /v1/enterprise/customers/health
    method: GET
    assertions:
      - response.status == 200
```

#### C. CLI Chaining & Assembly Commands
Assemble templates or proxies dynamically using `-a` / `--applyFeature`:

```bash
# Build template from features with parameters:
aft convert -n MySecuredProxy -b /v1/api -u https://backend.com \
  -a feature-api-key-auth.yaml,feature-cors-security.yaml \
  -f template -o my-secured-template.yaml

# Compile template into a standalone Proxy YAML:
aft -i my-secured-template.yaml -f proxy -o compiled-proxy.yaml

# Compile template directly into an Apigee Proxy ZIP bundle:
aft -i my-secured-template.yaml -o compiled-proxy.zip

# Add feature to existing proxy or template:
aft -i my-proxy.yaml -a feature-rate-limiting.yaml -o updated-proxy.yaml

# Remove feature from existing proxy or template:
aft -i updated-proxy.yaml -r feature-rate-limiting -o cleaned-proxy.yaml
```

---

## 3. Specialized Policy Configuration Reference

Apigee policies in `aft` are declared inside the `policies:` list. The `content:` object wraps the policy XML mapping. Below are the definitive configurations for all key policies:

### 3.1 VerifyAPIKey
Validates API keys against registered developer apps.

```yaml
policies:
  - name: Verify-API-Key
    type: VerifyAPIKey
    content:
      verifyAPIKey:
        metadata:
          name: Verify-API-Key
          continueOnError: "false"
          enabled: "true"
        apiKey:
          ref: request.header.x-api-key
          # Or query param: request.queryparam.apikey
```
**Context Variables Populated on Success:**
- `verifyapikey.Verify-API-Key.client_id`
- `verifyapikey.Verify-API-Key.developer.email`
- `verifyapikey.Verify-API-Key.developer.app.name`
- `verifyapikey.Verify-API-Key.apiproduct.name`

---

### 3.2 SpikeArrest
Protects backends against sudden traffic spikes and DoS attacks.

```yaml
policies:
  - name: SA-SpikeArrest
    type: SpikeArrest
    content:
      spikeArrest:
        metadata:
          name: SA-SpikeArrest
        rate: 100pm # or 20ps (per second)
        useEffectiveParam: "true"
        identifier:
          ref: client.ip # or verifyapikey.Verify-API-Key.client_id
```

---

### 3.3 Quota
Enforces business rate limits (hourly, daily, monthly) per developer, product, or app.

```yaml
policies:
  - name: Quota-TierLimit
    type: Quota
    content:
      quota:
        metadata:
          name: Quota-TierLimit
          type: calendar # or rolling
        allow:
          metadata:
            count: 1000
            countRef: verifyapikey.Verify-API-Key.apiproduct.developer.quota.limit
        interval:
          metadata:
            ref: verifyapikey.Verify-API-Key.apiproduct.developer.quota.interval
          value: "1"
        timeUnit:
          metadata:
            ref: verifyapikey.Verify-API-Key.apiproduct.developer.quota.timeunit
          value: month
        identifier:
          ref: verifyapikey.Verify-API-Key.client_id
        distributed: "true"
        synchronous: "true"
```

---

### 3.4 AssignMessage
Sets, modifies, copies, or removes headers, query parameters, payloads, and status codes.

```yaml
policies:
  - name: AM-EnrichRequest
    type: AssignMessage
    content:
      assignMessage:
        metadata:
          name: AM-EnrichRequest
        set:
          headers:
            - header:
                metadata:
                  name: x-gateway-source
                value: Apigee-X
            - header:
                metadata:
                  name: x-correlation-id
                value: "{messageid}"
          queryParams:
            - queryParam:
                metadata:
                  name: env
                value: prod
          payload:
            metadata:
              contentType: application/json
            value: '{"clientId": "{verifyapikey.Verify-API-Key.client_id}"}'
        remove:
          headers:
            - header:
                metadata:
                  name: x-api-key
        assignTo:
          metadata:
            createNew: "false"
            transport: http
            type: request
```

---

### 3.5 ExtractVariables
Extracts parameters, headers, or JSON/XML payloads into flow variables.

```yaml
policies:
  - name: EV-ExtractJsonFields
    type: ExtractVariables
    content:
      extractVariables:
        metadata:
          name: EV-ExtractJsonFields
        source: request
        jsonPayload:
          variable:
            - metadata:
                name: extracted_user_id
              jsonPath: $.user.id
            - metadata:
                name: extracted_role
              jsonPath: $.user.role
        header:
          - metadata:
              name: auth_bearer
            pattern: "Bearer {token}"
```

---

### 3.6 Key-Value Map Operations (KVM) — CRITICAL QUIRK

> [!CAUTION]
> **KVM `setValue` Quirk:** When writing (`put`) KVM entries in `aft` YAML, you **MUST** use `setValue` instead of `value`. In the templater schema parser, `value` is reserved for literal text nodes (`_text`), whereas `setValue` correctly outputs the required `<Value>` tag for `put` operations.

#### A. KVM PUT Operation
```yaml
policies:
  - name: KVM-SaveSession
    type: KeyValueMapOperations
    content:
      keyValueMapOperations:
        metadata:
          name: KVM-SaveSession
          mapIdentifier: UserSessions
        put:
          setValue:
            - ref: flow.session_token
          key:
            parameter:
              ref: verifyapikey.Verify-API-Key.client_id
```

#### B. KVM GET Operation
```yaml
policies:
  - name: KVM-GetApiSecret
    type: KeyValueMapOperations
    content:
      keyValueMapOperations:
        metadata:
          name: KVM-GetApiSecret
          mapIdentifier: BackendSecrets
        get:
          assignTo: private.backend_api_key
          key:
            parameter:
              value: StripeApiKey
```

#### C. KVM DELETE Operation
```yaml
policies:
  - name: KVM-DeleteSession
    type: KeyValueMapOperations
    content:
      keyValueMapOperations:
        metadata:
          name: KVM-DeleteSession
          mapIdentifier: UserSessions
        delete:
          key:
            parameter:
              ref: verifyapikey.Verify-API-Key.client_id
```

---

### 3.7 DataCapture
Sends runtime variables to GCP Apigee Data Collectors for analytics and dashboards.

```yaml
policies:
  - name: DC-Telemetry
    type: DataCapture
    content:
      dataCapture:
        metadata:
          name: DC-Telemetry
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
                ref: ai.totalTokenCount
                default: "0"
              dataCollector: dc_ai_total_tokens
```

---

### 3.8 RaiseFault
Halts proxy execution and returns a customized error response.

```yaml
policies:
  - name: RF-ForbiddenRole
    type: RaiseFault
    content:
      raiseFault:
        metadata:
          name: RF-ForbiddenRole
        faultResponse:
          set:
            statusCode: 403
            reasonPhrase: Forbidden
            headers:
              - header:
                  metadata:
                    name: Content-Type
                  value: application/json
            payload:
              metadata:
                contentType: application/json
              value: '{"error": "Forbidden", "message": "Insufficient permissions for requested resource"}'
```

---

### 3.9 BasicAuthentication
Encodes or decodes HTTP Basic Authentication headers.

```yaml
# Decode Basic Auth
policies:
  - name: BA-DecodeCredentials
    type: BasicAuthentication
    content:
      basicAuthentication:
        metadata:
          name: BA-DecodeCredentials
        operation: Decode
        user:
          ref: flow.username
        password:
          ref: flow.password
        source: request.header.authorization
```

---

### 3.10 Caching Policies (LookupCache, PopulateCache, InvalidateCache)
High-performance in-memory caching in Apigee message processors.

```yaml
# 1. Lookup from Cache
policies:
  - name: LC-GetCachedProfile
    type: LookupCache
    content:
      lookupCache:
        metadata:
          name: LC-GetCachedProfile
        cacheKey:
          keyFragment:
            - ref: verifyapikey.Verify-API-Key.client_id
            - value: profile
        assignTo: flow.cached_profile

# 2. Populate Cache
  - name: PC-SaveCachedProfile
    type: PopulateCache
    content:
      populateCache:
        metadata:
          name: PC-SaveCachedProfile
        cacheKey:
          keyFragment:
            - ref: verifyapikey.Verify-API-Key.client_id
            - value: profile
        source: response.content
        expirySettings:
          timeoutInSec: "300"

# 3. Invalidate Cache
  - name: IC-EvictCache
    type: InvalidateCache
    content:
      invalidateCache:
        metadata:
          name: IC-EvictCache
        cacheKey:
          keyFragment:
            - ref: verifyapikey.Verify-API-Key.client_id
            - value: profile
```

---

### 3.11 Model Armor Policy (`ModelArmor`) — Requires Service Account
Inspects and sanitizes generative AI prompts and LLM responses using Google Cloud Model Armor guardrails.

> [!IMPORTANT]
> **Service Account Prerequisite:** Apigee proxies utilizing `ModelArmor` policies **MUST** be deployed to Apigee X environments with an attached Google Service Account possessing `modelarmor.user` permissions.

```yaml
policies:
  - name: MA-PromptGuardrails
    type: ModelArmor
    content:
      modelArmor:
        metadata:
          name: MA-PromptGuardrails
        template: projects/{PROJECT_ID}/locations/us-central1/templates/enterprise-guardrails
        source: request
        filterConfig:
          piiAndEntityFilter:
            enabled: "true"
          promptShieldFilter:
            enabled: "true"
```

---

## 4. Writing JavaScript Policies for Custom Logic

JavaScript policies allow arbitrary data manipulation, token extraction, signing, and response transformation.

### 4.1 Inline vs. External Resource Scripts

#### Inline Source (`source: |`)
Best for concise logic (under 50 lines):
```yaml
policies:
  - name: JS-InlineLogic
    type: Javascript
    content:
      javascript:
        metadata:
          name: JS-InlineLogic
          timeLimit: "200"
        source: |
          var clientIp = context.getVariable("client.ip");
          context.setVariable("flow.is_internal", clientIp.startsWith("10.") ? "true" : "false");
```

#### External Resource Script (`resourceURL: jsc://...`)
Best for complex scripts, shared modules, or libraries:
```yaml
policies:
  - name: JS-ProcessOrder
    type: Javascript
    content:
      javascript:
        metadata:
          name: JS-ProcessOrder
          timeLimit: "200"
        resourceURL: jsc://order-processor.js
resources:
  - name: order-processor.js
    type: jsc
    content: |
      function processOrder() {
        var raw = context.getVariable("response.content");
        if (!raw) return;
        var order = JSON.parse(raw);
        order.processedAt = new Date().toISOString();
        response.content = JSON.stringify(order);
      }
      processOrder();
```

---

### 4.2 Apigee JavaScript Context Object Model

Apigee injects global objects into the JavaScript runtime:

| Object / Method | Purpose | Example |
| :--- | :--- | :--- |
| `context.getVariable(name)` | Reads any flow, system, or policy variable. Returns `string`, `null`, or object. | `var key = context.getVariable("request.header.x-api-key");` |
| `context.setVariable(name, value)` | Sets a flow variable for subsequent policies/conditions. | `context.setVariable("flow.auth_status", "VALID");` |
| `request.content` | String representation of incoming request payload. Read/write in **Request** flows. | `var body = JSON.parse(request.content);` |
| `response.content` | String representation of response payload. Read/write **ONLY** in **Response** flows. | `response.content = JSON.stringify(transformed);` |
| `request.headers` / `response.headers` | Access or mutate HTTP headers directly. | `context.setVariable("response.header.x-served-by", "Apigee");` |

---

### 4.3 Essential JavaScript Rules & Quirks

1. **Response Flow Restriction:**
   `response.content` and `response.status.code` **CAN ONLY** be modified in **Response** flows (target response flow or proxy `PostFlow` in `mode: Response`). Modifying `response.content` during `Request` mode throws errors or has no effect.

2. **Always Wrap JSON Parsing in `try / catch`:**
   Client or upstream responses may be empty, HTML error pages, or malformed JSON:
   ```javascript
   try {
     var data = JSON.parse(response.content);
     // logic
   } catch(err) {
     context.setVariable("flow.json_parse_error", err.message);
   }
   ```

3. **Execution Timeouts:**
   Set `timeLimit: "200"` in policy metadata (milliseconds). Scripts must be non-blocking and fast.

4. **Scope Safety:**
   Avoid undeclared global variables. Always use `var` (or `let`/`const` in modern Apigee X) inside function scope to prevent state leakage between concurrent requests.

---

### 4.4 High-Value JavaScript Recipes

#### Recipe 1: PII Data Masking / Redaction (Response Flow)
```javascript
try {
  var data = JSON.parse(response.content);
  function maskSensitive(obj) {
    for (var key in obj) {
      if (typeof obj[key] === "object" && obj[key] !== null) {
        maskSensitive(obj[key]);
      } else if (key.match(/(password|creditCard|secret|ssn)/i)) {
        obj[key] = "********";
      }
    }
  }
  maskSensitive(data);
  response.content = JSON.stringify(data);
} catch(e) {}
```

#### Recipe 2: AI / LLM Token Telemetry Extractor (Gemini & OpenAI)
```javascript
try {
  var body = JSON.parse(response.content);
  // Gemini format
  if (body.usageMetadata) {
    context.setVariable("ai.promptTokenCount", body.usageMetadata.promptTokenCount || 0);
    context.setVariable("ai.responseTokenCount", body.usageMetadata.candidatesTokenCount || 0);
    context.setVariable("ai.totalTokenCount", body.usageMetadata.totalTokenCount || 0);
  }
  // OpenAI format
  else if (body.usage) {
    context.setVariable("ai.promptTokenCount", body.usage.prompt_tokens || 0);
    context.setVariable("ai.responseTokenCount", body.usage.completion_tokens || 0);
    context.setVariable("ai.totalTokenCount", body.usage.total_tokens || 0);
  }
} catch(e) {}
```

#### Recipe 3: Dynamic Upstream Target Routing
```javascript
// Compute target URL dynamically based on tenant or region header
var tenant = context.getVariable("request.header.x-tenant-id") || "default";
var region = context.getVariable("request.header.x-region") || "us-east";

var targetMap = {
  "eu-west": "https://eu.internal.api.com",
  "us-east": "https://us.internal.api.com",
  "apac": "https://apac.internal.api.com"
};

var selectedHost = targetMap[region] || "https://default.internal.api.com";
context.setVariable("target.url", selectedHost + context.getVariable("proxy.pathsuffix"));
```

---

## 5. Service Callouts for External Service Integrations

`ServiceCallout` enables calling external HTTP APIs synchronously during proxy execution (e.g., identity verification, token exchange, fraud checks, tenant lookup).

### 5.1 Architecture: The 3-Step Integration Pattern

Always implement external service integrations using the robust 3-step pattern:
```
┌─────────────────────────────────┐
│ Step 1: AssignMessage           │  Construct request payload, headers, and verb
│   AM-PrepareCalloutRequest      │  Assign to variable: authServiceRequest
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│ Step 2: ServiceCallout          │  Execute HTTP callout to external API
│   SC-CalloutToService           │  Store response in: authServiceResponse
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│ Step 3: Javascript / Extract    │  Inspect status code & parse response content
│   JS-ProcessCalloutResponse     │  Set flow variables or trigger RaiseFault
└─────────────────────────────────┘
```

---

### 5.2 ServiceCallout Policy Structure

```yaml
policies:
  - name: SC-ExternalService
    type: ServiceCallout
    content:
      serviceCallout:
        metadata:
          name: SC-ExternalService
          continueOnError: "false" # Halts flow on network error if false
          enabled: "true"
        request:
          metadata:
            clearPayload: "true"
          variable: myCalloutRequest
          ignoreUnresolvedVariables: "false"
        response: myCalloutResponse
        timeout: "10000" # Milliseconds (10s)
        httpTargetConnection:
          URL: https://identity.internal.company.com/v1/introspect
```

---

### 5.3 Complete Production Recipes

#### Recipe 1: Token Validation / User Profile Service
Validates an incoming bearer token against an external IAM system and injects the user's role and tenant into the proxy flow.

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/apigee/apigee-templater/main/schema/gateway.schema.1.0.json
gateway: apigee
schemaVersion: 1.0.0
name: feature-external-token-validation
displayName: External Token Validation Callout
type: feature
defaultEndpoint:
  name: default
  flows:
    - name: PreFlow
      mode: Request
      steps:
        - name: AM-PrepareTokenValidation
        - name: SC-ValidateTokenWithIdp
        - name: JS-EvaluateIdpResponse
        - name: RF-UnauthorizedToken
          condition: flow.token_valid != "true"
policies:
  # Step 1: Prepare Callout Request
  - name: AM-PrepareTokenValidation
    type: AssignMessage
    content:
      assignMessage:
        metadata:
          name: AM-PrepareTokenValidation
        set:
          verb: POST
          headers:
            - header:
                metadata:
                  name: Content-Type
                value: application/json
            - header:
                metadata:
                  name: Authorization
                value: "Basic {private.idp_client_credentials}"
          payload:
            metadata:
              contentType: application/json
            value: '{"token": "{request.header.authorization}"}'
        assignTo:
          metadata:
            createNew: "true"
            transport: http
            type: request
          value: idpRequest

  # Step 2: Call IDP Service
  - name: SC-ValidateTokenWithIdp
    type: ServiceCallout
    content:
      serviceCallout:
        metadata:
          name: SC-ValidateTokenWithIdp
          continueOnError: "true"
        request:
          variable: idpRequest
        response: idpResponse
        timeout: "5000"
        httpTargetConnection:
          URL: https://idp.internal.company.com/oauth/introspect

  # Step 3: Process IDP Response in JavaScript
  - name: JS-EvaluateIdpResponse
    type: Javascript
    content:
      javascript:
        metadata:
          name: JS-EvaluateIdpResponse
        source: |
          var status = context.getVariable("idpResponse.status.code");
          context.setVariable("flow.token_valid", "false");
          if (status == 200) {
            try {
              var body = JSON.parse(context.getVariable("idpResponse.content"));
              if (body.active === true) {
                context.setVariable("flow.token_valid", "true");
                context.setVariable("flow.user_id", body.sub || "");
                context.setVariable("flow.user_role", body.role || "standard");
                context.setVariable("flow.tenant_id", body.tenant || "global");
              }
            } catch(e) {}
          }

  # Fallback: Raise Fault if Invalid
  - name: RF-UnauthorizedToken
    type: RaiseFault
    content:
      raiseFault:
        metadata:
          name: RF-UnauthorizedToken
        faultResponse:
          set:
            statusCode: 401
            reasonPhrase: Unauthorized
            headers:
              - header:
                  metadata:
                    name: Content-Type
                  value: application/json
            payload:
              metadata:
                contentType: application/json
              value: '{"error": "Unauthorized", "message": "External token validation failed"}'
```

---

#### Recipe 2: Token Exchange / Upstream STS Callout
Fetches a short-lived downstream bearer token from an OAuth STS endpoint before forwarding the client's request to the target.

```yaml
# Step 1: Prepare STS Request
policies:
  - name: AM-PrepareStsExchange
    type: AssignMessage
    content:
      assignMessage:
        metadata:
          name: AM-PrepareStsExchange
        set:
          verb: POST
          headers:
            - header:
                metadata:
                  name: Content-Type
                value: application/x-www-form-urlencoded
          payload:
            metadata:
              contentType: application/x-www-form-urlencoded
            value: "grant_type=client_credentials&client_id={private.sts_client_id}&client_secret={private.sts_client_secret}&scope=backend_read"
        assignTo:
          metadata:
            createNew: "true"
            type: request
          value: stsRequest

# Step 2: Callout to STS
  - name: SC-ExchangeStsToken
    type: ServiceCallout
    content:
      serviceCallout:
        metadata:
          name: SC-ExchangeStsToken
        request:
          variable: stsRequest
        response: stsResponse
        timeout: "3000"
        httpTargetConnection:
          URL: https://sts.internal.company.com/token

# Step 3: Extract & Attach Upstream Token
  - name: JS-AttachUpstreamToken
    type: Javascript
    content:
      javascript:
        metadata:
          name: JS-AttachUpstreamToken
        source: |
          var res = context.getVariable("stsResponse.content");
          try {
            var data = JSON.parse(res);
            if (data.access_token) {
              context.setVariable("request.header.Authorization", "Bearer " + data.access_token);
            }
          } catch(e) {}
```

---

#### Recipe 3: Google Cloud Run / Functions with IAM Authentication
Invokes a Google Cloud microservice secured by Google IAM using Google ID Token authentication.

```yaml
policies:
  - name: SC-CallCloudRun
    type: ServiceCallout
    content:
      serviceCallout:
        metadata:
          name: SC-CallCloudRun
          continueOnError: "false"
        request:
          metadata:
            clearPayload: "false"
          variable: request
        response: cloudRunResponse
        timeout: "15000"
        httpTargetConnection:
          URL: https://my-service-xyz.a.run.app/process
          authentication:
            googleIdToken:
              audience: https://my-service-xyz.a.run.app
```

---

### 5.4 Google Authentication (`GoogleAccessToken` & `GoogleIDToken`)

Apigee allows authenticating upstream targets and Service Callouts using Google OAuth2 access tokens or OpenID Connect (OIDC) ID tokens:

#### A. In TargetEndpoints
```yaml
# 1. Shorthand with scopes (Access Token)
targets:
  - name: vertex-ai-target
    url: https://us-central1-aiplatform.googleapis.com
    scopes:
      - https://www.googleapis.com/auth/cloud-platform

# 2. Shorthand with audience (ID Token for Cloud Run / Functions)
targets:
  - name: cloud-run-target
    url: https://orders-service-xyz.a.run.app
    aud: https://orders-service-xyz.a.run.app

# 3. Explicit HTTPTargetConnection
targets:
  - name: backend-target
    httpTargetConnection:
      URL: https://api.googleapis.com
      authentication:
        googleAccessToken:
          scopes:
            - https://www.googleapis.com/auth/cloud-platform
```

#### B. In ServiceCallout Policies
```yaml
policies:
  - name: SC-CallIdentityService
    type: ServiceCallout
    content:
      serviceCallout:
        request:
          variable: myRequest
        response: myResponse
        httpTargetConnection:
          URL: https://my-cloudrun-service.a.run.app/verify
          authentication:
            googleIdToken:
              audience: https://my-cloudrun-service.a.run.app
```

> [!WARNING]
> Whenever any TargetEndpoint or ServiceCallout specifies `googleAccessToken`, `scopes`, `googleIdToken`, or `aud`, deploying the proxy to an Apigee X environment **strictly requires a Google Service Account**.

---

## 6. API Products & Developer Credential Modeling

Apigee Templater natively manages **Products** (`type: product`) and **Users** (`type: user`).

### 6.1 Flat Operations Array (REST, LLM, MCP)

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/apigee/apigee-templater/main/schema/gateway.schema.1.0.json
gateway: apigee
schemaVersion: 1.0.0
name: ai-enterprise-product
displayName: AI Enterprise Product
type: product
description: Unified product granting access to GenAI completions and MCP tooling
access: public
approvalType: auto
environments:
  - dev
  - prod
proxies:
  - AI-Gateway-v1
quota: "100000"
quotaInterval: "1"
quotaTimeUnit: month

# Standard REST operations
operations:
  - name: /v1/models
    apiSource: AI-Gateway-v1
    methods: [GET]

# GenAI LLM Operations
llmOperations:
  - name: /v1/chat/completions
    apiSource: AI-Gateway-v1
    model: gemini-2.5-pro
    methods: [POST]
    quota:
      limit: "1000"
      interval: "1"
      timeUnit: minute

# MCP Tool Payload Operations
payloadOperations:
  - name: tools/call
    apiSource: AI-Gateway-v1
    protocol: MCP
    attributes:
      - name: tool
        value: lookup_database
    quota:
      limit: "120"
      interval: "1"
      timeUnit: minute
```

---

### 6.2 Declarative User & Apps (`type: user`)

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/apigee/apigee-templater/main/schema/gateway.schema.1.0.json
name: dev-alice
type: user
gateway: 1.0.0
schemaVersion: 1.0.0
displayName: Alice Developer
email: alice@example.com
firstName: Alice
lastName: Smith
userName: asmith
status: active
apps:
  - name: alice-ai-assistant
    displayName: Alice AI Assistant
    status: approved
    products:
      - ai-enterprise-product
    credentials:
      - consumerKey: alice-client-key-12345
        consumerSecret: alice-client-secret-67890
        status: approved
        products:
          - ai-enterprise-product
```

---

## 7. Full-Stack Declarative Deployments (`type: deployment`)

Combine everything into a unified production manifest:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/apigee/apigee-templater/main/schema/gateway.schema.1.0.json
gateway: apigee
schemaVersion: 1.0.0
name: complete-banking-ecosystem
type: deployment
description: Production-grade deployment bundling templates, proxies, KVMs, products, and users.
environments:
  - dev
  - prod

templates:
  - template-enterprise-customer-api.yaml

proxies:
  - name: MockAccountService-v1
    type: proxy
    endpoints:
      - name: default
        basePath: /v1/accounts
    targets:
      - name: default
        url: https://mocktarget.apigee.net

kvms:
  - name: GlobalEnvConfig
    type: environment
    values:
      AUTH_ISSUER: https://idp.company.com
      TIMEOUT: "5000"

products:
  - ai-enterprise-product.yaml

users:
  - dev-alice.yaml

tests:
  - name: Customer Health Check
    path: /v1/enterprise/customers/health
    method: GET
    assertions:
      - response.status == 200
```

### CLI Deployment & Lifecycle Commands
```bash
# 1. Deploy entire ecosystem to GCP Apigee X:
aft complete-banking-ecosystem.yaml --project my-gcp-project --environment dev

# 2. Consolidate a multi-file linked deployment into a single standalone deployment YAML:
aft complete-banking-ecosystem.yaml -f deployment -o consolidated-ecosystem.yaml

# 3. Deploy deployment manifest to Apigee Emulator Service API:
aft complete-banking-ecosystem.yaml -f emulator -o https://apigee-emulator-ghfontasua-ew.a.run.app -e test

# 4. Export ecosystem to local Apigee Emulator bundle directory for offline testing:
aft complete-banking-ecosystem.yaml -f zip -o ./emulator-dist/

# 5. Inspect organization status & environments:
aft describe --project my-gcp-project

# 6. Tear down all deployment resources in clean reverse order:
aft complete-banking-ecosystem.yaml --delete --project my-gcp-project
```

### 7.1 Deployment YAML Consolidation (`-f deployment -o <consolidated.yaml>`)

In modular projects (such as `apigee-antigravity-quickstart`), a deployment manifest frequently links external files across directories:
- `templates:` referencing external template YAMLs (which themselves link external features)
- `products:` referencing API product YAMLs
- `users:` referencing developer credentials YAMLs
- `dataCollectors:` and `reports:`

When you need a single, completely self-contained deployment manifest containing all assets without relative file paths:

```bash
# Consolidate linked files into a single YAML deployment:
aft ./deployments/antigravity-deployment.yaml -f deployment -o ./consolidated-deployment.yaml

# Consolidate with parameter substitutions:
aft ./deployments/antigravity-deployment.yaml -f deployment -o ./consolidated-deployment.yaml -p GoogleCloudProject=my-gcp-project
```

**What consolidation does:**
1. Resolves all relative file paths for templates, proxies, features, products, users, and collectors.
2. Compiles every template into a full `Proxy` object with all of its referenced features and policies merged in.
3. Inlines all `Product` and `User` definitions into `products: [...]` and `users: [...]`.
4. Removes the `templates` and `features` reference arrays, leaving standalone compiled `proxies: [...]`.
5. Outputs a fully self-contained deployment YAML file with standard `$schema` header.

### 7.2 Apigee Emulator Service API Deployment (`-f emulator`)

`aft` can deploy deployment manifests or individual proxy YAMLs directly to an **Apigee Emulator Service** (running on Cloud Run or locally) via REST API:

```bash
# Deploy deployment manifest to remote Cloud Run Emulator Service:
aft ./deployments/antigravity-deployment.yaml -f emulator -o https://apigee-emulator-ghfontasua-ew.a.run.app

# Deploy to local Emulator Service on port 8083 (or 8082):
aft ./deployments/antigravity-deployment.yaml -f emulator -o http://localhost:8083

# Deploy with specific environment and reset runtime state before applying:
aft ./deployments/antigravity-deployment.yaml -f emulator -o http://localhost:8083 -e test --reset

# Shorthand: setting an HTTP/HTTPS URL as output automatically targets the emulator:
aft ./deployments/antigravity-deployment.yaml -o https://apigee-emulator-ghfontasua-ew.a.run.app
```

**How emulator deployment works:**
1. `aft` resolves and consolidates the deployment into a self-contained payload.
2. Sends the payload to `POST /api/v1/runtime/deploy` on the target emulator base URL.
3. Automatically maps target runtime, environment (`test` by default), and parameter overrides.
4. Outputs an emulator deployment summary card with revision numbers, active proxy basepaths, and latency.

---

## 8. Apigee X Deployments & Google Service Account Management

When deploying an API proxy or SharedFlow revision to an Apigee X environment, Apigee requires an attached **Google Service Account** if the proxy interacts with Google Cloud APIs or protected backends.

### 8.1 When is a Service Account Required?
A Google Service Account is **strictly required** at deployment time if the proxy contains:
1. **Target Authentication with Google Tokens:**
   - Any target endpoint specifying `scopes:` (`GoogleAccessToken`) or `aud:` (`GoogleIDToken`).
   - Any target endpoint specifying `auth: google`, `auth: googleAccessToken`, or `auth: googleIdToken`.
   - Any target endpoint with explicit `<HTTPTargetConnection><Authentication>` blocks.
2. **Service Callout Authentication with Google Tokens:**
   - Any `ServiceCallout` policy with `<Authentication>` containing `googleAccessToken` or `googleIdToken` (e.g. calling Cloud Run, Cloud Functions, or Google APIs).
3. **Model Armor Policies:**
   - Any policy of type `ModelArmor` (or `ModelArmorPromptShield`, `ModelArmorSanitize`) for AI prompt inspection and guardrails.
4. **Integration & Connector Callouts:**
   - `SetIntegrationRequest`, `IntegrationCallout`, or `ConnectorCallout` connecting to Application Integration.

---

### 8.2 Shorthand Service Account Resolution

You do **not** need to type out the lengthy GCP IAM email address. `aft` automatically resolves shorthand service account names against the target GCP organization or project:

```
                  "apigee-runtime"  +  project "my-gcp-org"
                                      │
                                      ▼
             "apigee-runtime@my-gcp-org.iam.gserviceaccount.com"
```

- **Shorthand:** Just pass the name (`--sa apigee-runtime` or `--sa my-proxy-sa`).
- **Full Email:** Passing a fully qualified email (`sa@another-project.iam.gserviceaccount.com`) is also supported and passed through intact.

---

### 8.3 Methods to Specify the Service Account

`aft` supports 3 flexible ways to supply the service account:

#### Method 1: CLI Flags (`--sa` or `--service-account`)
```bash
# Standalone Proxy deployment:
aft my-proxy.yaml --org my-gcp-project --env dev --sa apigee-runtime

# Template deployment:
aft my-template.yaml --org my-gcp-project --env dev --sa apigee-runtime

# Full-Stack Deployment manifest:
aft deployment.yaml --project my-gcp-project --environment dev --sa apigee-runtime
```

#### Method 2: Shorthand Output Target Syntax (`org:proxy:env:sa`)
```bash
# Pass all 4 components in the output positional argument:
aft my-proxy.yaml -o my-gcp-project:my-proxy:dev:apigee-runtime
```

#### Method 3: In the YAML Specification (`serviceAccount:`)
Declare `serviceAccount` directly inside your `proxy.yaml`, `template.yaml`, or `deployment.yaml` file:
```yaml
gateway: apigee
schemaVersion: 1.0.0
name: genai-gateway-v1
type: proxy
serviceAccount: apigee-runtime # Can be shorthand name or full email
endpoints:
  - name: default
    basePath: /v1/ai
targets:
  - name: default
    url: https://my-cloudrun.a.run.app
    aud: https://my-cloudrun.a.run.app
```
When deploying with `aft genai-gateway-v1.yaml --org my-gcp-project --env dev`, `aft` automatically detects `serviceAccount: apigee-runtime`, expands it to `apigee-runtime@my-gcp-project.iam.gserviceaccount.com`, and attaches it during deployment!

---

### 8.4 Automated Detection & Safety Checks

`aft` automatically inspects your proxy, template, or features before deploying to an Apigee X environment:
- **Interactive Terminal:** If a service account is required but not specified, `aft` highlights the specific policies or targets that triggered the requirement and prompts you to enter the service account name.
- **Non-Interactive / CI/CD:** If running headlessly (scripts, Cloud Build, GitHub Actions), `aft` halts immediately with a clear error listing the exact reasons and the required `--sa` flag, preventing failed partial deployments.

---

## 9. AFT CLI Developer Cheatsheet

| Task | Command |
| :--- | :--- |
| **Catalog Discovery (Token-Efficient)** | `aft -l -f json` or `aft -l -f yaml` |
| **Create new Proxy file** | `aft -f proxy -n my-proxy -o my-proxy.yaml` |
| **Create new Feature file** | `aft -f feature -n my-feature -o my-feature.yaml` |
| **Create new Template file** | `aft -f template -n my-template -o my-template.yaml` |
| **Convert Proxy ➔ Feature** | `aft -i proxy.yaml -f feature -o feature.yaml` |
| **Convert Proxy ➔ Template** | `aft -i proxy.yaml -f template -o template.yaml` |
| **Convert Feature ➔ SharedFlow ZIP** | `aft -i feature.yaml -f sharedflow -o sharedflow.zip` |
| **Apply Features to Proxy/Template** | `aft -i proxy.yaml -a feat1.yaml,feat2.yaml -o updated.yaml` |
| **Remove Features** | `aft -i proxy.yaml -r feat1,feat2 -o cleaned.yaml` |
| **Compile Template ➔ Proxy ZIP** | `aft -i template.yaml -o proxy-bundle.zip` |
| **Deploy Proxy to Apigee X** | `aft proxy.yaml -o my-org:my-proxy:eval` |
| **Export Proxy from Apigee X** | `aft my-proxy --organization my-org -o proxy.yaml` |
| **Export Products from Apigee X** | `aft --organization my-org -f product -o ./products/` |
| **Export Users from Apigee X** | `aft --organization my-org -f user -o ./users/` |
| **Reset file contents to clean defaults** | `aft reset proxy.yaml` |
| **Install/Uninstall AFT Agent Skill** | `aft skill install` / `aft skill uninstall` |
| **Clear Local Repository Cache** | `aft cache clear` |

---

## 10. Quality Checklist for Apigee YAML Projects

Before deploying or committing your Apigee YAML projects, verify:
- [ ] **Service Account Prerequisite:** If any target or ServiceCallout uses `GoogleAccessToken`, `GoogleIDToken`, or `ModelArmor`, ensure `--sa <name>` is supplied or `serviceAccount: <name>` is declared in YAML.
- [ ] **KVM `setValue` Rule:** All KVM `put` operations use `setValue:` instead of `value:` to ensure the `<Value>` tag is produced.
- [ ] **Response Flow Rule:** Any assignment to `response.content` in JavaScript policies occurs strictly in `mode: Response` (PostFlow or target response flow).
- [ ] **Exception Handling in JS:** All `JSON.parse()` statements in JavaScript policies are wrapped in `try / catch` blocks.
- [ ] **ServiceCallout 3-Step Pattern:** Requests are prepared with `AssignMessage` before `ServiceCallout`, and responses are evaluated with `Javascript` or `ExtractVariables`.
- [ ] **ServiceCallout Error Handling:** `continueOnError: "true"` is set when a fallback behavior is required, or a conditional `RaiseFault` step is attached to catch failures.
- [ ] **Schema Header Directive:** The YAML file includes `# yaml-language-server: $schema=...` for IDE autocomplete and validation.
- [ ] **Parameters Documented:** Custom parameters in features and templates include `displayName`, `description`, and a realistic `default:`.
- [ ] **SharedFlow Naming:** Exported SharedFlow features omit target endpoints and focus exclusively on flow steps, policies, and resources.
- [ ] **Emulator / Unit Test:** Run `aft my-manifest.yaml -f zip -o ./dist/` to verify bundling without errors before deploying to live cloud organizations.
