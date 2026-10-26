#!/bin/sh
# Prepara le cartelle persistenti del volume Fly prima di avviare il bot.
set -eu

mkdir -p /data/auth /data/data /data/libri

exec "$@"
