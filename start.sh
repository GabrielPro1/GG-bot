#!/bin/sh
# Avvia GG Bot dentro proot (Ubuntu su Termux).
#
# I moduli nativi (better-sqlite3, @napi-rs/canvas) non possono essere caricati
# da /sdcard: è FUSE e montato noexec. Per questo node_modules vive in
# /root/GG-Bot-node_modules e viene montato dentro il progetto: da fuori lo vedi
# e lo usi come una normale cartella node_modules accanto al codice.
#
# Uso:
#   sh ./start.sh                       avvia il bot
#   sh ./start.sh npm install ...       esegue un comando nella cartella progetto
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

mkdir -p "$NODE_MODULES_DIR" "$MOUNT_POINT"

# Il bind mount è per sessione: se esiste già in questa sessione lo riusiamo,
# altrimenti lo ricreiamo. Così node_modules compare nella cartella del
# progetto senza doverlo copiare da /root.
if ! is_mounted "$MOUNT_POINT"; then
    echo "[start] bind mount $NODE_MODULES_DIR -> $MOUNT_POINT"
    mount --bind "$NODE_MODULES_DIR" "$MOUNT_POINT"
fi

cd "$PROJECT_DIR"

# Con argomenti esegue il comando richiesto (es. npm install) dentro il
# progetto, con le dipendenze già montate.
if [ "$#" -gt 0 ]; then
    exec "$@"
fi

if [ ! -d "$NODE_MODULES_DIR/better-sqlite3" ]; then
    echo "[start] dipendenze mancanti in $NODE_MODULES_DIR" >&2
    echo "[start] esegui: sh ./start.sh npm install" >&2
    echo "[start] Vedi TERMUX.md per la procedura completa." >&2
    exit 1
fi

exec node index.js
