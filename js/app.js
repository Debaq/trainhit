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
import { montaTutorial } from './tutorial.js';
import { K_EJEMPLO, PULSOS_EJEMPLO, calibracionDeEjemplo, crudoDeEjemplo } from './ejemplo.js';
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
  /** Cursor de medición en la traza viva: `{ t, ancla }` en segundos, o null. */
  medicion: null,
  /** Cursor en un gráfico de pulsos: `{ id, t, ancla }` en ms, o null. */
  medPulso: null,
  promedio: false,
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
  /**
   * Con pulsos de ejemplo cargados: la calibración que había antes, para
   * devolverla al salir. null cuando se mide de verdad.
   */
  ejemplo: null,
  /** Cuántas veces se apretó «Recalcular»: lo espera un paso del tutorial. */
  recalculados: 0,
  /**
   * El k y la calibración de antes de poner el k a mano, para devolverlos al
   * desmarcar la casilla. null mientras no hay k a mano.
   */
  kAntesManual: null,
};

function vivoVacio() {
  return { offsetMm: null, pxPerMm: null, irisPx: null, yaw: 0, inclinacion: null, azimut: null, blink: false };
}

// ----------------------------------------------------------- carga modelo ---

/** Lo que tarda la carga antes de que valga la pena tapar la pantalla. */
const DEMORA_MODAL_MS = 350;

const MB = (b) => (b / 1048576).toFixed(1);

const FASE_TEXTO = {
  motor: 'Cargando el motor de visión…',
  modelo: 'Descargando el modelo…',
  iniciando: 'Iniciando el modelo…',
};

/**
 * Modal de progreso de la carga del modelo.
 *
 * No se abre de entrada: si el modelo ya está en la caché del service worker
 * la carga dura un suspiro, y un modal que aparece y desaparece es peor que
 * no mostrar nada. Se abre recién si a los `DEMORA_MODAL_MS` la carga sigue.
 */
function modalCarga() {
  const modal = $('carga');
  const barra = $('carga-barra');
  const relleno = barra.querySelector('i');
  let abierto = false;
  const timer = setTimeout(() => {
    abierto = true;
    modal.hidden = false;
  }, DEMORA_MODAL_MS);

  return {
    progreso({ fase, recibido, total }) {
      $('carga-fase').textContent =
        fase === 'modelo' && total
          ? `${FASE_TEXTO.modelo} ${MB(recibido)} de ${MB(total)} MB`
          : fase === 'modelo' && recibido
            ? `${FASE_TEXTO.modelo} ${MB(recibido)} MB`
            : FASE_TEXTO[fase];
      const frac = total ? recibido / total : null;
      barra.classList.toggle('indet', frac === null);
      if (frac === null) {
        barra.removeAttribute('aria-valuenow');
      } else {
        relleno.style.width = `${Math.round(frac * 100)}%`;
        barra.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
      }
    },
    cierra() {
      clearTimeout(timer);
      if (abierto) modal.hidden = true;
    },
  };
}

// ---------------------------------------------------------------- cámara ---

async function arrancar() {
  let carga = null;
  saleDeEjemplo();
  try {
    marcaEstado('pidiendo cámara…');
    estado.stream = await abrirCamara($('video'), { deviceId: $('camara').value || undefined });
    marcaEstado('cargando modelo…');
    if (!estado.landmarker) {
      carga = modalCarga();
      const l = await crearLandmarker({ gpu: true, onProgreso: carga.progreso });
      estado.landmarker = l.landmarker;
      estado.delegate = l.delegate;
      carga.cierra();
      carga = null;
    }
    // Con la descripción del stream, para que el selector marque la cámara que
    // abrió y no la primera de la lista.
    const cam = describeCamara(estado.stream);
    await poblarCamaras(cam);
    estado.corriendo = true;
    $('sin-video').hidden = true;
    // La caja toma la relación de aspecto REAL de la cámara. Sin esto, con una
    // cámara 4:3 en una caja 16:9 el video se recorta y el overlay no: los
    // puntos quedan corridos respecto de los ojos.
    ajustaAspecto();
    estado.bucle = bucleDeFrames($('video'), procesaFrame);
    $('btn-arrancar').textContent = 'Detener';
    avisaTope(cam);
    const notas = [];
    if (estado.delegate === 'CPU') notas.push('modelo en CPU: más lento');
    if (!estado.bucle.soportaRVFC) notas.push('sin rVFC: timestamps peores');
    marcaEstado(notas.length ? `midiendo (${notas.join(' · ')})` : 'midiendo');
  } catch (e) {
    // Si la cámara abrió pero el modelo no cargó, la cámara quedaría
    // encendida y el botón diciendo «Encender»: se apaga todo. El modal de
    // carga también, o el error queda tapado por una barra que no avanza.
    carga?.cierra();
    detener();
    marcaEstado(`error: ${e.message}`);
    console.error(e);
  }
}

function detener() {
  $('fijacion').hidden = true;
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

/**
 * Llena el selector y lo deja marcando la cámara que DE VERDAD está abierta.
 *
 * Es importante que sea la abierta y no la primera de la lista. Al encender
 * sin haber elegido nada, la restricción es `facingMode` y el navegador elige
 * la cámara que quiere; el selector quedaba marcando la primera, que podía ser
 * otra. Además de mentir, dejaba una cámara imposible de elegir: la que el
 * selector ya daba por seleccionada no dispara `change`, así que elegirla en
 * la lista no hacía nada.
 *
 * `getSettings().deviceId` no está en todos los navegadores; ahí se cae al
 * `label` del track, que sí viene una vez concedido el permiso.
 */
async function poblarCamaras(abierta) {
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

  const opciones = [...sel.options];
  const porId = abierta?.deviceId && opciones.find((o) => o.value === abierta.deviceId);
  const porLabel = abierta?.label && opciones.find((o) => o.textContent === abierta.label);
  const elegida = porId || porLabel;
  if (elegida) sel.value = elegida.value;
  else if (previo && opciones.some((o) => o.value === previo)) sel.value = previo;
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
}

function empiezaCalibracion() {
  if (!estado.corriendo) {
    marcaEstado('encender la cámara antes de calibrar');
    return;
  }
  estado.calib = { t0: performance.now(), samples: [], descartadasRapido: 0, descartadasParpadeo: 0, rapidoAhora: false };
  estado.ultimoFit = null;
  sucio.calib = true;
  $('fijacion').hidden = false;
  abreHerramientas(true);
  marcaEstado('calibrando: fijar un punto y mover la cabeza LENTO, ±20°');
}

function cierraCalibracion() {
  const c = estado.calib;
  estado.calib = null;
  sucio.calib = true;
  $('fijacion').hidden = true;
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
  // Una calibración nueva manda sobre el k a mano que hubiera.
  estado.kAntesManual = null;
  $('k-manual-on').checked = false;
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
    // Recalcular no convierte un ejemplo en un pulso medido.
    if (t.ejemplo) nuevo.ejemplo = true;
    anotaConfig(nuevo);
    return nuevo;
  });
  estado.seleccion = estado.trials.find((t) => t.id === idSel) ?? null;
  estado.recalculados++;
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
        <td class="num">#${t.id}${t.ejemplo ? '<i class="ej" title="pulso de ejemplo: paciente sintético">ej</i>' : ''}</td>
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
        (t.calibrado ? '' : '\nmedido SIN calibrar') +
        (t.ejemplo ? '\npulso de EJEMPLO: paciente sintético' : '');
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

  // El reloj de la calibración corre acá y no donde se juntan las muestras:
  // ahí solo se llega con cara detectada, así que una calibración sin cara
  // —el paciente salió del encuadre, la luz se fue— no terminaba nunca y
  // dejaba el punto de fijación puesto para siempre.
  if (estado.calib && (performance.now() - estado.calib.t0) / 1000 >= estado.duracionCalibS) {
    cierraCalibracion();
  }

  const cal = estado.model.calibrated;
  const badge = $('badge-calib');
  // Con los ejemplos la calibración es la del paciente sintético, no la de
  // quien está frente a la cámara: el rótulo no puede decir CALIBRADO a secas.
  if (estado.kAntesManual) {
    badge.textContent = `k A MANO=${fmt(estado.model.kParallax)}`;
    badge.className = 'badge mal';
  } else if (estado.ejemplo) {
    badge.textContent = `EJEMPLO k=${fmt(estado.model.kParallax)}`;
    badge.className = 'badge warn';
  } else {
    badge.textContent = cal ? `CALIBRADO k=${fmt(estado.model.kParallax)}` : 'SIN CALIBRAR';
    badge.className = `badge ${cal ? 'ok' : 'mal'}`;
  }

  const ultima = estado.rolling[estado.rolling.length - 1];
  // El fps que se muestra es el de frames PROCESADOS, no el que da la cámara.
  // Si supera el tope, el tope falló en este dispositivo: se marca en rojo y
  // se enciende el aviso, que es el dato que hace falta para diagnosticarlo.
  const fpsFuera = estado.fps > FPS_MAX * 1.05;
  const chipFps = $('v-fps');
  chipFps.textContent = fmt(estado.fps, 0);
  chipFps.className = fpsFuera ? 'mal' : '';
  if (fpsFuera && $('aviso-fps').hidden) {
    $('aviso-fps').hidden = false;
    $('aviso-fps').title =
      `Se están procesando ${fmt(estado.fps, 0)} fps con el tope puesto en ${FPS_MAX}: ` +
      'el tope no está funcionando en este dispositivo. Los pulsos salen marcados NO VALIDADO.';
  }
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
    // El cursor solo con la traza quieta: sobre una traza que corre, el número
    // que se lee ya es viejo cuando se termina de leer.
    plots.trazaViva($('plot-vivo'), estado.rolling, {
      medicion: estado.pausado ? estado.medicion : null,
    });
    sucio.vivo = false;
  }

  // Con el cajón cerrado sus canvas miden cero; al abrirlo se ensucia todo.
  const herramientas = !$('herramientas').hidden;
  if (sucio.pulsos) {
    const conMedicion = (id) => (estado.medPulso?.id === id ? estado.medPulso : null);
    plots.overlayLado($('plot-der'), estado.trials, 'derecha', cfg, estado.seleccion, {
      promedio: estado.promedio,
      medicion: conMedicion('plot-der'),
    });
    plots.overlayLado($('plot-izq'), estado.trials, 'izquierda', cfg, estado.seleccion, {
      promedio: estado.promedio,
      medicion: conMedicion('plot-izq'),
    });
    if (herramientas) {
      plots.dibujaPulso($('plot-pulso'), estado.seleccion || estado.trials[estado.trials.length - 1], cfg, {
        medicion: conMedicion('plot-pulso'),
      });
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
    // Junto al punto va lo único que el paciente necesita saber mientras fija:
    // cuánto falta, y si se está moviendo demasiado rápido.
    $('fijacion-cuenta').textContent = c.rapidoAhora
      ? '¡MÁS LENTO!'
      : `faltan ${Math.max(0, estado.duracionCalibS - t).toFixed(0)} s · rango ${rango.toFixed(0)}° de ${geom.CALIB_MIN_HEAD_RANGE_DEG}°`;
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
  if (estado.trials.length && !estado.ejemplo && !confirm(`¿Borrar los ${estado.trials.length} pulsos?`)) return;
  estado.trials = [];
  estado.seleccion = null;
  saleDeEjemplo();
  pintaListas();
}

/**
 * Carga el paciente sintético de ejemplo.js, para explorar sin cámara. Toma
 * el lugar de la sesión: mezclar pulsos sintéticos con medidos daría una
 * media que no es de nadie. El paciente trae su propia paralaje, así que se
 * lo «calibra» con ella y se guarda la calibración de antes para devolverla.
 */
function cargaEjemplos() {
  const reales = estado.trials.filter((t) => !t.ejemplo).length;
  if (reales && !confirm(`Los ejemplos reemplazan los ${reales} pulsos medidos. ¿Seguir?`)) return;
  if (estado.corriendo) detener();
  // El k a mano no es la calibración de nadie: se devuelve la de verdad antes
  // de guardarla para cuando se salga de los ejemplos.
  restauraK();
  if (!estado.ejemplo) {
    estado.ejemplo = { k: estado.model.kParallax, calibrado: estado.model.calibrated, fit: estado.ultimoFit };
  }
  // La calibración del paciente sintético pasa por el mismo ajuste que una de
  // verdad, así el gráfico del paralaje muestra su recta.
  const muestras = calibracionDeEjemplo();
  const fit = geom.fitParallax(muestras, estado.model.radiusMm);
  estado.ultimoFit = fit ? { ...fit, muestras } : null;
  sucio.calib = true;
  estado.model.kParallax = fit?.acceptable ? fit.kParallax : K_EJEMPLO;
  estado.model.calibrated = true;
  estado.trials = [];
  PULSOS_EJEMPLO.forEach((p, i) => {
    const { crudo, tTrigger } = crudoDeEjemplo(p, i + 1);
    const trial = procesaCrudo(crudo, tTrigger, estado.model, derivActual(), cfg);
    if (!trial) return;
    trial.id = estado.proximoId++;
    trial.crudo = crudo;
    trial.ejemplo = true;
    anotaConfig(trial);
    estado.trials.push(trial);
  });
  estado.seleccion = estado.trials[estado.trials.length - 1] ?? null;
  pintaListas();
  marcaEstado(`${estado.trials.length} pulsos de ejemplo: paciente sintético, canal izquierdo con déficit`);
}

/** Vuelve a la medición real: se van los ejemplos y vuelve la calibración de antes. */
function saleDeEjemplo() {
  if (!estado.ejemplo) return;
  estado.trials = estado.trials.filter((t) => !t.ejemplo);
  if (estado.seleccion?.ejemplo) estado.seleccion = null;
  estado.model.kParallax = estado.ejemplo.k;
  estado.model.calibrated = estado.ejemplo.calibrado;
  estado.ultimoFit = estado.ejemplo.fit;
  sucio.calib = true;
  estado.ejemplo = null;
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
      estado.kAntesManual ??= { k: estado.model.kParallax, calibrado: estado.model.calibrated };
      estado.model.kParallax = Number($('k-manual').value);
      estado.model.calibrated = false;
      marcaEstado('k puesto a mano: la ganancia NO está calibrada');
    } else {
      restauraK();
    }
  });
  for (const el of document.querySelectorAll('#h-perillas input, #h-perillas select')) {
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', avisaPerillas);
  }
  avisaPerillas();
}

/**
 * Devuelve el k que había antes de ponerlo a mano. Antes desmarcar la casilla
 * dejaba el k manual puesto —y la ganancia sin calibrar— sin decir nada, y el
 * experimento de k = 0 se arrastraba a todo lo que se midiera después.
 */
function restauraK({ recalcula = false } = {}) {
  $('k-manual-on').checked = false;
  const antes = estado.kAntesManual;
  if (!antes) return;
  estado.kAntesManual = null;
  estado.model.kParallax = antes.k;
  estado.model.calibrated = antes.calibrado;
  if (recalcula && estado.trials.length) recalculaTodos();
  marcaEstado(
    `volvió el k de antes (k=${fmt(antes.k)})` +
      (recalcula || !estado.trials.length ? '' : ': «Recalcular» para verlo en los pulsos'),
  );
}

/** Cada perilla con su valor de fábrica, que es el `value` del HTML. */
function perillas() {
  return [...document.querySelectorAll('#h-perillas input[type=range], #h-perillas select')].map((el) => ({
    el,
    nombre: el.closest('.perilla')?.querySelector('span')?.firstChild?.textContent.trim() ?? el.id,
    fabrica: el.tagName === 'SELECT' ? [...el.options].find((o) => o.defaultSelected)?.value : el.defaultValue,
  }));
}

/**
 * La barra avisa mientras alguna perilla no está en su valor de fábrica:
 * los pulsos que se miden así no se comparan con otros, y una ventana de
 * 200 ms olvidada de un paseo no puede pasar desapercibida al medir.
 */
function avisaPerillas() {
  const cambiadas = perillas().filter((p) => p.el.value !== p.fabrica);
  const aviso = $('aviso-perillas');
  aviso.hidden = !cambiadas.length;
  aviso.title = cambiadas.length
    ? `No están en su valor de fábrica: ${cambiadas.map((p) => p.nombre).join(', ')}. «Valores por defecto» en Herramientas.`
    : '';
}

function perillasPorDefecto({ recalcula = false } = {}) {
  for (const p of perillas()) {
    if (p.el.value === p.fabrica) continue;
    p.el.value = p.fabrica;
    p.el.dispatchEvent(new Event(p.el.tagName === 'SELECT' ? 'change' : 'input'));
  }
  avisaPerillas();
  if (recalcula && estado.trials.length) recalculaTodos();
  marcaEstado('perillas en sus valores por defecto' + (recalcula ? '' : ': «Recalcular» para aplicarlas a los pulsos'));
}

/**
 * Pausa el análisis y congela la traza de abajo para poder medirla.
 *
 * La cámara sigue encendida: lo que se detiene es el motor, no el video. La
 * traza queda quieta con lo último que entró, que es lo que hace falta para
 * leerla con el cursor de medición.
 */
function ponPausa(v) {
  estado.pausado = v;
  const b = $('btn-pausa');
  b.setAttribute('aria-pressed', String(v));
  b.innerHTML = v ? 'Reanudar <kbd>Espacio</kbd>' : 'Pausar <kbd>Espacio</kbd>';
  if (!v) estado.medicion = null; // al reanudar no queda un cursor viejo colgado
  $('plot-vivo').classList.toggle('medible', v);
  sucio.vivo = true; // redibuja: al pausar aparece el cursor de medición
  marcaEstado(v ? 'pausado: medí en la traza de abajo (clic fija la referencia)' : 'midiendo');
}

/**
 * ¿El puntero puede pasar por encima sin apretar? Mouse y lápiz sí; el dedo
 * no. Al tacto la regla funciona por toques: el primero pone el cursor, el
 * segundo fija la referencia, arrastrar de costado mide y otro toque la suelta.
 */
const conPasada = (e) => e.pointerType !== 'touch';

/**
 * Cursor de medición en los gráficos de pulsos.
 *
 * Uno solo a la vez, el del gráfico donde está el puntero: dos cursores vivos
 * en paneles distintos se leen como si midieran lo mismo y no es así.
 * Al contrario que la traza viva, acá no hace falta pausar: un pulso ya medido
 * no se mueve más.
 */
function medicionPulsos() {
  // La ventana del eje es la misma para los dos overlays; el pulso solo usa
  // la suya, que son los extremos de sus muestras.
  const ventanaDe = (id) => {
    if (id !== 'plot-pulso') return { x0: -cfg.impulse.preTriggerMs, x1: cfg.impulse.windowMs };
    const t = estado.seleccion || estado.trials[estado.trials.length - 1];
    if (!t?.samples?.length) return null;
    return { x0: t.samples[0].tMs, x1: t.samples[t.samples.length - 1].tMs };
  };

  for (const id of ['plot-der', 'plot-izq', 'plot-pulso']) {
    const cv = $(id);
    cv.classList.add('medible');
    const posicion = (e) => {
      const v = ventanaDe(id);
      return v ? plots.tiempoEnPulso(cv, e.clientX, v) : null;
    };
    cv.addEventListener('pointermove', (e) => {
      const t = posicion(e);
      if (t === null) return;
      estado.medPulso = { id, t, ancla: estado.medPulso?.id === id ? estado.medPulso.ancla : null };
      sucio.pulsos = true;
    });
    cv.addEventListener('pointerdown', (e) => {
      const t = posicion(e);
      if (t === null) return;
      const mismo = estado.medPulso?.id === id;
      estado.medPulso = { id, t, ancla: mismo && estado.medPulso.ancla === null ? t : null };
      sucio.pulsos = true;
    });
    cv.addEventListener('pointerleave', (e) => {
      // Con el dedo no hay «pasar por encima»: levantarlo dispara un
      // `pointerleave`, y si eso borrara el cursor nunca se podría fijar una
      // referencia. Al tacto el cursor queda hasta el próximo toque.
      if (!conPasada(e)) return;
      // Con referencia puesta la medición queda: es lo que se acaba de medir.
      if (estado.medPulso?.id === id && estado.medPulso.ancla === null) {
        estado.medPulso = null;
        sucio.pulsos = true;
      }
    });
  }
}

/**
 * Cursor de medición sobre la traza en vivo congelada.
 *
 * Mover el puntero lee los valores; un clic fija la referencia y a partir de
 * ahí el cartel muestra además los Δ contra ese punto. Otro clic la suelta.
 */
function medicionViva() {
  const cv = $('plot-vivo');
  const mueve = (e) => {
    if (!estado.pausado) return;
    const t = plots.tiempoEnVivo(cv, e.clientX);
    if (t === null) return;
    estado.medicion = { t, ancla: estado.medicion?.ancla ?? null };
    sucio.vivo = true;
  };
  cv.addEventListener('pointermove', mueve);
  cv.addEventListener('pointerdown', (e) => {
    if (!estado.pausado) return;
    const t = plots.tiempoEnVivo(cv, e.clientX);
    if (t === null) return;
    // Segundo clic con referencia puesta: la suelta. Así se mide otro tramo
    // sin tener que salir del gráfico.
    estado.medicion = { t, ancla: estado.medicion?.ancla === null ? t : null };
    sucio.vivo = true;
  });
  cv.addEventListener('pointerleave', (e) => {
    if (!conPasada(e)) return; // al tacto: ver `conPasada`
    // Con referencia puesta la medición queda a la vista aunque el puntero se
    // vaya: es lo que se acaba de medir y se quiere leer.
    if (estado.pausado && estado.medicion && estado.medicion.ancla === null) {
      estado.medicion = null;
      sucio.vivo = true;
    }
  });
}

function atajos() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    // Ctrl+C es copiar, Ctrl+D marcador, Ctrl+R recargar: no son atajos de acá.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!$('bienvenida').hidden || tutorial.bloqueaAtajos()) return;
    const k = e.key.toLowerCase();
    if (k === 't') tutorial.abierto() ? tutorial.cierra() : tutorial.abre();
    else if (k === 'c') empiezaCalibracion();
    else if (k === 'r') borraTodos();
    else if (k === 'd') descartaUltimo();
    else if (k === 'h') abreHerramientas($('herramientas').hidden);
    else if (k === ' ' || k === 'p') {
      // `preventDefault` acá no es solo para que la página no haga scroll: si
      // el foco quedó en un botón —y queda, apenas se aprieta «Encender
      // cámara»— el espacio ACCIONA ese botón. El atajo pausaba y de paso
      // apagaba la cámara. El click por teclado sale en el keyup y esto lo
      // cancela.
      e.preventDefault();
      ponPausa(!estado.pausado);
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

/**
 * Las dos tablas en un archivo, una abajo de la otra y con su título.
 *
 * Eran dos descargas y había que acordarse de bajar las dos; separadas, el
 * resumen y las muestras que lo producen terminaban en carpetas distintas.
 * Van con una línea `# TABLA: …` adelante y una vacía en medio, que es como
 * las planillas cortan un CSV en bloques.
 */
function exportaTodo() {
  const filas = [
    ['# TABLA: pulsos'],
    ...filasPulsos(),
    [],
    ['# TABLA: muestras'],
    ...filasMuestras(),
  ];
  bajaCsv(filas, 'sesion');
}

/** Un pulso por fila, con la configuración con la que se calculó. */
function filasPulsos() {
  const version = document.documentElement.dataset.v ?? '';
  const filas = [
    [
      'id', 'lado', 'pico_cabeza_deg_s', 'duracion_ms', 'ganancia_area', 'ganancia_60ms', 'ganancia_pico',
      'rechazo', 'calibrado', 'k', 'iris_min_px', 'disconj_mm', 'hueco_max_ms', 'deriv_ventana_ms', 'deriv_grado',
      'fps_muestreo', 'no_validado', 'ejemplo', 'version',
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
      num(t.fpsMuestreo, 1),
      t.noValidado ? 'si' : 'no',
      t.ejemplo ? 'si' : 'no',
      version,
    ]),
  ];
  return filas;
}

/**
 * Una muestra por fila, de todos los pulsos: lo derivado (lo que se grafica y
 * de donde sale la ganancia) y, al lado, lo crudo del frame que cerró esa
 * ventana del derivador. Es lo que hace falta para rehacer el cálculo en una
 * planilla.
 */
function filasMuestras() {
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
  return filas;
}

// ------------------------------------------------------------------ init ---

$('btn-arrancar').addEventListener('click', () => (estado.corriendo ? detener() : arrancar()));
$('btn-calibrar').addEventListener('click', empiezaCalibracion);
$('btn-borrar').addEventListener('click', borraTodos);
$('btn-descartar').addEventListener('click', descartaUltimo);
$('btn-csv').addEventListener('click', exportaTodo);
$('btn-recalcular').addEventListener('click', recalculaTodos);
$('btn-defecto').addEventListener('click', () => perillasPorDefecto());
$('btn-herramientas').addEventListener('click', () => abreHerramientas($('herramientas').hidden));
$('btn-cerrar').addEventListener('click', () => abreHerramientas(false));
$('btn-pausa').addEventListener('click', () => ponPausa(!estado.pausado));
$('promedio').addEventListener('change', (e) => {
  estado.promedio = e.target.checked;
  sucio.pulsos = true;
});
$('orientacion').addEventListener('change', (e) => {
  plots.ORIENTACION.modo = e.target.value;
  // La leyenda tiene que decir la verdad: en «real» la traza ocular va cruda,
  // o sea para el lado contrario que la cabeza.
  $('leyenda-ojo').textContent = e.target.value === 'real' ? 'ojo (crudo)' : 'ojo (invertido)';
  sucio.pulsos = true;
  sucio.vivo = true;
});
$('suavizar').addEventListener('change', (e) => {
  plots.opciones.suavizado = e.target.checked;
  ensucia();
});
window.addEventListener('resize', ensucia);
$('espejo').addEventListener('change', (e) => {
  estado.espejo = e.target.checked;
  $('camara-caja').classList.toggle('espejada', estado.espejo);
  $('ojos').classList.toggle('espejada', estado.espejo);
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
medicionViva();
medicionPulsos();
const bienvenida = montaBienvenida();
// El recorrido del tutorial espera cosas de la medición real: por eso se
// monta acá, con acceso al estado, y no en su módulo.
const tutorial = montaTutorial({
  instantanea: () => ({ recalculados: estado.recalculados }),
  condiciones: {
    cara: () => estado.corriendo && estado.caraOk,
    // La calibración del paciente de ejemplo no es la de quien está frente a
    // la cámara: no cuenta como «calibrado» para el paso de calibrar.
    calibrado: () => estado.model.calibrated && !estado.ejemplo,
    pulso: () => estado.trials.length > 0,
    // Un Recalcular hecho DURANTE el paso, no uno de otro paseo.
    recalculado: (desde) => estado.recalculados > desde.recalculados,
  },
  acciones: {
    abreHerramientas: () => abreHerramientas(true),
    cierraHerramientas: () => abreHerramientas(false),
    cargaEjemplos,
    restauraK: () => restauraK({ recalcula: true }),
    restauraPerillas: () => perillasPorDefecto({ recalcula: true }),
  },
});
$('btn-tutorial').addEventListener('click', () => {
  bienvenida.cierra();
  tutorial.abre();
});
$('btn-aprender').addEventListener('click', () => tutorial.abre());
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
