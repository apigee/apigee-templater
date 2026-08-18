#!/bin/bash
set -e

# Feature YAML paths to build and deploy (add or remove feature YAMLs here)
FEATURE_FILES=(
  "repository/features/ai-base-pre.yaml"
  "repository/templates/REST-AI-Completions.yaml"
)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EMULATOR_MGMT_URL="${EMULATOR_MGMT_URL:-http://localhost:8080}"

cd "$ROOT_DIR"

DIST_DIR="$ROOT_DIR/emulator/dist"
BUNDLE_DIR="$DIST_DIR/bundle"
ENV_DIR="$BUNDLE_DIR/src/main/apigee/environments/test"
PROXIES_DIR="$BUNDLE_DIR/src/main/apigee/apiproxies"

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

  if [ -z "$PROXY_NAME" ] || [ "$PROXY_NAME" = "ai-chat-completions-v1" ]; then
    PROXY_NAME="completions-v1"
  fi

  echo "Building proxy '$PROXY_NAME' from '$YAML_FILE'..."
  ZIP_PATH="$DIST_DIR/$PROXY_NAME.zip"
  aft -i "$YAML_FILE" -o "$ZIP_PATH"

  TARGET_DIR="$PROXIES_DIR/$PROXY_NAME"
  mkdir -p "$TARGET_DIR"
  unzip -q -o "$ZIP_PATH" -d "$TARGET_DIR"

  PROXIES+=("$PROXY_NAME")
done

# Generate minimal environment deployment configuration
PROXIES_JSON=$(python3 -c "import sys, json; print(json.dumps(sys.argv[1:]))" "${PROXIES[@]}")

cat << EOF > "$ENV_DIR/env.json"
{
  "name": "test"
}
EOF

cat << EOF > "$ENV_DIR/deployments.json"
{
  "proxies": $PROXIES_JSON
}
EOF

# Copy datacollectors.json to environment directory
cp "$SCRIPT_DIR/datacollectors.json" "$ENV_DIR/datacollectors.json"

# Package deployment bundle
DEPLOY_ZIP="$DIST_DIR/bundle.zip"
(cd "$BUNDLE_DIR" && zip -q -r "$DEPLOY_ZIP" src)

# Reset emulator
echo "Resetting Apigee Emulator..."
curl -s -X POST "$EMULATOR_MGMT_URL/v1/emulator/reset" > /dev/null

# Deploy test data directly from local JSON files
TESTDATA_ZIP="$DIST_DIR/testdata.zip"
(cd "$SCRIPT_DIR" && zip -q "$TESTDATA_ZIP" datacollectors.json developerapps.json developers.json maps.json products.json)

echo "Deploying test data to Apigee Emulator..."
TEST_STATUS=$(curl -s -o /tmp/emulator_setup_response.txt -w "%{http_code}" -X POST "$EMULATOR_MGMT_URL/v1/emulator/setup/tests" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@$TESTDATA_ZIP")

echo "Test Setup HTTP Status: $TEST_STATUS"
if [ "$TEST_STATUS" -ne 200 ]; then
  cat /tmp/emulator_setup_response.txt
  exit 1
fi

# Deploy proxy bundle second
echo "Deploying proxies to Apigee Emulator..."
DEPLOY_STATUS=$(curl -s -o /tmp/emulator_response.txt -w "%{http_code}" -X POST "$EMULATOR_MGMT_URL/v1/emulator/deploy?environment=test" \
  -H "Content-Type: application/zip" \
  --data-binary "@$DEPLOY_ZIP")

echo "Deployment HTTP Status: $DEPLOY_STATUS"
cat /tmp/emulator_response.txt
echo ""
