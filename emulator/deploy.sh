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
    {
      "name": "auth-v1",
    },
    {
      "name": "completions-v1"
    },
    {
      "name": "embeddings-v1"
    },
    {
      "name": "images-v1"
    },
    {
      "name": "audio-v1"
    }
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

cat << 'EOF' > "$ENV_DIR/apiproducts.json"
[
  {
    "name": "auth-v1-product",
    "displayName": "Auth v1 API Product",
    "description": "API Product for auth-v1 proxy",
    "approvalType": "auto",
    "environments": [
      "test"
    ],
    "proxies": [
      "auth-v1"
    ],
    "apiResources": [
      "/",
      "/*",
      "/**"
    ],
    "quota": "1000",
    "quotaInterval": "1",
    "quotaTimeUnit": "minute",
    "attributes": [
      {
        "name": "access",
        "value": "public"
      }
    ]
  }
]
EOF
cp "$ENV_DIR/apiproducts.json" "$ENV_DIR/products.json"

cat << 'EOF' > "$ENV_DIR/developers.json"
[
  {
    "email": "developer@example.com",
    "firstName": "Test",
    "lastName": "Developer",
    "userName": "testdeveloper",
    "attributes": [
      {
        "name": "costCenter",
        "value": "CC-1234"
      }
    ]
  }
]
EOF

cat << 'EOF' > "$ENV_DIR/developerapps.json"
[
  {
    "name": "auth-v1-app",
    "displayName": "Auth v1 App",
    "developerEmail": "developer@example.com",
    "callbackUrl": "",
    "expiryType": "never",
    "apiProducts": [
      "auth-v1-product"
    ],
    "credentials": [
      {
        "consumerKey": "test-api-key-12345",
        "consumerSecret": "test-secret-12345",
        "apiProducts": [
          {
            "apiproduct": "auth-v1-product",
            "status": "approved"
          }
        ],
        "status": "approved"
      }
    ],
    "attributes": []
  }
]
EOF
cp "$ENV_DIR/developerapps.json" "$ENV_DIR/apps.json"

# Copy configurations to bundle root src/main/apigee as well
APIGEE_ROOT_DIR="$BUNDLE_DIR/src/main/apigee"
cp "$ENV_DIR/apiproducts.json" "$APIGEE_ROOT_DIR/apiproducts.json"
cp "$ENV_DIR/products.json" "$APIGEE_ROOT_DIR/products.json"
cp "$ENV_DIR/developers.json" "$APIGEE_ROOT_DIR/developers.json"
cp "$ENV_DIR/developerapps.json" "$APIGEE_ROOT_DIR/developerapps.json"
cp "$ENV_DIR/apps.json" "$APIGEE_ROOT_DIR/apps.json"


# 2. Build proxy zip bundles into emulator/dist
aft -i ./repository/features/ai-auth.yaml -o "$DIST_DIR/auth-v1.zip"
aft -i ./repository/features/ai-completions.yaml -o "$DIST_DIR/completions-v1.zip"
aft -i ./repository/features/ai-embeddings.yaml -o "$DIST_DIR/embeddings-v1.zip"
aft -i ./repository/features/ai-images.yaml -o "$DIST_DIR/images-v1.zip"
aft -i ./repository/features/ai-audio.yaml -o "$DIST_DIR/audio-v1.zip"

# 3. Unpack each proxy zip into its target folder in emulator/dist/bundle/
for PROXY_NAME in auth-v1 completions-v1 embeddings-v1 images-v1 audio-v1; do
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
