// Idioma de la interfaz.
//
// El español es la fuente: está escrito en index.html y en el código, y es lo
// que se ve si falta una traducción. Los otros idiomas son diccionarios
// aparte (idioma-en.js) con dos tablas:
//
//   HTML   clave -> HTML traducido, para lo que está escrito en index.html.
//          El elemento lleva `data-i18n="clave"` (su contenido) o
//          `data-i18n-title`, `-aria-label`, `-alt`, `-placeholder` (ese
//          atributo). El texto en español queda en el HTML: la página se lee
//          igual sin JS y sin diccionario.
//   TEXTO  texto en español -> traducción, para lo que arma el código:
//          `tx('pulso #{id} descartado', { id })`. La clave es la frase misma,
//          como en gettext, así el código se sigue leyendo en español. Los
//          `{nombre}` se reemplazan por `vars`.
//
// test/idioma.test.mjs revisa que cada `tx('…')` del código y cada clave de
// index.html tengan su traducción: una frase que se cambia en español y no en
// el diccionario aparece ahí, no en el aula.
//
// El cambio es en vivo: `ponIdioma` retraduce la página y avisa a quien se
// anotó con `alCambiarIdioma` para que vuelva a pintar lo que arma el código.
// Recargar habría tirado la sesión medida.
//
// Sin DOM al importarlo: los módulos del motor lo usan y los tests corren en
// node, donde el idioma es siempre el español.

import * as en from './idioma-en.js';

export const IDIOMAS = { es: 'Español', en: 'English' };

const DICCIONARIOS = { en };

const LS_IDIOMA = 'trainhit.idioma';

/** Atributos que se pueden traducir con `data-i18n-<atributo>`. */
const ATRIBUTOS = ['title', 'aria-label', 'alt', 'placeholder'];

let actual = 'es';
const oyentes = [];
/** El español de cada elemento traducido, para poder volver sin recargar. */
const originales = new WeakMap();

export function idioma() {
  return actual;
}

/**
 * Traduce una frase del código. Sin traducción devuelve el español: una
 * frase nueva se ve en español hasta que se la traduce, no rompe nada.
 */
export function tx(texto, vars) {
  const tr = actual === 'es' ? texto : (DICCIONARIOS[actual]?.TEXTO[texto] ?? texto);
  if (!vars) return tr;
  return tr.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/**
 * El idioma con que arranca: el `?lang=` de la dirección —un enlace armado
 * para un curso manda—, si no el elegido antes en este navegador, si no el
 * primero de los del navegador que haya.
 */
export function idiomaInicial() {
  const valido = (l) => (l && l in IDIOMAS ? l : null);
  let guardado = null;
  try {
    guardado = localStorage.getItem(LS_IDIOMA);
  } catch {
    /* sin almacenamiento: se elige de nuevo en cada carga */
  }
  const url = new URLSearchParams(location.search).get('lang');
  const nav = (navigator.languages ?? [navigator.language]).map((l) => valido(l?.slice(0, 2)));
  return valido(url) ?? valido(guardado) ?? nav.find(Boolean) ?? 'es';
}

export function ponIdioma(l, { guarda = true } = {}) {
  if (!(l in IDIOMAS)) return;
  actual = l;
  if (guarda) {
    try {
      localStorage.setItem(LS_IDIOMA, l);
    } catch {
      /* sin almacenamiento */
    }
  }
  document.documentElement.lang = l;
  traducePagina();
  for (const f of oyentes) f(l);
}

export function alCambiarIdioma(f) {
  oyentes.push(f);
}

/** Pasa al idioma actual todo lo marcado con `data-i18n` debajo de `raiz`. */
export function traducePagina(raiz = document) {
  const dic = DICCIONARIOS[actual]?.HTML;
  for (const el of raiz.querySelectorAll('[data-i18n]')) {
    if (!originales.has(el)) originales.set(el, { html: el.innerHTML });
    const orig = originales.get(el);
    el.innerHTML = dic?.[el.dataset.i18n] ?? orig.html;
  }
  for (const atr of ATRIBUTOS) {
    for (const el of raiz.querySelectorAll(`[data-i18n-${atr}]`)) {
      if (!originales.has(el)) originales.set(el, {});
      const orig = originales.get(el);
      orig[atr] ??= el.getAttribute(atr) ?? '';
      el.setAttribute(atr, dic?.[el.getAttribute(`data-i18n-${atr}`)] ?? orig[atr]);
    }
  }
}
