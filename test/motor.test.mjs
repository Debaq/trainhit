// Tests del motor: `npm test` (node --test). Sin dependencias.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as geom from '../js/geom.js';
import { Differentiator, lsqFit } from '../js/signal.js';
import { CONFIG, analyzeTrial, asimetria, findImpulse, resumenLado, sampleAt } from '../js/analysis.js';
import { HeadTracker, quatFromMatrix } from '../js/head.js';
import { monotona } from '../js/curve.js';
import { K, R, corre, headPos, muestrasCalibracion, matDeQuat, axisAngle, qmul, qrot, rad } from './sintetico.mjs';

const cerca = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} esperado ${b}±${tol}, dio ${a}`);

// ------------------------------------------------------------ ganancia ---

test('la ganancia de área recupera la nominal a 30, 60 y 120 fps', () => {
  for (const fps of [30, 60, 120]) {
    for (const g of [1.0, 0.8, 0.4]) {
      const r = corre({ fps, pk: 200, ganancia: g });
      assert.equal(r.rejected, null, `fps=${fps} g=${g}: ${r.rejected}`);
      assert.equal(r.side, 'izquierda', 'yaw positivo = izquierda del paciente');
      cerca(r.gain, g, 0.01, `área fps=${fps}`);
      cerca(r.gains.peak, g, 0.02, `pico fps=${fps}`);
    }
  }
});

test('un impulso con yaw negativo es hacia la derecha del paciente', () => {
  const r = corre({ fps: 60, pk: -200, ganancia: 0.9 });
  assert.equal(r.side, 'derecha');
  assert.equal(r.rejected, null);
  cerca(r.gain, 0.9, 0.01);
});

test('con ruido de landmark la media queda en la nominal', () => {
  for (const g of [1.0, 0.6]) {
    const gs = [];
    for (let i = 0; i < 30; i++) gs.push(corre({ fps: 30, pk: 200, ganancia: g, ruidoMm: 0.05 }).gain);
    const m = gs.reduce((a, b) => a + b, 0) / gs.length;
    cerca(m, g, 0.03, `g=${g}`);
  }
});

test('sin calibrar (k=0) un VOR perfecto se lee ~1.9', () => {
  const r = corre({ fps: 30, pk: 200, ganancia: 1, kModelo: 0, calibrado: false });
  assert.ok(r.gain > 1.7 && r.gain < 2.1, `dio ${r.gain}`);
});

test('el k a mano equivocado mueve la ganancia entera', () => {
  const bien = corre({ fps: 60, pk: 200, ganancia: 1 }).gain;
  const mal = corre({ fps: 60, pk: 200, ganancia: 1, kModelo: K * 0.5 }).gain;
  cerca(bien, 1, 0.01);
  assert.ok(mal > 1.3, `con k a la mitad debería inflarse, dio ${mal}`);
});

// ------------------------------------------------------------- rechazos ---

test('rechaza por lento, rápido y rebote', () => {
  assert.equal(corre({ fps: 60, pk: 90, ganancia: 1 }).rejected, 'lento');
  assert.equal(corre({ fps: 60, pk: 420, ganancia: 1 }).rejected, 'rapido');
  assert.equal(corre({ fps: 60, pk: 200, ganancia: 1, rebote: 150 }).rejected, 'rebote');
});

test('findImpulse: un bache de una muestra no cierra el impulso', () => {
  const s = (tMs, headVel) => ({ tMs, headVel });
  const samples = [s(0, 0), s(10, 80), s(20, 150), s(30, 30), s(40, 140), s(50, 100), s(60, 20), s(70, 10), s(80, 5), s(90, 5)];
  // yaw positivo = izquierda del paciente
  const win = findImpulse(samples, 'izquierda', CONFIG);
  assert.deepEqual(win, { onset: 1, offset: 6 });
  assert.equal(findImpulse(samples, 'derecha', CONFIG), null);
});

test('findImpulse: sin final confirmado no hay impulso', () => {
  const s = (tMs, headVel) => ({ tMs, headVel });
  assert.equal(findImpulse([s(0, 0), s(10, 100), s(20, 150), s(30, 120)], 'izquierda', CONFIG), null);
});

test('analyzeTrial con pocas muestras devuelve null y sin impulso lo dice', () => {
  assert.equal(analyzeTrial([]), null);
  const quieto = Array.from({ length: 10 }, (_, i) => ({ tMs: i * 33, headPos: 0, gazePos: 0, headVel: 5, gazeVel: 0, blink: false }));
  assert.equal(analyzeTrial(quieto).rejected, 'sin-impulso');
});

// ---------------------------------------------------------- calibración ---

test('fitParallax recupera k y el objetivo', () => {
  const f = geom.fitParallax(muestrasCalibracion(), R);
  assert.equal(f.issue, null);
  cerca(f.kParallax, K, 0.02, 'k');
  cerca(f.targetAzimuthDeg, 3, 0.3, 'objetivo');
  assert.ok(f.residualDeg < 0.5);
  assert.ok(f.kPlausible);
});

test('fitParallax rechaza rango corto, mirada suelta y pocas muestras', () => {
  assert.equal(geom.fitParallax(muestrasCalibracion({ amp: 8 }), R).issue, 'rango-corto');
  assert.equal(geom.fitParallax(muestrasCalibracion({ miradaSuelta: 12 }), R).issue, 'residuo-alto');
  assert.equal(geom.fitParallax(muestrasCalibracion({ n: 5 }), R), null);
});

// --------------------------------------------------------------- cabeza ---

test('HeadTracker proyecta sobre el eje de la cabeza inclinada 30°', () => {
  const inclinada = axisAngle([1, 0, 0], rad(30));
  const girada = qmul(axisAngle(qrot(inclinada, [0, 1, 0]), rad(12)), inclinada);
  const ht = new HeadTracker('lateral');
  ht.push(quatFromMatrix(matDeQuat(inclinada)));
  cerca(ht.push(quatFromMatrix(matDeQuat(girada))), 12, 0.01, 'giro propio');

  const cabeceo = qmul(axisAngle(qrot(inclinada, [1, 0, 0]), rad(12)), inclinada);
  const ht2 = new HeadTracker('lateral');
  ht2.push(quatFromMatrix(matDeQuat(inclinada)));
  cerca(ht2.push(quatFromMatrix(matDeQuat(cabeceo))), 0, 0.01, 'cabeceo puro');
});

test('quatFromMatrix ignora la escala de la matriz', () => {
  const q = axisAngle([0, 1, 0], rad(40));
  const m = matDeQuat(q).map((v, i) => (i % 4 === 3 || i >= 12 ? v : v * 2.5));
  const r = quatFromMatrix(m);
  for (let i = 0; i < 4; i++) cerca(Math.abs(r[i]), Math.abs(q[i]), 1e-9);
});

// ------------------------------------------------------------- derivada ---

test('lsqFit evalúa valor y pendiente exactos de una parábola', () => {
  const pts = [-0.05, -0.02, 0, 0.03, 0.06].map((t) => [t, 3 + 2 * t + 5 * t * t]);
  const f = lsqFit(pts, 0, 2);
  cerca(f.value, 3, 1e-9);
  cerca(f.slope, 2, 1e-7);
  cerca(f.rms, 0, 1e-9);
});

test('Differentiator: velocidad constante sale exacta y un salto atrás reinicia', () => {
  const d = new Differentiator(100, 2);
  let ultimo = null;
  for (let i = 0; i < 10; i++) ultimo = d.push({ t: i / 30, headDeg: 50 * (i / 30), gazeDeg: 0 });
  cerca(ultimo.headVel, 50, 1e-6);
  assert.equal(d.push({ t: 0, headDeg: 0, gazeDeg: 0 }), null); // ventana fría de nuevo
  assert.equal(d.samples.length, 1);
});

test('la derivada sobre la ventana no aplana el pico más de lo que dicta la tasa', () => {
  const pico30 = corre({ fps: 30, pk: 200, ganancia: 1 }).peakHeadDegS;
  const pico120 = corre({ fps: 120, pk: 200, ganancia: 1 }).peakHeadDegS;
  assert.ok(pico120 > pico30, 'más muestras, pico más fiel');
  assert.ok(pico120 > 185 && pico120 <= 200, `dio ${pico120}`);
});

// ---------------------------------------------------------------- curva ---

test('monotona pasa por las muestras y no sobrepasa', () => {
  const pts = [[0, 0], [1, 10], [2, 10.5], [3, -4], [4, 0], [5, 0]];
  const out = monotona(pts, 8);
  for (const p of pts) assert.ok(out.some(([x, y]) => x === p[0] && Math.abs(y - p[1]) < 1e-12), `falta ${p}`);
  for (let i = 0; i < pts.length - 1; i++) {
    const lo = Math.min(pts[i][1], pts[i + 1][1]) - 1e-9;
    const hi = Math.max(pts[i][1], pts[i + 1][1]) + 1e-9;
    for (const [x, y] of out) {
      if (x >= pts[i][0] && x <= pts[i + 1][0]) assert.ok(y >= lo && y <= hi, `sobrepaso en x=${x}: ${y} fuera de [${lo},${hi}]`);
    }
  }
  assert.equal(monotona([[0, 0], [1, 1]]).length, 2);
});

// -------------------------------------------------------------- resumen ---

test('sampleAt, resumenLado y asimetria', () => {
  const s = [{ tMs: 0, v: 0 }, { tMs: 10, v: 10 }];
  cerca(sampleAt(s, 5, (x) => x.v), 5, 1e-12);
  assert.equal(sampleAt(s, 20, (x) => x.v), null);

  const trials = [
    { side: 'derecha', rejected: null, gain: 1.0 },
    { side: 'derecha', rejected: null, gain: 0.8 },
    { side: 'derecha', rejected: 'lento', gain: 0.1 },
    { side: 'izquierda', rejected: null, gain: 0.6 },
  ];
  const d = resumenLado(trials, 'derecha');
  assert.equal(d.n, 2);
  cerca(d.media, 0.9, 1e-12);
  cerca(d.de, Math.sqrt(0.02), 1e-12);
  cerca(asimetria(0.9, 0.6), 20, 1e-9);
  assert.equal(asimetria(null, 0.6), null);
});

test('geom: observeEye mide offset sobre el eje de las comisuras y blinkScore satura', () => {
  const outer = { x: 0, y: 0 };
  const inner = { x: 30, y: 0 };
  const centro = { x: 18, y: 0 };
  const border = [{ x: 22, y: 0 }, { x: 14, y: 0 }, { x: 18, y: 4 }, { x: 18, y: -4 }];
  const o = geom.observeEye(centro, border, outer, inner);
  cerca(o.pxPerMm, 4 / (geom.IRIS_DIAMETER_MM / 2), 1e-12);
  cerca(o.offsetMm, 3 / o.pxPerMm, 1e-12);
  assert.equal(geom.blinkScore(1), 0);
  assert.equal(geom.blinkScore(0), 1);
  assert.equal(geom.observeEye(centro, [], outer, inner), null);
});

test('HeadTracker re-ancla contra la referencia al recuperar la cara', () => {
  const ht = new HeadTracker('lateral');
  const q = (g) => quatFromMatrix(matDeQuat(axisAngle([0, 1, 0], rad(g))));
  ht.push(q(0));
  for (let g = 1; g <= 10; g++) ht.push(q(g));
  cerca(ht.accumulatedDeg, 10, 1e-6);
  ht.reset(); // se pierde la cara, y mientras tanto la cabeza gira a 30°
  cerca(ht.push(q(30)), 30, 1e-6, 'reanclado');
  assert.equal(ht.reanclajes, 1);
  cerca(ht.push(q(31)), 31, 1e-6, 'sigue acumulando');
  ht.reiniciar();
  cerca(ht.push(q(31)), 0, 1e-12, 'referencia nueva');
});

test('un hueco de cara dentro del pulso lo rechaza', () => {
  const bueno = corre({ fps: 60, pk: 200, ganancia: 1 });
  assert.equal(bueno.rejected, null);
  const conHueco = analyzeTrial(bueno.samples.filter((s) => s.tMs < 120 || s.tMs > 260), CONFIG);
  assert.equal(conHueco.rejected, 'cara-perdida');
  assert.ok(conHueco.gapMs > 100);
});

test('iris chico y disconjugación se miden y el iris chico rechaza', () => {
  const bueno = corre({ fps: 60, pk: 200, ganancia: 1 });
  const s = bueno.samples.map((x, i) => ({ ...x, irisPx: i === 5 ? 3 : 9, vergMm: 0.2 + (i % 2) * 0.1 }));
  const t = analyzeTrial(s, CONFIG);
  assert.equal(t.irisPx, 3);
  assert.equal(t.rejected, 'iris-chico');
  cerca(t.disconjMm, 0.1, 1e-9);
  const ok = analyzeTrial(s.map((x) => ({ ...x, irisPx: 9 })), CONFIG);
  assert.equal(ok.rejected, null);
  assert.equal(analyzeTrial(bueno.samples, CONFIG).irisPx, null);
});

test('procesaCrudo da lo mismo que el pipeline en vivo y permite recalcular con otro k', async () => {
  const { procesaCrudo } = await import('../js/pipeline.js');
  const fps = 60;
  const crudo = [];
  for (let i = 0; i < Math.round(0.9 * fps); i++) {
    const t = i / fps - 0.3;
    const H = t < 0 ? 0 : headPos(t, 200);
    crudo.push({ t, yaw: H, offsetMm: R * (Math.sin(rad(0)) - K * Math.sin(rad(H))), blink: false, irisPx: 9, vergMm: 0 });
  }
  const model = new geom.EyeModel();
  model.kParallax = K;
  const tTrigger = 0.1;
  const a = procesaCrudo(crudo, tTrigger, model, { windowMs: 50, degree: 2 }, CONFIG);
  assert.equal(a.rejected, null);
  cerca(a.gain, 1, 0.01);
  assert.equal(a.tTrigger, tTrigger);
  assert.ok(a.samples[0].tMs >= -CONFIG.impulse.preTriggerMs - 1);
  assert.ok(a.samples[a.samples.length - 1].tMs <= CONFIG.impulse.windowMs + 1000 / fps);
  assert.ok(a.samples.every((s) => s.crudo && Number.isFinite(s.crudo.yaw)));

  const b = procesaCrudo(crudo, tTrigger, model, { windowMs: 50, degree: 2 }, CONFIG);
  assert.deepEqual(b.gain, a.gain, 'determinista');

  model.kParallax = 0;
  const c = procesaCrudo(crudo, tTrigger, model, { windowMs: 50, degree: 2 }, CONFIG);
  assert.ok(c.gain > 1.7, `sin paralaje se infla: ${c.gain}`);

  const d = procesaCrudo(crudo, tTrigger, model, { windowMs: 200, degree: 1 }, CONFIG);
  assert.ok(d.peakHeadDegS < a.peakHeadDegS, 'ventana ancha y grado 1 aplanan el pico');
});
