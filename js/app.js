// trainHIT — motor e interfaz.
//
// El hilo es: landmarks -> ángulos -> velocidades -> pulsos -> ganancia.
// Cada paso está en su módulo; acá solo se los conecta y se los muestra.

import * as geom from './geom.js';
import { HeadTracker, quatFromMatrix, quatRotate } from './head.js';
import { Differentiator } from './signal.js';
import { CONFIG, RECHAZO_TEXT, analyzeTrial, asimetria, resumenLado } from './analysis.js';
import * as plots from './plots.js';
import { FPS_MAX, IDX, abrirCamara, bucleDeFrames, crearLandmarker, describeCamara, listarCamaras } from './tracker.js';
import { montaBienvenida } from './bienvenida.js';
import { MARGEN_CRUDO_MS, procesaCrudo } from './pipeline.js';

const $ = (id) => document.getElementById(id);
const fmt = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(d));

const cfg = structuredClone(CONFIG);

/**
 * Qué hay que redibujar. Los paneles de pulsos, la dispersión y la
 * calibración cambian con eventos —un pulso nuevo, una perilla, el tamaño de
 * la ventana—, no con cada frame: redibujarlos a 60 Hz era layout y canvas
 * tirados, y en el teléfono le competían el tiempo a la inferencia. La traza
 * en vivo y el video sí van a frame rate mientras la cámara corre.
 */
const sucio = { pulsos: true, calib: true, vivo: true };
const ensucia = () => {
  sucio.pulsos = true;
  sucio.calib = true;
  sucio.vivo = true;
};

const estado = {
  landmarker: null,
  delegate: null,
  bucle: null,
  stream: null,
  corriendo: false,
  pausado: false,
  espejo: true,
  model: new geom.EyeModel(),
  head: new HeadTracker('lateral'),
  diff: new Differentiator(50, 2),
  rolling: [],
  crudo: [], // una muestra por frame, antes del derivador: con esto se recalcula
  trials: [],
  proximoId: 1, // el largo de la lista no sirve: al borrar uno se repetía el número
  seleccion: null,
  captura: null,
  calib: null,
  ultimoFit: null,
  landmarks: null,
  crops: { derecho: null, izquierdo: null },
  vivo: vivoVacio(),
  refractarioHasta: -Infinity,
  fps: 0,
  tUltimoFrame: null,
  // MediaPipe exige timestamps estrictamente crecientes en el mismo
  // landmarker, y `mediaTime` vuelve a cero con cada stream nuevo. Se le suma
  // un corrimiento que se recalcula cuando el reloj retrocede.
  tsMediaPipe: { ultimo: -1, corrimiento: 0 },
  caraOk: false,
  duracionCalibS: 10,
  maxVelCalibDegS: 60,
};

function vivoVacio() {
  return { offsetMm: null, pxPerMm: null, irisPx: null, yaw: 0, inclinacion: null, azimut: null, blink: false };
}

// ---------------------------------------------------------------- cámara ---

async function arrancar() {
  try {
    marcaEstado('pidiendo cámara…');
    estado.stream = await abrirCamara($('video'), { deviceId: $('camara').value || undefined });
    marcaEstado('cargando modelo…');
    if (!estado.landmarker) {
      const l = await crearLandmarker({ gpu: true });
      estado.landmarker = l.landmarker;
      estado.delegate = l.delegate;
    }
    await poblarCamaras();
    estado.corriendo = true;
    $('sin-video').hidden = true;
    // La caja toma la relación de aspecto REAL de la cámara. Sin esto, con una
    // cámara 4:3 en una caja 16:9 el video se recorta y el overlay no: los
    // puntos quedan corridos respecto de los ojos.
    ajustaAspecto();
    estado.bucle = bucleDeFrames($('video'), procesaFrame);
    $('btn-arrancar').textContent = 'Detener';
    avisaTope(describeCamara(estado.stream));
    const notas = [];
    if (estado.delegate === 'CPU') notas.push('modelo en CPU: más lento');
    if (!estado.bucle.soportaRVFC) notas.push('sin rVFC: timestamps peores');
    marcaEstado(notas.length ? `midiendo (${notas.join(' · ')})` : 'midiendo');
  } catch (e) {
    // Si la cámara abrió pero el modelo no cargó, la cámara quedaría
    // encendida y el botón diciendo «Encender»: se apaga todo.
    detener();
    marcaEstado(`error: ${e.message}`);
    console.error(e);
  }
}

function detener() {
  estado.bucle?.detener();
  estado.stream?.getTracks().forEach((t) => t.stop());
  estado.corriendo = false;
  estado.stream = null;
  estado.bucle = null;
  reseteaTransitorio();
  sucio.vivo = true; // una última pasada, para vaciar video y ojos
  $('sin-video').hidden = false;
  $('aviso-fps').hidden = true;
  $('btn-arrancar').textContent = 'Encender cámara';
  marcaEstado('detenido');
}

/**
 * Borra todo lo que depende del stream actual. Sin esto, al re-arrancar la
 * cámara el reloj del video vuelve a cero y las muestras viejas —con tiempos
 * mayores— se quedaban en el buffer: el recorte por tiempo nunca las sacaba y
 * el pre-trigger del pulso siguiente las arrastraba adentro.
 */
function reseteaTransitorio() {
  estado.landmarks = null;
  estado.caraOk = false;
  estado.crops.derecho = null;
  estado.crops.izquierdo = null;
  estado.rolling = [];
  estado.crudo = [];
  estado.captura = null;
  estado.refractarioHasta = -Infinity;
  estado.head.reset();
  estado.diff.reset();
  estado.fps = 0;
  estado.tUltimoFrame = null;
  estado.vivo = vivoVacio();
  if (estado.calib) {
    estado.calib = null;
    marcaEstado('calibración cancelada: se apagó la cámara');
  }
}

/**
 * Si la cámara puede dar más de `FPS_MAX`, se dice. El tope es a propósito:
 * ver `FPS_MAX` en tracker.js.
 */
function avisaTope(cam) {
  const rapida = (cam.fpsMax ?? 0) > FPS_MAX || (cam.fps ?? 0) > FPS_MAX;
  const aviso = $('aviso-fps');
  aviso.hidden = !rapida;
  if (rapida) {
    aviso.title =
      `Esta cámara puede entregar ${Math.round(cam.fpsMax ?? cam.fps)} fps. trainHIT procesa como mucho ${FPS_MAX}: ` +
      'es una herramienta didáctica, y el tope está puesto a propósito para que no se use como equipo médico.';
    console.info(aviso.title);
  }
}

function ajustaAspecto() {
  const v = $('video');
  if (v.videoWidth) $('camara-caja').style.aspectRatio = `${v.videoWidth} / ${v.videoHeight}`;
  else v.addEventListener('loadedmetadata', ajustaAspecto, { once: true });
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
    res = estado.landmarker.detectForVideo(video, timestampMediaPipe(mediaTime));
  } catch (e) {
    estado.caraOk = false;
    estado.landmarks = null;
    console.warn('detectForVideo', e);
    return;
  }

  const lms = res.faceLandmarks?.[0];
  if (!lms || lms.length < 478) {
    estado.caraOk = false;
    estado.landmarks = null;
    estado.head.reset();
    estado.diff.reset();
    return;
  }
  estado.caraOk = true;
  estado.landmarks = lms;

  const w = video.videoWidth;
  const h = video.videoHeight;
  const P = (i) => geom.px(lms[i], w, h);

  // Los recortes de ojo salen SOLO de los landmarks, así que se calculan antes
  // de tocar nada del motor: se pueden mirar aunque el análisis esté pausado.
  estado.crops.derecho = geom.eyeCrop(P(IDX.derecho.outer), P(IDX.derecho.inner), w, h);
  estado.crops.izquierdo = geom.eyeCrop(P(IDX.izquierdo.outer), P(IDX.izquierdo.inner), w, h);

  if (estado.pausado) return;

  // --- cabeza: incrementos proyectados sobre el eje del canal ---
  const tm = res.facialTransformationMatrixes?.[0];
  if (!tm) return;
  const q = quatFromMatrix(tm.data);
  const yaw = estado.head.push(q);
  // Inclinación de la cabeza: ángulo entre su eje vertical y el de la cámara.
  // Sin signo, a propósito: mezcla flexión y ladeo, y sirve para ver si la
  // cabeza está más o menos en los ~30° de flexión del vHIT lateral.
  const arriba = quatRotate(q, [0, 1, 0]);
  const inclinacion = (Math.acos(Math.min(1, Math.abs(arriba[1]))) * 180) / Math.PI;

  // --- parpadeo, desde la malla ---
  const apertura = (o) => geom.eyelidOpenness(P(o.lidUp), P(o.lidDown), P(o.outer), P(o.inner));
  const blink =
    Math.max(
      geom.blinkScore(apertura(IDX.derecho) ?? geom.EYE_OPEN_REF),
      geom.blinkScore(apertura(IDX.izquierdo) ?? geom.EYE_OPEN_REF),
    ) > cfg.blinkScore;

  // --- ojos ---
  const mide = (o) => geom.observeEye(P(o.iris), o.border.map(P), P(o.outer), P(o.inner));
  const der = mide(IDX.derecho);
  const izq = mide(IDX.izquierdo);
  // Promedio binocular: dos medidas independientes del mismo movimiento
  // conjugado, así que promediarlas baja el ruido.
  const obs =
    der && izq
      ? {
          offsetMm: (der.offsetMm + izq.offsetMm) / 2,
          pxPerMm: (der.pxPerMm + izq.pxPerMm) / 2,
          radiusPx: Math.min(der.radiusPx, izq.radiusPx),
        }
      : der || izq;
  if (!obs) return;
  // Diferencia entre ojos: con movimiento conjugado es constante. Su rango
  // dentro de un pulso dice si un ojo se siguió mal.
  const vergMm = der && izq ? der.offsetMm - izq.offsetMm : null;

  estado.vivo.offsetMm = obs.offsetMm;
  estado.vivo.pxPerMm = obs.pxPerMm;
  estado.vivo.irisPx = obs.radiusPx;
  estado.vivo.yaw = yaw;
  estado.vivo.inclinacion = inclinacion;
  estado.vivo.blink = blink;

  juntaCalibracion(obs, yaw, blink);

  const gaze = estado.model.gazeAzimuthDeg(obs, yaw);
  estado.vivo.azimut = gaze;

  estado.crudo.push({ t: mediaTime, yaw, offsetMm: obs.offsetMm, blink, irisPx: obs.radiusPx, vergMm });
  while (estado.crudo.length && mediaTime - estado.crudo[0].t > plots.SEGUNDOS_VIVO) estado.crudo.shift();

  const d = estado.diff.push({ t: mediaTime, headDeg: yaw, gazeDeg: gaze });
  if (!d) return;

  const muestra = {
    t: d.t,
    headPos: d.headDeg,
    gazePos: d.gazeDeg,
    headVel: d.headVel,
    gazeVel: d.gazeVel,
    blink,
    irisPx: obs.radiusPx,
    vergMm,
  };
  estado.rolling.push(muestra);
  while (estado.rolling.length && d.t - estado.rolling[0].t > plots.SEGUNDOS_VIVO) estado.rolling.shift();

  detectaPulso(muestra);
}

/**
 * Timestamp en ms para MediaPipe, estrictamente creciente aunque el reloj del
 * video haya vuelto a cero (stream nuevo). Se conserva el espaciado real entre
 * frames: solo se corre el origen.
 */
function timestampMediaPipe(mediaTime) {
  const ts = estado.tsMediaPipe;
  const crudo = Math.round(mediaTime * 1000);
  if (crudo + ts.corrimiento <= ts.ultimo) ts.corrimiento = ts.ultimo + 1 - crudo;
  ts.ultimo = crudo + ts.corrimiento;
  return ts.ultimo;
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
  if (!estado.corriendo) {
    marcaEstado('encender la cámara antes de calibrar');
    return;
  }
  estado.calib = { t0: performance.now(), samples: [], descartadasRapido: 0, descartadasParpadeo: 0, rapidoAhora: false };
  estado.ultimoFit = null;
  sucio.calib = true;
  abreHerramientas(true);
  marcaEstado('calibrando: fijar un punto y mover la cabeza LENTO, ±20°');
}

function cierraCalibracion() {
  const c = estado.calib;
  estado.calib = null;
  sucio.calib = true;
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
    `calibrado: k=${fmt(fit.kParallax)} · residuo ${fmt(fit.residualDeg, 1)}°` +
      (fit.kPlausible ? '' : ` · k fuera del rango anatómico (${geom.CALIB_K_PLAUSIBLE.join('–')}): repetir`),
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
  if (m.t < estado.refractarioHasta) return;
  if (Math.abs(m.headVel) > cfg.impulse.onDegS) {
    const desde = m.t - cfg.impulse.preTriggerMs / 1000;
    estado.captura = { tTrigger: m.t, samples: estado.rolling.filter((s) => s.t >= desde) };
  }
}

/** Perillas del derivador, como las quiere `procesaCrudo`. */
function derivActual() {
  return { windowMs: Number($('deriv-win').value), degree: Number($('deriv-deg').value) };
}

/**
 * Cierra la captura y analiza el pulso. El análisis NO usa las muestras que
 * disparaban el detector: se vuelve a correr el motor entero sobre las
 * muestras crudas de la ventana, que es exactamente lo que hace «Recalcular».
 * Así lo que se ve al medir y lo que se ve al recalcular con la misma
 * configuración es lo mismo.
 */
function cierraPulso() {
  const cap = estado.captura;
  estado.captura = null;
  const tFin = cap.samples[cap.samples.length - 1].t;
  estado.refractarioHasta = tFin + cfg.impulse.refractoryMs / 1000;

  const pico = cap.samples.reduce((m, s) => Math.max(m, Math.abs(s.headVel)), 0);
  // Acomodarse en la silla o mirar al costado alcanzan para disparar. Eso no
  // fue un intento de impulso: no ensucia la lista.
  if (pico < cfg.impulse.ignoreBelowDegS) return;

  const desde = cap.tTrigger - (cfg.impulse.preTriggerMs + MARGEN_CRUDO_MS) / 1000;
  const crudo = estado.crudo.filter((c) => c.t >= desde && c.t <= tFin);
  const trial = procesaCrudo(crudo, cap.tTrigger, estado.model, derivActual(), cfg);
  if (!trial) return;
  trial.id = estado.proximoId++;
  trial.crudo = crudo;
  anotaConfig(trial);
  estado.trials.push(trial);
  estado.seleccion = trial;
  pintaListas();
}

/** Con qué configuración se calculó el pulso: va al tooltip y al CSV. */
function anotaConfig(trial) {
  trial.calibrado = estado.model.calibrated;
  trial.k = estado.model.kParallax;
  trial.deriv = derivActual();
}

/**
 * Vuelve a correr el motor sobre las muestras crudas de cada pulso con la
 * configuración de AHORA: perillas, umbrales y `k`. Los números de la lista
 * pasan a ser los de esta configuración, no los de cuando se midió.
 */
function recalculaTodos() {
  const idSel = estado.seleccion?.id;
  estado.trials = estado.trials.map((t) => {
    if (!t.crudo) return t;
    const nuevo = procesaCrudo(t.crudo, t.tTrigger, estado.model, derivActual(), cfg);
    if (!nuevo) return t;
    nuevo.id = t.id;
    nuevo.crudo = t.crudo;
    anotaConfig(nuevo);
    return nuevo;
  });
  estado.seleccion = estado.trials.find((t) => t.id === idSel) ?? null;
  pintaListas();
  marcaEstado(`${estado.trials.length} pulsos recalculados con la configuración actual`);
}

// ------------------------------------------------------------------- UI ----

function marcaEstado(txt) {
  $('estado').textContent = txt;
}

function pintaListas() {
  sucio.pulsos = true;
  for (const [lado, tbodyId] of [
    ['derecha', 'lista-der'],
    ['izquierda', 'lista-izq'],
  ]) {
    const tbody = $(tbodyId);
    tbody.innerHTML = '';
    for (const t of estado.trials.filter((x) => x.side === lado)) {
      const tr = document.createElement('tr');
      tr.className = t === estado.seleccion ? 'sel' : '';
      tr.tabIndex = 0;
      const estadoTxt = t.rejected ? RECHAZO_TEXT[t.rejected].split(' —')[0] : 'OK';
      tr.innerHTML = `
        <td class="num">#${t.id}</td>
        <td>${fmt(t.peakHeadDegS, 0)} °/s</td>
        <td>${fmt(t.durationMs, 0)} ms</td>
        <td class="g">${fmt(t.gain)}</td>
        <td class="est ${t.rejected ? 'mal' : 'ok'}">${estadoTxt}</td>
        <td class="acc"><button class="x" title="descartar" aria-label="descartar el pulso ${t.id}">✕</button></td>`;
      const descarta = () => {
        estado.trials = estado.trials.filter((x) => x !== t);
        if (estado.seleccion === t) estado.seleccion = null;
        pintaListas();
      };
      tr.querySelector('.x').addEventListener('click', (e) => {
        e.stopPropagation();
        descarta();
      });
      tr.addEventListener('click', () => {
        estado.seleccion = t;
        pintaListas();
      });
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          estado.seleccion = t;
          pintaListas();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          descarta();
        }
      });
      tr.title =
        `área ${fmt(t.gain)} · 60 ms ${fmt(t.gains?.instant60ms)} · pico ${fmt(t.gains?.peak)}` +
        `\niris ${fmt(t.irisPx, 1)} px · ojos ${fmt(t.disconjMm)} mm · hueco ${fmt(t.gapMs, 0)} ms` +
        `\nk ${fmt(t.k)} · derivador ${t.deriv?.windowMs} ms grado ${t.deriv?.degree}` +
        (t.rejected ? `\n${RECHAZO_TEXT[t.rejected]}` : '') +
        (t.calibrado ? '' : '\nmedido SIN calibrar');
      tbody.appendChild(tr);
    }
  }

  const der = resumenLado(estado.trials, 'derecha');
  const izq = resumenLado(estado.trials, 'izquierda');
  for (const [r, lado, ganId, metaId] of [
    [der, 'derecha', 'gan-der', 'meta-der'],
    [izq, 'izquierda', 'gan-izq', 'meta-izq'],
  ]) {
    const g = $(ganId);
    g.textContent = r.n ? (r.n > 1 ? `${fmt(r.media)} ± ${fmt(r.de)}` : fmt(r.media)) : '—';
    g.className = `gan ${!r.n || !estado.model.calibrated ? 'sin' : r.media >= cfg.gainNormalMin ? 'ok' : 'bajo'}`;
    const total = estado.trials.filter((t) => t.side === lado).length;
    $(metaId).textContent = `${r.n} aceptados · ${total - r.n} rechazados`;
  }
  const a = asimetria(der.media, izq.media);
  $('asim').textContent = a === null ? 'asimetría —' : `asimetría ${fmt(a, 1)} %`;
}

function pintaTodo() {
  requestAnimationFrame(pintaTodo);

  const cal = estado.model.calibrated;
  const badge = $('badge-calib');
  badge.textContent = cal ? `CALIBRADO k=${fmt(estado.model.kParallax)}` : 'SIN CALIBRAR';
  badge.className = `badge ${cal ? 'ok' : 'mal'}`;

  const ultima = estado.rolling[estado.rolling.length - 1];
  $('v-fps').textContent = fmt(estado.fps, 0);
  $('v-cara').textContent = estado.caraOk ? 'sí' : 'no';
  $('v-vcab').textContent = ultima ? `${fmt(ultima.headVel, 0)} °/s` : '—';
  $('v-offset').textContent = fmt(estado.vivo.offsetMm);
  $('v-escala').textContent = fmt(estado.vivo.pxPerMm, 1);
  const iris = $('v-iris');
  iris.textContent = fmt(estado.vivo.irisPx, 1);
  iris.className = estado.vivo.irisPx !== null && estado.vivo.irisPx < cfg.accept.irisMinPx ? 'mal' : '';
  $('v-yaw').textContent = fmt(estado.vivo.yaw, 1);
  $('v-inclin').textContent = fmt(estado.vivo.inclinacion, 0);
  $('v-azimut').textContent = fmt(estado.vivo.azimut, 1);
  $('v-vojo').textContent = ultima ? fmt(ultima.headVel - ultima.gazeVel, 0) : '—';
  $('v-blink').textContent = estado.vivo.blink ? 'sí' : 'no';

  if (estado.corriendo || sucio.vivo) {
    dibujaVideo();
    plots.trazaViva($('plot-vivo'), estado.rolling);
    sucio.vivo = false;
  }

  // Con el cajón cerrado sus canvas miden cero; al abrirlo se ensucia todo.
  const herramientas = !$('herramientas').hidden;
  if (sucio.pulsos) {
    plots.overlayLado($('plot-der'), estado.trials, 'derecha', cfg, estado.seleccion);
    plots.overlayLado($('plot-izq'), estado.trials, 'izquierda', cfg, estado.seleccion);
    if (herramientas) {
      plots.dibujaPulso($('plot-pulso'), estado.seleccion || estado.trials[estado.trials.length - 1], cfg);
      plots.dibujaDispersion($('plot-ganancias'), estado.trials, cfg);
    }
    sucio.pulsos = false;
  }
  if (herramientas && (estado.calib || sucio.calib)) {
    pintaCalibracion();
    sucio.calib = false;
  }
}

function pintaCalibracion() {
  if (estado.calib) {
    const c = estado.calib;
    const t = (performance.now() - c.t0) / 1000;
    const yaws = c.samples.map((s) => s[1]);
    const rango = yaws.length ? Math.max(...yaws) - Math.min(...yaws) : 0;
    $('calib-info').textContent =
      `${t.toFixed(1)}/${estado.duracionCalibS}s · ${c.samples.length} muestras · rango ${rango.toFixed(0)}°/${geom.CALIB_MIN_HEAD_RANGE_DEG}°` +
      (c.rapidoAhora ? ' · ¡MÁS LENTO!' : '');
    plots.dibujaParalaje($('plot-calib'), c.samples, null, estado.model.radiusMm);
  } else if (estado.ultimoFit) {
    const f = estado.ultimoFit;
    $('calib-info').textContent = `k=${fmt(f.kParallax)} · residuo ${fmt(f.residualDeg, 2)}° · n=${f.samples}`;
    plots.dibujaParalaje($('plot-calib'), f.muestras, f, estado.model.radiusMm);
  } else {
    plots.dibujaParalaje($('plot-calib'), null, null, estado.model.radiusMm);
  }
}

/**
 * Overlay del video y los dos ojos ampliados.
 *
 * El overlay se dibuja en coordenadas de la IMAGEN, sin espejar: el espejo lo
 * aplica el CSS al contenedor, así que video y puntos se invierten juntos. Los
 * recortes de ojo sí se espejan acá, porque son canvas sueltos.
 */
function dibujaVideo() {
  const video = $('video');
  const overlay = $('overlay');
  if (video.videoWidth && overlay.width !== video.videoWidth) {
    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
  }
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (estado.landmarks) {
    plots.dibujaPuntos(ctx, estado.landmarks, IDX, overlay.width, overlay.height);
  }
  plots.dibujaOjo($('ojo-der'), video, estado.crops.derecho, estado.landmarks, IDX.derecho, estado.espejo);
  plots.dibujaOjo($('ojo-izq'), video, estado.crops.izquierdo, estado.landmarks, IDX.izquierdo, estado.espejo);
}

function abreHerramientas(abrir) {
  $('herramientas').hidden = !abrir;
  if (abrir) ensucia();
}

// ------------------------------------------------------------- controles ---

function borraTodos() {
  // Una tecla apretada sin querer no puede tirar la sesión entera.
  if (estado.trials.length && !confirm(`¿Borrar los ${estado.trials.length} pulsos?`)) return;
  estado.trials = [];
  estado.seleccion = null;
  pintaListas();
}

function descartaUltimo() {
  estado.trials.pop();
  estado.seleccion = null;
  pintaListas();
}

function sliders() {
  const bind = (id, set, d = 0) => {
    const el = $(id);
    const out = $(`${id}-val`);
    const aplica = () => {
      const v = Number(el.value);
      set(v);
      if (out) out.textContent = v.toFixed(d);
      sucio.pulsos = true; // las bandas de los gráficos salen de cfg
    };
    el.addEventListener('input', aplica);
    aplica();
  };

  bind('deriv-win', (v) => estado.diff.setWindow(v, Number($('deriv-deg').value)));
  $('deriv-deg').addEventListener('change', () =>
    estado.diff.setWindow(Number($('deriv-win').value), Number($('deriv-deg').value)),
  );
  bind('on-deg', (v) => (cfg.impulse.onDegS = v));
  bind('off-deg', (v) => (cfg.impulse.offDegS = v));
  bind('peak-min', (v) => (cfg.accept.peakMinDegS = v));
  bind('peak-max', (v) => (cfg.accept.peakMaxDegS = v));
  bind('dur-min', (v) => (cfg.accept.durationMinMs = v));
  bind('dur-max', (v) => (cfg.accept.durationMaxMs = v));
  bind('blink', (v) => (cfg.blinkScore = v), 2);
  bind('iris-min', (v) => (cfg.accept.irisMinPx = v), 0);
  bind(
    'k-manual',
    (v) => {
      if ($('k-manual-on').checked) {
        estado.model.kParallax = v;
        estado.model.calibrated = false;
      }
    },
    2,
  );
  $('k-manual-on').addEventListener('change', (e) => {
    if (e.target.checked) {
      estado.model.kParallax = Number($('k-manual').value);
      estado.model.calibrated = false;
      marcaEstado('k puesto a mano: la ganancia NO está calibrada');
    }
  });
}

function atajos() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    // Ctrl+C es copiar, Ctrl+D marcador, Ctrl+R recargar: no son atajos de acá.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!$('bienvenida').hidden) return;
    const k = e.key.toLowerCase();
    if (k === 'c') empiezaCalibracion();
    else if (k === 'r') borraTodos();
    else if (k === 'd') descartaUltimo();
    else if (k === 'h') abreHerramientas($('herramientas').hidden);
    else if (k === ' ') {
      e.preventDefault();
      $('pausa').checked = estado.pausado = !estado.pausado;
      marcaEstado(estado.pausado ? 'pausado' : 'midiendo');
    }
  });
}

// ------------------------------------------------------------------ CSV ----

/** Número para CSV: punto decimal, y vacío —no un guion— cuando no hay valor. */
const num = (v, d = 3) => (v === null || v === undefined || Number.isNaN(v) ? '' : v.toFixed(d));

function bajaCsv(filas, sufijo) {
  const url = URL.createObjectURL(new Blob([filas.map((f) => f.join(',')).join('\n')], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `trainhit-${sufijo}-${new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Un pulso por fila, con la configuración con la que se calculó. */
function exporta() {
  const version = document.documentElement.dataset.v ?? '';
  const filas = [
    [
      'id', 'lado', 'pico_cabeza_deg_s', 'duracion_ms', 'ganancia_area', 'ganancia_60ms', 'ganancia_pico',
      'rechazo', 'calibrado', 'k', 'iris_min_px', 'disconj_mm', 'hueco_max_ms', 'deriv_ventana_ms', 'deriv_grado', 'version',
    ],
    ...estado.trials.map((t) => [
      t.id,
      t.side,
      num(t.peakHeadDegS, 1),
      num(t.durationMs, 1),
      num(t.gain),
      num(t.gains?.instant60ms),
      num(t.gains?.peak),
      t.rejected ?? '',
      t.calibrado ? 'si' : 'no',
      num(t.k),
      num(t.irisPx, 1),
      num(t.disconjMm),
      num(t.gapMs, 0),
      t.deriv?.windowMs ?? '',
      t.deriv?.degree ?? '',
      version,
    ]),
  ];
  bajaCsv(filas, 'pulsos');
}

/**
 * Una muestra por fila, de todos los pulsos: lo derivado (lo que se grafica y
 * de donde sale la ganancia) y, al lado, lo crudo del frame que cerró esa
 * ventana del derivador. Es lo que hace falta para rehacer el cálculo en una
 * planilla.
 */
function exportaMuestras() {
  const filas = [
    [
      'id', 'lado', 't_ms', 'cabeza_deg', 'mirada_deg', 'v_cabeza_deg_s', 'v_mirada_deg_s', 'en_impulso', 'parpadeo',
      'iris_px', 'verg_mm', 'crudo_t_ms', 'crudo_yaw_deg', 'crudo_offset_mm',
    ],
  ];
  for (const t of estado.trials) {
    for (const s of t.samples) {
      const dentro = t.core && s.tMs >= t.tOnsetMs && s.tMs <= t.tOffsetMs;
      filas.push([
        t.id, t.side, num(s.tMs, 1), num(s.headPos), num(s.gazePos), num(s.headVel, 1), num(s.gazeVel, 1),
        dentro ? 1 : 0, s.blink ? 1 : 0, num(s.irisPx, 1), num(s.vergMm),
        num(s.crudo?.tMs, 1), num(s.crudo?.yaw), num(s.crudo?.offsetMm),
      ]);
    }
  }
  bajaCsv(filas, 'muestras');
}

// ------------------------------------------------------------------ init ---

$('btn-arrancar').addEventListener('click', () => (estado.corriendo ? detener() : arrancar()));
$('btn-calibrar').addEventListener('click', empiezaCalibracion);
$('btn-borrar').addEventListener('click', borraTodos);
$('btn-descartar').addEventListener('click', descartaUltimo);
$('btn-csv').addEventListener('click', exporta);
$('btn-csv-muestras').addEventListener('click', exportaMuestras);
$('btn-recalcular').addEventListener('click', recalculaTodos);
$('btn-herramientas').addEventListener('click', () => abreHerramientas($('herramientas').hidden));
$('btn-cerrar').addEventListener('click', () => abreHerramientas(false));
$('pausa').addEventListener('change', (e) => {
  estado.pausado = e.target.checked;
  marcaEstado(estado.pausado ? 'pausado' : 'midiendo');
});
$('suavizar').addEventListener('change', (e) => {
  plots.opciones.suavizado = e.target.checked;
  ensucia();
});
window.addEventListener('resize', ensucia);
$('espejo').addEventListener('change', (e) => {
  estado.espejo = e.target.checked;
  $('camara-caja').classList.toggle('espejada', estado.espejo);
});
$('camara').addEventListener('change', () => {
  if (estado.corriendo) {
    detener();
    // Otra cámara es otro sistema de ejes: el cero del yaw no vale.
    estado.head.reiniciar();
    arrancar();
  }
});

sliders();
atajos();
montaBienvenida();
// Modo sin red: ver sw.js. Si el navegador no lo soporta o falla, la página
// funciona igual; solo no queda guardada.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('service worker:', e));
}
pintaListas();
pintaTodo();
marcaEstado('encender la cámara');

// Enganche de consola: `trainhit.estado`, `trainhit.cfg`. Es un repo para
// enseñar — poder revolver el estado desde la consola es parte del punto.
window.trainhit = { estado, cfg, pintaListas, analyzeTrial, procesaCrudo, recalculaTodos };
