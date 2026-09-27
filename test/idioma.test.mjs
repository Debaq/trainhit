// El diccionario inglés tiene que acompañar al español: cada frase que el
// código pasa a `tx()` o a `marcaEstado()`, cada clave `data-i18n` de
// index.html y cada tabla de textos de los módulos del motor. Una frase que se
// cambia en español y no en idioma-en.js aparece acá, no en el aula.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { HTML, TEXTO } from '../js/idioma-en.js';
import { tx } from '../js/idioma.js';
import { RECHAZO_TEXT } from '../js/analysis.js';
import { CALIB_ISSUE_TEXT } from '../js/geom.js';
import { METODOS_GANANCIA } from '../js/plots.js';
import { PERFILES } from '../js/simulacion.js';
import { CONDICIONES, PASEOS, PATRONES, PORTADA } from '../js/tutorial-pasos.js';
import * as tutoEn from '../js/tutorial-pasos-en.js';

const raiz = new URL('../', import.meta.url);
const lee = (ruta) => readFileSync(new URL(ruta, raiz), 'utf8');

/** Saca los comentarios de línea entera y los bloques: ahí hay ejemplos, no frases. */
function sinComentarios(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Los literales con comillas simples del PRIMER argumento de cada llamada a
 * `nombre(`. Recorre carácter a carácter para respetar paréntesis anidados y
 * ternarios: `marcaEstado(caso ? 'a {n}' : 'b', { n })` da 'a {n}' y 'b'.
 */
function literales(src, nombre) {
  const out = [];
  const re = new RegExp(`\\b${nombre}\\(`, 'g');
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    let prof = 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "'") {
        let j = i + 1;
        let s = '';
        for (; src[j] !== "'"; j++) s += src[j] === '\\' ? src[++j] : src[j];
        out.push(s);
        i = j;
      } else if (c === '`') {
        i = src.indexOf('`', i + 1);
      } else if ('([{'.includes(c)) prof++;
      else if (')]}'.includes(c)) {
        if (prof === 0) break;
        prof--;
      } else if (c === ',' && prof === 0) break;
    }
  }
  return out;
}

const fuentes = readdirSync(new URL('js/', raiz))
  .filter((f) => f.endsWith('.js') && !f.startsWith('idioma'))
  .map((f) => [f, sinComentarios(lee(`js/${f}`))]);

const delCodigo = new Set(fuentes.flatMap(([, src]) => [...literales(src, 'tx'), ...literales(src, 'marcaEstado')]));

const tablas = new Set([
  ...Object.values(RECHAZO_TEXT),
  ...Object.values(CALIB_ISSUE_TEXT),
  ...Object.values(METODOS_GANANCIA).map((m) => m.nombre),
  ...Object.values(PERFILES).flatMap((p) => [p.nombre, p.descripcion]),
]);

const html = lee('index.html');
const clavesHtml = new Set([...html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)].map((m) => m[1]));

const huecos = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('cada frase del código tiene su traducción', () => {
  const faltan = [...delCodigo].filter((f) => !(f in TEXTO));
  assert.deepEqual(faltan, [], 'agregarlas a TEXTO en js/idioma-en.js');
});

test('cada texto de las tablas del motor tiene su traducción', () => {
  const faltan = [...tablas].filter((f) => !(f in TEXTO));
  assert.deepEqual(faltan, []);
});

test('cada clave data-i18n de index.html tiene su traducción', () => {
  const faltan = [...clavesHtml].filter((k) => !(k in HTML));
  assert.deepEqual(faltan, [], 'agregarlas a HTML en js/idioma-en.js');
});

test('no sobran traducciones', () => {
  // Lo que sobra es casi siempre una frase que cambió en español: su
  // traducción vieja ya no la usa nadie y la nueva sale sin traducir.
  const sobranTexto = Object.keys(TEXTO).filter((k) => !delCodigo.has(k) && !tablas.has(k));
  const sobranHtml = Object.keys(HTML).filter((k) => !clavesHtml.has(k));
  assert.deepEqual(sobranTexto, []);
  assert.deepEqual(sobranHtml, []);
});

test('las traducciones conservan los {huecos}', () => {
  for (const [es, en] of Object.entries(TEXTO)) assert.deepEqual(huecos(en), huecos(es), es);
});

test('los motivos de rechazo conservan el « —» que corta la parte corta', () => {
  for (const es of Object.values(RECHAZO_TEXT)) assert.equal(TEXTO[es].includes(' —'), es.includes(' —'), es);
});

test('tx: en node es español, y reemplaza los huecos', () => {
  assert.equal(tx('pulso #{id} de vuelta', { id: 7 }), 'pulso #7 de vuelta');
  assert.equal(tx('frase que no está en ningún lado'), 'frase que no está en ningún lado');
  assert.equal(tx('{a} y {b}', { a: 1 }), '1 y {b}');
});

// ── tutorial: la capa inglesa sobre los paseos (tutorial-pasos-en.js) ──

const claves = (o) => Object.keys(o).sort();
/** Los botones de un cuerpo, con su argumento: tienen que ser los mismos en los dos idiomas. */
const botones = (html) => [...html.matchAll(/data-accion="([^"]+)"(?:\s+data-arg="([^"]+)")?/g)].map((m) => `${m[1]}(${m[2] ?? ''})`);

test('el tutorial en inglés tiene los mismos paseos y pasos, ni más ni menos', () => {
  assert.deepEqual(claves(tutoEn.PASEOS), claves(Object.fromEntries(PASEOS.map((p) => [p.id]))));
  for (const p of PASEOS) {
    const t = tutoEn.PASEOS[p.id];
    assert.ok(t.titulo && t.resumen, p.id);
    assert.deepEqual(claves(t.pasos), p.pasos.map((x) => x.id).sort(), p.id);
  }
  assert.deepEqual(claves(tutoEn.PATRONES), claves(PATRONES));
  assert.deepEqual(claves(tutoEn.CONDICIONES), claves(CONDICIONES));
  assert.ok(tutoEn.PORTADA.alt && PORTADA.alt);
});

test('cada paso en inglés trae lo mismo que en español', () => {
  for (const p of PASEOS) {
    for (const x of p.pasos) {
      const t = tutoEn.PASEOS[p.id].pasos[x.id];
      const donde = `${p.id}/${x.id}`;
      assert.ok(t.titulo && t.cuerpo, donde);
      assert.equal(Boolean(t.alt), Boolean(x.alt), `${donde}: alt`);
      assert.deepEqual(botones(t.cuerpo), botones(x.cuerpo), `${donde}: botones del cuerpo`);
      for (const k of ['explica', 'pista', 'sinRespuesta']) {
        assert.equal(Boolean(t.pregunta?.[k]), Boolean(x.pregunta?.[k]), `${donde}: pregunta.${k}`);
      }
      // Solo textos: la estructura la manda el español.
      assert.deepEqual(Object.keys(t).filter((k) => !['titulo', 'cuerpo', 'alt', 'img', 'pregunta'].includes(k)), [], donde);
      if (t.img) assert.ok(existsSync(new URL(`img/tutorial/${t.img}`, raiz)), `${donde}: falta ${t.img}`);
    }
  }
});

