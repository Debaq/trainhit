// Relevo del enlace teléfono–PC del Laberinto 3D: una tubería por WebSocket
// para cuando la red no deja que el teléfono y el PC se hablen directo
// (teléfono con datos móviles, wifi con aislamiento de clientes).
//
// Los dos se conectan con la misma contraseña de sala (`t`, 32 hexadecimales
// al azar que el PC puso en su oferta, y que solo lee quien escaneó el QR),
// uno como `visor` (el PC) y otro como `cabeza` (el teléfono). Lo que manda
// uno le llega al otro, tal cual. Cuando están los dos, a cada uno le llega el
// texto "\u0000par"; si uno se va, al otro le llega "\u0000solo".
//
// Sin dependencias —el WebSocket está hecho a mano con el módulo http de
// Node— para que en el hosting alcance con subir este archivo y su
// package.json, sin instalar nada. Corre en «Setup Node.js App» de cPanel:
// ver LEEME.md al lado.
//
// Visitarlo con el navegador (un GET común) contesta «ok» y cuántas salas hay:
// sirve para saber que está andando.

'use strict';

const http = require('http');
const crypto = require('crypto');

// Desde dónde se lo puede usar. Igual que en senal.php.
const ORIGENES = [
  'https://tecmedhub.org',
  'https://debaq.github.io',
  'http://localhost:8093',
  'http://localhost:8095',
];
const MAGIA = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
/** Mensaje más grande que se acepta: los de la cabeza son de 32 bytes. */
const MAX_BYTES = 64 * 1024;
const MAX_SALAS = 500;
/** Una sala sin tráfico se cierra a los 10 minutos. */
const OCIOSA_MS = 10 * 60 * 1000;
/** Un ping cada tanto, para que ningún proxy corte la conexión quieta. */
const PING_MS = 25 * 1000;

const PAR = '\u0000par';
const SOLO = '\u0000solo';

/** Arma un marco de WebSocket del servidor (sin máscara). */
function marco(opcode, datos) {
  const n = datos.length;
  const cabeza = n < 126 ? Buffer.from([0x80 | opcode, n]) : n < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
  if (n >= 126) {
    cabeza[0] = 0x80 | opcode;
    if (n < 65536) {
      cabeza[1] = 126;
      cabeza.writeUInt16BE(n, 2);
    } else {
      cabeza[1] = 127;
      cabeza.writeBigUInt64BE(BigInt(n), 2);
    }
  }
  return Buffer.concat([cabeza, datos]);
}

/**
 * Lee los marcos completos que haya en `buf` y llama a `cada(opcode, datos)`.
 * Devuelve lo que sobró (un marco a medias), o null si algo está mal.
 */
function leeMarcos(buf, cada) {
  let i = 0;
  while (buf.length - i >= 2) {
    const opcode = buf[i] & 0x0f;
    const conMascara = (buf[i + 1] & 0x80) !== 0;
    let n = buf[i + 1] & 0x7f;
    let j = i + 2;
    if (n === 126) {
      if (buf.length - j < 2) break;
      n = buf.readUInt16BE(j);
      j += 2;
    } else if (n === 127) {
      if (buf.length - j < 8) break;
      const grande = buf.readBigUInt64BE(j);
      if (grande > BigInt(MAX_BYTES)) return null;
      n = Number(grande);
      j += 8;
    }
    if (n > MAX_BYTES || !conMascara) return null; // el cliente siempre enmascara
    if (buf.length - j < 4 + n) break;
    const mascara = buf.subarray(j, j + 4);
    const datos = Buffer.from(buf.subarray(j + 4, j + 4 + n));
    for (let k = 0; k < n; k++) datos[k] ^= mascara[k & 3];
    cada(opcode, datos);
    i = j + 4 + n;
  }
  return buf.subarray(i);
}

function creaServidor({ origenes = ORIGENES } = {}) {
  /** contraseña → { visor, cabeza, ultimo } */
  const salas = new Map();
  /** Los sockets pasados a WebSocket: `close()` del servidor no los ve. */
  const vivos = new Set();

  const servidor = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(`trainHIT relevo: ok · ${salas.size} salas\n`);
  });

  servidor.on('upgrade', (req, socket) => {
    const rechaza = (estado) => {
      socket.end(`HTTP/1.1 ${estado}\r\n\r\n`);
    };
    const url = new URL(req.url, 'http://relevo');
    const t = url.searchParams.get('t') ?? '';
    const rol = url.searchParams.get('rol');
    const clave = req.headers['sec-websocket-key'];
    if (!origenes.includes(req.headers.origin)) return rechaza('403 Forbidden');
    if (!/^[0-9a-f]{32}$/.test(t) || !['visor', 'cabeza'].includes(rol) || !clave) return rechaza('400 Bad Request');
    if (!salas.has(t) && salas.size >= MAX_SALAS) return rechaza('503 Service Unavailable');

    const aceptar = crypto.createHash('sha1').update(clave + MAGIA).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${aceptar}\r\n\r\n`,
    );
    socket.setNoDelay(true);
    vivos.add(socket);

    const sala = salas.get(t) ?? { visor: null, cabeza: null, ultimo: Date.now() };
    salas.set(t, sala);
    // Un rol ocupado se reemplaza: es el mismo aparato que volvió.
    sala[rol]?.destroy();
    sala[rol] = socket;
    const otro = () => sala[rol === 'visor' ? 'cabeza' : 'visor'];
    const manda = (s, opcode, datos) => s && !s.destroyed && s.write(marco(opcode, datos));
    if (otro()) {
      manda(socket, 0x1, Buffer.from(PAR));
      manda(otro(), 0x1, Buffer.from(PAR));
    }

    let resto = Buffer.alloc(0);
    socket.on('data', (trozo) => {
      sala.ultimo = Date.now();
      resto = leeMarcos(Buffer.concat([resto, trozo]), (opcode, datos) => {
        if (opcode === 0x1 || opcode === 0x2) manda(otro(), opcode, datos);
        else if (opcode === 0x9) manda(socket, 0xa, datos); // ping → pong
        else if (opcode === 0x8) socket.end(marco(0x8, Buffer.alloc(0)));
      });
      if (resto === null) socket.destroy();
    });
    const ping = setInterval(() => manda(socket, 0x9, Buffer.alloc(0)), PING_MS);
    const sale = () => {
      clearInterval(ping);
      vivos.delete(socket);
      if (sala[rol] !== socket) return;
      sala[rol] = null;
      manda(otro(), 0x1, Buffer.from(SOLO));
      if (!sala.visor && !sala.cabeza) salas.delete(t);
    };
    socket.on('close', sale);
    socket.on('error', () => socket.destroy());
  });

  // Salas olvidadas: fuera.
  const limpieza = setInterval(() => {
    for (const [t, sala] of salas) {
      if (Date.now() - sala.ultimo > OCIOSA_MS) {
        sala.visor?.destroy();
        sala.cabeza?.destroy();
        salas.delete(t);
      }
    }
  }, 60 * 1000);
  limpieza.unref();
  servidor.on('close', () => clearInterval(limpieza));
  /** Cierra el servidor y todas sus conexiones. */
  servidor.cierra = () =>
    new Promise((ok) => {
      for (const s of vivos) s.destroy();
      servidor.close(() => ok());
    });
  return servidor;
}

module.exports = { creaServidor, PAR, SOLO };

// En el hosting (Passenger) y a mano con `node relevo.js`, escucha. Los tests
// ponen RELEVO_PRUEBA para usar creaServidor por su cuenta.
if (!process.env.RELEVO_PRUEBA) {
  const puerto = process.env.PORT || 3001;
  creaServidor().listen(puerto, () => console.log(`trainHIT relevo escuchando en ${puerto}`));
}
