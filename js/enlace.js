// Enlace teléfono–PC del Laberinto 3D: el teléfono hace de cabeza y el PC
// muestra el modelo.
//
// La presentación pasa por el PHP de `servidor/senal.php` (en el servidor que
// diga <meta name="trainhit-senal">): el PC abre una sala y recibe un código
// de 6 dígitos, el teléfono entra con ese código, y por ahí se intercambian
// la oferta y la respuesta de WebRTC. Después el canal de datos va directo
// entre los dos aparatos: el giroscopio no pasa por el servidor.
//
// Las ofertas van enteras, con todos los candidatos ICE ya juntados (sin
// «trickle»), para que la sala tenga un solo mensaje por lado. En la misma
// red alcanza con los candidatos locales; el STUN de Google es para cuando el
// teléfono va por datos móviles.
//
// Mensajes del canal:
//   teléfono → PC   Float32Array [1, qx, qy, qz, qw, wx, wy, wz]: orientación
//                   de la cabeza y su velocidad angular (°/s, marco de la
//                   cabeza), una por evento del giroscopio.
//   PC → teléfono   'centrar': el teléfono toma su posición actual como frente.

import { tx } from './idioma.js';

const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];
/** Cada cuánto se pregunta en la sala si el otro ya escribió, en ms. */
const CONSULTA_MS = 700;
/** Tope para juntar candidatos ICE antes de mandar la oferta. */
const ICE_MS = 3000;

export const MENSAJE_CABEZA = 1;

/** La dirección del PHP de señalización. */
export function servidorSenal() {
  const meta = document.querySelector('meta[name="trainhit-senal"]')?.content;
  return new URL(meta || 'servidor/senal.php', location.href).href;
}

async function pide(accion, { codigo, cuerpo } = {}) {
  const url = new URL(servidorSenal());
  url.searchParams.set('accion', accion);
  if (codigo) url.searchParams.set('codigo', codigo);
  // text/plain: pedido «simple», sin la consulta previa de CORS.
  const r = await fetch(url, cuerpo === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: cuerpo });
  const json = await r.json().catch(() => ({}));
  return { estado: r.status, json };
}

/** Espera a que ICE junte sus candidatos, con tope. */
function iceCompleto(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((listo) => {
    const fin = () => {
      pc.removeEventListener('icegatheringstatechange', mira);
      listo();
    };
    const mira = () => pc.iceGatheringState === 'complete' && fin();
    pc.addEventListener('icegatheringstatechange', mira);
    setTimeout(fin, ICE_MS);
  });
}

function canalAbierto(canal) {
  if (canal.readyState === 'open') return Promise.resolve(canal);
  return new Promise((listo, falla) => {
    canal.addEventListener('open', () => listo(canal), { once: true });
    canal.addEventListener('close', () => falla(new Error(tx('el canal se cerró'))), { once: true });
  });
}

/**
 * El lado del PC: abre una sala. Devuelve el código apenas lo hay y, en
 * `canal`, la promesa del canal abierto cuando el teléfono entra. `cancela()`
 * deja de esperar y cierra.
 */
export async function abreSala() {
  const pc = new RTCPeerConnection({ iceServers: STUN });
  // Sin orden ni reenvíos: un dato viejo no sirve, mejor el siguiente.
  const canal = pc.createDataChannel('cabeza', { ordered: false, maxRetransmits: 0 });
  canal.binaryType = 'arraybuffer';
  const { estado, json } = await pide('crear', { cuerpo: '' });
  if (estado !== 200) throw new Error(json.error ?? tx('el servidor respondió {estado}', { estado }));
  const codigo = json.codigo;
  await pc.setLocalDescription(await pc.createOffer());
  await iceCompleto(pc);
  const escrito = await pide('oferta', { codigo, cuerpo: JSON.stringify(pc.localDescription) });
  if (escrito.estado !== 200) throw new Error(escrito.json.error ?? tx('el servidor respondió {estado}', { estado: escrito.estado }));

  let cancelado = false;
  const esperaRespuesta = async () => {
    for (;;) {
      if (cancelado) throw new Error('cancelado');
      const r = await pide('respuesta', { codigo });
      if (r.estado === 200) return JSON.parse(r.json.sdp);
      if (r.json.error === 'no hay sala con ese código') throw new Error(tx('la sala venció: crear otro código'));
      await new Promise((ok) => setTimeout(ok, CONSULTA_MS));
    }
  };
  const abierto = (async () => {
    await pc.setRemoteDescription(await esperaRespuesta());
    return canalAbierto(canal);
  })();
  return {
    codigo,
    pc,
    canal: abierto,
    cancela() {
      cancelado = true;
      pc.close();
    },
  };
}

/** El lado del teléfono: entra a la sala del código y espera el canal. */
export async function uneSala(codigo) {
  const { estado, json } = await pide('oferta', { codigo });
  if (estado === 404) {
    throw new Error(json.error === 'todavía no' ? tx('el PC todavía no terminó de abrir la sala') : tx('no hay sala con ese código'));
  }
  if (estado !== 200) throw new Error(json.error ?? tx('el servidor respondió {estado}', { estado }));
  const pc = new RTCPeerConnection({ iceServers: STUN });
  const llega = new Promise((listo) => pc.addEventListener('datachannel', (e) => listo(e.channel), { once: true }));
  await pc.setRemoteDescription(JSON.parse(json.sdp));
  await pc.setLocalDescription(await pc.createAnswer());
  await iceCompleto(pc);
  const escrito = await pide('respuesta', { codigo, cuerpo: JSON.stringify(pc.localDescription) });
  if (escrito.estado !== 200) throw new Error(escrito.json.error ?? tx('el servidor respondió {estado}', { estado: escrito.estado }));
  const canal = await llega;
  canal.binaryType = 'arraybuffer';
  return { pc, canal: await canalAbierto(canal) };
}

/** Empaqueta la cabeza para mandarla. */
export function mensajeCabeza(q, w) {
  return new Float32Array([MENSAJE_CABEZA, q[0], q[1], q[2], q[3], w[0], w[1], w[2]]).buffer;
}

/** Lee un mensaje de cabeza; null si no es uno. */
export function leeCabeza(datos) {
  if (!(datos instanceof ArrayBuffer) || datos.byteLength !== 32) return null;
  const v = new Float32Array(datos);
  if (v[0] !== MENSAJE_CABEZA) return null;
  return { q: [v[1], v[2], v[3], v[4]], w: [v[5], v[6], v[7]] };
}
