// ¿Es el punto medio de las comisuras el que falla? Offset vertical del iris
// contra otros puntos de la cara, rígidos y lejos de los párpados.
import { readFileSync } from 'node:fs';
const R = new URL('../../../js/', import.meta.url).href;
const geom = await import(R + 'geom.js');
const head = await import(R + 'head.js');
head.CANAL_AXIS.cabeceo = [1, 0, 0];
const datos = JSON.parse(readFileSync('grab.json', 'utf8'));
const fases = Object.fromEntries(readFileSync('fases.txt', 'utf8').trim().split('\n').map((l) => l.split(' ')).map(([n, t]) => [n, +t]));
const pT = new head.HeadTracker('cabeceo');
const OJ = { D: [468, [469, 470, 471, 472], 33, 133, 159, 145], I: [473, [474, 475, 476, 477], 362, 263, 386, 374] };
const fr = [];
for (const d of datos) {
  const P = (i) => ({ x: d.p[i][0] * d.w, y: d.p[i][1] * d.h });
  const pitch = pT.push(head.quatFromMatrix(d.m));
  const f = { t: d.t, pitch };
  // eje vertical de la cara: de la frente (10) al mentón (152), rígido
  const a = P(10), b = P(152);
  let vx = b.x - a.x, vy = b.y - a.y; const L = Math.hypot(vx, vy); vx /= L; vy /= L;
  for (const [k, [c, bor, o, n, u, w]] of Object.entries(OJ)) {
    const h = geom.observeEye(P(c), bor.map(P), P(o), P(n));
    const pv = (p, ref) => -((p.x - ref.x) * vx + (p.y - ref.y) * vy) / h.pxPerMm;
    const mid = { x: (P(o).x + P(n).x) / 2, y: (P(o).y + P(n).y) / 2 };
    f['com' + k] = pv(P(c), mid);
    f['fre' + k] = pv(P(c), P(10));
    f['nar' + k] = pv(P(c), P(1));
    f['n4' + k] = pv(P(c), P(4));
    // la comisura misma contra la nariz: ¿se mueve con el párpado?
    f['cn' + k] = pv(mid, P(4));
    f['h' + k] = h.offsetMm;
    f['ap' + k] = geom.eyelidOpenness(P(u), P(w), P(o), P(n));
  }
  fr.push(f);
}
const tr = (n, dur) => fr.filter((f) => f.t > fases[n] + 0.8 && f.t < fases[n] + dur);
const fit = (s, k) => geom.fitParallax(s.map((f) => [f[k], f.pitch]), 10.5);
const f2 = (x) => (x == null ? '—' : x.toFixed(2));
const sl = tr('pitch_lento', 16).filter((f) => f.apD > 0.12 && f.apI > 0.12);
console.log('pitch_lento (fijando la cámara): k y residuo de cada referencia');
for (const k of ['comD', 'comI', 'freD', 'freI', 'narD', 'narI', 'n4D', 'n4I', 'cnD', 'cnI']) {
  const r = fit(sl, k);
  console.log(`  ${k.padEnd(5)} k ${f2(r.kParallax)}  residuo ${f2(r.residualDeg)}°`);
}
// ojos solos, cabeza quieta: niveles por tramo según la apertura
const ov = tr('ojos_vertical', 12);
const grupos = { arriba: (f) => f.apD > 0.36, medio: (f) => f.apD > 0.26 && f.apD < 0.32, abajo: (f) => f.apD < 0.16 };
console.log('ojos_vertical, media por grupo (mm; + = arriba):');
for (const [g, fn] of Object.entries(grupos)) {
  const s = ov.filter(fn);
  const m = (k) => f2(s.reduce((a, f) => a + f[k], 0) / s.length);
  console.log(`  ${g.padEnd(6)} n ${String(s.length).padEnd(4)} com ${m('comD')}/${m('comI')}  n4 ${m('n4D')}/${m('n4I')}  comisura-vs-nariz ${m('cnD')}/${m('cnI')}  horiz ${m('hD')}/${m('hI')}  apertura ${m('apD')}`);
}

// Recta en mm (sin asin, que satura con referencias lejanas): pendiente por
// mitades de cabeceo y residuo, contra la nariz (rígida) y las comisuras.
function recta(s, k) {
  const x = s.map((f) => Math.sin((f.pitch * Math.PI) / 180)), y = s.map((f) => f[k]);
  const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n;
  let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  const m = sxy / sxx, b = my - m * mx;
  const res = Math.sqrt(y.reduce((a, yi, i) => a + (yi - (m * x[i] + b)) ** 2, 0) / n);
  return { m, res };
}
console.log('pitch_lento en mm: pendiente (mm por sin) toda / cabeza abajo / cabeza arriba, residuo mm');
const med = [...sl.map((f) => f.pitch)].sort((a, b) => a - b)[sl.length >> 1];
for (const k of ['comD', 'comI', 'n4D', 'n4I', 'freD', 'freI', 'cnD', 'cnI']) {
  const a = recta(sl, k), lo = recta(sl.filter((f) => f.pitch < med), k), hi = recta(sl.filter((f) => f.pitch >= med), k);
  console.log(`  ${k.padEnd(5)} ${f2(a.m)} / ${f2(lo.m)} / ${f2(hi.m)}   residuo ${f2(a.res)} mm (${f2((a.res / 10.5) * 57.3)}°)`);
}
// y el signo del cabeceo: ¿pitch > 0 es mentón abajo? la apertura sube con los ojos arriba en la órbita
const r = (() => { const a = sl.map((f) => f.apD), b = sl.map((f) => f.pitch); const ma = a.reduce((x, y) => x + y) / a.length, mb = b.reduce((x, y) => x + y) / b.length; let s = 0, sa = 0, sb = 0; for (let i = 0; i < a.length; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return s / Math.sqrt(sa * sb); })();
console.log(`correlación apertura–pitch: ${f2(r)} (positiva: pitch > 0 = mentón abajo, ojos arriba en la órbita)`);
