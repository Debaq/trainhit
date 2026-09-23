// El archivo GIFT tiene que importarse en Moodle sin errores: un `=` o una
// llave sin escapar en un enunciado rompe la pregunta entera, y el error
// aparece recién cuando el docente lo sube.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeCaso, escapa, textoGift } from '../js/preguntas.js';
import { CASOS } from '../js/ejemplo.js';

/** Las preguntas, sin comentarios ni la categoría. */
const preguntas = () =>
  textoGift()
    .split(/\n\n+/)
    .filter((b) => b.trim() && !b.startsWith('//') && !b.startsWith('$CATEGORY'));

/** Parte una pregunta en enunciado y respuestas por la llave sin escapar. */
function partes(q) {
  const abre = q.search(/(?<!\\)\{/);
  const cierra = q.search(/(?<!\\)\}\s*$/);
  return { enunciado: q.slice(0, abre), respuestas: q.slice(abre + 1, cierra) };
}

test('escapa los caracteres que GIFT usa como sintaxis', () => {
  assert.equal(escapa('a=b ~c #d {e} f:g'), 'a\\=b \\~c \\#d \\{e\\} f\\:g');
});

test('cada pregunta tiene título, un solo bloque de respuestas y el enunciado limpio', () => {
  const qs = preguntas();
  assert.ok(qs.length >= Object.keys(CASOS).length + 8, `${qs.length} preguntas`);
  for (const q of qs) {
    assert.match(q, /^::[^\n]+?(?<!\\)::/, q.slice(0, 60));
    const llaves = q.match(/(?<!\\)[{}]/g) ?? [];
    assert.deepEqual(llaves, ['{', '}'], q.slice(0, 60));
    const { enunciado } = partes(q);
    // En el enunciado no puede quedar sintaxis suelta (el `::` del título sí).
    assert.doesNotMatch(enunciado.replace(/^::.*?(?<!\\)::/, ''), /(?<!\\)[=~#]/, q.slice(0, 60));
  }
});

test('las de opción múltiple tienen exactamente una correcta', () => {
  for (const q of preguntas()) {
    const { respuestas } = partes(q);
    if (/^\s*(TRUE|FALSE|T|F)\b/.test(respuestas) || respuestas.startsWith('#') || respuestas.includes('->')) continue;
    const correctas = respuestas.split('\n').filter((l) => /^\s*=/.test(l));
    assert.equal(correctas.length, 1, q.slice(0, 60));
  }
});

test('los enunciados de los casos llevan los números del motor', () => {
  // El caso D es el del falso negativo: el enunciado tiene que mostrar la
  // media izquierda normal y las sacadas encubiertas, que es lo que se pregunta.
  const d = describeCaso('D');
  assert.match(d, /Izquierda: ganancia 1,0\d/);
  assert.match(d, /Izquierda[^.]*sacadas encubiertas en 5/);
  assert.match(describeCaso('E'), /rechazados \(/);
});
