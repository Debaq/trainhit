// Bienvenida y contador de «me gusta».
//
// El contador vive en Abacus (abacus.jasoncameron.dev): un contador público y
// anónimo, sin cuenta ni registro para nadie —ni para quien lo lee, ni para
// quien lo suma—. Se eligió así a propósito: las reacciones de GitHub obligan
// a tener cuenta de GitHub, y quien abre esto es alguien que está aprendiendo,
// no necesariamente alguien con cuenta en GitHub.
//
// Lo que se manda es una petición sin datos: no viaja ni el video, ni las
// mediciones, ni nada de la sesión. Es la ÚNICA petición que sale de la página
// aparte del modelo de MediaPipe, y solo si alguien aprieta el botón.

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

  if (yaVoto) marcaVotado(boton);
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
      boton.title = 'el contador no responde';
    }
  });

  return api;
}

function marcaVotado(boton) {
  boton.classList.add('votado');
  boton.disabled = true;
  boton.title = 'voto registrado en este navegador';
}
