#!/usr/bin/env bash
set -e

REPO="apigee/apigee-templater"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR"

cd "$ROOT_DIR"

VERSION=$(node -e 'console.log(require("./package.json").version)')
TAG="v${VERSION}"

echo "================================================="
echo " Building and Releasing AFT version ${TAG}"
echo "================================================="

# 1. Build binaries
echo -e "\n📦 Compiling cross-platform single-file binaries..."
bun run build:binaries

# 2. Check Git Tag
if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo -e "\n✔ Git tag ${TAG} already exists locally."
else
  echo -e "\n🏷 Creating git tag ${TAG}..."
  git tag -a "$TAG" -m "Release ${TAG}"
  echo "Pushing tag ${TAG} to origin..."
  git push origin "$TAG" || echo "Note: Could not push tag automatically. Please run: git push origin ${TAG}"
fi

# 3. Create GitHub Release
echo -e "\n🚀 Preparing GitHub Release ${TAG}..."

ASSETS=(
  "dist/aft-linux-x64"
  "dist/aft-linux-arm64"
  "dist/aft-darwin-x64"
  "dist/aft-darwin-arm64"
  "dist/aft-windows-x64.exe"
)

if command -v gh >/dev/null 2>&1; then
  echo "Using GitHub CLI (gh) to create draft release..."
  gh release create "$TAG" "${ASSETS[@]}" \
    --title "$TAG" \
    --notes "Apigee Feature Templater ${TAG}" \
    --draft
  echo -e "\n✨ Draft release created successfully!"
  echo "Visit: https://github.com/${REPO}/releases"
elif [ -n "$GITHUB_TOKEN" ]; then
  echo "Using GITHUB_TOKEN to create draft release via REST API..."
  RELEASE_RESPONSE=$(curl -s -X POST \
    -H "Authorization: token $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/${REPO}/releases" \
    -d "{\"tag_name\":\"$TAG\",\"name\":\"$TAG\",\"body\":\"Apigee Feature Templater $TAG\",\"draft\":true}")

  UPLOAD_URL=$(echo "$RELEASE_RESPONSE" | grep -o 'https://uploads.github.com/[^"]*' | sed 's/{?name,label}//')

  if [ -n "$UPLOAD_URL" ]; then
    for ASSET in "${ASSETS[@]}"; do
      FILENAME=$(basename "$ASSET")
      echo "Uploading $FILENAME..."
      curl -s -X POST \
        -H "Authorization: token $GITHUB_TOKEN" \
        -H "Content-Type: application/octet-stream" \
        --data-binary "@$ASSET" \
        "${UPLOAD_URL}?name=${FILENAME}" >/dev/null
    done
    echo -e "\n✨ Draft release and binaries uploaded successfully!"
  else
    echo "Could not parse upload URL from GitHub API response."
  fi
else
  echo "-------------------------------------------------"
  echo " GitHub CLI (gh) and GITHUB_TOKEN not found."
  echo " All binaries are compiled and ready in dist/:"
  for ASSET in "${ASSETS[@]}"; do
    echo "  - $ASSET"
  done
  echo ""
  echo " To finalize the release manually:"
  echo " 1. Go to: https://github.com/${REPO}/releases/new?tag=${TAG}"
  echo " 2. Set title to '${TAG}'"
  echo " 3. Drag and drop the 5 binary files listed above into the Release assets box."
  echo " 4. Click 'Publish release'."
  echo "-------------------------------------------------"
fi
