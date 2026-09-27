// Enlace teléfono–PC del Laberinto 3D: el teléfono hace de cabeza y el PC
// muestra el modelo.
//
// La presentación pasa por el PHP de `servidor/senal.php` (en el servidor que
// diga <meta name="trainhit-senal">): el PC abre una sala y recibe un código
// de 6 dígitos, el teléfono entra con ese código, y por ahí se intercambian
// la oferta y la respuesta de WebRTC. Después el canal de datos va directo
// entre los dos aparatos: el giroscopio no pasa por el servidor.
//
// Si la conexión se cae (el teléfono se durmió), el PC reabre la misma sala
// con su llave y el teléfono vuelve a entrar con el mismo código: ver
// `Sala` y laberinto.js.
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
const CONSULTA_MS = 1000;
/** Tope para juntar candidatos ICE antes de mandar la oferta. */
const ICE_MS = 3000;
/** Tope de cada pedido al PHP. */
const PEDIDO_MS = 10000;
/**
 * Tope para que se abra la conexión directa una vez que los dos se
 * presentaron. Si no se abre, la red no deja hablar directo a los aparatos:
 * teléfono con datos móviles y PC en otra red, o un wifi con aislamiento de
 * clientes, que es común en redes institucionales.
 */
const CANAL_MS = 15000;

export const MENSAJE_CABEZA = 1;

/**
 * La dirección del PHP de señalización: la de la meta, o la relativa con
 * `?senal=local` (para probar con `php -S` en la raíz del repo).
 */
export function servidorSenal() {
  const local = new URLSearchParams(location.search).get('senal') === 'local';
  const meta = document.querySelector('meta[name="trainhit-senal"]')?.content;
  return new URL(local || !meta ? 'servidor/senal.php' : meta, location.href).href;
}

async function pide(accion, { codigo, llave, n, cuerpo } = {}) {
  const url = new URL(servidorSenal());
  url.searchParams.set('accion', accion);
  if (codigo) url.searchParams.set('codigo', codigo);
  if (llave) url.searchParams.set('llave', llave);
  if (n !== undefined) url.searchParams.set('n', n);
  // text/plain: pedido «simple», sin la consulta previa de CORS.
  const opciones = cuerpo === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: cuerpo };
  if (typeof AbortSignal.timeout === 'function') opciones.signal = AbortSignal.timeout(PEDIDO_MS);
  opciones.cache = 'no-store';
  const r = await fetch(url, opciones);
  const texto = await r.text();
  try {
    return { estado: r.status, json: JSON.parse(texto) };
  } catch {
    // Algo en el medio (un antirrobots del hosting, un aviso de PHP) contestó
    // otra cosa: se lo dice así, no como un JSON roto más adelante.
    console.warn(`enlace: ${accion} respondió ${r.status} sin JSON:`, texto.slice(0, 300));
    throw new Error(tx('el servidor respondió algo que no es JSON ({estado})', { estado: r.status }));
  }
}

/** El SDP que vino de la sala, o un error claro si no vino. */
function sdpDe(json) {
  if (typeof json.sdp !== 'string') throw new Error(tx('la sala respondió sin los datos de conexión'));
  return JSON.parse(json.sdp);
}

/** Qué rutas de red encontró este aparato, para la consola. */
function cuentaCandidatos(pc, quien) {
  const sdp = pc.localDescription?.sdp ?? '';
  const n = (tipo) => (sdp.match(new RegExp(`typ ${tipo}`, 'g')) ?? []).length;
  console.info(`enlace (${quien}): candidatos host ${n('host')}, srflx ${n('srflx')}, relay ${n('relay')}`);
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

/** Error de cuando los dos se presentaron pero la red no deja hablar directo. */
function sinRuta() {
  return Object.assign(new Error(tx('la red no deja conectar directo a los dos aparatos')), { sinRuta: true });
}

function canalAbierto(canal, pc) {
  if (canal.readyState === 'open') return Promise.resolve(canal);
  return new Promise((listo, falla) => {
    const plazo = setTimeout(() => falla(sinRuta()), CANAL_MS);
    canal.addEventListener('open', () => (clearTimeout(plazo), listo(canal)), { once: true });
    canal.addEventListener('close', () => (clearTimeout(plazo), falla(new Error(tx('el canal se cerró')))), { once: true });
    pc?.addEventListener('iceconnectionstatechange', () => {
      if (pc.iceConnectionState === 'failed') {
        clearTimeout(plazo);
        falla(sinRuta());
      }
    });
  });
}

/**
 * El lado del PC: una sala con su código, que se puede reabrir con la misma
 * llave si la conexión se cae. `conecta()` deja una oferta nueva y espera al
 * teléfono; devuelve la conexión y el canal abierto. `cancela()` deja de
 * esperar.
 */
export class Sala {
  static async crea() {
    const { estado, json } = await pide('crear', { cuerpo: '' });
    if (estado !== 200) throw new Error(json.error ?? tx('el servidor respondió {estado}', { estado }));
    return new Sala(json.codigo, json.llave);
  }

  constructor(codigo, llave) {
    this.codigo = codigo;
    this.llave = llave;
    this.pc = null;
    this.cancelada = false;
  }

  /** Vuelve a abrir la sala, vacía, para una conexión nueva. */
  async reabre() {
    const { estado, json } = await pide('reabrir', { codigo: this.codigo, llave: this.llave, cuerpo: '' });
    if (estado !== 200) throw new Error(json.error ?? tx('el servidor respondió {estado}', { estado }));
  }

  /** `paso(texto)` recibe en qué anda, para mostrarlo. */
  async conecta(paso = () => {}) {
    this.cancelada = false;
    const pc = new RTCPeerConnection({ iceServers: STUN });
    this.pc = pc;
    // Sin orden ni reenvíos: un dato viejo no sirve, mejor el siguiente.
    const canal = pc.createDataChannel('cabeza', { ordered: false, maxRetransmits: 0 });
    canal.binaryType = 'arraybuffer';
    await pc.setLocalDescription(await pc.createOffer());
    await iceCompleto(pc);
    cuentaCandidatos(pc, 'PC');
    const escrito = await pide('oferta', { codigo: this.codigo, llave: this.llave, cuerpo: JSON.stringify(pc.localDescription) });
    if (escrito.estado !== 200) throw new Error(escrito.json.error ?? tx('el servidor respondió {estado}', { estado: escrito.estado }));
    for (;;) {
      if (this.cancelada) throw new Error('cancelado');
      const r = await pide('respuesta', { codigo: this.codigo, llave: this.llave });
      if (r.estado === 200) {
        paso(tx('El teléfono respondió; abriendo la conexión directa…'));
        await pc.setRemoteDescription(sdpDe(r.json));
        return { pc, canal: await canalAbierto(canal, pc) };
      }
      if (r.estado !== 404 || r.json.error !== 'todavía no') throw new Error(tx('la sala venció: crear otro código'));
      await new Promise((ok) => setTimeout(ok, CONSULTA_MS));
    }
  }

  cancela() {
    this.cancelada = true;
    this.pc?.close();
  }
}

/**
 * El lado del teléfono: entra a la sala del código y espera el canal. Si el
 * PC todavía no dejó su oferta —recién la abrió o la está reabriendo—, falla
 * con `todavia: true` para que quien llama pruebe de nuevo.
 */
export async function uneSala(codigo, paso = () => {}) {
  paso(tx('Leyendo la sala…'));
  const { estado, json } = await pide('oferta', { codigo });
  if (estado === 404) {
    const e = new Error(json.error === 'todavía no' ? tx('el PC todavía no terminó de abrir la sala') : tx('no hay sala con ese código'));
    e.todavia = json.error === 'todavía no';
    throw e;
  }
  if (estado !== 200) throw new Error(json.error ?? tx('el servidor respondió {estado}', { estado }));
  const pc = new RTCPeerConnection({ iceServers: STUN });
  const llega = new Promise((listo) => pc.addEventListener('datachannel', (e) => listo(e.channel), { once: true }));
  await pc.setRemoteDescription(sdpDe(json));
  await pc.setLocalDescription(await pc.createAnswer());
  paso(tx('Respondiendo al PC…'));
  await iceCompleto(pc);
  cuentaCandidatos(pc, 'teléfono');
  const escrito = await pide('respuesta', { codigo, n: json.n, cuerpo: JSON.stringify(pc.localDescription) });
  if (escrito.estado === 409) {
    // Otra oferta ganó en el medio (el PC reabrió): probar de nuevo.
    pc.close();
    const e = new Error(tx('el PC todavía no terminó de abrir la sala'));
    e.todavia = true;
    throw e;
  }
  if (escrito.estado !== 200) throw new Error(escrito.json.error ?? tx('el servidor respondió {estado}', { estado: escrito.estado }));
  paso(tx('Abriendo la conexión directa…'));
  const fallaIce = new Promise((_, falla) =>
    pc.addEventListener('iceconnectionstatechange', () => pc.iceConnectionState === 'failed' && falla(sinRuta())),
  );
  const canal = await Promise.race([llega, fallaIce, new Promise((_, falla) => setTimeout(() => falla(sinRuta()), CANAL_MS))]);
  canal.binaryType = 'arraybuffer';
  return { pc, canal: await canalAbierto(canal, pc) };
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
