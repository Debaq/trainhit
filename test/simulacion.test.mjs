// El paciente simulado tiene que mostrar lo que dice su perfil, y dejar el
// lado sano como estaba: si no, el docente elige «neuritis izquierda» y el
// alumno ve otra cosa. Los pulsos «reales» acá son los sintéticos sanos del
// caso A, que hacen de compañero sano frente a la cámara.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASOS, K_EJEMPLO, crudoDeEjemplo } from '../js/ejemplo.js';
import { procesaCrudo } from '../js/pipeline.js';
import { CONFIG, resumenLado } from '../js/analysis.js';
import * as geom from '../js/geom.js';
import { PERFILES, arrastre, parametrosPulso, simulaCrudo } from '../js/simulacion.js';
import { PATRONES } from '../js/tutorial-pasos.js';

const DERIV = { windowMs: 50, degree: 2 };
const model = new geom.EyeModel();
model.kParallax = K_EJEMPLO;
model.calibrated = true;

/** El compañero sano: diez impulsos buenos, cinco por lado. */
const sanos = CASOS.A.pulsos.map((p, i) => {
  const { crudo, tTrigger } = crudoDeEjemplo(p, 100 + i);
  return { crudo, tTrigger, real: procesaCrudo(crudo, tTrigger, model, DERIV, CONFIG) };
});

function simula(perfil) {
  return sanos.map(({ crudo, tTrigger, real }, i) => {
    const par = parametrosPulso(perfil, real.side, 1000 + i);
    return { real, sim: procesaCrudo(simulaCrudo(crudo, tTrigger, par, model), tTrigger, model, DERIV, CONFIG), par };
  });
}

const media = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

test('cada perfil tiene un patrón de los que se preguntan', () => {
  for (const [id, p] of Object.entries(PERFILES)) {
    assert.ok(p.patron in PATRONES, id);
    assert.ok(p.nombre && p.descripcion, id);
  }
});

test('el lado que el perfil deja sano queda como estaba', () => {
  for (const perfil of Object.keys(PERFILES)) {
    for (const { real, sim, par } of simula(perfil)) {
      if (par) continue;
      assert.ok(Math.abs(sim.gain - real.gain) < 1e-9, `${perfil} ${real.side}`);
      assert.equal(sim.sacadas.length, 0);
    }
  }
});

test('las neuritis y la bilateral bajan la ganancia y traen sacadas manifiestas', () => {
  for (const perfil of ['neuritis-der', 'neuritis-izq', 'bilateral']) {
    const ts = simula(perfil).filter((x) => x.par);
    assert.ok(ts.length >= 5, perfil);
    assert.ok(media(ts.map((x) => x.sim.gain)) < 0.6, perfil);
    for (const { sim } of ts) {
      assert.ok(!sim.rejected, `${perfil}: ${sim.rejected}`);
      assert.deepEqual(sim.sacadas.map((s) => s.tipo), ['manifiesta'], perfil);
    }
  }
});

test('el encubierto se lee normal y solo la ganancia hasta la sacada lo delata', () => {
  for (const perfil of ['encubierto-der', 'encubierto-izq']) {
    const ts = simula(perfil).filter((x) => x.par);
    const lado = ts[0].real.side;
    const todos = simula(perfil).map((x) => x.sim);
    assert.ok(resumenLado(todos, lado).media >= CONFIG.gainNormalMin, perfil);
    // Donde la sacada se detectó, cortar antes de ella devuelve el déficit.
    const conSacada = ts.filter(({ sim }) => sim.sacadas.length);
    assert.ok(media(conSacada.map((x) => x.sim.gains.desacadizada)) < 0.6, perfil);
    // A 30 fps una encubierta temprana se superpone con el arrastre y a veces
    // no llega al umbral del detector: se pide la mayoría, no todas. Nunca
    // tiene que salir como manifiesta.
    const vistas = ts.filter(({ sim }) => sim.sacadas.some((s) => s.tipo === 'encubierta')).length;
    assert.ok(vistas >= 3, `${perfil}: ${vistas} de ${ts.length}`);
    for (const { sim } of ts) assert.ok(!sim.sacadas.some((s) => s.tipo === 'manifiesta'), perfil);
  }
});

test('la simulación es determinista y no arrastra con giros lentos', () => {
  const [a, b] = [simula('neuritis-izq'), simula('neuritis-izq')];
  a.forEach((x, i) => assert.equal(x.sim.gain, b[i].sim.gain));
  // La vuelta lenta al centro (30 °/s) no es un impulso: no arrastra la mirada.
  const lento = Array.from({ length: 60 }, (_, i) => ({ t: i / 30, yaw: i })); // 30 °/s
  const d = arrastre(lento, 0.5, { ganancia: 0.3, sacadas: [] });
  assert.ok(Math.max(...d.map(Math.abs)) < 1e-9);
});
