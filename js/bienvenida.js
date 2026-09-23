// Bienvenida y contador de «me gusta».
//
// El contador vive en Abacus (abacus.jasoncameron.dev): un contador público y
// anónimo, sin cuenta ni registro para nadie —ni para quien lo lee, ni para
// quien lo suma—. Se eligió así a propósito: las reacciones de GitHub obligan
// a tener cuenta de GitHub, y quien abre esto es alguien que está aprendiendo,
// no necesariamente alguien con cuenta en GitHub.
//
// Lo que se manda es una petición sin datos: no viaja ni el video, ni las
// mediciones, ni nada de la sesión. Aparte del modelo de MediaPipe es lo único
// que sale de la página: una lectura del número en cada carga y, solo si
// alguien aprieta el botón, el voto.

import { alCambiarIdioma, tx } from './idioma.js';

const BASE = 'https://abacus.jasoncameron.dev';
const ESPACIO = 'trainhit';
const CLAVE = 'megusta';

const LS_VISTA = 'trainhit.bienvenida.vista';
const LS_VOTO = 'trainhit.megusta';

/** localStorage puede tirar excepción (modo privado, cookies bloqueadas). */
function leeLS(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function escribeLS(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* sin almacenamiento: la página sigue funcionando igual */
  }
}

async function pide(ruta) {
  const r = await fetch(`${BASE}/${ruta}/${ESPACIO}/${CLAVE}`, { mode: 'cors' });
  // La clave se crea sola con el primer voto: hasta entonces `get` da 404, que
  // no es un error sino un cero.
  if (r.status === 404 && ruta === 'get') return 0;
  if (!r.ok) throw new Error(`contador: ${r.status}`);
  return (await r.json()).value;
}

export function montaBienvenida() {
  // La versión, a la vista: es la forma de saber si lo que está corriendo es lo
  // último publicado sin tener que abrir las herramientas del navegador.
  const v = document.documentElement.dataset.v || '—';
  for (const el of document.querySelectorAll('.v-app')) el.textContent = v;

  const modal = document.getElementById('bienvenida');
  const boton = document.getElementById('btn-megusta');
  const cuenta = document.getElementById('megusta-cuenta');
  const yaVoto = leeLS(LS_VOTO) === '1';

  const abrir = (v, { foco = true } = {}) => {
    modal.hidden = !v;
    if (v) document.getElementById('btn-tutorial').focus();
    else {
      escribeLS(LS_VISTA, '1');
      if (foco) document.getElementById('btn-ayuda').focus();
    }
  };

  document.getElementById('btn-empezar').addEventListener('click', () => abrir(false));
  document.getElementById('btn-ayuda').addEventListener('click', () => abrir(true));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) abrir(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) abrir(false);
  });

  // Solo la primera vez. Después queda a mano en el «?» de la barra.
  if (leeLS(LS_VISTA) !== '1') abrir(true);

  montaAcerca({ cierraBienvenida: () => abrir(false, { foco: false }) });

  if (yaVoto) marcaVotado(boton);
  // El title del botón lo pisa la traducción del HTML: votado, se vuelve a poner.
  alCambiarIdioma(() => leeLS(LS_VOTO) === '1' && marcaVotado(boton));
  // El número se lee al abrir —es la petición a Abacus que sale en cada
  // carga, y está dicho en el README—; si el contador no contesta, el botón
  // se queda sin número en vez de romper nada.
  pide('get')
    .then((v) => (cuenta.textContent = v))
    .catch(() => (cuenta.textContent = '—'));

  // «Ver el tutorial» lo cablea app.js, que es quien tiene el tutorial: acá
  // solo se ofrece cerrar la bienvenida sin robarle el foco.
  const api = { abrir, cierra: () => abrir(false, { foco: false }) };

  boton.addEventListener('click', async () => {
    if (leeLS(LS_VOTO) === '1') return;
    boton.disabled = true;
    try {
      cuenta.textContent = await pide('hit');
      escribeLS(LS_VOTO, '1');
      marcaVotado(boton);
    } catch {
      boton.disabled = false;
      boton.title = tx('el contador no responde');
    }
  });

  return api;
}

/**
 * «Acerca de»: quiénes lo hacen y para quién. Se abre desde la firma de la
 * barra y desde la bienvenida; al cerrarlo el foco vuelve a donde estaba.
 */
function montaAcerca({ cierraBienvenida }) {
  const modal = document.getElementById('acerca');
  let volverA = null;
  const abre = () => {
    volverA = document.activeElement;
    modal.hidden = false;
    document.getElementById('acerca-cerrar').focus();
  };
  const cierra = () => {
    modal.hidden = true;
    if (volverA?.isConnected && !volverA.closest('[hidden]')) volverA.focus();
    else document.getElementById('btn-ayuda').focus();
  };
  document.getElementById('btn-acerca').addEventListener('click', abre);
  document.getElementById('btn-acerca-bienvenida').addEventListener('click', () => {
    cierraBienvenida();
    abre();
  });
  document.getElementById('acerca-cerrar').addEventListener('click', cierra);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) cierra();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) cierra();
  });
}

function marcaVotado(boton) {
  boton.classList.add('votado');
  boton.disabled = true;
  boton.title = tx('voto registrado en este navegador');
}
