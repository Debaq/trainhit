// Tema claro u oscuro.
//
// La paleta de los dos está en `css/estilo.css`, escrita una sola vez con
// `light-dark()`. Lo único que decide este módulo es qué `color-scheme` rige:
//
//   sistema  sin `data-theme`: el que pida el sistema operativo, y si el
//            sistema cambia (el modo noche que se prende solo), cambia la
//            página también.
//   claro    `data-theme="light"` en <html>.
//   oscuro   `data-theme="dark"`.
//
// La elección se guarda en el navegador. `arranque.js` la pone antes de que
// cargue la hoja de estilo: si esperara a este módulo, la página se vería un
// instante con el tema del sistema y después saltaría al elegido.
//
// El canvas no se entera solo: quien se anota con `alCambiarTema` vuelve a
// leer la paleta (`plots.leePaleta`) y redibuja.

export const TEMAS = ['sistema', 'claro', 'oscuro'];

/** Lo que va en `data-theme` para cada tema; el del sistema no lleva. */
const ATRIBUTO = { claro: 'light', oscuro: 'dark' };

/** La misma clave lee `arranque.js`: si se cambia acá, se cambia allá. */
const LS_TEMA = 'trainhit.tema';

const oyentes = [];

export function tema() {
  const t = document.documentElement.dataset.theme;
  return Object.keys(ATRIBUTO).find((k) => ATRIBUTO[k] === t) ?? 'sistema';
}

/** El que se ve de verdad: con `sistema`, el que pide el sistema. */
export function temaVisible() {
  const t = tema();
  if (t !== 'sistema') return t;
  return matchMedia('(prefers-color-scheme: light)').matches ? 'claro' : 'oscuro';
}

export function ponTema(t) {
  if (!TEMAS.includes(t)) return;
  const raiz = document.documentElement;
  if (ATRIBUTO[t]) raiz.dataset.theme = ATRIBUTO[t];
  else delete raiz.dataset.theme;
  try {
    if (t === 'sistema') localStorage.removeItem(LS_TEMA);
    else localStorage.setItem(LS_TEMA, t);
  } catch {
    /* sin almacenamiento: se elige de nuevo en cada carga */
  }
  avisa();
}

/** El que sigue en la vuelta sistema → claro → oscuro → sistema. */
export function siguienteTema() {
  return TEMAS[(TEMAS.indexOf(tema()) + 1) % TEMAS.length];
}

export function alCambiarTema(f) {
  oyentes.push(f);
}

function avisa() {
  for (const f of oyentes) f(tema());
}

// Con el tema del sistema, un cambio del sistema es un cambio de tema. Con uno
// elegido a mano no pasa nada visible, pero avisar igual no cuesta nada.
matchMedia('(prefers-color-scheme: light)').addEventListener('change', avisa);
