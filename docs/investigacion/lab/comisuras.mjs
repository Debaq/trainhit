// ¿Las comisuras de MediaPipe están fijas en el cráneo? Posición de la comisura
// (punto medio) contra la nariz, en mm, por cada grado de cabeza. Si están fijas,
// la pendiente sale igual fijando la cámara (el ojo gira en la órbita) que
// mirando el pulgar (el ojo quieto en la órbita). Si cambia, el ojo las arrastra.
import { readFileSync } from 'node:fs';
const R = new URL('../../../js/', import.meta.url).href;
const geom = await import(R + 'geom.js');
const head = await import(R + 'head.js');
head.CANAL_AXIS.cabeceo = [1, 0, 0];
const datos = JSON.parse(readFileSync('grab2.json', 'utf8'));
const fases = readFileSync('fases2.txt', 'utf8').trim().split('\n').map((l) => l.split(' ')).map(([n, t]) => ({ n, t: +t }));
const yT = new head.HeadTracker('lateral'), pT = new head.HeadTracker('cabeceo');
const OJ = [[468, [469, 470, 471, 472], 33, 133], [473, [474, 475, 476, 477], 362, 263]];
const fr = [];
for (const d of datos) {
  if (!d.p) { yT.reset(); pT.reset(); continue; }
  const P = (i) => ({ x: d.p[i][0] * d.w, y: d.p[i][1] * d.h });
  const q = head.quatFromMatrix(d.m);
  const f = { t: d.t, yaw: yT.push(q), pitch: pT.push(q), ch: 0, cv: 0, ih: 0, iv: 0 };
  for (const [c, b, o, n] of OJ) {
    const h = geom.observeEye(P(c), b.map(P), P(o), P(n));
    const out = P(o), inn = P(n);
    let ux = inn.x - out.x, uy = inn.y - out.y; const L = Math.hypot(ux, uy); ux /= L; uy /= L;
    let vx = -uy, vy = ux; if (vy < 0) { vx = -vx; vy = -vy; }
    const mid = { x: (out.x + inn.x) / 2, y: (out.y + inn.y) / 2 }, nar = P(4);
    f.ch += ((mid.x - nar.x) * ux + (mid.y - nar.y) * uy) / h.pxPerMm / 2;
    f.cv += -((mid.x - nar.x) * vx + (mid.y - nar.y) * vy) / h.pxPerMm / 2;
    f.ih += ((P(c).x - nar.x) * ux + (P(c).y - nar.y) * uy) / h.pxPerMm / 2;
    f.iv += -((P(c).x - nar.x) * vx + (P(c).y - nar.y) * vy) / h.pxPerMm / 2;
  }
  fr.push(f);
}
const DURA = { cal_v: 12, cal_h: 12, vors_v: 12, vors_h: 12, cal_v2: 10 };
const fase = (n) => { const i = fases.findIndex((f) => f.n === n); return fr.filter((f) => f.t > fases[i].t + 0.8 && f.t < Math.min(fases[i + 1].t - 0.2, fases[i].t + DURA[n])); };
const pend = (s, y, x) => { const n = s.length, mx = s.reduce((a, f) => a + f[x], 0) / n, my = s.reduce((a, f) => a + f[y], 0) / n; let sxy = 0, sxx = 0; for (const f of s) { sxy += (f[x] - mx) * (f[y] - my); sxx += (f[x] - mx) ** 2; } return sxy / sxx; };
const f3 = (x) => x.toFixed(3);
console.log('mm por grado de cabeza, contra la nariz:        comisuras   iris   iris−comisuras');
for (const [n, cab, c, i] of [['cal_h', 'yaw', 'ch', 'ih'], ['vors_h', 'yaw', 'ch', 'ih'], ['cal_v', 'pitch', 'cv', 'iv'], ['vors_v', 'pitch', 'cv', 'iv'], ['cal_v2', 'pitch', 'cv', 'iv']]) {
  const s = fase(n), a = pend(s, c, cab), b = pend(s, i, cab);
  console.log(`  ${n.padEnd(7)} (${cab.padEnd(5)})                        ${f3(a).padStart(7)}  ${f3(b).padStart(7)}  ${f3(b - a).padStart(7)}`);
}
console.log(`un giro del ojo en la órbita de 1° corre el iris ${f3((10.5 * Math.PI) / 180)} mm`);
