// El mapa de importación de index.html y su hash en la CSP tienen que
// coincidir, y el mapa tiene que listar todos los módulos con la misma versión.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hashCsp, modulos, versionActual } from '../bump.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('el hash de la CSP es el del importmap', () => {
  const json = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];
  assert.ok(html.includes(`'${hashCsp(json)}'`), 'hash desactualizado: correr ./bump.sh');
});

test('el importmap lista todos los módulos con la misma versión', () => {
  const json = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];
  const mapa = JSON.parse(json).imports;
  const v = versionActual(html);
  assert.match(v, /^\d{4}-\d{2}-\d{2}\.\d+$/);
  for (const m of modulos()) assert.equal(mapa[`./js/${m}.js`], `./js/${m}.js?v=${v}`, m);
  assert.equal(Object.keys(mapa).length, modulos().length);
});
