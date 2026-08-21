#!/usr/bin/env sh
set -e

REPO="apigee/apigee-templater"

# Determine installation directory:
# 1. Custom $INSTALL_DIR if provided
# 2. /usr/local/bin if root or writable
# 3. ~/.local/bin for rootless / user-local installation
if [ -n "$INSTALL_DIR" ]; then
  TARGET_DIR="$INSTALL_DIR"
elif [ -w "/usr/local/bin" ]; then
  TARGET_DIR="/usr/local/bin"
else
  TARGET_DIR="${HOME}/.local/bin"
fi

# Detect OS
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$OS" in
  linux*)  OS="linux" ;;
  darwin*) OS="darwin" ;;
  *)
    echo "Error: Unsupported operating system: $OS"
    exit 1
    ;;
esac

# Detect Architecture
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *)
    echo "Error: Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

BINARY_NAME="aft-${OS}-${ARCH}"
DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${BINARY_NAME}"

echo "Downloading Apigee Feature Templater (aft) for ${OS}-${ARCH}..."
TMP_DIR="$(mktemp -d)"
TMP_FILE="${TMP_DIR}/aft"

if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$DOWNLOAD_URL" -o "$TMP_FILE"
elif command -v wget >/dev/null 2>&1; then
  wget -qO "$TMP_FILE" "$DOWNLOAD_URL"
else
  echo "Error: Neither curl nor wget was found."
  exit 1
fi

chmod +x "$TMP_FILE"
mkdir -p "$TARGET_DIR"
mv "$TMP_FILE" "${TARGET_DIR}/aft"
rm -rf "$TMP_DIR"

echo "Successfully installed 'aft' to ${TARGET_DIR}/aft"

# Warn if target directory is not in PATH
case ":$PATH:" in
  *":$TARGET_DIR:"*) ;;
  *)
    echo ""
    echo "Note: '${TARGET_DIR}' is not in your PATH."
    echo "Add it to your PATH by running:"
    echo "  export PATH=\"${TARGET_DIR}:\$PATH\""
    ;;
esac

echo "Run 'aft -h' to get started!"
