#!/usr/bin/env bash
# Arma en `dist/` lo que se publica en el servidor: la página y, en
# `dist/modelos/`, el detector SIEV-iris con su licencia.
#
# El modelo no está en este repo: es AGPL-3.0 (deriva de Ultralytics YOLOv8)
# y vive en el suyo, siev_vng_models. Se toma de ahí —por defecto la carpeta
# hermana— o de donde diga SIEV_IRIS_DIR:
#
#   ./dist.sh
#   SIEV_IRIS_DIR=/ruta/al/modelo ./dist.sh
#
# `dist/` no va al repo (.gitignore): se sube tal cual a la carpeta de la
# página, p. ej. tecmedhub.org/trainhit/.
set -euo pipefail
cd "$(dirname "$0")"

MODELO=siev_iris_r01.onnx
DIR_MODELO=${SIEV_IRIS_DIR:-../siev_vng_models}

if [[ ! -f "$DIR_MODELO/$MODELO" ]]; then
  echo "No está $DIR_MODELO/$MODELO: clonar siev_vng_models al lado o indicar SIEV_IRIS_DIR." >&2
  exit 1
fi

# El mapa de importación y su hash tienen que coincidir: publicar algo que no
# pasa este test deja la página en blanco.
node --test test/version.test.mjs >/dev/null || {
  echo "El importmap no coincide con su hash: correr ./bump.sh." >&2
  exit 1
}

rm -rf dist
mkdir -p dist/modelos
cp index.html sw.js LICENSE dist/
cp -r css js manual dist/
# De img/ solo lo que se sirve: fuera los generadores y las notas.
mkdir -p dist/img
(cd img && find . -type f ! -name '*.mjs' ! -name '*.md' -exec cp --parents {} ../dist/img/ \;)

cp "$DIR_MODELO/$MODELO" dist/modelos/
cp "$DIR_MODELO/LICENSE" dist/modelos/LICENSE

version=$(grep -o 'js/app\.js?v=[^"]*' index.html | head -1 | cut -d= -f2)
echo "dist/ armado: trainHIT $version, $(du -sh dist | cut -f1), con $MODELO."
