// Gráficos en canvas. Nada de librerías.
//
// La paleta es la del motor nativo (`rust/src/gui/theme.rs`): son tonos medios
// elegidos para leerse igual sobre fondo claro y oscuro, no una decoración.

import { monotona } from './curve.js';

export const COLOR = {
  cabeza: '#2E7DD6',
  ojo: '#E8721C',
  overt: '#D62D2D',
  covert: '#9B51D0',
  ok: '#2E9E54',
  warn: '#D18800',
  bad: '#D62D2D',
  guia: '#4DB6E8',
  borde: '#27272A',
  muted: '#A1A1AA',
  texto: '#FAFAFA',
};

/** Prepara el canvas para la densidad de pantalla y devuelve el contexto. */
export function prepara(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

/**
 * Marcas en valores REDONDOS, no en fracciones del rango.
 *
 * Repartir el rango en N partes iguales da ejes rotulados «-3.8, 98, 199»:
 * números que nadie usa para leer un gráfico. Acá el paso se elige entre
 * 1, 2 y 5 por la potencia de diez que corresponda.
 */
function niceTicks(min, max, objetivo) {
  const span = max - min;
  if (!(span > 0)) return [min];
  const crudo = span / objetivo;
  const pot = 10 ** Math.floor(Math.log10(crudo));
  const norm = crudo / pot;
  const paso = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * pot;
  const out = [];
  for (let v = Math.ceil(min / paso) * paso; v <= max + paso * 1e-6; v += paso) {
    out.push(Math.abs(v) < paso * 1e-6 ? 0 : v);
  }
  return out;
}

function marco(ctx, w, h, pad, o) {
  const { x0, x1, y0, y1, yTicks = 4, xTicks = 5 } = o;
  const px = (x) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (w - pad.l - pad.r);
  const py = (y) => h - pad.b - ((y - y0) / (y1 - y0 || 1)) * (h - pad.t - pad.b);
  ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
  ctx.lineWidth = 1;

  for (const v of niceTicks(y0, y1, yTicks)) {
    const y = Math.round(py(v)) + 0.5;
    ctx.strokeStyle = Math.abs(v) < 1e-9 ? '#3F3F46' : COLOR.borde;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
    ctx.fillStyle = COLOR.muted;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(tick(v), pad.l - 4, y);
  }
  ctx.strokeStyle = COLOR.borde;
  for (const v of niceTicks(x0, x1, xTicks)) {
    const x = Math.round(px(v)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, pad.t);
    ctx.lineTo(x, h - pad.b);
    ctx.stroke();
    ctx.fillStyle = COLOR.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(tick(v), x, h - pad.b + 3);
  }
  if (o.unidad) {
    ctx.fillStyle = COLOR.muted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(o.unidad, pad.l + 2, 2);
  }
  return { px, py };
}

function tick(v) {
  const a = Math.abs(v);
  if (a >= 10 || a === 0) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  return v.toFixed(2);
}

/**
 * Opciones de dibujo. `suavizado` interpola entre muestras con Hermite
 * monótona (ver `curve.js`): más legible y sin inventar picos.
 *
 * Se puede apagar, y con razón: suavizar una señal de 30 fps la hace PARECER
 * más precisa de lo que es. Mientras está encendido, las trazas dibujan además
 * los puntos de las muestras reales —la densidad de los marcadores es lo que
 * dice cuántos datos hay de verdad—.
 */
export const opciones = { suavizado: true };

function linea(ctx, pts, color, ancho = 1.4, alpha = 1) {
  if (pts.length < 2) return;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = ancho;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const curva = opciones.suavizado ? monotona(pts) : pts;
  curva.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
  // Las muestras reales, encima de la curva interpolada. Solo en las trazas
  // cortas —un pulso son ~25 muestras—: sobre los ocho segundos de la traza en
  // vivo serían un puntillado sin información.
  if (opciones.suavizado && pts.length <= 60) {
    ctx.fillStyle = color;
    const r = Math.max(1.5, Math.min(2.4, ancho * 1.3));
    for (const [x, y] of pts) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** Recorta al área del gráfico: una traza que se pasa de escala se corta en el
 * borde en vez de dibujarse encima de los rótulos. */
function recorta(ctx, pad, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(pad.l, pad.t, w - pad.l - pad.r, h - pad.t - pad.b);
  ctx.clip();
}

function vacio(ctx, w, h, txt) {
  ctx.fillStyle = COLOR.muted;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(txt, w / 2, h / 2);
}

/**
 * Traza en vivo: velocidad de cabeza y velocidad ocular, contra el tiempo.
 *
 * La ocular va invertida, que es la convención clínica: con VOR normal las dos
 * curvas se superponen y la SEPARACIÓN entre ellas es el hallazgo.
 */
export function trazaViva(canvas, muestras, { segundos = 8, escala = 300 } = {}) {
  const { ctx, w, h } = prepara(canvas);
  const pad = { l: 36, r: 6, t: 12, b: 16 };
  // El eje va en segundos HASTA AHORA (…, −4, −2, 0): la hora absoluta de la
  // sesión no le dice nada a nadie, y además no cae nunca en números redondos.
  const tNow = muestras.length ? muestras[muestras.length - 1].t : 0;
  const { px, py } = marco(ctx, w, h, pad, { x0: -segundos, x1: 0, y0: -escala, y1: escala, unidad: '°/s · s' });
  const vis = muestras.filter((s) => s.t >= tNow - segundos);
  recorta(ctx, pad, w, h);
  linea(ctx, vis.map((s) => [px(s.t - tNow), py(s.headVel)]), COLOR.cabeza, 1.6);
  linea(ctx, vis.map((s) => [px(s.t - tNow), py(s.headVel - s.gazeVel)]), COLOR.ojo, 1.6);
  ctx.restore();
}

/**
 * Overlay de todos los pulsos de un lado, como en la app nativa.
 *
 * El panel se normaliza con el impulso HACIA ARRIBA sea cual sea el lado, para
 * que los dos se comparen de un vistazo. El pulso seleccionado va resaltado.
 */
export function overlayLado(canvas, trials, side, cfg, seleccion) {
  const { ctx, w, h } = prepara(canvas);
  const pad = { l: 36, r: 6, t: 12, b: 16 };
  const delLado = trials.filter((t) => t.side === side);
  const escala = Math.max(
    250,
    Math.ceil(Math.max(cfg.accept.peakMaxDegS, ...delLado.map((t) => t.peakHeadDegS || 0)) / 50) * 50,
  );
  const { px, py } = marco(ctx, w, h, pad, {
    x0: -cfg.impulse.preTriggerMs,
    x1: cfg.impulse.windowMs,
    y0: -escala * 0.35,
    y1: escala,
    unidad: '°/s',
  });
  if (!delLado.length) {
    vacio(ctx, w, h, 'sin pulsos');
    return;
  }

  // Banda de velocidad de pico aceptada.
  ctx.fillStyle = 'rgba(46,158,84,0.07)';
  ctx.fillRect(pad.l, py(cfg.accept.peakMaxDegS), w - pad.l - pad.r, py(cfg.accept.peakMinDegS) - py(cfg.accept.peakMaxDegS));

  const flip = side === 'derecha' ? 1 : -1;
  recorta(ctx, pad, w, h);
  for (const t of delLado) {
    const sel = seleccion === t;
    const alpha = t.rejected ? 0.18 : sel ? 1 : 0.55;
    const ancho = sel ? 2.2 : 1.2;
    linea(ctx, t.samples.map((s) => [px(s.tMs), py(s.headVel * flip)]), COLOR.cabeza, ancho, alpha);
    linea(
      ctx,
      t.samples.map((s) => [px(s.tMs), py((s.headVel - s.gazeVel) * flip)]),
      COLOR.ojo,
      ancho,
      alpha,
    );
  }
  ctx.restore();
}

/** Un pulso solo, con la ventana del impulso sombreada y los umbrales. */
export function dibujaPulso(canvas, trial, cfg) {
  const { ctx, w, h } = prepara(canvas);
  const pad = { l: 36, r: 6, t: 12, b: 16 };
  if (!trial) {
    marco(ctx, w, h, pad, { x0: -cfg.impulse.preTriggerMs, x1: cfg.impulse.windowMs, y0: -100, y1: 300, unidad: '°/s' });
    vacio(ctx, w, h, 'sin pulsos todavía');
    return;
  }
  const flip = trial.side === 'derecha' ? 1 : -1;
  const escala = Math.max(250, Math.ceil(trial.peakHeadDegS / 50) * 50 + 50);
  const { px, py } = marco(ctx, w, h, pad, {
    x0: trial.samples[0].tMs,
    x1: trial.samples[trial.samples.length - 1].tMs,
    y0: -escala * 0.4,
    y1: escala,
    unidad: '°/s',
  });

  if (trial.core) {
    ctx.fillStyle = 'rgba(250,250,250,0.05)';
    ctx.fillRect(px(trial.tOnsetMs), pad.t, px(trial.tOffsetMs) - px(trial.tOnsetMs), h - pad.t - pad.b);
  }
  ctx.setLineDash([3, 3]);
  for (const v of [cfg.impulse.onDegS, cfg.impulse.offDegS]) {
    ctx.strokeStyle = '#3F3F46';
    ctx.beginPath();
    ctx.moveTo(pad.l, py(v));
    ctx.lineTo(w - pad.r, py(v));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  recorta(ctx, pad, w, h);
  linea(ctx, trial.samples.map((s) => [px(s.tMs), py(s.headVel * flip)]), COLOR.cabeza, 1.8);
  linea(ctx, trial.samples.map((s) => [px(s.tMs), py((s.headVel - s.gazeVel) * flip)]), COLOR.ojo, 1.8);
  ctx.restore();
}

/** Ganancia contra pico de velocidad, con el corte y la franja aceptada. */
export function dibujaDispersion(canvas, trials, cfg) {
  const { ctx, w, h } = prepara(canvas);
  const pad = { l: 36, r: 6, t: 12, b: 16 };
  const { px, py } = marco(ctx, w, h, pad, { x0: 0, x1: 350, y0: 0, y1: 1.6, unidad: 'ganancia / °/s' });

  ctx.fillStyle = 'rgba(46,158,84,0.07)';
  ctx.fillRect(px(cfg.accept.peakMinDegS), pad.t, px(cfg.accept.peakMaxDegS) - px(cfg.accept.peakMinDegS), h - pad.t - pad.b);
  ctx.strokeStyle = COLOR.warn;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(pad.l, py(cfg.gainNormalMin));
  ctx.lineTo(w - pad.r, py(cfg.gainNormalMin));
  ctx.stroke();
  ctx.setLineDash([]);

  recorta(ctx, pad, w, h);
  for (const t of trials) {
    if (t.gain === null || t.gain === undefined) continue;
    ctx.fillStyle = t.side === 'derecha' ? COLOR.cabeza : COLOR.covert;
    ctx.globalAlpha = t.rejected ? 0.25 : 1;
    ctx.beginPath();
    ctx.arc(px(t.peakHeadDegS), py(t.gain), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** La calibración: offset/R contra sin(yaw). Si hay paralaje, es una recta. */
export function dibujaParalaje(canvas, muestras, fit, radiusMm) {
  const { ctx, w, h } = prepara(canvas);
  const pad = { l: 40, r: 6, t: 12, b: 16 };
  const { px, py } = marco(ctx, w, h, pad, { x0: -0.6, x1: 0.6, y0: -0.6, y1: 0.6, unidad: 'offset/R · sin(yaw)' });
  if (!muestras?.length) {
    vacio(ctx, w, h, 'sin calibrar');
    return;
  }
  recorta(ctx, pad, w, h);
  ctx.fillStyle = COLOR.guia;
  ctx.globalAlpha = 0.55;
  for (const [offsetMm, yawDeg] of muestras) {
    ctx.beginPath();
    ctx.arc(px(Math.sin((yawDeg * Math.PI) / 180)), py(offsetMm / radiusMm), 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (fit) {
    linea(
      ctx,
      [-0.6, 0.6].map((x) => [px(x), py(fit.intercept + fit.slope * x)]),
      fit.acceptable ? COLOR.ok : COLOR.bad,
      2,
    );
  }
  ctx.restore();
}

/**
 * Puntos del iris y comisuras sobre el video.
 *
 * El canvas se dibuja en coordenadas de la IMAGEN y el espejado lo hace el CSS
 * sobre el contenedor: así el overlay no puede quedar espejado respecto del
 * video, que es exactamente lo que pasa cuando se invierte en los dos lados.
 */
export function dibujaPuntos(ctx, landmarks, idx, w, h) {
  const marca = (i, color, r) => {
    const lm = landmarks[i];
    if (!lm) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(lm.x * w, lm.y * h, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const escala = Math.max(1, w / 640);
  for (const ojo of Object.values(idx)) {
    for (const b of ojo.border) marca(b, COLOR.guia, 1.5 * escala);
    marca(ojo.iris, COLOR.ok, 2.5 * escala);
    marca(ojo.outer, COLOR.overt, 2 * escala);
    marca(ojo.inner, COLOR.overt, 2 * escala);
  }
}

/**
 * Un ojo ampliado: el recorte del video con sus marcas.
 *
 * Se dibuja la MISMA imagen con otras coordenadas de origen en vez de recortar
 * píxeles: es un `drawImage` con la caja de origen, y la placa hace el resto.
 */
export function dibujaOjo(canvas, video, crop, landmarks, ojo, espejo) {
  const { ctx, w, h } = prepara(canvas);
  ctx.fillStyle = '#09090B';
  ctx.fillRect(0, 0, w, h);
  if (!crop || !video?.videoWidth) {
    vacio(ctx, w, h, '—');
    return;
  }
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const sx = crop.x0 * vw;
  const sy = crop.y0 * vh;
  const sw = (crop.x1 - crop.x0) * vw;
  const sh = (crop.y1 - crop.y0) * vh;
  if (sw < 2 || sh < 2) return;

  ctx.save();
  if (espejo) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);

  const X = (lm) => ((lm.x * vw - sx) / sw) * w;
  const Y = (lm) => ((lm.y * vh - sy) / sh) * h;
  const marca = (i, color, r) => {
    const lm = landmarks?.[i];
    if (!lm) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(X(lm), Y(lm), r, 0, Math.PI * 2);
    ctx.fill();
  };
  if (landmarks) {
    for (const b of ojo.border) marca(b, COLOR.guia, 2);
    marca(ojo.iris, COLOR.ok, 3);
    marca(ojo.outer, COLOR.overt, 2.5);
    marca(ojo.inner, COLOR.overt, 2.5);
  }
  ctx.restore();
}
