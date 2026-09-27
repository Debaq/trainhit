// node procesa.mjs <video> <salida.json>, desde la carpeta de los datos.
//
// Extrae los cuadros tal como los dio la cámara (MJPEG sin recodificar) y los
// pasa uno por uno por el mismo MediaPipe que usa la app (js/tracker.js), en un
// Chromium con ventana: sin ventana no hay GPU y va muy lento. Con TODOS=1 se
// guardan los 478 puntos de la malla; si no, solo los del ojo y unos pocos más.
//
// Necesita puppeteer-core instalado en la carpeta de los datos
// (`npm i puppeteer-core`) y Chromium en /usr/bin/chromium.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const { default: puppeteer } = await import(pathToFileURL(createRequire(join(process.cwd(), '/')).resolve('puppeteer-core')).href);
const [, , video, salida] = process.argv;
const dir = join(process.cwd(), 'cuadros');
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir);
const esMjpeg = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', video]).toString().trim() === 'mjpeg';
execFileSync('ffmpeg', ['-loglevel', 'error', '-i', video, ...(esMjpeg ? ['-c:v', 'copy'] : ['-q:v', '2']), '-fps_mode', 'passthrough', join(dir, '%05d.jpg')]);
const ts = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', video])
  .toString().trim().split('\n').map(Number);
const archivos = readdirSync(dir).sort();
const n = Math.min(ts.length, archivos.length);
const cuadros = archivos.slice(0, n).map((f, i) => ({ src: `cuadros/${f}`, t: ts[i] - ts[0] }));
console.log(`${n} cuadros (${esMjpeg ? 'sin recodificar' : 'recodificados'})`);

// Servidor mínimo: la página y los cuadros de acá, y js/ del repo.
const LAB = new URL('./', import.meta.url).pathname;
const JS = new URL('../../../js/', import.meta.url).pathname;
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.jpg': 'image/jpeg' };
const server = createServer((req, res) => {
  const ruta = decodeURIComponent(req.url.split('?')[0]);
  const archivo = ruta === '/lab.html' ? join(LAB, 'lab.html') : ruta.startsWith('/js/') ? join(JS, ruta.slice(4)) : ruta.startsWith('/cuadros/') ? join(dir, ruta.slice(9)) : null;
  if (!archivo || archivo.includes('..') || !existsSync(archivo)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TIPOS[extname(archivo)] ?? 'application/octet-stream' }).end(readFileSync(archivo));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const puerto = server.address().port;

const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: false, args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto(`http://127.0.0.1:${puerto}/lab.html`);
await p.waitForFunction('window.listo');
if (process.env.TODOS) await p.evaluate(() => { window.TODOS = true; });
console.log('delegate', await p.evaluate(() => window.prepara(true)));
const res = [];
for (let i = 0; i < n; i += 200) {
  res.push(...(await p.evaluate((c) => window.procesa(c), cuadros.slice(i, i + 200))));
  process.stdout.write(`\r${Math.min(i + 200, n)}/${n}`);
}
await b.close();
server.close();
rmSync(dir, { recursive: true, force: true });
writeFileSync(salida, JSON.stringify(res));
console.log(`\nsin cara: ${res.filter((r) => !r.p && !r.a).length}`);
