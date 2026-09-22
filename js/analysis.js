// Análisis de un pulso: delimitar el impulso, calcular ganancias y decidir si
// el pulso sirve. Port didáctico de `rust/src/analysis.rs`.
//
// Qué NO hace esto y sí hace un ICS Impulse (ver GANANCIAS.md §3.1 del repo
// principal): **no desacadiza**. Las sacadas correctivas quedan adentro de la
// ganancia, y el sesgo es direccional — infla la ganancia justo en el paciente
// con déficit, que es el que tiene sacadas covert. Es un sesgo hacia el FALSO
// NEGATIVO, y es la discrepancia más grave del motor.

export const CONFIG = {
  impulse: {
    onDegS: 60, // arranca el impulso
    offDegS: 40, // y lo termina (histéresis en amplitud)
    offHoldMs: 15, // que además tiene que sostenerse (histéresis en tiempo)
    preTriggerMs: 100, // cuánto se guarda ANTES del disparo
    windowMs: 800, // ventana total del pulso desde el disparo
    ignoreBelowDegS: 100, // por debajo de esto ni siquiera fue un intento
  },
  accept: {
    peakMinDegS: 120,
    peakMaxDegS: 300,
    durationMinMs: 80,
    durationMaxMs: 300,
    reboundMaxDegS: 100,
    reboundHoldMs: 15,
  },
  gainNormalMin: 0.8, // el corte dibujado. NO es nuestro corte: ver README.
};

export const RECHAZO_TEXT = {
  lento: 'MUY LENTO — empujá más fuerte',
  rapido: 'MUY RÁPIDO',
  corto: 'MUY CORTO',
  largo: 'MUY LARGO',
  rebote: 'REBOTE — la cabeza volvió sola',
  'sin-impulso': 'SIN IMPULSO',
  parpadeo: 'PARPADEO en la ventana',
  'sin-ganancia': 'SIN GANANCIA MEDIBLE',
};

/** `+1` derecha, `-1` izquierda. */
export function sideSign(side) {
  return side === 'derecha' ? 1 : -1;
}

/**
 * Delimita el impulso: primera muestra por encima del umbral de inicio, y
 * primera que baja del de fin **y se queda abajo** `offHoldMs`.
 *
 * La permanencia es lo que distingue el final de un impulso de un bache de una
 * muestra en la meseta. Sin ella, un frame ruidoso cerraba el impulso antes de
 * tiempo y arrastraba todo lo que cuelga del final: la duración, la ventana de
 * búsqueda de sacadas —una covert pasaba a contarse como overt— y el arranque
 * de la ventana de estabilidad.
 */
export function findImpulse(samples, side, cfg = CONFIG) {
  const sign = sideSign(side);
  const onset = samples.findIndex((s) => s.headVel * sign > cfg.impulse.onDegS);
  if (onset < 0) return null;
  const debajo = (s) => s.headVel * sign < cfg.impulse.offDegS;

  let i = onset + 1;
  while (i < samples.length) {
    if (!debajo(samples[i])) {
      i += 1;
      continue;
    }
    const t0 = samples[i].tMs;
    let j = i;
    while (j < samples.length && debajo(samples[j])) {
      if (samples[j].tMs - t0 >= cfg.impulse.offHoldMs) return { onset, offset: i };
      j += 1;
    }
    // Se acabó la ventana sin confirmar: el pulso queda incompleto, que es lo
    // honesto. Darlo por terminado acá sería inventar un final que no se vio.
    if (j >= samples.length) return null;
    i = j + 1; // fue un bache: la velocidad volvió a subir
  }
  return null;
}

/** Interpola linealmente un campo de las muestras en un instante dado. */
export function sampleAt(samples, tMs, field) {
  if (samples.length < 2) return null;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    if (tMs >= a.tMs && tMs <= b.tMs) {
      const span = b.tMs - a.tMs;
      if (span <= 0) return field(a);
      const f = (tMs - a.tMs) / span;
      return field(a) + (field(b) - field(a)) * f;
    }
  }
  return null;
}

/**
 * Las tres ganancias. Ninguna desacadiza.
 *
 * - `area`: 1 - Δmirada/Δcabeza con POSICIONES, onset->offset. Es la que se
 *   reporta. Usar posiciones en vez de integrar velocidades es correcto: con
 *   los mismos extremos de integración las dos cantidades son idénticas, y las
 *   posiciones no arrastran el ruido de derivar.
 * - `instant60ms`: 1 - v_mirada/v_cabeza a los 60 ms del onset. A 30 fps es
 *   prácticamente inmedible (dos frames), queda como referencia.
 * - `peak`: máximos independientes, que es lo que hace el equipo de Synapsys.
 */
export function computeGains(all, core, side, tOnsetMs) {
  const sign = sideSign(side);

  const dHead = core[core.length - 1].headPos - core[0].headPos;
  const dGaze = core[core.length - 1].gazePos - core[0].gazePos;
  // VOR perfecto = la mirada no se mueve EN EL ESPACIO mientras la cabeza gira,
  // o sea dGaze = 0 y la ganancia da 1.
  const area = Math.abs(dHead) >= 3 ? 1 - dGaze / dHead : null;

  const t60 = tOnsetMs + 60;
  const hv = sampleAt(all, t60, (s) => s.headVel);
  const gv = sampleAt(all, t60, (s) => s.gazeVel);
  const instant60ms = hv !== null && gv !== null && Math.abs(hv) >= 50 ? 1 - gv / hv : null;

  const peakHead = core.reduce((m, s) => Math.max(m, s.headVel * sign), 0);
  // Velocidad ocular compensatoria: el ojo va al revés que la cabeza.
  const peakEye = core.reduce((m, s) => Math.max(m, -s.gazeVel * sign + s.headVel * sign), 0);
  const peak = peakHead >= 1 ? peakEye / peakHead : null;

  return { area, instant60ms, peak, dHead, dGaze, peakHead, peakEye };
}

/**
 * Analiza un pulso completo.
 * @param {Array<{tMs:number,headPos:number,gazePos:number,headVel:number,gazeVel:number,blink:boolean}>} samples
 */
export function analyzeTrial(samples, cfg = CONFIG) {
  if (samples.length < 4) return null;

  // El lado sale del pico de velocidad de cabeza, no del primer cruce: el
  // arranque puede tener ruido de cualquier signo.
  let peakSigned = 0;
  for (const s of samples) if (Math.abs(s.headVel) > Math.abs(peakSigned)) peakSigned = s.headVel;
  const side = peakSigned >= 0 ? 'derecha' : 'izquierda';
  const sign = sideSign(side);

  const win = findImpulse(samples, side, cfg);
  if (!win) return { side, rejected: 'sin-impulso', samples, peakHeadDegS: Math.abs(peakSigned) };

  const core = samples.slice(win.onset, win.offset + 1);
  const tOnset = core[0].tMs;
  const durationMs = core[core.length - 1].tMs - tOnset;
  const gains = computeGains(samples, core, side, tOnset);
  const peakHeadDegS = gains.peakHead;

  const trial = {
    side,
    samples,
    core,
    tOnsetMs: tOnset,
    tOffsetMs: core[core.length - 1].tMs,
    durationMs,
    peakHeadDegS,
    gains,
    gain: gains.area,
    blink: core.some((s) => s.blink),
    rejected: null,
  };

  // Orden de los rechazos: primero lo que le dice al operador qué hacer
  // distinto, después la calidad de la señal.
  if (peakHeadDegS < cfg.accept.peakMinDegS) trial.rejected = 'lento';
  else if (peakHeadDegS > cfg.accept.peakMaxDegS) trial.rejected = 'rapido';
  else if (durationMs < cfg.accept.durationMinMs) trial.rejected = 'corto';
  else if (durationMs > cfg.accept.durationMaxMs) trial.rejected = 'largo';
  else if (hayRebote(samples, win.offset, sign, cfg)) trial.rejected = 'rebote';
  else if (trial.blink) trial.rejected = 'parpadeo';
  else if (trial.gain === null) trial.rejected = 'sin-ganancia';

  return trial;
}

/**
 * ¿El paciente trajo la cabeza de vuelta?
 *
 * Una sola muestra por encima del umbral no alcanza: eso rechazaba pulsos
 * buenos por un pico espurio del seguimiento. Un rebote real dura más de
 * 100 ms, así que exigir permanencia no deja pasar ninguno.
 */
function hayRebote(samples, offsetIdx, sign, cfg) {
  let t0 = null;
  for (let i = offsetIdx; i < samples.length; i++) {
    const s = samples[i];
    if (s.headVel * sign < -cfg.accept.reboundMaxDegS) {
      if (t0 === null) t0 = s.tMs;
      if (s.tMs - t0 >= cfg.accept.reboundHoldMs) return true;
    } else {
      t0 = null;
    }
  }
  return false;
}

/** Media, DE y n de las ganancias reportables de un lado. */
export function resumenLado(trials, side) {
  const g = trials
    .filter((t) => t.side === side && !t.rejected && t.gain !== null)
    .map((t) => t.gain);
  if (!g.length) return { n: 0, media: null, de: null, asimetriaBase: null };
  const media = g.reduce((a, b) => a + b, 0) / g.length;
  const de =
    g.length > 1
      ? Math.sqrt(g.reduce((a, b) => a + (b - media) ** 2, 0) / (g.length - 1))
      : 0;
  return { n: g.length, media, de };
}

/** Asimetría porcentual entre lados, como la reportan los equipos. */
export function asimetria(mediaDer, mediaIzq) {
  if (mediaDer === null || mediaIzq === null) return null;
  const suma = mediaDer + mediaIzq;
  if (Math.abs(suma) < 1e-6) return null;
  return (100 * (mediaDer - mediaIzq)) / suma;
}
