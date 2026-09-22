#!/usr/bin/env bash
# Sube la versión de los archivos en js/arranque.js.
#
# La versión es `AAAA-MM-DD.N`: la fecha de hoy y, si ya hubo una publicación
# hoy, el número que sigue. Con eso el navegador ve direcciones nuevas y un
# reload común alcanza para tomar los cambios — nadie tiene que saber hacer una
# recarga forzada.
set -euo pipefail
cd "$(dirname "$0")"

archivo=js/arranque.js
actual=$(grep -oP "const V = '\K[^']+" "$archivo")
hoy=$(date +%F)

if [[ $actual == "$hoy".* ]]; then
  nueva="$hoy.$(( ${actual##*.} + 1 ))"
else
  nueva="$hoy.1"
fi

sed -i "s/const V = '$actual';/const V = '$nueva';/" "$archivo"
echo "$actual -> $nueva"
