#!/bin/sh
# Avvia GG Bot dentro proot (Ubuntu su Termux).
#
# I moduli nativi (better-sqlite3, @napi-rs/canvas) non possono essere caricati
# da /mnt/sdcard: è FUSE e montato noexec. Per questo node_modules vive in una
# directory eseguibile del proot e viene collegato con un bind mount.
#
# Variabili opzionali:
#   PROJECT_DIR       cartella del progetto (default: quella di questo script)
#   NODE_MODULES_DIR  node_modules eseguibile (default: /root/GG-Bot-node_modules)
set -eu

PROJECT_DIR="${PROJECT_DIR:-$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)}"
NODE_MODULES_DIR="${NODE_MODULES_DIR:-/root/GG-Bot-node_modules}"
MOUNT_POINT="$PROJECT_DIR/node_modules"

is_mounted() {
    grep -qs " $1 " /proc/mounts
}

if [ ! -d "$NODE_MODULES_DIR" ]; then
    echo "[start] node_modules non trovato in $NODE_MODULES_DIR" >&2
    echo "[start] Non copiare node_modules da Windows: reinstallalo su Linux ARM64." >&2
    echo "[start] Vedi TERMUX.md per la procedura completa." >&2
    exit 1
fi

mkdir -p "$MOUNT_POINT"

# Il bind mount è per sessione: se l'hai già creato in questa sessione lo
# riusiamo, altrimenti lo ricreiamo prima di avviare Node.
if ! is_mounted "$MOUNT_POINT"; then
    echo "[start] bind mount $NODE_MODULES_DIR -> $MOUNT_POINT"
    mount --bind "$NODE_MODULES_DIR" "$MOUNT_POINT"
fi

cd "$PROJECT_DIR"
exec node index.js
