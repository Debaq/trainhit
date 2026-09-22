// De muestras crudas a un pulso analizado. Es el tramo del motor que va
// después de los landmarks: ángulo de mirada, derivada, ventana y ganancias.
//
// Está separado para que un pulso se pueda RECALCULAR: cada pulso guarda sus
// muestras crudas (yaw y offset del iris por frame), y con ellas se puede
// volver a correr todo con otra ventana del derivador, otro grado, otros
// umbrales u otro `k`. Es la forma de ver qué hace cada perilla sobre un
// pulso que ya se midió, en vez de tener que hacer otro impulso.

import { Differentiator } from './signal.js';
import { analyzeTrial } from './analysis.js';

/**
 * Margen de muestras crudas que se guarda ANTES del pre-trigger, para que el
 * derivador arranque caliente cuando se recalcula. Cubre la ventana más ancha
 * de la perilla (200 ms).
 */
export const MARGEN_CRUDO_MS = 250;

/**
 * Corre el motor sobre muestras crudas y devuelve el pulso analizado.
 *
 * @param {Array<{t:number,yaw:number,offsetMm:number,blink:boolean,irisPx?:number,vergMm?:number}>} crudo
 *   una por frame, `t` en segundos
 * @param {number} tTrigger instante del disparo, en segundos: el cero del pulso
 * @param {{gazeAzimuthDeg:Function}} model modelo ocular (trae el `k`)
 * @param {{windowMs:number,degree:number}} deriv perillas del derivador
 * @param cfg configuración del análisis
 * @returns el trial de `analyzeTrial`, o null si no alcanzan las muestras
 */
export function procesaCrudo(crudo, tTrigger, model, deriv, cfg) {
  const diff = new Differentiator(deriv.windowMs, deriv.degree);
  const desde = tTrigger - cfg.impulse.preTriggerMs / 1000;
  const hasta = tTrigger + cfg.impulse.windowMs / 1000;
  const out = [];
  for (const c of crudo) {
    const gaze = model.gazeAzimuthDeg({ offsetMm: c.offsetMm }, c.yaw);
    const d = diff.push({ t: c.t, headDeg: c.yaw, gazeDeg: gaze });
    if (!d || d.t < desde) continue;
    out.push({
      t: d.t,
      tMs: (d.t - tTrigger) * 1000,
      headPos: d.headDeg,
      gazePos: d.gazeDeg,
      headVel: d.headVel,
      gazeVel: d.gazeVel,
      blink: c.blink,
      irisPx: c.irisPx ?? null,
      vergMm: c.vergMm ?? null,
      // Lo crudo del frame que cerró la ventana, para el CSV de muestras.
      crudo: { tMs: (c.t - tTrigger) * 1000, yaw: c.yaw, offsetMm: c.offsetMm },
    });
    if (d.t >= hasta) break;
  }
  const trial = analyzeTrial(out, cfg);
  if (trial) trial.tTrigger = tTrigger;
  return trial;
}
