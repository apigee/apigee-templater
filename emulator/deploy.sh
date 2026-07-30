#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

DIST_DIR="$ROOT_DIR/emulator/dist"
BUNDLE_DIR="$DIST_DIR/bundle"
ENV_DIR="$BUNDLE_DIR/src/main/apigee/environments/test"
PROXIES_DIR="$BUNDLE_DIR/src/main/apigee/apiproxies"

# Clean and recreate emulator/dist
rm -rf "$DIST_DIR"
mkdir -p "$PROXIES_DIR"
mkdir -p "$ENV_DIR"

# 1. Generate environment configuration files dynamically
cat << 'EOF' > "$ENV_DIR/env.json"
{
  "name": "test"
}
EOF

cat << 'EOF' > "$ENV_DIR/deployments.json"
{
  "proxies": [
    "completions-v1",
    "embeddings-v1",
    "images-v1",
    "audio-v1"
  ]
}
EOF

cat << 'EOF' > "$ENV_DIR/datacollectors.json"
[
  {"name": "dc_ai_model", "type": "STRING"},
  {"name": "dc_ai_cost_center", "type": "STRING"},
  {"name": "dc_ai_response_type", "type": "STRING"},
  {"name": "dc_ai_total_token_count", "type": "INTEGER"},
  {"name": "dc_ai_prompt_token_count", "type": "INTEGER"},
  {"name": "dc_ai_response_token_count", "type": "INTEGER"},
  {"name": "dc_ai_time_first_token", "type": "INTEGER"}
]
EOF

# 2. Build proxy zip bundles into emulator/dist
aft -i ./repository/features/ai-completions.yaml -o "$DIST_DIR/completions-v1.zip"
aft -i ./repository/features/ai-embeddings.yaml -o "$DIST_DIR/embeddings-v1.zip"
aft -i ./repository/features/ai-images.yaml -o "$DIST_DIR/images-v1.zip"
aft -i ./repository/features/ai-audio.yaml -o "$DIST_DIR/audio-v1.zip"

# 3. Unpack each proxy zip into its target folder in emulator/dist/bundle/
for PROXY_NAME in completions-v1 embeddings-v1 images-v1 audio-v1; do
  TARGET_DIR="$PROXIES_DIR/$PROXY_NAME"
  mkdir -p "$TARGET_DIR"
  unzip -q -o "$DIST_DIR/$PROXY_NAME.zip" -d "$TARGET_DIR"
done

# 4. Package the full bundle into bundle.zip
DEPLOY_ZIP="$DIST_DIR/bundle.zip"
(cd "$BUNDLE_DIR" && zip -q -r "$DEPLOY_ZIP" src)

# 5. Reset emulator
curl -s -X POST "http://localhost:8080/v1/emulator/reset" > /dev/null

# 6. Deploy bundle to Apigee Emulator
HTTP_STATUS=$(curl -s -o /tmp/emulator_response.txt -w "%{http_code}" -X POST \
  "http://localhost:8080/v1/emulator/deploy?environment=test" \
  -H "Content-Type: application/zip" \
  --data-binary "@$DEPLOY_ZIP")

echo "Deployment HTTP Status: $HTTP_STATUS"
cat /tmp/emulator_response.txt
echo ""
