// Genera ganancia.svg y sacadas.svg del tutorial: curvas sintéticas con la
// paleta de la app. Van dibujadas y no pedidas a un generador de imágenes
// porque son gráficos: un generador inventa la forma de las curvas, y la forma
// es justo lo que se enseña. Se corre con `node img/tutorial/diagramas.mjs`.
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

function panel(x0, y0, w, h, series, { titulo, sub }) {
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
  s += `<text x="${x0 + w - 18}" y="${y0 + h - 18}" fill="${C.muted}" font-size="24" text-anchor="end">tiempo →</text>`;
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

// ── ganancia.svg: normal contra deficitario, sin sacadas, para aislar la idea.
{
  const ojo = (g, lag = 8) => (t) => g * cabeza(t - lag);
  const a = panel(60, 60, 710, 700, [
    { f: cabeza, color: C.head, relleno: true },
    { f: ojo(0.97), color: C.eye, relleno: true, ancho: 5 },
  ], { titulo: 'Reflejo normal', sub: 'ganancia ≈ 1: las curvas se tapan' });
  const b = panel(830, 60, 710, 700, [
    { f: cabeza, color: C.head, relleno: true },
    { f: ojo(0.45), color: C.eye, relleno: true, ancho: 5 },
  ], { titulo: 'Reflejo deficitario', sub: 'ganancia ≈ 0,45: la separación es el hallazgo' });
  // Flecha de la separación en el pico.
  const tp = 92;
  const y1 = b.py(cabeza(tp)) + 10, y2 = b.py(0.45 * cabeza(tp - 8)) - 10, xf = b.px(tp) + 60;
  const flecha = `<line x1="${xf}" x2="${xf}" y1="${y1}" y2="${y2}" stroke="${C.fg}" stroke-width="3"/>
<path d="M${xf - 10},${y1 + 16}L${xf},${y1}L${xf + 10},${y1 + 16}M${xf - 10},${y2 - 16}L${xf},${y2}L${xf + 10},${y2 - 16}" fill="none" stroke="${C.fg}" stroke-width="3"/>`;
  const cuerpo = a.s + b.s + flecha + leyenda(870, [[C.head, 'cabeza'], [C.eye, 'ojo (invertido)']]);
  writeFileSync(new URL('ganancia.svg', DEST), svg(cuerpo, 'Ganancia: reflejo normal contra deficitario'));
}

// ── sacadas.svg: ganancia baja con una encubierta y una manifiesta.
{
  const ojo = (t) => 0.4 * cabeza(t - 8) + gauss(t, 132, 165, 12) + gauss(t, 320, 150, 14);
  const p = panel(60, 60, 1480, 700, [
    { f: cabeza, color: C.head, relleno: true },
    { f: ojo, color: C.eye, ancho: 5 },
  ], { titulo: 'Sacadas correctivas', sub: 'el ojo no alcanza y corrige con saltos' });
  const marca = (t, v, color, txt, dx) => {
    const x = p.px(t), y = p.py(v);
    return `<circle cx="${x}" cy="${y}" r="16" fill="none" stroke="${color}" stroke-width="4"/>
<line x1="${x + (dx > 0 ? 16 : -16)}" y1="${y - 6}" x2="${x + dx}" y2="${y - 50}" stroke="${color}" stroke-width="3"/>
<text x="${x + dx + (dx > 0 ? 10 : -10)}" y="${y - 50}" fill="${color}" font-size="30" font-weight="700" text-anchor="${dx > 0 ? 'start' : 'end'}">${txt}</text>`;
  };
  // Ventana del impulso, sombreada como en la app.
  const vx0 = p.px(35), vx1 = p.px(205);
  const ventana = `<rect x="${vx0}" y="${p.py(260) + 110}" width="${vx1 - vx0}" height="${p.py(0) - p.py(260) - 110}" fill="${C.fg}" fill-opacity="0.04"/>
<text x="${(vx0 + vx1) / 2}" y="${p.py(0) + 40}" fill="${C.muted}" font-size="24" text-anchor="middle">durante el impulso</text>
<text x="${p.px(320)}" y="${p.py(0) + 40}" fill="${C.muted}" font-size="24" text-anchor="middle">después</text>`;
  const cuerpo = p.s + ventana +
    marca(132, ojo(132), C.covert, 'encubierta', 60) +
    marca(320, ojo(320), C.eye, 'manifiesta', 60) +
    leyenda(870, [[C.head, 'cabeza'], [C.eye, 'ojo (invertido)']]);
  writeFileSync(new URL('sacadas.svg', DEST), svg(cuerpo, 'Sacadas correctivas encubierta y manifiesta'));
}
console.log('ganancia.svg y sacadas.svg regenerados');
