// El teléfono como cabeza: el diálogo del enlace, en el PC y en el teléfono.
//
// El PC muestra un QR; el teléfono lo escanea, llega con `?cabeza=código`,
// enciende el giroscopio (giroscopio.js) y manda cada evento. El PC los pasa a
// app.js, que dibuja la cara (cara.js) y corre el motor. La conexión es la de
// Labyrinthus 3D (enlace.js), y este ciclo de vida también viene de allí
// (laberinto.js): el ENLACE dura más que una conexión. Si la conexión se cae
// —el teléfono se durmió, se cortó el wifi—, el PC reabre la misma sala y el
// teléfono vuelve a entrar con el mismo código, solos, hasta que alguien
// aprieta «Terminar». Para que no se caiga, el teléfono pide que la pantalla
// no se apague (Wake Lock).
//
// El QR viejo del Laberinto, que llegaba aquí con `?enlace=`, sigue yendo a
// Labyrinthus 3D (app.js): por eso este usa otro nombre.

import { Sala, uneSala } from './enlace.js';
import { SensorCabeza, leeGiro, mensajeGiro } from './giroscopio.js';
import { tx } from './idioma.js';

const $ = (id) => document.getElementById(id);

/** Tiempo de gracia de una conexión «desconectada» antes de darla por caída. */
const GRACIA_MS = 3000;
/** Cada cuánto reintenta el que se quedó sin conexión. */
const REINTENTO_MS = 2000;

const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** El código del QR, si esta página es la del teléfono. */
export function codigoDeCabeza() {
  const c = new URLSearchParams(location.search).get('cabeza');
  return c ? c.replace(/\D/g, '').slice(0, 6) : '';
}

/**
 * Monta el diálogo. Lo que pasa en el PC se avisa a app.js:
 *   - `alEntrar()`: se abrió una sala; desde aquí la pantalla es la cara.
 *   - `alGiro(tMs, yaw)`: un evento del teléfono.
 *   - `alSalir()`: se terminó el enlace.
 *   - `alCambiar()`: cambió el estado (para la barra).
 */
export function montaTelefono({ alEntrar, alGiro, alSalir, alCambiar }) {
  /** El enlace en curso, o null. `rol` es 'visor' (el PC) o 'cabeza' (el teléfono). */
  let remoto = null;
  let codigoQr = codigoDeCabeza();
  const sensor = new SensorCabeza((t, yaw) => {
    const r = remoto;
    if (r?.rol === 'cabeza' && r.canal?.readyState === 'open') r.canal.send(mensajeGiro(t, yaw));
  });

  function estadoEnlace(texto) {
    $('enlace-estado').textContent = texto;
  }

  /** El mensaje de un enlace que no se pudo armar, con qué probar si es la red. */
  function errorEnlace(e) {
    const msg = tx('No se pudo enlazar: {msg}', { msg: e.message });
    return e.sinRuta ? `${msg}. ${tx('Probar con los dos en la misma red wifi, o con el PC conectado al punto de acceso del teléfono.')}` : msg;
  }

  /**
   * Abre el diálogo. En el PC muestra el botón del QR; en el teléfono, el
   * botón para ser la cabeza, que hace falta porque el permiso de los
   * sensores tiene que salir de un toque.
   */
  function abre() {
    $('enlace').hidden = false;
    $('enlace-pc').hidden = Boolean(codigoQr);
    $('enlace-cabeza').hidden = !codigoQr;
    if (!remoto) estadoEnlace('');
    pinta();
    (codigoQr ? $('enlace-unirse') : $('enlace-crear')).focus();
  }

  function cierra() {
    $('enlace').hidden = true;
    // Una sala que nadie usó todavía se cancela al cerrar.
    if (remoto?.rol === 'visor' && !remoto.algunaVez) termina();
  }

  async function dibujaQr(texto) {
    const { qrcode } = await import('https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/dist/qrcode.mjs');
    const qr = qrcode(0, 'M');
    qr.addData(texto);
    qr.make();
    const n = qr.getModuleCount();
    const margen = 2;
    const lienzo = $('enlace-qr');
    lienzo.width = lienzo.height = n + 2 * margen;
    const ctx = lienzo.getContext('2d');
    // Blanco y negro en los dos temas: es para la cámara del teléfono.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, n + 2 * margen, n + 2 * margen);
    ctx.fillStyle = '#000';
    for (let f = 0; f < n; f++) for (let c = 0; c < n; c++) if (qr.isDark(f, c)) ctx.fillRect(c + margen, f + margen, 1, 1);
  }

  function pinta() {
    const r = remoto;
    $('enlace-terminar').hidden = !r;
    $('enlace-centrar').hidden = !r?.conectado;
    $('enlace-unirse').hidden = r?.rol === 'cabeza';
    $('enlace-cabeza-lista').hidden = !(r?.rol === 'cabeza' && r.conectado);
    alCambiar?.();
  }

  // ---- el PC ----

  async function creaCodigo() {
    termina();
    $('enlace-codigo').hidden = true;
    estadoEnlace(tx('Abriendo la sala…'));
    let sala;
    try {
      sala = await Sala.crea();
    } catch (e) {
      estadoEnlace(errorEnlace(e));
      return;
    }
    const r = { rol: 'visor', sala, conectado: false, algunaVez: false };
    remoto = r;
    alEntrar();
    $('enlace-codigo').hidden = false;
    $('enlace-numero').textContent = sala.codigo;
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('cabeza', sala.codigo);
    dibujaQr(url.href).catch((e) => console.warn('teléfono: QR', e));
    estadoEnlace(tx('Esperando al teléfono…'));
    pinta();
    esperaTelefono(r);
  }

  /** Deja una oferta y espera al teléfono; si falla y el enlace sigue, reintenta. */
  async function esperaTelefono(r) {
    while (remoto === r) {
      try {
        const { pc, canal, relevo } = await r.sala.conecta((texto) => remoto === r && !r.algunaVez && estadoEnlace(texto));
        if (remoto !== r) return pc?.close() ?? canal.close();
        engancha(r, pc, canal, relevo);
        return;
      } catch (e) {
        if (remoto !== r || e.message === 'cancelado') return;
        // Sin haberse conectado nunca, es un error de verdad: se avisa.
        if (!r.algunaVez) {
          termina();
          $('enlace').hidden = false;
          estadoEnlace(errorEnlace(e));
          return;
        }
        await pausa(REINTENTO_MS);
        try {
          await r.sala.reabre();
        } catch (e2) {
          console.warn('teléfono: reabrir la sala', e2);
        }
      }
    }
  }

  // ---- el teléfono ----

  async function uneComoCabeza() {
    if (!codigoQr) return;
    // Primero los sensores: el permiso de iOS pide que sea dentro del toque.
    estadoEnlace(tx('Encendiendo el giroscopio…'));
    try {
      await sensor.enciende();
    } catch (e) {
      estadoEnlace(
        e.message === 'sin giroscopio'
          ? tx('Este teléfono no entrega el giroscopio: no puede ser la cabeza.')
          : tx('Sin permiso para leer los sensores no se puede ser la cabeza.'),
      );
      return;
    }
    termina();
    estadoEnlace(tx('Conectando…'));
    const r = { rol: 'cabeza', codigo: codigoQr, conectado: false, algunaVez: false, despierta: null };
    remoto = r;
    buscaPC(r);
  }

  /** Entra a la sala del PC; mientras el PC la está (re)abriendo, reintenta. */
  async function buscaPC(r) {
    for (let intentos = 0; remoto === r; intentos++) {
      try {
        const { pc, canal, relevo } = await uneSala(r.codigo, (texto) => remoto === r && estadoEnlace(texto));
        if (remoto !== r) return pc?.close() ?? canal.close();
        engancha(r, pc, canal, relevo);
        return;
      } catch (e) {
        if (remoto !== r) return;
        // La primera vez, una sala que no existe es un QR vencido, y una red
        // que no deja conectar directo no se arregla reintentando.
        if (!r.algunaVez && (e.sinRuta || (!e.todavia && intentos > 1))) {
          termina();
          estadoEnlace(errorEnlace(e));
          return;
        }
        // Se espera, o hasta que la página vuelva a verse (el teléfono despertó).
        await Promise.race([pausa(REINTENTO_MS), new Promise((ok) => (r.despierta = ok))]);
      }
    }
  }

  async function pideNoDormir(r) {
    try {
      r.wakeLock = await navigator.wakeLock?.request('screen');
    } catch (e) {
      console.warn('teléfono: la pantalla se puede apagar', e);
    }
  }

  // ---- los dos ----

  /**
   * Engancha un canal abierto: el de datos de WebRTC (con su `pc`) o el del
   * relevo (`pc` nulo, `relevo` true), que se usan igual.
   */
  function engancha(r, pc, canal, relevo = false) {
    Object.assign(r, { pc, canal, relevo, conectado: true, algunaVez: true });
    const caida = () => seCae(r, canal);
    let gracia = 0;
    pc?.addEventListener('connectionstatechange', () => {
      clearTimeout(gracia);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') caida();
      // «disconnected» a veces se arregla solo: se espera un poco.
      else if (pc.connectionState === 'disconnected') gracia = setTimeout(caida, GRACIA_MS);
    });
    canal.addEventListener('close', caida);
    if (r.rol === 'visor') {
      canal.addEventListener('message', (e) => {
        if (remoto !== r) return;
        const m = leeGiro(e.data);
        if (m) alGiro(m.tMs, m.yaw);
      });
      // Cada conexión nueva arranca con el teléfono de frente.
      canal.send('centrar');
      $('enlace').hidden = true;
      estadoEnlace('');
    } else {
      canal.addEventListener('message', (e) => e.data === 'centrar' && sensor.centra());
      pideNoDormir(r);
      estadoEnlace(r.relevo ? tx('Enlazado, por el servidor.') : tx('Enlazado.'));
    }
    pinta();
  }

  /** La conexión se cayó pero el enlace sigue: a reconectar. */
  function seCae(r, canal) {
    if (remoto !== r || r.canal !== canal || !r.conectado) return;
    r.conectado = false;
    r.pc?.close();
    canal.close();
    if (r.rol === 'cabeza') estadoEnlace(tx('Reconectando…'));
    pinta();
    if (r.rol === 'visor') {
      r.sala.reabre().catch((e) => console.warn('teléfono: reabrir la sala', e)).finally(() => esperaTelefono(r));
    } else buscaPC(r);
  }

  /** Termina el enlace: nada de reconectar. */
  function termina() {
    const r = remoto;
    if (!r) return;
    remoto = null;
    r.sala?.cancela();
    r.pc?.close();
    r.canal?.close();
    r.wakeLock?.release().catch(() => {});
    $('enlace-codigo').hidden = true;
    pinta();
    if (r.rol === 'visor') alSalir();
  }

  /** La posición de ahora es el frente: en el teléfono directo, desde el PC por el canal. */
  function centra() {
    const r = remoto;
    if (r?.rol === 'cabeza') sensor.centra();
    else if (r?.canal?.readyState === 'open') r.canal.send('centrar');
  }

  // El teléfono vuelve de dormir: la pantalla se volvió a ver. El Wake Lock se
  // suelta solo al ocultarse y hay que pedirlo de nuevo; y si la conexión no
  // sobrevivió, se reintenta ya, sin esperar el turno.
  document.addEventListener('visibilitychange', () => {
    const r = remoto;
    if (document.visibilityState !== 'visible' || r?.rol !== 'cabeza') return;
    pideNoDormir(r);
    if (r.conectado && r.canal?.readyState !== 'open') seCae(r, r.canal);
    r.despierta?.();
  });

  $('enlace-cerrar').addEventListener('click', cierra);
  $('enlace').addEventListener('click', (e) => e.target === $('enlace') && cierra());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && !$('enlace').hidden && cierra());
  $('enlace-terminar').addEventListener('click', () => {
    const cabeza = remoto?.rol === 'cabeza';
    termina();
    if (cabeza) sensor.apaga();
    estadoEnlace(tx('Enlace terminado.'));
  });
  $('enlace-crear').addEventListener('click', creaCodigo);
  $('enlace-unirse').addEventListener('click', uneComoCabeza);
  $('enlace-centrar').addEventListener('click', centra);

  if (codigoQr) abre();

  return {
    abre,
    termina,
    centra,
    /** 'visor', 'cabeza' o null. */
    rol: () => remoto?.rol ?? (codigoQr ? 'cabeza' : null),
    /** Para la barra del PC: null sin enlace, o si hay teléfono y si va por el servidor. */
    estado: () => (remoto?.rol === 'visor' ? { conectado: remoto.conectado, relevo: Boolean(remoto.relevo), algunaVez: remoto.algunaVez } : null),
  };
}
