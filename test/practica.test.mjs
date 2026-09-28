// «Voy a tener suerte» corrige contra la clave del perfil, no contra lo
// medido. Entonces la clave tiene que ser lo que el motor muestra de verdad:
// si un perfil dice «sacadas encubiertas del lado izquierdo» y el detector las
// marca manifiestas, o del otro lado, la práctica le dice «mal» a quien leyó
// bien. Los pulsos «reales» son los sanos del caso A, como en
// test/simulacion.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASOS, K_EJEMPLO, crudoDeEjemplo } from '../js/ejemplo.js';
import { procesaCrudo } from '../js/pipeline.js';
import { CONFIG } from '../js/analysis.js';
import * as geom from '../js/geom.js';
import { PERFILES, parametrosPulso, perfilesDisponibles, simulaCrudo } from '../js/simulacion.js';
import { CANALES, claveDe, corrige, preguntasPractica } from '../js/practica.js';
import { CANALES_DEL_PLANO } from '../js/head.js';

const DERIV = { windowMs: 50, degree: 2 };
const model = new geom.EyeModel();
model.kParallax = K_EJEMPLO;
model.calibrated = true;

const sanos = CASOS.A.pulsos.map((p, i) => {
  const { crudo, tTrigger } = crudoDeEjemplo(p, 100 + i);
  return { crudo, tTrigger, side: procesaCrudo(crudo, tTrigger, model, DERIV, CONFIG).side };
});

/** Lo que el motor ve del perfil: qué lados traen sacadas y de qué tipo. */
function medido(perfil) {
  const tipos = new Set();
  const lados = new Set();
  sanos.forEach(({ crudo, tTrigger, side }, i) => {
    const par = parametrosPulso(perfil, side, 2000 + i);
    const t = procesaCrudo(simulaCrudo(crudo, tTrigger, par, model), tTrigger, model, DERIV, CONFIG);
    for (const s of t.sacadas) {
      tipos.add(s.tipo === 'encubierta' ? 'encubiertas' : 'manifiestas');
      lados.add(side);
    }
  });
  const lado = lados.size === 2 ? 'ambos' : ([...lados][0] ?? 'ninguno');
  const sacadas = !tipos.size ? 'ninguna' : tipos.size === 2 ? 'ambas' : [...tipos][0];
  return { lado, sacadas };
}

test('cada respuesta de la clave es una de las opciones de su pregunta', () => {
  const qs = preguntasPractica();
  for (const perfil of Object.keys(PERFILES)) {
    const clave = claveDe(perfil);
    for (const q of qs) assert.ok(clave[q.id] in q.opciones, `${perfil}: ${q.id} = ${clave[q.id]}`);
  }
});

test('la clave dice lo que el motor muestra: lado y tipo de sacadas', () => {
  for (const perfil of Object.keys(PERFILES)) {
    const { lado, sacadas } = claveDe(perfil);
    assert.deepEqual(medido(perfil), { lado, sacadas }, perfil);
  }
});

test('el sorteo puede dar un paciente sano', () => {
  // Sin control, la respuesta nunca sería «normal» y se aprendería a buscar
  // la patología en vez de a leer.
  assert.ok(Object.keys(PERFILES).some((p) => claveDe(p).patron === 'normal'));
});

test('corrige cuenta los aciertos contra la clave', () => {
  const c = corrige('encubierto-izq', { lado: 'izquierda', sacadas: 'manifiestas', patron: 'encubierto-izq' });
  assert.equal(c.aciertos, 2);
  assert.equal(c.total, 3);
  assert.deepEqual(c.detalle.sacadas, { elegida: 'manifiestas', correcta: 'encubiertas', ok: false });
  assert.equal(corrige('sano', {}).aciertos, 0);
});

// ── con el teléfono: seis canales ──

test('con el teléfono, cada respuesta de la clave es una de las opciones', () => {
  const qs = preguntasPractica({ seis: true });
  assert.deepEqual(qs.map((q) => q.id), ['lado', 'verticales', 'sacadas']);
  for (const perfil of Object.keys(PERFILES)) {
    const clave = claveDe(perfil, { seis: true });
    for (const q of qs) assert.ok(clave[q.id] in q.opciones, `${perfil}: ${q.id} = ${clave[q.id]}`);
  }
});

/**
 * Lo que el motor ve en los verticales: los mismos pulsos sanos, dados en
 * cada plano vertical (el motor no sabe de qué plano viene el giro), con el
 * perfil puesto según el canal.
 */
function medidoVertical(perfil) {
  const tipos = new Set();
  const canales = new Set();
  for (const plano of ['larp', 'ralp']) {
    sanos.forEach(({ crudo, tTrigger, side }, i) => {
      const par = parametrosPulso(perfil, side, 3000 + i, plano);
      const t = procesaCrudo(simulaCrudo(crudo, tTrigger, par, model), tTrigger, model, DERIV, CONFIG);
      for (const s of t.sacadas) {
        tipos.add(s.tipo === 'encubierta' ? 'encubiertas' : 'manifiestas');
        canales.add(CANALES_DEL_PLANO[plano][side]);
      }
    });
  }
  return { canales, tipos };
}

test('con el teléfono, la clave de los verticales es lo que el motor muestra', () => {
  for (const perfil of Object.keys(PERFILES)) {
    const clave = claveDe(perfil, { seis: true });
    const { canales, tipos } = medidoVertical(perfil);
    const verticales = canales.size === 4 ? 'cuatro' : ([...canales][0] ?? 'ninguno');
    assert.equal(verticales, clave.verticales, perfil);
    // Las sacadas de los verticales tienen que estar entre las que dice la clave.
    for (const t of tipos) assert.ok(clave.sacadas === t || clave.sacadas === 'ambas', `${perfil}: ${t} en ${clave.sacadas}`);
  }
});

test('la neuritis inferior: laterales normales, el posterior afectado, y solo con el teléfono', () => {
  assert.deepEqual(claveDe('neuritis-inf-der', { seis: true }), { lado: 'ninguno', verticales: 'posterior-der', sacadas: 'manifiestas' });
  assert.equal(claveDe('neuritis-inf-izq').lado, 'ninguno');
  assert.ok(!perfilesDisponibles(false).includes('neuritis-inf-der'), 'no se sortea con la webcam');
  assert.ok(perfilesDisponibles(true).includes('neuritis-inf-der'));
  assert.equal(CANALES.length, 6);
});
