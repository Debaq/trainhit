// Patologías del Laberinto 3D: canales que no funcionan y lo que hace el ojo.
//
// Sin DOM ni three.js: laberinto.js lo usa cuadro a cuadro y los tests lo
// prueban en node. El marco es el de la cabeza de canales.js (+x izquierda,
// +y arriba, +z nariz), en grados y °/s.
//
// Cada canal tiene una FUNCIÓN entre 0 y 1 —normal, hipofunción, arreflexia—
// y de ahí sale todo, sin guiones por patología:
//
//   la tasa    el nervio de un canal enfermo dispara menos en reposo y responde
//              menos al giro (canales.js, `respuestas`).
//   el VOR     en cada par coplanar manda el canal que se excita, y más cuanto
//              más rápido es el giro (segunda ley de Ewald): con un canal
//              muerto, el giro hacia su lado casi no tiene reflejo y el giro
//              hacia el otro lado sí. Una lesión de cualquier canal da el
//              déficit en su plano, vertical incluido.
//   el nistagmo espontáneo
//              si la lesión no está compensada, el reposo desparejo entre los
//              dos lados se lee como un giro que no existe: el ojo deriva hacia
//              el lado enfermo (fase lenta) y una sacada lo devuelve (fase
//              rápida, hacia el lado sano). Sale en 3D: una neuritis superior
//              da un nistagmo horizontal-torsional. La fijación visual lo frena,
//              como en la clínica sin lentes de Frenzel.
//   las sacadas correctivas
//              salen del error de mirada al terminar de mover: encubiertas si
//              el paciente ya aprendió a corregir durante el giro, abiertas si
//              espera a que la cabeza se frene.
//
// Es un modelo para enseñar, no una simulación fisiológica: las constantes
// están elegidas para que se vea lo que se ve en la clínica, con los órdenes
// de magnitud de la literatura.

import { CANAL, CANALES, aMarcoCanales, qEjeAngulo, qInv, qMul } from './canales.js';

// ---------------------------------------------------------------- canales ---

/** Los estados de un canal y su función. */
export const ESTADOS = {
  normal: 1,
  hipofuncion: 0.5,
  arreflexia: 0,
};

/**
 * Casos armados. Los de un solo lado (`unilateral`) se escriben del izquierdo
 * y sin el lado en el nombre: `espejo` los pasa al derecho y la interfaz le
 * agrega «izquierda» o «derecha». `compensado` es cómo se lo ve en la
 * consulta típica: la neuritis aguda llega sin compensar, la pérdida vieja ya
 * compensada.
 */
export const CASOS = [
  { id: 'sano', nombre: 'Sano', canales: {}, compensado: true },
  {
    id: 'neuritis_superior',
    nombre: 'Neuritis vestibular superior',
    unilateral: true,
    canales: { lat_izq: 'arreflexia', ant_izq: 'arreflexia' },
    compensado: false,
  },
  {
    id: 'neuritis_inferior',
    nombre: 'Neuritis vestibular inferior',
    unilateral: true,
    canales: { post_izq: 'arreflexia' },
    compensado: false,
  },
  {
    id: 'perdida_unilateral',
    nombre: 'Pérdida vestibular unilateral',
    unilateral: true,
    canales: { lat_izq: 'arreflexia', ant_izq: 'arreflexia', post_izq: 'arreflexia' },
    compensado: true,
  },
  {
    id: 'hipofuncion_lateral',
    nombre: 'Hipofunción del canal lateral',
    unilateral: true,
    canales: { lat_izq: 'hipofuncion' },
    compensado: true,
  },
  {
    id: 'hipofuncion_bilateral',
    nombre: 'Hipofunción bilateral (ototoxicidad)',
    canales: Object.fromEntries(CANALES.map((c) => [c.id, 'hipofuncion'])),
    compensado: true,
  },
  {
    id: 'arreflexia_bilateral',
    nombre: 'Arreflexia bilateral',
    canales: Object.fromEntries(CANALES.map((c) => [c.id, 'arreflexia'])),
    compensado: true,
  },
];

export const CASO = Object.fromEntries(CASOS.map((c) => [c.id, c]));

/** Los mismos estados, del otro lado. */
export function espejo(canales) {
  const otro = (id) => (id.endsWith('_izq') ? id.replace(/_izq$/, '_der') : id.replace(/_der$/, '_izq'));
  return Object.fromEntries(Object.entries(canales).map(([id, e]) => [otro(id), e]));
}

/** De estados por canal ({ lat_izq: 'arreflexia' }) a funciones de los seis. */
export function funciones(canales = {}) {
  return Object.fromEntries(CANALES.map((c) => [c.id, ESTADOS[canales[c.id] ?? 'normal']]));
}

// ------------------------------------------------------------------- VOR ---

/** Los pares coplanares, con el canal cuyo eje se toma como el del par. */
export const PARES = [
  ['lat_izq', 'lat_der'],
  ['ant_izq', 'post_der'],
  ['ant_der', 'post_izq'],
];

/**
 * Cuánto manda el canal excitado sobre el inhibido: la mitad en un giro
 * lento, cada vez más con la velocidad, hasta PESO_MAX a VEL_EWALD °/s. Con un
 * canal muerto, el giro rápido hacia su lado queda con ganancia 1 − PESO_MAX,
 * que es lo que se mide en un vHIT de una neuritis (0,2–0,4).
 */
const PESO_MAX = 0.8;
const VEL_EWALD = 150;

/**
 * La ganancia de un par para un giro de `w` °/s alrededor de su eje (positivo:
 * excita al primero del par).
 */
export function gananciaPar(w, fExcitado, fInhibido) {
  const p = 0.5 + (PESO_MAX - 0.5) * Math.min(1, Math.abs(w) / VEL_EWALD);
  return p * fExcitado + (1 - p) * fInhibido;
}

/**
 * La velocidad del ojo en la órbita que pide el VOR para un giro de cabeza
 * `omega` (°/s, marco de la cabeza). Sano es −omega: la mirada no se mueve.
 */
export function velocidadVOR(omega, f) {
  const out = [0, 0, 0];
  for (const [a, b] of PARES) {
    const n = CANAL[a].eje;
    const w = omega[0] * n[0] + omega[1] * n[1] + omega[2] * n[2];
    const g = w >= 0 ? gananciaPar(w, f[a], f[b]) : gananciaPar(w, f[b], f[a]);
    for (let i = 0; i < 3; i++) out[i] -= g * w * n[i];
  }
  return out;
}

// ------------------------------------------------------ nistagmo espontáneo ---

/**
 * Fase lenta, en °/s, de un canal que perdió todo su reposo, sin fijación. Una
 * neuritis aguda se ve con 5–15 °/s en lentes de Frenzel.
 */
export const VEL_NISTAGMO = 10;
/** Cuánto queda del nistagmo periférico mirando un punto: la fijación lo frena. */
export const CON_FIJACION = 0.3;

/**
 * La fase lenta del nistagmo espontáneo, como velocidad del ojo en la órbita
 * (°/s, marco de la cabeza). El reposo que le falta a cada canal se lee como
 * un giro hacia el otro lado, y el VOR mueve el ojo contra ese giro: hacia el
 * lado enfermo. Con la lesión compensada o simétrica, cero.
 */
export function faseLentaEspontanea(f, { compensado = false, fijacion = false } = {}) {
  if (compensado) return [0, 0, 0];
  const out = [0, 0, 0];
  for (const c of CANALES) {
    const falta = 1 - f[c.id];
    for (let i = 0; i < 3; i++) out[i] += falta * VEL_NISTAGMO * c.eje[i];
  }
  const k = fijacion ? CON_FIJACION : 1;
  return out.map((v) => (Math.abs(v * k) < 1e-9 ? 0 : v * k));
}

/**
 * Cómo se nombra ese nistagmo: hacia dónde bate (la fase rápida, contra la
 * lenta) en cada componente que pesa, del que más al que menos. Los
 * componentes se leen en el marco de los canales (`aMarcoCanales`), como los
 * lee el ojo. Devuelve null si no hay.
 */
export function describeNistagmo(lenta) {
  const v = Math.hypot(...lenta);
  if (v < 0.5) return null;
  const rapida = aMarcoCanales(lenta).map((x) => -x);
  const componentes = [
    // Horizontal: giro alrededor de +y es hacia la izquierda.
    [Math.abs(rapida[1]), rapida[1] > 0 ? 'izquierda' : 'derecha'],
    // Vertical: giro alrededor de +x baja la mirada.
    [Math.abs(rapida[0]), rapida[0] > 0 ? 'abajo' : 'arriba'],
    // Torsional: giro alrededor de +z lleva el polo superior del ojo hacia
    // la derecha del paciente.
    [Math.abs(rapida[2]), rapida[2] > 0 ? 'torsional_derecha' : 'torsional_izquierda'],
  ];
  const partes = componentes
    .filter(([m]) => m > 0.25 * v)
    .sort((a, b) => b[0] - a[0])
    .map(([, p]) => p);
  return { velocidad: v, partes };
}

// -------------------------------------------------------------------- ojo ---

/** Tipos de sacada correctiva, con su espera (s) desde que la cabeza se frena. */
export const SACADAS = {
  encubiertas: { durante: true, espera: 0.05 },
  abiertas: { durante: false, espera: 0.12 },
  tardias: { durante: false, espera: 0.35 },
  mixtas: { durante: true, espera: 0.12 },
};

/** Hasta dónde gira el ojo en la órbita antes de una fase rápida. */
const LIMITE_ORBITA = 40;
/** Error de mirada que dispara una sacada, en grados. */
const UMBRAL_SACADA = 1.5;
/**
 * Con nistagmo espontáneo y la cabeza quieta, el ojo deriva más antes de
 * volver: es la amplitud del diente de sierra. Con 10 °/s de fase lenta da
 * unas tres batidas por segundo, como en la clínica.
 */
const UMBRAL_NISTAGMO = 3;
/** Una encubierta sale como pronto a este tiempo del comienzo del giro. */
const LATENCIA_ENCUBIERTA = 0.07;
/** Tiempo mínimo entre dos sacadas. */
const REFRACTARIO = 0.1;
/** Cabeza en movimiento por encima de esto, quieta por debajo de lo otro. */
const V_MOVIENDO = 40;
const V_QUIETA = 15;

const anguloDe = (q) => (2 * Math.acos(Math.min(1, Math.abs(q[3]))) * 180) / Math.PI;
const suave = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

function qSlerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb = d < 0 ? b.map((v) => -v) : b;
  d = Math.abs(d);
  if (d > 0.9995) {
    const q = a.map((v, i) => v + (bb[i] - v) * t);
    const n = Math.hypot(...q);
    return q.map((v) => v / n);
  }
  const th = Math.acos(d);
  const s = Math.sin(th);
  return a.map((v, i) => (Math.sin((1 - t) * th) * v + Math.sin(t * th) * bb[i]) / s);
}

/**
 * Un ojo con su VOR, su nistagmo y sus sacadas. `q` es su orientación en la
 * órbita (marco de la cabeza); `objetivo`, hacia dónde quiere mirar en el
 * mundo. Cada `paso` lo avanza `dt` segundos de tiempo FÍSICO: en cámara lenta
 * quien llama lo achica, y el ojo sigue al impulso real.
 */
export class Ojo {
  constructor() {
    this.centra();
  }

  centra() {
    this.q = [0, 0, 0, 1];
    this.objetivo = [0, 0, 0, 1];
    this.sacada = null;
    this.moviendo = false;
    this.tMov = 0;
    this.tQuieta = 1;
    this.tSacada = 1;
    /** Cuántas sacadas hubo, para contar en los tests y en la interfaz. */
    this.sacadas = 0;
  }

  /**
   * @param dt        segundos físicos
   * @param qCabeza   orientación de la cabeza en el mundo
   * @param omega     velocidad de la cabeza, °/s, en su marco
   * @param opciones  { f: funciones de los canales, lenta: fase lenta
   *                  espontánea, tipo: clave de SACADAS }
   */
  paso(dt, qCabeza, omega, { f, lenta = [0, 0, 0], tipo = 'encubiertas' }) {
    const v = Math.hypot(...omega);
    if (v > V_MOVIENDO) {
      if (!this.moviendo) this.tMov = 0;
      this.moviendo = true;
      this.tMov += dt;
      this.tQuieta = 0;
    } else if (v < V_QUIETA) {
      this.moviendo = false;
      this.tQuieta += dt;
    }
    this.tSacada += dt;

    // Dónde tendría que estar el ojo para mirar el objetivo. Si eso pide
    // salirse de la órbita, el objetivo pasa a ser el frente de la cabeza: es
    // la fase rápida de un giro largo.
    let destino = qMul(qInv(qCabeza), this.objetivo);
    if (anguloDe(destino) > LIMITE_ORBITA) {
      this.objetivo = qCabeza;
      destino = [0, 0, 0, 1];
    }

    if (this.sacada) {
      const s = this.sacada;
      s.t += dt;
      const u = Math.min(1, s.t / s.duracion);
      this.q = qSlerp(s.desde, destino, suave(u));
      if (u >= 1) this.sacada = null;
      return;
    }

    // Fase lenta: VOR más el nistagmo espontáneo, en la órbita.
    const vor = velocidadVOR(omega, f);
    const w = [vor[0] + lenta[0], vor[1] + lenta[1], vor[2] + lenta[2]];
    const m = Math.hypot(...w);
    if (m > 1e-9) this.q = qMul(qEjeAngulo(w, m * dt), this.q);

    // ¿Sacada?
    const error = anguloDe(qMul(qInv(this.q), destino));
    const umbral = !this.moviendo && m > 1e-9 && Math.hypot(...lenta) > 0.5 ? UMBRAL_NISTAGMO : UMBRAL_SACADA;
    if (error < umbral || this.tSacada < REFRACTARIO) return;
    const t = SACADAS[tipo] ?? SACADAS.encubiertas;
    const corresponde = this.moviendo ? t.durante && this.tMov > LATENCIA_ENCUBIERTA : this.tQuieta > t.espera;
    if (corresponde) this.lanzaSacada(error);
  }

  /** Una sacada: rápida y corta, más larga cuanto más lejos (secuencia principal). */
  lanzaSacada(amplitud) {
    this.sacada = { desde: this.q, t: 0, duracion: 0.02 + amplitud / 600 };
    this.tSacada = 0;
    this.sacadas++;
  }
}
