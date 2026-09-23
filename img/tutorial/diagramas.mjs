// Genera ganancia.svg, sacadas.svg y patrones.svg del tutorial: curvas
// sintéticas con la paleta de la app. Van dibujadas y no pedidas a un
// generador de imágenes porque son gráficos: un generador inventa la forma de
// las curvas, y la forma es justo lo que se enseña. Se corre con
// `node img/tutorial/diagramas.mjs`.
//
// Llevan texto adentro, así que salen una vez por idioma: `ganancia.svg` en
// español y `ganancia.en.svg` en inglés (la capa inglesa del tutorial,
// js/tutorial-pasos-en.js, apunta a esas).
import { writeFileSync } from 'node:fs';
const DEST = new URL('./', import.meta.url);
const C = { bg: '#09090b', grid: '#27272a', fg: '#fafafa', muted: '#a1a1aa', head: '#2e7dd6', eye: '#e8721c', covert: '#9b51d0', ok: '#2e9e54', bad: '#d62d2d' };
const W = 1600, H = 900;

// Impulso de cabeza: subida rápida, bajada algo más lenta (forma típica).
const cabeza = (t) => {
  const s = t < 90 ? 32 : 45;
  return 220 * Math.exp(-(((t - 90) / s) ** 2));
};
const gauss = (t, c, a, s) => a * Math.exp(-(((t - c) / s) ** 2));

/** Los rótulos de los tres dibujos, por idioma. El sufijo va antes de `.svg`. */
const IDIOMAS = {
  es: {
    sufijo: '',
    tiempo: 'tiempo →',
    cabeza: 'cabeza',
    ojo: 'ojo (invertido)',
    normal: ['Reflejo normal', 'ganancia ≈ 1: las curvas se tapan'],
    deficit: ['Reflejo deficitario', 'ganancia ≈ 0,45: la separación es el hallazgo'],
    ganancia: 'Ganancia: reflejo normal contra deficitario',
    sacadas: ['Sacadas correctivas', 'el ojo no alcanza y corrige con saltos'],
    durante: 'durante el impulso',
    despues: 'después',
    encubierta: 'encubierta',
    manifiesta: 'manifiesta',
    sacadasAlt: 'Sacadas correctivas encubierta y manifiesta',
    patrones: [
      ['Normal', 'cerca de 1 en los dos lados'],
      ['Déficit unilateral', 'un lado bajo, con sacadas de ese lado'],
      ['Déficit bilateral', 'los dos bajos: asimetría cerca de cero'],
      ['Sacadas encubiertas', 'la ganancia se lee normal: mirar la forma'],
    ],
    derecha: 'derecha',
    izquierda: 'izquierda',
    patronesAlt: 'Los cuatro patrones: normal, déficit unilateral, bilateral y sacadas encubiertas',
  },
  en: {
    sufijo: '.en',
    tiempo: 'time →',
    cabeza: 'head',
    ojo: 'eye (inverted)',
    normal: ['Normal reflex', 'gain ≈ 1: the curves overlap'],
    deficit: ['Deficient reflex', 'gain ≈ 0.45: the gap is the finding'],
    ganancia: 'Gain: normal reflex against deficient',
    sacadas: ['Corrective saccades', 'the eye falls short and corrects with jumps'],
    durante: 'during the impulse',
    despues: 'after',
    encubierta: 'covert',
    manifiesta: 'overt',
    sacadasAlt: 'Covert and overt corrective saccades',
    patrones: [
      ['Normal', 'close to 1 on both sides'],
      ['Unilateral deficit', 'one side low, with saccades on that side'],
      ['Bilateral deficit', 'both low: asymmetry close to zero'],
      ['Covert saccades', 'the gain reads normal: look at the shape'],
    ],
    derecha: 'right',
    izquierda: 'left',
    patronesAlt: 'The four patterns: normal, unilateral deficit, bilateral and covert saccades',
  },
};

function panel(x0, y0, w, h, series, { titulo, sub, tiempo }) {
  const t0 = -20, t1 = 420, vmax = 260;
  const px = (t) => x0 + ((t - t0) / (t1 - t0)) * w;
  const py = (v) => y0 + h - (v / vmax) * h;
  let s = '';
  s += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="none" stroke="${C.grid}" stroke-width="2" rx="6"/>`;
  for (const v of [100, 200]) s += `<line x1="${x0}" x2="${x0 + w}" y1="${py(v)}" y2="${py(v)}" stroke="${C.grid}" stroke-width="1.5" stroke-dasharray="6 8"/>`;
  s += `<text x="${x0 + 18}" y="${y0 + 46}" fill="${C.fg}" font-size="38" font-weight="700">${titulo}</text>`;
  s += `<text x="${x0 + 18}" y="${y0 + 90}" fill="${C.muted}" font-size="28">${sub}</text>`;
  for (const { f, color, ancho, relleno, guion } of series) {
    let d = '';
    for (let t = t0; t <= t1; t += 2) d += `${d ? 'L' : 'M'}${px(t).toFixed(1)},${py(Math.max(0, f(t))).toFixed(1)}`;
    if (relleno) s += `<path d="${d}L${px(t1)},${py(0)}L${px(t0)},${py(0)}Z" fill="${color}" fill-opacity="0.13"/>`;
    s += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${ancho ?? 6}" stroke-linejoin="round" stroke-linecap="round"${guion ? ` stroke-dasharray="${guion}"` : ''}/>`;
  }
  s += `<text x="${x0 + w - 18}" y="${y0 + h - 18}" fill="${C.muted}" font-size="24" text-anchor="end">${tiempo}</text>`;
  return { s, px, py };
}

function leyenda(y, items) {
  let s = '', x = 80;
  for (const [color, txt] of items) {
    s += `<rect x="${x}" y="${y - 20}" width="40" height="10" rx="5" fill="${color}"/>`;
    s += `<text x="${x + 54}" y="${y - 8}" fill="${C.muted}" font-size="28">${txt}</text>`;
    x += 54 + txt.length * 15 + 60;
  }
  return s;
}

const svg = (cuerpo, titulo) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" role="img" aria-label="${titulo}">
<rect width="${W}" height="${H}" fill="${C.bg}"/>
${cuerpo}
</svg>\n`;

for (const L of Object.values(IDIOMAS)) {
  const archivo = (nombre) => new URL(`${nombre}${L.sufijo}.svg`, DEST);
  const ley = () => leyenda(870, [[C.head, L.cabeza], [C.eye, L.ojo]]);

  // ── ganancia.svg: normal contra deficitario, sin sacadas, para aislar la idea.
  {
    const ojo = (g, lag = 8) => (t) => g * cabeza(t - lag);
    const a = panel(60, 60, 710, 700, [
      { f: cabeza, color: C.head, relleno: true },
      { f: ojo(0.97), color: C.eye, relleno: true, ancho: 5 },
    ], { titulo: L.normal[0], sub: L.normal[1], tiempo: L.tiempo });
    const b = panel(830, 60, 710, 700, [
      { f: cabeza, color: C.head, relleno: true },
      { f: ojo(0.45), color: C.eye, relleno: true, ancho: 5 },
    ], { titulo: L.deficit[0], sub: L.deficit[1], tiempo: L.tiempo });
    // Flecha de la separación en el pico.
    const tp = 92;
    const y1 = b.py(cabeza(tp)) + 10, y2 = b.py(0.45 * cabeza(tp - 8)) - 10, xf = b.px(tp) + 60;
    const flecha = `<line x1="${xf}" x2="${xf}" y1="${y1}" y2="${y2}" stroke="${C.fg}" stroke-width="3"/>
<path d="M${xf - 10},${y1 + 16}L${xf},${y1}L${xf + 10},${y1 + 16}M${xf - 10},${y2 - 16}L${xf},${y2}L${xf + 10},${y2 - 16}" fill="none" stroke="${C.fg}" stroke-width="3"/>`;
    const cuerpo = a.s + b.s + flecha + ley();
    writeFileSync(archivo('ganancia'), svg(cuerpo, L.ganancia));
  }

  // ── sacadas.svg: ganancia baja con una encubierta y una manifiesta.
  {
    const ojo = (t) => 0.4 * cabeza(t - 8) + gauss(t, 132, 165, 12) + gauss(t, 320, 150, 14);
    const p = panel(60, 60, 1480, 700, [
      { f: cabeza, color: C.head, relleno: true },
      { f: ojo, color: C.eye, ancho: 5 },
    ], { titulo: L.sacadas[0], sub: L.sacadas[1], tiempo: L.tiempo });
    const marca = (t, v, color, txt, dx) => {
      const x = p.px(t), y = p.py(v);
      return `<circle cx="${x}" cy="${y}" r="16" fill="none" stroke="${color}" stroke-width="4"/>
<line x1="${x + (dx > 0 ? 16 : -16)}" y1="${y - 6}" x2="${x + dx}" y2="${y - 50}" stroke="${color}" stroke-width="3"/>
<text x="${x + dx + (dx > 0 ? 10 : -10)}" y="${y - 50}" fill="${color}" font-size="30" font-weight="700" text-anchor="${dx > 0 ? 'start' : 'end'}">${txt}</text>`;
    };
    // Ventana del impulso, sombreada como en la app.
    const vx0 = p.px(35), vx1 = p.px(205);
    const ventana = `<rect x="${vx0}" y="${p.py(260) + 110}" width="${vx1 - vx0}" height="${p.py(0) - p.py(260) - 110}" fill="${C.fg}" fill-opacity="0.04"/>
<text x="${(vx0 + vx1) / 2}" y="${p.py(0) + 40}" fill="${C.muted}" font-size="24" text-anchor="middle">${L.durante}</text>
<text x="${p.px(320)}" y="${p.py(0) + 40}" fill="${C.muted}" font-size="24" text-anchor="middle">${L.despues}</text>`;
    const cuerpo = p.s + ventana +
      marca(132, ojo(132), C.covert, L.encubierta, 60) +
      marca(320, ojo(320), C.eye, L.manifiesta, 60) +
      ley();
    writeFileSync(archivo('sacadas'), svg(cuerpo, L.sacadasAlt));
  }

  // ── patrones.svg: los cuatro patrones que se buscan, cada uno con sus dos
  // lados. Mismas curvas que arriba, en chico: el alumno tiene que reconocer
  // la forma, no leer números.
  {
    const mini = (x0, y0, w, h, ojo) => {
      const t0 = -20, t1 = 420, vmax = 280;
      const px = (t) => x0 + ((t - t0) / (t1 - t0)) * w;
      const py = (v) => y0 + h - (v / vmax) * h;
      const linea = (f, color, ancho) => {
        let d = '';
        for (let t = t0; t <= t1; t += 3) d += `${d ? 'L' : 'M'}${px(t).toFixed(1)},${py(Math.max(0, f(t))).toFixed(1)}`;
        return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${ancho}" stroke-linejoin="round" stroke-linecap="round"/>`;
      };
      return `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="none" stroke="${C.grid}" stroke-width="2" rx="6"/>` +
        linea(cabeza, C.head, 5) + linea(ojo, C.eye, 4);
    };
    const sano = (t) => 0.97 * cabeza(t - 8);
    const manifiesta = (t) => 0.42 * cabeza(t - 8) + gauss(t, 300, 150, 14);
    const encubierta = (t) => 0.45 * cabeza(t - 8) + gauss(t, 118, 170, 12);
    const curvas = [
      [sano, sano],
      [manifiesta, sano],
      [manifiesta, manifiesta],
      [sano, encubierta],
    ];
    const patrones = L.patrones.map(([titulo, sub], i) => [titulo, sub, ...curvas[i]]);
    let cuerpo = '';
    patrones.forEach(([titulo, sub, der, izq], i) => {
      const x = 60 + (i % 2) * 750;
      const y = 50 + Math.floor(i / 2) * 400;
      cuerpo += `<text x="${x}" y="${y + 34}" fill="${C.fg}" font-size="34" font-weight="700">${titulo}</text>`;
      cuerpo += `<text x="${x}" y="${y + 72}" fill="${C.muted}" font-size="24">${sub}</text>`;
      cuerpo += mini(x, y + 96, 330, 250, der) + mini(x + 350, y + 96, 330, 250, izq);
      cuerpo += `<text x="${x + 12}" y="${y + 130}" fill="${C.muted}" font-size="22">${L.derecha}</text>`;
      cuerpo += `<text x="${x + 362}" y="${y + 130}" fill="${C.muted}" font-size="22">${L.izquierda}</text>`;
    });
    cuerpo += leyenda(880, [[C.head, L.cabeza], [C.eye, L.ojo]]);
    writeFileSync(archivo('patrones'), svg(cuerpo, L.patronesAlt));
  }
  console.log(`ganancia${L.sufijo}.svg, sacadas${L.sufijo}.svg y patrones${L.sufijo}.svg generados`);
}
