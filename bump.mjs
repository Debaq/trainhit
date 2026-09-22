#!/usr/bin/env node
// Sube la versión de los archivos y regenera el mapa de importación con su
// hash en la CSP. Se corre con `./bump.sh` o `node bump.mjs`.
//
// La versión es `AAAA-MM-DD.N`: la fecha de hoy y, si ya hubo una publicación
// hoy, el número que sigue. Con eso el navegador ve direcciones nuevas y un
// reload común alcanza para tomar los cambios.
//
// El mapa de importación tiene que estar EN LÍNEA en index.html (los mapas
// externos no existen) y la CSP prohíbe scripts en línea, así que se lo
// autoriza por hash: cambia el mapa, cambia el hash, y este script actualiza
// los dos. `test/version.test.mjs` comprueba que sigan coincidiendo.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = dirname(fileURLToPath(import.meta.url));
const indexPath = join(raiz, 'index.html');

export function modulos() {
  return readdirSync(join(raiz, 'js'))
    .filter((f) => f.endsWith('.js') && f !== 'arranque.js')
    .map((f) => f.slice(0, -3))
    .sort();
}

export function mapaJson(version) {
  return JSON.stringify({
    imports: Object.fromEntries(modulos().map((m) => [`./js/${m}.js`, `./js/${m}.js?v=${version}`])),
  });
}

export function hashCsp(texto) {
  return `sha256-${createHash('sha256').update(texto, 'utf8').digest('base64')}`;
}

export function versionActual(html) {
  return html.match(/js\/app\.js\?v=([^"'\s]+)/)?.[1] ?? null;
}

export function aplica(html, version) {
  const json = mapaJson(version);
  const conMapa = html.replace(
    /<script type="importmap">[\s\S]*?<\/script>/,
    `<script type="importmap">${json}</script>`,
  );
  if (conMapa === html && !html.includes('<script type="importmap">')) throw new Error('index.html sin importmap');
  const conHash = conMapa.replace(/'sha256-[A-Za-z0-9+/=]+'/, `'${hashCsp(json)}'`);
  if (!conHash.includes(hashCsp(json))) throw new Error('index.html sin hash sha256 en la CSP');
  return conHash;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const html = readFileSync(indexPath, 'utf8');
  const actual = versionActual(html) ?? '0000-00-00.0';
  const hoy = new Date().toISOString().slice(0, 10);
  const nueva = actual.startsWith(`${hoy}.`) ? `${hoy}.${Number(actual.split('.').pop()) + 1}` : `${hoy}.1`;
  writeFileSync(indexPath, aplica(html, nueva));
  console.log(`${actual} -> ${nueva}`);
}
