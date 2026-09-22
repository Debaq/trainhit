// trainHIT — motor y interfaz.
//
// El hilo es: landmarks -> ángulos -> velocidades -> pulsos -> ganancia.
// Cada paso está en su módulo y acá solo se los conecta y se los muestra.

import * as geom from './geom.js';
import { HeadTracker, quatFromMatrix } from './head.js';
import { Differentiator } from './signal.js';
import {
  CONFIG,
  RECHAZO_TEXT,
  analyzeTrial,
  asimetria,
  resumenLado,
} from './analysis.js';
import * as plots from './plots.js';
import { IDX, abrirCamara, bucleDeFrames, crearLandmarker, listarCamaras } from './tracker.js';

const $ = (id) => document.getElementById(id);
const fmt = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(d));

const cfg = structuredClone(CONFIG);

const estado = {
  landmarker: null,
  bucle: null,
  stream: null,
  corriendo: false,
  pausado: false,
  espejo: true,
  model: new geom.EyeModel(),
  head: new HeadTracker('lateral'),
  diff: new Differentiator(50, 2),
  rolling: [], // últimas muestras derivadas, para el pre-trigger y la traza
  trials: [],
  captura: null, // pulso en curso
  calib: null, // {t0, samples, descartadasRapido, descartadasParpadeo, rapidoAhora}
  ultimoFit: null,
  vivo: { offsetMm: null, pxPerMm: null, yaw: 0, azimut: null, blink: false, resid: null },
  fps: 0,
  tUltimoFrame: null,
  caraOk: false,
  duracionCalibS: 10,
  maxVelCalibDegS: 60,
};

// ---------------------------------------------------------------- cámara ---

async function arrancar() {
  try {
    marcaEstado('pidiendo cámara…');
    estado.stream = await abrirCamara($('video'), { deviceId: $('camara').value || undefined });
    marcaEstado('cargando modelo…');
    if (!estado.landmarker) estado.landmarker = await crearLandmarker({ gpu: true });
    await poblarCamaras();
    estado.corriendo = true;
    estado.bucle = bucleDeFrames($('video'), procesaFrame);
    $('btn-arrancar').textContent = 'Detener';
    marcaEstado(estado.bucle.soportaRVFC ? 'midiendo' : 'midiendo (sin rVFC: timestamps peores)');
  } catch (e) {
    marcaEstado(`error: ${e.message}`);
    console.error(e);
  }
}

function detener() {
  estado.bucle?.detener();
  estado.stream?.getTracks().forEach((t) => t.stop());
  estado.corriendo = false;
  estado.stream = null;
  $('btn-arrancar').textContent = 'Encender cámara';
  marcaEstado('detenido');
}

async function poblarCamaras() {
  const sel = $('camara');
  const previo = sel.value;
  const cams = await listarCamaras();
  sel.innerHTML = '';
  cams.forEach((c, i) => {
    const o = document.createElement('option');
    o.value = c.deviceId;
    o.textContent = c.label || `cámara ${i + 1}`;
    sel.appendChild(o);
  });
  if (previo) sel.value = previo;
}

// -------------------------------------------------------------- pipeline ---

function procesaFrame(mediaTime) {
  const video = $('video');
  if (!video.videoWidth) return;

  const ahora = performance.now();
  if (estado.tUltimoFrame) {
    const dt = ahora - estado.tUltimoFrame;
    estado.fps = estado.fps ? estado.fps * 0.9 + (1000 / dt) * 0.1 : 1000 / dt;
  }
  estado.tUltimoFrame = ahora;

  let res;
  try {
    // El timestamp va en ms y tiene que ser estrictamente creciente.
    res = estado.landmarker.detectForVideo(video, Math.round(mediaTime * 1000));
  } catch {
    return;
  }

  const lms = res.faceLandmarks?.[0];
  const overlay = $('overlay');
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
  const octx = overlay.getContext('2d');
  octx.clearRect(0, 0, overlay.width, overlay.height);

  if (!lms || lms.length < 478) {
    estado.caraOk = false;
    estado.head.reset();
    estado.diff.reset();
    return;
  }
  estado.caraOk = true;
  plots.dibujaPuntos(octx, lms, IDX, overlay.width, overlay.height, estado.espejo);

  if (estado.pausado) return;

  const w = video.videoWidth;
  const h = video.videoHeight;
  const P = (i) => geom.px(lms[i], w, h);

  // --- cabeza: incrementos proyectados sobre el eje del canal ---
  const tm = res.facialTransformationMatrixes?.[0];
  if (!tm) return;
  const yaw = estado.head.push(quatFromMatrix(tm.data));

  // --- parpadeo, desde la malla ---
  const apertura = (o) =>
    geom.eyelidOpenness(P(o.lidUp), P(o.lidDown), P(o.outer), P(o.inner));
  const blink =
    Math.max(
      geom.blinkScore(apertura(IDX.derecho) ?? geom.EYE_OPEN_REF),
      geom.blinkScore(apertura(IDX.izquierdo) ?? geom.EYE_OPEN_REF),
    ) > Number($('blink').value);

  // --- ojos ---
  const mide = (o) => geom.observeEye(P(o.iris), o.border.map(P), P(o.outer), P(o.inner));
  const der = mide(IDX.derecho);
  const izq = mide(IDX.izquierdo);
  // Promedio binocular: dos medidas independientes del mismo movimiento
  // conjugado, así que promediarlas baja el ruido.
  const obs =
    der && izq
      ? { offsetMm: (der.offsetMm + izq.offsetMm) / 2, pxPerMm: (der.pxPerMm + izq.pxPerMm) / 2 }
      : der || izq;
  if (!obs) return;

  estado.vivo.offsetMm = obs.offsetMm;
  estado.vivo.pxPerMm = obs.pxPerMm;
  estado.vivo.yaw = yaw;
  estado.vivo.blink = blink;

  juntaCalibracion(obs, yaw, blink);

  const gaze = estado.model.gazeAzimuthDeg(obs, yaw);
  estado.vivo.azimut = gaze;

  const d = estado.diff.push({ t: mediaTime, headDeg: yaw, gazeDeg: gaze });
  if (!d) return;
  estado.vivo.resid = d.residDeg;

  const muestra = {
    t: d.t,
    headPos: d.headDeg,
    gazePos: d.gazeDeg,
    headVel: d.headVel,
    gazeVel: d.gazeVel,
    blink,
  };
  estado.rolling.push(muestra);
  while (estado.rolling.length && d.t - estado.rolling[0].t > 3) estado.rolling.shift();

  detectaPulso(muestra);
}

// ----------------------------------------------------------- calibración ---

function juntaCalibracion(obs, yaw, blink) {
  const c = estado.calib;
  if (!c) return;
  const ultima = estado.rolling[estado.rolling.length - 1];
  const lento = ultima ? Math.abs(ultima.headVel) < estado.maxVelCalibDegS : true;
  c.rapidoAhora = !lento;
  if (!lento) c.descartadasRapido++;
  else if (blink) c.descartadasParpadeo++;
  else c.samples.push([obs.offsetMm, yaw]);

  if ((performance.now() - c.t0) / 1000 >= estado.duracionCalibS) cierraCalibracion();
}

function empiezaCalibracion() {
  estado.calib = { t0: performance.now(), samples: [], descartadasRapido: 0, descartadasParpadeo: 0, rapidoAhora: false };
  estado.ultimoFit = null;
  marcaEstado('calibrando: fijá un punto y movéte LENTO, ±20° a cada lado');
}

function cierraCalibracion() {
  const c = estado.calib;
  estado.calib = null;
  const fit = geom.fitParallax(c.samples, estado.model.radiusMm);
  estado.ultimoFit = fit ? { ...fit, muestras: c.samples } : null;
  if (!fit) {
    marcaEstado('calibración fallida: casi no hubo muestras');
    return;
  }
  if (!fit.acceptable) {
    marcaEstado(`calibración RECHAZADA — ${geom.CALIB_ISSUE_TEXT[fit.issue]}`);
    return;
  }
  estado.model.kParallax = fit.kParallax;
  estado.model.calibrated = true;
  marcaEstado(
    `calibrado: k = ${fmt(fit.kParallax)} · residuo ${fmt(fit.residualDeg, 1)}° · rango ${fmt(fit.headRangeDeg, 0)}°` +
      (fit.kPlausible ? '' : ' — k fuera del rango anatómico, mirá el ajuste'),
  );
}

// ---------------------------------------------------------------- pulsos ---

function detectaPulso(m) {
  if (estado.calib) return; // durante la calibración no se buscan impulsos

  if (estado.captura) {
    estado.captura.samples.push(m);
    if (m.t - estado.captura.tTrigger >= cfg.impulse.windowMs / 1000) cierraPulso();
    return;
  }
  if (Math.abs(m.headVel) > cfg.impulse.onDegS) {
    const desde = m.t - cfg.impulse.preTriggerMs / 1000;
    estado.captura = {
      tTrigger: m.t,
      samples: estado.rolling.filter((s) => s.t >= desde),
    };
  }
}

function cierraPulso() {
  const cap = estado.captura;
  estado.captura = null;
  const samples = cap.samples.map((s) => ({ ...s, tMs: (s.t - cap.tTrigger) * 1000 }));
  const pico = samples.reduce((m, s) => Math.max(m, Math.abs(s.headVel)), 0);
  // Acomodarse en la silla o mirar al costado alcanzan para disparar. Eso no
  // fue un intento de impulso: no ensucia la tabla.
  if (pico < cfg.impulse.ignoreBelowDegS) return;

  const trial = analyzeTrial(samples, cfg);
  if (!trial) return;
  trial.id = estado.trials.length + 1;
  trial.calibrado = estado.model.calibrated;
  estado.trials.push(trial);
  pintaTabla();
}

// ------------------------------------------------------------------- UI ----

function marcaEstado(txt) {
  $('estado').textContent = txt;
}

function pintaTabla() {
  const tbody = $('tabla-pulsos');
  tbody.innerHTML = '';
  for (const t of [...estado.trials].reverse().slice(0, 40)) {
    const tr = document.createElement('tr');
    tr.className = t.rejected ? 'rechazado' : '';
    tr.innerHTML = `
      <td>${t.id}</td>
      <td class="lado-${t.side}">${t.side === 'derecha' ? 'DER' : 'IZQ'}</td>
      <td>${fmt(t.peakHeadDegS, 0)}</td>
      <td>${fmt(t.durationMs, 0)}</td>
      <td class="gan">${fmt(t.gain)}</td>
      <td class="motivo">${t.rejected ? RECHAZO_TEXT[t.rejected] : '✓'}</td>`;
    tr.onclick = () => (estado.seleccion = t);
    tbody.appendChild(tr);
  }

  const der = resumenLado(estado.trials, 'derecha');
  const izq = resumenLado(estado.trials, 'izquierda');
  $('res-der').textContent = der.n ? `${fmt(der.media)} ± ${fmt(der.de)}  (n=${der.n})` : '—';
  $('res-izq').textContent = izq.n ? `${fmt(izq.media)} ± ${fmt(izq.de)}  (n=${izq.n})` : '—';
  const a = asimetria(der.media, izq.media);
  $('res-asim').textContent = a === null ? '—' : `${fmt(a, 1)} %`;
}

function pintaTodo() {
  requestAnimationFrame(pintaTodo);

  const cal = estado.model.calibrated;
  const badge = $('badge-calib');
  badge.textContent = cal ? `CALIBRADO k=${fmt(estado.model.kParallax)}` : 'SIN CALIBRAR';
  badge.className = `badge ${cal ? 'ok' : 'mal'}`;

  $('v-fps').textContent = fmt(estado.fps, 0);
  $('v-cara').textContent = estado.caraOk ? 'sí' : 'no';
  $('v-offset').textContent = fmt(estado.vivo.offsetMm);
  $('v-escala').textContent = fmt(estado.vivo.pxPerMm, 1);
  $('v-yaw').textContent = fmt(estado.vivo.yaw, 1);
  $('v-azimut').textContent = fmt(estado.vivo.azimut, 1);
  $('v-resid').textContent = fmt(estado.vivo.resid, 2);
  $('v-blink').textContent = estado.vivo.blink ? 'sí' : 'no';
  const ultima = estado.rolling[estado.rolling.length - 1];
  $('v-vcab').textContent = fmt(ultima?.headVel, 0);
  $('v-vojo').textContent = ultima ? fmt(ultima.headVel - ultima.gazeVel, 0) : '—';

  if (estado.calib) {
    const c = estado.calib;
    const t = (performance.now() - c.t0) / 1000;
    const yaws = c.samples.map((s) => s[1]);
    const rango = yaws.length ? Math.max(...yaws) - Math.min(...yaws) : 0;
    $('calib-info').textContent =
      `${t.toFixed(1)}/${estado.duracionCalibS}s · ${c.samples.length} muestras · rango ${rango.toFixed(0)}°` +
      `/${geom.CALIB_MIN_HEAD_RANGE_DEG}°${c.rapidoAhora ? ' · ¡MÁS LENTO!' : ''}`;
    plots.dibujaParalaje($('plot-calib'), c.samples, null, estado.model.radiusMm);
  } else if (estado.ultimoFit) {
    const f = estado.ultimoFit;
    $('calib-info').textContent =
      `k=${fmt(f.kParallax)} · residuo ${fmt(f.residualDeg, 2)}° · objetivo a ${fmt(f.targetAzimuthDeg, 1)}° · n=${f.samples}`;
    plots.dibujaParalaje($('plot-calib'), f.muestras, f, estado.model.radiusMm);
  }

  plots.trazaViva($('plot-vivo'), estado.rolling);
  plots.dibujaPulso($('plot-pulso'), estado.seleccion || estado.trials[estado.trials.length - 1], cfg);
  plots.dibujaDispersion($('plot-ganancias'), estado.trials, cfg);
}

// ------------------------------------------------------------- controles ---

function sliders() {
  const bind = (id, set, d = 0) => {
    const el = $(id);
    const out = $(`${id}-val`);
    const aplica = () => {
      const v = Number(el.value);
      set(v);
      out.textContent = v.toFixed(d);
    };
    el.addEventListener('input', aplica);
    aplica();
  };

  bind('deriv-win', (v) => estado.diff.setWindow(v, Number($('deriv-deg').value)), 0);
  $('deriv-deg').addEventListener('change', () =>
    estado.diff.setWindow(Number($('deriv-win').value), Number($('deriv-deg').value)),
  );
  bind('on-deg', (v) => (cfg.impulse.onDegS = v), 0);
  bind('off-deg', (v) => (cfg.impulse.offDegS = v), 0);
  bind('peak-min', (v) => (cfg.accept.peakMinDegS = v), 0);
  bind('peak-max', (v) => (cfg.accept.peakMaxDegS = v), 0);
  bind('dur-min', (v) => (cfg.accept.durationMinMs = v), 0);
  bind('dur-max', (v) => (cfg.accept.durationMaxMs = v), 0);
  bind('blink', () => {}, 2);
  bind('k-manual', (v) => {
    if ($('k-manual-on').checked) {
      estado.model.kParallax = v;
      estado.model.calibrated = false;
    }
  }, 2);
  $('k-manual-on').addEventListener('change', (e) => {
    if (e.target.checked) {
      estado.model.kParallax = Number($('k-manual').value);
      estado.model.calibrated = false;
      marcaEstado('k puesto a mano: la ganancia NO está calibrada, es para experimentar');
    }
  });
}

function atajos() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const k = e.key.toLowerCase();
    if (k === 'c') empiezaCalibracion();
    else if (k === 'r') {
      estado.trials = [];
      estado.seleccion = null;
      pintaTabla();
    } else if (k === 'd') {
      estado.trials.pop();
      estado.seleccion = null;
      pintaTabla();
    } else if (k === ' ') {
      e.preventDefault();
      estado.pausado = !estado.pausado;
      marcaEstado(estado.pausado ? 'pausado' : 'midiendo');
    }
  });
}

function exporta() {
  const filas = [
    ['id', 'lado', 'pico_cabeza_deg_s', 'duracion_ms', 'ganancia_area', 'ganancia_60ms', 'ganancia_pico', 'rechazo', 'calibrado'],
    ...estado.trials.map((t) => [
      t.id,
      t.side,
      fmt(t.peakHeadDegS, 1),
      fmt(t.durationMs, 1),
      fmt(t.gain, 3),
      fmt(t.gains?.instant60ms, 3),
      fmt(t.gains?.peak, 3),
      t.rejected ?? '',
      t.calibrado ? 'si' : 'no',
    ]),
  ];
  const csv = filas.map((f) => f.join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `trainhit-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------------ init ---

$('btn-arrancar').addEventListener('click', () => (estado.corriendo ? detener() : arrancar()));
$('btn-calibrar').addEventListener('click', empiezaCalibracion);
$('btn-borrar').addEventListener('click', () => {
  estado.trials = [];
  estado.seleccion = null;
  pintaTabla();
});
$('btn-csv').addEventListener('click', exporta);
$('espejo').addEventListener('change', (e) => {
  estado.espejo = e.target.checked;
  $('camara-caja').classList.toggle('espejada', estado.espejo);
});
$('camara').addEventListener('change', () => {
  if (estado.corriendo) {
    detener();
    arrancar();
  }
});

sliders();
atajos();
pintaTabla();
pintaTodo();
marcaEstado('listo — encendé la cámara');
