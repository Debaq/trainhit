// Vuelca las series de una fase a CSV: t, yaw, pitch, h, v468, ap
import { readFileSync, writeFileSync } from 'node:fs';
const R = new URL('../../../js/', import.meta.url).href;
const geom = await import(R + 'geom.js');
const head = await import(R + 'head.js');
head.CANAL_AXIS.cabeceo = [1, 0, 0];
const datos = JSON.parse(readFileSync('grab.json', 'utf8'));
const yT = new head.HeadTracker('lateral'), pT = new head.HeadTracker('cabeceo');
const OJ = [[468, [469, 470, 471, 472], 33, 133, 159, 145], [473, [474, 475, 476, 477], 362, 263, 386, 374]];
let out = 't,yaw,pitch,h,v,ap,vD,vI\n';
for (const d of datos) {
  const P = (i) => ({ x: d.p[i][0] * d.w, y: d.p[i][1] * d.h });
  const q = head.quatFromMatrix(d.m);
  const yaw = yT.push(q), pitch = pT.push(q);
  const r = OJ.map(([c, b, o, n, u, w]) => {
    const h = geom.observeEye(P(c), b.map(P), P(o), P(n));
    const out = P(o), inn = P(n);
    let ux = inn.x - out.x, uy = inn.y - out.y; const L = Math.hypot(ux, uy); ux /= L; uy /= L;
    let vx = -uy, vy = ux; if (vy < 0) { vx = -vx; vy = -vy; }
    const mid = { x: (out.x + inn.x) / 2, y: (out.y + inn.y) / 2 };
    const v = -((P(c).x - mid.x) * vx + (P(c).y - mid.y) * vy) / h.pxPerMm;
    return { h: h.offsetMm, v, ap: geom.eyelidOpenness(P(u), P(w), out, inn) };
  });
  out += [d.t, yaw, pitch, (r[0].h + r[1].h) / 2, (r[0].v + r[1].v) / 2, (r[0].ap + r[1].ap) / 2, r[0].v, r[1].v].map((x) => x.toFixed(4)).join(',') + '\n';
}
writeFileSync('series.csv', out);
