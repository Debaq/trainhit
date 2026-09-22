// Rotación de cabeza a partir del transform 4x4 cara->cámara de MediaPipe.
// Port didáctico de `rust/src/head.rs`.
//
// Por qué NO se extrae el yaw de Euler y listo:
//
// El canal semicircular está fijo en la CABEZA, no en el mundo. Lo que lo
// estimula es la rotación alrededor del eje perpendicular al plano del canal,
// un eje que se inclina junto con la cabeza. Y en un vHIT la cabeza SIEMPRE
// está inclinada (~30° de flexión para poner los canales laterales en el plano
// del giro). Medido con la cabeza a 30° de pitch, un giro de 10° alrededor del
// eje propio de la cabeza da:
//
//   yaw de Euler .................... 11.5°   (+15 %)
//   proyección en el eje del mundo ... 8.7°   (-13 %)
//   proyección en el eje de la cabeza 10.0°   correcto
//
// Las dos alternativas obvias erran, y erran en sentidos opuestos.
//
// Aparte se acumula la rotación INCREMENTAL: los incrementos son chicos, así
// que no hay límite de ±180 que cruzar ni ángulo que desenrollar.

const deg = (r) => (r * 180) / Math.PI;

/** Eje de estimulación de cada canal, EN COORDENADAS DE LA CABEZA. */
export const CANAL_AXIS = {
  // Canal lateral: rotación alrededor del eje vertical de la cabeza.
  lateral: [0, 1, 0],
  // Los verticales van a 45° entre el vertical y el horizontal. El lado de
  // CABEZA es la misma cuenta; el lado de OJO necesita la componente vertical
  // del movimiento ocular, que este motor no usa (más ruidosa por el párpado).
  ralp: [Math.SQRT1_2, Math.SQRT1_2, 0],
  larp: [-Math.SQRT1_2, Math.SQRT1_2, 0],
};

/**
 * Cuaternión de rotación de un 4x4 COLUMN-MAJOR, sacándole la escala.
 * @param {ArrayLike<number>} m 16 números, m[col*4 + fila]
 */
export function quatFromMatrix(m) {
  // Columnas 0..2 son los ejes; se normalizan para quitar cualquier escala.
  const col = (c) => {
    const v = [m[c * 4], m[c * 4 + 1], m[c * 4 + 2]];
    const n = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / n, v[1] / n, v[2] / n];
  };
  const [xx, xy, xz] = col(0);
  const [yx, yy, yz] = col(1);
  const [zx, zy, zz] = col(2);

  // Shepperd: se elige la rama con el denominador más grande para no dividir
  // por algo cercano a cero.
  const trace = xx + yy + zz;
  let q;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = [(yz - zy) / s, (zx - xz) / s, (xy - yx) / s, 0.25 * s];
  } else if (xx > yy && xx > zz) {
    const s = Math.sqrt(1 + xx - yy - zz) * 2;
    q = [0.25 * s, (yx + xy) / s, (zx + xz) / s, (yz - zy) / s];
  } else if (yy > zz) {
    const s = Math.sqrt(1 + yy - xx - zz) * 2;
    q = [(yx + xy) / s, 0.25 * s, (zy + yz) / s, (zx - xz) / s];
  } else {
    const s = Math.sqrt(1 + zz - xx - yy) * 2;
    q = [(zx + xz) / s, (zy + yz) / s, 0.25 * s, (xy - yx) / s];
  }
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

export function quatMul(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

/** Inversa de un cuaternión unitario: el conjugado. */
export function quatInverse(q) {
  return [-q[0], -q[1], -q[2], q[3]];
}

/** Rota un vector por un cuaternión. */
export function quatRotate(q, v) {
  const [x, y, z, w] = q;
  const t = [
    2 * (y * v[2] - z * v[1]),
    2 * (z * v[0] - x * v[2]),
    2 * (x * v[1] - y * v[0]),
  ];
  return [
    v[0] + w * t[0] + (y * t[2] - z * t[1]),
    v[1] + w * t[1] + (z * t[0] - x * t[2]),
    v[2] + w * t[2] + (x * t[1] - y * t[0]),
  ];
}

/** Acumula la rotación de cabeza proyectada sobre el eje de un canal. */
export class HeadTracker {
  constructor(canal = 'lateral') {
    this.canal = canal;
    this.previous = null;
    this.accumulatedDeg = 0;
  }

  /** Se llama al perder la cara: el incremento contra una orientación de hace
   * segundos no es un incremento. */
  reset() {
    this.previous = null;
  }

  /** Incorpora una orientación y devuelve el ángulo acumulado, en grados. */
  push(rotation) {
    if (this.previous) {
      // El eje del canal viaja con la cabeza: se lo lleva a coordenadas de
      // cámara con la orientación ACTUAL antes de proyectar.
      const axis = quatRotate(rotation, CANAL_AXIS[this.canal]);
      const n = Math.hypot(axis[0], axis[1], axis[2]);
      if (n > 1e-9) {
        this.accumulatedDeg += deltaDeg(this.previous, rotation, [
          axis[0] / n,
          axis[1] / n,
          axis[2] / n,
        ]);
      }
    }
    this.previous = rotation;
    return this.accumulatedDeg;
  }
}

/** Incremento de rotación entre dos orientaciones, proyectado sobre `axis`. */
export function deltaDeg(previous, current, axis) {
  let d = quatMul(current, quatInverse(previous));
  // q y -q son la misma rotación: se elige la de ángulo chico para no tomar el
  // giro largo.
  if (d[3] < 0) d = d.map((c) => -c);
  const sin = Math.hypot(d[0], d[1], d[2]);
  const angle = 2 * Math.atan2(sin, d[3]);
  if (!Number.isFinite(angle) || Math.abs(angle) < 1e-7) return 0;
  const ax = sin > 1e-9 ? [d[0] / sin, d[1] / sin, d[2] / sin] : [0, 0, 0];
  // Se proyecta el VECTOR de rotación (eje * ángulo) sobre el eje del canal.
  return deg((ax[0] * axis[0] + ax[1] * axis[1] + ax[2] * axis[2]) * angle);
}
