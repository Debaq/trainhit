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

export async function crearLandmarker({ gpu = true } = {}) {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: gpu ? 'GPU' : 'CPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
    // El transform 4x4 cara->cámara es de donde sale la rotación de cabeza.
    outputFacialTransformationMatrixes: true,
    // Los blendshapes obligan a correr un modelo entero más por frame; el
    // parpadeo se saca de la malla con dos restas (ver geom.eyelidOpenness).
    outputFaceBlendshapes: false,
  });
}

/**
 * Pide la cámara. Se piden 60 fps a propósito: la mayoría de las webcams dan 30
 * y eso ya limita todo lo demás (a 30 fps el pico del impulso cae entre dos
 * muestras), pero algunas entregan 60 con luz suficiente y ahí la medición
 * mejora sola.
 */
export async function abrirCamara(video, { deviceId, width = 1280, height = 720, fps = 60 } = {}) {
  const constraints = {
    audio: false,
    video: {
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: fps },
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
    },
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;
  await video.play();
  return stream;
}

export async function listarCamaras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'videoinput');
}

/**
 * Bucle de frames. Usa `requestVideoFrameCallback` cuando existe: da el
 * timestamp REAL de captura del frame (`mediaTime`), que es lo que el derivador
 * necesita — el reloj del bucle trae el jitter de captura y de inferencia.
 */
export function bucleDeFrames(video, onFrame) {
  let vivo = true;
  const soportaRVFC = typeof video.requestVideoFrameCallback === 'function';

  if (soportaRVFC) {
    const step = (_now, meta) => {
      if (!vivo) return;
      onFrame(meta.mediaTime, meta);
      video.requestVideoFrameCallback(step);
    };
    video.requestVideoFrameCallback(step);
  } else {
    const step = () => {
      if (!vivo) return;
      onFrame(video.currentTime, null);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  return {
    detener() {
      vivo = false;
    },
    soportaRVFC,
  };
}
