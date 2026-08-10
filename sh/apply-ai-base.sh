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
    "./repository/features/ai-audio-transcriptions.yaml"
    "./repository/features/ai-auth.yaml"
    "./repository/features/ai-caching.yaml"
    "./repository/features/ai-chat-completions.yaml"
    "./repository/features/ai-embeddings.yaml"
    "./repository/features/ai-proxy-googlecloud.yaml"
    "./repository/features/ai-proxy-gemini.yaml"
    "./repository/features/ai-images-generations.yaml"
    "./repository/features/ai-messages.yaml"
    "./repository/features/ai-models.yaml"
    "./repository/features/ai-pii-masking.yaml"
    "./repository/features/ai-responses.yaml"
    "./repository/features/ai-modelarmor.yaml"
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

echo "Applying ai-base-pre filter/feature..."
for file in "${PRE_FEATURE_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  - Applying $PRE_FEATURE to $file (-a)"
        aft -i "$file" -a "$PRE_FEATURE"
    else
        echo "  - Warning: $file not found, skipping."
    fi
done

echo ""
echo "Applying ai-base-post filter/feature..."
for file in "${POST_FEATURE_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  - Applying $POST_FEATURE to $file (-a)"
        aft -i "$file" -a "$POST_FEATURE"
    else
        echo "  - Warning: $file not found, skipping."
    fi
done

echo ""
echo "Successfully applied ai-base-pre and ai-base-post features."
