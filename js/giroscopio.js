// El teléfono como cabeza: del giroscopio al giro de la cabeza, y de ahí a
// los cuadros de una cámara que no existe.
//
// En el TELÉFONO, `SensorCabeza` integra el giroscopio (`devicemotion`) en el
// marco de la cabeza y da el yaw: el giro alrededor del eje vertical PROPIO
// de la cabeza, el del canal lateral (ver head.js). La cuenta del marco y el
// orden de los ejes viene de Labyrinthus 3D (js/canales.js y laberinto.js de
// allá), donde el teléfono ya hacía de cabeza: la pantalla es la cara del
// paciente y mira hacia quien lo sostiene, así que girar el teléfono hacia la
// derecha de quien examina es girar la cabeza a la izquierda del paciente,
// que es yaw positivo acá.
//
// En el PC, `Remuestreo` pasa los eventos del teléfono —a 50, 100 o 200 Hz
// según el aparato, y con los que se pierden en el camino— a cuadros parejos
// de 60 Hz, como los de una cámara. El motor, los umbrales y la marca de NO
// VALIDADO quedan igual que con la webcam. La hora es la del teléfono: lo que
// tarde la red no mueve las muestras.
//
// Sin DOM salvo `SensorCabeza`, que escucha los eventos de la ventana.

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

// -------------------------------------------------------- cuaterniones ---
// [x, y, z, w].

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

/** Velocidad angular, en °/s y en el marco del teléfono, que lleva de `q0` a `q1` en `dt` s. */
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

/** Mientras no se sabe el orden y no hay orientación: el del primer teléfono en que se probó. */
const ORDEN_SUPUESTO = 'xyz';

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
 * y gamma de `deviceorientation`. No depende de alpha, así que no le afecta
 * la traba de los ángulos con el teléfono parado.
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
 * Los ejes de la cabeza en el marco del teléfono, tomados al centrar: arriba
 * es la vertical del mundo, la nariz mira hacia quien sostiene el teléfono
 * (z de la pantalla, acostado sobre el horizonte) e x, a la izquierda del
 * paciente, completa. Así girar el teléfono de costado a costado es girar la
 * cabeza, se lo tenga parado, apaisado o inclinado. Devuelve las filas [x, y, z].
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

/** Sin eventos con giroscopio en este tiempo, el teléfono no tiene. */
const ESPERA_GIROSCOPIO_MS = 1500;

/**
 * El giroscopio del teléfono, integrado en el yaw de la cabeza. Se integra la
 * componente vertical de la velocidad EN EL MARCO DE LA CABEZA: el eje se
 * inclina con ella, como el del canal. `alGiro(tMs, yawDeg)` recibe cada
 * evento, con la hora del evento en ms.
 *
 * No se usan los ángulos de `deviceorientation` para el giro: se traban justo
 * con el teléfono parado frente a la cara (beta = 90°), que es como se lo
 * sostiene. Sirven para saber dónde está arriba y en qué orden vienen los
 * ejes del giroscopio.
 */
export class SensorCabeza {
  constructor(alGiro) {
    this.alGiro = alGiro;
    this.activo = false;
    this.recibio = false;
    this.yaw = 0;
    this.tPrevio = null;
    this.arriba = null;
    this.marco = null;
    this.orden = new DetectorOrden();
    this.qOri = null;
    this.tOri = 0;
    this.wOri = [0, 0, 0];
    this.alMoverse = (e) => this.mueve(e);
    this.alOrientar = (e) => this.orienta(e);
  }

  /**
   * Pide el permiso (iOS lo exige, dentro del toque) y empieza a escuchar.
   * Falla con un mensaje si no hay permiso o no hay giroscopio.
   */
  async prende() {
    // Los dos pedidos salen juntos, dentro del mismo toque: iOS los rechaza
    // si el segundo espera al primero y el gesto ya pasó.
    const pedidos = [window.DeviceMotionEvent, window.DeviceOrientationEvent]
      .filter((E) => typeof E?.requestPermission === 'function')
      .map((E) => E.requestPermission());
    const r = await Promise.all(pedidos).catch(() => ['denied']);
    if (r.some((x) => x !== 'granted')) throw new Error('sin permiso');
    this.activo = true;
    window.addEventListener('devicemotion', this.alMoverse);
    window.addEventListener('deviceorientation', this.alOrientar);
    await new Promise((ok) => setTimeout(ok, ESPERA_GIROSCOPIO_MS));
    if (!this.recibio) {
      this.apaga();
      throw new Error('sin giroscopio');
    }
  }

  apaga() {
    this.activo = false;
    window.removeEventListener('devicemotion', this.alMoverse);
    window.removeEventListener('deviceorientation', this.alOrientar);
  }

  /** La posición de ahora es el frente: yaw cero y el marco rehecho con la vertical de ahora. */
  centra() {
    this.yaw = 0;
    this.marco = this.arriba ? marcoDesdeArriba(this.arriba) : null;
  }

  orienta(e) {
    if (e.beta == null || e.gamma == null) return;
    this.arriba = arribaDesdeOrientacion(e.beta, e.gamma);
    this.marco ??= marcoDesdeArriba(this.arriba);
    // La velocidad que sale de derivar la orientación: ruidosa, pero con los
    // ejes bien puestos. Solo sirve de referencia para el detector.
    if (e.alpha == null) return;
    const q = qDesdeOrientacion(e.alpha, e.beta, e.gamma);
    const dt = (e.timeStamp - this.tOri) / 1000;
    if (this.qOri && dt > 0.005 && dt < 0.1) {
      const w = velocidadAngular(this.qOri, q, dt);
      this.wOri = this.wOri.map((v, i) => v + 0.5 * (w[i] - v));
    }
    this.qOri = q;
    this.tOri = e.timeStamp;
  }

  mueve(e) {
    const r = e.rotationRate;
    if (!r || (r.alpha == null && r.beta == null && r.gamma == null)) return;
    this.recibio = true;
    // El intervalo sale de las marcas de tiempo y no de `e.interval`, que
    // unos navegadores dan en milisegundos y otros en segundos.
    const t = e.timeStamp;
    const dt = this.tPrevio === null ? 0 : Math.min(0.1, (t - this.tPrevio) / 1000);
    this.tPrevio = t;
    const reciente = this.qOri && t - this.tOri < 80;
    const orden = reciente ? this.orden.muestra(r, this.wOri) : this.orden.elegido;
    const enTelefono = orden ? ORDENES_GIRO[orden](r) : reciente ? this.wOri : ORDENES_GIRO[ORDEN_SUPUESTO](r);
    const enCabeza = this.marco ? aMarco(this.marco, enTelefono) : enTelefono;
    if (dt > 0) this.yaw += enCabeza[1] * dt;
    this.alGiro(t, this.yaw);
  }
}

// ------------------------------------------------------------- mensajes ---

/**
 * Tipo del mensaje de la cabeza. Distinto del 1 de Labyrinthus 3D, que manda
 * la orientación entera: un teléfono de allá que llegara acá no se confunde.
 */
export const MENSAJE_GIRO = 2;

/** Empaqueta un evento: hora del teléfono en ms y yaw en grados. */
export function mensajeGiro(tMs, yawDeg) {
  return new Float64Array([MENSAJE_GIRO, tMs, yawDeg]).buffer;
}

/** Lee un evento; null si no es uno. */
export function leeGiro(datos) {
  if (!(datos instanceof ArrayBuffer) || datos.byteLength !== 24) return null;
  const [tipo, tMs, yaw] = new Float64Array(datos);
  if (tipo !== MENSAJE_GIRO || !Number.isFinite(tMs) || !Number.isFinite(yaw)) return null;
  return { tMs, yaw };
}

// ------------------------------------------------------------ remuestreo ---

/** La cadencia de la cámara que no existe. Es la del tope de la webcam (`FPS_MAX`). */
export const HZ_CAMARA = 60;

/**
 * Más de esto sin eventos es un corte —el teléfono se durmió, se cayó la
 * conexión—: no se interpola a través, se empieza de nuevo.
 */
export const CORTE_S = 0.25;

/**
 * Pasa eventos sueltos a cuadros parejos, interpolando el yaw entre los dos
 * eventos que rodean a cada cuadro. `empuja` devuelve los cuadros que ya se
 * pueden dar y si hubo un corte antes de ellos (quien lo usa tiene que tirar
 * lo que dependía de la continuidad: el derivador, el pulso en curso).
 *
 * Con el canal de datos sin orden, un evento que llega después de uno más
 * nuevo se tira. Uno MUY anterior (más de un segundo) no es un atrasado: es
 * el teléfono que recargó la página y su reloj volvió a cero.
 */
export class Remuestreo {
  constructor(hz = HZ_CAMARA) {
    this.dt = 1 / hz;
    this.reinicia();
  }

  reinicia() {
    this.previo = null;
    this.proximo = null;
  }

  /** @returns {{ cuadros: Array<{t:number, yaw:number}>, corte: boolean }} con `t` en s */
  empuja(tMs, yaw) {
    const t = tMs / 1000;
    const p = this.previo;
    if (p && t <= p.t && t > p.t - 1) return { cuadros: [], corte: false };
    if (!p || t < p.t || t - p.t > CORTE_S) {
      const corte = p !== null;
      this.previo = { t, yaw };
      this.proximo = t;
      return { cuadros: [{ t, yaw }], corte };
    }
    const cuadros = [];
    let tc = this.proximo + this.dt;
    for (; tc <= t + 1e-9; tc += this.dt) {
      const u = (tc - p.t) / (t - p.t);
      cuadros.push({ t: tc, yaw: p.yaw + u * (yaw - p.yaw) });
      this.proximo = tc;
    }
    this.previo = { t, yaw };
    return { cuadros, corte: false };
  }
}
