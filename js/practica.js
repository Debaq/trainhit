// Práctica con el paciente simulado: «Voy a tener suerte».
//
// Un clic sortea un perfil —puede salir sano— y lo esconde. Se examina como
// siempre y, con pulsos suficientes de cada lado, se contestan tres preguntas
// antes de revelar: qué lado está afectado, qué sacadas aparecen y qué patrón
// muestra. El orden es el del razonamiento clínico: primero dónde, después
// cómo corrige, al final el nombre.
//
// Con el teléfono la práctica es de SEIS canales (`seis`): hacen falta pulsos
// de los tres planos, y las preguntas son qué lateral y qué verticales están
// afectados y qué sacadas aparecen. El patrón se deja: sus nombres son los
// del lateral, y la neuritis inferior —sana en el lateral— lo haría engañoso.
//
// Las respuestas correctas salen del perfil (PERFILES de simulacion.js), no
// de lo medido: es lo que el motor le puso al compañero. Que lo medido las
// muestre de verdad lo comprueba test/practica.test.mjs.
//
// Sin DOM: app.js pinta las preguntas y guarda las respuestas.

import { CANALES_DEL_PLANO } from './head.js';
import { FIN_IMPULSO_S, PERFILES } from './simulacion.js';
import { tutorialEn } from './tutorial-pasos.js';
import { idioma, tx } from './idioma.js';

/** Pulsos aceptados por lado (o por canal) para poder contestar: con menos no hay media que leer. */
export const MIN_POR_LADO = 3;

/** Los seis canales, plano por plano: 'lateral-der', 'lateral-izq', 'posterior-der'… */
export const CANALES = Object.values(CANALES_DEL_PLANO).flatMap((p) => [p.derecha, p.izquierda]);

/** Qué verticales toca el perfil: 'ninguno', 'cuatro' o el canal, como 'anterior-der'. */
export function verticalesAfectados(perfil) {
  const c = Object.keys(PERFILES[perfil].canales);
  return c.length === 4 ? 'cuatro' : (c[0] ?? 'ninguno');
}

/** Qué lado toca el perfil: 'derecha', 'izquierda', 'ambos' o 'ninguno'. */
export function ladoAfectado(perfil) {
  const lados = Object.keys(PERFILES[perfil].lados);
  return lados.length === 2 ? 'ambos' : (lados[0] ?? 'ninguno');
}

/**
 * Qué sacadas trae el perfil: 'ninguna', 'encubiertas', 'manifiestas' o
 * 'ambas'. Una sacada que arranca antes del fin del impulso es encubierta.
 * Con `seis`, también las de los verticales.
 */
export function sacadasDe(perfil, { seis = false } = {}) {
  const p = PERFILES[perfil];
  const tipos = new Set(
    [...Object.values(p.lados), ...(seis ? Object.values(p.canales) : [])].flatMap((l) =>
      l.sacadas.map((s) => (s.latencia[1] < FIN_IMPULSO_S ? 'encubiertas' : 'manifiestas')),
    ),
  );
  if (!tipos.size) return 'ninguna';
  return tipos.size === 2 ? 'ambas' : [...tipos][0];
}

/** La respuesta correcta de cada pregunta para un perfil. */
export function claveDe(perfil, { seis = false } = {}) {
  return seis
    ? { lado: ladoAfectado(perfil), verticales: verticalesAfectados(perfil), sacadas: sacadasDe(perfil, { seis }) }
    : { lado: ladoAfectado(perfil), sacadas: sacadasDe(perfil), patron: PERFILES[perfil].patron };
}

/** Las tres preguntas, con los textos del idioma de ahora; con `seis`, las de los seis canales. */
export function preguntasPractica({ seis = false } = {}) {
  const lado = {
    id: 'lado',
    texto: seis ? tx('¿Qué canal lateral está afectado?') : tx('¿Qué lado está afectado?'),
    opciones: {
      derecha: tx('El derecho'),
      izquierda: tx('El izquierdo'),
      ambos: tx('Los dos'),
      ninguno: tx('Ninguno'),
    },
  };
  const sacadas = {
    id: 'sacadas',
    texto: tx('¿Qué sacadas correctivas aparecen?'),
    opciones: {
      ninguna: tx('Ninguna'),
      encubiertas: tx('Encubiertas: durante el giro'),
      manifiestas: tx('Manifiestas: después del giro'),
      ambas: tx('De los dos tipos'),
    },
  };
  if (seis) {
    const verticales = {
      id: 'verticales',
      texto: tx('¿Qué canales verticales están afectados?'),
      opciones: {
        ninguno: tx('Ninguno'),
        'anterior-der': tx('El anterior derecho'),
        'posterior-der': tx('El posterior derecho'),
        'anterior-izq': tx('El anterior izquierdo'),
        'posterior-izq': tx('El posterior izquierdo'),
        cuatro: tx('Los cuatro'),
      },
    };
    return [lado, verticales, sacadas];
  }
  return [
    lado,
    sacadas,
    { id: 'patron', texto: tx('¿Qué patrón muestra?'), opciones: tutorialEn(idioma()).PATRONES },
  ];
}

/** Cada respuesta contra la clave: `{ id: { elegida, correcta, ok } }` y cuántas acertó. */
export function corrige(perfil, respuestas, { seis = false } = {}) {
  const clave = claveDe(perfil, { seis });
  const detalle = Object.fromEntries(
    Object.entries(clave).map(([id, correcta]) => [id, { elegida: respuestas[id] ?? null, correcta, ok: respuestas[id] === correcta }]),
  );
  return { detalle, aciertos: Object.values(detalle).filter((d) => d.ok).length, total: Object.keys(clave).length };
}
