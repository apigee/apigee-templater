#!/usr/bin/env bash
set -euo pipefail

# Ensure script executes relative to repository root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_DIR"

BASE_FEATURE="./repository/features/ai-base.yaml"
FEATURES_DIR="./repository/features"

if [ ! -f "$BASE_FEATURE" ]; then
    echo "Error: $BASE_FEATURE not found." >&2
    exit 1
fi

FEATURE_FILES=()
for file in "$FEATURES_DIR"/ai-*.yaml; do
    if [ -f "$file" ] && [ "$(basename "$file")" != "ai-base.yaml" ]; then
        FEATURE_FILES+=("$file")
    fi
done

if [ ${#FEATURE_FILES[@]} -eq 0 ]; then
    echo "No matching AI feature files found in $FEATURES_DIR."
    exit 0
fi

echo "Removing ai-base filter/feature from AI features..."
for file in "${FEATURE_FILES[@]}"; do
    echo "  - Processing $file (-r)"
    aft -i "$file" -r "$BASE_FEATURE"
done

echo ""
echo "Re-applying ai-base filter/feature to AI features..."
for file in "${FEATURE_FILES[@]}"; do
    echo "  - Processing $file (-a)"
    aft -i "$file" -a "$BASE_FEATURE"
done

echo ""
echo "Successfully updated all AI features with ai-base."
