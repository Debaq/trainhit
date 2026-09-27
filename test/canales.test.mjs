// La física del Laberinto 3D: las leyes de Ewald con el marco de la cabeza
// (+x izquierda, +y arriba, +z adelante). Si un signo se da vuelta, la sección
// enseña al revés qué canal se excita: esto es lo que lo ataja.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANAL,
  CANALES,
  MOVIMIENTOS,
  TASA_MAX,
  TASA_REPOSO,
  activacion,
  normalDePlano,
  perfilImpulso,
  qEjeAngulo,
  qMul,
  respuestas,
  velocidadAngular,
} from '../js/canales.js';

const mov = Object.fromEntries(MOVIMIENTOS.map((m) => [m.id, m.eje]));
const escala = (v, k) => v.map((x) => x * k);
const excitados = (r) => Object.keys(r).filter((id) => r[id].tasa > TASA_REPOSO + 1).sort();
const inhibidos = (r) => Object.keys(r).filter((id) => r[id].tasa < TASA_REPOSO - 1).sort();

test('los ejes son unitarios y cada par coplanar es opuesto', () => {
  for (const c of CANALES) assert.ok(Math.abs(Math.hypot(...c.eje) - 1) < 1e-12, c.id);
  for (const [a, b] of [
    ['lat_izq', 'lat_der'],
    ['ant_izq', 'post_der'],
    ['ant_der', 'post_izq'],
  ]) {
    assert.equal(CANAL[a].par, CANAL[b].par);
    CANAL[a].eje.forEach((v, i) => assert.ok(Math.abs(v + CANAL[b].eje[i]) < 1e-12, `${a}/${b}`));
  }
});

test('girar a la izquierda excita el lateral izquierdo e inhibe el derecho', () => {
  const r = respuestas(escala(mov.izq, 100));
  assert.ok(r.lat_izq.tasa > TASA_REPOSO);
  assert.ok(r.lat_der.tasa < TASA_REPOSO);
  // Los verticales, quietos: el giro horizontal no los toca.
  for (const id of ['ant_izq', 'post_izq', 'ant_der', 'post_der']) assert.equal(r[id].tasa, TASA_REPOSO, id);
});

test('con la cabeza derecha, girar sobre la vertical también roza los verticales', () => {
  // La razón de flexionar 30° en el vHIT lateral.
  const r = respuestas([0, 100, 0]);
  assert.ok(r.lat_izq.tasa > TASA_REPOSO && r.lat_izq.tasa < respuestas(escala(mov.izq, 100)).lat_izq.tasa);
  assert.ok(['ant_izq', 'post_izq', 'ant_der', 'post_der'].some((id) => r[id].tasa !== TASA_REPOSO));
});

test('bajar la nariz excita los dos anteriores; subirla, los dos posteriores', () => {
  assert.deepEqual(excitados(respuestas(escala(mov.abajo, 100))), ['ant_der', 'ant_izq']);
  assert.deepEqual(excitados(respuestas(escala(mov.arriba, 100))), ['post_der', 'post_izq']);
});

test('bajar la oreja izquierda excita los verticales izquierdos', () => {
  const r = respuestas(escala(mov.oreja_izq, 100));
  for (const id of ['ant_izq', 'post_izq']) assert.ok(r[id].tasa > TASA_REPOSO, id);
  for (const id of ['ant_der', 'post_der']) assert.ok(r[id].tasa < TASA_REPOSO, id);
});

test('un giro en el plano LARP solo mueve el anterior izquierdo y el posterior derecho', () => {
  const r = respuestas(escala(mov.larp_abajo, 100));
  assert.deepEqual(excitados(r), ['ant_izq']);
  assert.deepEqual(inhibidos(r), ['post_der']);
  const s = respuestas(escala(mov.ralp_arriba, 100));
  assert.deepEqual(excitados(s), ['post_izq']);
  assert.deepEqual(inhibidos(s), ['ant_der']);
});

test('Ewald II: la inhibición toca fondo y la excitación sigue', () => {
  const r = respuestas(escala(mov.izq, 400));
  assert.equal(r.lat_der.tasa, 0);
  assert.ok(r.lat_izq.tasa > 2 * TASA_REPOSO);
  assert.ok(respuestas(escala(mov.izq, 5000)).lat_izq.tasa <= TASA_MAX);
  assert.equal(activacion(0), -1);
  assert.equal(activacion(TASA_REPOSO), 0);
  assert.ok(activacion(2 * TASA_REPOSO) > 0 && activacion(2 * TASA_REPOSO) < 1);
});

test('la velocidad angular sale en el marco de la cabeza', () => {
  // Cabeza ya girada 90° a la izquierda; ahora baja la nariz 1° en 10 ms: en
  // SU marco es +x, aunque en el mundo ese eje apunte a otro lado.
  const q0 = qEjeAngulo([0, 1, 0], 90);
  const q1 = qMul(q0, qEjeAngulo([1, 0, 0], 1));
  const w = velocidadAngular(q0, q1, 0.01);
  assert.ok(Math.abs(w[0] - 100) < 1e-6 && Math.abs(w[1]) < 1e-6 && Math.abs(w[2]) < 1e-6, String(w));
});

test('el impulso llega al pico pedido, se queda y vuelve', () => {
  const A = 20;
  const v = 200;
  const ida = (1.5 * A) / v;
  const pico = perfilImpulso(ida / 2, A, v);
  assert.ok(Math.abs(pico.velocidad - v) < 1e-9);
  assert.ok(Math.abs(pico.angulo - A / 2) < 1e-9);
  assert.equal(perfilImpulso(ida + 0.1, A, v).angulo, A);
  const vuelta = perfilImpulso(ida + 0.3 + ida * 1.5, A, v);
  assert.ok(vuelta.velocidad < 0 && vuelta.velocidad > -v);
  const fin = perfilImpulso(10, A, v);
  assert.ok(fin.fin && Math.abs(fin.angulo) < 1e-9);
});

test('normalDePlano encuentra el eje de un anillo inclinado', () => {
  const n = CANAL.ant_izq.eje;
  // Dos vectores del plano del canal.
  const u = [n[2], 0, -n[0]];
  const w = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const pts = [];
  for (let k = 0; k < 90; k++) {
    const a = (k / 90) * 1.6 * Math.PI; // un arco, no el anillo entero
    pts.push([0, 1, 2].map((i) => 3 + 0.003 * (Math.cos(a) * u[i] + Math.sin(a) * w[i]) + 1e-5 * Math.sin(7 * k + i)));
  }
  const m = normalDePlano(pts);
  const c = Math.abs(m[0] * n[0] + m[1] * n[1] + m[2] * n[2]);
  assert.ok(c > 0.999, `coseno ${c}`);
});
