// Envoltura de MediaPipe Face Landmarker: cámara -> landmarks + transform.
//
// El modelo se baja del CDN la primera vez y el navegador lo cachea. Es el
// mismo `face_landmarker.task` que usa el motor nativo, así que los índices de
// la malla de 478 puntos son los mismos.

import {
  FaceLandmarker,
  FilesetResolver,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs';
import { limitadorDeCadencia } from './signal.js';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/** Índices en la malla de 478. El iris son los últimos 10 puntos. */
export const IDX = {
  derecho: { iris: 468, border: [469, 470, 471, 472], outer: 33, inner: 133, lidUp: 159, lidDown: 145 },
  izquierdo: { iris: 473, border: [474, 475, 476, 477], outer: 362, inner: 263, lidUp: 386, lidDown: 374 },
};

/**
 * Baja el modelo con progreso, leyendo el cuerpo de a pedazos.
 *
 * MediaPipe sabe bajarlo solo con `modelAssetPath`, pero de esa descarga no
 * informa nada: son varios MB con la pantalla congelada. Bajándolo acá se
 * puede contar lo que va llegando y pasárselo ya resuelto en
 * `modelAssetBuffer`.
 *
 * `Content-Length` puede no venir (proxy que recomprime, respuesta de la
 * caché sin el encabezado): ahí `total` queda en null y la barra se dibuja
 * indeterminada en vez de mentir un porcentaje.
 */
async function bajaModelo(onProgreso) {
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`modelo: ${res.status}`);
  const largo = Number(res.headers.get('content-length'));
  const total = Number.isFinite(largo) && largo > 0 ? largo : null;

  // Sin `body` legible (navegador viejo) se espera el buffer entero: se pierde
  // el progreso, no la descarga.
  if (!res.body?.getReader) {
    const buf = new Uint8Array(await res.arrayBuffer());
    onProgreso?.({ fase: 'modelo', recibido: buf.byteLength, total: buf.byteLength });
    return buf;
  }

  const reader = res.body.getReader();
  const trozos = [];
  let recibido = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    trozos.push(value);
    recibido += value.byteLength;
    onProgreso?.({ fase: 'modelo', recibido, total });
  }
  const bytes = new Uint8Array(recibido);
  let off = 0;
  for (const t of trozos) {
    bytes.set(t, off);
    off += t.byteLength;
  }
  return bytes;
}

/**
 * Crea el landmarker. Se intenta primero en GPU; si no hay WebGL2 (máquinas
 * virtuales, drivers viejos, algunos Android) se cae a CPU en vez de no
 * arrancar. Devuelve `{ landmarker, delegate }` para que la interfaz diga
 * cuál quedó.
 *
 * `onProgreso` recibe `{ fase, recibido, total }` mientras carga: `fase` es
 * 'motor' (el runtime wasm, que no informa avance), 'modelo' (la descarga, con
 * bytes) o 'iniciando' (armar el landmarker, que ya es local).
 */
export async function crearLandmarker({ gpu = true, onProgreso } = {}) {
  onProgreso?.({ fase: 'motor', recibido: 0, total: null });
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  const bytes = await bajaModelo(onProgreso);
  onProgreso?.({ fase: 'iniciando', recibido: bytes.byteLength, total: bytes.byteLength });
  const crea = (delegate) =>
    FaceLandmarker.createFromOptions(fileset, {
      // Una copia por intento: al crear el landmarker MediaPipe se queda con
      // el buffer, y si el intento en GPU falla el de CPU necesita uno entero.
      baseOptions: { modelAssetBuffer: new Uint8Array(bytes), delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      // El transform 4x4 cara->cámara es de donde sale la rotación de cabeza.
      outputFacialTransformationMatrixes: true,
      // Los blendshapes obligan a correr un modelo entero más por frame; el
      // parpadeo se saca de la malla con dos restas (ver geom.eyelidOpenness).
      outputFaceBlendshapes: false,
    });
  if (gpu) {
    try {
      return { landmarker: await crea('GPU'), delegate: 'GPU' };
    } catch (e) {
      console.warn('landmarker en GPU falló, se usa CPU:', e);
    }
  }
  return { landmarker: await crea('CPU'), delegate: 'CPU' };
}

/**
 * Tope de cuadros por segundo. Es un LÍMITE PUESTO A PROPÓSITO, no técnico.
 *
 * trainHIT es didáctico. Un vHIT de gafas corre a más de 250 Hz y el remoto
 * comercial más lento a 100 fps: con una cámara rápida los números de acá
 * empezarían a parecerse a los de un equipo clínico sin tener ni la
 * validación ni el control de la distancia al objetivo que eso exige. El tope
 * quedó DEBAJO del equipo comercial más lento a propósito: a 60 fps ningún
 * resultado de trainHIT puede pasar por un vHIT real. Se procesa como mucho a
 * 60 fps aunque la cámara dé más, y se avisa cuando se está recortando.
 */
export const FPS_MAX = 60;

/**
 * Pide la cámara. Se piden 60 fps a propósito: la mayoría de las webcams dan 30
 * y eso ya limita todo lo demás (a 30 fps el pico del impulso cae entre dos
 * muestras), pero algunas entregan 60 con luz suficiente y ahí la medición
 * mejora sola. 60 es además el máximo, `FPS_MAX`.
 */
export async function abrirCamara(video, { deviceId, width = 1280, height = 720, fps = 60 } = {}) {
  const constraints = {
    audio: false,
    video: {
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: Math.min(fps, FPS_MAX), max: FPS_MAX },
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
    },
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;
  await video.play();
  return stream;
}

/**
 * Qué da la cámara abierta: cuál es, fps que entrega y fps máximo que podría
 * entregar. `getCapabilities` no existe en todos los navegadores; ahí se
 * devuelve null.
 *
 * `deviceId` y `label` son CUÁL cámara abrió de verdad, que no tiene por qué
 * ser la que se pidió: sin `deviceId` la restricción es `facingMode`, y con
 * varias cámaras frontales el navegador elige una. La interfaz los necesita
 * para que el selector diga la verdad.
 */
export function describeCamara(stream) {
  const track = stream?.getVideoTracks()[0];
  if (!track) return { deviceId: null, label: null, fps: null, fpsMax: null, ancho: null, alto: null };
  const s = track.getSettings?.() ?? {};
  const c = track.getCapabilities?.() ?? {};
  return {
    deviceId: s.deviceId ?? null,
    label: track.label || null,
    fps: s.frameRate ?? null,
    fpsMax: c.frameRate?.max ?? null,
    ancho: s.width ?? null,
    alto: s.height ?? null,
  };
}

export async function listarCamaras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'videoinput');
}

/**
 * Bucle de frames. Usa `requestVideoFrameCallback` cuando existe: da el
 * timestamp REAL de captura del frame (`mediaTime`), que es lo que el derivador
 * necesita — el reloj del bucle trae el jitter de captura y de inferencia.
 *
 * Los frames que llegan más seguido que `1/fpsMax` se saltan: es la segunda
 * mitad del tope de `FPS_MAX`, para el caso en que el navegador ignore la
 * restricción de `getUserMedia`. `saltados` cuenta cuántos se descartaron.
 * El filtro mira el reloj del video Y el de pared: ver `limitadorDeCadencia`.
 */
export function bucleDeFrames(video, onFrame, { fpsMax = FPS_MAX } = {}) {
  let vivo = true;
  const pasa = limitadorDeCadencia(fpsMax);
  const soportaRVFC = typeof video.requestVideoFrameCallback === 'function';
  const ctl = { soportaRVFC, saltados: 0, detener: () => (vivo = false) };

  const entrega = (t, meta) => {
    if (!pasa(t, performance.now() / 1000)) {
      ctl.saltados++;
      return;
    }
    onFrame(t, meta);
  };

  if (soportaRVFC) {
    const step = (_now, meta) => {
      if (!vivo) return;
      entrega(meta.mediaTime, meta);
      video.requestVideoFrameCallback(step);
    };
    video.requestVideoFrameCallback(step);
  } else {
    const step = () => {
      if (!vivo) return;
      entrega(video.currentTime, null);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  return ctl;
}
