// Enlace teléfono–PC: el teléfono hace de cabeza y el PC muestra la cara
// dibujada y mide. Viene de Labyrinthus 3D (js/enlace.js de allá), que es el
// que tiene el servidor: trainHIT usa el mismo, así que acá no hay PHP.
//
// La presentación pasa por el PHP de señalización de Labyrinthus 3D (el que
// diga <meta name="enlace-senal">): el PC abre una sala y recibe un código
// de 6 dígitos, el teléfono entra con ese código, y por ahí se intercambian
// la oferta y la respuesta de WebRTC. Después el canal de datos va directo
// entre los dos aparatos: el giroscopio no pasa por el servidor.
//
// Si la conexión directa no se abre —la red no la deja: teléfono con datos
// móviles, wifi con aislamiento de clientes—, los dos pasan al RELEVO de
// Labyrinthus 3D, una tubería por WebSocket que dice
// <meta name="enlace-relevo">. Se encuentran ahí con una contraseña al azar
// que el PC puso dentro de su oferta, así que solo entra quien escaneó el QR.
// Con `?forzar=relevo` en el PC se salta la conexión directa, para probar el
// relevo.
//
// Si la conexión se cae (el teléfono se durmió), el PC reabre la misma sala
// con su llave y el teléfono vuelve a entrar con el mismo código: ver `Sala`
// y telefono.js.
//
// Las ofertas van enteras, con todos los candidatos ICE ya juntados (sin
// «trickle»), para que la sala tenga un solo mensaje por lado. En la misma
// red alcanza con los candidatos locales; el STUN de Google es para cuando el
// teléfono va por datos móviles.
//
// Qué viaja por el canal: ver `mensajeGiro` en giroscopio.js (teléfono → PC)
// y 'centrar' (PC → teléfono: la posición de ahora es el frente).

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

/**
 * La dirección del PHP de señalización: la de la meta, o con `?senal=local`
 * la de Labyrinthus 3D al lado de trainHIT (para probar con `php -S` en la
 * carpeta que tiene los dos repos).
 */
export function servidorSenal() {
  const local = new URLSearchParams(location.search).get('senal') === 'local';
  const meta = document.querySelector('meta[name="enlace-senal"]')?.content;
  return new URL(local || !meta ? '../labyrinthus3d/servidor/senal.php' : meta, location.href).href;
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

/**
 * La dirección del relevo por WebSocket, o null si no hay: la de la meta —si
 * es relativa, junto a la página, con ws o wss según sea http o https— o la
 * local con `?relevo=local` (`node servidor/relevo/relevo.js` de Labyrinthus 3D).
 */
export function servidorRelevo() {
  const param = new URLSearchParams(location.search).get('relevo');
  if (param === 'local') return 'ws://localhost:3001/';
  const meta = document.querySelector('meta[name="enlace-relevo"]')?.content;
  if (!meta) return null;
  const url = new URL(meta, location.href);
  if (url.protocol === 'https:') url.protocol = 'wss:';
  else if (url.protocol === 'http:') url.protocol = 'ws:';
  return url.href;
}

const forzarRelevo = () => new URLSearchParams(location.search).get('forzar') === 'relevo';

/** Contraseña de sala para el relevo: 32 hexadecimales al azar. */
function contrasena() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const PAR = '\u0000par';
const SOLO = '\u0000solo';
/** Tope para que el otro aparato llegue al relevo. */
const RELEVO_MS = 20000;

/**
 * Un canal por el relevo que se usa igual que el canal de datos de WebRTC:
 * `send`, `readyState`, y los eventos `message` y `close`. Si el otro se va,
 * se cierra: el enlace lo trata como cualquier caída y reconecta.
 */
class CanalRelevo extends EventTarget {
  constructor(ws) {
    super();
    this.ws = ws;
    this.pareado = false;
    this.cerrado = false;
    ws.addEventListener('message', (e) => {
      if (e.data === PAR) {
        this.pareado = true;
        this.dispatchEvent(new Event('par'));
      } else if (e.data === SOLO) this.close();
      else this.dispatchEvent(new MessageEvent('message', { data: e.data }));
    });
    ws.addEventListener('close', () => this.avisaCierre());
    ws.addEventListener('error', () => this.avisaCierre());
  }

  get readyState() {
    return this.ws.readyState === WebSocket.OPEN && this.pareado && !this.cerrado ? 'open' : 'closed';
  }

  send(datos) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(datos);
  }

  close() {
    this.ws.close();
    this.avisaCierre();
  }

  avisaCierre() {
    if (this.cerrado) return;
    this.cerrado = true;
    this.dispatchEvent(new Event('close'));
  }
}

/** Entra al relevo con la contraseña y espera al otro aparato. */
function abreRelevo(t, rol) {
  const base = servidorRelevo();
  if (!base) return Promise.reject(sinRuta());
  const url = new URL(base);
  url.searchParams.set('t', t);
  url.searchParams.set('rol', rol);
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  const canal = new CanalRelevo(ws);
  return new Promise((listo, falla) => {
    const plazo = setTimeout(() => {
      canal.close();
      falla(new Error(tx('el otro aparato no llegó al servidor')));
    }, RELEVO_MS);
    canal.addEventListener('par', () => (clearTimeout(plazo), listo(canal)), { once: true });
    canal.addEventListener(
      'close',
      () => {
        clearTimeout(plazo);
        falla(new Error(tx('no se pudo usar el servidor de relevo')));
      },
      { once: true },
    );
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
    // Para encontrarse en el relevo; viaja dentro de la oferta.
    this.relevo = contrasena();
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
    const soloRelevo = forzarRelevo() && Boolean(servidorRelevo());
    const oferta = { ...pc.localDescription.toJSON(), relevo: this.relevo, soloRelevo };
    const escrito = await pide('oferta', { codigo: this.codigo, llave: this.llave, cuerpo: JSON.stringify(oferta) });
    if (escrito.estado !== 200) throw new Error(escrito.json.error ?? tx('el servidor respondió {estado}', { estado: escrito.estado }));
    for (;;) {
      if (this.cancelada) throw new Error('cancelado');
      const r = await pide('respuesta', { codigo: this.codigo, llave: this.llave });
      if (r.estado === 200) {
        if (!soloRelevo) {
          paso(tx('El teléfono respondió; abriendo la conexión directa…'));
          await pc.setRemoteDescription(sdpDe(r.json));
          try {
            return { pc, canal: await canalAbierto(canal, pc) };
          } catch (e) {
            if (!e.sinRuta || !servidorRelevo()) throw e;
          }
        }
        // La red no deja: por el relevo.
        pc.close();
        this.pc = null;
        paso(tx('La red no deja conectar directo: pasando por el servidor…'));
        return { pc: null, canal: await abreRelevo(this.relevo, 'visor'), relevo: true };
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
  const oferta = sdpDe(json);
  await pc.setRemoteDescription({ type: oferta.type, sdp: oferta.sdp });
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
  const porRelevo = async () => {
    pc.close();
    paso(tx('La red no deja conectar directo: pasando por el servidor…'));
    return { pc: null, canal: await abreRelevo(oferta.relevo, 'cabeza'), relevo: true };
  };
  if (oferta.soloRelevo) return porRelevo();
  paso(tx('Abriendo la conexión directa…'));
  try {
    const fallaIce = new Promise((_, falla) =>
      pc.addEventListener('iceconnectionstatechange', () => pc.iceConnectionState === 'failed' && falla(sinRuta())),
    );
    const canal = await Promise.race([llega, fallaIce, new Promise((_, falla) => setTimeout(() => falla(sinRuta()), CANAL_MS))]);
    canal.binaryType = 'arraybuffer';
    return { pc, canal: await canalAbierto(canal, pc) };
  } catch (e) {
    if (!e.sinRuta || !oferta.relevo || !servidorRelevo()) throw e;
    return porRelevo();
  }
}
