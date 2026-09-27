// La cara dibujada: lo que vería la cámara si el teléfono fuera una cabeza.
//
// Con el teléfono como cabeza no hay cámara ni MediaPipe. El giro llega del
// giroscopio y el ojo sale de un modelo: con el reflejo sano la mirada se
// queda en el blanco, y el simulador (simulacion.js) le agrega el arrastre y
// las sacadas de la patología, igual que a un pulso de la webcam. Esta cara
// es el paciente de ese modelo, dibujado desde la cámara: la cabeza gira con
// el teléfono y el iris se corre en la órbita lo que el motor lee.
//
// No es un dibujo aparte de la medición. Las comisuras y el iris salen de la
// MISMA geometría que el motor invierte (geom.js):
//
//   offset = R·sin(mirada) − t·sin(H),   t = k·R
//
// el globo gira alrededor de su centro, R = 10,5 mm, y las comisuras están
// `t` por delante, pegadas a la cabeza. Así los puntos que se ven sobre la
// cara son los que el motor habría medido, y en los ojos ampliados se ve lo
// que se ve en un vHIT: con el reflejo sano el iris se queda mirando a la
// cámara mientras la cara gira; con déficit se va con la cabeza y una sacada
// lo trae de vuelta.
//
// Coordenadas de la IMAGEN, sin espejar, como las de la webcam: x hacia la
// derecha de la imagen, que es la izquierda del paciente, e y hacia abajo. El
// espejo lo pone el CSS, igual que al video.

import { EYE_ROTATION_RADIUS_MM, IRIS_DIAMETER_MM } from './geom.js';
import { COLOR } from './plots.js';

const rad = (d) => (d * Math.PI) / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Tamaño de la imagen de la cámara que no existe, en píxeles: 4:3. */
export const ANCHO = 960;
export const ALTO = 720;
/** Escala de la imagen. Da un iris de ~19 px de radio, holgado para el mínimo. */
export const PX_POR_MM = 3.2;
export const IRIS_PX = (IRIS_DIAMETER_MM / 2) * PX_POR_MM;

/** Centro de cada globo: a los lados de la línea media y por delante del eje de giro de la cabeza. */
const GLOBO_LADO_MM = 31;
const GLOBO_DELANTE_MM = 80;
/** Media apertura horizontal y vertical del ojo. */
const OJO_MEDIO_ANCHO_MM = 13;
const OJO_MEDIO_ALTO_MM = 5.5;
/** Dónde queda el ojo en la imagen: un poco arriba del medio. */
const Y_OJOS = ALTO * 0.44;

/**
 * El corrimiento del iris de un ojo sano: la mirada quieta en el blanco (la
 * cámara), con el paralaje del modelo. Es lo que el motor lee como mirada 0.
 */
export function offsetSano(yawDeg, { radiusMm = EYE_ROTATION_RADIUS_MM, kParallax }) {
  return -radiusMm * kParallax * Math.sin(rad(yawDeg));
}

/** Un punto pegado a la cabeza (`lado` hacia la izquierda del paciente, `delante` hacia la cámara), girado `yaw`. */
function gira(lado, delante, yaw) {
  const h = rad(yaw);
  return { x: lado * Math.cos(h) + delante * Math.sin(h), z: delante * Math.cos(h) - lado * Math.sin(h) };
}

/** De mm en la cabeza a píxeles de la imagen. */
const px = (xMm, yMm) => ({ x: ANCHO / 2 + xMm * PX_POR_MM, y: Y_OJOS + yMm * PX_POR_MM });

/**
 * La geometría de los dos ojos en la imagen, en píxeles. `menor` y `mayor`
 * son las comisuras de x menor y mayor: el motor mide sobre el eje que va de
 * `outer` a `inner` de IDX, que en los dos ojos apunta a la derecha de la imagen.
 */
export function geometria(yawDeg, offsetMm, { radiusMm = EYE_ROTATION_RADIUS_MM, kParallax }) {
  const t = kParallax * radiusMm;
  // La mirada en el espacio que da ese corrimiento, con el mismo modelo que
  // la lee el motor: sin(mirada) = offset/R + k·sin(H).
  const sinMirada = clamp(offsetMm / radiusMm + kParallax * Math.sin(rad(yawDeg)), -0.999, 0.999);
  const cosMirada = Math.sqrt(1 - sinMirada ** 2);
  const ojo = (signo) => {
    const globo = gira(signo * GLOBO_LADO_MM, GLOBO_DELANTE_MM, yawDeg);
    const a = gira(signo * GLOBO_LADO_MM - OJO_MEDIO_ANCHO_MM, GLOBO_DELANTE_MM + t, yawDeg);
    const b = gira(signo * GLOBO_LADO_MM + OJO_MEDIO_ANCHO_MM, GLOBO_DELANTE_MM + t, yawDeg);
    return {
      menor: px(a.x, 0),
      mayor: px(b.x, 0),
      iris: px(globo.x + radiusMm * sinMirada, 0),
      // El iris de frente es un círculo; girado, una elipse más angosta. El
      // semieje vertical no cambia: es la regla del motor (geom.js).
      irisRx: IRIS_PX * cosMirada,
      irisRy: IRIS_PX,
    };
  };
  // El derecho del paciente queda a la izquierda de la imagen.
  return { derecho: ojo(-1), izquierdo: ojo(1) };
}

/**
 * Los landmarks que habría dado MediaPipe, normalizados a la imagen: solo los
 * de `IDX` (tracker.js, que se pasa para no cargar MediaPipe aquí) que usan los
 * recortes y los puntos del overlay.
 */
export function landmarks(geo, IDX) {
  const lms = [];
  const n = (p) => ({ x: p.x / ANCHO, y: p.y / ALTO });
  for (const [lado, idx] of Object.entries(IDX)) {
    const o = geo[lado];
    lms[idx.outer] = n(o.menor);
    lms[idx.inner] = n(o.mayor);
    lms[idx.iris] = n(o.iris);
    const [b0, b1, b2, b3] = idx.border;
    lms[b0] = n({ x: o.iris.x + o.irisRx, y: o.iris.y });
    lms[b1] = n({ x: o.iris.x, y: o.iris.y - o.irisRy });
    lms[b2] = n({ x: o.iris.x - o.irisRx, y: o.iris.y });
    lms[b3] = n({ x: o.iris.x, y: o.iris.y + o.irisRy });
  }
  return lms;
}

/**
 * Dibuja la cara en `lienzo` (se lo lleva a ANCHO × ALTO) y devuelve su
 * geometría. La cabeza es un óvalo con orejas, cejas, nariz y boca, todo
 * pegado a la cabeza y girado con ella; los ojos, la parte que importa.
 */
export function dibujaCara(lienzo, yawDeg, offsetMm, model) {
  if (lienzo.width !== ANCHO || lienzo.height !== ALTO) {
    lienzo.width = ANCHO;
    lienzo.height = ALTO;
  }
  const ctx = lienzo.getContext('2d');
  const geo = geometria(yawDeg, offsetMm, model);
  const P = (lado, delante, y) => px(gira(lado, delante, yawDeg).x, y);
  const coseno = Math.cos(rad(yawDeg));

  ctx.fillStyle = COLOR.video;
  ctx.fillRect(0, 0, ANCHO, ALTO);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = COLOR.caraLinea;
  ctx.lineWidth = 3;

  // Orejas, antes que la cabeza: asoman por el costado que se aleja.
  ctx.fillStyle = COLOR.caraPiel;
  for (const s of [-1, 1]) {
    const o = P(s * 76, 5, 8);
    ctx.beginPath();
    ctx.ellipse(o.x, o.y, 9 * PX_POR_MM, 22 * PX_POR_MM, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // La cabeza: un óvalo cuyo centro va un poco por delante del eje de giro.
  const c = P(0, 22, 22);
  ctx.beginPath();
  ctx.ellipse(c.x, c.y, 76 * PX_POR_MM, 104 * PX_POR_MM, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Cejas.
  ctx.lineWidth = 5;
  for (const s of [-1, 1]) {
    const a = P(s * (GLOBO_LADO_MM - 15), GLOBO_DELANTE_MM + 14, -15);
    const m = P(s * GLOBO_LADO_MM, GLOBO_DELANTE_MM + 15, -19);
    const b = P(s * (GLOBO_LADO_MM + 16), GLOBO_DELANTE_MM + 8, -14);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(m.x, m.y, b.x, b.y);
    ctx.stroke();
  }

  // Nariz: el puente, la punta —que es lo que más se corre al girar— y la base.
  ctx.lineWidth = 3;
  const puente = P(0, GLOBO_DELANTE_MM + 14, 0);
  const punta = P(0, GLOBO_DELANTE_MM + 36, 30);
  const alaDer = P(-10, GLOBO_DELANTE_MM + 22, 35);
  const alaIzq = P(10, GLOBO_DELANTE_MM + 22, 35);
  ctx.beginPath();
  ctx.moveTo(puente.x, puente.y);
  ctx.lineTo(punta.x, punta.y);
  ctx.moveTo(alaDer.x, alaDer.y);
  ctx.quadraticCurveTo(punta.x, punta.y + 4 * PX_POR_MM, alaIzq.x, alaIzq.y);
  ctx.stroke();

  // Boca.
  const bocaDer = P(-24, GLOBO_DELANTE_MM + 10, 62);
  const bocaMedio = P(0, GLOBO_DELANTE_MM + 18, 67);
  const bocaIzq = P(24, GLOBO_DELANTE_MM + 10, 62);
  ctx.beginPath();
  ctx.moveTo(bocaDer.x, bocaDer.y);
  ctx.quadraticCurveTo(bocaMedio.x, bocaMedio.y, bocaIzq.x, bocaIzq.y);
  ctx.stroke();

  // Los ojos: la abertura entre las comisuras, y adentro el iris y la pupila,
  // recortados por los párpados.
  const alto = OJO_MEDIO_ALTO_MM * PX_POR_MM * (0.6 + 0.4 * coseno);
  for (const o of [geo.derecho, geo.izquierdo]) {
    const mx = (o.menor.x + o.mayor.x) / 2;
    const my = o.menor.y;
    const abertura = new Path2D();
    abertura.moveTo(o.menor.x, my);
    abertura.quadraticCurveTo(mx, my - alto * 2, o.mayor.x, my);
    abertura.quadraticCurveTo(mx, my + alto * 1.6, o.menor.x, my);
    abertura.closePath();
    ctx.fillStyle = COLOR.caraEsclera;
    ctx.fill(abertura);
    ctx.save();
    ctx.clip(abertura);
    ctx.fillStyle = COLOR.caraIris;
    ctx.beginPath();
    ctx.ellipse(o.iris.x, o.iris.y, o.irisRx, o.irisRy, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLOR.caraPupila;
    ctx.beginPath();
    ctx.ellipse(o.iris.x, o.iris.y, o.irisRx * 0.4, o.irisRy * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.stroke(abertura);
  }
  return geo;
}
