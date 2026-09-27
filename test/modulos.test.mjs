// Los módulos de la interfaz que se pueden cargar sin DOM, cargados: un error
// de sintaxis en ellos rompe la página entera y ningún otro test lo ve.
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('laberinto.js carga', async () => {
  const m = await import('../js/laberinto.js');
  assert.equal(typeof m.montaLaberinto, 'function');
});
