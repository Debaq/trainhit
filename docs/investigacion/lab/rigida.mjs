// ¿Qué referencia deja ver el giro del ojo? Varias referencias "fijas al
// cráneo" contra la de la app (el punto medio de las comisuras). Para cada una:
// calibración fijando la cámara (recta b + m·sin H), y con esa recta la
// ganancia mirando el pulgar (esperada 0) y en la segunda calibración (1).
import { readFileSync } from 'node:fs';
const R = new URL('../../../js/', import.meta.url).href;
const geom = await import(R + 'geom.js');
const head = await import(R + 'head.js');
const { CONFIG } = await import(R + 'analysis.js');
head.CANAL_AXIS.cabeceo = [1, 0, 0];
const RMM = geom.EYE_ROTATION_RADIUS_MM;
const deg = (r) => (r * 180) / Math.PI, rad = (d) => (d * Math.PI) / 180;
const [, , archivo = 'grab2t.json', archFases = 'fases2.txt'] = process.argv;
const datos = JSON.parse(readFileSync(archivo, 'utf8'));
const fases = readFileSync(archFases, 'utf8').trim().split('\n').map((l) => l.split(' ')).map(([n, t]) => ({ n, t: +t }));
const OJ = [
  { iris: 468, borde: [469, 470, 471, 472], out: 33, inn: 133, up: 159, down: 145 },
  { iris: 473, borde: [474, 475, 476, 477], out: 362, inn: 263, up: 386, down: 374 },
];
// Puntos de la malla lejos de párpados y cejas: puente de la nariz, nariz,
// frente, pómulos y sienes.
const PUENTE = [168, 6, 197, 195];
const RIGIDOS = [168, 6, 197, 195, 5, 4, 1, 10, 151, 9, 116, 345, 123, 352, 21, 251, 54, 284, 103, 332];

/** Afín 2D por mínimos cuadrados: de los puntos `a` a los `b`. */
function afin(a, b) {
  // normales: [Σxx Σxy Σx; Σxy Σyy Σy; Σx Σy n] · [p q r] = [Σx·u …]
  let sxx = 0, sxy = 0, syy = 0, sx = 0, sy = 0, n = a.length;
  const su = [0, 0, 0], sv = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const [x, y] = a[i], [u, v] = b[i];
    sxx += x * x; sxy += x * y; syy += y * y; sx += x; sy += y;
    su[0] += x * u; su[1] += y * u; su[2] += u;
    sv[0] += x * v; sv[1] += y * v; sv[2] += v;
  }
  const M = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
  const resuelve = (r) => {
    const A = M.map((f, i) => [...f, r[i]]);
    for (let c = 0; c < 3; c++) {
      let p = c; for (let f = c + 1; f < 3; f++) if (Math.abs(A[f][c]) > Math.abs(A[p][c])) p = f;
      [A[c], A[p]] = [A[p], A[c]];
      for (let f = 0; f < 3; f++) if (f !== c) { const k = A[f][c] / A[c][c]; for (let j = c; j < 4; j++) A[f][j] -= k * A[c][j]; }
    }
    return A.map((f, i) => f[3] / f[i]);
  };
  const pu = resuelve(su), pv = resuelve(sv);
  return ([x, y]) => [pu[0] * x + pu[1] * y + pu[2], pv[0] * x + pv[1] * y + pv[2]];
}

const pts = (d) => { const P = (i) => [d.a[3 * i] * d.w, d.a[3 * i + 1] * d.h]; return P; };
// cuadro de referencia para la afín: mitad de la fase quieta
const iq = fases.find((f) => f.n === 'quieto').t + 2;
const ref = datos.find((d) => d.a && d.t >= iq);
const Pref = pts(ref);

const METODOS = ['comisuras', 'puente168', 'puente', 'rigidos', 'comisuraRigida'];
const yT = new head.HeadTracker('lateral'), pT = new head.HeadTracker('cabeceo');
const fr = [];
for (const d of datos) {
  if (!d.a) { yT.reset(); pT.reset(); continue; }
  const P = pts(d);
  const q = head.quatFromMatrix(d.m);
  const f = { t: d.t, yaw: yT.push(q), pitch: pT.push(q), blink: 0 };
  const T = afin(RIGIDOS.map(Pref), RIGIDOS.map(P));
  const media = (idx) => { const s = idx.map(P); return [s.reduce((a, p) => a + p[0], 0) / s.length, s.reduce((a, p) => a + p[1], 0) / s.length]; };
  for (const m of METODOS) { f['h' + m] = 0; f['v' + m] = 0; }
  for (const o of OJ) {
    const I = P(o.iris);
    const pxmm = Math.max(...o.borde.map((i) => Math.hypot(P(i)[0] - I[0], P(i)[1] - I[1]))) / (geom.IRIS_DIAMETER_MM / 2);
    f.blink = Math.max(f.blink, geom.blinkScore(geom.eyelidOpenness(...[o.up, o.down, o.out, o.inn].map((i) => ({ x: P(i)[0], y: P(i)[1] }))) ?? geom.EYE_OPEN_REF));
    // ejes: de las comisuras rígidas (las del cuadro de referencia llevadas por la afín)
    const cO = T(Pref(o.out)), cI = T(Pref(o.inn));
    let ux = cI[0] - cO[0], uy = cI[1] - cO[1]; const L = Math.hypot(ux, uy); ux /= L; uy /= L;
    let vx = -uy, vy = ux; if (vy < 0) { vx = -vx; vy = -vy; }
    const refs = {
      comisuras: [(P(o.out)[0] + P(o.inn)[0]) / 2, (P(o.out)[1] + P(o.inn)[1]) / 2],
      puente168: P(168),
      puente: media(PUENTE),
      rigidos: media(RIGIDOS),
      comisuraRigida: [(cO[0] + cI[0]) / 2, (cO[1] + cI[1]) / 2],
    };
    for (const [m, r] of Object.entries(refs)) {
      f['h' + m] += ((I[0] - r[0]) * ux + (I[1] - r[1]) * uy) / pxmm / 2;
      f['v' + m] += -((I[0] - r[0]) * vx + (I[1] - r[1]) * vy) / pxmm / 2;
    }
  }
  fr.push(f);
}
const DURA = { cal_v: 12, cal_h: 12, vors_v: 12, vors_h: 12, cal_v2: 10 };
const fase = (n) => { const i = fases.findIndex((f) => f.n === n); return fr.filter((f) => f.t > fases[i].t + 0.8 && f.t < Math.min(fases[i + 1].t - 0.2, fases[i].t + DURA[n]) && f.blink <= CONFIG.blinkScore); };
function recta(xs, ys) {
  const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  const m = sxy / sxx, b = my - m * mx, res = Math.sqrt(ys.reduce((a, y, i) => a + (y - m * xs[i] - b) ** 2, 0) / n);
  return { m, b, res, r2: 1 - (res * res * n) / syy };
}
const f2 = (x) => x.toFixed(2);
for (const [eje, cab, cal, vors, otra] of [['h', 'yaw', 'cal_h', 'vors_h', null], ['v', 'pitch', 'cal_v', 'vors_v', 'cal_v2']]) {
  console.log(`\n${eje === 'h' ? 'HORIZONTAL' : 'VERTICAL'}          residuo calib.   ganancia pulgar (0)   ${otra ? 'ganancia 2.ª calib. (1)' : ''}`);
  for (const m of METODOS) {
    const k = eje + m;
    const sc = fase(cal);
    const c = recta(sc.map((f) => Math.sin(rad(f[cab]))), sc.map((f) => f[k]));
    const g = (n) => {
      const s = fase(n);
      const r = recta(s.map((f) => f[cab]), s.map((f) => deg(Math.asin(Math.max(-1, Math.min(1, (f[k] - c.b - c.m * Math.sin(rad(f[cab]))) / RMM))))));
      return `${f2(1 - r.m)} (r² ${f2(r.r2)}, res ${f2(r.res)}°)`;
    };
    console.log(`  ${m.padEnd(15)} ${f2(deg(c.res / RMM)).padStart(6)}°        ${g(vors).padEnd(28)} ${otra ? g(otra) : ''}`);
  }
}
