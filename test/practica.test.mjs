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
import { PERFILES, parametrosPulso, simulaCrudo } from '../js/simulacion.js';
import { claveDe, corrige, preguntasPractica } from '../js/practica.js';

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
