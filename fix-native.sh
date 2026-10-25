#!/bin/sh
# Ripara il binding nativo di @napi-rs/canvas dentro il proot.
#
# Serve perché il node_modules installato su Windows non contiene il binding
# Linux ARM64 (@napi-rs/canvas-linux-arm64-gnu). Senza di esso il render PDF
# fallisce con "Cannot find native binding".
#
# Va eseguito dentro il proot Ubuntu (vedi TERMUX.md), non in Termux.
#
# Variabili opzionali:
#   NODE_MODULES_DIR        (default: /root/GG-Bot-deps/node_modules)
#   CANVAS_NATIVE_VERSION   (default: versione del wrapper installato, o 0.1.100)
#   CANVAS_ARCH             (default: linux-arm64-gnu)
set -eu

NODE_MODULES_DIR="${NODE_MODULES_DIR:-/root/GG-Bot-deps/node_modules}"
CANVAS_ARCH="${CANVAS_ARCH:-linux-arm64-gnu}"
PACKAGE="@napi-rs/canvas-$CANVAS_ARCH"
DEST="$NODE_MODULES_DIR/@napi-rs/canvas-$CANVAS_ARCH"

if [ -z "${CANVAS_NATIVE_VERSION:-}" ]; then
    wrapper="$NODE_MODULES_DIR/@napi-rs/canvas/package.json"
    if [ -f "$wrapper" ]; then
        CANVAS_NATIVE_VERSION="$(sed -n 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$wrapper" | head -n 1)"
    fi
fi
CANVAS_NATIVE_VERSION="${CANVAS_NATIVE_VERSION:-0.1.100}"

URL="https://registry.npmjs.org/@napi-rs/canvas-$CANVAS_ARCH/-/canvas-$CANVAS_ARCH-$CANVAS_NATIVE_VERSION.tgz"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "[fix-native] scarico $PACKAGE@$CANVAS_NATIVE_VERSION"
curl -fsSL "$URL" -o "$TMP_DIR/package.tgz"
tar -xzf "$TMP_DIR/package.tgz" -C "$TMP_DIR"

mkdir -p "$NODE_MODULES_DIR/@napi-rs"
rm -rf "$DEST"
mv "$TMP_DIR/package" "$DEST"

if ! find "$DEST" -maxdepth 1 -name '*.node' | grep -q .; then
    echo "[fix-native] il pacchetto scaricato non contiene un binding .node" >&2
    exit 1
fi

echo "[fix-native] installato in $DEST"
echo "[fix-native] riavvia il bot e verifica con: node -e \"import('@napi-rs/canvas')\""
