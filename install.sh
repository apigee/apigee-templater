#!/usr/bin/env sh
set -e

REPO="apigee/apigee-templater"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"

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

if [ -w "$INSTALL_DIR" ]; then
  mv "$TMP_FILE" "${INSTALL_DIR}/aft"
else
  echo "Elevated permissions required to install to ${INSTALL_DIR}"
  sudo mv "$TMP_FILE" "${INSTALL_DIR}/aft"
fi

rm -rf "$TMP_DIR"

echo "Successfully installed 'aft' to ${INSTALL_DIR}/aft"
echo "Run 'aft -h' to get started!"
