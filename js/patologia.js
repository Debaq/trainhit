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

import { CANAL, CANALES, aMarcoCanales, qEjeAngulo, qInv, qMul, velocidadAngular } from './canales.js';
import { OTOLITOS } from './otolitos.js';

// ---------------------------------------------------------------- canales ---

/**
 * Lo que puede enfermar. Periférico: los seis canales y los cuatro otolitos
 * (otolitos.js); un otolito enfermo no cambia el VOR ni el nistagmo de los
 * canales, sino la torsión de los ojos y su vía en «Vía». Central: el flóculo
 * de cada lado (cerebelo), que con la fijación frena el nistagmo
 * (`frenoFijacion`).
 */
export const PERIFERICOS = [...CANALES.map((c) => c.id), ...OTOLITOS.map((o) => o.id)];
export const FLOCULOS = ['floculo_izq', 'floculo_der'];
export const ORGANOS = [...PERIFERICOS, ...FLOCULOS];

/** Los estados de un órgano y su función. */
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
    canales: { lat_izq: 'arreflexia', ant_izq: 'arreflexia', utr_izq: 'arreflexia' },
    compensado: false,
  },
  {
    id: 'neuritis_inferior',
    nombre: 'Neuritis vestibular inferior',
    unilateral: true,
    canales: { post_izq: 'arreflexia', sac_izq: 'arreflexia' },
    compensado: false,
  },
  {
    id: 'perdida_unilateral',
    nombre: 'Pérdida vestibular unilateral',
    unilateral: true,
    canales: {
      lat_izq: 'arreflexia',
      ant_izq: 'arreflexia',
      post_izq: 'arreflexia',
      utr_izq: 'arreflexia',
      sac_izq: 'arreflexia',
    },
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
    // La arteria cerebelosa anteroinferior riega el laberinto y el flóculo
    // del mismo lado: el nistagmo es periférico, pero la fijación lo frena
    // poco. Es un ictus que se parece a una neuritis.
    id: 'aica',
    nombre: 'Infarto de la AICA (laberinto y flóculo)',
    unilateral: true,
    canales: {
      lat_izq: 'arreflexia',
      ant_izq: 'arreflexia',
      post_izq: 'arreflexia',
      utr_izq: 'arreflexia',
      sac_izq: 'arreflexia',
      floculo_izq: 'arreflexia',
    },
    compensado: false,
  },
  {
    id: 'hipofuncion_bilateral',
    nombre: 'Hipofunción bilateral (ototoxicidad)',
    canales: Object.fromEntries(PERIFERICOS.map((id) => [id, 'hipofuncion'])),
    compensado: true,
  },
  {
    id: 'arreflexia_bilateral',
    nombre: 'Arreflexia bilateral',
    canales: Object.fromEntries(PERIFERICOS.map((id) => [id, 'arreflexia'])),
    compensado: true,
  },
];

export const CASO = Object.fromEntries(CASOS.map((c) => [c.id, c]));

/** Los mismos estados, del otro lado. */
export function espejo(canales) {
  const otro = (id) => (id.endsWith('_izq') ? id.replace(/_izq$/, '_der') : id.replace(/_der$/, '_izq'));
  return Object.fromEntries(Object.entries(canales).map(([id, e]) => [otro(id), e]));
}

/** De estados por órgano ({ lat_izq: 'arreflexia' }) a funciones de los diez. */
export function funciones(canales = {}) {
  return Object.fromEntries(ORGANOS.map((id) => [id, ESTADOS[canales[id] ?? 'normal']]));
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
/**
 * Cuánto queda del nistagmo periférico mirando un punto, con el cerebelo
 * sano: la fijación lo frena. El freno lo pone el flóculo.
 */
export const CON_FIJACION = 0.3;

/**
 * La fracción del nistagmo que queda al fijar la mirada: CON_FIJACION con los
 * dos flóculos sanos, más cuanto peor funcionan, y todo (1) sin ninguno. Es
 * el OFI (índice de fijación ocular: fase lenta fijando / sin fijar) que
 * saldría de ese nistagmo: bajo en lo periférico, alto si falla el cerebelo.
 */
export function frenoFijacion(f) {
  const floculo = FLOCULOS.reduce((s, id) => s + (f[id] ?? 1), 0) / FLOCULOS.length;
  return 1 - (1 - CON_FIJACION) * floculo;
}

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
  const k = fijacion ? frenoFijacion(f) : 1;
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

// -------------------------------------------------------------- Alexander ---
//
// Ley de Alexander: el nistagmo periférico bate más mirando hacia su fase
// rápida y menos mirando al revés. Acá, lineal con la posición del ojo: cada
// ALEXANDER_DEG grados hacia la fase rápida suman otro tanto de fase lenta, y
// al revés restan hasta apagarlo. El grado clínico sale solo: un nistagmo
// fuerte se ve mirando a los tres lados (III), uno más débil al frente y hacia
// la fase rápida (II), uno débil solo hacia la fase rápida (I).

/** Grados de mirada hacia la fase rápida que duplican la fase lenta. */
export const ALEXANDER_DEG = 30;
/** Mirada excéntrica con que se examina, en grados. */
export const MIRADA_EXCENTRICA = 20;
/** Fase lenta, °/s, a partir de la cual el nistagmo se ve. */
export const UMBRAL_VISIBLE = 3;

/** La orientación como vector de rotación, en grados. */
function vectorRot(q) {
  const s = Math.hypot(q[0], q[1], q[2]);
  if (s < 1e-12) return [0, 0, 0];
  const k = ((q[3] < 0 ? -1 : 1) * 2 * Math.atan2(s, Math.abs(q[3])) * 180) / Math.PI / s;
  return [q[0] * k, q[1] * k, q[2] * k];
}

/**
 * Por cuánto se multiplica la fase lenta `lenta` con el ojo en `q` (órbita):
 * 1 al frente, más mirando hacia la fase rápida (que gira el ojo contra
 * `lenta`), menos al revés, nunca menos de cero.
 */
export function factorAlexander(q, lenta) {
  const v = Math.hypot(...lenta);
  if (v < 1e-9) return 1;
  const r = vectorRot(q);
  const haciaRapida = -(r[0] * lenta[0] + r[1] * lenta[1] + r[2] * lenta[2]) / v;
  return Math.max(0, 1 + haciaRapida / ALEXANDER_DEG);
}

/** El grado de Alexander de un nistagmo de `v` °/s al frente: 0 si no se ve. */
export function gradoAlexander(v) {
  const mirando = (e) => v * Math.max(0, 1 + e / ALEXANDER_DEG);
  if (mirando(-MIRADA_EXCENTRICA) >= UMBRAL_VISIBLE) return 3;
  if (v >= UMBRAL_VISIBLE) return 2;
  if (mirando(MIRADA_EXCENTRICA) >= UMBRAL_VISIBLE) return 1;
  return 0;
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
/**
 * Con la cabeza quieta en una postura nueva, la persona vuelve a mirar al
 * frente: si pasa este tiempo y el blanco quedó a más de RECENTRA_DEG del
 * centro de la órbita, el blanco pasa a ser el frente de la cabeza y una
 * sacada lleva el ojo ahí. Sin esto, con el teléfono como cabeza —que nunca
 * queda justo como se lo centró— los ojos quedaban pegados arriba o a un
 * costado. Es más largo que la pausa de un impulso (canales.js, PAUSA_S), así
 * que no se mete con las sacadas correctivas.
 */
const RECENTRA_S = 1;
const RECENTRA_DEG = 8;
/** Cabeza en movimiento por encima de esto, quieta por debajo de lo otro. */
const V_MOVIENDO = 40;
const V_QUIETA = 15;

const anguloDe = (q) => (2 * Math.acos(Math.min(1, Math.abs(q[3]))) * 180) / Math.PI;

/** Un vector girado por el cuaternión `q`. */
function rota(q, [x, y, z]) {
  const r = qMul(qMul(q, [x, y, z, 0]), qInv(q));
  return [r[0], r[1], r[2]];
}

/** El giro más corto que lleva el vector unitario `a` al `b`. */
function entre(a, b) {
  const ex = a[1] * b[2] - a[2] * b[1];
  const ey = a[2] * b[0] - a[0] * b[2];
  const ez = a[0] * b[1] - a[1] * b[0];
  const s = Math.hypot(ex, ey, ez);
  const c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (s < 1e-12) return [0, 0, 0, 1];
  return qEjeAngulo([ex / s, ey / s, ez / s], (Math.atan2(s, c) * 180) / Math.PI);
}

/**
 * La orientación del ojo en la órbita para mirar hacia `d` (unitario, marco de
 * la cabeza): el giro más corto desde el frente (+z), con el eje en el plano
 * frontal, que es la ley de Listing. Más allá de la órbita, se queda en el
 * borde en esa dirección.
 */
export function mirarHacia(d) {
  const ex = -d[1];
  const ey = d[0];
  const s = Math.hypot(ex, ey);
  const grados = Math.min(LIMITE_ORBITA, (Math.acos(Math.max(-1, Math.min(1, d[2]))) * 180) / Math.PI);
  if (s < 1e-9) return [0, 0, 0, 1];
  return qEjeAngulo([ex / s, ey / s, 0], grados);
}
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
   *                  espontánea, tipo: clave de SACADAS, giro: la velocidad
   *                  EXACTA de la cabeza en este paso, si `omega` viene
   *                  suavizada, blanco: hacia dónde está lo que se mira,
   *                  unitario y en el mundo (ver abajo) }
   *
   * Sin `blanco`, el ojo mira donde miraba al empezar a moverse la cabeza y,
   * con la cabeza quieta un rato en otra postura, vuelve al frente. Con
   * `blanco`, lo busca siempre: el centro de la pantalla, y más adelante lo
   * que se le muestre (un dedo). Si queda fuera de la órbita, el ojo se queda
   * en el borde mirando hacia él.
   *
   * El VOR se integra con `giro` y el resto (si la cabeza se mueve o está
   * quieta) con `omega`. Tienen que ser distintas cuando la velocidad sale de
   * derivar y suavizar la orientación, como con el mouse o el teléfono: el
   * suavizado atrasa, y un VOR atrasado deja correr la mirada aunque la
   * ganancia sea 1, y salen sacadas en un sano.
   */
  paso(dt, qCabeza, omega, { f, lenta = [0, 0, 0], tipo = 'encubiertas', giro = omega, blanco = null }) {
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
    let destino;
    if (blanco) {
      // Hacia el blanco (o al borde de la órbita en su dirección). Sin
      // nistagmo, el giro más corto que lleva la mirada de ahora ahí, sin tocar
      // la torsión: el VOR de un giro sobre un eje inclinado deja algo, y
      // corregirla daría una sacada aunque la mirada esté justo en el blanco.
      // Con nistagmo, la orientación de Listing, torsión incluida: si no, la
      // fase lenta torsional correría sin fase rápida que la devuelva.
      const listing = mirarHacia(rota(qInv(qCabeza), blanco));
      destino =
        Math.hypot(...lenta) > 0.5
          ? listing
          : qMul(entre(rota(this.q, [0, 0, 1]), rota(listing, [0, 0, 1])), this.q);
      this.objetivo = qMul(qCabeza, destino);
    } else {
      destino = qMul(qInv(qCabeza), this.objetivo);
      const recentra = this.tQuieta > RECENTRA_S && anguloDe(destino) > RECENTRA_DEG;
      if (anguloDe(destino) > LIMITE_ORBITA || recentra) {
        this.objetivo = qCabeza;
        destino = [0, 0, 0, 1];
      }
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
    const vor = velocidadVOR(giro, f);
    const k = factorAlexander(this.q, lenta);
    const w = [vor[0] + k * lenta[0], vor[1] + k * lenta[1], vor[2] + k * lenta[2]];
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

// ----------------------------------------------------------- un cuadro ---

/** Paso máximo con que se avanza el ojo, en segundos físicos: sus sacadas duran 30 ms. */
export const PASO_OJO_S = 0.004;
/** Más rápido que esto, lo que cambió la cabeza en un cuadro es un salto, no un giro. */
export const GIRO_MAX_DPS = 1500;

/**
 * Avanza el ojo un cuadro de `dt` segundos físicos, en que la cabeza fue de
 * `qAntes` a `qDespues`. Dos cosas para que un sano tenga ganancia 1 y
 * ninguna sacada, con cualquier cadencia de cuadros y con la cabeza movida a
 * mano:
 *
 *   - el VOR sigue el giro EXACTO del cuadro, sacado de las dos
 *     orientaciones, y no `omega`, que con el mouse o el teléfono viene de
 *     derivar y suavizar y llega tarde;
 *   - en cada paso intermedio, la cabeza está donde está en ese momento del
 *     cuadro, no al final: si no, el ojo parece atrasado hasta un cuadro
 *     entero de giro y sale una sacada.
 *
 * Un salto (centrar, reconectar el teléfono) no es un giro: no mueve el VOR.
 */
export function avanzaCuadro(ojo, qAntes, qDespues, dt, omega, opciones) {
  let giro = velocidadAngular(qAntes, qDespues, dt);
  let v = Math.hypot(...giro);
  if (v > GIRO_MAX_DPS) {
    giro = [0, 0, 0];
    v = 0;
  }
  const pasos = Math.max(1, Math.ceil(dt / PASO_OJO_S));
  for (let i = 1; i <= pasos; i++) {
    const q = v > 0 ? qMul(qAntes, qEjeAngulo(giro, (v * dt * i) / pasos)) : qDespues;
    ojo.paso(dt / pasos, q, omega, { ...opciones, giro });
  }
}
