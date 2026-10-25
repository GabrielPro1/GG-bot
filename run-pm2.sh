#!/data/data/com.termux/files/usr/bin/bash
# Avvia GG Bot da Termux tramite proot-distro.
#
# Va usato con pm2 (quello di Termux):
#   pm2 start run-pm2.sh --name gg-bot --interpreter bash
#   pm2 save
#
# Il pm2 di Termux usa Node Bionic e non può caricare gli addon glibc del
# progetto: per questo il processo vero gira dentro il proot Ubuntu, dove
# start.sh ricrea il bind mount di node_modules e lancia index.js.
#
# Variabili opzionali:
#   DISTRO             nome della distro proot-distro (default: ubuntu)
#   PROOT_PROJECT_DIR  percorso del progetto visto dal proot
#                      (default: /sdcard/Documents/GG-Bot)
set -eu

DISTRO="${DISTRO:-ubuntu}"
PROOT_PROJECT_DIR="${PROOT_PROJECT_DIR:-/sdcard/Documents/GG-Bot}"

exec proot-distro login "$DISTRO" -- /bin/sh -lc \
    "cd '$PROOT_PROJECT_DIR' && exec sh ./start.sh"
