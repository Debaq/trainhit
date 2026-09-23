// Tutorial: el menú «Aprender a usar» y los paseos de tutorial-pasos.js.
//
// El menú lista los paseos; cada paseo es una serie corta de pasos sobre un
// tema, y al terminarlo se vuelve al menú con el paseo marcado como visto.
//
// Un paso SIN objetivo es una tarjeta al centro con el fondo tapado: es
// para leer. Un paso CON objetivo ilumina esa parte de la pantalla y deja la
// página usable: los paseos se hacen midiendo de verdad, así que lo que se
// señala tiene que poder apretarse. Por eso el foco y el contenedor no
// capturan el puntero y solo la tarjeta lo hace.
//
// Un paso puede esperar algo —la cara, la calibración, pulsos—. La espera
// nunca traba: el botón dice «Saltar» hasta que se cumple, y ahí pasa a
// «Siguiente». Quien ya sabe calibrar no tiene por qué hacerlo para ver el
// resto.

import { ACCIONES, CONDICIONES, PASEOS, RESPUESTAS, tutorialEn } from './tutorial-pasos.js';
import { alCambiarIdioma, idioma, tx } from './idioma.js';

/**
 * Los paseos con los textos del idioma de ahora: se piden al pintar, no al
 * cargar. Guardados por idioma, porque la espera los mira cuatro veces por
 * segundo.
 */
const porIdioma = {};
const textos = () => (porIdioma[idioma()] ??= tutorialEn(idioma()));

/** Cada cuánto se mira la condición del paso y se reubica la tarjeta. */
const TIC_MS = 250;
/** Aire entre el objetivo y el borde iluminado. */
const MARGEN_FOCO = 6;
/** Separación entre el objetivo y la tarjeta, y de la tarjeta al borde. */
const HUECO = 12;
/** Por debajo de este ancho la tarjeta va pegada arriba o abajo, a lo ancho. */
const ANCHO_ANGOSTO = 640;
/** Paseos terminados en este navegador. Es solo una comodidad: puede faltar. */
const LS_VISTOS = 'trainhit.tutorial.vistos';

const $ = (id) => document.getElementById(id);

function leeVistos() {
  try {
    return new Set(JSON.parse(localStorage.getItem(LS_VISTOS) ?? '[]'));
  } catch {
    return new Set();
  }
}
function anotaVisto(id) {
  const v = leeVistos();
  v.add(id);
  try {
    localStorage.setItem(LS_VISTOS, JSON.stringify([...v]));
  } catch {
    /* sin almacenamiento: el ✓ no se recuerda, y nada más */
  }
}

/**
 * @param {object} p
 * @param {Record<string, (desde: object) => boolean>} p.condiciones  una por
 *   clave de CONDICIONES. Reciben la instantánea del estado tomada al entrar
 *   al paso, para las que piden que algo pase DURANTE el paso.
 * @param {Record<string, () => void>} p.acciones  una por nombre de ACCIONES
 * @param {() => object} [p.instantanea]  lo que las condiciones comparan
 * @param {Record<string, () => ({correcta:string, explica:string, pista:string}|null)>} [p.respuestas]
 *   una por clave de RESPUESTAS: las preguntas cuya respuesta sale del estado
 */
export function montaTutorial({ condiciones, acciones, instantanea = () => ({}), respuestas = {} }) {
  for (const k of Object.keys(CONDICIONES)) if (!condiciones[k]) throw new Error(`tutorial: falta la condición ${k}`);
  for (const k of ACCIONES) if (!acciones[k]) throw new Error(`tutorial: falta la acción ${k}`);
  for (const k of RESPUESTAS) if (!respuestas[k]) throw new Error(`tutorial: falta la respuesta ${k}`);

  const raiz = $('tutorial');
  const foco = raiz.querySelector('.tuto-foco');
  const tarjeta = raiz.querySelector('.tuto-tarjeta');
  const arriba = raiz.querySelector('.tuto-arriba');
  const nombrePaseo = raiz.querySelector('.tuto-paseo');
  const titulo = $('tuto-titulo');
  const fig = raiz.querySelector('.tuto-fig');
  const cuerpo = raiz.querySelector('.tuto-cuerpo');
  const lista = raiz.querySelector('.tuto-paseos');
  const espera = raiz.querySelector('.tuto-espera');
  const cuenta = raiz.querySelector('.tuto-cuenta');
  const bAnterior = $('tuto-anterior');
  const bSiguiente = $('tuto-siguiente');

  /**
   * El paseo en curso, o null en el menú. Es el de PASEOS, en español: los
   * textos de cada paso se buscan por id al pintar (`enIdioma`), así que
   * cambiar de idioma a mitad de un paseo no lo interrumpe.
   */
  let paseo = null;
  let i = 0;
  let tic = null;
  let volverA = null;
  /**
   * El estado al entrar al paso. Sin esto «esperando que se apriete
   * Recalcular» se daba por cumplido con un Recalcular de otro paseo, de
   * hace diez minutos.
   */
  let desde = {};

  // Los botones del cuerpo de un paso (`data-accion`) disparan acciones; el
  // `data-arg`, si hay, va de argumento (la letra del caso).
  cuerpo.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]');
    if (b && ACCIONES.includes(b.dataset.accion)) acciones[b.dataset.accion](b.dataset.arg);
  });

  /**
   * Deja el paseo en curso. Un paseo puede pedir deshacer algo al irse
   * (`alSalir`): el k a mano en 0 de «Herramientas por dentro» no puede
   * seguir puesto cuando se mide de verdad o se mira otro paseo.
   */
  function dejaPaseo() {
    if (paseo?.alSalir) acciones[paseo.alSalir]();
    paseo = null;
  }

  /** El paseo en curso con los textos del idioma de ahora. */
  const enIdioma = () => textos().PASEOS.find((p) => p.id === paseo.id);

  function menu() {
    dejaPaseo();
    const { PASEOS: paseos, PORTADA } = textos();
    raiz.dataset.modo = 'modal';
    tarjeta.setAttribute('aria-modal', 'true');
    tarjeta.classList.add('menu');
    arriba.hidden = true;
    // En el menú la barra de abajo queda solo con «Salir».
    bAnterior.hidden = true;
    bSiguiente.hidden = true;
    cuenta.textContent = '';
    espera.hidden = true;
    titulo.textContent = tx('Aprender a usar trainHIT');
    pintaFigura(fig, PORTADA);
    cuerpo.innerHTML = `<p>${tx(
      'Paseos cortos, cada uno sobre un tema. Se hacen en cualquier orden; si es la primera vez, de arriba hacia abajo.',
    )}</p>`;
    const vistos = leeVistos();
    lista.innerHTML = '';
    paseos.forEach((p, n) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<b></b><span></span><i></i>';
      b.querySelector('b').textContent = p.titulo;
      b.querySelector('span').textContent = p.resumen;
      b.querySelector('i').textContent = vistos.has(p.id)
        ? tx('✓ visto · {n} pasos', { n: p.pasos.length })
        : tx('{n} pasos', { n: p.pasos.length });
      if (vistos.has(p.id)) b.classList.add('visto');
      b.addEventListener('click', () => empieza(PASEOS[n]));
      li.appendChild(b);
      lista.appendChild(li);
    });
    lista.hidden = false;
    ubica(null);
    tarjeta.scrollTop = 0;
    // El primero sin ver: el que sigue en el orden sugerido.
    const siguiente = PASEOS.findIndex((p) => !vistos.has(p.id));
    lista.children[Math.max(0, siguiente)]?.querySelector('button').focus({ preventScroll: true });
  }

  function empieza(p) {
    if (paseo !== p) dejaPaseo();
    paseo = p;
    muestra(0);
  }

  /**
   * Pinta el paso `n`. Con `entra` falso solo lo vuelve a escribir —al cambiar
   * de idioma—, sin correr su acción de entrada ni reiniciar lo que espera.
   */
  function muestra(n, { entra = true } = {}) {
    i = Math.max(0, Math.min(paseo.pasos.length - 1, n));
    const p = enIdioma().pasos[i];
    if (entra) {
      if (p.antes) acciones[p.antes]();
      desde = instantanea();
    }

    raiz.dataset.modo = p.objetivo ? 'guia' : 'modal';
    tarjeta.setAttribute('aria-modal', p.objetivo ? 'false' : 'true');
    tarjeta.classList.remove('menu');
    arriba.hidden = false;
    bAnterior.hidden = false;
    bSiguiente.hidden = false;
    lista.hidden = true;
    nombrePaseo.textContent = enIdioma().titulo;
    titulo.textContent = p.titulo;
    cuerpo.innerHTML = p.cuerpo;
    if (p.pregunta) pintaPregunta(cuerpo, p.pregunta, respuestas, textos().PATRONES);
    pintaFigura(fig, p);
    cuenta.textContent = `${i + 1} / ${paseo.pasos.length}`;
    bAnterior.disabled = i === 0;

    // El scroll de la tarjeta vuelve arriba: si no, el paso nuevo arranca por
    // la mitad cuando el anterior era largo.
    tarjeta.scrollTop = 0;
    if (!entra) return actualiza();
    objetivo(p)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    actualiza();
    bSiguiente.focus({ preventScroll: true });
  }

  function termina() {
    anotaVisto(paseo.id);
    menu();
  }

  /** El elemento a iluminar, si existe y se ve en este diseño. */
  function objetivo(p) {
    if (!p?.objetivo) return null;
    const el = document.querySelector(p.objetivo);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    // En el teléfono apaisado las lecturas y la lista se recogen: el paso se
    // muestra igual, con la tarjeta al centro y sin foco.
    return r.width > 0 && r.height > 0 ? el : null;
  }

  /** Estado de la espera y posición: corre en cada tic. */
  function actualiza() {
    if (!paseo) return;
    const p = paseo.pasos[i];
    const ultimo = i === paseo.pasos.length - 1;
    const cumplida = !p.espera || condiciones[p.espera](desde);
    espera.hidden = !p.espera;
    if (p.espera) {
      espera.textContent = cumplida ? tx('listo ✓') : textos().CONDICIONES[p.espera];
      espera.classList.toggle('ok', cumplida);
    }
    bSiguiente.textContent = ultimo ? tx('Terminar') : cumplida ? tx('Siguiente') : tx('Saltar');
    bSiguiente.classList.toggle('primario', cumplida);
    ubica(objetivo(p), p.lugar);
  }

  function ubica(el, lugar) {
    if (!el) {
      foco.hidden = true;
      tarjeta.classList.remove('flota');
      for (const k of ['left', 'top', 'width']) tarjeta.style[k] = '';
      return;
    }
    const r = el.getBoundingClientRect();
    foco.hidden = false;
    foco.style.left = `${r.left - MARGEN_FOCO}px`;
    foco.style.top = `${r.top - MARGEN_FOCO}px`;
    foco.style.width = `${r.width + 2 * MARGEN_FOCO}px`;
    foco.style.height = `${r.height + 2 * MARGEN_FOCO}px`;

    tarjeta.classList.add('flota');
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const angosto = vw < ANCHO_ANGOSTO;
    const ancho = angosto ? vw - 2 * HUECO : Math.min(380, vw - 2 * HUECO);
    tarjeta.style.width = `${ancho}px`;
    const alto = tarjeta.offsetHeight;

    let x;
    let y;
    if (angosto) {
      // A lo ancho, del lado contrario al objetivo, para no taparlo.
      x = HUECO;
      y = r.top + r.height / 2 > vh / 2 ? HUECO : vh - alto - HUECO;
    } else {
      const m = MARGEN_FOCO + HUECO;
      const opciones = {
        abajo: { cabe: vh - r.bottom - m >= alto + HUECO, x: r.left, y: r.bottom + m },
        arriba: { cabe: r.top - m >= alto + HUECO, x: r.left, y: r.top - m - alto },
        derecha: { cabe: vw - r.right - m >= ancho + HUECO, x: r.right + m, y: r.top },
        izquierda: { cabe: r.left - m >= ancho + HUECO, x: r.left - m - ancho, y: r.top },
      };
      const orden = [lugar, 'abajo', 'arriba', 'derecha', 'izquierda'].filter(Boolean);
      const elegido = orden.map((k) => opciones[k]).find((o) => o.cabe);
      if (elegido) ({ x, y } = elegido);
      else {
        // El objetivo ocupa casi toda la pantalla (los paneles en un portátil):
        // la tarjeta va en la esquina de abajo, encima.
        x = vw - ancho - HUECO;
        y = vh - alto - HUECO;
      }
    }
    tarjeta.style.left = `${Math.max(HUECO, Math.min(x, vw - ancho - HUECO))}px`;
    tarjeta.style.top = `${Math.max(HUECO, Math.min(y, vh - alto - HUECO))}px`;
  }

  /** Abre el menú, o directo un paseo por su id. */
  function abre(idPaseo) {
    volverA = document.activeElement;
    raiz.hidden = false;
    clearInterval(tic);
    tic = setInterval(actualiza, TIC_MS);
    const p = PASEOS.find((x) => x.id === idPaseo);
    if (p) empieza(p);
    else menu();
  }

  function cierra() {
    dejaPaseo();
    raiz.hidden = true;
    clearInterval(tic);
    tic = null;
    if (volverA?.isConnected) volverA.focus({ preventScroll: true });
  }

  bAnterior.addEventListener('click', () => muestra(i - 1));
  bSiguiente.addEventListener('click', () => (i === paseo.pasos.length - 1 ? termina() : muestra(i + 1)));
  $('tuto-menu').addEventListener('click', menu);
  $('tuto-salir').addEventListener('click', cierra);
  raiz.querySelector('.tuto-fondo').addEventListener('click', cierra);
  window.addEventListener('resize', () => !raiz.hidden && actualiza());
  // El scroll de la página mueve el objetivo; `capture` agarra también el de
  // los contenedores con scroll propio (el cajón, las listas).
  document.addEventListener('scroll', () => !raiz.hidden && actualiza(), { capture: true, passive: true });
  // Abierto, se reescribe en el idioma nuevo sin moverse del paso. Una
  // pregunta ya contestada vuelve sin contestar: es la misma pregunta.
  alCambiarIdioma(() => {
    if (raiz.hidden) return;
    if (paseo) muestra(i, { entra: false });
    else menu();
  });

  document.addEventListener('keydown', (e) => {
    if (raiz.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      cierra();
      return;
    }
    // Las flechas solo en las tarjetas de leer. En el recorrido el teclado es
    // de la página: C calibra, Espacio pausa, y las flechas mueven perillas.
    if (!paseo || raiz.dataset.modo !== 'modal') return;
    if (e.key === 'ArrowRight' && i < paseo.pasos.length - 1) muestra(i + 1);
    else if (e.key === 'ArrowLeft') muestra(i - 1);
  });

  return { abre, cierra, abierto: () => !raiz.hidden, bloqueaAtajos: () => !raiz.hidden && raiz.dataset.modo === 'modal' };
}

/**
 * Una pregunta de opción múltiple: las opciones son los PATRONES y la
 * respuesta no se ve hasta elegir. Equivocarse no cierra nada: dice dónde
 * mirar (`pista`) y se puede volver a intentar. Acertar da la explicación.
 *
 * Contestar antes de que se cuente es el punto: leer un gráfico sabiendo lo
 * que tiene que mostrar no es leerlo.
 */
function pintaPregunta(cuerpo, q, respuestas, PATRONES) {
  const caja = document.createElement('div');
  caja.className = 'tuto-pregunta';
  const lista = document.createElement('div');
  lista.className = 'opciones';
  lista.setAttribute('role', 'group');
  lista.setAttribute('aria-label', tx('respuestas'));
  const devolucion = document.createElement('p');
  devolucion.className = 'tuto-respuesta';
  devolucion.setAttribute('aria-live', 'polite');
  devolucion.hidden = true;
  for (const [id, texto] of Object.entries(PATRONES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = texto;
    b.addEventListener('click', () => {
      // Una pregunta `dinamica` se resuelve al contestar: el perfil pudo
      // cambiar desde que se abrió el paso.
      const r = q.dinamica ? respuestas[q.dinamica]() : q;
      devolucion.hidden = false;
      if (!r) {
        devolucion.className = 'tuto-respuesta no';
        devolucion.textContent = q.sinRespuesta;
        return;
      }
      const ok = id === r.correcta;
      b.classList.add(ok ? 'bien' : 'mal');
      devolucion.className = `tuto-respuesta ${ok ? 'ok' : 'no'}`;
      devolucion.innerHTML = ok ? `<b>${tx('Sí.')}</b> ${r.explica}` : `<b>${tx('No.')}</b> ${r.pista}`;
      if (ok) for (const o of lista.children) o.disabled = true;
    });
    lista.appendChild(b);
  }
  caja.append(lista, devolucion);
  cuerpo.appendChild(caja);
}

/**
 * La imagen del paso, o un recuadro con su nombre si todavía no existe: el
 * tutorial funciona antes de que estén las imágenes y se ve cuál falta.
 */
function pintaFigura(fig, p) {
  fig.innerHTML = '';
  fig.hidden = !p.img;
  if (!p.img) return;
  const img = document.createElement('img');
  img.alt = p.alt ?? '';
  img.decoding = 'async';
  img.addEventListener('error', () => {
    const falta = document.createElement('div');
    falta.className = 'tuto-falta';
    falta.innerHTML = '<b></b><span></span>';
    falta.querySelector('b').textContent = tx('imagen pendiente · {img}', { img: p.img });
    falta.querySelector('span').textContent = p.alt ?? '';
    img.replaceWith(falta);
  });
  img.src = `img/tutorial/${p.img}`;
  fig.appendChild(img);
}
