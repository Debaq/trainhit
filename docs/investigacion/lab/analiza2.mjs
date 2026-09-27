// node analiza2.mjs grab2.json fases2.txt: ¿el método distingue ganancia 0 de 1?
//
// Con cada referencia (comisuras, nariz) se calibra una recta fijando la
// cámara: offset_mm = b + m·sin(H). Después, la mirada en el espacio relativa
// al blanco es asin((offset − b − m·sin H)/R). Fijando el pulgar que se mueve
// con la cabeza, la mirada sigue a la cabeza: la pendiente de la mirada contra
// la cabeza tiene que dar 1 (ganancia 0). Fijando la cámara, 0 (ganancia 1).
import { readFileSync } from 'node:fs';
const R = new URL('../../../js/', import.meta.url).href;
const geom = await import(R + 'geom.js');
const head = await import(R + 'head.js');
const { procesaCrudo } = await import(R + 'pipeline.js');
const { CONFIG } = await import(R + 'analysis.js');
const { Differentiator } = await import(R + 'signal.js');
head.CANAL_AXIS.cabeceo = [1, 0, 0];
const RMM = geom.EYE_ROTATION_RADIUS_MM;
const deg = (r) => (r * 180) / Math.PI, rad = (d) => (d * Math.PI) / 180;
const f2 = (x, n = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(n));
const [, , archivo, archFases] = process.argv;
const datos = JSON.parse(readFileSync(archivo, 'utf8'));
const fases = readFileSync(archFases, 'utf8').trim().split('\n').map((l) => l.split(' ')).map(([n, t]) => ({ n, t: +t }));
const DURA = { quieto: 4, cal_v: 12, cal_h: 12, vors_v: 12, vors_h: 12, vors_v_rapido: 12, cal_v2: 10 };
const OJ = { D: [468, [469, 470, 471, 472], 33, 133, 159, 145], I: [473, [474, 475, 476, 477], 362, 263, 386, 374] };

const yT = new head.HeadTracker('lateral'), pT = new head.HeadTracker('cabeceo');
const fr = [];
for (const d of datos) {
  if (!d.p) { yT.reset(); pT.reset(); continue; }
  const P = (i) => ({ x: d.p[i][0] * d.w, y: d.p[i][1] * d.h });
  const q = head.quatFromMatrix(d.m);
  const f = { t: d.t, yaw: yT.push(q), pitch: pT.push(q) };
  let ok = true, blink = 0;
  const acc = { h: 0, vCom: 0, vNar: 0, hNar: 0, r: Infinity };
  for (const [c, bor, o, n, u, w] of Object.values(OJ)) {
    const h = geom.observeEye(P(c), bor.map(P), P(o), P(n));
    if (!h) { ok = false; break; }
    const out = P(o), inn = P(n);
    let ux = inn.x - out.x, uy = inn.y - out.y; const L = Math.hypot(ux, uy); ux /= L; uy /= L;
    let vx = -uy, vy = ux; if (vy < 0) { vx = -vx; vy = -vy; }
    const mid = { x: (out.x + inn.x) / 2, y: (out.y + inn.y) / 2 };
    const pv = (p, ref) => -((p.x - ref.x) * vx + (p.y - ref.y) * vy) / h.pxPerMm;
    const ph = (p, ref) => ((p.x - ref.x) * ux + (p.y - ref.y) * uy) / h.pxPerMm;
    acc.h += h.offsetMm / 2;
    acc.vCom += pv(P(c), mid) / 2;
    acc.vNar += pv(P(c), P(4)) / 2;
    acc.hNar += ph(P(c), P(4)) / 2;
    acc.r = Math.min(acc.r, h.radiusPx);
    blink = Math.max(blink, geom.blinkScore(geom.eyelidOpenness(P(u), P(w), out, inn) ?? geom.EYE_OPEN_REF));
  }
  if (ok) fr.push({ ...f, ...acc, blinkScore: blink });
}
const fase = (n) => {
  const i = fases.findIndex((f) => f.n === n);
  const t0 = fases[i].t + 0.8, t1 = Math.min((fases[i + 1]?.t ?? 1e9) - 0.2, fases[i].t + (DURA[n] ?? 1e9));
  return fr.filter((f) => f.t >= t0 && f.t <= t1 && f.blinkScore <= CONFIG.blinkScore);
};
function recta(xs, ys) {
  const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
  const m = sxy / sxx, b = my - m * mx;
  const res = Math.sqrt(ys.reduce((a, y, i) => a + (y - m * xs[i] - b) ** 2, 0) / n);
  let syy = 0; for (const y of ys) syy += (y - my) ** 2;
  return { m, b, res, r2: 1 - (res * res * n) / syy };
}
const calibra = (s, campo, cab) => recta(s.map((f) => Math.sin(rad(f[cab]))), s.map((f) => f[campo]));
const mirada = (cal, f, campo, cab) => deg(Math.asin(Math.max(-1, Math.min(1, (f[campo] - cal.b - cal.m * Math.sin(rad(f[cab]))) / RMM))));

console.log(`cuadros útiles ${fr.length}/${datos.length}; radio iris ${f2(fr.reduce((a, f) => a + f.r, 0) / fr.length, 1)} px`);
const CASOS = [
  { nombre: 'vertical, comisuras', campo: 'vCom', cab: 'pitch', cal: 'cal_v', vors: 'vors_v', otra: 'cal_v2', rap: 'vors_v_rapido' },
  { nombre: 'vertical, nariz', campo: 'vNar', cab: 'pitch', cal: 'cal_v', vors: 'vors_v', otra: 'cal_v2', rap: 'vors_v_rapido' },
  { nombre: 'horizontal, comisuras (la app)', campo: 'h', cab: 'yaw', cal: 'cal_h', vors: 'vors_h' },
  { nombre: 'horizontal, nariz', campo: 'hNar', cab: 'yaw', cal: 'cal_h', vors: 'vors_h' },
];
for (const c of CASOS) {
  const sc = fase(c.cal);
  const cal = calibra(sc, c.campo, c.cab);
  const rango = (s) => { const xs = s.map((f) => f[c.cab]).sort((a, b) => a - b); return xs.at(-1) - xs[0]; };
  console.log(`\n== ${c.nombre}`);
  console.log(`  calibración (${c.cal}): pendiente ${f2(cal.m)} mm por sin, k ${f2(-cal.m / RMM)}, residuo ${f2(cal.res)} mm = ${f2(deg(cal.res / RMM))}°, rango cabeza ${f2(rango(sc), 1)}°, n ${sc.length}`);
  const prueba = (n, esperado) => {
    const s = fase(n);
    if (s.length < 20) return console.log(`  ${n}: pocas muestras (${s.length})`);
    const r = recta(s.map((f) => f[c.cab]), s.map((f) => mirada(cal, f, c.campo, c.cab)));
    console.log(`  ${n.padEnd(14)} mirada/cabeza ${f2(r.m)} → ganancia ${f2(1 - r.m)} (esperada ${esperado}); r² ${f2(r.r2)}, residuo ${f2(r.res)}°, rango cabeza ${f2(rango(s), 1)}°, n ${s.length}`);
  };
  prueba(c.vors, '0');
  if (c.otra) prueba(c.otra, '1');
  if (c.rap) {
    // ganancia de los cabeceos rápidos con el motor de la app (esperada 0)
    const s = fase(c.rap);
    const model = new geom.EyeModel();
    model.kParallax = -cal.m / RMM;
    model.calibrated = true;
    const crudo = s.map((f) => ({ t: f.t, yaw: f[c.cab], offsetMm: f[c.campo] - cal.b, blinkScore: f.blinkScore, irisPx: f.r }));
    const diff = new Differentiator(50, 2);
    let ultimo = -9; const trig = [];
    for (const x of crudo) {
      const d = diff.push({ t: x.t, headDeg: x.yaw, gazeDeg: 0 });
      if (d && Math.abs(d.headVel) > CONFIG.impulse.onDegS && d.t - ultimo > 1.1) { trig.push(d.t); ultimo = d.t; }
    }
    const flojo = { ...CONFIG, accept: { ...CONFIG.accept, peakMinDegS: 60 } };
    const g = [], rech = {};
    for (const t of trig) {
      const tr = procesaCrudo(crudo.filter((x) => x.t >= t - 0.4 && x.t <= t + 1), t, model, { windowMs: 50, degree: 2 }, flojo);
      if (!tr) continue;
      if (tr.rejected) rech[tr.rejected] = (rech[tr.rejected] ?? 0) + 1;
      else g.push(tr);
    }
    console.log(`  ${c.rap}: ${trig.length} disparos, rechazados ${JSON.stringify(rech)}; ganancias (esperadas ~0): ${g.map((t) => `${t.side === 'derecha' ? 'arriba' : 'abajo'} ${f2(t.gain)} @${f2(t.peakHeadDegS, 0)}°/s`).join(', ') || '—'}`);
  }
}
