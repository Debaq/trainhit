// Banco sintético: imprime lo que el motor devuelve sobre impulsos con
// ganancia conocida. Para ver números; los tests con assert están en
// `motor.test.mjs` (`npm test`).
import * as geom from '../js/geom.js';
import { Differentiator } from '../js/signal.js';
import { analyzeTrial, CONFIG } from '../js/analysis.js';
import { HeadTracker, quatFromMatrix } from '../js/head.js';
import { K, R, corre, headPos, muestrasCalibracion, matDeQuat, axisAngle, qmul, qrot, rad } from './sintetico.mjs';

console.log('--- ganancia recuperada (esperado = la nominal) ---');
for (const fps of [30, 60, 120]) {
  for (const g of [1.0, 0.8, 0.4]) {
    const r = corre({ fps, pk: 200, ganancia: g });
    console.log(
      `fps=${fps} g_nom=${g.toFixed(2)} -> area=${r.gain?.toFixed(3)} pico=${r.gains?.peak?.toFixed(3)} ` +
        `vpico=${r.peakHeadDegS.toFixed(0)}°/s dur=${r.durationMs.toFixed(0)}ms lado=${r.side} ${r.rejected ?? 'ok'}`,
    );
  }
}

console.log('\n--- con ruido de landmark 0.05 mm, 30 fps ---');
for (const g of [1.0, 0.6]) {
  const gs = [];
  for (let i = 0; i < 20; i++) gs.push(corre({ fps: 30, pk: 200, ganancia: g, ruidoMm: 0.05 }).gain);
  const m = gs.reduce((a, b) => a + b, 0) / gs.length;
  const de = Math.sqrt(gs.reduce((a, b) => a + (b - m) ** 2, 0) / (gs.length - 1));
  console.log(`g_nom=${g} -> ${m.toFixed(3)} ± ${de.toFixed(3)}`);
}

console.log('\n--- sin calibrar (k=0) sobre VOR perfecto ---');
{
  const model = new geom.EyeModel(); // k = 0
  const diff = new Differentiator(50, 2);
  const out = [];
  for (let i = 0; i < 18; i++) {
    const t = i / 30;
    const H = headPos(t, 200);
    const offset = R * (0 - K * Math.sin(rad(H)));
    const d = diff.push({ t, headDeg: H, gazeDeg: model.gazeAzimuthDeg({ offsetMm: offset }, H) });
    if (d) out.push({ tMs: d.t * 1000, headPos: d.headDeg, gazePos: d.gazeDeg, headVel: d.headVel, gazeVel: d.gazeVel, blink: false });
  }
  console.log('ganancia leída:', analyzeTrial(out, CONFIG).gain?.toFixed(3), '(se espera ~1.9)');
}

console.log('\n--- fitParallax recupera k ---');
{
  const f = geom.fitParallax(muestrasCalibracion(), R);
  console.log(`k=${f.kParallax.toFixed(3)} (real ${K}) objetivo=${f.targetAzimuthDeg.toFixed(2)}° residuo=${f.residualDeg.toFixed(2)}° rango=${f.headRangeDeg.toFixed(0)}° issue=${f.issue}`);
}

console.log('\n--- HeadTracker con la cabeza inclinada 30° ---');
{
  const inclinada = axisAngle([1, 0, 0], rad(30));
  const ejeCabeza = qrot(inclinada, [0, 1, 0]);
  const girada = qmul(axisAngle(ejeCabeza, rad(12)), inclinada);
  const ht = new HeadTracker('lateral');
  ht.push(quatFromMatrix(matDeQuat(inclinada)));
  console.log(`giro sobre el eje propio: ${ht.push(quatFromMatrix(matDeQuat(girada))).toFixed(2)}° (esperado 12.00)`);
  const cabeceo = qmul(axisAngle(qrot(inclinada, [1, 0, 0]), rad(12)), inclinada);
  const ht2 = new HeadTracker('lateral');
  ht2.push(quatFromMatrix(matDeQuat(inclinada)));
  console.log(`cabeceo puro: ${ht2.push(quatFromMatrix(matDeQuat(cabeceo))).toFixed(2)}° (esperado 0.00)`);
}
