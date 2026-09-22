// Banco sintético: VOR perfecto y VOR deficitario, a 30 y 120 fps.
import * as geom from '../js/geom.js';
import { Differentiator } from '../js/signal.js';
import { analyzeTrial, CONFIG } from '../js/analysis.js';
import { HeadTracker, quatFromMatrix } from '../js/head.js';

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const K = 0.95;
const R = geom.EYE_ROTATION_RADIUS_MM;

// Impulso: velocidad gaussiana, pico `pk` °/s, sigma 40 ms, centrado en 150 ms.
function headVel(t, pk) {
  return pk * Math.exp(-(((t - 0.15) / 0.04) ** 2) / 2);
}
function headPos(t, pk) {
  // integral numérica simple
  let p = 0;
  for (let u = 0; u < t; u += 0.0005) p += headVel(u, pk) * 0.0005;
  return p;
}

function corre({ fps, pk, ganancia, ruidoMm = 0 }) {
  const model = new geom.EyeModel();
  model.kParallax = K;
  model.calibrated = true;
  const diff = new Differentiator(50, 2);
  const out = [];
  const dt = 1 / fps;
  for (let i = 0; i < Math.round(0.6 * fps); i++) {
    const t = i * dt;
    const H = headPos(t, pk); // yaw en grados
    // Con ganancia g, la mirada en el espacio deriva (1-g) de lo que giró la cabeza.
    const phi = (1 - ganancia) * H;
    const offset = R * (Math.sin(rad(phi)) - K * Math.sin(rad(H))) + (Math.random() - 0.5) * ruidoMm;
    const gaze = model.gazeAzimuthDeg({ offsetMm: offset, pxPerMm: 30 }, H);
    const d = diff.push({ t, headDeg: H, gazeDeg: gaze });
    if (d) out.push({ tMs: d.t * 1000, t: d.t, headPos: d.headDeg, gazePos: d.gazeDeg, headVel: d.headVel, gazeVel: d.gazeVel, blink: false });
  }
  return analyzeTrial(out, CONFIG);
}

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
  const muestras = [];
  for (let i = 0; i < 120; i++) {
    const H = 25 * Math.sin((i / 120) * 4 * Math.PI);
    const phi0 = 3; // objetivo a 3 grados
    muestras.push([R * (Math.sin(rad(phi0)) - K * Math.sin(rad(H))) + (Math.random() - 0.5) * 0.04, H]);
  }
  const f = geom.fitParallax(muestras, R);
  console.log(`k=${f.kParallax.toFixed(3)} (real ${K}) objetivo=${f.targetAzimuthDeg.toFixed(2)}° residuo=${f.residualDeg.toFixed(2)}° rango=${f.headRangeDeg.toFixed(0)}° issue=${f.issue}`);
}

console.log('\n--- HeadTracker con la cabeza inclinada 30° ---');
{
  // matriz column-major de una rotación: pitch 30° y luego yaw propio de 10°
  const mat = (q) => {
    const [x, y, z, w] = q;
    return [
      1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
      2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
      2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
      0, 0, 0, 1,
    ];
  };
  const axisAngle = (ax, ang) => {
    const s = Math.sin(ang / 2);
    return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)];
  };
  const mul = (a, b) => {
    const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
    return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
  };
  const rot = (q, v) => {
    const [x, y, z, w] = q;
    const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
    return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
  };
  const inclinada = axisAngle([1, 0, 0], rad(30));
  const ejeCabeza = rot(inclinada, [0, 1, 0]);
  const girada = mul(axisAngle(ejeCabeza, rad(12)), inclinada);
  const ht = new HeadTracker('lateral');
  ht.push(quatFromMatrix(mat(inclinada)));
  const a = ht.push(quatFromMatrix(mat(girada)));
  console.log(`giro sobre el eje propio: ${a.toFixed(2)}° (esperado 12.00)`);
  // Un cabeceo puro no tiene que aportar nada al canal lateral.
  const cabeceo = mul(axisAngle(rot(inclinada, [1, 0, 0]), rad(12)), inclinada);
  const ht2 = new HeadTracker('lateral');
  ht2.push(quatFromMatrix(mat(inclinada)));
  console.log(`cabeceo puro: ${ht2.push(quatFromMatrix(mat(cabeceo))).toFixed(2)}° (esperado 0.00)`);
}
