// Genera las ocho ilustraciones del tutorial como SVG, con la guía de estilo
// de PROMPTS.md: plano, fondo de tarjeta, sin texto, y los colores con el
// significado de los gráficos —azul la cabeza, naranja el ojo y la mirada,
// verde bien, rojo mal y el punto de fijación—.
//
// Son esquemas, no ilustraciones de autor: están para que el tutorial no
// muestre recuadros de «imagen pendiente» y para que cada una cumpla su `alt`.
// Si llegan ilustraciones generadas con los prompts de PROMPTS.md, se cambia
// el nombre en tutorial-pasos.js y listo.
//
// Se corre con `node img/tutorial/ilustraciones.mjs`.
import { writeFileSync } from 'node:fs';

const DEST = new URL('./', import.meta.url);
const W = 1600;
const H = 900;
const C = {
  bg: '#18181b',
  linea: '#3f3f46',
  gris: '#52525b',
  grisClaro: '#71717a',
  tenue: '#27272a',
  head: '#2e7dd6',
  eye: '#e8721c',
  ok: '#2e9e54',
  bad: '#d62d2d',
  luz: '#d4b36a',
  pelo: '#27272a',
};
/** Tonos de piel apagados: varían entre ilustraciones, como pide la guía. */
const PIEL = ['#c8a58a', '#8d6a55', '#e0bfa5', '#a47c62'];
const ROPA = ['#3f4a5a', '#4a3f52', '#3f5249', '#57534e'];

const f = (n) => Number(n.toFixed(1));
const rad = (d) => (d * Math.PI) / 180;

const svg = (cuerpo, alt) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${alt}">
<defs>
  <marker id="pa" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0L10,5L0,10Z" fill="${C.head}"/></marker>
  <marker id="pn" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0L10,5L0,10Z" fill="${C.eye}"/></marker>
  <marker id="pg" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0L10,5L0,10Z" fill="${C.grisClaro}"/></marker>
</defs>
<rect width="${W}" height="${H}" fill="${C.bg}"/>
${cuerpo}
</svg>
`;

/** Arco de círculo como `path`, de `a0` a `a1` grados (0 = arriba, horario). */
function arco(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.sin(rad(a)), cy - r * Math.cos(rad(a))];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const grande = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const barrido = a1 > a0 ? 1 : 0;
  return `M${f(x0)},${f(y0)}A${r},${r} 0 ${grande} ${barrido} ${f(x1)},${f(y1)}`;
}

const flecha = (d, color = C.head, ancho = 12, marca = 'pa', extra = '') =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${ancho}" stroke-linecap="round" marker-end="url(#${marca})" ${extra}/>`;

const punto = (x, y, r = 16) =>
  `<circle cx="${x}" cy="${y}" r="${r + 10}" fill="${C.bad}" fill-opacity="0.18"/><circle cx="${x}" cy="${y}" r="${r}" fill="${C.bad}"/>`;

/**
 * Cabeza vista desde ARRIBA, mirando hacia `ang` grados (0 = arriba de la
 * imagen). Los ojos quedan al frente; `mirada` (grados, en el marco de la
 * imagen) es hacia dónde apuntan, que con el reflejo no es hacia donde mira
 * la nariz.
 */
function cabezaArriba(cx, cy, r, ang, { piel = PIEL[0], mirada = ang, blanco = null, ojos = true } = {}) {
  const rot = (x, y) => {
    const a = rad(ang);
    return [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)];
  };
  let s = `<g>`;
  // orejas
  for (const lado of [-1, 1]) {
    const [ox, oy] = rot(lado * r * 0.98, r * 0.05);
    s += `<ellipse cx="${f(ox)}" cy="${f(oy)}" rx="${r * 0.14}" ry="${r * 0.24}" transform="rotate(${ang} ${f(ox)} ${f(oy)})" fill="${piel}"/>`;
  }
  s += `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 1.08}" transform="rotate(${ang} ${cx} ${cy})" fill="${piel}"/>`;
  // pelo: desde arriba se ve casi todo pelo, menos la frente y la cara
  const [hx, hy] = rot(0, r * 0.2);
  s += `<ellipse cx="${f(hx)}" cy="${f(hy)}" rx="${r * 0.93}" ry="${r * 0.9}" transform="rotate(${ang} ${f(hx)} ${f(hy)})" fill="${C.pelo}"/>`;
  // nariz
  const [nx, ny] = rot(0, -r * 1.2);
  const [n0x, n0y] = rot(-r * 0.14, -r * 1.0);
  const [n1x, n1y] = rot(r * 0.14, -r * 1.0);
  s += `<path d="M${f(n0x)},${f(n0y)}L${f(nx)},${f(ny)}L${f(n1x)},${f(n1y)}Z" fill="${piel}"/>`;
  if (ojos) {
    for (const lado of [-1, 1]) {
      const [ex, ey] = rot(lado * r * 0.42, -r * 0.8);
      s += `<circle cx="${f(ex)}" cy="${f(ey)}" r="${r * 0.13}" fill="#f4f4f5"/>`;
      // el iris corrido hacia donde mira
      const d = rad(mirada);
      s += `<circle cx="${f(ex + Math.sin(d) * r * 0.06)}" cy="${f(ey - Math.cos(d) * r * 0.06)}" r="${r * 0.07}" fill="${C.eye}"/>`;
      if (blanco) {
        s += `<line x1="${f(ex)}" y1="${f(ey)}" x2="${blanco[0]}" y2="${blanco[1]}" stroke="${C.eye}" stroke-width="4" stroke-dasharray="14 12" stroke-opacity="0.8"/>`;
      }
    }
  }
  return `${s}</g>`;
}

/** Cara de FRENTE, con el giro `yaw` sugerido corriendo los rasgos. */
function caraFrente(cx, cy, r, { piel = PIEL[1], yaw = 0, mirada = 0, pelo = C.pelo } = {}) {
  const dx = (yaw / 45) * r * 0.5;
  let s = '';
  s += `<ellipse cx="${cx - r * 0.98}" cy="${cy + r * 0.1}" rx="${r * 0.14}" ry="${r * 0.25}" fill="${piel}"/>`;
  s += `<ellipse cx="${cx + r * 0.98}" cy="${cy + r * 0.1}" rx="${r * 0.14}" ry="${r * 0.25}" fill="${piel}"/>`;
  s += `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 1.22}" fill="${piel}"/>`;
  s += `<path d="M${cx - r * 1.02},${cy - r * 0.2}Q${cx - r},${cy - r * 1.45} ${cx},${cy - r * 1.3}Q${cx + r},${cy - r * 1.45} ${cx + r * 1.02},${cy - r * 0.2}Q${cx + r * 0.7},${cy - r * 0.95} ${cx},${cy - r * 0.9}Q${cx - r * 0.7},${cy - r * 0.95} ${cx - r * 1.02},${cy - r * 0.2}Z" fill="${pelo}"/>`;
  for (const lado of [-1, 1]) {
    const ex = cx + dx + lado * r * 0.4;
    const ey = cy - r * 0.12;
    s += `<ellipse cx="${f(ex)}" cy="${f(ey)}" rx="${r * 0.2}" ry="${r * 0.11}" fill="#f4f4f5"/>`;
    s += `<circle cx="${f(ex + mirada * r * 0.08)}" cy="${f(ey)}" r="${r * 0.085}" fill="${C.eye}"/>`;
    s += `<path d="M${f(ex - r * 0.22)},${f(ey - r * 0.2)}Q${f(ex)},${f(ey - r * 0.3)} ${f(ex + r * 0.22)},${f(ey - r * 0.2)}" stroke="${pelo}" stroke-width="${r * 0.05}" fill="none" stroke-linecap="round"/>`;
  }
  s += `<path d="M${f(cx + dx)},${f(cy - r * 0.05)}L${f(cx + dx * 1.3 + r * 0.06)},${f(cy + r * 0.3)}L${f(cx + dx - r * 0.02)},${f(cy + r * 0.33)}" stroke="#00000033" stroke-width="${r * 0.05}" fill="none" stroke-linejoin="round"/>`;
  s += `<path d="M${f(cx + dx - r * 0.25)},${f(cy + r * 0.6)}Q${f(cx + dx)},${f(cy + r * 0.72)} ${f(cx + dx + r * 0.25)},${f(cy + r * 0.6)}" stroke="#00000044" stroke-width="${r * 0.05}" fill="none" stroke-linecap="round"/>`;
  return s;
}

/** Laptop de perfil, con la pantalla hacia la izquierda o la derecha. */
function laptopPerfil(x, y, escala = 1, haciaDerecha = true) {
  const s = escala;
  const d = haciaDerecha ? 1 : -1;
  const base = `<rect x="${x - 150 * s}" y="${y}" width="${300 * s}" height="${14 * s}" rx="${4 * s}" fill="${C.grisClaro}"/>`;
  const bx = x - d * 140 * s;
  const tapa = `<path d="M${bx},${y}L${bx - d * 40 * s},${y - 210 * s}L${bx - d * 58 * s},${y - 206 * s}L${bx - d * 18 * s},${y + 4 * s}Z" fill="${C.gris}"/>`;
  const cam = [bx - d * 49 * s, y - 196 * s];
  return { s: base + tapa + `<circle cx="${f(cam[0])}" cy="${f(cam[1])}" r="${5 * s}" fill="#a1a1aa"/>`, cam };
}

/** Persona sentada de perfil mirando hacia la izquierda (d = -1) o la derecha (d = 1). */
function sentadaPerfil(x, y, { piel = PIEL[0], ropa = ROPA[0], d = -1, flexion = 0 } = {}) {
  let s = '';
  // silla
  s += `<rect x="${x - 110}" y="${y + 150}" width="220" height="22" rx="8" fill="${C.linea}"/>`;
  s += `<rect x="${x - d * 100 - 12}" y="${y - 40}" width="24" height="210" rx="8" fill="${C.linea}"/>`;
  s += `<rect x="${x - 100}" y="${y + 170}" width="16" height="170" fill="${C.linea}"/><rect x="${x + 84}" y="${y + 170}" width="16" height="170" fill="${C.linea}"/>`;
  // piernas
  s += `<path d="M${x - d * 60},${y + 140}L${x + d * 130},${y + 140}L${x + d * 130},${y + 330}" stroke="${ropa}" stroke-width="60" fill="none" stroke-linejoin="round" stroke-linecap="round" stroke-opacity="0.85"/>`;
  // torso
  s += `<rect x="${x - 70}" y="${y - 120}" width="140" height="280" rx="60" fill="${ropa}"/>`;
  // cuello y cabeza, con la flexión hacia adelante
  const hx = x + d * 20 + d * Math.sin(rad(flexion)) * 60;
  const hy = y - 190 + (1 - Math.cos(rad(flexion))) * 40;
  s += `<rect x="${x - 20}" y="${y - 160}" width="40" height="60" fill="${piel}"/>`;
  s += cabezaPerfil(hx, hy, 78, { piel, d, flexion });
  return { s, cabeza: [hx, hy] };
}

/** Cabeza de perfil; `flexion` inclina la cara hacia abajo. */
function cabezaPerfil(cx, cy, r, { piel = PIEL[0], d = -1, flexion = 0 } = {}) {
  const a = d * flexion; // hacia abajo del lado de la cara
  let s = `<g transform="rotate(${-a} ${cx} ${cy})">`;
  s += `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 1.12}" fill="${piel}"/>`;
  s += `<path d="M${cx - d * r * 0.95},${cy + r * 0.1}Q${cx - d * r * 1.05},${cy - r * 1.2} ${cx + d * r * 0.3},${cy - r * 1.1}Q${cx + d * r * 0.9},${cy - r * 0.95} ${cx + d * r * 0.95},${cy - r * 0.45}Q${cx + d * r * 0.2},${cy - r * 0.7} ${cx - d * r * 0.2},${cy - r * 0.2}Z" fill="${C.pelo}"/>`;
  s += `<path d="M${cx + d * r * 0.95},${cy - r * 0.05}L${cx + d * r * 1.22},${cy + r * 0.2}L${cx + d * r * 0.95},${cy + r * 0.3}Z" fill="${piel}"/>`;
  s += `<ellipse cx="${cx - d * r * 0.1}" cy="${cy + r * 0.05}" rx="${r * 0.13}" ry="${r * 0.22}" fill="#00000026"/>`;
  s += `<circle cx="${cx + d * r * 0.66}" cy="${cy - r * 0.18}" r="${r * 0.08}" fill="${C.eye}"/>`;
  return `${s}</g>`;
}

/** Recuadro de «bien» o «mal», con su tilde o su cruz: sin texto. */
function recuadro(x, y, w, h, bien) {
  const color = bien ? C.ok : C.bad;
  const mx = x + w - 60;
  const my = y + 60;
  const signo = bien
    ? `<path d="M${mx - 22},${my}L${mx - 6},${my + 18}L${mx + 24},${my - 18}" stroke="${color}" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="M${mx - 20},${my - 20}L${mx + 20},${my + 20}M${mx + 20},${my - 20}L${mx - 20},${my + 20}" stroke="${color}" stroke-width="10" stroke-linecap="round"/>`;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="${color}" fill-opacity="0.06" stroke="${color}" stroke-width="6"/>${signo}`;
}

/** Mano vista desde arriba o de frente: palma y cuatro dedos, rotada `ang`. */
function mano(x, y, ang, piel, escala = 1) {
  const s = escala;
  let d = `<g transform="translate(${x} ${y}) rotate(${ang}) scale(${s})">`;
  d += `<rect x="-38" y="-30" width="76" height="80" rx="30" fill="${piel}" stroke="#00000033" stroke-width="3"/>`;
  for (let i = 0; i < 4; i++) d += `<rect x="${-36 + i * 19}" y="-92" width="17" height="72" rx="8" fill="${piel}" stroke="#00000033" stroke-width="3"/>`;
  d += `<rect x="30" y="-10" width="16" height="52" rx="8" transform="rotate(-35 38 16)" fill="${piel}" stroke="#00000033" stroke-width="3"/>`;
  return `${d}</g>`;
}

const imagenes = {};

// ── 1. portada: examinador detrás del paciente sentado frente a la laptop ──
{
  let s = '';
  s += `<rect x="120" y="560" width="520" height="22" rx="6" fill="${C.linea}"/><rect x="150" y="582" width="18" height="260" fill="${C.linea}"/><rect x="590" y="582" width="18" height="260" fill="${C.linea}"/>`;
  const lap = laptopPerfil(390, 546, 1.1, true);
  s += lap.s;
  const pac = sentadaPerfil(900, 420, { piel: PIEL[1], ropa: ROPA[1], d: -1, flexion: 20 });
  // examinador de pie detrás, a la derecha
  const ex = 1180;
  s += `<rect x="${ex - 80}" y="330" width="160" height="330" rx="70" fill="${ROPA[0]}"/>`;
  s += `<rect x="${ex - 60}" y="640" width="50" height="220" rx="20" fill="${ROPA[0]}"/><rect x="${ex + 10}" y="640" width="50" height="220" rx="20" fill="${ROPA[0]}"/>`;
  s += cabezaPerfil(ex - 10, 250, 80, { piel: PIEL[2], d: -1, flexion: 25 });
  // brazos hacia la cabeza del paciente, manos arriba de la cabeza
  const [hx, hy] = pac.cabeza;
  s += `<path d="M${ex - 60},380Q${ex - 170},330 ${hx + 60},${hy - 70}" stroke="${ROPA[0]}" stroke-width="44" fill="none" stroke-linecap="round"/>`;
  s += pac.s;
  s += mano(hx + 10, hy - 78, -100, PIEL[2], 0.8);
  s += `<line x1="${lap.cam[0]}" y1="${lap.cam[1]}" x2="${hx - 60}" y2="${hy - 10}" stroke="${C.eye}" stroke-width="4" stroke-dasharray="14 12" stroke-opacity="0.7"/>`;
  // La portada se ve recortada a 16:5 (la franja de y 200 a 700): se achica
  // y se baja para que las cabezas y las manos queden adentro.
  s = `<g transform="translate(160 150) scale(0.8)">${s}</g>`;
  imagenes['portada.svg'] = svg(s, 'Un examinador de pie detrás de un paciente sentado frente a una laptop, con las manos sobre la cabeza del paciente.');
}

// ── 2. vor: la cabeza gira y los ojos giran al revés, mirando fijo al blanco ──
{
  const blanco = [800, 110];
  let s = punto(...blanco, 18);
  const cx = 800;
  const cy = 560;
  // la cabeza girada 18° a la derecha de la imagen; los ojos compensan
  s += cabezaArriba(cx, cy, 170, 18, { piel: PIEL[0], mirada: 0, blanco });
  s += flecha(arco(cx, cy, 290, 2, 30), C.head, 14, 'pa');
  // flechas naranjas: los ojos al revés
  s += flecha(arco(cx, cy - 150, 120, -8, -38), C.eye, 10, 'pn');
  imagenes['vor.svg'] = svg(s, 'Cabeza vista desde arriba girando hacia un lado (flecha azul) y los ojos girando hacia el otro (flechas naranjas), con la línea de mirada fija sobre un blanco.');
}

// ── 3. impulso: el examinador detrás gira la cabeza un ángulo chico y rápido ──
{
  const blanco = [800, 100];
  let s = punto(...blanco, 16);
  const cx = 800;
  const cy = 520;
  // el examinador: hombros detrás
  s += `<ellipse cx="${cx}" cy="${cy + 250}" rx="330" ry="110" fill="${ROPA[2]}"/>`;
  s += cabezaArriba(cx, cy + 300, 110, 0, { piel: PIEL[3], ojos: false });
  // el paciente: hombros y cabeza
  s += `<ellipse cx="${cx}" cy="${cy + 40}" rx="270" ry="80" fill="${ROPA[3]}"/>`;
  s += cabezaArriba(cx, cy - 40, 140, 12, { piel: PIEL[2], mirada: 0, blanco });
  // brazos del examinador y manos sobre la parte alta de la cabeza
  s += `<path d="M${cx - 260},${cy + 220}Q${cx - 300},${cy + 40} ${cx - 150},${cy - 20}" stroke="${ROPA[2]}" stroke-width="54" fill="none" stroke-linecap="round"/>`;
  s += `<path d="M${cx + 260},${cy + 220}Q${cx + 300},${cy + 40} ${cx + 150},${cy - 20}" stroke="${ROPA[2]}" stroke-width="54" fill="none" stroke-linecap="round"/>`;
  s += mano(cx - 118, cy - 40, 65, PIEL[3], 0.95);
  s += mano(cx + 118, cy - 40, -65, PIEL[3], 0.95);
  // giro chico y rápido: arco corto con líneas de velocidad
  s += flecha(arco(cx, cy - 40, 245, -4, 16), C.head, 16, 'pa');
  for (let i = 0; i < 3; i++) s += `<path d="${arco(cx, cy - 40, 275 + i * 24, -10 + i * 2, 2 + i)}" stroke="${C.head}" stroke-width="6" stroke-opacity="${0.55 - i * 0.15}" fill="none" stroke-linecap="round"/>`;
  imagenes['impulso.svg'] = svg(s, 'Examinador detrás del paciente girando su cabeza un ángulo chico y rápido; el paciente mira fijo un punto al frente.');
}

// ── 4. montaje: cámara a la altura de los ojos, a un brazo, luz de frente ──
{
  let s = '';
  // mesa y laptop a la izquierda, la luz detrás de la laptop
  s += `<rect x="140" y="540" width="480" height="22" rx="6" fill="${C.linea}"/><rect x="170" y="562" width="18" height="280" fill="${C.linea}"/><rect x="570" y="562" width="18" height="280" fill="${C.linea}"/>`;
  // soporte: la laptop sobre libros, para que la cámara quede a la altura de los ojos
  s += `<rect x="300" y="490" width="260" height="50" rx="6" fill="${C.gris}"/><rect x="310" y="450" width="240" height="40" rx="6" fill="${C.grisClaro}" fill-opacity="0.6"/>`;
  const lap = laptopPerfil(430, 436, 1, true);
  s += lap.s;
  // lámpara de frente al paciente
  s += `<rect x="92" y="200" width="16" height="640" fill="${C.linea}"/><path d="M60,230L140,230L120,170L80,170Z" fill="${C.gris}"/>`;
  for (const a of [-12, 0, 12]) s += `<line x1="150" y1="${220 + a * 3}" x2="${720}" y2="${250 + a * 10}" stroke="${C.luz}" stroke-width="6" stroke-opacity="0.35" stroke-linecap="round"/>`;
  const pac = sentadaPerfil(960, 440, { piel: PIEL[2], ropa: ROPA[2], d: -1 });
  s += pac.s;
  const [hx, hy] = pac.cabeza;
  // la mirada a la cámara, horizontal: cámara a la altura de los ojos
  s += `<line x1="${lap.cam[0]}" y1="${lap.cam[1]}" x2="${hx - 50}" y2="${hy - 14}" stroke="${C.eye}" stroke-width="5" stroke-dasharray="14 12"/>`;
  // a un brazo: la distancia con topes
  const yb = 170;
  s += `<line x1="${lap.cam[0]}" y1="${yb}" x2="${hx - 60}" y2="${yb}" stroke="${C.grisClaro}" stroke-width="5" marker-start="url(#pg)" marker-end="url(#pg)"/>`;
  // la ventana detrás del paciente, tachada
  s += `<rect x="1260" y="150" width="240" height="300" rx="8" fill="${C.luz}" fill-opacity="0.12" stroke="${C.grisClaro}" stroke-width="6"/><line x1="1380" y1="150" x2="1380" y2="450" stroke="${C.grisClaro}" stroke-width="6"/><line x1="1260" y1="300" x2="1500" y2="300" stroke="${C.grisClaro}" stroke-width="6"/>`;
  s += `<path d="M1240,130L1520,470M1520,130L1240,470" stroke="${C.bad}" stroke-width="14" stroke-linecap="round"/>`;
  imagenes['montaje.svg'] = svg(s, 'Paciente sentado frente a una laptop con la cámara a la altura de los ojos, a un brazo de distancia, con la luz de frente y sin ventana detrás.');
}

// ── 5. postura: la cabeza flexionada ~30° y la mirada en la cámara ──
{
  let s = '';
  const lap = laptopPerfil(360, 560, 1.15, true);
  s += `<rect x="120" y="574" width="480" height="22" rx="6" fill="${C.linea}"/>`;
  s += lap.s;
  const cx = 1040;
  const cy = 430;
  s += `<rect x="${cx - 60}" y="${cy + 150}" width="200" height="320" rx="80" fill="${ROPA[1]}"/>`;
  s += `<rect x="${cx}" y="${cy + 90}" width="60" height="90" fill="${PIEL[3]}"/>`;
  s += cabezaPerfil(cx, cy, 150, { piel: PIEL[3], d: -1, flexion: 30 });
  // el plano del canal lateral, horizontal con la flexión, en azul
  s += `<line x1="${cx - 250}" y1="${cy + 10}" x2="${cx + 230}" y2="${cy + 10}" stroke="${C.head}" stroke-width="8" stroke-dasharray="24 14"/>`;
  // el ángulo de 30°: de la vertical al eje de la cabeza
  s += `<line x1="${cx + 30}" y1="${cy - 330}" x2="${cx + 30}" y2="${cy + 40}" stroke="${C.grisClaro}" stroke-width="5" stroke-dasharray="10 10"/>`;
  const a = rad(30);
  s += `<line x1="${cx + 30}" y1="${cy + 40}" x2="${f(cx + 30 - Math.sin(a) * 370)}" y2="${f(cy + 40 - Math.cos(a) * 370)}" stroke="${C.head}" stroke-width="6"/>`;
  s += flecha(arco(cx + 30, cy + 40, 300, -1, -27), C.head, 8, 'pa');
  // la mirada a la cámara
  const ojo = [cx - 105, cy - 20];
  s += `<line x1="${ojo[0]}" y1="${ojo[1]}" x2="${lap.cam[0]}" y2="${lap.cam[1]}" stroke="${C.eye}" stroke-width="5" stroke-dasharray="14 12"/>`;
  s += punto(lap.cam[0], lap.cam[1] - 26, 9);
  imagenes['postura.svg'] = svg(s, 'Vista de perfil: la cabeza del paciente flexionada unos 30° hacia abajo, con la mirada puesta en la cámara.');
}

// ── 6. manos: bien arriba de la cabeza; mal sobre sienes y cejas ──
{
  let s = recuadro(60, 70, 700, 760, true) + recuadro(840, 70, 700, 760, false);
  const cara = (cx) => caraFrente(cx, 480, 170, { piel: PIEL[0] }) + `<rect x="${cx - 190}" y="700" width="380" height="130" rx="60" fill="${ROPA[3]}"/>`;
  s += cara(410);
  s += mano(300, 330, -60, PIEL[1], 1.05) + mano(520, 330, 60, PIEL[1], 1.05);
  s += cara(1190);
  // mal: dedos sobre las sienes y las cejas
  s += mano(1015, 420, 75, PIEL[1], 1.1) + mano(1365, 420, -75, PIEL[1], 1.1);
  imagenes['manos.svg'] = svg(s, 'Dos cuadros. Bien, con borde verde: manos sobre la parte alta de la cabeza, cara despejada. Mal, con borde rojo: dedos sobre las sienes y cejas, tapando la cara.');
}

// ── 7. calibración: mirar el punto sin soltarlo y girar lento ±20° ──
{
  const blanco = [800, 200];
  let s = punto(...blanco, 20);
  const cx = 800;
  const cy = 520;
  s += `<rect x="${cx - 230}" y="${cy + 190}" width="460" height="200" rx="90" fill="${ROPA[0]}"/>`;
  s += caraFrente(cx, cy, 160, { piel: PIEL[3], yaw: 18, mirada: -0.9 });
  // arco de ±20°, doble flecha, trazo largo y parejo: lento
  s += `<path d="${arco(cx, cy + 40, 330, -20, 20)}" fill="none" stroke="${C.head}" stroke-width="12" stroke-linecap="round" marker-start="url(#pa)" marker-end="url(#pa)"/>`;
  for (const a of [-20, 20]) {
    const p = (r) => [cx + r * Math.sin(rad(a)), cy + 40 - r * Math.cos(rad(a))];
    const [x0, y0] = p(230);
    const [x1, y1] = p(330);
    s += `<line x1="${f(x0)}" y1="${f(y0)}" x2="${f(x1)}" y2="${f(y1)}" stroke="${C.head}" stroke-width="4" stroke-dasharray="8 10" stroke-opacity="0.6"/>`;
  }
  // la mirada, clavada en el punto: desde cada ojo (ver `caraFrente`)
  const dx = (18 / 45) * 160 * 0.5;
  for (const lado of [-1, 1]) {
    s += `<line x1="${f(cx + dx + lado * 64)}" y1="${f(cy - 19)}" x2="${blanco[0]}" y2="${blanco[1]}" stroke="${C.eye}" stroke-width="4" stroke-dasharray="14 12"/>`;
  }
  imagenes['calibracion.svg'] = svg(s, 'Paciente mirando fijo un punto rojo mientras gira la cabeza lento de un lado al otro, con un arco de ±20° dibujado.');
}

// ── 8. impulsos: bien corto y rápido (~15°); mal amplio y lento (>40°) ──
{
  let s = recuadro(60, 70, 700, 760, true) + recuadro(840, 70, 700, 760, false);
  const cabeza = (cx, ang) => `<ellipse cx="${cx}" cy="560" rx="200" ry="70" fill="${ROPA[1]}"/>` + cabezaArriba(cx, 500, 125, ang, { piel: PIEL[1] });
  s += cabeza(410, 15);
  s += flecha(arco(410, 500, 215, -2, 16), C.head, 16, 'pa');
  for (let i = 0; i < 3; i++) s += `<path d="${arco(410, 500, 245 + i * 24, -8 + i * 2, 3 + i)}" stroke="${C.head}" stroke-width="6" stroke-opacity="${0.55 - i * 0.15}" fill="none" stroke-linecap="round"/>`;
  s += cabeza(1190, 45);
  // mal: arco amplio, en trazos: lento
  s += flecha(arco(1190, 500, 215, -2, 50), C.head, 12, 'pa', 'stroke-dasharray="4 22"');
  imagenes['impulsos.svg'] = svg(s, 'Cabeza vista desde arriba en dos cuadros. Bien, borde verde: giro corto y rápido de unos 15°. Mal, borde rojo: giro amplio y lento de más de 40°.');
}

for (const [nombre, contenido] of Object.entries(imagenes)) {
  writeFileSync(new URL(nombre, DEST), contenido);
  console.log(`${nombre}: ${(contenido.length / 1024).toFixed(1)} KB`);
}
