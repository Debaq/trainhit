// La sesión en CSV: lo que baja «Exportar CSV» y lo que vuelve a subir
// «Importar CSV». Sin DOM, para que los tests hagan la ida y la vuelta.
//
// Un archivo, varias tablas una abajo de la otra, cada una con una línea
// `# TABLA: …` adelante y una vacía en medio, que es como las planillas
// cortan un CSV en bloques:
//
//   pulsos       un pulso por fila, con la configuración con la que se calculó.
//   muestras     una muestra derivada por fila: para rehacer el cálculo a mano.
//   crudo        un frame por fila, antes del derivador: lo que hace falta para
//                volver a correr el motor. Es lo que se importa.
//   calibracion  las muestras de la última calibración, si hubo.
//
// Importar sirve para que un docente reparta una sesión medida —un caso real—
// y cada alumno la abra, la recalcule y la mida con sus propias perillas, y
// para seguir otro día una sesión propia. Se importa del CRUDO, no de los
// resultados: los números los vuelve a sacar el motor.

import { tx } from './idioma.js';

/** Número para CSV: punto decimal, y vacío —no un guion— cuando no hay valor. */
const num = (v, d = 3) => (v === null || v === undefined || Number.isNaN(v) ? '' : v.toFixed(d));

const siNo = (v) => (v ? 'si' : 'no');

/** Un pulso por fila, con la configuración con la que se calculó. */
export function filasPulsos(trials, version = '', { simulacionOculta = false } = {}) {
  return [
    [
      'id', 'lado', 'pico_cabeza_deg_s', 'duracion_ms', 'ganancia_area', 'ganancia_60ms', 'ganancia_pico',
      'rechazo', 'calibrado', 'k', 'iris_min_px', 'disconj_mm', 'hueco_max_ms', 'deriv_ventana_ms', 'deriv_grado',
      'fps_muestreo', 'no_validado', 'ejemplo', 'version',
      'sacadas_encubiertas', 'sacadas_manifiestas', 'ganancia_hasta_sacada', 'importado', 'simulado',
    ],
    ...trials.map((t) => [
      t.id,
      t.side,
      num(t.peakHeadDegS, 1),
      num(t.durationMs, 1),
      num(t.gain),
      num(t.gains?.instant60ms),
      num(t.gains?.peak),
      t.rejected ?? '',
      siNo(t.calibrado),
      num(t.k),
      num(t.irisPx, 1),
      num(t.disconjMm),
      num(t.gapMs, 0),
      t.deriv?.windowMs ?? '',
      t.deriv?.degree ?? '',
      num(t.fpsMuestreo, 1),
      siNo(t.noValidado),
      // Un pulso importado dice si era de ejemplo en el archivo de origen: la
      // marca «ej» de la lista no es eso sino «no es de esta sesión».
      siNo(t.importado ? t.ejemploEnArchivo : t.ejemplo),
      version,
      (t.sacadas ?? []).filter((s) => s.tipo === 'encubierta').length,
      (t.sacadas ?? []).filter((s) => s.tipo === 'manifiesta').length,
      num(t.gains?.desacadizada),
      siNo(t.importado),
      // El perfil del paciente simulado; a ciegas, sin decir cuál.
      t.simulado ? (simulacionOculta ? 'oculto' : t.simulado) : '',
    ]),
  ];
}

/**
 * Una muestra por fila, de todos los pulsos: lo derivado (lo que se grafica y
 * de donde sale la ganancia) y, al lado, lo crudo del frame que cerró esa
 * ventana del derivador. Es lo que hace falta para rehacer el cálculo en una
 * planilla.
 */
export function filasMuestras(trials) {
  const filas = [
    [
      'id', 'lado', 't_ms', 'cabeza_deg', 'mirada_deg', 'v_cabeza_deg_s', 'v_mirada_deg_s', 'en_impulso', 'parpadeo',
      'iris_px', 'verg_mm', 'crudo_t_ms', 'crudo_yaw_deg', 'crudo_offset_mm',
    ],
  ];
  for (const t of trials) {
    for (const s of t.samples) {
      const dentro = t.core && s.tMs >= t.tOnsetMs && s.tMs <= t.tOffsetMs;
      filas.push([
        t.id, t.side, num(s.tMs, 1), num(s.headPos), num(s.gazePos), num(s.headVel, 1), num(s.gazeVel, 1),
        dentro ? 1 : 0, s.blink ? 1 : 0, num(s.irisPx, 1), num(s.vergMm),
        num(s.crudo?.tMs, 1), num(s.crudo?.yaw), num(s.crudo?.offsetMm),
      ]);
    }
  }
  return filas;
}

/**
 * Un frame por fila, antes del derivador, con el tiempo contado desde el
 * disparo del pulso. Incluye el margen previo que el derivador necesita para
 * arrancar caliente: sin él, recalcular un pulso importado perdería sus
 * primeras muestras.
 */
export function filasCrudo(trials) {
  const filas = [['id', 't_ms', 'yaw_deg', 'offset_mm', 'parpadeo_puntaje', 'parpadeo', 'iris_px', 'verg_mm']];
  for (const t of trials) {
    if (!t.crudo) continue;
    for (const c of t.crudo) {
      filas.push([
        t.id,
        num((c.t - t.tTrigger) * 1000, 2),
        num(c.yaw, 4),
        num(c.offsetMm, 4),
        num(c.blinkScore, 3),
        c.blinkScore === undefined || c.blinkScore === null ? (c.blink ? 1 : 0) : '',
        num(c.irisPx, 2),
        num(c.vergMm, 4),
      ]);
    }
  }
  return filas;
}

/** Las muestras de la calibración: `[offsetMm, yawDeg]` por frame. */
export function filasCalibracion(muestras) {
  return [['offset_mm', 'yaw_deg'], ...muestras.map(([o, y]) => [num(o, 4), num(y, 4)])];
}

/** El archivo entero. */
export function textoSesion({ trials, version = '', calibracion = null, simulacionOculta = false }) {
  const filas = [
    ['# TABLA: pulsos'],
    ...filasPulsos(trials, version, { simulacionOculta }),
    [],
    ['# TABLA: muestras'],
    ...filasMuestras(trials),
    [],
    ['# TABLA: crudo'],
    ...filasCrudo(trials),
  ];
  if (calibracion?.length) filas.push([], ['# TABLA: calibracion'], ...filasCalibracion(calibracion));
  return filas.map((f) => f.join(',')).join('\n');
}

/**
 * Parte el archivo en tablas: `{ nombre: [{columna: valor}] }`.
 *
 * Acepta también lo que devuelve una planilla en configuración regional
 * latina —punto y coma entre campos y coma decimal—, que es lo que pasa si
 * alguien abre el CSV en Excel y lo guarda.
 */
export function tablas(texto) {
  const lineas = texto.replace(/^\uFEFF/, '').split(/\r?\n/);
  // El separador lo dice la primera cabecera: la línea que sigue a un `# TABLA`.
  const iCab = lineas.findIndex((l) => /^#\s*TABLA:/i.test(l.trim())) + 1;
  const sep = (lineas[iCab] ?? '').includes(';') ? ';' : ',';
  const out = {};
  let actual = null;
  let cabecera = null;
  for (const cruda of lineas) {
    const l = cruda.trim();
    const marca = l.match(/^#\s*TABLA:\s*([\w-]+)/i);
    if (marca) {
      actual = [];
      out[marca[1].toLowerCase()] = actual;
      cabecera = null;
      continue;
    }
    if (!actual || !l || l.replaceAll(sep, '') === '') continue;
    const campos = l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (!cabecera) {
      cabecera = campos;
      continue;
    }
    actual.push(Object.fromEntries(cabecera.map((c, i) => [c, sep === ';' ? (campos[i] ?? '').replace(',', '.') : campos[i] ?? ''])));
  }
  return out;
}

const numero = (v) => (v === '' || v === undefined ? null : Number(v));

/**
 * Lee un archivo exportado y devuelve lo necesario para volver a correr el
 * motor: por pulso, su crudo, su k y su derivador.
 *
 * @returns {{ pulsos: Array<{id:number, lado:string, k:number|null, calibrado:boolean, ejemplo:boolean,
 *   deriv:{windowMs:number, degree:number}|null, crudo:Array<object>}>, calibracion: Array<[number,number]>|null }}
 * @throws si el archivo no trae la tabla de crudo (los exportados antes de que existiera)
 */
export function leeSesion(texto) {
  const t = tablas(texto);
  if (!t.crudo?.length) {
    throw new Error(
      t.pulsos
        ? tx('el archivo no trae la tabla de crudo (se exportó con una versión anterior): no se puede volver a calcular')
        : tx('no parece un CSV de trainHIT'),
    );
  }
  const porId = new Map();
  for (const f of t.crudo) {
    const id = Number(f.id);
    if (!porId.has(id)) porId.set(id, []);
    const puntaje = numero(f.parpadeo_puntaje);
    porId.get(id).push({
      t: Number(f.t_ms) / 1000,
      yaw: Number(f.yaw_deg),
      offsetMm: Number(f.offset_mm),
      ...(puntaje === null ? { blink: f.parpadeo === '1' } : { blinkScore: puntaje }),
      irisPx: numero(f.iris_px),
      vergMm: numero(f.verg_mm),
    });
  }
  const meta = new Map((t.pulsos ?? []).map((f) => [Number(f.id), f]));
  const pulsos = [...porId].map(([id, crudo]) => {
    const f = meta.get(id) ?? {};
    const ventana = numero(f.deriv_ventana_ms);
    const grado = numero(f.deriv_grado);
    return {
      id,
      lado: f.lado ?? null,
      k: numero(f.k),
      calibrado: f.calibrado === 'si',
      ejemplo: f.ejemplo === 'si',
      simulado: f.simulado || null,
      deriv: ventana && grado ? { windowMs: ventana, degree: grado } : null,
      crudo: crudo.sort((a, b) => a.t - b.t),
    };
  });
  const calibracion = t.calibracion?.length
    ? t.calibracion.map((f) => [Number(f.offset_mm), Number(f.yaw_deg)])
    : null;
  return { pulsos, calibracion };
}
