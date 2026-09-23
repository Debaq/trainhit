// Pulsos de ejemplo: un paciente sintético para explorar la página sin cámara.
//
// Sirven para los paseos del tutorial que tratan de LEER pulsos —los gráficos,
// las herramientas, las perillas—, que sin pulsos no tienen nada que mostrar,
// y para quien no tiene a nadie a mano a quien darle impulsos.
//
// No son pulsos analizados de antemano: son muestras CRUDAS por frame, lo
// mismo que guarda un pulso medido (yaw de la cabeza y offset del iris), y
// pasan por el motor entero. Por eso las perillas y «Recalcular» les hacen lo
// mismo que a un pulso de verdad, que es el punto.
//
// El paciente tiene el canal derecho sano y el izquierdo con déficit, y el
// déficit viene con sacadas encubiertas: como el motor no desacadiza, esas
// sacadas suben la ganancia medida del lado malo. Es el sesgo al falso
// negativo del README, a la vista.

import { EYE_ROTATION_RADIUS_MM } from './geom.js';

/** Paralaje del paciente sintético: el que tendría que dar su calibración. */
export const K_EJEMPLO = 0.95;

/** Cadencia de una webcam común, que es con lo que se usa esto. */
const FPS = 30;
/** Ancho del impulso: sigma de la velocidad gaussiana, en segundos. */
const SIGMA_S = 0.04;
/** Centro del impulso dentro de las muestras, en segundos. */
const CENTRO_S = 0.45;
/** Largo de las muestras: cubre el pre-trigger, el margen del derivador y la ventana. */
const LARGO_S = 1.3;
/** Umbral con que se ubica el disparo, como el detector en vivo. */
const DISPARO_DEG_S = 60;

/**
 * Los pulsos del paciente. `pico` en °/s, `lado` el del paciente,
 * `ganancia` la del reflejo sin sacadas, `sacada` cuándo corrige, en s desde
 * el centro del impulso. Hasta ~0,07 la sacada cae dentro de la ventana del
 * impulso (encubierta) y sube la ganancia medida: cuanto antes, más la tapa.
 * Desde ~0,25 cae afuera (manifiesta) y la ganancia medida es la del reflejo.
 */
export const PULSOS_EJEMPLO = [
  { lado: 'derecha', pico: 190, ganancia: 0.97 },
  { lado: 'izquierda', pico: 180, ganancia: 0.45, sacada: 0.07 },
  { lado: 'derecha', pico: 230, ganancia: 0.93 },
  { lado: 'izquierda', pico: 220, ganancia: 0.5, sacada: 0.25 },
  { lado: 'derecha', pico: 160, ganancia: 0.99 },
  { lado: 'izquierda', pico: 200, ganancia: 0.42, sacada: 0.06 },
  { lado: 'derecha', pico: 110, ganancia: 0.96 }, // muy lento: sale rechazado
  { lado: 'izquierda', pico: 240, ganancia: 0.48, sacada: 0.05 }, // la sacada lo tapa entero: se lee normal
  { lado: 'derecha', pico: 210, ganancia: 0.95, parpadeo: true }, // sale rechazado
  { lado: 'izquierda', pico: 170, ganancia: 0.52, sacada: 0.28 },
];

/** Generador determinista (mulberry32): los mismos ejemplos cada vez. */
function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Función de error (Abramowitz-Stegun 7.1.26): la posición es la integral de una gaussiana. */
function erf(x) {
  const s = Math.sign(x);
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496735) * t + 0.254829592) * t * Math.exp(-z * z);
  return s * y;
}

const suave = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const rad = (d) => (d * Math.PI) / 180;

/**
 * Muestras crudas de un impulso, como las guarda app.js: `{ t, yaw, offsetMm,
 * blinkScore, irisPx, vergMm }` por frame, con `t` en segundos.
 *
 * El yaw del motor es positivo hacia la IZQUIERDA del paciente (ver
 * `SIGNO_DERECHA` en analysis.js): un impulso a la derecha baja el yaw.
 */
export function crudoDeEjemplo({ lado, pico, ganancia, sacada = null, parpadeo = false }, semilla = 1) {
  const r = azar(semilla);
  const ruido = (amp) => (r() + r() + r() - 1.5) * amp; // casi normal, sin colas
  const signo = lado === 'derecha' ? -1 : 1;
  const amplitud = pico * SIGMA_S * Math.sqrt(2 * Math.PI); // grados que gira la cabeza
  const crudo = [];
  let tTrigger = null;

  for (let i = 0; i * (1 / FPS) <= LARGO_S; i++) {
    // El frame no llega exacto: un par de ms de temblor, como una webcam.
    const t = i / FPS + ruido(0.002);
    const u = (t - CENTRO_S) / SIGMA_S;
    const yaw = signo * amplitud * 0.5 * (1 + erf(u / Math.SQRT2)) + ruido(0.08);
    const vel = pico * Math.exp(-(u * u) / 2);
    if (tTrigger === null && vel > DISPARO_DEG_S) tTrigger = t;

    // Con ganancia g la mirada se va (1 − g) de lo que giró la cabeza; la
    // sacada la trae de vuelta al blanco en ~40 ms.
    let mirada = (1 - ganancia) * yaw;
    if (sacada !== null) mirada *= 1 - suave((t - CENTRO_S - sacada) / 0.04);

    const offsetMm = EYE_ROTATION_RADIUS_MM * (Math.sin(rad(mirada)) - K_EJEMPLO * Math.sin(rad(yaw))) + ruido(0.025);
    // Puntaje de parpadeo (0 abierto, 1 cerrado), como lo guarda app.js. El
    // parpadeo cierra a ~0,85: una perilla por encima de eso lo deja pasar.
    const cerrado = parpadeo && t > CENTRO_S - 0.03 && t < CENTRO_S + 0.1;
    const blinkScore = cerrado ? 0.85 + ruido(0.03) : Math.max(0, 0.08 + ruido(0.04));
    crudo.push({ t, yaw, offsetMm, blinkScore, irisPx: 9 + ruido(0.3), vergMm: ruido(0.02) });
  }
  return { crudo, tTrigger };
}

/**
 * Muestras de la calibración del paciente sintético: `[offsetMm, yaw]` como
 * las junta app.js, mirando un blanco quieto y con la cabeza en vaivén lento
 * de ±25°. Con esto el gráfico del paralaje de Herramientas tiene su recta.
 */
export function calibracionDeEjemplo(semilla = 99) {
  const r = azar(semilla);
  const ruido = (amp) => (r() + r() + r() - 1.5) * amp;
  const out = [];
  const n = 240; // 8 s a 30 fps
  for (let i = 0; i < n; i++) {
    const yaw = 25 * Math.sin((i / n) * 4 * Math.PI) + ruido(0.1);
    const mirada = 2 + ruido(0.3); // el blanco, un poco corrido del centro
    out.push([EYE_ROTATION_RADIUS_MM * (Math.sin(rad(mirada)) - K_EJEMPLO * Math.sin(rad(yaw))) + ruido(0.03), yaw]);
  }
  return out;
}
