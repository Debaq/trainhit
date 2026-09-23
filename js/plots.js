// Gráficos en canvas. Nada de librerías.
//
// La paleta es la del motor nativo (`rust/src/gui/theme.rs`): son tonos medios
// elegidos para leerse igual sobre fondo claro y oscuro, no una decoración.

import { monotona } from './curve.js';
import { RECHAZO_TEXT, SIGNO_DERECHA, sideSign } from './analysis.js';

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

/** Segundos que muestra la traza en vivo. El buffer de muestras guarda lo mismo. */
export const SEGUNDOS_VIVO = 8;

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
 * Área bajo una curva entre dos tiempos, por trapecios.
 *
 * Integrar velocidad da DESPLAZAMIENTO: el área bajo la traza de cabeza entre
 * dos instantes son los grados que giró la cabeza en ese tramo, y lo mismo
 * para el ojo. El cociente de las dos áreas es la ganancia de ESE tramo, que
 * es la misma cuenta que hace el motor sobre la ventana del impulso —acá con
 * la ventana que uno elija con el cursor—.
 *
 * Los extremos se interpolan: si el cursor cae entre dos muestras, el área no
 * salta de a una muestra entera.
 */
export function areaEntre(pts, a, b) {
  const [ini, fin] = a <= b ? [a, b] : [b, a];
  if (!(fin > ini) || pts.length < 2) return 0;
  const enT = (t) => {
    for (let i = 1; i < pts.length; i++) {
      const [t0, v0] = pts[i - 1];
      const [t1, v1] = pts[i];
      if (t >= t0 && t <= t1) return t1 === t0 ? v0 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
    return null;
  };
  let area = 0;
  let tPrev = ini;
  let vPrev = enT(ini);
  if (vPrev === null) return 0;
  for (const [t, v] of pts) {
    if (t <= ini || t > fin) continue;
    area += ((v + vPrev) / 2) * (t - tPrev);
    tPrev = t;
    vPrev = v;
  }
  const vFin = enT(fin);
  if (vFin !== null && fin > tPrev) area += ((vFin + vPrev) / 2) * (fin - tPrev);
  return area;
}

/**
 * Promedio de los pulsos aceptados de un lado, muestra a muestra.
 *
 * Los pulsos no comparten los mismos instantes —cada uno se disparó en un
 * frame distinto—, así que se promedian sobre una grilla de tiempo común
 * interpolando cada pulso. Promediar es lo que hace visible lo que un pulso
 * suelto esconde: el ruido de seguimiento se va y queda la forma.
 *
 * Los rechazados no entran: promediar un pulso con la cara perdida ensucia la
 * media justo donde importa.
 */
export function promedioLado(trials, side, { pasoMs = 5 } = {}) {
  const buenos = trials.filter((t) => t.side === side && !t.rejected && t.samples?.length > 2);
  if (buenos.length < 2) return null;
  const desde = Math.max(...buenos.map((t) => t.samples[0].tMs));
  const hasta = Math.min(...buenos.map((t) => t.samples[t.samples.length - 1].tMs));
  if (!(hasta > desde)) return null;

  const enT = (samples, t, campo) => {
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      if (t >= a.tMs && t <= b.tMs) {
        const f = b.tMs === a.tMs ? 0 : (t - a.tMs) / (b.tMs - a.tMs);
        return campo(a) + (campo(b) - campo(a)) * f;
      }
    }
    return null;
  };

  const out = [];
  for (let t = desde; t <= hasta; t += pasoMs) {
    const cab = buenos.map((x) => enT(x.samples, t, (s) => s.headVel)).filter((v) => v !== null);
    const ojo = buenos.map((x) => enT(x.samples, t, (s) => s.headVel - s.gazeVel)).filter((v) => v !== null);
    if (!cab.length) continue;
    const media = (a) => a.reduce((p, c) => p + c, 0) / a.length;
    out.push({ tMs: t, headVel: media(cab), gazeVel: media(cab) - media(ojo) });
  }
  return out.length > 2 ? { samples: out, n: buenos.length } : null;
}

/**
 * Las dos series de un pulso, listas para el cursor de medición.
 *
 * El área se calcula sobre la señal SIN el flip del panel: la orientación es
 * cosa del dibujo, y el desplazamiento en grados no cambia porque el gráfico
 * esté dado vuelta. Lo que sí se voltea son los puntos que se pintan.
 */
function seriesDePulso(samples, flip) {
  return [
    {
      nombre: 'cabeza',
      color: COLOR.cabeza,
      ganancia: 'cabeza',
      en: (t) => enMuestras(samples, t, (s) => s.headVel * flip),
      pts: samples.map((s) => [s.tMs, s.headVel * flip]),
    },
    {
      nombre: 'ojo   ',
      color: COLOR.ojo,
      ganancia: 'ojo',
      en: (t) => enMuestras(samples, t, (s) => velOjo(s) * flip),
      pts: samples.map((s) => [s.tMs, velOjo(s) * flip]),
    },
  ];
}

/** Valor de una serie en un tiempo, por la muestra más cercana. */
function enMuestras(samples, t, campo) {
  let mejor = null;
  let dist = Infinity;
  for (const s of samples) {
    const d = Math.abs(s.tMs - t);
    if (d < dist) { dist = d; mejor = s; }
  }
  return mejor ? campo(mejor) : null;
}

/**
 * Pasa una posición del puntero a milisegundos del pulso.
 *
 * Igual que `tiempoEnVivo`, vive acá porque depende del `pad` y del rango.
 */
export function tiempoEnPulso(canvas, clientX, { x0, x1 }) {
  const pad = { l: 36, r: 6 };
  const r = canvas.getBoundingClientRect();
  const util = r.width - pad.l - pad.r;
  if (util <= 0) return null;
  const frac = (clientX - r.left - pad.l) / util;
  return x0 + Math.min(1, Math.max(0, frac)) * (x1 - x0);
}

/**
 * Cursor de medición: lee valores sobre una traza quieta.
 *
 * Es la herramienta que falta cuando alguien pregunta «¿cuánto vale acá?».
 * Sin esto solo se puede estimar a ojo contra la grilla, y la separación entre
 * cabeza y ojo —que es EL hallazgo— es justo lo que hay que poder medir.
 *
 * Con `ancla` puesta mide el intervalo entre dos puntos: Δt y el salto de cada
 * traza. Dos clics y listo, sin ventana aparte.
 *
 * `series` es `[{nombre, color, en(t)}]`: cada una sabe dar su valor en un
 * tiempo, porque quién interpola es cosa de cada gráfico.
 */
function cursorMedicion(ctx, w, h, pad, { px, py, x0, x1 }, med, series, unidadX) {
  const dentro = (v) => Math.min(x1, Math.max(x0, v));
  const t = dentro(med.t);
  const x = px(t);
  const a = med.ancla !== null ? dentro(med.ancla) : null;
  const lee = (s) => ({
    ...s,
    v: s.en(t),
    vAncla: a !== null ? s.en(a) : null,
    area: a !== null && s.pts ? areaEntre(s.pts, a, t) : null,
  });
  const vals = series.map(lee).filter((s) => s.v !== null && Number.isFinite(s.v));

  ctx.save();
  // La regla del ancla primero, para que la del cursor quede encima.
  if (a !== null) {
    const xa = px(a);
    // El área de cada traza, pintada entre la curva y el cero. Es «ver» la
    // integral: lo que se mide es esa superficie, no un número suelto.
    ctx.save();
    ctx.beginPath();
    ctx.rect(Math.min(x, xa), pad.t, Math.abs(x - xa), h - pad.t - pad.b);
    ctx.clip();
    for (const s of vals) {
      if (!s.pts) continue;
      ctx.fillStyle = s.color;
      ctx.globalAlpha = 0.16;
      ctx.beginPath();
      ctx.moveTo(px(s.pts[0][0]), py(0));
      for (const [tp, vp] of s.pts) ctx.lineTo(px(tp), py(vp));
      ctx.lineTo(px(s.pts[s.pts.length - 1][0]), py(0));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = COLOR.muted;
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(xa) + 0.5, pad.t);
    ctx.lineTo(Math.round(xa) + 0.5, h - pad.b);
    ctx.stroke();
    ctx.setLineDash([]);
    // El tramo medido, sombreado: el ojo ve el intervalo sin leer el número.
    ctx.fillStyle = 'rgba(250,250,250,0.05)';
    ctx.fillRect(Math.min(x, xa), pad.t, Math.abs(x - xa), h - pad.t - pad.b);
  }

  ctx.strokeStyle = COLOR.guia;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(Math.round(x) + 0.5, pad.t);
  ctx.lineTo(Math.round(x) + 0.5, h - pad.b);
  ctx.stroke();
  for (const s of vals) {
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(x, py(s.v), 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  const filas = [`${fmtX(t, unidadX)}${a !== null ? `  Δ${fmtX(Math.abs(t - a), unidadX, true)}` : ''}`];
  const colores = [];
  for (const s of vals) {
    const d = s.vAncla !== null && Number.isFinite(s.vAncla) ? `  Δ${(s.v - s.vAncla).toFixed(0)}` : '';
    // El área va en grados: es velocidad por tiempo, o sea desplazamiento.
    const ar = s.area !== null ? `  ${areaEnGrados(s.area, unidadX).toFixed(1)}°` : '';
    filas.push(`${s.nombre} ${s.v.toFixed(0)}${d}${ar}`);
    colores.push(s.color);
  }
  // Ganancia del tramo: cociente de las áreas, la misma cuenta que hace el
  // motor sobre la ventana del impulso, acá sobre la ventana elegida.
  const cab = vals.find((s) => s.ganancia === 'cabeza');
  const ojo = vals.find((s) => s.ganancia === 'ojo');
  if (cab?.area && ojo?.area && Math.abs(cab.area) > 1e-9) {
    filas.push(`ganancia ${Math.abs(ojo.area / cab.area).toFixed(2)}`);
    colores.push(COLOR.texto);
  }
  etiqueta(ctx, w, h, pad, x, filas, colores);
  ctx.restore();
}

/** El área viene en unidad·°/s; a grados según el eje esté en s o en ms. */
function areaEnGrados(area, unidadX) {
  return unidadX === 'ms' ? area / 1000 : area;
}

function fmtX(v, unidad, delta = false) {
  if (unidad === 'ms') return `${delta ? '' : ''}${v.toFixed(0)} ms`;
  return `${v.toFixed(2)} s`;
}

/** Cartel del cursor, siempre adentro del gráfico y del lado donde entra. */
function etiqueta(ctx, w, h, pad, x, filas, colores) {
  ctx.font = '11px ui-monospace, SFMono-Regular, monospace';
  const anchoTexto = Math.max(...filas.map((f) => ctx.measureText(f).width));
  const anchoCaja = anchoTexto + 16;
  const altoCaja = filas.length * 14 + 8;
  const izq = x + 10 + anchoCaja > w - pad.r;
  const cx = izq ? x - 10 - anchoCaja : x + 10;
  const cy = pad.t + 6;

  ctx.fillStyle = 'rgba(9,9,11,0.88)';
  ctx.strokeStyle = COLOR.borde;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(cx, cy, anchoCaja, altoCaja, 6);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  filas.forEach((f, i) => {
    ctx.fillStyle = i === 0 ? COLOR.texto : colores[i - 1] ?? COLOR.muted;
    ctx.fillText(f, cx + 8, cy + 5 + i * 14);
  });
}

/**
 * Traza en vivo: velocidad de cabeza y velocidad ocular, contra el tiempo.
 *
 * La ocular va invertida, que es la convención clínica: con VOR normal las dos
 * curvas se superponen y la SEPARACIÓN entre ellas es el hallazgo.
 */
export function trazaViva(canvas, muestras, { segundos = SEGUNDOS_VIVO, escala = 300, medicion = null } = {}) {
  const { ctx, w, h } = prepara(canvas);
  const pad = { l: 36, r: 6, t: 12, b: 16 };
  // El eje va en segundos HASTA AHORA (…, −4, −2, 0): la hora absoluta de la
  // sesión no le dice nada a nadie, y además no cae nunca en números redondos.
  const tNow = muestras.length ? muestras[muestras.length - 1].t : 0;
  const { px, py } = marco(ctx, w, h, pad, { x0: -segundos, x1: 0, y0: -escala, y1: escala, unidad: '°/s · s' });
  const vis = muestras.filter((s) => s.t >= tNow - segundos);
  recorta(ctx, pad, w, h);
  linea(ctx, vis.map((s) => [px(s.t - tNow), py(s.headVel)]), COLOR.cabeza, 1.6);
  linea(ctx, vis.map((s) => [px(s.t - tNow), py(velOjo(s))]), COLOR.ojo, 1.6);
  ctx.restore();

  if (medicion && vis.length) {
    // Se lee la muestra más cercana, no una interpolación: el cursor tiene que
    // decir lo que se midió de verdad.
    const cerca = (t) => {
      let mejor = null;
      let dist = Infinity;
      for (const s of vis) {
        const d = Math.abs(s.t - tNow - t);
        if (d < dist) { dist = d; mejor = s; }
      }
      return mejor;
    };
    cursorMedicion(ctx, w, h, pad, { px, py, x0: -segundos, x1: 0 }, medicion, [
      {
        nombre: 'cabeza',
        color: COLOR.cabeza,
        ganancia: 'cabeza',
        en: (t) => cerca(t)?.headVel ?? null,
        pts: vis.map((s) => [s.t - tNow, s.headVel]),
      },
      {
        nombre: 'ojo   ',
        color: COLOR.ojo,
        ganancia: 'ojo',
        en: (t) => { const s = cerca(t); return s ? velOjo(s) : null; },
        pts: vis.map((s) => [s.t - tNow, velOjo(s)]),
      },
    ], 's');
  }
}

/**
 * Pasa una posición del puntero a coordenadas del gráfico en vivo.
 *
 * Vive acá porque depende del `pad` y del rango del eje, que son de este
 * módulo: si el gráfico cambia de márgenes, el cursor no se despega.
 */
export function tiempoEnVivo(canvas, clientX, { segundos = SEGUNDOS_VIVO } = {}) {
  const pad = { l: 36, r: 6 };
  const r = canvas.getBoundingClientRect();
  const util = r.width - pad.l - pad.r;
  if (util <= 0) return null;
  const frac = (clientX - r.left - pad.l) / util;
  return -segundos + Math.min(1, Math.max(0, frac)) * segundos;
}

/**
 * Marca de agua de "no validado", sobre el área del gráfico.
 *
 * Solo aparece cuando el pulso se muestreó por encima del umbral de validez
 * (ver `FPS_VALIDADO` en analysis.js). En uso normal NO se dibuja nada: el
 * estudiante ve el gráfico limpio. Va acá adentro, en el mismo paso que dibuja
 * las trazas, y no como un cartel aparte en la interfaz, para que el resultado
 * y su rótulo viajen juntos —una captura de pantalla del gráfico se lleva la
 * marca puesta—.
 */
function marcaNoValidado(ctx, w, h, pad) {
  const cx = pad.l + (w - pad.l - pad.r) / 2;
  const cy = pad.t + (h - pad.t - pad.b) / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.atan2(h - pad.t - pad.b, w - pad.l - pad.r));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${Math.max(13, Math.min(22, (w - pad.l - pad.r) / 11))}px system-ui, sans-serif`;
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = COLOR.bad;
  ctx.fillText('NO VALIDADO', 0, 0);
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Hacia dónde apunta cada impulso y de qué lado cae la traza ocular.
 *
 * Son dos signos, pero **una sola decisión**, igual que en el motor nativo
 * (`config.rs`: `PanelOrientation` y `TraceSides`):
 *
 * - `comparativo`: los dos paneles se normalizan con el impulso hacia ARRIBA y
 *   la traza ocular va invertida, para que se superponga con la de cabeza. Lo
 *   que se lee es la SEPARACIÓN entre curvas, y los dos lados se comparan de
 *   un vistazo. Es el modo por defecto y la convención clínica.
 * - `real`: cada impulso va hacia su lado —derecha arriba, izquierda abajo— y
 *   la traza ocular va cruda, o sea al revés que la cabeza, porque el VOR es
 *   un reflejo compensatorio. Es la señal como es, para leer direcciones de
 *   movimiento en vez de comparar lados.
 *
 * Mezclarlas al revés da dibujos que no significan nada: «cada uno hacia su
 * lado» con el ojo invertido pone el ojo del mismo lado que la cabeza, que no
 * es lo que pasa en la realidad y entonces no es «real».
 */
export const ORIENTACION = { modo: 'comparativo' };

/**
 * Por cuánto se multiplica el panel entero de un lado.
 *
 * En «real» el factor es el mismo para los dos paneles —no hay normalización
 * por lado—, pero NO es 1: es `SIGNO_DERECHA`. El eje del motor tiene el yaw
 * positivo hacia la IZQUIERDA del paciente (ver `SIGNO_DERECHA` en
 * analysis.js), así que dibujar la señal tal cual manda el impulso derecho
 * hacia abajo. «Dirección real» quiere decir derecha arriba e izquierda
 * abajo, que es la convención del motor nativo y la que espera quien lee el
 * gráfico como un movimiento.
 */
export function flipDe(side) {
  return ORIENTACION.modo === 'real' ? SIGNO_DERECHA : sideSign(side);
}

/** Por cuánto se multiplica la velocidad ocular al dibujarla. */
export function signoOjo() {
  return ORIENTACION.modo === 'real' ? -1 : 1;
}

/**
 * De qué lado del cero cae la banda de velocidad aceptada.
 *
 * **No es `flipDe`.** La banda tiene que caer donde cae el impulso DIBUJADO, y
 * eso es el signo real del pulso ya pasado por la orientación del panel. En
 * comparativo los dos paneles se normalizan hacia arriba, así que la banda va
 * arriba en los dos aunque el pulso izquierdo sea negativo.
 */
export function signoBanda(side) {
  return sideSign(side) * flipDe(side);
}

/**
 * Velocidad ocular tal como se dibuja.
 *
 * La resta `headVel - gazeVel` es la velocidad del ojo en el espacio; el signo
 * de afuera decide si se muestra invertida (superpuesta a la cabeza) o cruda.
 */
export function velOjo(s) {
  return (s.headVel - s.gazeVel) * signoOjo();
}

/**
 * Rango vertical que contiene TODO lo que se va a dibujar.
 *
 * Escalar por `peakHeadDegS` deja fuera la traza ocular y las sacádicas, que
 * suelen superar el pico de cabeza: la curva se iba contra el borde superior y
 * el recorte la cortaba. Acá se mide el máximo real de las dos series ya
 * volteadas, se le suma aire y se redondea a múltiplos de 50.
 */
function rangoPulsos(trials, flip, { minTop = 250, pisoRel = 0.35 } = {}) {
  let hi = 0;
  let lo = 0;
  for (const t of trials) {
    for (const s of t.samples) {
      const cabeza = s.headVel * flip;
      const ojo = velOjo(s) * flip;
      hi = Math.max(hi, cabeza, ojo);
      lo = Math.min(lo, cabeza, ojo);
    }
  }
  const y1 = Math.max(minTop, Math.ceil((hi * 1.08) / 50) * 50);
  const y0 = Math.min(-y1 * pisoRel, Math.floor((lo * 1.08) / 50) * 50);
  return { y0, y1 };
}

/**
 * Encuadra un pulso rechazado y dice por qué.
 *
 * Antes un rechazado solo se veía más pálido: alcanzaba para no confundirlo
 * con los buenos, pero no para saber QUÉ salió mal sin ir a buscarlo a la
 * tabla. La caja va sobre el tramo del impulso —que es donde se decidió el
 * rechazo— y lleva el motivo escrito encima.
 */
function cajaRechazo(ctx, w, h, pad, { px, py }, trial, ventana) {
  const x1 = px(trial.core ? trial.tOnsetMs : ventana.x0);
  const x2 = px(trial.core ? trial.tOffsetMs : ventana.x1);
  const izq = Math.max(pad.l, Math.min(x1, x2) - 6);
  const der = Math.min(w - pad.r, Math.max(x1, x2) + 6);

  ctx.save();
  ctx.strokeStyle = COLOR.bad;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 3]);
  ctx.globalAlpha = 0.85;
  ctx.strokeRect(izq, pad.t + 1, der - izq, h - pad.t - pad.b - 2);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // Solo la parte corta del motivo: «CARA PERDIDA», no la recomendación que
  // la acompaña en la tabla.
  const motivo = (RECHAZO_TEXT[trial.rejected] ?? String(trial.rejected)).split(' —')[0];
  ctx.font = '600 10px ui-monospace, SFMono-Regular, monospace';
  const ancho = ctx.measureText(motivo).width + 10;
  const cx = Math.min(w - pad.r - ancho, Math.max(pad.l, izq));
  ctx.fillStyle = 'rgba(214,45,45,0.9)';
  ctx.beginPath();
  ctx.roundRect(cx, pad.t + 1, ancho, 15, 4);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(motivo, cx + 5, pad.t + 9);
  ctx.restore();
}

/**
 * Overlay de todos los pulsos de un lado, como en la app nativa.
 *
 * El panel se normaliza con el impulso HACIA ARRIBA sea cual sea el lado, para
 * que los dos se comparen de un vistazo. El pulso seleccionado va resaltado.
 */
export function overlayLado(canvas, trials, side, cfg, seleccion, { promedio = false, medicion = null } = {}) {
  const { ctx, w, h } = prepara(canvas);
  const pad = { l: 36, r: 6, t: 12, b: 16 };
  const delLado = trials.filter((t) => t.side === side);
  const flip = flipDe(side);
  const { y0, y1 } = rangoPulsos(delLado, flip, {
    minTop: Math.ceil(cfg.accept.peakMaxDegS / 50) * 50,
    // En «real» el panel izquierdo va enteramente hacia abajo: un piso del 35%
    // del techo le cortaría el impulso.
    pisoRel: ORIENTACION.modo === 'real' ? 1 : 0.35,
  });
  const { px, py } = marco(ctx, w, h, pad, {
    x0: -cfg.impulse.preTriggerMs,
    x1: cfg.impulse.windowMs,
    y0,
    y1,
    unidad: '°/s',
  });
  if (!delLado.length) {
    vacio(ctx, w, h, 'sin pulsos');
    return;
  }

  // Banda de velocidad de pico aceptada, del lado donde cae el impulso
  // dibujado. Ver `signoBanda`: equivocarse acá la pone enfrente del pulso.
  const banda = signoBanda(side);
  const bMax = py(cfg.accept.peakMaxDegS * banda);
  const bMin = py(cfg.accept.peakMinDegS * banda);
  ctx.fillStyle = 'rgba(46,158,84,0.07)';
  ctx.fillRect(pad.l, Math.min(bMax, bMin), w - pad.l - pad.r, Math.abs(bMin - bMax));

  recorta(ctx, pad, w, h);
  for (const t of delLado) {
    const sel = seleccion === t;
    const alpha = t.rejected ? 0.18 : sel ? 1 : 0.55;
    const ancho = sel ? 2.2 : 1.2;
    linea(ctx, t.samples.map((s) => [px(s.tMs), py(s.headVel * flip)]), COLOR.cabeza, ancho, alpha);
    linea(ctx, t.samples.map((s) => [px(s.tMs), py(velOjo(s) * flip)]), COLOR.ojo, ancho, alpha);
  }
  const media = promedio ? promedioLado(trials, side) : null;
  if (media) {
    // Más gruesa y opaca que los pulsos sueltos: es el resumen, no uno más.
    linea(ctx, media.samples.map((s) => [px(s.tMs), py(s.headVel * flip)]), COLOR.cabeza, 3.2);
    linea(ctx, media.samples.map((s) => [px(s.tMs), py(velOjo(s) * flip)]), COLOR.ojo, 3.2);
  }
  ctx.restore();

  if (media) {
    ctx.fillStyle = COLOR.muted;
    ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`promedio de ${media.n}`, w - pad.r - 2, pad.t + 1);
  }

  if (medicion) {
    // Se mide sobre el promedio si está a la vista, y si no sobre el pulso
    // elegido: es la curva que la persona está mirando.
    const base = media?.samples ?? (seleccion?.side === side ? seleccion.samples : delLado[delLado.length - 1]?.samples);
    if (base?.length) {
      cursorMedicion(ctx, w, h, pad, { px, py, x0: -cfg.impulse.preTriggerMs, x1: cfg.impulse.windowMs }, medicion,
        seriesDePulso(base, flip), 'ms');
    }
  }

  // Solo el pulso elegido: con diez rechazados encima, diez cajas no se leen.
  if (seleccion && seleccion.side === side && seleccion.rejected) {
    cajaRechazo(ctx, w, h, pad, { px, py }, seleccion, { x0: -cfg.impulse.preTriggerMs, x1: cfg.impulse.windowMs });
  }
  if (delLado.some((t) => t.noValidado)) marcaNoValidado(ctx, w, h, pad);
}

/** Un pulso solo, con la ventana del impulso sombreada y los umbrales. */
export function dibujaPulso(canvas, trial, cfg, { medicion = null } = {}) {
  const { ctx, w, h } = prepara(canvas);
  const pad = { l: 36, r: 6, t: 12, b: 16 };
  if (!trial) {
    marco(ctx, w, h, pad, { x0: -cfg.impulse.preTriggerMs, x1: cfg.impulse.windowMs, y0: -100, y1: 300, unidad: '°/s' });
    vacio(ctx, w, h, 'sin pulsos todavía');
    return;
  }
  const flip = flipDe(trial.side);
  const { y0, y1 } = rangoPulsos([trial], flip, { pisoRel: ORIENTACION.modo === 'real' ? 1 : 0.4 });
  const { px, py } = marco(ctx, w, h, pad, {
    x0: trial.samples[0].tMs,
    x1: trial.samples[trial.samples.length - 1].tMs,
    y0,
    y1,
    unidad: '°/s',
  });

  if (trial.core) {
    ctx.fillStyle = 'rgba(250,250,250,0.05)';
    ctx.fillRect(px(trial.tOnsetMs), pad.t, px(trial.tOffsetMs) - px(trial.tOnsetMs), h - pad.t - pad.b);
  }
  ctx.setLineDash([3, 3]);
  // Los umbrales de entrada y salida también van del lado del impulso.
  for (const v of [cfg.impulse.onDegS, cfg.impulse.offDegS].map((u) => u * signoBanda(trial.side))) {
    ctx.strokeStyle = '#3F3F46';
    ctx.beginPath();
    ctx.moveTo(pad.l, py(v));
    ctx.lineTo(w - pad.r, py(v));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  recorta(ctx, pad, w, h);
  linea(ctx, trial.samples.map((s) => [px(s.tMs), py(s.headVel * flip)]), COLOR.cabeza, 1.8);
  linea(ctx, trial.samples.map((s) => [px(s.tMs), py(velOjo(s) * flip)]), COLOR.ojo, 1.8);
  ctx.restore();
  if (medicion) {
    cursorMedicion(
      ctx, w, h, pad,
      { px, py, x0: trial.samples[0].tMs, x1: trial.samples[trial.samples.length - 1].tMs },
      medicion, seriesDePulso(trial.samples, flip), 'ms',
    );
  }
  if (trial.rejected) {
    cajaRechazo(ctx, w, h, pad, { px, py }, trial, {
      x0: trial.samples[0].tMs,
      x1: trial.samples[trial.samples.length - 1].tMs,
    });
  }
  if (trial.noValidado) marcaNoValidado(ctx, w, h, pad);
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
  if (trials.some((t) => t.noValidado)) marcaNoValidado(ctx, w, h, pad);
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
