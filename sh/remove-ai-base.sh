#!/usr/bin/env bash
set -euo pipefail

# Ensure script executes relative to repository root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_DIR"

PRE_FEATURE="./repository/features/ai-base-pre.yaml"
POST_FEATURE="./repository/features/ai-base-post.yaml"

if [ ! -f "$PRE_FEATURE" ]; then
    echo "Error: $PRE_FEATURE not found." >&2
    exit 1
fi

if [ ! -f "$POST_FEATURE" ]; then
    echo "Error: $POST_FEATURE not found." >&2
    exit 1
fi

# List of file paths for ai-base-pre
PRE_FEATURE_FILES=(
    "./repository/features/ai-audio-speech.yaml"
    "./repository/features/ai-auth.yaml"
    "./repository/features/ai-caching.yaml"
    "./repository/features/ai-chat-completions.yaml"
    "./repository/features/ai-embeddings.yaml"
    "./repository/features/ai-gcloud.yaml"
    "./repository/features/ai-gemini.yaml"
    "./repository/features/ai-images-generations.yaml"
    "./repository/features/ai-messages.yaml"
    "./repository/features/ai-models.yaml"
    "./repository/features/ai-pii-masking.yaml"
    "./repository/features/ai-responses.yaml"
    "./repository/features/ai-security.yaml"
)

# List of file paths for ai-base-post
POST_FEATURE_FILES=(
    "./repository/features/ai-audio-speech.yaml"
    "./repository/features/ai-auth.yaml"
    "./repository/features/ai-caching.yaml"
    "./repository/features/ai-chat-completions.yaml"
    "./repository/features/ai-embeddings.yaml"
    "./repository/features/ai-gcloud.yaml"
    "./repository/features/ai-gemini.yaml"
    "./repository/features/ai-images-generations.yaml"
    "./repository/features/ai-messages.yaml"
    "./repository/features/ai-models.yaml"
    "./repository/features/ai-pii-masking.yaml"
    "./repository/features/ai-responses.yaml"
    "./repository/features/ai-security.yaml"
)

echo "Removing ai-base-pre filter/feature..."
for file in "${PRE_FEATURE_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  - Removing from $file (-r)"
        aft -i "$file" -r "$PRE_FEATURE"
    else
        echo "  - Warning: $file not found, skipping."
    fi
done

echo ""
echo "Removing ai-base-post filter/feature..."
for file in "${POST_FEATURE_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  - Removing from $file (-r)"
        aft -i "$file" -r "$POST_FEATURE"
    else
        echo "  - Warning: $file not found, skipping."
    fi
done

echo ""
echo "Successfully removed ai-base-pre and ai-base-post features."
