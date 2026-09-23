// Preguntas de autoevaluación en formato GIFT, para importar en Moodle.
//
// Dos fuentes:
//   - los casos a ciegas (CASOS de ejemplo.js): el enunciado lleva los números
//     que el motor saca HOY de cada caso —medias, aceptados, asimetría,
//     sacadas—, así que si el motor cambia, las preguntas cambian con él;
//   - un banco fijo de conceptos (CONCEPTOS, abajo), sobre lo mismo que
//     enseñan los paseos.
//
// Sin DOM: app.js lo baja como archivo y test/preguntas.test.mjs lo revisa.

import { CASOS, K_EJEMPLO, crudoDeEjemplo } from './ejemplo.js';
import { procesaCrudo } from './pipeline.js';
import { CONFIG, asimetria, resumenLado } from './analysis.js';
import { EyeModel } from './geom.js';
import { PASEOS, PATRONES } from './tutorial-pasos.js';

/** En GIFT estos caracteres son sintaxis y en el texto van escapados. */
export function escapa(txt) {
  return String(txt).replace(/([~=#{}:\\])/g, '\\$1');
}

/** Texto plano de un fragmento de HTML propio (los `explica` del tutorial). */
function plano(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const coma = (v, d = 2) => v.toFixed(d).replace('.', ',');

/** Los pulsos de un caso, como los carga app.js (mismas semillas). */
function pulsosDeCaso(letra) {
  const model = new EyeModel();
  model.kParallax = K_EJEMPLO;
  model.calibrated = true;
  return CASOS[letra].pulsos
    .map((p, i) => {
      const { crudo, tTrigger } = crudoDeEjemplo(p, 100 + i);
      return procesaCrudo(crudo, tTrigger, model, { windowMs: 50, degree: 2 }, CONFIG);
    })
    .filter(Boolean);
}

/** Lo que el alumno vería en la pantalla, dicho en palabras. */
export function describeCaso(letra) {
  const ts = pulsosDeCaso(letra);
  const lado = (side, nombre) => {
    const r = resumenLado(ts, side);
    const del = ts.filter((t) => t.side === side);
    const rech = del.length - r.n;
    const enc = del.filter((t) => !t.rejected && t.sacadas?.some((s) => s.tipo === 'encubierta')).length;
    const man = del.filter((t) => !t.rejected && t.sacadas?.some((s) => s.tipo === 'manifiesta')).length;
    const media = r.n ? (r.n > 1 ? `${coma(r.media)} ± ${coma(r.de)}` : coma(r.media)) : 'sin media';
    const motivos = [...new Set(del.filter((t) => t.rejected).map((t) => t.rejected))].join(', ');
    return (
      `${nombre}: ganancia ${media}, ${r.n} aceptados y ${rech} rechazados` +
      (motivos ? ` (${motivos})` : '') +
      `; sacadas encubiertas en ${enc} y manifiestas en ${man} de los aceptados.`
    );
  };
  const der = resumenLado(ts, 'derecha');
  const izq = resumenLado(ts, 'izquierda');
  const a = asimetria(der.media, izq.media);
  return [
    lado('derecha', 'Derecha'),
    lado('izquierda', 'Izquierda'),
    `Asimetría: ${a === null ? 'no calculable' : `${coma(a, 0)} %`}.`,
  ].join(' ');
}

/** Una pregunta de opción múltiple con retroalimentación por opción. */
function multiple(titulo, enunciado, opciones) {
  const cuerpo = opciones
    .map((o) => `  ${o.ok ? '=' : '~'}${escapa(o.texto)}${o.porque ? `#${escapa(o.porque)}` : ''}`)
    .join('\n');
  return `::${escapa(titulo)}::${escapa(enunciado)} {\n${cuerpo}\n}`;
}

/** Las preguntas de los casos: una por caso, con las opciones de siempre. */
function preguntasDeCasos() {
  const pasos = PASEOS.flatMap((p) => p.pasos).filter((p) => p.pregunta?.caso);
  return pasos.map((p) => {
    const q = p.pregunta;
    return multiple(
      `trainHIT caso ${q.caso}`,
      `Paciente sintético medido con trainHIT (vHIT lateral por webcam, la ganancia de área no desacadiza). ${describeCaso(q.caso)} ¿Qué patrón muestra?`,
      Object.entries(PATRONES).map(([id, texto]) => ({
        texto,
        ok: id === q.correcta,
        porque: id === q.correcta ? plano(q.explica) : plano(q.pista),
      })),
    );
  });
}

/**
 * Banco de conceptos. Cada una es GIFT ya armado salvo el escape, que lo pone
 * `multiple` o se hace a mano en las que no son de opción múltiple.
 */
const CONCEPTOS = [
  () =>
    multiple('Ganancia sin calibrar', 'Con k = 0 (paralaje sin corregir), un reflejo vestíbulo-ocular normal se lee con una ganancia de aproximadamente:', [
      { texto: '1,9', ok: true, porque: 'El corrimiento aparente del iris al girar la cabeza tiene la misma magnitud que la señal y se suma a ella.' },
      { texto: '1,0', porque: 'Sería lo correcto con el paralaje calibrado.' },
      { texto: '0,5', porque: 'El paralaje no resta: se suma al movimiento del ojo.' },
      { texto: '0,8', porque: '0,8 es el corte dibujado, no el efecto del paralaje.' },
    ]),
  () =>
    multiple('Sacada encubierta', 'Una sacada correctiva encubierta es la que:', [
      { texto: 'arranca mientras la cabeza todavía está girando', ok: true, porque: 'Por eso a simple vista no se ve: ocurre durante el impulso.' },
      { texto: 'ocurre después de que la cabeza se detuvo', porque: 'Esa es la manifiesta.' },
      { texto: 'va en el mismo sentido que la cabeza', porque: 'Las correctivas llevan la mirada de vuelta al blanco, contra el arrastre.' },
      { texto: 'solo aparece en sujetos sanos', porque: 'Aparecen cuando el reflejo no alcanza.' },
    ]),
  () =>
    multiple('Sesgo al no desacadizar', 'Si la ganancia se calcula sin separar las sacadas encubiertas, en un paciente con déficit la ganancia medida:', [
      { texto: 'sube, y el déficit puede leerse normal', ok: true, porque: 'La sacada mueve el ojo hacia el blanco dentro de la ventana y se suma al reflejo: es un sesgo al falso negativo.' },
      { texto: 'baja, y el déficit se exagera', porque: 'La sacada compensa, no resta.' },
      { texto: 'no cambia', porque: 'La sacada cae dentro de la ventana del impulso y entra en la cuenta.' },
    ]),
  () =>
    multiple('Canal probado', 'Un impulso cefálico hacia la derecha del paciente, en el plano horizontal, prueba sobre todo:', [
      { texto: 'el canal semicircular lateral derecho', ok: true, porque: 'Cada canal lateral se excita con el giro hacia su propio lado.' },
      { texto: 'el canal semicircular lateral izquierdo', porque: 'Ese se prueba con el impulso hacia la izquierda.' },
      { texto: 'el canal posterior derecho', porque: 'Los verticales se prueban con giros diagonales.' },
    ]),
  () =>
    multiple('Asimetría', 'Una asimetría de ganancia cercana a 0 % entre los dos lados indica:', [
      { texto: 'que los dos lados se parecen, sean normales o no', ok: true, porque: 'Una vestibulopatía bilateral da asimetría baja con los dos lados bajos.' },
      { texto: 'que el reflejo es normal', porque: 'Compara los lados entre sí, no contra lo normal.' },
      { texto: 'que la prueba está mal hecha', porque: 'No dice nada sobre la técnica.' },
    ]),
  () =>
    multiple('Calibración lenta', 'La calibración del paralaje pide girar la cabeza lento mirando un punto fijo porque:', [
      { texto: 'a baja velocidad el reflejo es prácticamente perfecto y la mirada queda constante', ok: true, porque: 'Entonces todo lo que se mueve el iris en la imagen es paralaje, y su pendiente es k.' },
      { texto: 'la cámara no alcanza a seguir un giro rápido', porque: 'No es por la cámara: es por lo que se asume del reflejo.' },
      { texto: 'así se miden las sacadas', porque: 'En la calibración no se buscan sacadas.' },
    ]),
  () =>
    multiple('Sacadas encubiertas agrupadas', 'En un lado, la ganancia de área da 0,95 pero en todos los impulsos aparece una sacada encubierta, siempre a la misma latencia. Lo más probable es:', [
      { texto: 'un déficit compensado: el cerebro aprendió a corregir durante el giro', ok: true, porque: 'La sacada entra en la ventana e infla la ganancia; que salgan agrupadas es signo de compensación.' },
      { texto: 'un reflejo normal', porque: 'Un reflejo normal no necesita sacadas correctivas.' },
      { texto: 'un error de la cámara', porque: 'Un error de seguimiento no aparece a la misma latencia en todos los impulsos.' },
    ]),
  () =>
    multiple('Pulso muy lento', 'Un pulso sale rechazado como MUY LENTO. Lo que corresponde es:', [
      { texto: 'repetir con un impulso más rápido', ok: true, porque: 'El pico de la cabeza no llegó al mínimo aceptado.' },
      { texto: 'bajar el pico mínimo hasta que se acepte', porque: 'Aflojar el criterio acepta un impulso que no estimula bien el canal.' },
      { texto: 'calibrar de nuevo', porque: 'La calibración no cambia la velocidad del impulso.' },
    ]),
  () =>
    `::${escapa('Ganancia de área')}::${escapa(
      'En un impulso la cabeza gira 20° y la mirada, en el espacio, se desplaza 6° en el mismo sentido que la cabeza. ¿Cuál es la ganancia de área (1 − Δmirada/Δcabeza)?',
    )} {#0.7:0.01}`,
  () =>
    `::${escapa('Desacadizar')}::${escapa(
      'La ganancia que reporta trainHIT separa las sacadas del reflejo antes de calcularse.',
    )} {FALSE#${escapa('No desacadiza: por eso se marcan las sacadas y se muestra una ganancia hasta la sacada solo para comparar.')}}`,
  () =>
    `::${escapa('Métodos de ganancia')}::${escapa('Emparejá cada método de cálculo de la ganancia con lo que mide.')} {\n` +
    [
      ['Área', 'cuánto giró el ojo sobre cuánto giró la cabeza en todo el impulso'],
      ['Instantánea a 60 ms', 'el cociente de velocidades en un solo instante'],
      ['Cociente de picos', 'el máximo del ojo sobre el máximo de la cabeza'],
    ]
      .map(([a, b]) => `  =${escapa(a)} -> ${escapa(b)}`)
      .join('\n') +
    '\n}',
];

/** El archivo entero: categoría, casos y conceptos, separados por una línea vacía. */
export function textoGift() {
  return [
    '// Preguntas de trainHIT (vHIT didáctico). Importar en Moodle: Banco de preguntas > Importar > formato GIFT.',
    '// Los números de los casos los calculó el motor al exportar.',
    '$CATEGORY: trainHIT',
    ...preguntasDeCasos(),
    ...CONCEPTOS.map((f) => f()),
  ].join('\n\n') + '\n';
}
