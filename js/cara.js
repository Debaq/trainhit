// La cara dibujada: lo que vería la cámara si el teléfono fuera una cabeza.
//
// Con el teléfono como cabeza no hay cámara ni MediaPipe. El giro llega del
// giroscopio y el ojo sale de un modelo: con el reflejo sano la mirada se
// queda en el blanco, y el simulador (simulacion.js) le agrega el arrastre y
// las sacadas de la patología, igual que a un pulso de la webcam. Esta cara
// es el paciente de ese modelo, dibujado desde la cámara: la cabeza gira con
// el teléfono y el iris se corre en la órbita lo que el motor lee.
//
// No es un dibujo aparte de la medición. En el canal lateral las comisuras y
// el iris salen de la MISMA geometría que el motor invierte (geom.js):
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
// La cabeza es un sólido: gira con la orientación ENTERA del teléfono, no
// solo de costado, y se proyecta de frente sobre la imagen. Así sirven los
// planos verticales: se ve la cara girada 45° y cabeceando, y el ojo que
// compensa girando alrededor del eje del canal (ver `pose`). Ese giro tiene
// una parte vertical y otra de TORSIÓN —el ojo rueda alrededor de la línea
// de la mirada—, que un iris liso no mostraría: por eso el iris tiene fibras
// y una cripta, y la esclera vasos, que ruedan con el ojo. Con la cabeza a
// 45° y la mirada en el plano del canal casi no hay torsión; con la cabeza
// de frente, el mismo impulso es mitad torsión: por eso se gira la cabeza.
//
// Coordenadas de la CABEZA, en mm: x hacia la izquierda del paciente, y hacia
// arriba, z hacia la nariz (las de head.js), con el cero a la altura de los
// ojos y 80 mm por detrás. Coordenadas de la IMAGEN, sin espejar, como las de
// la webcam: x hacia la derecha de la imagen, que es la izquierda del
// paciente, e y hacia abajo. El espejo lo pone el CSS, igual que al video.

import { EYE_ROTATION_RADIUS_MM, IRIS_DIAMETER_MM } from './geom.js';
import { quatRotate } from './head.js';
import { COLOR } from './plots.js';

const rad = (d) => (d * Math.PI) / 180;

/** Tamaño de la imagen de la cámara que no existe, en píxeles: 4:3. */
export const ANCHO = 960;
export const ALTO = 720;
/** Escala de la imagen. Da un iris de ~19 px de radio, holgado para el mínimo. */
export const PX_POR_MM = 3.2;
export const IRIS_PX = (IRIS_DIAMETER_MM / 2) * PX_POR_MM;
const IRIS_MM = IRIS_DIAMETER_MM / 2;

/** Centro de cada globo: a los lados de la línea media y por delante del eje de giro de la cabeza. */
const GLOBO_LADO_MM = 31;
const GLOBO_DELANTE_MM = 80;
/** Radio de la esclera: el borde del iris (el limbo) queda sobre ella. */
const ESCLERA_MM = Math.hypot(EYE_ROTATION_RADIUS_MM, IRIS_MM);
/** Media apertura horizontal y vertical del ojo. */
const OJO_MEDIO_ANCHO_MM = 13;
const OJO_MEDIO_ALTO_MM = 5.5;
/** Dónde queda el ojo en la imagen: un poco arriba del medio. */
const Y_OJOS = ALTO * 0.44;
/**
 * Alrededor de qué punto gira la cabeza, por debajo de los ojos: el cuello,
 * más o menos a la altura de la base del cráneo. El giro de costado no lo
 * nota (su eje es vertical); el cabeceo sí.
 */
const PIVOTE = [0, -25, 0];

/** Cuaternión de un giro de `grados` alrededor de `eje` (unitario). */
function qEje(eje, grados) {
  const s = Math.sin(rad(grados) / 2);
  return [eje[0] * s, eje[1] * s, eje[2] * s, Math.cos(rad(grados) / 2)];
}

/**
 * La pose de la cara: la orientación de la cabeza (de la cabeza al mundo, con
 * el mundo del frente al centrar) y la del ojo EN EL MUNDO.
 *
 * El ojo sano se queda en el blanco, que es la cámara: sin giro en el mundo,
 * tampoco de torsión. Con déficit la mirada se corre `miradaDeg` alrededor
 * del eje del canal, que viaja con la cabeza: es el azimut de mirada del
 * motor, en el plano que se examina.
 *
 * @param {number[]} q cabeza, [x, y, z, w]
 * @param {number[]} eje eje del plano en la cabeza (`CANAL_AXIS` de head.js)
 * @param {number} miradaDeg
 */
export function pose(q, eje, miradaDeg) {
  return { q, qOjo: qEje(quatRotate(q, eje), miradaDeg) };
}

/** La pose de un giro de costado: la cabeza girada `yawDeg` y la mirada corrida `miradaDeg`. */
export function poseLateral(yawDeg, miradaDeg = 0) {
  return pose(qEje([0, 1, 0], yawDeg), [0, 1, 0], miradaDeg);
}

/**
 * El corrimiento del iris de un ojo sano: la mirada quieta en el blanco (la
 * cámara), con el paralaje del modelo. Es lo que el motor lee como mirada 0.
 */
export function offsetSano(yawDeg, { radiusMm = EYE_ROTATION_RADIUS_MM, kParallax }) {
  return -radiusMm * kParallax * Math.sin(rad(yawDeg));
}

/** Un punto de la cabeza, en mm, llevado al mundo con la orientación `q`. */
function alMundo(q, p) {
  const r = quatRotate(q, [p[0] - PIVOTE[0], p[1] - PIVOTE[1], p[2] - PIVOTE[2]]);
  return [r[0] + PIVOTE[0], r[1] + PIVOTE[1], r[2] + PIVOTE[2]];
}

/** De mm en el mundo a píxeles de la imagen: proyección de frente, sin perspectiva. */
const px = (w) => ({ x: ANCHO / 2 + w[0] * PX_POR_MM, y: Y_OJOS - w[1] * PX_POR_MM });

const suma = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];

/**
 * La geometría de los dos ojos en la imagen, en píxeles. `menor` y `mayor`
 * son las comisuras de x menor y mayor con la cara de frente: el motor mide
 * sobre el eje que va de `outer` a `inner` de IDX, que en los dos ojos apunta
 * a la derecha de la imagen. `borde` son los cuatro puntos del iris que da
 * MediaPipe: hacia la izquierda del ojo, arriba, derecha y abajo, que ruedan
 * con él.
 *
 * Además, en mm del mundo, lo que hace falta para dibujarlo: el centro del
 * globo, el del iris y los ejes del ojo (`e1` a la izquierda, `e2` arriba,
 * `g` la mirada).
 */
export function geometria({ q, qOjo }, { radiusMm = EYE_ROTATION_RADIUS_MM, kParallax }) {
  const t = kParallax * radiusMm;
  const g = quatRotate(qOjo, [0, 0, 1]);
  const e1 = quatRotate(qOjo, [1, 0, 0]);
  const e2 = quatRotate(qOjo, [0, 1, 0]);
  const ojo = (signo) => {
    const lado = signo * GLOBO_LADO_MM;
    const centro = alMundo(q, [lado, 0, GLOBO_DELANTE_MM]);
    const iris = suma(centro, g, radiusMm);
    const P = (x, y, z) => px(alMundo(q, [lado + x, y, GLOBO_DELANTE_MM + t + z]));
    return {
      menor: P(-OJO_MEDIO_ANCHO_MM, 0, 0),
      mayor: P(OJO_MEDIO_ANCHO_MM, 0, 0),
      // Los párpados: el punto de control de cada curva, por delante del globo.
      arriba: P(0, OJO_MEDIO_ALTO_MM * 2, 3),
      abajo: P(0, -OJO_MEDIO_ALTO_MM * 1.6, 3),
      iris: px(iris),
      borde: [e1, e2, e1.map((v) => -v), e2.map((v) => -v)].map((e) => px(suma(iris, e, IRIS_MM))),
      mundo: { centro, iris, g, e1, e2 },
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
    idx.border.forEach((b, i) => (lms[b] = n(o.borde[i])));
  }
  return lms;
}

/**
 * El contorno de un elipsoide de la cabeza visto de frente: centro y semiejes
 * en mm de la cabeza, alineados con ella. Es una elipse, y sale de la matriz
 * del elipsoide girada, quitándole la profundidad (el complemento de Schur).
 * Devuelve lo que pide `ctx.ellipse`, en píxeles.
 */
function contorno(q, centro, semiejes) {
  const ejes = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ].map((e) => quatRotate(q, e));
  // M = Σ eᵢ eᵢᵀ / aᵢ², en el mundo.
  const M = [0, 1, 2].map((i) => [0, 1, 2].map((j) => ejes.reduce((s, e, k) => s + (e[i] * e[j]) / semiejes[k] ** 2, 0)));
  const a = M[0][0] - (M[0][2] * M[0][2]) / M[2][2];
  const b = M[0][1] - (M[0][2] * M[1][2]) / M[2][2];
  const d = M[1][1] - (M[1][2] * M[1][2]) / M[2][2];
  // En la imagen y va hacia abajo: el término cruzado cambia de signo.
  const bi = -b;
  const ang = 0.5 * Math.atan2(2 * bi, a - d);
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const l1 = a * c * c + 2 * bi * s * c + d * s * s;
  const l2 = a * s * s - 2 * bi * s * c + d * c * c;
  const p = px(alMundo(q, centro));
  return { x: p.x, y: p.y, rx: PX_POR_MM / Math.sqrt(l1), ry: PX_POR_MM / Math.sqrt(l2), ang };
}

function elipsoide(ctx, q, centro, semiejes) {
  const e = contorno(q, centro, semiejes);
  ctx.beginPath();
  ctx.ellipse(e.x, e.y, e.rx, e.ry, e.ang, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/** Un círculo del ojo (el iris, la pupila) proyectado: un polígono fino. */
function circuloOjo(centro, e1, e2, r) {
  const camino = new Path2D();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const p = px(suma(suma(centro, e1, r * Math.cos(a)), e2, r * Math.sin(a)));
    if (i === 0) camino.moveTo(p.x, p.y);
    else camino.lineTo(p.x, p.y);
  }
  return camino;
}

/**
 * Las fibras del iris: rayos del collarete al borde, en ángulos irregulares
 * para que un giro se note. En grados alrededor de la mirada, desde `e1`.
 */
const FIBRAS = [8, 31, 47, 70, 96, 118, 141, 160, 187, 205, 229, 252, 274, 301, 322, 344];
/** La cripta: una mancha oscura, la marca que más se ve rodar. */
const CRIPTA = { ang: 58, r: 0.72 };

/**
 * Los vasos de la esclera, en el ojo: cada uno una lista de [polar, azimut]
 * en grados. Polar desde la mirada (el limbo está a ~29°), azimut alrededor
 * de ella desde `e1`, la izquierda del ojo. Van hacia el limbo desde los
 * costados, como los ciliares, y se ramifican.
 */
const VASOS = [
  [[88, 4], [72, 2], [58, 8], [44, 6]],
  [[64, 3], [56, -10], [47, -18]],
  [[86, -24], [70, -30], [55, -26]],
  [[84, 28], [68, 36], [52, 44]],
  [[88, 184], [73, 178], [60, 170], [46, 175]],
  [[62, 176], [54, 190], [45, 198]],
  [[86, 152], [70, 146], [56, 150]],
  [[85, 212], [69, 206], [57, 214], [48, 208]],
];

/** Un punto de la esclera, en el mundo, dado en [polar, azimut] del ojo. */
function enEsclera(o, [polar, azimut]) {
  const { centro, g, e1, e2 } = o.mundo;
  const sp = Math.sin(rad(polar));
  const d = suma(suma(g.map((v) => v * Math.cos(rad(polar))), e1, sp * Math.cos(rad(azimut))), e2, sp * Math.sin(rad(azimut)));
  return { w: suma(centro, d, ESCLERA_MM), hacia: d[2] };
}

/** El ojo: esclera con vasos, iris con fibras y cripta, pupila; todo recortado por los párpados. */
function dibujaOjo(ctx, o) {
  const abertura = new Path2D();
  abertura.moveTo(o.menor.x, o.menor.y);
  abertura.quadraticCurveTo(o.arriba.x, o.arriba.y, o.mayor.x, o.mayor.y);
  abertura.quadraticCurveTo(o.abajo.x, o.abajo.y, o.menor.x, o.menor.y);
  abertura.closePath();
  ctx.fillStyle = COLOR.caraEsclera;
  ctx.fill(abertura);
  ctx.save();
  ctx.clip(abertura);

  // Los vasos, solo lo que mira hacia la cámara.
  ctx.strokeStyle = COLOR.caraVaso;
  VASOS.forEach((vaso, n) => {
    const pts = vaso.map((p) => enEsclera(o, p));
    for (let i = 1; i < pts.length; i++) {
      if (pts[i - 1].hacia < 0.05 || pts[i].hacia < 0.05) continue;
      const a = px(pts[i - 1].w);
      const b = px(pts[i].w);
      // Más gruesos lejos del limbo, y los primeros de cada lado más marcados.
      ctx.lineWidth = (n % 4 === 0 ? 2.4 : 1.6) * (1 - (0.5 * i) / pts.length);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  });

  const { iris, e1, e2 } = o.mundo;
  ctx.fillStyle = COLOR.caraIris;
  ctx.fill(circuloOjo(iris, e1, e2, IRIS_MM));
  ctx.strokeStyle = COLOR.caraIrisFibra;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (const ang of FIBRAS) {
    const dir = suma(e1.map((v) => v * Math.cos(rad(ang))), e2, Math.sin(rad(ang)));
    const a = px(suma(iris, dir, IRIS_MM * 0.5));
    const b = px(suma(iris, dir, IRIS_MM * 0.93));
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  const dirC = suma(e1.map((v) => v * Math.cos(rad(CRIPTA.ang))), e2, Math.sin(rad(CRIPTA.ang)));
  ctx.fillStyle = COLOR.caraIrisCripta;
  ctx.fill(circuloOjo(suma(iris, dirC, IRIS_MM * CRIPTA.r), e1, e2, IRIS_MM * 0.17));
  ctx.fillStyle = COLOR.caraPupila;
  ctx.fill(circuloOjo(iris, e1, e2, IRIS_MM * 0.4));
  ctx.restore();

  ctx.strokeStyle = COLOR.caraLinea;
  ctx.lineWidth = 3;
  ctx.stroke(abertura);
}

/**
 * Dibuja la cara en `lienzo` (se lo lleva a ANCHO × ALTO) y devuelve su
 * geometría. La cabeza es un elipsoide con orejas, cejas, nariz y boca, todo
 * pegado a la cabeza y girado con ella; los ojos, la parte que importa.
 *
 * @param pose la de `pose` o `poseLateral`
 */
export function dibujaCara(lienzo, pose, model) {
  if (lienzo.width !== ANCHO || lienzo.height !== ALTO) {
    lienzo.width = ANCHO;
    lienzo.height = ALTO;
  }
  const ctx = lienzo.getContext('2d');
  const { q } = pose;
  const geo = geometria(pose, model);
  // Un punto de la cabeza dado con y hacia ABAJO desde la línea de los ojos,
  // como se piensan los rasgos de una cara.
  const P = (lado, delante, abajo) => px(alMundo(q, [lado, -abajo, delante]));

  ctx.fillStyle = COLOR.video;
  ctx.fillRect(0, 0, ANCHO, ALTO);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = COLOR.caraLinea;
  ctx.lineWidth = 3;

  // Orejas: la que mira a la cámara va encima de la cabeza; la otra, antes,
  // y asoma por el costado que se aleja.
  ctx.fillStyle = COLOR.caraPiel;
  const oreja = (s) => elipsoide(ctx, q, [s * 76, -8, 5], [9, 22, 12]);
  const deFrente = (s) => quatRotate(q, [s, 0, 0])[2] > 0.35;
  for (const s of [-1, 1]) if (!deFrente(s)) oreja(s);

  // La cabeza: el centro va un poco por delante del eje de giro.
  elipsoide(ctx, q, [0, -22, 22], [76, 104, 95]);
  for (const s of [-1, 1]) if (deFrente(s)) oreja(s);

  // Cejas. Las curvas se proyectan por sus puntos de control: sin perspectiva
  // la proyección de una Bézier es la Bézier de los puntos proyectados.
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
  const bajoPunta = P(0, GLOBO_DELANTE_MM + 32, 34);
  const alaDer = P(-10, GLOBO_DELANTE_MM + 22, 35);
  const alaIzq = P(10, GLOBO_DELANTE_MM + 22, 35);
  ctx.beginPath();
  ctx.moveTo(puente.x, puente.y);
  ctx.lineTo(punta.x, punta.y);
  ctx.moveTo(alaDer.x, alaDer.y);
  ctx.quadraticCurveTo(bajoPunta.x, bajoPunta.y, alaIzq.x, alaIzq.y);
  ctx.stroke();

  // Boca.
  const bocaDer = P(-24, GLOBO_DELANTE_MM + 10, 62);
  const bocaMedio = P(0, GLOBO_DELANTE_MM + 18, 67);
  const bocaIzq = P(24, GLOBO_DELANTE_MM + 10, 62);
  ctx.beginPath();
  ctx.moveTo(bocaDer.x, bocaDer.y);
  ctx.quadraticCurveTo(bocaMedio.x, bocaMedio.y, bocaIzq.x, bocaIzq.y);
  ctx.stroke();

  dibujaOjo(ctx, geo.derecho);
  dibujaOjo(ctx, geo.izquierdo);
  return geo;
}
