// La cabeza del modelo provisorio (js/cabeza.js): que tenga medidas de
// cabeza, que la piel mire para afuera y que los ojos asomen por los párpados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OJO, distancia, mallaCabeza } from '../js/cabeza.js';

const m = mallaCabeza();

test('mide lo que una cabeza de adulto', () => {
  const P = m.posiciones;
  const mn = [Infinity, Infinity, Infinity];
  const mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      mn[k] = Math.min(mn[k], P[i + k]);
      mx[k] = Math.max(mx[k], P[i + k]);
    }
  }
  const ancho = mx[0] - mn[0];
  const alto = mx[1] - mn[1];
  const largo = mx[2] - mn[2];
  assert.ok(ancho > 0.14 && ancho < 0.19, `ancho ${ancho}`);
  assert.ok(alto > 0.21 && alto < 0.26, `alto ${alto}`);
  assert.ok(largo > 0.2 && largo < 0.25, `largo ${largo}`);
  // Simétrica: sin cuello ni nada colgando de un lado.
  assert.ok(Math.abs(mx[0] + mn[0]) < 0.004);
});

test('los triángulos miran para afuera', () => {
  const { posiciones: P, normales: N, indices: I } = m;
  let mal = 0;
  for (let t = 0; t < I.length; t += 3) {
    const [a, b, c] = [3 * I[t], 3 * I[t + 1], 3 * I[t + 2]];
    const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
    const v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (n[0] * N[a] + n[1] * N[a + 1] + n[2] * N[a + 2] <= 0) mal++;
  }
  assert.ok(mal / (I.length / 3) < 0.002, `${mal} triángulos al revés`);
});

test('el iris asoma por los párpados y el resto del globo queda tapado', () => {
  for (const s of [1, -1]) {
    // El frente del ojo, fuera de la piel.
    assert.ok(distancia(s * OJO.x, OJO.y, OJO.z + OJO.radio) > 0);
    // Arriba, abajo y al costado del globo, bajo la piel.
    assert.ok(distancia(s * OJO.x, OJO.y + OJO.radio * 0.9, OJO.z + 0.004) < 0);
    assert.ok(distancia(s * OJO.x, OJO.y - OJO.radio * 0.9, OJO.z + 0.004) < 0);
    assert.ok(distancia(s * (OJO.x + OJO.radio), OJO.y, OJO.z) < 0);
  }
});

test('los laberintos quedan adentro de la cabeza', () => {
  for (const s of [1, -1]) assert.ok(distancia(s * 0.038, 0, 0) < -0.02);
});
