// Preguntas de autoevaluación en formato GIFT, para importar en Moodle.
//
// Dos fuentes:
//   - los casos a ciegas (CASOS de ejemplo.js): el enunciado lleva los números
//     que el motor saca HOY de cada caso —medias, aceptados, asimetría,
//     sacadas—, así que si el motor cambia, las preguntas cambian con él;
//   - un banco fijo de conceptos (CONCEPTOS, abajo), sobre lo mismo que
//     enseñan los paseos.
//
// Sale en el idioma que se pida (el de la interfaz, al bajarlo). Cada idioma
// tiene su banco completo, con las mismas preguntas en el mismo orden y la
// misma respuesta correcta: test/preguntas.test.mjs lo comprueba.
//
// Sin DOM: app.js lo baja como archivo y test/preguntas.test.mjs lo revisa.

import { CASOS, K_EJEMPLO, crudoDeEjemplo } from './ejemplo.js';
import { procesaCrudo } from './pipeline.js';
import { CONFIG, RECHAZO_TEXT, asimetria, resumenLado } from './analysis.js';
import { EyeModel } from './geom.js';
import { tutorialEn } from './tutorial-pasos.js';
import { TEXTO as TEXTO_EN } from './idioma-en.js';

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

/** Lo que cambia por idioma en las preguntas de los casos. */
const CASO = {
  es: {
    num: (v, d = 2) => v.toFixed(d).replace('.', ','),
    lados: ['Derecha', 'Izquierda'],
    // El motivo tal como lo nombra el motor: 'cara-perdida', 'lento'…
    motivo: (r) => r,
    lado: ({ nombre, media, n, rech, motivos, enc, man }) =>
      `${nombre}: ganancia ${media ?? 'sin media'}, ${n} aceptados y ${rech} rechazados` +
      (motivos ? ` (${motivos})` : '') +
      `; sacadas encubiertas en ${enc} y manifiestas en ${man} de los aceptados.`,
    asim: (a) => `Asimetría: ${a ?? 'no calculable'}.`,
    titulo: (letra) => `trainHIT caso ${letra}`,
    enunciado: (desc) =>
      `Paciente sintético medido con trainHIT (vHIT lateral por webcam, la ganancia de área no desacadiza). ${desc} ¿Qué patrón muestra?`,
    cabecera: [
      '// Preguntas de trainHIT (vHIT didáctico). Importar en Moodle: Banco de preguntas > Importar > formato GIFT.',
      '// Los números de los casos los calculó el motor al exportar.',
    ],
  },
  en: {
    num: (v, d = 2) => v.toFixed(d),
    lados: ['Right', 'Left'],
    motivo: (r) => (TEXTO_EN[RECHAZO_TEXT[r]] ?? r).split(' —')[0].toLowerCase(),
    lado: ({ nombre, media, n, rech, motivos, enc, man }) =>
      `${nombre}: gain ${media ?? 'no mean'}, ${n} accepted and ${rech} rejected` +
      (motivos ? ` (${motivos})` : '') +
      `; covert saccades in ${enc} and overt in ${man} of the accepted.`,
    asim: (a) => `Asymmetry: ${a ?? 'not computable'}.`,
    titulo: (letra) => `trainHIT case ${letra}`,
    enunciado: (desc) =>
      `Synthetic patient measured with trainHIT (lateral vHIT by webcam, the area gain is not desaccaded). ${desc} Which pattern does it show?`,
    cabecera: [
      '// trainHIT questions (teaching vHIT). Import into Moodle: Question bank > Import > GIFT format.',
      '// The case numbers were computed by the engine at export time.',
    ],
  },
};

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
export function describeCaso(letra, idioma = 'es') {
  const L = CASO[idioma] ?? CASO.es;
  const ts = pulsosDeCaso(letra);
  const lado = (side, nombre) => {
    const r = resumenLado(ts, side);
    const del = ts.filter((t) => t.side === side);
    return L.lado({
      nombre,
      media: r.n ? (r.n > 1 ? `${L.num(r.media)} ± ${L.num(r.de)}` : L.num(r.media)) : null,
      n: r.n,
      rech: del.length - r.n,
      motivos: [...new Set(del.filter((t) => t.rejected).map((t) => L.motivo(t.rejected)))].join(', '),
      enc: del.filter((t) => !t.rejected && t.sacadas?.some((s) => s.tipo === 'encubierta')).length,
      man: del.filter((t) => !t.rejected && t.sacadas?.some((s) => s.tipo === 'manifiesta')).length,
    });
  };
  const der = resumenLado(ts, 'derecha');
  const izq = resumenLado(ts, 'izquierda');
  const a = asimetria(der.media, izq.media);
  return [lado('derecha', L.lados[0]), lado('izquierda', L.lados[1]), L.asim(a === null ? null : `${L.num(a, 0)} %`)].join(' ');
}

/** Una pregunta de opción múltiple con retroalimentación por opción. */
function multiple(titulo, enunciado, opciones) {
  const cuerpo = opciones
    .map((o) => `  ${o.ok ? '=' : '~'}${escapa(o.texto)}${o.porque ? `#${escapa(o.porque)}` : ''}`)
    .join('\n');
  return `::${escapa(titulo)}::${escapa(enunciado)} {\n${cuerpo}\n}`;
}

/** Las preguntas de los casos: una por caso, con las opciones de siempre. */
function preguntasDeCasos(idioma) {
  const L = CASO[idioma] ?? CASO.es;
  const { PASEOS, PATRONES } = tutorialEn(idioma);
  const pasos = PASEOS.flatMap((p) => p.pasos).filter((p) => p.pregunta?.caso);
  return pasos.map((p) => {
    const q = p.pregunta;
    return multiple(
      L.titulo(q.caso),
      L.enunciado(describeCaso(q.caso, idioma)),
      Object.entries(PATRONES).map(([id, texto]) => ({
        texto,
        ok: id === q.correcta,
        porque: id === q.correcta ? plano(q.explica) : plano(q.pista),
      })),
    );
  });
}

const numerica = (titulo, enunciado, respuesta) => `::${escapa(titulo)}::${escapa(enunciado)} {#${respuesta}}`;
const verdaderoFalso = (titulo, enunciado, v, porque) =>
  `::${escapa(titulo)}::${escapa(enunciado)} {${v ? 'TRUE' : 'FALSE'}#${escapa(porque)}}`;
const emparejar = (titulo, enunciado, pares) =>
  `::${escapa(titulo)}::${escapa(enunciado)} {\n` + pares.map(([a, b]) => `  =${escapa(a)} -> ${escapa(b)}`).join('\n') + '\n}';

/**
 * Banco de conceptos, uno por idioma: las mismas preguntas en el mismo orden,
 * con la misma respuesta correcta. El escape lo ponen `multiple` y compañía.
 */
const CONCEPTOS = {
  es: [
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
      numerica(
        'Ganancia de área',
        'En un impulso la cabeza gira 20° y la mirada, en el espacio, se desplaza 6° en el mismo sentido que la cabeza. ¿Cuál es la ganancia de área (1 − Δmirada/Δcabeza)?',
        '0.7:0.01',
      ),
    () =>
      verdaderoFalso(
        'Desacadizar',
        'La ganancia que reporta trainHIT separa las sacadas del reflejo antes de calcularse.',
        false,
        'No desacadiza: por eso se marcan las sacadas y se muestra una ganancia hasta la sacada solo para comparar.',
      ),
    () =>
      emparejar('Métodos de ganancia', 'Emparejá cada método de cálculo de la ganancia con lo que mide.', [
        ['Área', 'cuánto giró el ojo sobre cuánto giró la cabeza en todo el impulso'],
        ['Instantánea a 60 ms', 'el cociente de velocidades en un solo instante'],
        ['Cociente de picos', 'el máximo del ojo sobre el máximo de la cabeza'],
      ]),
  ],
  en: [
    () =>
      multiple('Uncalibrated gain', 'With k = 0 (uncorrected parallax), a normal vestibulo-ocular reflex reads with a gain of approximately:', [
        { texto: '1.9', ok: true, porque: 'The apparent shift of the iris when the head turns has the same magnitude as the signal and adds to it.' },
        { texto: '1.0', porque: 'That would be right with the parallax calibrated.' },
        { texto: '0.5', porque: 'Parallax does not subtract: it adds to the eye movement.' },
        { texto: '0.8', porque: '0.8 is the cutoff drawn, not the effect of parallax.' },
      ]),
    () =>
      multiple('Covert saccade', 'A covert corrective saccade is one that:', [
        { texto: 'starts while the head is still turning', ok: true, porque: 'That is why it cannot be seen with the naked eye: it happens during the impulse.' },
        { texto: 'happens after the head has stopped', porque: 'That is the overt one.' },
        { texto: 'goes in the same direction as the head', porque: 'Corrective saccades bring the gaze back to the target, against the drag.' },
        { texto: 'only appears in healthy subjects', porque: 'They appear when the reflex falls short.' },
      ]),
    () =>
      multiple('Bias from not desaccading', 'If the gain is computed without separating the covert saccades, in a patient with a deficit the measured gain:', [
        { texto: 'goes up, and the deficit can read normal', ok: true, porque: 'The saccade moves the eye toward the target inside the window and adds to the reflex: it is a bias toward the false negative.' },
        { texto: 'goes down, and the deficit is exaggerated', porque: 'The saccade compensates, it does not subtract.' },
        { texto: 'does not change', porque: 'The saccade falls inside the impulse window and enters the computation.' },
      ]),
    () =>
      multiple('Canal tested', 'A head impulse toward the patient’s right, in the horizontal plane, mainly tests:', [
        { texto: 'the right lateral semicircular canal', ok: true, porque: 'Each lateral canal is excited by the turn toward its own side.' },
        { texto: 'the left lateral semicircular canal', porque: 'That one is tested with the impulse to the left.' },
        { texto: 'the right posterior canal', porque: 'The vertical ones are tested with diagonal turns.' },
      ]),
    () =>
      multiple('Asymmetry', 'A gain asymmetry close to 0 % between the two sides indicates:', [
        { texto: 'that both sides are alike, whether normal or not', ok: true, porque: 'A bilateral vestibulopathy gives low asymmetry with both sides low.' },
        { texto: 'that the reflex is normal', porque: 'It compares the sides with each other, not against normal.' },
        { texto: 'that the test was done wrong', porque: 'It says nothing about the technique.' },
      ]),
    () =>
      multiple('Slow calibration', 'The parallax calibration asks to turn the head slowly while looking at a fixed point because:', [
        { texto: 'at low speed the reflex is practically perfect and the gaze stays constant', ok: true, porque: 'Then everything the iris moves in the image is parallax, and its slope is k.' },
        { texto: 'the camera cannot keep up with a fast turn', porque: 'It is not about the camera: it is about what is assumed of the reflex.' },
        { texto: 'that is how saccades are measured', porque: 'The calibration does not look for saccades.' },
      ]),
    () =>
      multiple('Clustered covert saccades', 'On one side, the area gain is 0.95 but a covert saccade appears in every impulse, always at the same latency. The most likely explanation is:', [
        { texto: 'a compensated deficit: the brain learned to correct during the turn', ok: true, porque: 'The saccade enters the window and inflates the gain; their clustering is a sign of compensation.' },
        { texto: 'a normal reflex', porque: 'A normal reflex does not need corrective saccades.' },
        { texto: 'a camera error', porque: 'A tracking error does not appear at the same latency in every impulse.' },
      ]),
    () =>
      multiple('Impulse too slow', 'An impulse is rejected as TOO SLOW. The right thing to do is:', [
        { texto: 'repeat with a faster impulse', ok: true, porque: 'The head peak did not reach the accepted minimum.' },
        { texto: 'lower the minimum peak until it is accepted', porque: 'Loosening the criterion accepts an impulse that does not stimulate the canal well.' },
        { texto: 'calibrate again', porque: 'Calibration does not change the speed of the impulse.' },
      ]),
    () =>
      numerica(
        'Area gain',
        'In an impulse the head turns 20° and the gaze, in space, shifts 6° in the same direction as the head. What is the area gain (1 − Δgaze/Δhead)?',
        '0.7:0.01',
      ),
    () =>
      verdaderoFalso(
        'Desaccading',
        'The gain that trainHIT reports separates the saccades from the reflex before being computed.',
        false,
        'It does not desaccade: that is why saccades are marked and a gain up to the saccade is shown only for comparison.',
      ),
    () =>
      emparejar('Gain methods', 'Match each gain computation method with what it measures.', [
        ['Area', 'how much the eye turned over how much the head turned during the whole impulse'],
        ['Instantaneous at 60 ms', 'the ratio of velocities at a single instant'],
        ['Ratio of peaks', 'the eye’s maximum over the head’s maximum'],
      ]),
  ],
};

/** Los idiomas en que se puede bajar el banco. */
export const IDIOMAS_GIFT = Object.keys(CONCEPTOS);

/** El archivo entero: categoría, casos y conceptos, separados por una línea vacía. */
export function textoGift(idioma = 'es') {
  if (!(idioma in CONCEPTOS)) idioma = 'es';
  return (
    [...CASO[idioma].cabecera, '$CATEGORY: trainHIT', ...preguntasDeCasos(idioma), ...CONCEPTOS[idioma].map((f) => f())].join('\n\n') +
    '\n'
  );
}
