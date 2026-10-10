// Datos de la Figura 1 del artículo: calibración del paralaje y los mismos
// impulsos del lado sano recalculados con el k de esa calibración y con k = 0.
//
// No reimplementa nada: importa el motor de la app (js/) y hace lo mismo que
// «Importar CSV» seguido de «Recalcular»: lee la sesión con `leeSesion`,
// ajusta la calibración con `fitParallax` y corre cada pulso con
// `procesaCrudo(crudo, 0, modelo, derivador, CONFIG)`, como `importaSesion`
// de app.js. Lo único que se calcula aquí es el R² de la recta (la app da el
// residuo en grados, no el R²) y la curva media para el gráfico.
//
// Uso:
//   node figure1_datos.mjs sesion_figura1.csv [--lado derecha|izquierda]
//   node figure1_datos.mjs --sintetico
//
// Escribe un JSON en la salida estándar. Si la sesión no sirve para la
// figura, sale con código 2 y dice por qué: NUNCA completa con datos
// sintéticos. `--sintetico` es solo para probar el flujo: arma una sesión con
// el paciente de ejemplo de la app (js/ejemplo.js), la pasa a CSV con
// `textoSesion` y la lee por el mismo camino que una real.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const JS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../js');
const geom = await import(`${JS}/geom.js`);
const { procesaCrudo } = await import(`${JS}/pipeline.js`);
const { CONFIG, sideSign, sampleAt, resumenLado } = await import(`${JS}/analysis.js`);
const { leeSesion, tablas, textoSesion } = await import(`${JS}/sesion.js`);
const ejemplo = await import(`${JS}/ejemplo.js`);

/** Mínimo de impulsos aceptados del lado sano para hacer la figura. */
const MIN_IMPULSOS = 5;
/** Derivador por defecto de la app (index.html), si un pulso no trae el suyo. */
const DERIV_DEFECTO = { windowMs: 50, degree: 2 };
/**
 * Cuánto puede diferir el k con que se midió un pulso (columna `k`, con tres
 * decimales) del k que sale de ajustar la tabla de calibración del archivo
 * (cuatro decimales por muestra). Más que esto es otra calibración.
 */
const TOL_K = 0.0015;
/** Diferencia tolerada entre la ganancia del CSV (tres decimales) y la recalculada. */
const TOL_GANANCIA = 0.005;
/** Ventana de la curva media, en ms desde el inicio del impulso. */
const MEDIA_DESDE_MS = -100;
const MEDIA_HASTA_MS = 350;

class SesionNoSirve extends Error {}

function args(argv) {
  const out = { csv: null, lado: null, sintetico: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sintetico') out.sintetico = true;
    else if (argv[i] === '--lado') out.lado = argv[++i];
    else out.csv = argv[i];
  }
  if (out.lado && !['derecha', 'izquierda'].includes(out.lado)) throw new SesionNoSirve(`--lado debe ser derecha o izquierda, no «${out.lado}»`);
  // El paciente de prueba tiene los dos lados sanos: se toma el derecho.
  if (out.sintetico) out.lado ??= 'derecha';
  if (!out.sintetico && !out.csv) throw new SesionNoSirve('falta el CSV de la sesión (o --sintetico para probar el flujo)');
  return out;
}

/**
 * Sesión de prueba: el paciente sintético «A» de Casos a ciegas (normal, cinco
 * impulsos a cada lado) con la calibración de ejemplo, armados como los arma
 * `cargaEjemplos` de app.js y exportados con `textoSesion`.
 */
function textoSintetico() {
  const muestras = ejemplo.calibracionDeEjemplo();
  const fit = geom.fitParallax(muestras, geom.EYE_ROTATION_RADIUS_MM);
  const model = new geom.EyeModel();
  model.kParallax = fit.kParallax;
  model.calibrated = true;
  const trials = ejemplo.pulsosDe('A').map((p, i) => {
    const { crudo, tTrigger } = ejemplo.crudoDeEjemplo(p, 100 + i);
    const t = procesaCrudo(crudo, tTrigger, model, DERIV_DEFECTO, CONFIG);
    return Object.assign(t, {
      id: i + 1, crudo, ejemplo: true, canal: 'lateral',
      calibrado: true, k: model.kParallax, deriv: DERIV_DEFECTO,
    });
  });
  return textoSesion({ trials, version: 'sintetico', calibracion: muestras });
}

/** R² de la recta de `fitParallax`, en las mismas variables del ajuste. */
function r2(muestras, fit, radiusMm) {
  const xs = muestras.map(([, yaw]) => Math.sin((yaw * Math.PI) / 180));
  const ys = muestras.map(([o]) => o / radiusMm);
  const media = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sst = 0;
  let sse = 0;
  ys.forEach((y, i) => {
    sst += (y - media) ** 2;
    sse += (y - (fit.intercept + fit.slope * xs[i])) ** 2;
  });
  return 1 - sse / sst;
}

/** Corre un pulso del archivo con un k dado, como `importaSesion` de app.js. */
function corre(p, k) {
  const model = new geom.EyeModel();
  model.kParallax = k;
  model.calibrated = k !== 0;
  return procesaCrudo(p.crudo, 0, model, p.deriv ?? DERIV_DEFECTO, CONFIG);
}

/**
 * Velocidades del pulso con el tiempo desde el inicio del impulso y el signo
 * del lado, para que la cabeza vaya hacia arriba. El ojo va invertido, como en
 * los equipos de vHIT: es la velocidad del ojo en la órbita cambiada de signo,
 * `cabeza − mirada`, la misma que usa `computeGains` para la ganancia de pico.
 */
function curvas(t) {
  const s = sideSign(t.side);
  return t.samples.map((m) => ({
    t: m.tMs - t.tOnsetMs,
    cabeza: m.headVel * s,
    ojo: (m.headVel - m.gazeVel) * s,
  }));
}

/** Media de las curvas en una grilla de 1 ms, interpolando con `sampleAt` de la app. */
function media(trials, campo) {
  const out = [];
  for (let ms = MEDIA_DESDE_MS; ms <= MEDIA_HASTA_MS; ms++) {
    const v = trials.map((t) => sampleAt(t.samples, t.tOnsetMs + ms, campo));
    if (v.some((x) => x === null)) continue;
    out.push([ms, v.reduce((a, b) => a + b, 0) / v.length]);
  }
  return out;
}

function datos({ csv, lado, sintetico }) {
  const texto = sintetico ? textoSintetico() : readFileSync(csv, 'utf8');
  const sesion = leeSesion(texto);
  const meta = new Map((tablas(texto).pulsos ?? []).map((f) => [Number(f.id), f]));
  const avisos = [];

  // ---- Calibración
  if (!sesion.calibracion?.length) {
    throw new SesionNoSirve('el CSV no trae la tabla «calibracion»: calibrar con la webcam antes de los impulsos y exportar sin recalibrar después');
  }
  const R = geom.EYE_ROTATION_RADIUS_MM;
  const fit = geom.fitParallax(sesion.calibracion, R);
  if (!fit) throw new SesionNoSirve(`la calibración no tiene con qué ajustar (${sesion.calibracion.length} muestras)`);
  if (!fit.acceptable) throw new SesionNoSirve(`la app rechaza esta calibración: ${geom.CALIB_ISSUE_TEXT[fit.issue]} (${fit.issue})`);
  if (!fit.kPlausible) avisos.push(`k = ${fit.kParallax.toFixed(4)} está fuera del rango anatómico ${geom.CALIB_K_PLAUSIBLE.join('–')}: la app pide repetir`);

  // ---- Pulsos: solo de una sesión medida, en el plano lateral, con esta calibración
  const pulsos = sesion.pulsos.filter((p) => {
    const f = meta.get(p.id) ?? {};
    if (!sintetico && p.ejemplo && f.importado !== 'si') throw new SesionNoSirve(`el pulso #${p.id} es un ejemplo sintético de la app, no un impulso medido`);
    if (p.simulado) throw new SesionNoSirve(`el pulso #${p.id} viene del simulador de pacientes («${p.simulado}»)`);
    if (p.plano !== 'lateral') throw new SesionNoSirve(`el pulso #${p.id} es del plano ${p.plano}: la figura es del lateral con webcam`);
    return true;
  });

  const conK = pulsos.map((p) => ({ p, t: corre(p, fit.kParallax) })).filter(({ t }) => t);
  const aceptados = conK.filter(({ t }) => !t.rejected);
  const porLado = { derecha: 0, izquierda: 0 };
  for (const { t } of aceptados) porLado[t.side]++;
  if (!lado) {
    const lados = Object.keys(porLado).filter((l) => porLado[l] > 0);
    if (lados.length !== 1) {
      throw new SesionNoSirve(`hay impulsos aceptados a los dos lados (derecha ${porLado.derecha}, izquierda ${porLado.izquierda}): indicar el sano con --lado`);
    }
    lado = lados[0];
  }
  const sanos = aceptados.filter(({ t }) => t.side === lado);
  if (sanos.length < MIN_IMPULSOS) {
    throw new SesionNoSirve(`solo ${sanos.length} impulsos aceptados hacia la ${lado} (hacen falta ${MIN_IMPULSOS}); rechazados: ${
      conK.filter(({ t }) => t.rejected && t.side === lado).map(({ p, t }) => `#${p.id} ${t.rejected}`).join(', ') || 'ninguno'}`);
  }

  for (const { p } of sanos) {
    if (!p.calibrado || p.k === null || Math.abs(p.k - fit.kParallax) > TOL_K) {
      throw new SesionNoSirve(`el pulso #${p.id} se midió con k = ${p.k ?? 'vacío'}${p.calibrado ? '' : ' sin calibrar'}, no con la calibración del archivo (k = ${fit.kParallax.toFixed(4)}): no recalibrar entre los impulsos y la exportación`);
    }
  }

  // ---- Los mismos impulsos con k = 0
  const filas = sanos.map(({ p, t }) => {
    const t0 = corre(p, 0);
    if (!t0 || t0.gain === null) throw new SesionNoSirve(`el pulso #${p.id} no da ganancia con k = 0`);
    const f = meta.get(p.id) ?? {};
    const csvGain = f.ganancia_area === '' || f.ganancia_area === undefined ? null : Number(f.ganancia_area);
    if (csvGain !== null && Math.abs(csvGain - t.gain) > TOL_GANANCIA) {
      avisos.push(`pulso #${p.id}: el CSV dice ganancia ${csvGain.toFixed(3)} y recalculada da ${t.gain.toFixed(3)} (¿perillas distintas de las de fábrica?)`);
    }
    if (t0.rejected) avisos.push(`pulso #${p.id}: con k = 0 la app lo marcaría «${t0.rejected}»; se incluye igual, es el mismo impulso`);
    return { p, t, t0 };
  });

  const resumen = (lista) => resumenLado(lista.map((t) => ({ ...t, rejected: null })), lado);
  const trialsK = filas.map((f) => f.t);
  const trials0 = filas.map((f) => f.t0);
  const s = sideSign(lado);
  return {
    origen: sintetico ? 'sintetico' : resolve(csv),
    avisos,
    R_mm: R,
    calibracion: {
      puntos: sesion.calibracion.map(([o, yaw]) => [Math.sin((yaw * Math.PI) / 180), o / R]),
      k: fit.kParallax,
      pendiente: fit.slope,
      ordenada: fit.intercept,
      r2: r2(sesion.calibracion, fit, R),
      residuoDeg: fit.residualDeg,
      rangoDeg: fit.headRangeDeg,
      n: fit.samples,
      azimutBlancoDeg: fit.targetAzimuthDeg,
    },
    lado,
    impulsos: filas.map(({ p, t, t0 }) => ({
      id: p.id,
      deriv: p.deriv ?? DERIV_DEFECTO,
      picoCabezaDegS: t.peakHeadDegS,
      duracionMs: t.durationMs,
      gananciaK: t.gain,
      ganancia0: t0.gain,
      gananciaPicoK: t.gains.peak,
      gananciaPico0: t0.gains.peak,
      curvaK: curvas(t),
      curva0: curvas(t0),
    })),
    resumenK: resumen(trialsK),
    resumen0: resumen(trials0),
    resumenPicoK: resumenLado(trialsK.map((t) => ({ ...t, rejected: null })), lado, (t) => t.gains.peak),
    resumenPico0: resumenLado(trials0.map((t) => ({ ...t, rejected: null })), lado, (t) => t.gains.peak),
    media: {
      cabeza: media(trialsK, (m) => m.headVel * s),
      ojoK: media(trialsK, (m) => (m.headVel - m.gazeVel) * s),
      ojo0: media(trials0, (m) => (m.headVel - m.gazeVel) * s),
    },
    node: process.version,
  };
}

try {
  process.stdout.write(JSON.stringify(datos(args(process.argv.slice(2)))));
} catch (e) {
  if (!(e instanceof SesionNoSirve) && !/tabla de crudo|CSV de trainHIT/.test(e.message)) throw e;
  process.stderr.write(`La sesión no sirve para la figura: ${e.message}\n`);
  process.exit(2);
}
