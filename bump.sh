#!/usr/bin/env bash
# Sube la versión de los archivos: ver bump.mjs.
set -euo pipefail
cd "$(dirname "$0")"
exec node bump.mjs
