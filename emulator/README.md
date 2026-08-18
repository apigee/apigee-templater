# Apigee Local Emulator Guide

This directory contains setup scripts, test data configurations, and tracing tools for developing and testing Apigee proxies locally using the **Apigee Local Emulator Docker Container**.

---

## Prerequisites

- **Docker** installed and running
- **AFT (Apigee Templater)** CLI tool installed
- **cURL** & **jq**
- **Python 3** with `pyyaml` (`pip install pyyaml`)

---

## 1. Creating and Starting the Apigee Emulator Container

The Apigee Emulator runs as a local Docker container exposing management endpoints and proxy routes.

### Create the Container
To create the Docker container instance, run:

```bash
./emulator/create.sh
```

Or run the Docker command directly:

```bash
docker create --name apigee \
  -p 8080:8080 \
  -p 8998:8998 \
  gcr.io/apigee-release/hybrid/apigee-emulator:2.0.1
```

### Start / Stop the Container

```bash
# Start the container
docker start apigee

# Stop the container
docker stop apigee
```

### Port Mapping
- **Port `8080`**: Apigee Management API & Local Proxy Router (all proxy API traffic is routed through here).
- **Port `8998`**: Internal Debug & CLI port.

---

## 2. Deploying Proxies and Test Data (`deploy.sh`)

The `emulator/deploy.sh` script compiles AFT feature YAML files into proxy bundles, generates environment configs, packages local test data, and deploys everything into the running emulator.

### Configure Feature YAML Paths
In `emulator/deploy.sh`, configure the feature YAMLs you wish to deploy in the `FEATURE_FILES` array:

```bash
FEATURE_FILES=(
  "templates/features/ai-chat-completions.yaml"
)
```

### Run Deployment

```bash
./emulator/deploy.sh
```

### What `deploy.sh` Does
1. **Compiles Proxies**: Uses `aft` to build proxy bundles for each entry in `FEATURE_FILES` and extracts them into `emulator/dist/bundle/`.
2. **Generates Environment Configuration**: Creates minimal `env.json` and `deployments.json` for environment `test`.
3. **Deploys Proxy Bundle**: Packages `bundle.zip` and posts it to `http://localhost:8080/v1/emulator/deploy?environment=test`.
4. **Deploys Test Data**: Zips the local test data files ([`datacollectors.json`](file:///home/tyayers/projects/dbg/emulator/datacollectors.json), [`developerapps.json`](file:///home/tyayers/projects/dbg/emulator/developerapps.json), [`developers.json`](file:///home/tyayers/projects/dbg/emulator/developers.json), [`maps.json`](file:///home/tyayers/projects/dbg/emulator/maps.json), [`products.json`](file:///home/tyayers/projects/dbg/emulator/products.json)) into `testdata.zip` and posts them to `http://localhost:8080/v1/emulator/setup/tests`.

---

## 3. Tracing Proxy Executions and Using `trace.html`

The Apigee Emulator includes a built-in tracing facility. You can record execution traces and view them interactively in `emulator/trace.html`.

### Step 1: Start a Trace Session
Start a trace session for the deployed proxy (`ai-chat-completions-v1`):

```bash
PROXY=ai-chat-completions
SESSION_ID=$(curl -s -X POST "http://localhost:8080/v1/emulator/trace?proxyName=$PROXY" | jq -r '.name')
echo "Active Trace Session ID: $SESSION_ID"
```

### Step 2: Send Request(s)
Send one or more API requests to `http://localhost:8080/v1/chat/completions` (see test commands below).

### Step 3: Fetch Trace Transactions
Export recorded trace transactions to `emulator/trace.json`:

```bash
curl -s -X GET "http://localhost:8080/v1/emulator/trace/transactions?sessionid=$SESSION_ID" > emulator/trace.json
```

### Step 4: Inspect in Visualizer (`trace.html`)
Open [`emulator/trace.html`](file:///home/tyayers/projects/dbg/emulator/trace.html) in any web browser:

- Click **"Open trace.json"** and select `emulator/trace.json` (or drag and drop the file).
- Inspect request details, execution step timelines, policy execution states, OAS validation, KVM lookups, JavaScript variables, and DataCapture metrics.

### Useful Management & Inspection Commands

```bash
# Get deployment tree (installed proxies and status)
curl -s "http://localhost:8080/v1/emulator/tree" | jq .

# Get loaded KVM maps in test environment
curl -s "http://localhost:8080/v1/emulator/test/maps" | jq .

# Reset emulator (clears deployed proxies & test data)
curl -s -X POST "http://localhost:8080/v1/emulator/reset"
```

---

## 4. Local Test Commands: OpenAI `/v1/chat/completions` API

The default test deployment uses the OpenAI Chat Completions proxy (`/v1/chat/completions`).

- **Endpoint**: `http://localhost:8080/v1/chat/completions`
- **Authentication**: `x-api-key: test-api-key-12345` (configured in `developerapps.json`)
- **Configured Models** (from `products.json`):
  - `gemini-3.6-flash`
  - `claude-sonnet-5`
  - `gemini-3.6-flash-lite`

Below are `curl` test commands covering operations supported by the OpenAI Chat Completions API specification:

### 1. Basic Chat Completion (Non-Streaming)

```bash
curl -i -X POST "http://localhost:8080/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "x-api-key: test-api-key-12345" \
  -d '{
    "model": "gemini-3.6-flash",
    "messages": [
      {
        "role": "user",
        "content": "Explain quantum computing in one concise sentence."
      }
    ]
  }'
```

---

### 2. Streaming Chat Completion (`stream: true`)

```bash
curl -i -N -X POST "http://localhost:8080/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "x-api-key: test-api-key-12345" \
  -d '{
    "model": "gemini-3.6-flash",
    "stream": true,
    "messages": [
      {
        "role": "user",
        "content": "Write a short 4-line poem about space exploration."
      }
    ]
  }'
```

---

### 3. System Prompt & Hyperparameter Sampling (`temperature`, `top_p`, `seed`)

```bash
curl -i -X POST "http://localhost:8080/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "x-api-key: test-api-key-12345" \
  -d '{
    "model": "gemini-3.6-flash",
    "temperature": 0.7,
    "top_p": 0.95,
    "seed": 42,
    "messages": [
      {
        "role": "system",
        "content": "You are a helpful software engineering assistant who answers strictly in bullet points."
      },
      {
        "role": "user",
        "content": "What are 3 benefits of using microservices?"
      }
    ]
  }'
```

---

### 4. Multi-Turn Conversation History

```bash
curl -i -X POST "http://localhost:8080/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "x-api-key: test-api-key-12345" \
  -d '{
    "model": "gemini-3.6-flash",
    "messages": [
      {
        "role": "system",
        "content": "You are a helpful assistant."
      },
      {
        "role": "user",
        "content": "My favorite fruit is mangos."
      },
      {
        "role": "assistant",
        "content": "Mangos are delicious and full of vitamins! How can I help you today?"
      },
      {
        "role": "user",
        "content": "What is my favorite fruit?"
      }
    ]
  }'
```

---

### 5. Alternative Model Test: Claude Sonnet 5

```bash
curl -i -X POST "http://localhost:8080/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "x-api-key: test-api-key-12345" \
  -d '{
    "model": "claude-sonnet-5",
    "messages": [
      {
        "role": "user",
        "content": "Summarize the theory of relativity in 20 words or less."
      }
    ]
  }'
```

---

### 6. Alternative Model Test: Gemini 3.6 Flash Lite

```bash
curl -i -X POST "http://localhost:8080/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "x-api-key: test-api-key-12345" \
  -d '{
    "model": "gemini-3.6-flash-lite",
    "messages": [
      {
        "role": "user",
        "content": "Give me a synonym for fast."
      }
    ]
  }'
```

---

### 7. Structured Output / JSON Mode (`response_format`)

```bash
curl -i -X POST "http://localhost:8080/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "x-api-key: test-api-key-12345" \
  -d '{
    "model": "gemini-3.6-flash",
    "response_format": { "type": "json_object" },
    "messages": [
      {
        "role": "system",
        "content": "You are a helpful assistant designed to output JSON."
      },
      {
        "role": "user",
        "content": "List 3 capitals of European countries in JSON format with keys country and capital."
      }
    ]
  }'
```

---

### 8. Tool / Function Calling (`tools` and `tool_choice`)

```bash
curl -i -X POST "http://localhost:8080/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "x-api-key: test-api-key-12345" \
  -d '{
    "model": "gemini-3.6-flash",
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_current_weather",
          "description": "Get the current weather for a given location",
          "parameters": {
            "type": "object",
            "properties": {
              "location": {
                "type": "string",
                "description": "The city and state, e.g. San Francisco, CA"
              },
              "unit": {
                "type": "string",
                "enum": ["celsius", "fahrenheit"]
              }
            },
            "required": ["location"]
          }
        }
      }
    ],
    "tool_choice": "auto",
    "messages": [
      {
        "role": "user",
        "content": "What is the weather like in Tokyo right now?"
      }
    ]
  }'
```

---

### 9. Submitting Tool Call Output (Function Response)

```bash
curl -i -X POST "http://localhost:8080/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "x-api-key: test-api-key-12345" \
  -d '{
    "model": "gemini-3.6-flash",
    "messages": [
      {
        "role": "user",
        "content": "What is the weather like in Tokyo?"
      },
      {
        "role": "assistant",
        "tool_calls": [
          {
            "id": "call_12345",
            "type": "function",
            "function": {
              "name": "get_current_weather",
              "arguments": "{\"location\": \"Tokyo\"}"
            }
          }
        ]
      },
      {
        "role": "tool",
        "tool_call_id": "call_12345",
        "content": "{\"temperature\": \"18C\", \"condition\": \"Sunny\"}"
      }
    ]
  }'
```

---

### 10. Multimodal Input (Text + Image URL)

```bash
curl -i -X POST "http://localhost:8080/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "x-api-key: test-api-key-12345" \
  -d '{
    "model": "gemini-3.6-flash",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "What is depicted in this image?"
          },
          {
            "type": "image_url",
            "image_url": {
              "url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Gfp-wisconsin-madison-the-nature-boardwalk.jpg/2560px-Gfp-wisconsin-madison-the-nature-boardwalk.jpg"
            }
          }
        ]
      }
    ]
  }'
```

---

### 11. Generation Limits & Penalties (`max_tokens`, `stop`, `presence_penalty`, `frequency_penalty`)

```bash
curl -i -X POST "http://localhost:8080/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "x-api-key: test-api-key-12345" \
  -d '{
    "model": "gemini-3.6-flash",
    "max_tokens": 50,
    "presence_penalty": 0.5,
    "frequency_penalty": 0.5,
    "stop": ["END", "\n\n"],
    "messages": [
      {
        "role": "user",
        "content": "Count from 1 to 20 slowly."
      }
    ]
  }'
```
