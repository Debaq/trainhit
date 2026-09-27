// El utrículo y el sáculo: lo que sienten de la gravedad y lo que hacen.
//
// Sin DOM ni three.js, como canales.js: laberinto.js y via.js lo usan cuadro
// a cuadro y los tests lo prueban en node. Mismo marco de la cabeza (+x
// izquierda, +y arriba, +z nariz).
//
// Los canales sienten el giro; los otolitos, la aceleración lineal y la
// inclinación respecto de la gravedad. En el Laberinto la cabeza no se
// traslada, así que acá sienten solo la inclinación. Es un modelo de libro,
// reducido a lo que se ve en la clínica:
//
//   utrículo   macula casi horizontal. Cada uno se excita con la inclinación
//              hacia SU oreja (oreja abajo) y los dos trabajan en empuje-
//              tracción, como un par de canales. Manda la contrarrotación
//              ocular: al bajar una oreja los ojos rotan unos grados hacia el
//              otro lado, con los músculos de los verticales de su lado (RS y
//              OS del mismo ojo, OI y RI del otro), que es la vía del oVEMP.
//              Perdido sin compensar, el otro gana y el cerebro lee una
//              inclinación que no existe: los ojos rotan hacia el lado
//              enfermo, que es la torsión de la reacción de inclinación ocular.
//   sáculo     macula vertical. Acá siente la inclinación adelante-atrás (la
//              de verdad también la aceleración vertical), igual los dos, y
//              va por el haz vestíbulo-espinal medial al esternocleidomastoideo
//              de su lado: es la vía del cVEMP.
//
// Por eso el vHIT y los VEMP se completan: la rama superior del nervio lleva
// el lateral, el anterior y el utrículo (oVEMP); la inferior, el posterior y
// el sáculo (cVEMP). Una neuritis superior deja el cVEMP normal.

import { TASA_REPOSO, qInv, qMul } from './canales.js';

/** Espigas por segundo que suma cada g en la dirección que excita (fibras regulares). */
export const SENSIBILIDAD_G = 60;

export const OTOLITOS = [
  { id: 'utr_izq', lado: 'izq', tipo: 'utriculo' },
  { id: 'utr_der', lado: 'der', tipo: 'utriculo' },
  { id: 'sac_izq', lado: 'izq', tipo: 'saculo' },
  { id: 'sac_der', lado: 'der', tipo: 'saculo' },
];

export const OTOLITO = Object.fromEntries(OTOLITOS.map((o) => [o.id, o]));

/** El compañero de empuje-tracción de cada utrículo; los sáculos no tienen. */
export const COMPANERO_OTOLITO = { utr_izq: 'utr_der', utr_der: 'utr_izq' };

/**
 * Hacia dónde está abajo, en el marco de la cabeza, con la cabeza orientada
 * `q` en el mundo (+y del mundo arriba). Derecha: [0, −1, 0].
 */
export function abajoEnCabeza(q) {
  const v = qMul(qMul(qInv(q), [0, -1, 0, 0]), q);
  return [v[0], v[1], v[2]];
}

/**
 * La tasa de cada otolito, en espigas/s, con abajo en `abajo` (marco de la
 * cabeza, unitario). `f` escala el nervio de uno enfermo, como en los canales.
 * Bajar la oreja izquierda pone abajo hacia +x: excita el utrículo izquierdo.
 * Bajar la nariz lo pone hacia +z: excita los dos sáculos.
 */
export function respuestasOtolitos(abajo, f = null) {
  const out = {};
  for (const o of OTOLITOS) {
    const g = o.tipo === 'utriculo' ? (o.lado === 'izq' ? abajo[0] : -abajo[0]) : abajo[2];
    const fo = f?.[o.id] ?? 1;
    out[o.id] = { g, f: fo, tasa: fo * Math.max(0, TASA_REPOSO + SENSIBILIDAD_G * g) };
  }
  return out;
}

/**
 * La tasa de los núcleos vestibulares que reciben a cada otolito: su nervio
 * más la comisura del compañero (solo los utrículos) y, si la lesión está
 * compensada, el reposo que le falta. Igual que en los canales (via.js).
 */
export function nucleosOtolitos(r, { compensado = true } = {}) {
  const out = {};
  for (const o of OTOLITOS) {
    const propio = r[o.id];
    const p = r[COMPANERO_OTOLITO[o.id]];
    const comisura = p ? p.f * TASA_REPOSO - p.tasa : 0;
    const devuelto = compensado ? (1 - propio.f) * TASA_REPOSO : 0;
    out[o.id] = Math.max(0, propio.tasa + comisura + devuelto);
  }
  return out;
}

/**
 * Torsión de los ojos, en grados, por cada g de diferencia entre los
 * utrículos: la contrarrotación ocular es de unos 5° a 30° de inclinación y
 * no pasa de 10°–15° con la oreja en el hombro.
 */
export const TORSION_POR_G = 15;

/**
 * La torsión que piden los utrículos (°, alrededor de +z de la cabeza:
 * positiva lleva el polo superior del ojo a la derecha del paciente). Sale de
 * la diferencia entre los núcleos de los dos lados: sano, es la
 * contrarrotación (oreja izquierda abajo → polos hacia la oreja derecha, que
 * quedó arriba); con un utrículo perdido sin compensar, una torsión quieta
 * hacia el lado enfermo.
 */
export function torsionOtolitica(nucleos) {
  // Sano, la diferencia es 4·SENSIBILIDAD_G por g: nervio y comisura, de los dos lados.
  const g = (nucleos.utr_izq - nucleos.utr_der) / (4 * SENSIBILIDAD_G);
  return TORSION_POR_G * g;
}
