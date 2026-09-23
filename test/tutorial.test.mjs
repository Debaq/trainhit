// Los paseos del tutorial tienen que apuntar a cosas que existen: una clase
// renombrada en index.html o una imagen que nadie encargó rompen el tutorial
// sin que nada falle a la vista. Y el paciente de ejemplo tiene que ser el que
// dicen los textos: si el motor cambia y el lado sano deja de dar ~1, los
// paseos enseñan algo falso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ACCIONES, CONDICIONES, LUGARES, PASEOS, PORTADA } from '../js/tutorial-pasos.js';
import { K_EJEMPLO, PULSOS_EJEMPLO, calibracionDeEjemplo, crudoDeEjemplo } from '../js/ejemplo.js';
import { procesaCrudo } from '../js/pipeline.js';
import { CONFIG, resumenLado } from '../js/analysis.js';
import * as geom from '../js/geom.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const prompts = readFileSync(new URL('../img/tutorial/PROMPTS.md', import.meta.url), 'utf8');
const pasos = PASEOS.flatMap((p) => p.pasos.map((x) => ({ ...x, paseo: p.id })));

test('los ids de paseos y de pasos no se repiten', () => {
  const ids = PASEOS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const p of PASEOS) {
    const ps = p.pasos.map((x) => x.id);
    assert.equal(new Set(ps).size, ps.length, p.id);
    assert.ok(p.titulo && p.resumen && ps.length, p.id);
  }
});

test('cada objetivo existe en index.html', () => {
  // Alcanza con que cada id o clase del selector aparezca: no hay DOM en node.
  for (const p of pasos.filter((x) => x.objetivo)) {
    for (const [, tipo, nombre] of p.objetivo.matchAll(/([#.])([\w-]+)/g)) {
      const re = tipo === '#' ? new RegExp(`id="${nombre}"`) : new RegExp(`class="[^"]*\\b${nombre}\\b`);
      assert.match(html, re, `${p.paseo}/${p.id}: ${tipo}${nombre} no está en index.html`);
    }
  }
});

test('cada imagen existe o está encargada en PROMPTS.md', () => {
  for (const p of [...pasos.filter((x) => x.img), { ...PORTADA, id: 'portada' }]) {
    const hay = existsSync(new URL(`../img/tutorial/${p.img}`, import.meta.url));
    assert.ok(hay || prompts.includes(`\`${p.img}\``), `${p.id}: ${p.img} ni está ni tiene prompt`);
    assert.ok(p.alt, `${p.id}: imagen sin alt`);
  }
});

test('esperas, acciones y lugares son los que el tutorial conoce', () => {
  for (const p of pasos) {
    const donde = `${p.paseo}/${p.id}`;
    if (p.espera) assert.ok(p.espera in CONDICIONES, `${donde}: espera ${p.espera}`);
    if (p.antes) assert.ok(ACCIONES.includes(p.antes), `${donde}: acción ${p.antes}`);
    if (p.lugar) assert.ok(LUGARES.includes(p.lugar), `${donde}: lugar ${p.lugar}`);
    for (const [, a] of p.cuerpo.matchAll(/data-accion="([^"]+)"/g)) assert.ok(ACCIONES.includes(a), `${donde}: botón ${a}`);
  }
});

test('lo que un paseo rompe a propósito se deshace al salir', () => {
  for (const p of PASEOS) if (p.alSalir) assert.ok(ACCIONES.includes(p.alSalir), `${p.id}: alSalir ${p.alSalir}`);
  // El experimento de k = 0 va último: los pasos que vienen después se
  // leerían con ganancias de ~1,9.
  const h = PASEOS.find((p) => p.id === 'herramientas');
  assert.equal(h.pasos.at(-1).id, 'kmanual');
  assert.equal(h.alSalir, 'restauraK');
});

function ejemplos(cfg = CONFIG, deriv = { windowMs: 50, degree: 2 }) {
  const model = new geom.EyeModel();
  model.kParallax = K_EJEMPLO;
  model.calibrated = true;
  return PULSOS_EJEMPLO.map((p, i) => {
    const { crudo, tTrigger } = crudoDeEjemplo(p, i + 1);
    return { ...procesaCrudo(crudo, tTrigger, model, deriv, cfg), esperado: p };
  });
}

test('el paciente de ejemplo es el que describen los paseos', () => {
  const ts = ejemplos();
  for (const t of ts) assert.equal(t.side, t.esperado.lado);
  // Sano a la derecha, déficit a la izquierda: la asimetría sale positiva.
  const der = resumenLado(ts, 'derecha');
  const izq = resumenLado(ts, 'izquierda');
  assert.ok(Math.abs(der.media - 0.96) < 0.05, `derecha ${der.media}`);
  assert.ok(izq.media < CONFIG.gainNormalMin, `izquierda ${izq.media}`);
  // «alguno se lee normal porque una sacada encubierta le tapó el déficit»
  assert.ok(ts.some((t) => t.side === 'izquierda' && t.gain > 0.95));
  // uno lento y uno con parpadeo, los dos del lado derecho
  assert.deepEqual(ts.filter((t) => t.rejected).map((t) => [t.side, t.rejected]), [['derecha', 'lento'], ['derecha', 'parpadeo']]);
});

test('las perillas hacen con los ejemplos lo que dicen los paseos', () => {
  // Ventana de 200 ms: «varios pulsos pasan a MUY LENTO».
  assert.ok(ejemplos(CONFIG, { windowMs: 200, degree: 2 }).filter((t) => t.rejected === 'lento').length >= 3);
  // Pico mínimo en 80: «el pulso lento pasa a aceptado».
  const flojo = { ...CONFIG, accept: { ...CONFIG.accept, peakMinDegS: 80 } };
  assert.ok(!ejemplos(flojo).some((t) => t.rejected === 'lento'));
  // k = 0: «las ganancias del lado sano pasan a ~1,9».
  const model = new geom.EyeModel();
  const { crudo, tTrigger } = crudoDeEjemplo(PULSOS_EJEMPLO[0], 1);
  const g = procesaCrudo(crudo, tTrigger, model, { windowMs: 50, degree: 2 }, CONFIG).gain;
  assert.ok(g > 1.8 && g < 2, `k=0 da ${g}`);
});

test('la perilla de parpadeo se recalcula sobre pulsos ya medidos', () => {
  // «Probá subirlo a 0,90 y recalculá: el pulso con parpadeo pasa a aceptado».
  assert.ok(ejemplos().some((t) => t.rejected === 'parpadeo'));
  assert.ok(!ejemplos({ ...CONFIG, blinkScore: 0.9 }).some((t) => t.rejected === 'parpadeo'));
});

test('la calibración de ejemplo se acepta y recupera su k', () => {
  const fit = geom.fitParallax(calibracionDeEjemplo(), geom.EYE_ROTATION_RADIUS_MM);
  assert.ok(fit.acceptable, fit.issue);
  assert.ok(Math.abs(fit.kParallax - K_EJEMPLO) < 0.03, `k ${fit.kParallax}`);
});
