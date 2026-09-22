// Generador de impulsos sintéticos: el mismo pipeline que la página, sin
// cámara ni MediaPipe. Lo comparten el banco (`banco.mjs`) y los tests.
import * as geom from '../js/geom.js';
import { Differentiator } from '../js/signal.js';
import { analyzeTrial, CONFIG } from '../js/analysis.js';

export const rad = (d) => (d * Math.PI) / 180;
export const deg = (r) => (r * 180) / Math.PI;
export const K = 0.95;
export const R = geom.EYE_ROTATION_RADIUS_MM;

/** Velocidad de cabeza gaussiana: pico `pk` °/s, sigma 40 ms, centrada en 150 ms. */
export function headVel(t, pk) {
  return pk * Math.exp(-(((t - 0.15) / 0.04) ** 2) / 2);
}

/** Posición: integral numérica de la velocidad. */
export function headPos(t, pk) {
  let p = 0;
  for (let u = 0; u < t; u += 0.0005) p += headVel(u, pk) * 0.0005;
  return p;
}

/** Offset del iris en mm dado el azimut de mirada `phi` y el yaw `H`, con paralaje `k`. */
export function offsetIris(phi, H, k = K) {
  return R * (Math.sin(rad(phi)) - k * Math.sin(rad(H)));
}

/**
 * Corre un impulso por el pipeline y devuelve el trial analizado.
 *
 * `rebote`: si se pasa, velocidad de un lóbulo contrario (°/s) que se agrega a
 * los 350 ms, para probar el rechazo por rebote.
 */
export function corre({ fps, pk, ganancia, ruidoMm = 0, k = K, kModelo = K, calibrado = true, rebote = 0, cfg = CONFIG, ventanaMs = 50 }) {
  const model = new geom.EyeModel();
  model.kParallax = kModelo;
  model.calibrated = calibrado;
  const diff = new Differentiator(ventanaMs, 2);
  const out = [];
  const dt = 1 / fps;
  for (let i = 0; i < Math.round(0.6 * fps); i++) {
    const t = i * dt;
    let H = headPos(t, pk);
    if (rebote) H -= (rebote / pk) * headPos(Math.max(0, t - 0.2), pk);
    // Con ganancia g, la mirada en el espacio deriva (1-g) de lo que giró la cabeza.
    const phi = (1 - ganancia) * H;
    const offset = offsetIris(phi, H, k) + (Math.random() - 0.5) * ruidoMm;
    const gaze = model.gazeAzimuthDeg({ offsetMm: offset, pxPerMm: 30 }, H);
    const d = diff.push({ t, headDeg: H, gazeDeg: gaze });
    if (d) out.push({ tMs: d.t * 1000, t: d.t, headPos: d.headDeg, gazePos: d.gazeDeg, headVel: d.headVel, gazeVel: d.gazeVel, blink: false });
  }
  return analyzeTrial(out, cfg);
}

/** Muestras de calibración: objetivo quieto en `phi0`, cabeza en vaivén de amplitud `amp`. */
export function muestrasCalibracion({ amp = 25, phi0 = 3, n = 120, ruidoMm = 0.04, k = K, miradaSuelta = 0 } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const H = amp * Math.sin((i / n) * 4 * Math.PI);
    const phi = phi0 + (Math.random() - 0.5) * miradaSuelta;
    out.push([offsetIris(phi, H, k) + (Math.random() - 0.5) * ruidoMm, H]);
  }
  return out;
}

// --- cuaterniones para armar matrices de MediaPipe en los tests ---

export function matDeQuat(q) {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    0, 0, 0, 1,
  ];
}
export const axisAngle = (ax, ang) => {
  const s = Math.sin(ang / 2);
  return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)];
};
export const qmul = (a, b) => {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz];
};
export const qrot = (q, v) => {
  const [x, y, z, w] = q;
  const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
  return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
};
