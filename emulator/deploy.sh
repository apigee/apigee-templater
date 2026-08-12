#!/bin/bash
set -e

# Feature YAML paths to build and deploy (add or remove feature YAMLs here)
FEATURE_FILES=(
  "repository/features/ai-chat-completions.yaml"
)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

DIST_DIR="$ROOT_DIR/emulator/dist"
BUNDLE_DIR="$DIST_DIR/bundle"
ENV_DIR="$BUNDLE_DIR/src/main/apigee/environments/test"
PROXIES_DIR="$BUNDLE_DIR/src/main/apigee/apiproxies"
APIGEE_ROOT_DIR="$BUNDLE_DIR/src/main/apigee"

# Clean and recreate emulator/dist
rm -rf "$DIST_DIR"
mkdir -p "$PROXIES_DIR"
mkdir -p "$ENV_DIR"

# Build proxy zip bundles using aft and collect proxy names
PROXIES=()

for YAML_FILE in "${FEATURE_FILES[@]}"; do
  if [ ! -f "$YAML_FILE" ]; then
    echo "Error: YAML file not found: $YAML_FILE"
    exit 1
  fi

  PROXY_NAME=$(python3 -c "
import yaml
with open('$YAML_FILE') as f:
    data = yaml.safe_load(f)
print(data.get('name', '') if isinstance(data, dict) else '')
")

  if [ -z "$PROXY_NAME" ]; then
    PROXY_NAME=$(basename "$YAML_FILE" .yaml)
  fi

  echo "Building proxy '$PROXY_NAME' from '$YAML_FILE'..."
  ZIP_PATH="$DIST_DIR/$PROXY_NAME.zip"
  aft -i "$YAML_FILE" -o "$ZIP_PATH"

  TARGET_DIR="$PROXIES_DIR/$PROXY_NAME"
  mkdir -p "$TARGET_DIR"
  unzip -q -o "$ZIP_PATH" -d "$TARGET_DIR"

  PROXIES+=("$PROXY_NAME")
done

PROXIES_JSON=$(python3 -c "import sys, json; print(json.dumps(sys.argv[1:]))" "${PROXIES[@]}")

# 1. Generate environment and test setup configuration files dynamically
python3 -c "
import json

env_dir = '$ENV_DIR'
proxies = json.loads('''$PROXIES_JSON''')

# env.json
with open(f'{env_dir}/env.json', 'w') as f:
    json.dump({'name': 'test'}, f, indent=2)

# deployments.json
deployments = {'proxies': [{'name': p} for p in proxies]}
with open(f'{env_dir}/deployments.json', 'w') as f:
    json.dump(deployments, f, indent=2)

# datacollectors.json
datacollectors = [
  {'name': 'dc_ai_model', 'type': 'STRING'},
  {'name': 'dc_ai_user', 'type': 'STRING'},
  {'name': 'dc_ai_provider', 'type': 'STRING'},
  {'name': 'dc_ai_cost_center', 'type': 'STRING'},
  {'name': 'dc_ai_response_type', 'type': 'STRING'},
  {'name': 'dc_ai_total_token_count', 'type': 'INTEGER'},
  {'name': 'dc_ai_prompt_token_count', 'type': 'INTEGER'},
  {'name': 'dc_ai_response_token_count', 'type': 'INTEGER'},
  {'name': 'dc_ai_time_first_token', 'type': 'INTEGER'},
  {'name': 'dc_ai_request_cost', 'type': 'FLOAT'},
  {'name': 'dc_ai_response_cost', 'type': 'FLOAT'},
  {'name': 'dc_ai_total_cost', 'type': 'FLOAT'}
]
with open(f'{env_dir}/datacollectors.json', 'w') as f:
    json.dump(datacollectors, f, indent=2)

# products.json / apiproducts.json (AI Product includes all deployed proxies)
products = [
  {
    'name': 'AI Product',
    'displayName': 'AI Product',
    'description': 'AI Product',
    'approvalType': 'auto',
    'environments': ['test'],
    'proxies': proxies,
    'apiResources': ['/', '/*', '/**'],
    'quota': '1000',
    'quotaInterval': '1',
    'quotaTimeUnit': 'minute',
    'attributes': [{'name': 'access', 'value': 'public'}]
  }
]
with open(f'{env_dir}/products.json', 'w') as f:
    json.dump(products, f, indent=2)

# developers.json
developers = [
  {
    'email': 'developer@example.com',
    'firstName': 'Test',
    'lastName': 'Developer',
    'userName': 'testdeveloper',
    'attributes': [{'name': 'costCenter', 'value': 'CC-1234'}]
  }
]
with open(f'{env_dir}/developers.json', 'w') as f:
    json.dump(developers, f, indent=2)

# developerapps.json
apps = [
  {
    'name': 'ai-app',
    'displayName': 'AI App',
    'developerEmail': 'developer@example.com',
    'callbackUrl': '',
    'expiryType': 'never',
    'apiProducts': ['AI Product'],
    'credentials': [
      {
        'consumerKey': 'test-api-key-12345',
        'consumerSecret': 'test-secret-12345',
        'apiProducts': [{'apiproduct': 'AI Product', 'status': 'approved'}],
        'status': 'approved'
      }
    ],
    'attributes': []
  }
]
with open(f'{env_dir}/developerapps.json', 'w') as f:
    json.dump(apps, f, indent=2)

# Fixed KVM Data (AI-Config) for maps.json
maps = [
  {
    'name': 'AI-Config',
    'scope': 'environment',
    'environment': 'test',
    'entries': {
      'ModelRouting': '{\"models\": {\"google/\": \"googlecloud\", \"anthropic/\": \"googlecloud\", \"openai/\": \"openai\"}, \"mappings\": {\"google/gemini-flash-latest\": \"google/gemini-3.6-flash\"}}',
      'ModelRoutingText': '{\"models\": {\"google/\": \"googlecloud-oai\", \"anthropic/\": \"googlecloud\", \"openai/\": \"openai\"}, \"mappings\": {\"google/gemini-flash-latest\": \"google/gemini-3.6-flash\"}}',
      'PriceList': '{\"default\": {\"requestPerMillionTokens\": 1, \"responsePerMillionTokens\": 3}}'
    }
  }
]
with open(f'{env_dir}/maps.json', 'w') as f:
    json.dump(maps, f, indent=2)
"

# Copy configurations to alternate file names and bundle root
cp "$ENV_DIR/products.json" "$ENV_DIR/apiproducts.json"
cp "$ENV_DIR/developerapps.json" "$ENV_DIR/apps.json"

cp "$ENV_DIR/products.json" "$APIGEE_ROOT_DIR/products.json"
cp "$ENV_DIR/apiproducts.json" "$APIGEE_ROOT_DIR/apiproducts.json"
cp "$ENV_DIR/developers.json" "$APIGEE_ROOT_DIR/developers.json"
cp "$ENV_DIR/developerapps.json" "$APIGEE_ROOT_DIR/developerapps.json"
cp "$ENV_DIR/apps.json" "$APIGEE_ROOT_DIR/apps.json"
cp "$ENV_DIR/maps.json" "$APIGEE_ROOT_DIR/maps.json"

# 2. Package the full bundle into bundle.zip
DEPLOY_ZIP="$DIST_DIR/bundle.zip"
(cd "$BUNDLE_DIR" && zip -q -r "$DEPLOY_ZIP" src)

# 3. Create testdata.zip for /v1/emulator/setup/tests
TESTDATA_ZIP="$DIST_DIR/testdata.zip"
TESTDATA_DIR="$DIST_DIR/testdata"
mkdir -p "$TESTDATA_DIR"

cp "$ENV_DIR/products.json" "$TESTDATA_DIR/products.json"
cp "$ENV_DIR/developers.json" "$TESTDATA_DIR/developers.json"
cp "$ENV_DIR/developerapps.json" "$TESTDATA_DIR/developerapps.json"
cp "$ENV_DIR/maps.json" "$TESTDATA_DIR/maps.json"

(cd "$TESTDATA_DIR" && zip -q -r "$TESTDATA_ZIP" .)

# 4. Reset emulator
curl -s -X POST "http://localhost:8080/v1/emulator/reset" > /dev/null

# 5. Deploy bundle contract to Apigee Emulator
HTTP_STATUS=$(curl -s -o /tmp/emulator_response.txt -w "%{http_code}" -X POST \
  "http://localhost:8080/v1/emulator/deploy?environment=test" \
  -H "Content-Type: application/zip" \
  --data-binary "@$DEPLOY_ZIP")

echo "Deployment HTTP Status: $HTTP_STATUS"
cat /tmp/emulator_response.txt
echo ""

# 6. Load test data (KVMs, developers, apps, products) into emulator
SETUP_STATUS=$(curl -s -o /tmp/emulator_setup_response.txt -w "%{http_code}" -X POST \
  "http://localhost:8080/v1/emulator/setup/tests" \
  -H "Content-Type: application/zip" \
  --data-binary "@$TESTDATA_ZIP")

echo "Test Setup HTTP Status: $SETUP_STATUS"
cat /tmp/emulator_setup_response.txt
echo ""
