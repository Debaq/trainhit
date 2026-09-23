// Práctica con el paciente simulado: «Voy a tener suerte».
//
// Un clic sortea un perfil —puede salir sano— y lo esconde. Se examina como
// siempre y, con pulsos suficientes de cada lado, se contestan tres preguntas
// antes de revelar: qué lado está afectado, qué sacadas aparecen y qué patrón
// muestra. El orden es el del razonamiento clínico: primero dónde, después
// cómo corrige, al final el nombre.
//
// Las respuestas correctas salen del perfil (PERFILES de simulacion.js), no
// de lo medido: es lo que el motor le puso al compañero. Que lo medido las
// muestre de verdad lo comprueba test/practica.test.mjs.
//
// Sin DOM: app.js pinta las preguntas y guarda las respuestas.

import { FIN_IMPULSO_S, PERFILES } from './simulacion.js';
import { tutorialEn } from './tutorial-pasos.js';
import { idioma, tx } from './idioma.js';

/** Pulsos aceptados por lado para poder contestar: con menos no hay media que leer. */
export const MIN_POR_LADO = 3;

/** Qué lado toca el perfil: 'derecha', 'izquierda', 'ambos' o 'ninguno'. */
export function ladoAfectado(perfil) {
  const lados = Object.keys(PERFILES[perfil].lados);
  return lados.length === 2 ? 'ambos' : (lados[0] ?? 'ninguno');
}

/**
 * Qué sacadas trae el perfil: 'ninguna', 'encubiertas', 'manifiestas' o
 * 'ambas'. Una sacada que arranca antes del fin del impulso es encubierta.
 */
export function sacadasDe(perfil) {
  const tipos = new Set(
    Object.values(PERFILES[perfil].lados).flatMap((l) =>
      l.sacadas.map((s) => (s.latencia[1] < FIN_IMPULSO_S ? 'encubiertas' : 'manifiestas')),
    ),
  );
  if (!tipos.size) return 'ninguna';
  return tipos.size === 2 ? 'ambas' : [...tipos][0];
}

/** La respuesta correcta de cada pregunta para un perfil. */
export function claveDe(perfil) {
  return { lado: ladoAfectado(perfil), sacadas: sacadasDe(perfil), patron: PERFILES[perfil].patron };
}

/** Las tres preguntas, con los textos del idioma de ahora. */
export function preguntasPractica() {
  return [
    {
      id: 'lado',
      texto: tx('¿Qué lado está afectado?'),
      opciones: {
        derecha: tx('El derecho'),
        izquierda: tx('El izquierdo'),
        ambos: tx('Los dos'),
        ninguno: tx('Ninguno'),
      },
    },
    {
      id: 'sacadas',
      texto: tx('¿Qué sacadas correctivas aparecen?'),
      opciones: {
        ninguna: tx('Ninguna'),
        encubiertas: tx('Encubiertas: durante el giro'),
        manifiestas: tx('Manifiestas: después del giro'),
        ambas: tx('De los dos tipos'),
      },
    },
    { id: 'patron', texto: tx('¿Qué patrón muestra?'), opciones: tutorialEn(idioma()).PATRONES },
  ];
}

/** Cada respuesta contra la clave: `{ id: { elegida, correcta, ok } }` y cuántas acertó. */
export function corrige(perfil, respuestas) {
  const clave = claveDe(perfil);
  const detalle = Object.fromEntries(
    Object.entries(clave).map(([id, correcta]) => [id, { elegida: respuestas[id] ?? null, correcta, ok: respuestas[id] === correcta }]),
  );
  return { detalle, aciertos: Object.values(detalle).filter((d) => d.ok).length, total: Object.keys(clave).length };
}
