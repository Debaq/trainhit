// El mensaje que el teléfono le manda al PC por el canal de datos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leeCabeza, mensajeCabeza } from '../js/enlace.js';

test('la cabeza viaja entera y vuelve igual', () => {
  const q = [0.1, -0.2, 0.3, 0.927];
  const w = [12.5, -200, 3];
  const m = leeCabeza(mensajeCabeza(q, w));
  m.q.forEach((v, i) => assert.ok(Math.abs(v - q[i]) < 1e-6));
  m.w.forEach((v, i) => assert.ok(Math.abs(v - w[i]) < 1e-4));
});

test('lo que no es un mensaje de cabeza se ignora', () => {
  assert.equal(leeCabeza('centrar'), null);
  assert.equal(leeCabeza(new ArrayBuffer(8)), null);
  assert.equal(leeCabeza(new Float32Array(8).buffer), null);
});
