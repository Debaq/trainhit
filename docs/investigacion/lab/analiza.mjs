// node analiza.mjs datos.json [fases.txt]: ¿sirve la componente vertical del iris?
import { readFileSync, existsSync } from 'node:fs';
const R = new URL('../../../js/', import.meta.url).href;
const geom = await import(R + 'geom.js');
const head = await import(R + 'head.js');
const { procesaCrudo } = await import(R + 'pipeline.js');
const { CONFIG } = await import(R + 'analysis.js');
const { Differentiator } = await import(R + 'signal.js');

const [, , archivo, archFases] = process.argv;
const datos = JSON.parse(readFileSync(archivo, 'utf8'));
const fases = archFases && existsSync(archFases)
  ? readFileSync(archFases, 'utf8').trim().split('\n').map((l) => l.split(' ')).map(([n, t]) => ({ n, t: +t }))
  : [{ n: 'todo', t: 0 }, { n: 'fin', t: 1e9 }];
const RMM = geom.EYE_ROTATION_RADIUS_MM;
const deg = (r) => (r * 180) / Math.PI;
const OJOS = {
  der: { iris: 468, border: [469, 470, 471, 472], outer: 33, inner: 133, up: 159, down: 145 },
  izq: { iris: 473, border: [474, 475, 476, 477], outer: 362, inner: 263, up: 386, down: 374 },
};
head.CANAL_AXIS.cabeceo = [1, 0, 0];
// Ejes de los planos verticales, horizontales y a 45° (x lateral, z adelante).
// Cuál es LARP y cuál RALP depende de hacia dónde apunta x en MediaPipe: lo
// dicen los datos, según con qué cabeza girada domina cada uno.
head.CANAL_AXIS.diagA = [-Math.SQRT1_2, 0, Math.SQRT1_2];
head.CANAL_AXIS.diagB = [Math.SQRT1_2, 0, Math.SQRT1_2];

/** Un ojo: offsets horizontal y vertical (mm, vertical + = arriba) con tres centros. */
function mideOjo(P, o) {
  const c = P(o.iris), out = P(o.outer), inn = P(o.inner), b = o.border.map(P);
  const h = geom.observeEye(c, b, out, inn);
  if (!h) return null;
  let ux = inn.x - out.x, uy = inn.y - out.y;
  const L = Math.hypot(ux, uy); ux /= L; uy /= L;
  let vx = -uy, vy = ux;
  if (vy < 0) { vx = -vx; vy = -vy; } // v apunta hacia abajo en la imagen
  const mid = { x: (out.x + inn.x) / 2, y: (out.y + inn.y) / 2 };
  const pv = (p) => -((p.x - mid.x) * vx + (p.y - mid.y) * vy) / h.pxPerMm;
  const bv = b.map(pv).sort((a, z) => a - z);
  // los dos bordes extremos en vertical son arriba y abajo; los del medio, los costados
  const ap = geom.eyelidOpenness(P(o.up), P(o.down), out, inn);
  return {
    h: h.offsetMm, px: h.pxPerMm, r: h.radiusPx, ap,
    v468: pv(c), vBordes: (bv[0] + bv[3]) / 2, vLados: (bv[1] + bv[2]) / 2,
  };
}

const yawT = new head.HeadTracker('lateral');
const pitT = new head.HeadTracker('cabeceo');
const diaA = new head.HeadTracker('diagA');
const diaB = new head.HeadTracker('diagB');
const fr = [];
for (const d of datos) {
  if (!d.p) { yawT.reset(); pitT.reset(); diaA.reset(); diaB.reset(); continue; }
  const P = (i) => ({ x: d.p[i][0] * d.w, y: d.p[i][1] * d.h });
  const q = head.quatFromMatrix(d.m);
  const yaw = yawT.push(q), pitch = pitT.push(q), dA = diaA.push(q), dB = diaB.push(q);
  const a = mideOjo(P, OJOS.der), b = mideOjo(P, OJOS.izq);
  if (!a || !b) { fr.push({ t: d.t, falta: true }); continue; }
  const m = (k) => (a[k] + b[k]) / 2;
  const blinkScore = Math.max(geom.blinkScore(a.ap ?? geom.EYE_OPEN_REF), geom.blinkScore(b.ap ?? geom.EYE_OPEN_REF));
  fr.push({ t: d.t, yaw, pitch, h: m('h'), v468: m('v468'), vBordes: m('vBordes'), vLados: m('vLados'), ap: m('ap'), r: Math.min(a.r, b.r), blinkScore, vergH: a.h - b.h, vergV: a.v468 - b.v468, dA, dB, vD: a.v468, vI: b.v468, lD: a.vLados, lI: b.vLados, rD: a.r, rI: b.r });
}
const DURA = { yaw_lento: 16, pitch_lento: 16, pitch_rapido: 22, yaw_rapido: 18, larp_lento: 14, larp_rapido: 18, ralp_lento: 14, ralp_rapido: 18, ojos_vertical: 12 };
const fase = (n) => {
  const i = fases.findIndex((f) => f.n === n);
  if (i < 0) return [];
  // Las fases de movimiento se cortan en lo que duraba su espera en grabar.sh:
  // después viene la voz de la siguiente, y con ella el giro hacia la otra
  // posición, que no es parte de esta.
  const t0 = fases[i].t + 0.8;
  const t1 = Math.min((fases[i + 1]?.t ?? 1e9) - 0.2, fases[i].t + (DURA[n] ?? 1e9));
  return fr.filter((f) => !f.falta && f.t >= t0 && f.t <= t1);
};
const sd = (xs) => { const mu = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length); };
const aDeg = (mm) => deg(Math.asin(Math.max(-1, Math.min(1, mm / RMM))));
const f2 = (x, n = 2) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(n));
const sinP = (f) => f.blinkScore <= CONFIG.blinkScore;

console.log(`cuadros con cara: ${fr.filter((f) => !f.falta).length}/${datos.length}; radio iris ${f2(fr.filter((f) => !f.falta).reduce((a, f) => a + f.r, 0) / fr.filter((f) => !f.falta).length, 1)} px; fps ${f2((fr.length - 1) / (fr.at(-1).t - fr[0].t), 1)}`);

// 1. ruido quieto
for (const n of ['quieto', 'quieto2', 'quieto3', 'quieto4']) {
  const s = fase(n).filter(sinP);
  if (s.length < 10) continue;
  console.log(`[${n}] n=${s.length}  DE en grados: horiz ${f2(aDeg(sd(s.map((f) => f.h))))}  vert468 ${f2(aDeg(sd(s.map((f) => f.v468))))}  vBordes ${f2(aDeg(sd(s.map((f) => f.vBordes))))}  vLados ${f2(aDeg(sd(s.map((f) => f.vLados))))}  | cabeza DE yaw ${f2(sd(s.map((f) => f.yaw)))} pitch ${f2(sd(s.map((f) => f.pitch)))}`);
}

// 2. calibraciones lentas
const ajuste = (s, campo, cab) => geom.fitParallax(s.map((f) => [f[campo], f[cab]]), RMM);
const muestra = (fit, s, campo, cab) => {
  if (!fit) return 'sin ajuste';
  // mitades: cabeza por encima y por debajo de la mediana
  const med = [...s.map((f) => f[cab])].sort((a, b) => a - b)[s.length >> 1];
  const lo = ajuste(s.filter((f) => f[cab] < med), campo, cab), hi = ajuste(s.filter((f) => f[cab] >= med), campo, cab);
  return `k ${f2(fit.kParallax)}  residuo ${f2(fit.residualDeg)}°  rango ${f2(fit.headRangeDeg, 1)}°  n ${fit.samples}  | k mitad baja ${f2(lo?.kParallax)} alta ${f2(hi?.kParallax)}  ${fit.issue ?? 'aceptable'}`;
};
const cal = {};
{
  const s = fase('yaw_lento').filter(sinP);
  cal.h = ajuste(s, 'h', 'yaw');
  console.log(`[yaw_lento] horizontal: ${muestra(cal.h, s, 'h', 'yaw')}   (cabeceo en la fase: DE ${f2(sd(s.map((f) => f.pitch)))}°)`);
}
{
  const s = fase('pitch_lento').filter(sinP);
  for (const c of ['v468', 'vBordes', 'vLados']) {
    cal[c] = ajuste(s, c, 'pitch');
    console.log(`[pitch_lento] ${c.padEnd(7)}: ${muestra(cal[c], s, c, 'pitch')}`);
  }
  console.log(`   (yaw en la fase: DE ${f2(sd(s.map((f) => f.yaw)))}°; apertura del párpado vs cabeceo r=${f2(corr(s.map((f) => f.ap), s.map((f) => f.pitch)))})`);
}
function corr(a, b) {
  const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return sab / Math.sqrt(saa * sbb);
}

// 3. impulsos, con el motor de la app
function impulsos(nombre, campo, cab, fit, cfg = CONFIG) {
  const s = fase(nombre);
  if (!s.length || !fit) return;
  const model = new geom.EyeModel();
  model.kParallax = fit.kParallax;
  model.calibrated = true;
  const crudo = s.map((f) => ({ t: f.t, yaw: f[cab], offsetMm: f[campo], blinkScore: f.blinkScore, irisPx: f.r }));
  // disparos: la velocidad de la cabeza cruza el umbral de inicio
  const diff = new Differentiator(50, 2);
  const trig = [];
  let ultimo = -1;
  for (const c of crudo) {
    const d = diff.push({ t: c.t, headDeg: c.yaw, gazeDeg: 0 });
    if (!d) continue;
    if (Math.abs(d.headVel) > CONFIG.impulse.onDegS && d.t - ultimo > (CONFIG.impulse.windowMs + CONFIG.impulse.refractoryMs) / 1000) {
      trig.push(d.t); ultimo = d.t;
    }
  }
  const res = { derecha: [], izquierda: [] };
  const rech = {};
  for (const t of trig) {
    const tr = procesaCrudo(crudo.filter((c) => c.t >= t - 0.4 && c.t <= t + 1), t, model, { windowMs: 50, degree: 2 }, cfg);
    if (!tr) continue;
    if (tr.rejected) { rech[tr.rejected] = (rech[tr.rejected] ?? 0) + 1; continue; }
    res[tr.side].push(tr);
  }
  const lado = (xs) => xs.length ? `n ${xs.length}  ganancia media ${f2(xs.reduce((a, t) => a + t.gain, 0) / xs.length)}  (${xs.map((t) => f2(t.gain)).join(' ')})  pico ${f2(xs.reduce((a, t) => a + t.peakHeadDegS, 0) / xs.length, 0)}°/s  sacadas ${xs.filter((t) => t.sacadas?.length).length}` : 'n 0';
  console.log(`[${nombre}] ${campo}: ${trig.length} disparos; rechazados ${JSON.stringify(rech)}`);
  console.log(`   lado "derecha": ${lado(res.derecha)}`);
  console.log(`   lado "izquierda": ${lado(res.izquierda)}`);
}
impulsos('yaw_rapido', 'h', 'yaw', cal.h);
// Los cabeceos activos salen más lentos: además del corte de la app (120 °/s)
// se miran con un pico mínimo de 80 °/s.
const flojo = { ...CONFIG, accept: { ...CONFIG.accept, peakMinDegS: 80 } };
for (const c of ['v468', 'vBordes', 'vLados']) impulsos('pitch_rapido', c, 'pitch', cal[c], flojo);

// 4. cabeza girada 45°: ¿qué eje explica el movimiento y qué ojo se sigue?
for (const pos of ['larp', 'ralp']) {
  const nL = `${pos}_lento`, nR = `${pos}_rapido`;
  const i = fases.findIndex((f) => f.n === nL);
  if (i < 0) continue;
  const fin = fases[i + 1].t + DURA[nR];
  const todos = datos.filter((d) => d.t >= fases[i].t + 0.8 && d.t <= fin);
  const s = fase(nL).filter(sinP);
  const conCara = fr.filter((f) => !f.falta && f.t >= fases[i].t + 0.8 && f.t <= fin).length;
  console.log(`[${pos}] cuadros con los dos ojos: ${conCara}/${todos.length}; yaw medio ${f2(s.reduce((a, f) => a + f.yaw, 0) / s.length, 1)}°; radio iris der ${f2(s.reduce((a, f) => a + f.rD, 0) / s.length, 1)} izq ${f2(s.reduce((a, f) => a + f.rI, 0) / s.length, 1)} px`);
  if (s.length < 20) continue;
  const rango = (k) => { const xs = s.map((f) => f[k]).sort((a, b) => a - b); return xs[Math.floor(xs.length * 0.95)] - xs[Math.floor(xs.length * 0.05)]; };
  console.log(`   rango de la cabeza (5–95 %): cabeceo ${f2(rango('pitch'), 1)}°  diagA ${f2(rango('dA'), 1)}°  diagB ${f2(rango('dB'), 1)}°  yaw ${f2(rango('yaw'), 1)}°`);
  let mejor = null;
  for (const eje of ['pitch', 'dA', 'dB']) {
    for (const ojo of ['v468', 'vD', 'vI', 'lD', 'lI']) {
      const fit = ajuste(s, ojo, eje);
      if (!fit) continue;
      console.log(`   ${eje.padEnd(5)} ${ojo.padEnd(4)}: k ${f2(fit.kParallax)}  residuo ${f2(fit.residualDeg)}°  rango ${f2(fit.headRangeDeg, 1)}°`);
      if (fit.headRangeDeg > 8 && (!mejor || fit.residualDeg < mejor.fit.residualDeg)) mejor = { eje, ojo, fit };
    }
  }
  if (mejor) {
    console.log(`   mejor: ${mejor.eje} con ${mejor.ojo}`);
    impulsos(nR, mejor.ojo, mejor.eje, mejor.fit, flojo);
  }
}

// 5. solo ojos, cabeza quieta
{
  const s = fase('ojos_vertical').filter(sinP);
  if (s.length) {
    const rango = (k) => { const xs = s.map((f) => f[k]).sort((a, b) => a - b); return aDeg(xs[Math.floor(xs.length * 0.95)]) - aDeg(xs[Math.floor(xs.length * 0.05)]); };
    console.log(`[ojos_vertical] rango 5–95 % en grados: v468 ${f2(rango('v468'), 1)}  vBordes ${f2(rango('vBordes'), 1)}  vLados ${f2(rango('vLados'), 1)}  horiz ${f2(rango('h'), 1)} | apertura vs v468 r=${f2(corr(s.map((f) => f.ap), s.map((f) => f.v468)))} | cabeza DE pitch ${f2(sd(s.map((f) => f.pitch)))}°`);
  }
}
