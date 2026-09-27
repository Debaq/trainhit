// Los seis canales semicirculares: hacia dónde miran y cuánto disparan.
//
// Es la física de la sección Laberinto 3D, sin DOM ni three.js, para que los
// tests la prueben en node. laberinto.js la usa para pintar los canales y
// mover los ojos.
//
// Marco de la CABEZA, fijo a ella (el mismo del .glb exportado de Blender con
// «+Y arriba» y la cara hacia −Y de Blender):
//
//   +x  izquierda del paciente
//   +y  arriba
//   +z  adelante, hacia la nariz
//
// Es dextrógiro (x × y = z). Un giro positivo alrededor de un eje es el de la
// mano derecha: el pulgar en el eje y los dedos cierran en el sentido del
// giro. Así, +y es girar a la izquierda, +x es bajar la nariz y −z es bajar la
// oreja izquierda.
//
// El eje de cada canal es la normal a su plano con el signo que lo EXCITA:
// girar la cabeza alrededor de ese eje, con la mano derecha, sube la tasa de
// disparo del nervio de ese canal y baja la de su compañero coplanar.
//
// Es el modelo de libro, idealizado: tres canales ortogonales por lado, y el
// conjunto entero levantado 30° adelante. Con la cabeza flexionada 30° —la
// postura del vHIT lateral— los laterales quedan horizontales y los verticales
// verticales, a 45° del plano sagital. Con la cabeza derecha, en cambio, un
// giro horizontal también roza los verticales: es la razón de esa flexión.
// Los canales reales no son exactamente ortogonales ni simétricos (Blanks y
// cols., 1975; Della Santina y cols., 2005): con el modelo de la diseñadora,
// laberinto.js mide los planos de la malla misma con `normalDePlano`.

export const INCLINACION_LATERAL_DEG = 30;

const R2 = Math.SQRT1_2;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/**
 * De la cabeza flexionada 30° a la cabeza derecha: subir la nariz 30°, un giro
 * de −30° alrededor de +x. La normal del lateral, vertical con la cabeza
 * flexionada, queda inclinada hacia atrás.
 */
function levanta([x, y, z]) {
  const c = Math.cos(rad(INCLINACION_LATERAL_DEG));
  const s = Math.sin(rad(INCLINACION_LATERAL_DEG));
  return [x, y * c + z * s, -y * s + z * c];
}

/**
 * Un vector de la cabeza derecha en el marco de los canales (la cabeza
 * flexionada 30°): la inversa de `levanta`. Es el marco en que se lee el
 * ojo —horizontal, vertical, torsional—, porque los músculos del ojo trabajan
 * en los planos de los canales (Simpson y Graf, 1981): el horizontal del ojo
 * es el plano de los laterales, no el del piso.
 */
export function aMarcoCanales([x, y, z]) {
  const c = Math.cos(rad(INCLINACION_LATERAL_DEG));
  const s = Math.sin(rad(INCLINACION_LATERAL_DEG));
  return [x, y * c - z * s, y * s + z * c];
}

/**
 * Los seis canales. `par` es el plano que comparte con su compañero: cada par
 * trabaja en empuje-tracción, lo que excita a uno inhibe al otro. Los ejes se
 * escriben con la cabeza flexionada, donde son redondos, y se levantan.
 */
export const CANALES = [
  { id: 'lat_izq', lado: 'izq', tipo: 'lateral', par: 'lateral', eje: [0, 1, 0] },
  { id: 'ant_izq', lado: 'izq', tipo: 'anterior', par: 'larp', eje: [R2, 0, -R2] },
  { id: 'post_izq', lado: 'izq', tipo: 'posterior', par: 'ralp', eje: [-R2, 0, -R2] },
  { id: 'lat_der', lado: 'der', tipo: 'lateral', par: 'lateral', eje: [0, -1, 0] },
  { id: 'ant_der', lado: 'der', tipo: 'anterior', par: 'ralp', eje: [R2, 0, R2] },
  { id: 'post_der', lado: 'der', tipo: 'posterior', par: 'larp', eje: [-R2, 0, R2] },
].map((c) => ({ ...c, eje: levanta(c.eje) }));

export const CANAL = Object.fromEntries(CANALES.map((c) => [c.id, c]));

// Tasa de disparo del nervio ampular. En reposo ya dispara —unas 90 espigas
// por segundo—, y el giro la sube o la baja. Hacia arriba tiene mucho margen;
// hacia abajo no puede pasar de cero. Esa asimetría es la segunda ley de
// Ewald, y es la razón por la que en el vHIT un giro rápido hacia el lado sano
// todavía lo compensa bien el lado sano solo, y hacia el lado enfermo no.
export const TASA_REPOSO = 90;
/** Espigas por segundo que suma cada °/s en el eje del canal (fibras regulares). */
export const SENSIBILIDAD = 0.5;
export const TASA_MAX = 400;

const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Espigas por segundo de un canal con `w` °/s alrededor de su eje. */
export function tasa(w) {
  return Math.min(TASA_MAX, Math.max(0, TASA_REPOSO + SENSIBILIDAD * w));
}

/**
 * La respuesta de los seis canales a una velocidad angular de la cabeza, en
 * °/s y en el marco de la cabeza. `ejes` permite cambiar los del modelo de
 * libro por los medidos en la malla. `funciones` (0 a 1 por canal, ver
 * patologia.js) escala el nervio de un canal enfermo: dispara menos en reposo
 * y responde menos al giro; muerto, calla.
 */
export function respuestas(omega, ejes = null, funciones = null) {
  const out = {};
  for (const c of CANALES) {
    const w = punto(omega, ejes?.[c.id] ?? c.eje);
    const f = funciones?.[c.id] ?? 1;
    out[c.id] = { w, f, tasa: f * tasa(w) };
  }
  return out;
}

/**
 * Cuánto se aparta la tasa del reposo, de −1 (callado) a +1. La excitación se
 * normaliza con el doble del reposo para que siga subiendo después de que la
 * inhibición ya tocó fondo: se ve la ley de Ewald en los colores.
 */
export function activacion(t) {
  return t >= TASA_REPOSO
    ? Math.min(1, (t - TASA_REPOSO) / (2 * TASA_REPOSO))
    : -Math.min(1, (TASA_REPOSO - t) / TASA_REPOSO);
}

// ---------------------------------------------------------- movimientos ---

/**
 * Los giros que se pueden pedir en «Respuesta», con su eje en el marco de la
 * cabeza. Los horizontales y los diagonales van en el plano de un par de
 * canales, como en el vHIT: los horizontales con la cabeza flexionada 30°,
 * los diagonales con la cabeza girada 45°. Nariz y oreja son los ejes de la
 * cabeza derecha, así que excitan más de un par.
 */
export const MOVIMIENTOS = [
  { id: 'izq', nombre: 'Giro a la izquierda', eje: CANAL.lat_izq.eje },
  { id: 'der', nombre: 'Giro a la derecha', eje: CANAL.lat_der.eje },
  { id: 'abajo', nombre: 'Nariz abajo', eje: [1, 0, 0] },
  { id: 'arriba', nombre: 'Nariz arriba', eje: [-1, 0, 0] },
  { id: 'oreja_izq', nombre: 'Oreja izquierda abajo', eje: [0, 0, -1] },
  { id: 'oreja_der', nombre: 'Oreja derecha abajo', eje: [0, 0, 1] },
  { id: 'larp_abajo', nombre: 'LARP, nariz abajo', eje: CANAL.ant_izq.eje },
  { id: 'larp_arriba', nombre: 'LARP, nariz arriba', eje: CANAL.post_der.eje },
  { id: 'ralp_abajo', nombre: 'RALP, nariz abajo', eje: CANAL.ant_der.eje },
  { id: 'ralp_arriba', nombre: 'RALP, nariz arriba', eje: CANAL.post_izq.eje },
];

const suave = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const dSuave = (u) => (u <= 0 || u >= 1 ? 0 : 6 * u * (1 - u));

/**
 * Pausa en la posición final antes de volver, en segundos. Larga como en el
 * examen, donde la cabeza queda quieta después del impulso: es cuando salen
 * las sacadas abiertas, y las tardías llegan a los 300–400 ms.
 */
export const PAUSA_S = 0.6;
/** La vuelta es este tanto más lenta que la ida, como en el examen. */
const VUELTA_LENTA = 3;

/**
 * Un impulso: ida rápida de `amplitud` grados con pico `vPico` °/s, una pausa
 * y la vuelta lenta. Con la curva suave (smoothstep) el pico es 1,5 veces la
 * velocidad media, así que la ida dura 1,5·A/vPico. Devuelve el ángulo y la
 * velocidad en el instante `t` (s, tiempo físico), y si ya terminó.
 */
export function perfilImpulso(t, amplitud, vPico) {
  const ida = (1.5 * amplitud) / vPico;
  const vuelta = VUELTA_LENTA * ida;
  if (t < ida) return { angulo: amplitud * suave(t / ida), velocidad: (amplitud / ida) * dSuave(t / ida), fin: false };
  if (t < ida + PAUSA_S) return { angulo: amplitud, velocidad: 0, fin: false };
  const u = (t - ida - PAUSA_S) / vuelta;
  return { angulo: amplitud * (1 - suave(u)), velocidad: -(amplitud / vuelta) * dSuave(u), fin: u >= 1 };
}

// -------------------------------------------------------- cuaterniones ---
// [x, y, z, w], como three.js, para no depender de él acá.

export function qMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

export const qInv = (q) => [-q[0], -q[1], -q[2], q[3]];

export function qEjeAngulo(eje, grados) {
  const n = Math.hypot(...eje);
  const s = Math.sin(rad(grados) / 2) / n;
  return [eje[0] * s, eje[1] * s, eje[2] * s, Math.cos(rad(grados) / 2)];
}

/**
 * Velocidad angular, en °/s y en el marco de la cabeza, que lleva de `q0` a
 * `q1` en `dt` segundos. Las dos son la orientación de la cabeza en el mundo.
 */
export function velocidadAngular(q0, q1, dt) {
  let d = qMul(qInv(q0), q1);
  if (d[3] < 0) d = d.map((v) => -v); // el camino corto
  const s = Math.hypot(d[0], d[1], d[2]);
  if (s < 1e-12 || dt <= 0) return [0, 0, 0];
  const ang = deg(2 * Math.atan2(s, d[3]));
  return [(d[0] / s) * (ang / dt), (d[1] / s) * (ang / dt), (d[2] / s) * (ang / dt)];
}

// ------------------------------------------------------------ giroscopio ---

/**
 * Los dos órdenes en que los navegadores entregan `devicemotion.rotationRate`
 * (°/s), pasados a [x, y, z] del teléfono: x hacia el borde derecho, y hacia
 * arriba de la pantalla, z saliendo de la pantalla. La especificación dice
 * alpha alrededor de z, beta de x y gamma de y; hay navegadores que dan
 * alpha, beta y gamma alrededor de x, y y z. Cuál es cuál no se adivina: lo
 * decide `DetectorOrden` comparando con la orientación.
 */
export const ORDENES_GIRO = {
  especificacion: (r) => [r.beta ?? 0, r.gamma ?? 0, r.alpha ?? 0],
  xyz: (r) => [r.alpha ?? 0, r.beta ?? 0, r.gamma ?? 0],
};

/**
 * Elige el orden de `rotationRate` comparándolo con la velocidad que sale de
 * derivar la orientación (`deviceorientation`), que es igual en todos los
 * navegadores. Solo cuentan los instantes con giro franco; con veinte que
 * favorezcan claramente a uno, queda elegido.
 */
export class DetectorOrden {
  constructor() {
    this.error = { especificacion: 0, xyz: 0 };
    this.n = 0;
    this.elegido = null;
  }

  muestra(rotationRate, wReferencia) {
    if (this.elegido) return this.elegido;
    const m2 = wReferencia[0] ** 2 + wReferencia[1] ** 2 + wReferencia[2] ** 2;
    if (m2 < 30 * 30) return null;
    for (const [k, f] of Object.entries(ORDENES_GIRO)) {
      const w = f(rotationRate);
      this.error[k] += ((w[0] - wReferencia[0]) ** 2 + (w[1] - wReferencia[1]) ** 2 + (w[2] - wReferencia[2]) ** 2) / m2;
    }
    this.n++;
    const { especificacion: e, xyz: x } = this.error;
    if (this.n >= 20 && (e < 0.5 * x || x < 0.5 * e || this.n >= 200)) this.elegido = e <= x ? 'especificacion' : 'xyz';
    return this.elegido;
  }
}

/**
 * La vertical del mundo («arriba») en el marco del teléfono, a partir de beta
 * y gamma de `deviceorientation`. Con la orientación Z-X'-Y'' de la
 * especificación es la tercera fila de la matriz: no depende de alpha, así
 * que no le afecta la traba de los ángulos con el teléfono parado.
 */
export function arribaDesdeOrientacion(beta, gamma) {
  const b = rad(beta);
  const g = rad(gamma);
  return [-Math.sin(g) * Math.cos(b), Math.sin(b), Math.cos(g) * Math.cos(b)];
}

/** La orientación del teléfono como cuaternión, desde los ángulos Z-X'-Y''. */
export function qDesdeOrientacion(alpha, beta, gamma) {
  return qMul(qMul(qEjeAngulo([0, 0, 1], alpha), qEjeAngulo([1, 0, 0], beta)), qEjeAngulo([0, 1, 0], gamma));
}

/**
 * Los ejes de la cabeza en el marco del teléfono, tomados cuando se lo
 * centra: arriba es la vertical del mundo, la nariz mira hacia quien sostiene
 * el teléfono (z de la pantalla, acostado sobre el horizonte) e x, a la
 * izquierda del paciente, completa. Así girar el teléfono de costado a
 * costado es girar la cabeza, se lo tenga parado, apaisado o inclinado.
 * Devuelve las tres filas [x, y, z].
 */
export function marcoDesdeArriba(arriba) {
  const n = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return v.map((c) => c / l);
  };
  const y = n(arriba);
  const plano = (v) => {
    const d = v[0] * y[0] + v[1] * y[1] + v[2] * y[2];
    return [v[0] - d * y[0], v[1] - d * y[1], v[2] - d * y[2]];
  };
  // Con el teléfono acostado la pantalla mira arriba y no sirve de nariz: se
  // usa el borde de abajo, el que queda hacia quien lo mira.
  let z = plano([0, 0, 1]);
  if (Math.hypot(...z) < 0.3) z = plano([0, -1, 0]);
  z = n(z);
  const x = [y[1] * z[2] - y[2] * z[1], y[2] * z[0] - y[0] * z[2], y[0] * z[1] - y[1] * z[0]];
  return [x, y, z];
}

/** Un vector del teléfono en el marco de la cabeza. */
export function aMarco(filas, v) {
  return filas.map((e) => e[0] * v[0] + e[1] * v[1] + e[2] * v[2]);
}

/**
 * Suma a la orientación `q` un giro de `omega` °/s —en el marco del propio
 * objeto— durante `dt` segundos. Integrar el giroscopio así no tiene los
 * saltos de los ángulos de Euler con el teléfono parado; a la larga deriva un
 * poco, y «Centrar» la vuelve a cero.
 */
export function integraGiro(q, omega, dt) {
  const w = Math.hypot(omega[0], omega[1], omega[2]);
  if (w < 1e-9 || dt <= 0) return q;
  const d = qMul(q, qEjeAngulo(omega, w * dt));
  const n = Math.hypot(d[0], d[1], d[2], d[3]);
  return d.map((v) => v / n);
}

// ---------------------------------------------------- plano de una malla ---

/**
 * La normal del plano que mejor ajusta una nube de puntos [[x, y, z], …]: el
 * autovector de menor autovalor de su covarianza. Con eso se saca el eje de un
 * canal directo de la malla, sin creerle a quien la hizo. El signo queda
 * indefinido: lo elige quien llama.
 */
export function normalDePlano(puntos) {
  const n = puntos.length;
  const m = [0, 0, 0];
  for (const p of puntos) for (let i = 0; i < 3; i++) m[i] += p[i] / n;
  const c = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const p of puntos) {
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c[i][j] += (p[i] - m[i]) * (p[j] - m[j]);
  }
  const { valores, vectores } = jacobi(c);
  const k = valores.indexOf(Math.min(...valores));
  return [vectores[0][k], vectores[1][k], vectores[2][k]];
}

/** Autovalores y autovectores (en columnas) de una simétrica 3×3, por Jacobi. */
function jacobi(a) {
  a = a.map((f) => f.slice());
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let barrida = 0; barrida < 50; barrida++) {
    let p = 0;
    let q = 1;
    for (const [i, j] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      if (Math.abs(a[i][j]) > Math.abs(a[p][q])) [p, q] = [i, j];
    }
    if (Math.abs(a[p][q]) < 1e-18) break;
    const th = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
    const co = Math.cos(th);
    const si = Math.sin(th);
    for (let k = 0; k < 3; k++) {
      const akp = a[k][p];
      const akq = a[k][q];
      a[k][p] = co * akp - si * akq;
      a[k][q] = si * akp + co * akq;
    }
    for (let k = 0; k < 3; k++) {
      const apk = a[p][k];
      const aqk = a[q][k];
      a[p][k] = co * apk - si * aqk;
      a[q][k] = si * apk + co * aqk;
    }
    for (let k = 0; k < 3; k++) {
      const vkp = v[k][p];
      const vkq = v[k][q];
      v[k][p] = co * vkp - si * vkq;
      v[k][q] = si * vkp + co * vkq;
    }
  }
  return { valores: [a[0][0], a[1][1], a[2][2]], vectores: v };
}
