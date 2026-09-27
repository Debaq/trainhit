// Los mensajes entre el teléfono y el PC por el canal de datos: la cabeza y
// los de control remoto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leeCabeza, leeControl, mensajeCabeza, mensajeControl, refControl, refValida } from '../js/enlace.js';

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

test('un mensaje de control viaja y vuelve; lo que no es uno se ignora', () => {
  const m = { t: 'control', ref: '#lab-caso', evento: 'change', valor: 'neuritis_superior' };
  assert.deepEqual(leeControl(mensajeControl(m)), m);
  assert.equal(leeControl('centrar'), null);
  assert.equal(leeControl('{roto'), null);
  assert.equal(leeControl(JSON.stringify({ t: 'otra cosa' })), null);
  assert.equal(leeControl(mensajeCabeza([0, 0, 0, 1], [0, 0, 0])), null);
  // La cabeza no se confunde con un control.
  assert.equal(leeCabeza(mensajeControl(m)), null);
});

test('los controles se nombran por id o por su atributo, y solo eso se acepta', () => {
  assert.equal(refControl({ id: 'lab-vpico', dataset: {} }), '#lab-vpico');
  assert.equal(refControl({ id: '', dataset: { vista: 'via' } }), '[data-vista="via"]');
  assert.equal(refControl({ id: '', dataset: { modoLab: 'lados' } }), '[data-modo-lab="lados"]');
  assert.equal(refControl({ id: '', dataset: {} }), null);
  for (const r of ['#lab-vpico', '[data-vista="via"]', '[data-canal="utr_izq"]', '[data-modo-lab="real"]']) assert.ok(refValida(r), r);
  for (const r of ['body', '#a, body', '[data-x="1"]', '[data-vista="a"] b', '#lab-vpico:not(x)', 42]) assert.ok(!refValida(r), String(r));
});
