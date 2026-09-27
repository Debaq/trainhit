// El relevo por WebSocket (servidor/relevo/relevo.js): que empareje a los dos
// de la misma sala, que pase los mensajes tal cual, y que no deje entrar a
// cualquiera.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.RELEVO_PRUEBA = '1';
const require = createRequire(import.meta.url);
const { creaServidor, PAR, SOLO } = require('../servidor/relevo/relevo.js');

const ORIGEN = 'http://localhost:8095';
const T = 'ab'.repeat(16);

async function levanta() {
  const s = creaServidor({ origenes: [ORIGEN] });
  await new Promise((ok) => s.listen(0, ok));
  return { s, url: `ws://localhost:${s.address().port}/` };
}

/** Un cliente que junta lo que recibe. `headers` lleva el Origin (Node lo permite). */
function cliente(url, rol, t = T, origen = ORIGEN) {
  const ws = new WebSocket(`${url}?t=${t}&rol=${rol}`, { headers: { Origin: origen } });
  ws.binaryType = 'arraybuffer';
  ws.recibido = [];
  ws.addEventListener('message', (e) => ws.recibido.push(e.data));
  ws.abierto = new Promise((ok, mal) => {
    ws.addEventListener('open', ok, { once: true });
    ws.addEventListener('error', mal, { once: true });
  });
  return ws;
}

const espera = (cond, ms = 2000) =>
  new Promise((ok, mal) => {
    const t0 = Date.now();
    const mira = () => (cond() ? ok() : Date.now() - t0 > ms ? mal(new Error('no llegó')) : setTimeout(mira, 10));
    mira();
  });

test('empareja a los dos de la sala y pasa texto y binario tal cual', async () => {
  const { s, url } = await levanta();
  const pc = cliente(url, 'visor');
  await pc.abierto;
  const tel = cliente(url, 'cabeza');
  await tel.abierto;
  await espera(() => pc.recibido.includes(PAR) && tel.recibido.includes(PAR));
  const datos = new Float32Array([1, 0.1, 0.2, 0.3, 0.9, 10, -20, 30]);
  tel.send(datos.buffer);
  pc.send('centrar');
  await espera(() => pc.recibido.some((d) => d instanceof ArrayBuffer) && tel.recibido.includes('centrar'));
  assert.deepEqual([...new Float32Array(pc.recibido.find((d) => d instanceof ArrayBuffer))], [...datos]);
  // Uno se va: al otro le avisan.
  tel.close();
  await espera(() => pc.recibido.includes(SOLO));
  pc.close();
  await s.cierra();
});

test('un mensaje largo (más de 125 bytes) pasa entero', async () => {
  const { s, url } = await levanta();
  const a = cliente(url, 'visor');
  const b = cliente(url, 'cabeza');
  await Promise.all([a.abierto, b.abierto]);
  const largo = 'x'.repeat(70000 > 64 * 1024 ? 60000 : 70000);
  a.send(largo);
  await espera(() => b.recibido.includes(largo));
  a.close();
  b.close();
  await s.cierra();
});

test('rechaza otro origen o una sala mal escrita', async () => {
  const { s, url } = await levanta();
  await assert.rejects(cliente(url, 'visor', T, 'https://otro.example').abierto);
  await assert.rejects(cliente(url, 'visor', 'corta').abierto);
  await s.cierra();
});

test('salas distintas no se mezclan', async () => {
  const { s, url } = await levanta();
  const a = cliente(url, 'visor', 'aa'.repeat(16));
  const b = cliente(url, 'cabeza', 'bb'.repeat(16));
  await Promise.all([a.abierto, b.abierto]);
  a.send('hola');
  await new Promise((ok) => setTimeout(ok, 200));
  assert.ok(!b.recibido.includes('hola') && !b.recibido.includes(PAR));
  a.close();
  b.close();
  await s.cierra();
});
