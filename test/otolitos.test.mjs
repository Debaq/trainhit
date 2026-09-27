// Los otolitos (js/otolitos.js): que sientan la inclinación del lado que
// corresponde y que los utrículos pidan la contrarrotación ocular, o la
// torsión hacia el lado enfermo si uno se pierde sin compensar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TASA_REPOSO, qEjeAngulo } from '../js/canales.js';
import { abajoEnCabeza, nucleosOtolitos, respuestasOtolitos, torsionOtolitica } from '../js/otolitos.js';
import { CASO, funciones } from '../js/patologia.js';

const cerca = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;
const DERECHA = [0, 0, 0, 1];

test('abajo en la cabeza: derecha, oreja izquierda abajo y nariz abajo', () => {
  assert.deepEqual(abajoEnCabeza(DERECHA).map((v) => Math.round(v * 1e9) / 1e9 + 0), [0, -1, 0]);
  // Bajar la oreja izquierda es girar alrededor de −z: abajo se corre a +x.
  const oreja = abajoEnCabeza(qEjeAngulo([0, 0, -1], 30));
  assert.ok(cerca(oreja[0], 0.5) && cerca(oreja[1], -Math.cos(Math.PI / 6)));
  // Bajar la nariz es girar alrededor de +x: abajo se corre a +z.
  const nariz = abajoEnCabeza(qEjeAngulo([1, 0, 0], 30));
  assert.ok(cerca(nariz[2], 0.5));
});

test('cada utrículo se excita con su oreja abajo; los sáculos, con la nariz abajo', () => {
  const quieto = respuestasOtolitos(abajoEnCabeza(DERECHA));
  for (const o of Object.values(quieto)) assert.ok(cerca(o.tasa, TASA_REPOSO));
  const izq = respuestasOtolitos(abajoEnCabeza(qEjeAngulo([0, 0, -1], 30)));
  assert.ok(izq.utr_izq.tasa > TASA_REPOSO && izq.utr_der.tasa < TASA_REPOSO);
  const nariz = respuestasOtolitos(abajoEnCabeza(qEjeAngulo([1, 0, 0], 30)));
  assert.ok(nariz.sac_izq.tasa > TASA_REPOSO && cerca(nariz.sac_izq.tasa, nariz.sac_der.tasa));
});

test('contrarrotación: con la oreja izquierda abajo, los polos van hacia la oreja derecha, unos grados', () => {
  const t = torsionOtolitica(nucleosOtolitos(respuestasOtolitos(abajoEnCabeza(qEjeAngulo([0, 0, -1], 30)))));
  // Positiva: el polo superior a la derecha del paciente.
  assert.ok(t > 4 && t < 10, `${t}`);
  assert.ok(cerca(torsionOtolitica(nucleosOtolitos(respuestasOtolitos(abajoEnCabeza(DERECHA)))), 0));
});

test('utrículo izquierdo perdido: sin compensar rota los ojos hacia la izquierda; compensado, no', () => {
  const f = funciones(CASO.neuritis_superior.canales);
  const ro = respuestasOtolitos(abajoEnCabeza(DERECHA), f);
  const aguda = torsionOtolitica(nucleosOtolitos(ro, { compensado: false }));
  assert.ok(aguda < -3, `${aguda}`);
  assert.ok(cerca(torsionOtolitica(nucleosOtolitos(ro, { compensado: true })), 0));
});

test('los casos llevan los otolitos de su rama del nervio', () => {
  assert.equal(CASO.neuritis_superior.canales.utr_izq, 'arreflexia');
  assert.equal(CASO.neuritis_superior.canales.sac_izq, undefined);
  assert.equal(CASO.neuritis_inferior.canales.sac_izq, 'arreflexia');
  assert.equal(CASO.neuritis_inferior.canales.utr_izq, undefined);
});
