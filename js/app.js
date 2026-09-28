// trainHIT — motor e interfaz.
//
// El hilo es: landmarks -> ángulos -> velocidades -> pulsos -> ganancia.
// Cada paso está en su módulo; aquí solo se los conecta y se los muestra.

import * as geom from './geom.js';
import { CANAL_AXIS, CANALES_DEL_PLANO, GIRO_DEL_PLANO, GUIA_PLANO, HeadTracker, TITULO_CANAL, quatFromMatrix, quatRotate } from './head.js';
import { Differentiator } from './signal.js';
import { CONFIG, RECHAZO_TEXT, SIGNO_DERECHA, analyzeTrial, asimetria, resumenLado } from './analysis.js';
import * as plots from './plots.js';
import { FPS_MAX, IDX, abrirCamara, bucleDeFrames, crearLandmarker, describeCamara, listarCamaras } from './tracker.js';
import { montaBienvenida } from './bienvenida.js';
import { montaTutorial } from './tutorial.js';
import { K_EJEMPLO, calibracionDeEjemplo, crudoDeEjemplo, pulsosDe } from './ejemplo.js';
import { MARGEN_CRUDO_MS, procesaCrudo } from './pipeline.js';
import { leeSesion, textoSesion } from './sesion.js';
import { textoGift } from './preguntas.js';
import { PERFILES, arrastre, offsetConMirada, parametrosPulso, simulaCrudo } from './simulacion.js';
import { IDIOMAS, alCambiarIdioma, idioma, idiomaInicial, ponIdioma, tx } from './idioma.js';
import { alCambiarTema, ponTema, siguienteTema, tema } from './tema.js';
import { MIN_POR_LADO, corrige, preguntasPractica } from './practica.js';
import * as cara from './cara.js';
import { Remuestreo } from './giroscopio.js';
import { montaTelefono } from './telefono.js';

/**
 * El Laberinto 3D, que nació aquí, vive en su propio sitio: Labyrinthus 3D
 * (github.com/Debaq/labyrinthus3d). trainHIT solo lo enlaza.
 */
const LABYRINTHUS_URL = 'https://tecmedhub.org/labyrinthus3d/';

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
  /** Pulsos descartados, el último al final: `Z` los devuelve. */
  papelera: [],
  /** Los pulsos antes del último Recalcular (ver `fotoAntes`), o null. */
  antes: null,
  /**
   * Paciente simulado (ver simulacion.js). `eleccion` es lo que dice el
   * selector —puede ser «azar»—; `perfil`, el que se aplica de verdad.
   * `practica`, con «Voy a tener suerte» (ver practica.js): `{ fase, respuestas }`,
   * con `fase` 'examinar', 'responder' o 'revelado'. null fuera de la práctica.
   */
  sim: { eleccion: '', perfil: null, ciego: false, revelado: false, mostrarReal: false, semilla: 1, practica: null },
  /** El pulso simulado en curso, para la traza en vivo: ver `simulaEnVivo`. */
  simVivo: null,
  /**
   * Con el teléfono como cabeza (ver `entraTelefono`): la calibración de
   * antes, para devolverla al salir, y el remuestreo. null con la webcam.
   */
  telefono: null,
  /**
   * El plano de canales que se examina (head.js): 'lateral', 'larp' o
   * 'ralp'. Con la webcam siempre el lateral; los verticales, solo con el
   * teléfono. Los paneles, las medias y la nube muestran los pulsos de este plano.
   */
  plano: 'lateral',
};

function vivoVacio() {
  return { offsetMm: null, pxPerMm: null, irisPx: null, yaw: 0, inclinacion: null, azimut: null, blink: false, simDeltaMm: 0, q: null, giro: null };
}

// ----------------------------------------------------------- carga modelo ---

/** Lo que tarda la carga antes de que valga la pena tapar la pantalla. */
const DEMORA_MODAL_MS = 350;

const MB = (b) => (b / 1048576).toFixed(1);

const FASE_TEXTO = {
  motor: () => tx('Cargando el motor de visión…'),
  modelo: () => tx('Descargando el modelo…'),
  iniciando: () => tx('Iniciando el modelo…'),
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
          ? `${FASE_TEXTO.modelo()} ${tx('{a} de {b} MB', { a: MB(recibido), b: MB(total) })}`
          : fase === 'modelo' && recibido
            ? `${FASE_TEXTO.modelo()} ${MB(recibido)} MB`
            : FASE_TEXTO[fase]();
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
  telefono?.termina();
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
    pintaArrancar();
    avisaTope(cam);
    const notas = [];
    if (estado.delegate === 'CPU') notas.push(tx('modelo en CPU: más lento'));
    if (!estado.bucle.soportaRVFC) notas.push(tx('sin rVFC: timestamps peores'));
    marcaEstado(notas.length ? 'midiendo ({notas})' : 'midiendo', { notas: notas.join(' · ') });
  } catch (e) {
    // Si la cámara abrió pero el modelo no cargó, la cámara quedaría
    // encendida y el botón diciendo «Encender»: se apaga todo. El modal de
    // carga también, o el error queda tapado por una barra que no avanza.
    carga?.cierra();
    detener();
    marcaEstado('error: {msg}', { msg: e.message });
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
  pintaArrancar();
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
    aviso.title = tx(
      'Esta cámara puede entregar {fps} fps. trainHIT procesa como mucho {max}: es una herramienta didáctica, y el tope está puesto a propósito para que no se use como equipo médico.',
      { fps: Math.round(cam.fpsMax ?? cam.fps), max: FPS_MAX },
    );
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
    o.textContent = c.label || tx('cámara {n}', { n: i + 1 });
    sel.appendChild(o);
  });

  const opciones = [...sel.options];
  const porId = abierta?.deviceId && opciones.find((o) => o.value === abierta.deviceId);
  const porLabel = abierta?.label && opciones.find((o) => o.textContent === abierta.label);
  const elegida = porId || porLabel;
  if (elegida) sel.value = elegida.value;
  else if (previo && opciones.some((o) => o.value === previo)) sel.value = previo;
}

// -------------------------------------------------------------- teléfono ---
//
// El teléfono como cabeza (telefono.js): sin cámara ni MediaPipe. El giro
// llega del giroscopio y se lo pasa a cuadros de 60 Hz (`Remuestreo`); el ojo
// lo pone el modelo, sano —la mirada quieta en el blanco, `offsetSano`— y con
// el perfil del Simulador encima, igual que un pulso de la webcam. En el
// recuadro de la cámara se ve la cara dibujada de ese modelo (cara.js).
//
// Es todo simulado: no hay a quién medir, así que el tope de fps de la webcam
// no viene al caso. Los cuadros van a 60 Hz porque así el motor, sus perillas
// y la marca de NO VALIDADO se comportan igual que con la cámara.
//
// Los pulsos quedan marcados `telefono`. Como los ejemplos, no se mezclan con
// los de la webcam: al encender la cámara se van.
//
// Con el teléfono se examinan también los canales verticales. El teléfono
// manda el giro por eje en el marco de la cabeza y la orientación entera; el
// motor recibe el giro en el PLANO elegido (`estado.plano`), el producto por
// su eje, y todo lo demás —el ojo del modelo, el simulador, las ganancias—
// corre igual que en el lateral. Lo que se giró fuera del plano va aparte y
// rechaza el pulso si es mucho (`desvioDelPlano`, analysis.js).

/** El diálogo del enlace (telefono.js); se monta con lo demás, al final. */
let telefono = null;
/** La cara dibujada, fuera de pantalla: de ahí salen el recuadro y los ojos ampliados. */
const lienzoCara = document.createElement('canvas');
/** Sin eventos del teléfono en este tiempo, se da por quieto: «cara: no». */
const TELEFONO_MUDO_MS = 500;

function entraTelefono() {
  if (estado.telefono) return;
  if (estado.corriendo) detener();
  saleDeEjemplo();
  // El k a mano no es la calibración de nadie: se devuelve la de verdad antes
  // de guardarla para cuando se salga.
  restauraK();
  estado.telefono = {
    k: estado.model.kParallax,
    calibrado: estado.model.calibrated,
    fit: estado.ultimoFit,
    remuestreo: new Remuestreo(),
    cuenta: { n: 0, t0: performance.now() },
    ultimo: -Infinity,
  };
  // El ojo dibujado tiene el paralaje del paciente de ejemplo y el motor lo
  // lee con ese mismo k: no hay nada que calibrar.
  estado.model.kParallax = K_EJEMPLO;
  estado.model.calibrated = true;
  estado.ultimoFit = null;
  sucio.calib = true;
  reseteaTransitorio();
  $('video').hidden = true;
  $('sin-video').hidden = true;
  $('camara-caja').style.aspectRatio = `${cara.ANCHO} / ${cara.ALTO}`;
  sucio.vivo = true;
  pintaPlanos();
  marcaEstado('esperando al teléfono: escanear el QR');
}

/** Vuelve a la cámara: se van los pulsos del teléfono y vuelve la calibración de antes. */
function saleTelefono() {
  const tel = estado.telefono;
  if (!tel) return;
  estado.telefono = null;
  estado.trials = estado.trials.filter((t) => !t.telefono);
  if (estado.seleccion?.telefono) estado.seleccion = null;
  vaciaPapelera();
  olvidaAntes();
  estado.model.kParallax = tel.k;
  estado.model.calibrated = tel.calibrado;
  estado.ultimoFit = tel.fit;
  sucio.calib = true;
  estado.plano = 'lateral';
  pintaPlanos();
  reseteaTransitorio();
  $('video').hidden = false;
  $('sin-video').hidden = estado.corriendo;
  $('camara-caja').style.aspectRatio = '';
  sucio.vivo = true;
  pintaListas();
  marcaEstado('encender la cámara');
}

/** Un evento del teléfono: la hora del teléfono en ms, el giro por eje en grados y la orientación. */
function giroTelefono(tMs, giro, q) {
  const tel = estado.telefono;
  if (!tel) return;
  const { cuadros, corte } = tel.remuestreo.empuja(tMs, giro, q);
  // Un corte —el teléfono se durmió o recargó la página— rompe la
  // continuidad: el derivador y el pulso en curso no pueden seguir de largo.
  if (corte) cortaTelefono();
  for (const c of cuadros) cuadroTelefono(c.t, c.giro, c.q);
  const ahora = performance.now();
  tel.ultimo = ahora;
  tel.cuenta.n += cuadros.length;
  if (ahora - tel.cuenta.t0 >= 1000) {
    estado.fps = (tel.cuenta.n * 1000) / (ahora - tel.cuenta.t0);
    tel.cuenta = { n: 0, t0: ahora };
  }
}

function cortaTelefono() {
  estado.rolling = [];
  estado.crudo = [];
  estado.captura = null;
  estado.simVivo = null;
  estado.refractarioHasta = -Infinity;
  estado.diff.reset();
}

function cuadroTelefono(t, giro, q) {
  // El giro en el plano del canal es el producto por su eje; lo que sobra es
  // lo que se giró fuera del plano.
  const eje = CANAL_AXIS[estado.plano];
  const enPlano = eje[0] * giro[0] + eje[1] * giro[1] + eje[2] * giro[2];
  const fuera = giro.map((g, i) => g - enPlano * eje[i]);
  const obs = { offsetMm: cara.offsetSano(enPlano, estado.model), pxPerMm: cara.PX_POR_MM, radiusPx: cara.IRIS_PX };
  estado.vivo.q = q;
  estado.vivo.giro = giro;
  if (estado.pausado) {
    estado.vivo.yaw = enPlano;
    estado.vivo.offsetMm = obs.offsetMm;
    return;
  }
  procesaMuestra(t, enPlano, obs, { blinkScore: 0, vergMm: 0, inclinacion: null, fuera });
}

/**
 * La cara en el recuadro de la cámara, con los puntos que habría marcado
 * MediaPipe, y los dos ojos ampliados recortados de ella: lo mismo que se ve
 * con la webcam.
 */
function dibujaCaraTelefono() {
  const yaw = estado.vivo.yaw ?? 0;
  const offset = estado.vivo.offsetMm ?? cara.offsetSano(yaw, estado.model);
  // La mirada que lee el motor, en el plano: con el ojo sano, cero.
  const mirada = estado.model.gazeAzimuthDeg({ offsetMm: offset }, yaw) ?? 0;
  const pose = estado.vivo.q ? cara.pose(estado.vivo.q, CANAL_AXIS[estado.plano], mirada) : cara.poseLateral(yaw, mirada);
  const geo = cara.dibujaCara(lienzoCara, pose, estado.model);
  const lms = cara.landmarks(geo, IDX);
  const overlay = $('overlay');
  if (overlay.width !== cara.ANCHO || overlay.height !== cara.ALTO) {
    overlay.width = cara.ANCHO;
    overlay.height = cara.ALTO;
  }
  const ctx = overlay.getContext('2d');
  ctx.drawImage(lienzoCara, 0, 0);
  plots.dibujaPuntos(ctx, lms, IDX, cara.ANCHO, cara.ALTO);
  const P = (i) => geom.px(lms[i], cara.ANCHO, cara.ALTO);
  for (const [canvas, ojo] of [
    ['ojo-der', IDX.derecho],
    ['ojo-izq', IDX.izquierdo],
  ]) {
    const crop = geom.eyeCrop(P(ojo.outer), P(ojo.inner), cara.ANCHO, cara.ALTO);
    plots.dibujaOjo($(canvas), lienzoCara, crop, lms, ojo, estado.espejo);
  }
}

/**
 * El selector de plano: se ve con el teléfono, o si hay pulsos verticales
 * (importados) que mirar. Dice cómo se pone la cabeza para el plano elegido.
 */
function pintaPlanos() {
  const hayVerticales = estado.trials.some((t) => (t.canal ?? 'lateral') !== 'lateral');
  $('planos').hidden = !estado.telefono && !hayVerticales && estado.plano === 'lateral';
  for (const b of $('planos').querySelectorAll('[data-plano]')) b.setAttribute('aria-checked', String(b.dataset.plano === estado.plano));
  $('plano-guia').textContent = tx(GUIA_PLANO[estado.plano]);
}

/** Cuánto está girada la cabeza ahora, contra lo que pide el plano: se pinta en cada cuadro. */
function pintaGiroPlano() {
  const giro = estado.telefono && estado.vivo.giro ? estado.vivo.giro[1] : null;
  const el = $('plano-giro');
  el.hidden = giro === null;
  if (giro === null) return;
  const bien = Math.abs(giro - GIRO_DEL_PLANO[estado.plano]) <= 10;
  el.textContent = tx(Math.abs(giro) < 3 ? 'cabeza de frente' : giro > 0 ? 'cabeza {g}° a la izquierda' : 'cabeza {g}° a la derecha', {
    g: fmt(Math.abs(giro), 0),
  });
  el.className = `plano-giro ${bien ? 'ok' : 'mal'}`;
}

function cambiaPlano(plano) {
  if (!CANAL_AXIS[plano] || plano === estado.plano) return;
  estado.plano = plano;
  // Lo que venía del plano anterior no es continuo con el nuevo: el giro en
  // el plano cambia de golpe y el derivador vería un salto.
  if (estado.telefono) cortaTelefono();
  if (estado.seleccion && (estado.seleccion.canal ?? 'lateral') !== plano) estado.seleccion = null;
  olvidaAntes();
  pintaListas();
  ensucia();
  marcaEstado(GUIA_PLANO[plano]);
}

/** El rótulo de la barra: si hay teléfono y por dónde va. */
function pintaBadgeTelefono() {
  const e = telefono?.estado();
  const badge = $('badge-telefono');
  badge.hidden = !e;
  if (!e) return;
  badge.textContent = !e.conectado
    ? e.algunaVez
      ? tx('RECONECTANDO AL TELÉFONO…')
      : tx('ESPERANDO AL TELÉFONO…')
    : e.relevo
      ? tx('TELÉFONO · POR EL SERVIDOR')
      : tx('TELÉFONO ENLAZADO');
  badge.className = `badge ${e.conectado ? 'ok' : 'warn'}`;
  if (e.conectado) marcaEstado('teléfono enlazado: los impulsos se dan con el teléfono');
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
  // Se guarda el PUNTAJE y no el sí/no: así la perilla de parpadeo también
  // se puede recalcular sobre pulsos ya medidos (ver `procesaCrudo`).
  const blinkScore = Math.max(
    geom.blinkScore(apertura(IDX.derecho) ?? geom.EYE_OPEN_REF),
    geom.blinkScore(apertura(IDX.izquierdo) ?? geom.EYE_OPEN_REF),
  );

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

  procesaMuestra(mediaTime, yaw, obs, { blinkScore, vergMm, inclinacion });
}

/**
 * Del giro de la cabeza y el ojo de un cuadro, a la traza y los pulsos. Es el
 * tramo que comparten la webcam (`procesaFrame`) y el teléfono
 * (`cuadroTelefono`): de aquí en adelante el motor no sabe de dónde vino.
 *
 * @param {number} t hora del cuadro, en s
 * @param {number} yaw giro de la cabeza en el plano del canal, en grados: el yaw en el lateral
 * @param {{offsetMm:number, pxPerMm:number, radiusPx:number}} obs el ojo
 */
function procesaMuestra(t, yaw, obs, { blinkScore, vergMm, inclinacion, fuera = null }) {
  const blink = blinkScore > cfg.blinkScore;
  estado.vivo.offsetMm = obs.offsetMm;
  estado.vivo.pxPerMm = obs.pxPerMm;
  estado.vivo.irisPx = obs.radiusPx;
  estado.vivo.yaw = yaw;
  estado.vivo.inclinacion = inclinacion;
  estado.vivo.blink = blink;

  juntaCalibracion(obs, yaw, blink);

  // Paciente simulado: lo que el motor ve en vivo lleva el arrastre del
  // perfil. El crudo guarda lo REAL; al cerrar el pulso la simulación se
  // rehace entera sobre él (`simulaPulso`), que es lo que queda en la lista.
  const offsetVisto = simulaEnVivo(t, yaw, obs.offsetMm);
  estado.vivo.simDeltaMm = offsetVisto - obs.offsetMm;
  estado.vivo.offsetMm = offsetVisto;
  const gaze = estado.model.gazeAzimuthDeg({ offsetMm: offsetVisto }, yaw);
  estado.vivo.azimut = gaze;

  estado.crudo.push({ t, yaw, offsetMm: obs.offsetMm, blinkScore, irisPx: obs.radiusPx, vergMm, ...(fuera && { fuera }) });
  while (estado.crudo.length && t - estado.crudo[0].t > plots.SEGUNDOS_VIVO) estado.crudo.shift();

  const d = estado.diff.push({ t, headDeg: yaw, gazeDeg: gaze });
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
  if (estado.telefono) {
    marcaEstado('con el teléfono no hace falta calibrar: el paralaje de la cara dibujada es conocido');
    return;
  }
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
    marcaEstado('calibración RECHAZADA — {motivo}', { motivo: tx(geom.CALIB_ISSUE_TEXT[fit.issue]) });
    return;
  }
  estado.model.kParallax = fit.kParallax;
  estado.model.calibrated = true;
  // Una calibración nueva manda sobre el k a mano que hubiera.
  estado.kAntesManual = null;
  $('k-manual-on').checked = false;
  marcaEstado(fit.kPlausible ? 'calibrado: k={k} · residuo {res}°' : 'calibrado: k={k} · residuo {res}° · k fuera del rango anatómico ({rango}): repetir', {
    k: fmt(fit.kParallax),
    res: fmt(fit.residualDeg, 1),
    rango: geom.CALIB_K_PLAUSIBLE.join('–'),
  });
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
    if (estado.sim.perfil) {
      const lado = m.headVel * SIGNO_DERECHA > 0 ? 'derecha' : 'izquierda';
      estado.simVivo = {
        tTrigger: m.t,
        lado,
        params: parametrosPulso(estado.sim.perfil, lado, semillaPulso(estado.proximoId), estado.plano),
        cuadros: estado.crudo.filter((c) => c.t >= m.t - 0.15).map((c) => ({ t: c.t, yaw: c.yaw })),
      };
    }
  }
}

/** Cuánto dura la simulación en vivo de un pulso: la ventana y un poco más. */
const SIM_VIVO_S = 1;

/**
 * El corrimiento del iris que ve el motor en vivo con el perfil puesto. Es la
 * misma cuenta que `simulaCrudo`, hecha cuadro a cuadro sobre lo que va
 * llegando: así la traza de abajo muestra el arrastre y la sacada mientras se
 * examina, no recién en la lista.
 */
function simulaEnVivo(t, yaw, offsetMm) {
  const v = estado.simVivo;
  if (!v) return offsetMm;
  if (t > v.tTrigger + SIM_VIVO_S) {
    estado.simVivo = null;
    return offsetMm;
  }
  v.cuadros.push({ t, yaw });
  const d = arrastre(v.cuadros, v.tTrigger, v.params);
  return offsetConMirada(offsetMm, yaw, d[d.length - 1], estado.model);
}

/** Semilla de un pulso: cambia con cada perfil elegido, fija dentro de él. */
function semillaPulso(id) {
  return estado.sim.semilla * 1000 + id;
}

/**
 * Pone el perfil sobre el crudo real de un pulso y lo vuelve a analizar. Usa
 * los parámetros que ya se sortearon en vivo si el lado coincide, para que la
 * lista muestre el mismo pulso que se vio pasar abajo.
 */
function simulaPulso(real, crudo, tTrigger) {
  const v = estado.simVivo?.tTrigger === tTrigger ? estado.simVivo : null;
  const params = v?.lado === real.side ? v.params : parametrosPulso(estado.sim.perfil, real.side, semillaPulso(estado.proximoId), estado.plano);
  const crudoSim = simulaCrudo(crudo, tTrigger, params, estado.model);
  const t = procesaCrudo(crudoSim, tTrigger, estado.model, derivActual(), cfg);
  if (!t) return null;
  return Object.assign(t, { crudo: crudoSim, crudoReal: crudo, simulado: estado.sim.perfil, simParams: params });
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
  let trial = procesaCrudo(crudo, cap.tTrigger, estado.model, derivActual(), cfg);
  if (!trial) return;
  if (estado.sim.perfil) trial = simulaPulso(trial, crudo, cap.tTrigger) ?? trial;
  trial.id = estado.proximoId++;
  trial.crudo ??= crudo;
  if (estado.telefono) trial.telefono = true;
  trial.canal = estado.plano;
  anotaConfig(trial);
  estado.trials.push(trial);
  estado.seleccion = trial;
  olvidaAntes();
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
  estado.antes = fotoAntes();
  estado.trials = estado.trials.map((t) => {
    if (!t.crudo) return t;
    // Con «Ver lo real», los simulados se calculan sobre su crudo sin simular.
    const real = estado.sim.mostrarReal && t.crudoReal;
    const nuevo = procesaCrudo(real ? t.crudoReal : t.crudo, t.tTrigger, estado.model, derivActual(), cfg);
    if (!nuevo) return t;
    nuevo.id = t.id;
    nuevo.crudo = t.crudo;
    if (t.simulado) {
      Object.assign(nuevo, { simulado: t.simulado, crudoReal: t.crudoReal, simParams: t.simParams, muestraReal: Boolean(real) });
    }
    // Recalcular no convierte un ejemplo (ni uno importado) en un pulso medido.
    if (t.ejemplo) nuevo.ejemplo = true;
    if (t.telefono) nuevo.telefono = true;
    nuevo.canal = t.canal;
    if (t.importado) Object.assign(nuevo, { importado: true, ejemploEnArchivo: t.ejemploEnArchivo });
    anotaConfig(nuevo);
    return nuevo;
  });
  estado.seleccion = estado.trials.find((t) => t.id === idSel) ?? null;
  estado.recalculados++;
  pintaListas();
  marcaEstado('{n} pulsos recalculados con la configuración actual: tachado, lo de antes', { n: estado.trials.length });
}

/**
 * Cómo estaban los pulsos antes de recalcular. Recalcular pisaba los números
 * y el efecto de una perilla había que recordarlo de memoria: con la foto, la
 * lista muestra el valor viejo tachado al lado del nuevo, los paneles la media
 * de antes y la nube los puntos de antes unidos a los de ahora.
 */
function fotoAntes() {
  const lado = (side) => resumenLado(delPlano(), side);
  const der = lado('derecha');
  const izq = lado('izquierda');
  return {
    porId: new Map(estado.trials.map((t) => [t.id, { gain: t.gain, rejected: t.rejected, peak: t.peakHeadDegS, side: t.side }])),
    derecha: der,
    izquierda: izq,
    asim: asimetria(der.media, izq.media),
  };
}

/** Los pulsos del plano que se examina: los que van a los paneles, las medias y la nube. */
function delPlano(trials = estado.trials) {
  return trials.filter((t) => (t.canal ?? 'lateral') === estado.plano);
}

/** La comparación vale contra el recálculo; cualquier otro cambio de pulsos la vence. */
function olvidaAntes() {
  estado.antes = null;
}

// ------------------------------------------------------------------- UI ----

/**
 * La barra de estado. Recibe la frase en español y sus `vars`, no el texto
 * ya traducido: así al cambiar de idioma se vuelve a escribir la última.
 */
let ultimoEstado = ['encender la cámara'];
function marcaEstado(frase, vars) {
  ultimoEstado = [frase, vars];
  $('estado').textContent = tx(frase, vars);
}

/** Qué hacer con el rechazo de un pulso: la parte corta, antes de « —». */
const motivoCorto = (rechazo) => tx(RECHAZO_TEXT[rechazo]).split(' —')[0];

function pintaListas() {
  sucio.pulsos = true;
  for (const [lado, tbodyId] of [
    ['derecha', 'lista-der'],
    ['izquierda', 'lista-izq'],
  ]) {
    const tbody = $(tbodyId);
    tbody.innerHTML = '';
    for (const t of delPlano().filter((x) => x.side === lado)) {
      const tr = document.createElement('tr');
      tr.className = t === estado.seleccion ? 'sel' : '';
      tr.tabIndex = 0;
      const estadoTxt = t.rejected ? motivoCorto(t.rejected) : 'OK';
      tr.innerHTML = `
        <td class="num">#${t.id}${
          t.simulado ? `<i class="ej simtag" title="${tx('paciente simulado: patología agregada a un pulso real')}">${tx('sim')}</i>` : ''
        }${
          t.importado
            ? `<i class="ej" title="${tx('pulso importado de un CSV')}">${tx('imp')}</i>`
            : t.ejemplo
              ? `<i class="ej" title="${tx('pulso de ejemplo: paciente sintético')}">${tx('ej')}</i>`
              : t.telefono
                ? `<i class="ej" title="${tx('pulso del teléfono: cara dibujada, sin cámara')}">${tx('tel')}</i>`
                : ''
        }${
          t.calibrado ? '' : `<i class="sc" title="${tx('medido sin calibrar: la ganancia incluye el paralaje')}">${tx('s/c')}</i>`
        }</td>
        <td>${fmt(t.peakHeadDegS, 0)} °/s</td>
        <td>${fmt(t.durationMs, 0)} ms</td>
        <td class="g${t.calibrado ? '' : ' sin'}">${antesDe(t)}${fmt(t.gain)}</td>
        <td class="sac">${(t.sacadas ?? [])
          .map((s) => `<i class="${s.tipo === 'encubierta' ? 'c-covert' : 'c-overt'}" title="${tx(s.tipo === 'encubierta' ? 'sacada encubierta' : 'sacada manifiesta')}">▼</i>`)
          .join('')}</td>
        <td class="est ${t.rejected ? 'mal' : 'ok'}">${estadoTxt}</td>
        <td class="acc"><button class="x" title="${tx('descartar')}" aria-label="${tx('descartar el pulso {id}', { id: t.id })}">✕</button></td>`;
      const descarta = () => tiraAPapelera(t);
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
      const nSac = (tipo) => (t.sacadas ?? []).filter((s) => s.tipo === tipo).length;
      const a = cambio(t);
      tr.title = [
        tx('área {area} · 60 ms {i60} · pico {pico}', { area: fmt(t.gain), i60: fmt(t.gains?.instant60ms), pico: fmt(t.gains?.peak) }),
        tx('sacadas: {enc} encubiertas, {man} manifiestas · hasta la sacada ≈ {desac}', {
          enc: nSac('encubierta'),
          man: nSac('manifiesta'),
          desac: fmt(t.gains?.desacadizada),
        }),
        tx('iris {iris} px · ojos {ojos} mm · hueco {hueco} ms', { iris: fmt(t.irisPx, 1), ojos: fmt(t.disconjMm), hueco: fmt(t.gapMs, 0) }),
        tx('k {k} · derivador {win} ms grado {grado}', { k: fmt(t.k), win: t.deriv?.windowMs, grado: t.deriv?.degree }),
        t.rejected && tx(RECHAZO_TEXT[t.rejected]),
        !t.calibrado && tx('medido SIN calibrar'),
        t.ejemplo && tx('pulso de EJEMPLO: paciente sintético'),
        t.telefono && tx('pulso del TELÉFONO: cara dibujada, sin cámara'),
        a && tx('antes de recalcular: {g} {est}', { g: fmt(a.gain), est: a.rejected ? motivoCorto(a.rejected) : 'OK' }),
      ]
        .filter(Boolean)
        .join('\n');
      tbody.appendChild(tr);
    }
  }

  for (const [lado, id] of [
    ['derecha', 'titulo-der'],
    ['izquierda', 'titulo-izq'],
  ]) {
    $(id).textContent = tx(TITULO_CANAL[CANALES_DEL_PLANO[estado.plano][lado]]);
  }
  pintaPlanos();

  const der = resumenLado(delPlano(), 'derecha');
  const izq = resumenLado(delPlano(), 'izquierda');
  for (const [r, lado, ganId, metaId] of [
    [der, 'derecha', 'gan-der', 'meta-der'],
    [izq, 'izquierda', 'gan-izq', 'meta-izq'],
  ]) {
    const g = $(ganId);
    g.textContent = r.n ? (r.n > 1 ? `${fmt(r.media)} ± ${fmt(r.de)}` : fmt(r.media)) : '—';
    g.className = `gan ${!r.n || !estado.model.calibrated ? 'sin' : r.media >= cfg.gainNormalMin ? 'ok' : 'bajo'}`;
    const total = delPlano().filter((t) => t.side === lado).length;
    const a = estado.antes?.[lado];
    $(metaId).textContent =
      tx('{n} aceptados · {m} rechazados', { n: r.n, m: total - r.n }) +
      (a ? ` · ${tx('antes')} ${a.n ? (a.n > 1 ? `${fmt(a.media)} ± ${fmt(a.de)}` : fmt(a.media)) : '—'}` : '');
  }
  $('btn-deshacer').hidden = !estado.papelera.length;
  pintaMetodos();
  pintaSimulacion();
  const a = asimetria(der.media, izq.media);
  $('asim').textContent =
    `${tx('asimetría')} ${a === null ? '—' : `${fmt(a, 1)} %`}` +
    (estado.antes ? ` (${tx('antes')} ${estado.antes.asim === null ? '—' : `${fmt(estado.antes.asim, 1)} %`})` : '');
  $('btn-sin-antes').hidden = !estado.antes;
}

/** Lo que el pulso era antes del último Recalcular, si cambió. */
function cambio(t) {
  const a = estado.antes?.porId.get(t.id);
  if (!a) return null;
  const igual = a.rejected === t.rejected && (a.gain === t.gain || Math.abs((a.gain ?? NaN) - (t.gain ?? NaN)) < 0.005);
  return igual ? null : a;
}

/** El valor de antes, tachado, para la celda de ganancia. */
function antesDe(t) {
  const a = cambio(t);
  return a ? `<s class="antes">${fmt(a.gain)}</s> ` : '';
}

/** Las tres ganancias, resumidas por lado sobre los mismos pulsos aceptados. */
function pintaMetodos() {
  const tbody = $('tabla-metodos').querySelector('tbody');
  tbody.innerHTML = '';
  for (const [id, m] of Object.entries(plots.METODOS_GANANCIA)) {
    const d = resumenLado(delPlano(), 'derecha', m.de);
    const i = resumenLado(delPlano(), 'izquierda', m.de);
    const tr = document.createElement('tr');
    if (id === 'area') tr.className = 'reportada';
    const celda = (r) => (r.n ? `${fmt(r.media)} (${r.n})` : '—');
    const a = asimetria(d.media, i.media);
    tr.innerHTML = '<td></td><td></td><td></td><td></td>';
    const tds = tr.querySelectorAll('td');
    tds[0].textContent = tx(m.nombre);
    tds[1].textContent = celda(d);
    tds[2].textContent = celda(i);
    tds[3].textContent = a === null ? '—' : `${fmt(a, 0)} %`;
    tbody.appendChild(tr);
  }
}

/** Los botones y rótulos que cambian con el estado: los escribe el código, no el HTML. */
function pintaArrancar() {
  $('btn-arrancar').textContent = estado.corriendo ? tx('Detener') : tx('Encender cámara');
}

function pintaPausa() {
  $('btn-pausa').innerHTML = `${estado.pausado ? tx('Reanudar') : tx('Pausar')} <kbd>${tx('Espacio')}</kbd>`;
}

/**
 * La leyenda tiene que decir la verdad: en «real» la traza ocular va cruda,
 * o sea para el lado contrario que la cabeza.
 */
function pintaLeyendaOjo() {
  $('leyenda-ojo').textContent = $('orientacion').value === 'real' ? tx('ojo (crudo)') : tx('ojo (invertido)');
}

function pintaTodo() {
  requestAnimationFrame(pintaTodo);

  // El reloj de la calibración corre aquí y no donde se juntan las muestras:
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
  if (estado.telefono) {
    badge.textContent = tx('TELÉFONO k={k}', { k: fmt(estado.model.kParallax) });
    badge.className = 'badge warn';
    badge.title = tx('el ojo es el de la cara dibujada: su paralaje es conocido y no hace falta calibrar');
  } else if (estado.kAntesManual) {
    badge.textContent = tx('k A MANO={k}', { k: fmt(estado.model.kParallax) });
    badge.className = 'badge mal';
  } else if (estado.ejemplo?.importado) {
    badge.textContent = tx('IMPORTADO k={k}', { k: fmt(estado.model.kParallax) });
    badge.className = 'badge warn';
    badge.title = tx('sesión de {archivo}: la calibración es la del archivo', { archivo: estado.ejemplo.importado });
  } else if (estado.ejemplo) {
    badge.textContent = tx('EJEMPLO k={k}', { k: fmt(estado.model.kParallax) });
    badge.className = 'badge warn';
  } else {
    badge.textContent = cal ? tx('CALIBRADO k={k}', { k: fmt(estado.model.kParallax) }) : tx('SIN CALIBRAR');
    badge.className = `badge ${cal ? 'ok' : 'mal'}`;
  }

  const ultima = estado.rolling[estado.rolling.length - 1];
  // El fps que se muestra es el de frames PROCESADOS, no el que da la cámara.
  // Si supera el tope, el tope falló en este dispositivo: se marca en rojo y
  // se enciende el aviso, que es el dato que hace falta para diagnosticarlo.
  // Con el teléfono no hay cámara que topar: los cuadros los arma el
  // remuestreo a 60 Hz, y si el teléfono se calla, no hay ninguno.
  if (estado.telefono) {
    const mudo = performance.now() - estado.telefono.ultimo > TELEFONO_MUDO_MS;
    estado.caraOk = !mudo;
    if (mudo) estado.fps = 0;
  }
  const fpsFuera = !estado.telefono && estado.fps > FPS_MAX * 1.05;
  const chipFps = $('v-fps');
  chipFps.textContent = fmt(estado.fps, 0);
  chipFps.className = fpsFuera ? 'mal' : '';
  if (fpsFuera && $('aviso-fps').hidden) {
    $('aviso-fps').hidden = false;
    $('aviso-fps').title = tx(
      'Se están procesando {fps} fps con el tope puesto en {max}: el tope no está funcionando en este dispositivo. Los pulsos salen marcados NO VALIDADO.',
      { fps: fmt(estado.fps, 0), max: FPS_MAX },
    );
  }
  $('v-cara').textContent = estado.caraOk ? tx('sí') : tx('no');
  $('v-vcab').textContent = ultima ? `${fmt(ultima.headVel, 0)} °/s` : '—';
  $('v-offset').textContent = fmt(estado.vivo.offsetMm);
  $('v-escala').textContent = fmt(estado.vivo.pxPerMm, 1);
  const iris = $('v-iris');
  iris.textContent = fmt(estado.vivo.irisPx, 1);
  iris.className = estado.vivo.irisPx !== null && estado.vivo.irisPx < cfg.accept.irisMinPx ? 'mal' : '';
  // Con el teléfono, el yaw de verdad: el del motor es el giro en el plano.
  $('v-yaw').textContent = fmt(estado.telefono && estado.vivo.giro ? estado.vivo.giro[1] : estado.vivo.yaw, 1);
  pintaGiroPlano();
  $('v-inclin').textContent = fmt(estado.vivo.inclinacion, 0);
  $('v-azimut').textContent = fmt(estado.vivo.azimut, 1);
  $('v-vojo').textContent = ultima ? fmt(ultima.headVel - ultima.gazeVel, 0) : '—';
  $('v-blink').textContent = estado.vivo.blink ? tx('sí') : tx('no');

  if (estado.corriendo || estado.telefono || sucio.vivo) {
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
    plots.overlayLado($('plot-der'), delPlano(), 'derecha', cfg, estado.seleccion, {
      promedio: estado.promedio,
      medicion: conMedicion('plot-der'),
    });
    plots.overlayLado($('plot-izq'), delPlano(), 'izquierda', cfg, estado.seleccion, {
      promedio: estado.promedio,
      medicion: conMedicion('plot-izq'),
    });
    if (herramientas) {
      plots.dibujaPulso($('plot-pulso'), estado.seleccion || estado.trials[estado.trials.length - 1], cfg, {
        medicion: conMedicion('plot-pulso'),
      });
      plots.dibujaDispersion($('plot-ganancias'), delPlano(), cfg, {
        metodo: $('metodo-gan').value,
        // Los puntos de antes solo tienen sentido con la ganancia que se guardó.
        antes: $('metodo-gan').value === 'area' ? estado.antes?.porId : null,
      });
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
      tx('{t}/{dur}s · {n} muestras · rango {rango}°/{min}°', {
        t: t.toFixed(1),
        dur: estado.duracionCalibS,
        n: c.samples.length,
        rango: rango.toFixed(0),
        min: geom.CALIB_MIN_HEAD_RANGE_DEG,
      }) + (c.rapidoAhora ? ` · ${tx('¡MÁS LENTO!')}` : '');
    // Junto al punto va lo único que el paciente necesita saber mientras fija:
    // cuánto falta, y si se está moviendo demasiado rápido.
    $('fijacion-cuenta').textContent = c.rapidoAhora
      ? tx('¡MÁS LENTO!')
      : tx('faltan {s} s · rango {rango}° de {min}°', {
          s: Math.max(0, estado.duracionCalibS - t).toFixed(0),
          rango: rango.toFixed(0),
          min: geom.CALIB_MIN_HEAD_RANGE_DEG,
        });
    plots.dibujaParalaje($('plot-calib'), c.samples, null, estado.model.radiusMm);
  } else if (estado.ultimoFit) {
    const f = estado.ultimoFit;
    $('calib-info').textContent = tx('k={k} · residuo {res}° · n={n}', { k: fmt(f.kParallax), res: fmt(f.residualDeg, 2), n: f.samples });
    plots.dibujaParalaje($('plot-calib'), f.muestras, f, estado.model.radiusMm);
  } else {
    $('calib-info').textContent = tx('sin calibrar');
    plots.dibujaParalaje($('plot-calib'), null, null, estado.model.radiusMm);
  }
}

/**
 * Overlay del video y los dos ojos ampliados.
 *
 * El overlay se dibuja en coordenadas de la IMAGEN, sin espejar: el espejo lo
 * aplica el CSS al contenedor, así que video y puntos se invierten juntos. Los
 * recortes de ojo sí se espejan aquí, porque son canvas sueltos.
 */
function dibujaVideo() {
  if (estado.telefono) return dibujaCaraTelefono();
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
  const fantasma = { simDeltaMm: estado.vivo.simDeltaMm, pxPerMm: estado.vivo.pxPerMm };
  plots.dibujaOjo($('ojo-der'), video, estado.crops.derecho, estado.landmarks, IDX.derecho, estado.espejo, fantasma);
  plots.dibujaOjo($('ojo-izq'), video, estado.crops.izquierdo, estado.landmarks, IDX.izquierdo, estado.espejo, fantasma);
}

/**
 * Los dos cajones —Herramientas y Simulador— ocupan el mismo lugar: abrir
 * uno cierra el otro.
 */
function abreHerramientas(abrir) {
  $('herramientas').hidden = !abrir;
  if (abrir) {
    $('simulador').hidden = true;
    ensucia();
  }
}

function abreSimulador(abrir) {
  $('simulador').hidden = !abrir;
  if (abrir) $('herramientas').hidden = true;
}

// ------------------------------------------------------------- controles ---

function borraTodos() {
  // Una tecla apretada sin querer no puede tirar la sesión entera.
  if (estado.trials.length && !estado.ejemplo && !confirm(tx('¿Borrar los {n} pulsos?', { n: estado.trials.length }))) return;
  estado.trials = [];
  estado.seleccion = null;
  vaciaPapelera();
  olvidaAntes();
  saleDeEjemplo();
  pintaListas();
}

/**
 * Carga el paciente sintético de ejemplo.js, para explorar sin cámara. Toma
 * el lugar de la sesión: mezclar pulsos sintéticos con medidos daría una
 * media que no es de nadie. El paciente trae su propia paralaje, así que se
 * lo «calibra» con ella y se guarda la calibración de antes para devolverla.
 *
 * Con `caso` carga uno de los pacientes de «Casos a ciegas» (`CASOS` de
 * ejemplo.js). La barra no dice qué tiene: eso es lo que se pregunta.
 */
function cargaEjemplos(caso = null) {
  const reales = estado.trials.filter((t) => !t.ejemplo).length;
  if (reales && !confirm(tx('Los ejemplos reemplazan los {n} pulsos medidos. ¿Seguir?', { n: reales }))) return;
  telefono?.termina();
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
  vaciaPapelera();
  olvidaAntes();
  // Semillas fijas: el mismo caso da los mismos pulsos cada vez, en el aula y
  // en los tests.
  const semilla0 = caso ? 100 : 1;
  pulsosDe(caso).forEach((p, i) => {
    const { crudo, tTrigger } = crudoDeEjemplo(p, semilla0 + i);
    const trial = procesaCrudo(crudo, tTrigger, estado.model, derivActual(), cfg);
    if (!trial) return;
    trial.id = estado.proximoId++;
    trial.crudo = crudo;
    trial.ejemplo = true;
    anotaConfig(trial);
    estado.trials.push(trial);
  });
  estado.seleccion = estado.trials[estado.trials.length - 1] ?? null;
  estado.ejemplo.caso = caso;
  estado.ejemplo.importado = null;
  pintaListas();
  marcaEstado(
    caso
      ? 'caso {caso}: {n} pulsos de un paciente sintético. ¿Qué patrón muestra?'
      : '{n} pulsos de ejemplo: paciente sintético, canal izquierdo con déficit',
    { caso, n: estado.trials.length },
  );
}

/** Vuelve a la medición real: se van los ejemplos y vuelve la calibración de antes. */
function saleDeEjemplo() {
  if (!estado.ejemplo) return;
  estado.trials = estado.trials.filter((t) => !t.ejemplo);
  if (estado.seleccion?.ejemplo) estado.seleccion = null;
  vaciaPapelera();
  olvidaAntes();
  estado.model.kParallax = estado.ejemplo.k;
  estado.model.calibrated = estado.ejemplo.calibrado;
  estado.ultimoFit = estado.ejemplo.fit;
  sucio.calib = true;
  estado.ejemplo = null;
  pintaListas();
}

function descartaUltimo() {
  const t = estado.trials[estado.trials.length - 1];
  if (t) tiraAPapelera(t);
}

/**
 * Descartar no borra: el pulso va a una papelera y `Z` (o «Deshacer») lo
 * devuelve a su lugar. `D` está al lado de otras teclas y descartar el pulso
 * equivocado, sin vuelta atrás, era perder una medición que no se repite igual.
 */
function tiraAPapelera(t) {
  estado.trials = estado.trials.filter((x) => x !== t);
  if (estado.seleccion === t) estado.seleccion = null;
  estado.papelera.push(t);
  pintaListas();
  marcaEstado('pulso #{id} descartado · Z para deshacer', { id: t.id });
}

function deshaceDescarte() {
  const t = estado.papelera.pop();
  if (!t) return;
  estado.trials = [...estado.trials, t].sort((a, b) => a.id - b.id);
  estado.seleccion = t;
  pintaListas();
  marcaEstado('pulso #{id} de vuelta', { id: t.id });
}

/** La papelera es de la sesión que se está mirando: otra sesión la vacía. */
function vaciaPapelera() {
  estado.papelera = [];
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
    recalcula || !estado.trials.length
      ? 'volvió el k de antes (k={k})'
      : 'volvió el k de antes (k={k}): «Recalcular» para verlo en los pulsos',
    { k: fmt(antes.k) },
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
    ? tx('No están en su valor de fábrica: {lista}. «Valores por defecto» en Herramientas.', {
        lista: cambiadas.map((p) => p.nombre).join(', '),
      })
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
  marcaEstado(
    recalcula ? 'perillas en sus valores por defecto' : 'perillas en sus valores por defecto: «Recalcular» para aplicarlas a los pulsos',
  );
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
  $('btn-pausa').setAttribute('aria-pressed', String(v));
  pintaPausa();
  if (!v) estado.medicion = null; // al reanudar no queda un cursor viejo colgado
  $('plot-vivo').classList.toggle('medible', v);
  sucio.vivo = true; // redibuja: al pausar aparece el cursor de medición
  marcaEstado(v ? 'pausado: mide en la traza de abajo (clic fija la referencia)' : 'midiendo');
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
 * Al contrario que la traza viva, aquí no hace falta pausar: un pulso ya medido
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
    // Ctrl+C es copiar, Ctrl+D marcador, Ctrl+R recargar: no son atajos de aquí.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!$('bienvenida').hidden || !$('acerca').hidden || !$('enlace').hidden || tutorial.bloqueaAtajos()) return;
    const k = e.key.toLowerCase();
    if (k === 't') tutorial.abierto() ? tutorial.cierra() : tutorial.abre();
    else if (k === 'c') empiezaCalibracion();
    else if (k === 'r') borraTodos();
    else if (k === 'd') descartaUltimo();
    else if (k === 'z') deshaceDescarte();
    else if (k === 'h') abreHerramientas($('herramientas').hidden);
    else if (k === 's') abreSimulador($('simulador').hidden);
    else if (k === 'l') window.open(LABYRINTHUS_URL, '_blank', 'noopener');
    else if (k === ' ' || k === 'p') {
      // `preventDefault` aquí no es solo para que la página no haga scroll: si
      // el foco quedó en un botón —y queda, apenas se aprieta «Encender
      // cámara»— el espacio ACCIONA ese botón. El atajo pausaba y de paso
      // apagaba la cámara. El click por teclado sale en el keyup y esto lo
      // cancela.
      e.preventDefault();
      ponPausa(!estado.pausado);
    }
  });
}

// ------------------------------------------------------- paciente simulado ---

/** Llena el selector de perfiles desde simulacion.js. */
function montaSimulacion() {
  const sel = $('sim-perfil');
  for (const [id, p] of Object.entries(PERFILES)) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = tx(p.nombre);
    sel.insertBefore(o, sel.querySelector('option[value="azar"]'));
  }
  sel.addEventListener('change', (e) => cambiaPerfil(e.target.value));
  $('sim-ciego').addEventListener('change', (e) => {
    // Sacar el «a ciegas» es revelar: la pantalla pasa a decir cuál es.
    if (!e.target.checked && estado.sim.ciego) return revelaSimulacion();
    estado.sim.ciego = e.target.checked;
    pintaSimulacion();
  });
  $('sim-revelar').addEventListener('click', () => revelaSimulacion());
  $('btn-suerte').addEventListener('click', empiezaPractica);
  $('aviso-practica').addEventListener('click', () => abreSimulador(true));
  // Las opciones y los botones de la práctica se pintan de nuevo en cada
  // pulso: un solo oyente en la caja, por delegación.
  $('practica-cuerpo').addEventListener('click', (e) => {
    const pr = estado.sim.practica;
    const b = e.target.closest('button');
    if (!pr || !b) return;
    if (b.dataset.pregunta && pr.fase === 'responder') pr.respuestas[b.dataset.pregunta] = b.dataset.opcion;
    else if (b.id === 'practica-listo') pr.fase = 'responder';
    else if (b.id === 'practica-revelar') return terminaPractica();
    pintaSimulacion();
  });
  $('sim-real').addEventListener('click', () => {
    estado.sim.mostrarReal = !estado.sim.mostrarReal;
    recalculaTodos();
    pintaSimulacion();
    marcaEstado(
      estado.sim.mostrarReal
        ? 'lo que el compañero dio de verdad: tachado, lo simulado'
        : 'de vuelta a la simulación: tachado, lo real',
    );
  });
  pintaSimulacion();
}

/**
 * Cambia el perfil. Los pulsos que había se van: mezclar pulsos de dos
 * pacientes —uno sano y uno simulado, o dos perfiles— daría una media que no
 * es de nadie, igual que con los ejemplos.
 */
function cambiaPerfil(eleccion, { practica = false } = {}) {
  const medidos = estado.trials.filter((t) => !t.ejemplo).length;
  if (medidos && !confirm(tx('Cambiar el paciente borra los {n} pulsos medidos. ¿Seguir?', { n: medidos }))) {
    $('sim-perfil').value = estado.sim.eleccion;
    return false;
  }
  if (medidos) {
    estado.trials = estado.trials.filter((t) => t.ejemplo);
    estado.seleccion = null;
    vaciaPapelera();
    olvidaAntes();
  }
  const ids = Object.keys(PERFILES);
  Object.assign(estado.sim, {
    eleccion,
    perfil: eleccion === 'azar' ? ids[Math.floor(Math.random() * ids.length)] : eleccion || null,
    revelado: false,
    mostrarReal: false,
    semilla: Math.floor(Math.random() * 1e6),
    // Elegir otro paciente a mano deja la práctica: ya no hay nada que adivinar.
    practica: practica ? { fase: 'examinar', respuestas: {} } : null,
  });
  // «Uno al azar» no tiene sentido a la vista: se pasa solo a ciegas.
  if (eleccion === 'azar') $('sim-ciego').checked = true;
  estado.sim.ciego = $('sim-ciego').checked;
  estado.simVivo = null;
  pintaListas();
  pintaSimulacion();
  marcaEstado(
    practica
      ? 'paciente al azar, a ciegas: examinar y, con {min} pulsos por lado, contestar'
      : !estado.sim.perfil
        ? 'paciente simulado apagado: se mide lo real'
        : estado.sim.ciego
          ? 'paciente simulado a ciegas: examinar y decidir qué tiene'
          : 'paciente simulado: {nombre}',
    { nombre: estado.sim.perfil && tx(PERFILES[estado.sim.perfil].nombre), min: MIN_POR_LADO },
  );
  return true;
}

/**
 * «Voy a tener suerte»: un paciente al azar —el control sano incluido—, a
 * ciegas, y la práctica en la fase de examinar. Ver practica.js.
 */
function empiezaPractica() {
  $('sim-ciego').checked = true;
  if (!cambiaPerfil('azar', { practica: true })) return;
  $('sim-perfil').value = 'azar';
  // Abierto, el cajón tapa el panel izquierdo justo mientras se examina. Se
  // cierra, la cuenta de aceptados sigue en la barra y vuelve solo para
  // contestar (ver `pintaSimulacion`).
  abreSimulador(false);
}

/** Revela y corrige: la práctica pasa a mostrar las respuestas contra la clave. */
function terminaPractica() {
  const pr = estado.sim.practica;
  pr.fase = 'revelado';
  revelaSimulacion({ desdePractica: true });
  const { aciertos, total } = corrige(estado.sim.perfil, pr.respuestas);
  marcaEstado('{n} de {total} correctas · era: {nombre}', {
    n: aciertos,
    total,
    nombre: tx(PERFILES[estado.sim.perfil].nombre),
  });
}

/**
 * Revela el perfil. Fuera de la práctica —el botón Revelar, destildar «a
 * ciegas», el tutorial— la deja: revelar a mitad de examen es rendirse, y las
 * preguntas ya no tienen sentido.
 */
function revelaSimulacion({ desdePractica = false } = {}) {
  if (!estado.sim.perfil) return;
  if (!desdePractica) estado.sim.practica = null;
  estado.sim.revelado = true;
  estado.sim.ciego = false;
  $('sim-ciego').checked = false;
  // Si era «al azar», el selector pasa a decir cuál salió.
  estado.sim.eleccion = estado.sim.perfil;
  $('sim-perfil').value = estado.sim.perfil;
  pintaSimulacion();
  marcaEstado('el paciente simulado era: {nombre}', { nombre: tx(PERFILES[estado.sim.perfil].nombre) });
}

/** Lo que muestra la sección y la barra según el estado de la simulación. */
function pintaSimulacion() {
  const { perfil, ciego, revelado, mostrarReal } = estado.sim;
  const oculto = Boolean(perfil) && ciego && !revelado;
  const p = perfil ? PERFILES[perfil] : null;
  const practica = estado.sim.practica;
  // A ciegas el selector no se ve: diría qué perfil es.
  $('sim-campo').hidden = oculto;
  $('sim-o').hidden = oculto;
  $('sim-info').textContent = !perfil
    ? tx('Apagado: se mide lo real.')
    : oculto && practica
      ? tx('Paciente al azar: puede tener una patología o ninguna. Examina como siempre.')
      : oculto
        ? tx('Perfil oculto. Examina, decide qué tiene el paciente y después presiona Revelar.')
        : `${tx(p.nombre)}. ${tx(p.descripcion)}${estado.plano === 'lateral' ? '' : ` ${tx(p.vertical)}`}`;
  // En la práctica se revela contestando, con su propio botón.
  $('sim-revelar').hidden = !oculto || Boolean(practica);
  pintaPractica();
  const cuenta = $('aviso-practica');
  cuenta.hidden = practica?.fase !== 'examinar';
  if (!cuenta.hidden) {
    const a = aceptadosPorLado();
    const vars = { d: a.derecha, i: a.izquierda, min: MIN_POR_LADO };
    cuenta.textContent = tx('der {d}/{min} · izq {i}/{min}', vars);
    cuenta.title = tx('pulsos aceptados de cada lado; con {min} y {min} se contesta en el Simulador', vars);
    // Una sola vez: si se lo vuelve a cerrar para seguir mirando, no insiste.
    if (a.derecha >= MIN_POR_LADO && a.izquierda >= MIN_POR_LADO && !practica.abierto) {
      practica.abierto = true;
      abreSimulador(true);
    }
  }
  const haySimulados = estado.trials.some((t) => t.simulado && t.crudoReal);
  $('sim-real').hidden = !perfil || oculto || !haySimulados;
  $('sim-real').setAttribute('aria-pressed', String(mostrarReal));
  $('sim-real').textContent = mostrarReal ? tx('Ver lo simulado') : tx('Ver lo real');
  $('btn-simulador').classList.toggle('activo', Boolean(perfil));
  const aviso = $('aviso-sim');
  aviso.hidden = !perfil;
  aviso.title = oculto
    ? tx('Paciente simulado, a ciegas: los pulsos llevan una patología agregada por el motor.')
    : p
      ? tx('Paciente simulado: {nombre}. Los pulsos llevan una patología agregada por el motor.', { nombre: tx(p.nombre) })
      : '';
}

/** Pulsos aceptados de cada lado, los que cuentan para poder contestar. */
function aceptadosPorLado() {
  // La práctica pregunta por los laterales: los verticales no cuentan.
  const n = (lado) => estado.trials.filter((t) => t.side === lado && !t.rejected && (t.canal ?? 'lateral') === 'lateral').length;
  return { derecha: n('derecha'), izquierda: n('izquierda') };
}

/**
 * La caja de la práctica según la fase: el avance mientras se examina, las
 * tres preguntas, y al revelar cada respuesta contra la correcta.
 */
function pintaPractica() {
  const pr = estado.sim.practica;
  const caja = $('practica-cuerpo');
  $('btn-suerte').textContent = pr ? tx('Otro paciente al azar') : tx('Voy a tener suerte');
  caja.hidden = !pr;
  if (!pr) return;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

  if (pr.fase === 'examinar') {
    const a = aceptadosPorLado();
    const listo = a.derecha >= MIN_POR_LADO && a.izquierda >= MIN_POR_LADO;
    caja.innerHTML = `
      <p class="practica-avance">${esc(
        tx('Aceptados: derecha {d}/{min} · izquierda {i}/{min}', { d: a.derecha, i: a.izquierda, min: MIN_POR_LADO }),
      )}</p>
      <button id="practica-listo" class="primario"${listo ? '' : ' disabled'}>${esc(tx('Ya sé qué tiene'))}</button>
      ${listo ? '' : `<p class="ayuda">${esc(tx('Hacen falta {min} pulsos aceptados de cada lado.', { min: MIN_POR_LADO }))}</p>`}`;
    return;
  }

  const qs = preguntasPractica();
  const revelado = pr.fase === 'revelado';
  const nota = revelado ? corrige(estado.sim.perfil, pr.respuestas) : null;
  let html = revelado
    ? `<p class="practica-nota ${nota.aciertos === nota.total ? 'ok' : ''}">${esc(
        tx('{n} de {total} correctas', { n: nota.aciertos, total: nota.total }),
      )}</p>`
    : '';
  for (const q of qs) {
    const d = nota?.detalle[q.id];
    html += `<div class="tuto-pregunta"><p><b>${esc(q.texto)}</b></p><div class="opciones" role="group" aria-label="${esc(q.texto)}">`;
    for (const [id, texto] of Object.entries(q.opciones)) {
      // Al revelar: verde la correcta, rojo la elegida si no lo era.
      const clase = revelado
        ? id === d.correcta
          ? 'bien'
          : id === d.elegida
            ? 'mal'
            : ''
        : pr.respuestas[q.id] === id
          ? 'elegida'
          : '';
      html +=
        `<button type="button" class="${clase}" data-pregunta="${q.id}" data-opcion="${esc(id)}"` +
        ` aria-pressed="${pr.respuestas[q.id] === id}"${revelado ? ' disabled' : ''}>${esc(texto)}</button>`;
    }
    html += '</div></div>';
  }
  if (!revelado) {
    const todas = qs.every((q) => pr.respuestas[q.id]);
    html += `<button id="practica-revelar" class="primario"${todas ? '' : ' disabled'}>${esc(tx('Revelar'))}</button>`;
  }
  caja.innerHTML = html;
}

// ------------------------------------------------------------------ CSV ----

function baja(texto, sufijo, { ext = 'csv', tipo = 'text/csv' } = {}) {
  const url = URL.createObjectURL(new Blob([texto], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `trainhit-${sufijo}-${new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '')}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Preguntas para Moodle en GIFT, en el idioma de la interfaz: ver preguntas.js. */
function exportaGift() {
  baja(textoGift(idioma()), idioma() === 'es' ? 'preguntas-gift' : `preguntas-gift-${idioma()}`, { ext: 'txt', tipo: 'text/plain' });
  marcaEstado('preguntas bajadas: en Moodle, Banco de preguntas › Importar › formato GIFT');
}

/** Todas las tablas en un archivo: ver sesion.js. */
function exportaTodo() {
  baja(
    textoSesion({
      trials: estado.trials,
      version: document.documentElement.dataset.v ?? '',
      calibracion: estado.ultimoFit?.muestras ?? null,
      simulacionOculta: estado.sim.ciego && !estado.sim.revelado,
    }),
    'sesion',
  );
}

/**
 * Abre una sesión exportada. Toma el lugar de la sesión, como los ejemplos:
 * son pulsos de otra persona —o de otro día—, con su propia calibración, y
 * mezclarlos con los de ahora daría una media que no es de nadie. Se usa el
 * mismo mecanismo que los ejemplos: la calibración de antes se guarda y
 * vuelve al encender la cámara o con «Borrar todos».
 *
 * Cada pulso se vuelve a calcular desde su crudo con SU k y SU derivador; los
 * umbrales y criterios son las perillas de ahora.
 */
function importaSesion(texto, nombre) {
  let sesion;
  try {
    sesion = leeSesion(texto);
  } catch (e) {
    marcaEstado('no se pudo importar {archivo}: {msg}', { archivo: nombre, msg: e.message });
    return;
  }
  const reales = estado.trials.filter((t) => !t.ejemplo).length;
  if (reales && !confirm(tx('La sesión importada reemplaza los {n} pulsos medidos. ¿Seguir?', { n: reales }))) return;
  telefono?.termina();
  if (estado.corriendo) detener();
  restauraK();
  if (!estado.ejemplo) {
    estado.ejemplo = { k: estado.model.kParallax, calibrado: estado.model.calibrated, fit: estado.ultimoFit };
  }
  estado.ejemplo.caso = null;
  estado.ejemplo.importado = nombre;

  const conK = sesion.pulsos.find((p) => p.k !== null);
  estado.model.kParallax = conK?.k ?? 0;
  estado.model.calibrated = sesion.pulsos.some((p) => p.calibrado);
  const fit = sesion.calibracion ? geom.fitParallax(sesion.calibracion, estado.model.radiusMm) : null;
  estado.ultimoFit = fit ? { ...fit, muestras: sesion.calibracion } : null;
  sucio.calib = true;

  estado.trials = [];
  vaciaPapelera();
  olvidaAntes();
  let fallidos = 0;
  for (const p of sesion.pulsos) {
    const model = new geom.EyeModel();
    model.kParallax = p.k ?? estado.model.kParallax;
    model.calibrated = p.calibrado;
    const deriv = p.deriv ?? derivActual();
    const trial = procesaCrudo(p.crudo, 0, model, deriv, cfg);
    if (!trial) {
      fallidos++;
      continue;
    }
    trial.id = estado.proximoId++;
    trial.crudo = p.crudo;
    trial.ejemplo = true;
    trial.importado = true;
    trial.ejemploEnArchivo = p.ejemplo;
    if (p.simulado) trial.simulado = p.simulado;
    trial.canal = p.plano;
    trial.calibrado = p.calibrado;
    trial.k = model.kParallax;
    trial.deriv = deriv;
    estado.trials.push(trial);
  }
  estado.seleccion = estado.trials[estado.trials.length - 1] ?? null;
  pintaListas();
  marcaEstado(
    fallidos
      ? '{n} pulsos importados de {archivo} ({fallidos} sin muestras suficientes): se van al encender la cámara o con «Borrar todos»'
      : '{n} pulsos importados de {archivo}: se van al encender la cámara o con «Borrar todos»',
    { n: estado.trials.length, archivo: nombre, fallidos },
  );
}

// ------------------------------------------------------------------ init ---

$('btn-arrancar').addEventListener('click', () => (estado.corriendo ? detener() : arrancar()));
$('btn-calibrar').addEventListener('click', empiezaCalibracion);
$('btn-borrar').addEventListener('click', borraTodos);
$('btn-descartar').addEventListener('click', descartaUltimo);
$('btn-deshacer').addEventListener('click', deshaceDescarte);
$('btn-csv').addEventListener('click', exportaTodo);
$('btn-gift').addEventListener('click', exportaGift);
$('btn-importar').addEventListener('click', () => $('archivo-csv').click());
$('archivo-csv').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  e.target.value = ''; // el mismo archivo otra vez también tiene que disparar `change`
  if (f) importaSesion(await f.text(), f.name);
});
$('btn-recalcular').addEventListener('click', recalculaTodos);
$('btn-defecto').addEventListener('click', () => perillasPorDefecto());
$('btn-sin-antes').addEventListener('click', () => {
  olvidaAntes();
  pintaListas();
});
$('btn-herramientas').addEventListener('click', () => abreHerramientas($('herramientas').hidden));
$('btn-cerrar').addEventListener('click', () => abreHerramientas(false));
$('btn-simulador').addEventListener('click', () => abreSimulador($('simulador').hidden));
$('btn-cerrar-sim').addEventListener('click', () => abreSimulador(false));
// Un QR del enlace teléfono–PC hecho antes de la mudanza trae `?enlace=código`
// y apunta aquí: se lo manda a Labyrinthus 3D con el mismo código.
{
  const codigo = new URLSearchParams(location.search).get('enlace');
  if (codigo) location.replace(`${LABYRINTHUS_URL}?enlace=${encodeURIComponent(codigo.replace(/\D/g, '').slice(0, 6))}`);
}
$('btn-pausa').addEventListener('click', () => ponPausa(!estado.pausado));
$('metodo-gan').addEventListener('change', () => (sucio.pulsos = true));
$('promedio').addEventListener('change', (e) => {
  estado.promedio = e.target.checked;
  sucio.pulsos = true;
});
$('orientacion').addEventListener('change', (e) => {
  plots.ORIENTACION.modo = e.target.value;
  pintaLeyendaOjo();
  sucio.pulsos = true;
  sucio.vivo = true;
});
$('marca-sacadas').addEventListener('change', (e) => {
  plots.opciones.sacadas = e.target.checked;
  sucio.pulsos = true;
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

/**
 * Idioma: ver idioma.js. Va antes que todo lo demás, porque `sliders` lee los
 * nombres de las perillas del HTML y `montaSimulacion` escribe los perfiles.
 * Al cambiarlo, lo que arma el código se vuelve a pintar; la sesión queda.
 */
/** Dónde se bajan los PDF del manual: la carpeta `manual/`, junto a la página. */
const MANUAL_URL = 'manual/';

function montaIdioma() {
  const boton = $('btn-idioma');
  const otro = () => (idioma() === 'es' ? 'en' : 'es');
  const pinta = () => {
    boton.textContent = otro().toUpperCase();
    boton.title = IDIOMAS[otro()];
    boton.lang = otro();
    // El manual, en el idioma de la interfaz. Los PDF viajan con la página, en
    // `manual/`: se publican junto a ella. Ver docs/manual/generar-pdf.py.
    const pdf = idioma() === 'en' ? 'trainhit-manual-en.pdf' : 'trainhit-manual.pdf';
    for (const a of document.querySelectorAll('.enlace-manual')) a.href = MANUAL_URL + pdf;
    // La guía corta del teléfono en la cabeza (docs/manual/sujecion.md).
    const guia = idioma() === 'en' ? 'trainhit-sujecion-en.pdf' : 'trainhit-sujecion.pdf';
    for (const a of document.querySelectorAll('.enlace-sujecion')) a.href = MANUAL_URL + guia;
  };
  boton.addEventListener('click', () => ponIdioma(otro()));
  alCambiarIdioma(() => {
    pinta();
    pintaArrancar();
    pintaPausa();
    pintaLeyendaOjo();
    for (const o of $('sim-perfil').options) if (PERFILES[o.value]) o.textContent = tx(PERFILES[o.value].nombre);
    avisaPerillas();
    pintaListas();
    marcaEstado(...ultimoEstado);
    ensucia();
  });
  ponIdioma(idiomaInicial(), { guarda: false });
}

/**
 * Botón del tema: da la vuelta sistema → claro → oscuro. Lleva el dibujo del
 * tema en que está, no del que sigue: con tres estados, «lo que pasa si
 * aprieto» no se adivina, y «dónde estoy» sí sirve.
 *
 * Los canvas pintan con colores ya leídos: al cambiar el tema hay que volver
 * a leer la paleta y redibujar todo.
 */
function montaTema() {
  const boton = $('btn-tema');
  const DIBUJO = { sistema: '◐', claro: '☀', oscuro: '☾' };
  const NOMBRE = {
    sistema: () => tx('tema: el del sistema'),
    claro: () => tx('tema: claro'),
    oscuro: () => tx('tema: oscuro'),
  };
  const pinta = () => {
    const t = tema();
    boton.textContent = DIBUJO[t];
    boton.title = tx('{tema} (clic para cambiar)', { tema: NOMBRE[t]() });
    boton.setAttribute('aria-label', NOMBRE[t]());
  };
  const repinta = () => {
    plots.leePaleta();
    ensucia();
  };
  boton.addEventListener('click', () => ponTema(siguienteTema()));
  alCambiarTema(() => {
    pinta();
    repinta();
  });
  alCambiarIdioma(pinta);
  // La hoja de estilo la pone `arranque.js` y puede terminar de llegar después
  // de este módulo: la paleta se vuelve a leer cuando está todo cargado.
  window.addEventListener('load', repinta, { once: true });
  pinta();
  plots.leePaleta();
}

montaIdioma();
montaTema();
sliders();
montaSimulacion();
atajos();
medicionViva();
medicionPulsos();
const bienvenida = montaBienvenida();
telefono = montaTelefono({
  alEntrar: entraTelefono,
  alGiro: giroTelefono,
  alSalir: saleTelefono,
  alCambiar: pintaBadgeTelefono,
});
// El teléfono que llegó por el QR es la cabeza: lo que ve es el diálogo, no
// la bienvenida.
if (telefono.rol() === 'cabeza') bienvenida.cierra();
$('btn-telefono').addEventListener('click', () => telefono.abre());
for (const b of $('planos').querySelectorAll('[data-plano]')) b.addEventListener('click', () => cambiaPlano(b.dataset.plano));
$('badge-telefono').addEventListener('click', () => telefono.abre());
// El recorrido del tutorial espera cosas de la medición real: por eso se
// monta aquí, con acceso al estado, y no en su módulo.
const tutorial = montaTutorial({
  instantanea: () => ({ recalculados: estado.recalculados }),
  respuestas: {
    // La respuesta es el perfil elegido. Contestar no lo revela en la barra:
    // eso lo decide quien apriete Revelar.
    simulacion: () => {
      const p = estado.sim.perfil && PERFILES[estado.sim.perfil];
      if (!p) return null;
      return {
        correcta: p.patron,
        explica: `${tx(p.nombre)}. ${tx(p.descripcion)}`,
        pista: tx('Mira las dos medias por separado, la asimetría y los triángulos de sacadas: ¿de qué lado y cuándo corrigen?'),
      };
    },
  },
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
    // Cerrar deja la pantalla despejada: los dos cajones.
    cierraHerramientas: () => {
      abreHerramientas(false);
      abreSimulador(false);
    },
    abreSimulador: () => abreSimulador(true),
    cargaEjemplos: () => cargaEjemplos(),
    cargaCaso: (caso) => cargaEjemplos(caso),
    exportaGift,
    revelaSimulacion,
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
window.trainhit = {
  estado,
  cfg,
  pintaListas,
  analyzeTrial,
  procesaCrudo,
  recalculaTodos,
  importaSesion,
  // El teléfono sin teléfono: para probar los planos y hacer las capturas del manual.
  telefono: { entra: entraTelefono, giro: giroTelefono, plano: cambiaPlano },
};
