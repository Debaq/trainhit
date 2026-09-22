// Gráficos en canvas. Nada de librerías: son cuatro dibujos y el punto de este
// repo es que se pueda leer lo que hace cada píxel.

export const COLOR = {
  cabeza: '#f2a33c',
  ojo: '#48d1cc',
  mirada: '#b980f0',
  derecha: '#ff5d7a',
  izquierda: '#4aa8ff',
  eje: '#3a4250',
  texto: '#9aa4b2',
  corte: '#6b7280',
  ok: '#4ade80',
};

/** Prepara el canvas para la densidad de pantalla y devuelve el contexto. */
export function prepara(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function mapper(x0, x1, y0, y1, pad, w, h) {
  const px = (x) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (w - pad.l - pad.r);
  const py = (y) => h - pad.b - ((y - y0) / (y1 - y0 || 1)) * (h - pad.t - pad.b);
  return { px, py };
}

function marco(ctx, w, h, pad, { xLabel, yLabel, x0, x1, y0, y1, yTicks = 4, xTicks = 4 }) {
  const { px, py } = mapper(x0, x1, y0, y1, pad, w, h);
  ctx.strokeStyle = COLOR.eje;
  ctx.fillStyle = COLOR.texto;
  ctx.lineWidth = 1;
  ctx.font = '10px ui-monospace, monospace';

  for (let i = 0; i <= yTicks; i++) {
    const v = y0 + ((y1 - y0) * i) / yTicks;
    const y = Math.round(py(v)) + 0.5;
    ctx.globalAlpha = v === 0 ? 0.8 : 0.3;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmt(v), pad.l - 4, y);
  }
  for (let i = 0; i <= xTicks; i++) {
    const v = x0 + ((x1 - x0) * i) / xTicks;
    const x = Math.round(px(v)) + 0.5;
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.moveTo(x, pad.t);
    ctx.lineTo(x, h - pad.b);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(fmt(v), x, h - pad.b + 4);
  }
  if (xLabel) {
    ctx.textAlign = 'right';
    ctx.fillText(xLabel, w - pad.r, h - 11);
  }
  if (yLabel) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(yLabel, pad.l, 2);
  }
  return { px, py };
}

function fmt(v) {
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  return v.toFixed(2);
}

function linea(ctx, pts, color, ancho = 1.5) {
  if (pts.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = ancho;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}

/**
 * Traza en vivo: velocidad de cabeza y velocidad ocular COMPENSATORIA (o sea,
 * el ojo dibujado del mismo signo que la cabeza). Con VOR perfecto las dos
 * curvas se superponen: eso es lo que hay que aprender a mirar.
 */
export function trazaViva(canvas, muestras, { segundos = 6, escala = 300 } = {}) {
  const { ctx, w, h } = prepara(canvas);
  const pad = { l: 38, r: 8, t: 14, b: 18 };
  const tNow = muestras.length ? muestras[muestras.length - 1].t : 0;
  const t0 = tNow - segundos;
  const { px, py } = marco(ctx, w, h, pad, {
    x0: t0,
    x1: tNow,
    y0: -escala,
    y1: escala,
    xLabel: 's',
    yLabel: '°/s',
  });

  const vis = muestras.filter((s) => s.t >= t0);
  linea(ctx, vis.map((s) => [px(s.t), py(s.headVel)]), COLOR.cabeza);
  // Compensatoria = velocidad de cabeza menos deriva de la mirada en el espacio.
  linea(ctx, vis.map((s) => [px(s.t), py(s.headVel - s.gazeVel)]), COLOR.ojo);
}

/** Un pulso: cabeza y ojo compensatorio, con la ventana del impulso sombreada. */
export function dibujaPulso(canvas, trial, cfg) {
  const { ctx, w, h } = prepara(canvas);
  const pad = { l: 38, r: 8, t: 14, b: 18 };
  if (!trial) {
    ctx.fillStyle = COLOR.texto;
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('sin pulsos todavía', w / 2, h / 2);
    return;
  }
  const s = trial.samples;
  const pico = Math.max(200, Math.ceil(trial.peakHeadDegS / 100) * 100 + 50);
  const { px, py } = marco(ctx, w, h, pad, {
    x0: s[0].tMs,
    x1: s[s.length - 1].tMs,
    y0: -pico,
    y1: pico,
    xLabel: 'ms',
    yLabel: '°/s',
  });

  if (trial.core) {
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(px(trial.tOnsetMs), pad.t, px(trial.tOffsetMs) - px(trial.tOnsetMs), h - pad.t - pad.b);
  }
  // Umbrales de on/off, que es lo que decide dónde empieza y termina el impulso.
  const sign = trial.side === 'derecha' ? 1 : -1;
  for (const [v, c] of [[cfg.impulse.onDegS * sign, '#555'], [cfg.impulse.offDegS * sign, '#444']]) {
    ctx.strokeStyle = c;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(pad.l, py(v));
    ctx.lineTo(w - pad.r, py(v));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  linea(ctx, s.map((m) => [px(m.tMs), py(m.headVel)]), COLOR.cabeza);
  linea(ctx, s.map((m) => [px(m.tMs), py(m.headVel - m.gazeVel)]), COLOR.ojo);
}

/** Dispersión de ganancias contra pico de velocidad, con el corte dibujado. */
export function dibujaDispersion(canvas, trials, cfg) {
  const { ctx, w, h } = prepara(canvas);
  const pad = { l: 38, r: 8, t: 14, b: 18 };
  const { px, py } = marco(ctx, w, h, pad, {
    x0: 0,
    x1: 350,
    y0: 0,
    y1: 1.6,
    xLabel: 'pico cabeza °/s',
    yLabel: 'ganancia',
  });

  // Corte de normalidad. OJO: sale de estudios con position gain desacadizado,
  // que NO es lo que calcula este motor (ver README).
  ctx.strokeStyle = COLOR.corte;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(pad.l, py(cfg.gainNormalMin));
  ctx.lineTo(w - pad.r, py(cfg.gainNormalMin));
  ctx.stroke();
  ctx.setLineDash([]);

  // Franja de picos aceptados.
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(
    px(cfg.accept.peakMinDegS),
    pad.t,
    px(cfg.accept.peakMaxDegS) - px(cfg.accept.peakMinDegS),
    h - pad.t - pad.b,
  );

  for (const t of trials) {
    if (t.gain === null || t.gain === undefined) continue;
    ctx.fillStyle = COLOR[t.side];
    ctx.globalAlpha = t.rejected ? 0.25 : 1;
    ctx.beginPath();
    ctx.arc(px(t.peakHeadDegS), py(t.gain), 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/**
 * La calibración, vista: offset/R contra sin(H).
 *
 * Con el VOR haciendo su trabajo los puntos caen sobre una recta de pendiente
 * -k. Que se vea la recta ES la prueba de que lo que se midió es paralaje.
 */
export function dibujaParalaje(canvas, muestras, fit, radiusMm) {
  const { ctx, w, h } = prepara(canvas);
  const pad = { l: 42, r: 8, t: 14, b: 18 };
  const { px, py } = marco(ctx, w, h, pad, {
    x0: -0.6,
    x1: 0.6,
    y0: -0.6,
    y1: 0.6,
    xLabel: 'sin(yaw cabeza)',
    yLabel: 'offset/R',
  });

  ctx.fillStyle = COLOR.mirada;
  for (const [offsetMm, yawDeg] of muestras) {
    const x = Math.sin((yawDeg * Math.PI) / 180);
    const y = offsetMm / radiusMm;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.arc(px(x), py(y), 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (fit) {
    linea(
      ctx,
      [-0.6, 0.6].map((x) => [px(x), py(fit.intercept + fit.slope * x)]),
      fit.acceptable ? COLOR.ok : COLOR.derecha,
      2,
    );
  }
}

/** Puntos del iris y comisuras sobre el video. */
export function dibujaPuntos(ctx, landmarks, idx, w, h, espejo) {
  const X = (x) => (espejo ? (1 - x) * w : x * w);
  const marca = (i, color, r) => {
    const lm = landmarks[i];
    if (!lm) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(X(lm.x), lm.y * h, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const ojo of Object.values(idx)) {
    marca(ojo.iris, '#2be05f', 2.5);
    for (const b of ojo.border) marca(b, '#2be05f', 1.5);
    marca(ojo.outer, '#ff2cc8', 2);
    marca(ojo.inner, '#ff2cc8', 2);
  }
}
