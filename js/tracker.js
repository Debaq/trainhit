// Envoltura de MediaPipe Face Landmarker: cámara -> landmarks + transform.
//
// El modelo se baja del CDN la primera vez y el navegador lo cachea. Es el
// mismo `face_landmarker.task` que usa el motor nativo, así que los índices de
// la malla de 478 puntos son los mismos.

import {
  FaceLandmarker,
  FilesetResolver,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/** Índices en la malla de 478. El iris son los últimos 10 puntos. */
export const IDX = {
  derecho: { iris: 468, border: [469, 470, 471, 472], outer: 33, inner: 133, lidUp: 159, lidDown: 145 },
  izquierdo: { iris: 473, border: [474, 475, 476, 477], outer: 362, inner: 263, lidUp: 386, lidDown: 374 },
};

/**
 * Crea el landmarker. Se intenta primero en GPU; si no hay WebGL2 (máquinas
 * virtuales, drivers viejos, algunos Android) se cae a CPU en vez de no
 * arrancar. Devuelve `{ landmarker, delegate }` para que la interfaz diga
 * cuál quedó.
 */
export async function crearLandmarker({ gpu = true } = {}) {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  const crea = (delegate) =>
    FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
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
 * validación ni el control de la distancia al objetivo que eso exige. Para que
 * nadie lo use como si fuera un equipo médico, se procesa como mucho a 100
 * fps aunque la cámara dé más, y se avisa cuando se está recortando.
 */
export const FPS_MAX = 100;

/**
 * Pide la cámara. Se piden 60 fps a propósito: la mayoría de las webcams dan 30
 * y eso ya limita todo lo demás (a 30 fps el pico del impulso cae entre dos
 * muestras), pero algunas entregan 60 con luz suficiente y ahí la medición
 * mejora sola. El máximo es `FPS_MAX`.
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
 * Qué da la cámara abierta: fps que entrega y fps máximo que podría entregar.
 * `getCapabilities` no existe en todos los navegadores; ahí se devuelve null.
 */
export function describeCamara(stream) {
  const track = stream?.getVideoTracks()[0];
  if (!track) return { fps: null, fpsMax: null, ancho: null, alto: null };
  const s = track.getSettings?.() ?? {};
  const c = track.getCapabilities?.() ?? {};
  return { fps: s.frameRate ?? null, fpsMax: c.frameRate?.max ?? null, ancho: s.width ?? null, alto: s.height ?? null };
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
 */
export function bucleDeFrames(video, onFrame, { fpsMax = FPS_MAX } = {}) {
  let vivo = true;
  let tUltimo = -Infinity;
  const minDt = 1 / fpsMax - 1e-4;
  const soportaRVFC = typeof video.requestVideoFrameCallback === 'function';
  const ctl = { soportaRVFC, saltados: 0, detener: () => (vivo = false) };

  const entrega = (t, meta) => {
    if (t - tUltimo < minDt) {
      ctl.saltados++;
      return;
    }
    tUltimo = t;
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
