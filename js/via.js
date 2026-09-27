// La vía del reflejo vestíbulo-ocular: del canal al músculo del ojo, animada.
//
// Es la vista «Vía» del Laberinto 3D. Dibuja en un canvas 2D el arco de tres
// neuronas de cada canal —el nervio vestibular, los núcleos vestibulares y el
// núcleo motor del ojo— con puntos que corren por cada tramo al ritmo al que
// dispara esa neurona. Se ve con los impulsos armados o con el teléfono
// enlazado, y con la patología puesta: el nervio de un canal muerto calla y
// lleva una cruz.
//
// Anatomía, de libro (Leigh y Zee; Cohen y cols.): cada canal excita a los dos
// músculos que mueven el ojo en su plano, uno de cada ojo, por una vía que
// cruza la línea media en los núcleos vestibulares.
//
//   lateral    núcleo vestibular medial → VI del otro lado → recto lateral de
//              ese lado; y por las interneuronas del VI, que vuelven a cruzar
//              y suben por el fascículo longitudinal medial (FLM), → III del
//              mismo lado → recto medial del mismo lado.
//   anterior   núcleo vestibular superior → FLM del otro lado → III de ese
//              lado: el subnúcleo del recto superior, cuyas fibras cruzan, al
//              recto superior del mismo lado; el del oblicuo inferior, al
//              oblicuo inferior del otro lado.
//   posterior  núcleo vestibular medial → FLM del otro lado → IV de ese lado,
//              cuyo nervio cruza, al oblicuo superior del mismo lado; y III de
//              ese lado, al recto inferior del otro lado.
//
// Los otolitos (otolitos.js) van por el mismo nervio:
//
//   utrículo   núcleos vestibulares → FLM del otro lado → III y IV de ese
//              lado → los músculos de los dos verticales de su lado: RS y OS
//              del mismo ojo (intorsión), OI y RI del otro (extorsión). Es la
//              contrarrotación ocular y la vía del oVEMP (el OI del otro lado).
//   sáculo     núcleos vestibulares → haz vestíbulo-espinal medial, del mismo
//              lado → núcleo del XI → esternocleidomastoideo (ECM): la vía del
//              cVEMP, que en el ECM es una inhibición.
//
// El anterior, el lateral y el utrículo van por la rama superior del nervio;
// el posterior y el sáculo, por la inferior: por eso la neuritis superior deja
// el posterior y el cVEMP, y la inferior deja el oVEMP.
// Las proyecciones inhibidoras (al mismo lado) no se dibujan, para que se lea
// el camino; su efecto está en las tasas, que trabajan en empuje-tracción.
//
// Las tasas salen de tres lugares:
//   aferente   la del nervio, de canales.js: exacta.
//   núcleo     la neurona vestibular de segundo orden: su nervio más la
//              comisura, que le suma lo que el nervio del compañero coplanar
//              deja de disparar y le resta lo que dispara de más. Una lesión
//              compensada le devuelve el reposo que le falta: el nervio sigue
//              callado pero el núcleo vuelve a disparar, que es la
//              compensación central.
//   motor      la motoneurona del ojo: su reposo más un término por la
//              posición del ojo en la órbita y otro por su velocidad, la real,
//              sacadas incluidas (Robinson, 1970). Lo que se ve en el músculo
//              es lo que hace el ojo en pantalla.
//
// Es para enseñar: las constantes dan los órdenes de magnitud, no más.

import { CANAL, CANALES, TASA_MAX, TASA_REPOSO, activacion, qInv, qMul } from './canales.js';
import { OTOLITO, OTOLITOS, nucleosOtolitos } from './otolitos.js';
import { PARES } from './patologia.js';
import { tx } from './idioma.js';

const otro = (lado) => (lado === 'izq' ? 'der' : 'izq');

/**
 * Cada canal y los dos músculos que excita: `mismo` es del ojo de su lado,
 * `otro` del ojo del otro lado. `motor` es el núcleo motor, siempre del otro
 * lado (la vía cruza en los núcleos vestibulares).
 */
export const VIA = {
  lateral: { nervio: 'superior', motor: 'VI', mismo: 'rm', otro: 'rl' },
  anterior: { nervio: 'superior', motor: 'III', mismo: 'rs', otro: 'oi' },
  posterior: { nervio: 'inferior', motor: 'IV', mismo: 'os', otro: 'ri' },
  utriculo: { nervio: 'superior' },
  saculo: { nervio: 'inferior' },
};

/** Un canal o un otolito, por su id. */
const organo = (id) => CANAL[id] ?? OTOLITO[id];

/** Los órganos de la vía: los seis canales y los cuatro otolitos. */
export const ORGANOS_VIA = [...CANALES, ...OTOLITOS].map((o) => o.id);

/**
 * Los canales cuyos músculos mueve cada órgano: un canal, los suyos; un
 * utrículo, los de los dos verticales de su lado; un sáculo, ninguno (va al
 * cuello).
 */
export const MOTORES_DE = {
  ...Object.fromEntries(CANALES.map((c) => [c.id, [c.id]])),
  utr_izq: ['ant_izq', 'post_izq'],
  utr_der: ['ant_der', 'post_der'],
  sac_izq: [],
  sac_der: [],
};

/** Los músculos que excita un órgano, con el lado de cada uno. */
export function musculosDe(id) {
  const o = organo(id);
  if (o.tipo === 'saculo') return [{ musculo: 'ecm', lado: o.lado }];
  return MOTORES_DE[id].flatMap((cid) => {
    const c = CANAL[cid];
    const v = VIA[c.tipo];
    return [
      { musculo: v.mismo, lado: c.lado },
      { musculo: v.otro, lado: otro(c.lado) },
    ];
  });
}

/** Cuánto suma a la motoneurona cada grado del ojo en la órbita y cada °/s. */
const K_POSICION = 2;
const K_VELOCIDAD = 1;

const acota = (t) => Math.min(TASA_MAX, Math.max(0, t));
const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** El compañero coplanar de cada canal. */
const COMPANERO = Object.fromEntries(PARES.flatMap(([a, b]) => [[a, b], [b, a]]));

/**
 * La velocidad angular del ojo en la órbita, en °/s y en el marco de la
 * cabeza, entre dos orientaciones separadas `dt` segundos. El ojo gira
 * multiplicando por izquierda (patologia.js), así que el giro es q1·q0⁻¹.
 */
export function velocidadOrbita(q0, q1, dt) {
  let d = qMul(q1, qInv(q0));
  if (d[3] < 0) d = d.map((v) => -v);
  const s = Math.hypot(d[0], d[1], d[2]);
  if (s < 1e-12 || dt <= 0) return [0, 0, 0];
  const k = (2 * Math.atan2(s, d[3]) * 180) / Math.PI / s / dt;
  return [d[0] * k, d[1] * k, d[2] * k];
}

/** La orientación del ojo como vector de rotación, en grados. */
export function vectorRotacion(q) {
  const s = Math.hypot(q[0], q[1], q[2]);
  if (s < 1e-12) return [0, 0, 0];
  const signo = q[3] < 0 ? -1 : 1;
  const k = (signo * 2 * Math.atan2(s, Math.abs(q[3])) * 180) / Math.PI / s;
  return [q[0] * k, q[1] * k, q[2] * k];
}

/**
 * Las tasas de la vía de cada órgano, en espigas/s. Los otolitos no tienen
 * motoneurona propia: sus músculos son los de los verticales, y el del sáculo
 * (el ECM) va con la tasa de su núcleo.
 *
 * @param r           respuestas de los canales (canales.js, `respuestas`) y de
 *                    los otolitos (otolitos.js, `respuestasOtolitos`), juntas
 * @param posOjo      posición del ojo en la órbita, vector de rotación en °
 * @param velOjo      velocidad del ojo en la órbita, °/s
 * @param compensado  si la lesión está compensada en los núcleos
 * @returns {{ aferente, nucleo, motor }}, cada uno por id de canal
 */
export function actividad(r, posOjo, velOjo, { compensado = true } = {}) {
  const aferente = {};
  const nucleo = {};
  const motor = {};
  for (const c of CANALES) {
    const p = r[COMPANERO[c.id]];
    const propio = r[c.id];
    aferente[c.id] = propio.tasa;
    // La comisura: lo que el compañero se aparta de SU reposo, al revés.
    const comisura = p.f * TASA_REPOSO - p.tasa;
    const devuelto = compensado ? (1 - propio.f) * TASA_REPOSO : 0;
    nucleo[c.id] = acota(propio.tasa + comisura + devuelto);
    // Los músculos del canal mueven el ojo contra su eje: el VOR de un giro
    // que lo excita.
    const n = c.eje;
    motor[c.id] = acota(TASA_REPOSO - K_POSICION * punto(posOjo, n) - K_VELOCIDAD * punto(velOjo, n));
  }
  if (r[OTOLITOS[0].id]) {
    const n = nucleosOtolitos(r, { compensado });
    for (const o of OTOLITOS) {
      aferente[o.id] = r[o.id].tasa;
      nucleo[o.id] = acota(n[o.id]);
      if (o.tipo === 'saculo') motor[o.id] = nucleo[o.id];
    }
  }
  return { aferente, nucleo, motor };
}

// ---------------------------------------------------------------- dibujo ---
//
// El esquema se dibuja de frente, cara a cara, como la cámara del Laberinto:
// el lado derecho del paciente queda a la izquierda de la pantalla. En un
// espacio de ANCHO × ALTO unidades que se agranda al lienzo; `u` es la
// distancia a la línea media y `y` crece hacia abajo, de los ojos (arriba) a
// los canales (abajo).

const ANCHO = 100;
const ALTO = 112;
const Y0 = -7;

/** Un punto del esquema: `u` unidades afuera de la línea media, del lado dado. */
const P = (lado, u, y) => [ANCHO / 2 + (lado === 'izq' ? u : -u), y];

const OJO = { u: 27, y: 13, r: 7.5 };
/** Dónde va cada músculo, respecto del centro de su ojo (u hacia afuera). */
const MUSCULO = {
  rm: [-10.5, 0],
  rl: [10.5, 0],
  rs: [0, -10.5],
  ri: [0, 10.5],
  os: [-8, -8],
  oi: [-8, 8],
};
/** El esternocleidomastoideo, al costado de los núcleos: el cuello. */
const ECM = { u: 46, y: 79 };
const posMusculo = (m, lado) =>
  m === 'ecm' ? P(lado, ECM.u, ECM.y) : P(lado, OJO.u + MUSCULO[m][0], OJO.y + MUSCULO[m][1]);

const NUCLEOS = {
  III: { u: 6, y: 36, w: 8, h: 6 },
  IV: { u: 6, y: 47, w: 7, h: 5 },
  VI: { u: 13, y: 62, w: 8, h: 6 },
  NV: { u: 25, y: 75, w: 22, h: 8 },
};
/** Por dónde entra y sale cada órgano de los núcleos vestibulares. */
const U_NV = { utriculo: 16, anterior: 20, lateral: 25, posterior: 30, saculo: 34 };
/** Dónde va cada órgano abajo: los de la rama superior adentro, los de la inferior afuera. */
const U_ORGANO = { utriculo: 9, anterior: 17, lateral: 25, posterior: 33, saculo: 41 };
const Y_CANAL = 98;
const NERVIO = { superior: { u: 18, y: 88 }, inferior: { u: 37, y: 88 } };

/**
 * Los tramos de la vía de un órgano, cada uno una poligonal con la tasa que
 * lleva: `aferente`, `nucleo` o `motor`.
 */
export function tramos(id) {
  const c = organo(id);
  const X = c.lado;
  const Y = otro(X);
  const v = VIA[c.tipo];
  const nv = U_NV[c.tipo];
  const nervio = NERVIO[v.nervio];
  const out = [
    {
      tasa: 'aferente',
      puntos: [P(X, U_ORGANO[c.tipo], Y_CANAL - 3), P(X, nervio.u, nervio.y), P(X, nv, 79)],
    },
  ];
  const t = (tasa, ...puntos) => out.push({ tasa, puntos });
  const salida = P(X, nv, 71);
  if (c.tipo === 'lateral') {
    t('nucleo', salida, P(Y, 16, 63));
    // Nervio VI al recto lateral, por afuera.
    t('motor', P(Y, 16, 61), P(Y, 44, 48), P(Y, 44, OJO.y), posMusculo('rl', Y));
    // Interneurona del VI: cruza y sube por el FLM al III, y del III al recto medial.
    t('motor', P(Y, 10, 60), P(X, 2.5, 56), P(X, 2.5, 39), P(X, 4, 37));
    t('motor', P(X, 7, 33), posMusculo('rm', X));
  } else if (c.tipo === 'anterior') {
    t('nucleo', salida, P(Y, 4.5, 65), P(Y, 4.5, 40), P(Y, 5, 38));
    // El subnúcleo del recto superior cruza dentro del III.
    t('motor', P(Y, 5, 33), P(X, 5, 30), P(X, 11, 2.5), posMusculo('rs', X));
    t('motor', P(Y, 9, 35), posMusculo('oi', Y));
  } else if (c.tipo === 'utriculo') {
    // Al IV y al III del otro lado, entre las fibras de los verticales: de
    // ahí salen por los motores de ellos.
    t('nucleo', salida, P(Y, 6, 67), P(Y, 6, 50));
    t('nucleo', P(Y, 6, 44.5), P(Y, 6, 39));
  } else if (c.tipo === 'saculo') {
    // Baja por el haz vestíbulo-espinal medial al XI y al ECM, del mismo lado.
    t('nucleo', P(X, 35, 77), P(X, ECM.u - 2.6, ECM.y));
  } else {
    t('nucleo', salida, P(Y, 7.5, 66), P(Y, 7.5, 50));
    t('nucleo', P(Y, 7.5, 44.5), P(Y, 7.5, 39));
    // El nervio IV sale por detrás y cruza.
    t('motor', P(Y, 9, 46), P(X, 12, 43), P(X, 14, 16), posMusculo('os', X));
    t('motor', P(Y, 9, 38), posMusculo('ri', Y));
  }
  for (const s of out) s.largo = largo(s.puntos);
  return out;
}

function largo(puntos) {
  let l = 0;
  for (let i = 1; i < puntos.length; i++) l += Math.hypot(puntos[i][0] - puntos[i - 1][0], puntos[i][1] - puntos[i - 1][1]);
  return l;
}

/** El punto a `s` unidades del comienzo de una poligonal. */
function enTramo(puntos, s) {
  for (let i = 1; i < puntos.length; i++) {
    const [ax, ay] = puntos[i - 1];
    const [bx, by] = puntos[i];
    const l = Math.hypot(bx - ax, by - ay);
    if (s <= l) return [ax + ((bx - ax) * s) / l, ay + ((by - ay) * s) / l];
    s -= l;
  }
  return puntos[puntos.length - 1];
}

/** Cuántas espigas vale cada punto que corre, y a qué velocidad corre (unidades/s). */
export const ESPIGAS_POR_PUNTO = 10;
const VEL_PUNTO = 36;

/** Qué órganos muestra cada filtro del panel. */
export const FILTROS = {
  lateral: ['lat_izq', 'lat_der'],
  larp: ['ant_izq', 'post_der'],
  ralp: ['ant_der', 'post_izq'],
  otolitos: OTOLITOS.map((o) => o.id),
  todos: ORGANOS_VIA,
};

const COLOR_PAR = { lateral: '#4db6e8', larp: '#d18800', ralp: '#9b51d0' };
/** Los otolitos no tienen par coplanar: van de un color propio. */
const COLOR_OTOLITO = '#c9a26b';
const ROJO = [224, 48, 42];
const AZUL = [46, 125, 214];
const GRIS = [107, 107, 115];
const COLOR_LESION = '#a8c83a';

const mezcla = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const rgb = (c, alfa = 1) => `rgba(${c[0]},${c[1]},${c[2]},${alfa})`;

/** El color de un tramo o un músculo según su tasa: rojo sobre el reposo, azul debajo. */
function colorTasa(t) {
  const a = activacion(t);
  return mezcla(GRIS, a >= 0 ? ROJO : AZUL, Math.sqrt(Math.abs(a)));
}

/**
 * El dibujo animado. Guarda los puntos que corren por cada tramo; `dibuja`
 * los avanza `dt` segundos de pantalla —no de física: en cámara lenta los
 * puntos siguen a la vista— y pinta todo.
 */
export class DibujoVia {
  constructor() {
    this.tramos = Object.fromEntries(
      ORGANOS_VIA.map((id) => [id, tramos(id).map((s) => ({ ...s, espigas: [], fase: Math.random() }))]),
    );
  }

  /**
   * @param ctx       contexto 2D del lienzo
   * @param w, h      tamaño del lienzo en píxeles del aparato
   * @param dt        segundos de pantalla desde el cuadro anterior
   * @param o         { act: `actividad`, f: función de cada órgano, filtro,
   *                  ciego, ojo: [horizontal, vertical, torsional] en °,
   *                  escala: píxeles del aparato por píxel CSS }
   */
  dibuja(ctx, w, h, dt, { act, f, filtro = 'lateral', ciego = false, ojo = [0, 0, 0], escala = 1 }) {
    const k = Math.min(w / ANCHO, h / ALTO);
    const ox = (w - ANCHO * k) / 2;
    const oy = (h - ALTO * k) / 2 - Y0 * k;
    const X = ([x, y]) => [ox + x * k, oy + y * k];
    const visibles = new Set(FILTROS[filtro] ?? FILTROS.lateral);
    // Los músculos, y sus fibras motoras, de los canales que mueven los
    // órganos visibles: un utrículo prende los de los verticales de su lado.
    const motores = new Set([...visibles].flatMap((id) => MOTORES_DE[id]));
    const letra = (tam, peso = 500) => `${peso} ${Math.max(9 * escala, tam * k)}px system-ui, sans-serif`;
    const grosor = Math.max(1.5 * escala, 0.42 * k);

    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Línea media y lados.
    ctx.strokeStyle = 'rgba(250,250,250,0.12)';
    ctx.lineWidth = 1 * escala;
    ctx.setLineDash([4 * escala, 5 * escala]);
    ctx.beginPath();
    ctx.moveTo(...X([ANCHO / 2, Y0 + 5]));
    ctx.lineTo(...X([ANCHO / 2, Y_CANAL + 6]));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#a1a1aa';
    ctx.font = letra(3, 600);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tx('DERECHA'), ...X(P('der', OJO.u, Y0 + 2)));
    ctx.fillText(tx('IZQUIERDA'), ...X(P('izq', OJO.u, Y0 + 2)));

    // Tramos, con sus puntos.
    const rPunto = Math.max(1.7 * escala, 0.55 * k);
    for (const id of ORGANOS_VIA) {
      for (const s of this.tramos[id]) {
        if (!(s.tasa === 'motor' ? motores.has(id) : visibles.has(id))) continue;
        const tasa = ciego ? TASA_REPOSO : act[s.tasa][id];
        const color = ciego ? GRIS : colorTasa(tasa);
        const callado = !ciego && tasa < 3;
        ctx.strokeStyle = rgb(callado ? [63, 63, 70] : color);
        ctx.lineWidth = grosor;
        ctx.setLineDash(callado ? [2 * escala, 4 * escala] : []);
        ctx.beginPath();
        s.puntos.forEach((p, i) => (i ? ctx.lineTo(...X(p)) : ctx.moveTo(...X(p))));
        ctx.stroke();
        ctx.setLineDash([]);
        this.avanza(s, ciego ? 0 : tasa, dt);
        ctx.fillStyle = rgb(mezcla(color, [255, 255, 255], 0.55));
        for (const e of s.espigas) {
          const [px, py] = X(enTramo(s.puntos, e));
          ctx.beginPath();
          ctx.arc(px, py, rPunto, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    }

    // Núcleos, encima de los tramos: las fibras llegan a ellos. El fondo deja
    // ver lo que pasa por detrás sin hacer sinapsis. El FLM va rotulado en la
    // línea media, arriba de donde termina.
    for (const lado of ['izq', 'der']) {
      for (const [nombre, n] of Object.entries(NUCLEOS)) {
        const [cx, cy] = X(P(lado, n.u, n.y));
        const bw = n.w * k;
        const bh = n.h * k;
        ctx.fillStyle = 'rgba(24,24,27,0.82)';
        ctx.strokeStyle = '#52525b';
        ctx.lineWidth = 1 * escala;
        ctx.beginPath();
        ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, 1.2 * k);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#a1a1aa';
        ctx.font = letra(2.6, 600);
        if (nombre === 'NV') {
          ctx.font = letra(2.3, 600);
          ctx.fillText(tx('núcleos'), cx, cy - 1.5 * k);
          ctx.fillText(tx('vestibulares'), cx, cy + 1.5 * k);
        } else ctx.fillText(nombre, cx, cy);
      }
      ctx.fillStyle = '#71717a';
      ctx.font = letra(2.2);
      for (const [nombre, n] of Object.entries(NERVIO)) {
        ctx.fillText(nombre === 'superior' ? tx('n. sup.') : tx('n. inf.'), ...X(P(lado, n.u + (nombre === 'superior' ? -5.5 : 5.5), n.y)));
      }
    }
    ctx.fillStyle = '#71717a';
    ctx.font = letra(2.2, 600);
    ctx.fillText(tx('FLM'), ...X([ANCHO / 2, 30]));

    // Canales (anillos) y otolitos (máculas), con la lesión en su nervio.
    const ROTULO = {
      lateral: tx('lat.'),
      anterior: tx('ant.'),
      posterior: tx('post.'),
      utriculo: tx('utr.'),
      saculo: tx('sác.'),
    };
    for (const id of ORGANOS_VIA) {
      const c = organo(id);
      const vis = visibles.has(id);
      const [cx, cy] = X(P(c.lado, U_ORGANO[c.tipo], Y_CANAL));
      const color = COLOR_PAR[c.par] ?? COLOR_OTOLITO;
      ctx.globalAlpha = vis ? 1 : 0.3;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2 * escala, 0.7 * k);
      ctx.beginPath();
      if (c.par) ctx.arc(cx, cy, 2.6 * k, 0, 2 * Math.PI);
      else ctx.roundRect(cx - 2.8 * k, cy - 1.8 * k, 5.6 * k, 3.6 * k, 1.2 * k);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = letra(2.4, 600);
      ctx.fillText(ROTULO[c.tipo], cx, cy + 5.2 * k);
      if (vis && !ciego && f[id] < 1) {
        // A dos tercios del órgano al nervio.
        const nervio = NERVIO[VIA[c.tipo].nervio];
        const a = P(c.lado, U_ORGANO[c.tipo], Y_CANAL - 3);
        const b = P(c.lado, nervio.u, nervio.y);
        const [mx, my] = X([a[0] + (b[0] - a[0]) * 0.6, a[1] + (b[1] - a[1]) * 0.6]);
        ctx.strokeStyle = COLOR_LESION;
        ctx.lineWidth = Math.max(2.5 * escala, 0.8 * k);
        const d = 1.8 * k;
        ctx.beginPath();
        if (f[id] === 0) {
          ctx.moveTo(mx - d, my - d);
          ctx.lineTo(mx + d, my + d);
          ctx.moveTo(mx + d, my - d);
          ctx.lineTo(mx - d, my + d);
        } else {
          ctx.moveTo(mx - d, my + d);
          ctx.lineTo(mx + d, my - d);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Ojos: el iris se corre con la posición del ojo en la órbita, y una marca
    // muestra la torsión.
    const [hor, ver, tor] = ojo;
    for (const lado of ['izq', 'der']) {
      const [cx, cy] = X(P(lado, OJO.u, OJO.y));
      const r = OJO.r * k;
      ctx.fillStyle = '#e4e4e7';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.fill();
      // Cara a cara, la derecha del paciente es la izquierda de la pantalla.
      const lim = (g) => Math.max(-30, Math.min(30, g)) / 30;
      const ix = cx - lim(hor) * 0.55 * r;
      const iy = cy - lim(ver) * 0.55 * r;
      ctx.fillStyle = '#4b7aa6';
      ctx.beginPath();
      ctx.arc(ix, iy, 0.45 * r, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = '#09090b';
      ctx.beginPath();
      ctx.arc(ix, iy, 0.2 * r, 0, 2 * Math.PI);
      ctx.fill();
      // El polo superior hacia la derecha del paciente va a la izquierda.
      const a = (tor * Math.PI) / 180;
      ctx.strokeStyle = '#fafafa';
      ctx.lineWidth = Math.max(1.5 * escala, 0.35 * k);
      ctx.beginPath();
      ctx.moveTo(ix - Math.sin(a) * 0.22 * r, iy - Math.cos(a) * 0.22 * r);
      ctx.lineTo(ix - Math.sin(a) * 0.45 * r, iy - Math.cos(a) * 0.45 * r);
      ctx.stroke();
    }

    // Músculos, del color de su motoneurona: los de los ojos van con el canal
    // que los mueve, el ECM con su sáculo.
    const NOMBRE = { rm: tx('RM'), rl: tx('RL'), rs: tx('RS'), ri: tx('RI'), os: tx('OS'), oi: tx('OI'), ecm: tx('ECM') };
    const conMusculo = [...CANALES.map((c) => c.id), ...OTOLITOS.filter((o) => o.tipo === 'saculo').map((o) => o.id)];
    for (const id of conMusculo) {
      const vis = CANAL[id] ? motores.has(id) : visibles.has(id);
      const color = ciego || !vis ? GRIS : colorTasa(act.motor[id]);
      for (const { musculo, lado } of musculosDe(id)) {
        const [mx, my] = X(posMusculo(musculo, lado));
        ctx.globalAlpha = vis ? 1 : 0.35;
        ctx.fillStyle = rgb(color);
        ctx.beginPath();
        ctx.arc(mx, my, 2.6 * k, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#fafafa';
        ctx.font = letra(2.2, 700);
        ctx.fillText(NOMBRE[musculo], mx, my + 0.1 * k);
        ctx.globalAlpha = 1;
      }
    }
  }

  /**
   * Los puntos de un tramo: nacen al ritmo de la tasa —uno cada
   * ESPIGAS_POR_PUNTO espigas, parejos— y corren a velocidad fija.
   */
  avanza(s, tasa, dt) {
    const paso = VEL_PUNTO * dt;
    s.espigas = s.espigas.map((e) => e + paso).filter((e) => e < s.largo);
    s.fase += (tasa / ESPIGAS_POR_PUNTO) * dt;
    // Tope por cuadro: con la pestaña dormida, dt se acota igual.
    for (let n = 0; s.fase >= 1 && n < 8; n++) {
      s.fase -= 1;
      s.espigas.push(s.fase * paso);
    }
    s.fase = Math.min(s.fase, 1);
  }
}
