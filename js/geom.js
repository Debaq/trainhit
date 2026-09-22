// Geometría ocular: de landmarks de MediaPipe a un ángulo de mirada en
// unidades físicas. Port didáctico de `rust/src/geom.rs` del repo principal.
//
// La idea central: el iris es la regla. Su diámetro (HVID) es ~11.7 mm con muy
// poca varianza poblacional, y al proyectarse se ve como una elipse cuyo
// SEMIEJE MAYOR sigue midiendo el radio real (girar la cabeza acorta el eje
// horizontal, no el vertical). De ahí sale una escala px/mm que no depende ni
// de la distancia a la cámara ni del giro de la cabeza.
//
//   radio_px = max |borde_i - centro|
//   px_por_mm = radio_px / (11.7/2)
//
// Con esa escala, el desplazamiento del iris respecto del punto medio de las
// comisuras se mide en mm, y el ángulo sale de un modelo esférico del globo:
//
//   sin(azimut) = offset_mm / R
//
// El término de paralaje (ver más abajo) es lo que hace que la ganancia
// signifique algo.

/** Diámetro horizontal visible del iris, en mm (media poblacional). */
export const IRIS_DIAMETER_MM = 11.7;

/** Centro de rotación del globo -> centro del iris, en mm. */
export const EYE_ROTATION_RADIUS_MM = 10.5;

/** Apertura típica de un ojo bien abierto, en unidades de ancho de ojo. */
export const EYE_OPEN_REF = 0.3;

export const CALIB_MIN_HEAD_RANGE_DEG = 20;
export const CALIB_MAX_RESIDUAL_DEG = 2.5;
export const CALIB_MIN_SAMPLES = 10;
export const CALIB_K_PLAUSIBLE = [0.6, 1.3];

const deg = (r) => (r * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Landmark normalizado -> píxeles ISÓTROPOS.
 *
 * Los landmarks vienen normalizados a [0,1] por ancho y por alto POR SEPARADO,
 * así que en una imagen 16:9 una misma distancia física da números distintos
 * según la dirección. Sin corregirlo, el error depende de cuánto esté rotada
 * la cabeza — o sea, entra justo en la ventana que se está midiendo.
 */
export function px(lm, w, h) {
  return { x: lm.x * w, y: lm.y * h };
}

export function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

/**
 * Mide un ojo: offset del iris en mm y escala px/mm.
 *
 * `border` son los cuatro puntos del borde del iris, en cualquier orden: se usa
 * la distancia máxima al centro, que es el semieje mayor de la elipse.
 *
 * El offset se proyecta sobre el eje comisura externa -> interna, no sobre la
 * horizontal de la imagen, para que inclinar la cabeza (roll) no meta error.
 *
 * @returns {{offsetMm:number, pxPerMm:number, radiusPx:number}|null}
 */
export function observeEye(irisCenter, border, outer, inner) {
  if (!border.length) return null;
  const radiusPx = border.reduce((m, p) => Math.max(m, dist(p, irisCenter)), 0);
  if (radiusPx < 0.5) return null; // iris degenerado: ojo cerrado o detección perdida
  const pxPerMm = radiusPx / (IRIS_DIAMETER_MM * 0.5);

  const ax = inner.x - outer.x;
  const ay = inner.y - outer.y;
  const len = Math.hypot(ax, ay);
  if (len < 1e-3) return null;
  const ux = ax / len;
  const uy = ay / len;

  const midX = (outer.x + inner.x) * 0.5;
  const midY = (outer.y + inner.y) * 0.5;
  const offsetPx = (irisCenter.x - midX) * ux + (irisCenter.y - midY) * uy;

  return { offsetMm: offsetPx / pxPerMm, pxPerMm, radiusPx };
}

/** Cuánto más ancho que el ojo es el recorte. */
export const EYE_CROP_MARGIN = 1.7;
/** Relación ancho/alto del recorte, fija para que los dos ojos se vean iguales. */
export const EYE_CROP_ASPECT = 1.8;

/**
 * Caja alrededor de un ojo, en coordenadas normalizadas de la imagen.
 *
 * El tamaño sale de la distancia entre comisuras, así que el ojo se ve del
 * mismo tamaño esté el paciente cerca o lejos: es un zoom que se ajusta solo.
 * Se calcula en PÍXELES y recién al final se normaliza, porque en una imagen
 * 16:9 una caja cuadrada en normalizadas no es cuadrada en pantalla.
 */
export function eyeCrop(outer, inner, imgW, imgH) {
  if (imgW < 1 || imgH < 1) return null;
  const anchoPx = dist(outer, inner) * EYE_CROP_MARGIN;
  if (anchoPx < 1) return null;
  const altoPx = anchoPx / EYE_CROP_ASPECT;
  const cx = (outer.x + inner.x) * 0.5;
  const cy = (outer.y + inner.y) * 0.5;
  return {
    x0: clamp((cx - anchoPx * 0.5) / imgW, 0, 1),
    y0: clamp((cy - altoPx * 0.5) / imgH, 0, 1),
    x1: clamp((cx + anchoPx * 0.5) / imgW, 0, 1),
    y1: clamp((cy + altoPx * 0.5) / imgH, 0, 1),
  };
}

/**
 * Apertura del párpado como fracción del ancho del ojo ("eye aspect ratio").
 * Cociente entre dos medidas de la misma cara: no depende de la distancia.
 */
export function eyelidOpenness(upper, lower, outer, inner) {
  const ancho = dist(outer, inner);
  if (ancho < 1e-3) return null;
  return dist(upper, lower) / ancho;
}

/** Puntuación de parpadeo: 0 abierto, 1 cerrado. */
export function blinkScore(openness) {
  return clamp(1 - openness / EYE_OPEN_REF, 0, 1);
}

/**
 * Modelo ocular del paciente.
 *
 * `kParallax = 0` marca que todavía NO se midió la paralaje, y por lo tanto la
 * ganancia no es confiable.
 */
export class EyeModel {
  constructor() {
    this.radiusMm = EYE_ROTATION_RADIUS_MM;
    this.kParallax = 0;
    this.offsetBiasMm = 0;
    this.calibrated = false;
  }

  /**
   * Azimut de mirada EN EL MARCO DE LA CÁMARA, en grados.
   *
   * Con VOR perfecto y un objetivo fijo esta cantidad se queda quieta mientras
   * la cabeza gira: es la formulación más directa de lo que el VOR hace.
   *
   *   offset_medido = R*sin(phi) - t*sin(H)
   *   => sin(phi) = offset_medido/R + k*sin(H),   k = t/R
   *
   * `k` vale ~0.9-1.0 anatómicamente: el artefacto tiene la MISMA magnitud que
   * la señal. Con k=0 un VOR perfecto se lee como ganancia ~1.9.
   */
  gazeAzimuthDeg(obs, headYawDeg) {
    const h = rad(headYawDeg);
    const sinPhi =
      (obs.offsetMm - this.offsetBiasMm) / this.radiusMm + this.kParallax * Math.sin(h);
    return deg(Math.asin(clamp(sinPhi, -0.999, 0.999)));
  }
}

/**
 * Estima la paralaje con muestras tomadas mientras el paciente FIJA un objetivo
 * quieto y mueve la cabeza LENTO.
 *
 * A baja velocidad el VOR es esencialmente perfecto, así que phi es constante:
 *
 *   offset_mm/R = sin(phi_0) - k*sin(H)
 *
 * Es una recta. Regresión de `offset_mm/R` contra `sin(H)`: la pendiente es -k
 * y la ordenada al origen es sin(phi_0). El SIGNO sale de los datos, así que no
 * hay que adivinar la convención de ejes ni si la imagen está espejada.
 *
 * @param {Array<[number,number]>} samples pares (offsetMm, headYawDeg)
 */
export function fitParallax(samples, radiusMm) {
  if (samples.length < CALIB_MIN_SAMPLES) return null;

  const n = samples.length;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let minH = Infinity;
  let maxH = -Infinity;
  for (const [offsetMm, headYawDeg] of samples) {
    const x = Math.sin(rad(headYawDeg));
    const y = offsetMm / radiusMm;
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
    minH = Math.min(minH, headYawDeg);
    maxH = Math.max(maxH, headYawDeg);
  }

  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return null; // la cabeza no se movió
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;

  const kParallax = -slope;
  const sinPhi0 = clamp(intercept, -0.999, 0.999);
  const phi0 = deg(Math.asin(sinPhi0));

  // Residuo en grados de azimut, que es la unidad en la que uno puede decir si
  // el ajuste sirve o no.
  let sumSq = 0;
  for (const [offsetMm, headYawDeg] of samples) {
    const sinPhi = offsetMm / radiusMm + kParallax * Math.sin(rad(headYawDeg));
    const phi = deg(Math.asin(clamp(sinPhi, -0.999, 0.999)));
    sumSq += (phi - phi0) ** 2;
  }

  const fit = {
    kParallax,
    targetAzimuthDeg: phi0,
    residualDeg: Math.sqrt(sumSq / n),
    headRangeDeg: maxH - minH,
    samples: n,
    slope,
    intercept,
  };
  fit.issue = parallaxIssue(fit);
  fit.acceptable = fit.issue === null;
  fit.kPlausible =
    kParallax >= CALIB_K_PLAUSIBLE[0] && kParallax <= CALIB_K_PLAUSIBLE[1];
  return fit;
}

/** Por qué se rechaza una calibración, en el orden que le sirve al operador. */
export function parallaxIssue(fit) {
  if (fit.samples < CALIB_MIN_SAMPLES) return 'pocas-muestras';
  if (fit.headRangeDeg < CALIB_MIN_HEAD_RANGE_DEG) return 'rango-corto';
  if (!(fit.residualDeg <= CALIB_MAX_RESIDUAL_DEG)) return 'residuo-alto';
  if (!Number.isFinite(fit.kParallax) || Math.abs(fit.kParallax) >= 3) return 'k-absurdo';
  return null;
}

export const CALIB_ISSUE_TEXT = {
  'pocas-muestras': 'Casi no se vio la cara. Mejorar la luz y permanecer en el encuadre.',
  'rango-corto': 'La cabeza se movió poco. Se necesitan ±20° a cada lado.',
  'residuo-alto': 'La mirada no se quedó quieta. Fijar un punto y mover la cabeza MÁS LENTO.',
  'k-absurdo': 'El ajuste cerró pero k da un disparate: no es paralaje lo que se midió.',
};
