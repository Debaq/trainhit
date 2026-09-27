// El teléfono como cabeza: que los eventos del giroscopio lleguen al motor
// como cuadros de cámara, que la cara dibujada muestre el ojo que el motor
// lee, y que un impulso dado con el teléfono se mida como uno de la webcam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/analysis.js';
import * as geom from '../js/geom.js';
import { K_EJEMPLO } from '../js/ejemplo.js';
import { procesaCrudo } from '../js/pipeline.js';
import { parametrosPulso, simulaCrudo } from '../js/simulacion.js';
import { CORTE_S, HZ_CAMARA, Remuestreo, aMarco, leeGiro, marcoDesdeArriba, mensajeGiro } from '../js/giroscopio.js';
import * as cara from '../js/cara.js';

// Los índices de tracker.js, que no se puede importar acá (trae MediaPipe).
const IDX = {
  derecho: { iris: 468, border: [469, 470, 471, 472], outer: 33, inner: 133 },
  izquierdo: { iris: 473, border: [474, 475, 476, 477], outer: 362, inner: 263 },
};

const model = new geom.EyeModel();
model.kParallax = K_EJEMPLO;
model.calibrated = true;

test('el mensaje del giro va y vuelve, y lo demás no se lee como giro', () => {
  assert.deepEqual(leeGiro(mensajeGiro(1234.5, -12.25)), { tMs: 1234.5, yaw: -12.25 });
  assert.equal(leeGiro('centrar'), null);
  assert.equal(leeGiro(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0]).buffer), null); // la cabeza de Labyrinthus 3D
});

test('con el teléfono parado, girarlo de costado es girar la cabeza', () => {
  // Parado frente a quien lo sostiene: arriba es +y del teléfono, y el marco
  // de la cabeza es el del teléfono. El giro alrededor de y es el yaw.
  const marco = marcoDesdeArriba([0, 1, 0]);
  assert.deepEqual(
    aMarco(marco, [0, 100, 0]).map((v) => Math.round(v)),
    [0, 100, 0],
  );
  // Apaisado (arriba es +x del teléfono): el yaw es el giro alrededor de x.
  const apaisado = marcoDesdeArriba([1, 0, 0]);
  assert.equal(Math.round(aMarco(apaisado, [100, 0, 0])[1]), 100);
});

test('el remuestreo da cuadros parejos de 60 Hz interpolando el yaw', () => {
  const r = new Remuestreo();
  const cuadros = [];
  // Eventos a 100 Hz con una rampa de 50 °/s.
  for (let i = 0; i <= 100; i++) cuadros.push(...r.empuja(i * 10, i * 0.5).cuadros);
  const dt = cuadros.slice(1).map((c, i) => c.t - cuadros[i].t);
  assert.ok(dt.every((d) => Math.abs(d - 1 / HZ_CAMARA) < 1e-9), 'cuadros parejos');
  assert.equal(cuadros.length, 61);
  for (const c of cuadros) assert.ok(Math.abs(c.yaw - c.t * 50) < 1e-9, `yaw interpolado en ${c.t}`);
});

test('el remuestreo tira los atrasados y empieza de nuevo tras un corte o un reloj nuevo', () => {
  const r = new Remuestreo();
  r.empuja(0, 0);
  r.empuja(20, 1);
  assert.deepEqual(r.empuja(15, 5), { cuadros: [], corte: false }, 'atrasado');
  const corte = r.empuja(20 + CORTE_S * 1000 + 50, 2);
  assert.equal(corte.corte, true);
  assert.equal(corte.cuadros.length, 1);
  r.empuja(5000, 3);
  // El teléfono recargó la página: su reloj volvió a cero.
  const nuevo = r.empuja(5, 0);
  assert.equal(nuevo.corte, true);
  assert.equal(nuevo.cuadros[0].t, 0.005);
});

test('la cara dibujada muestra el ojo que el motor lee', () => {
  for (const yaw of [-20, -7, 0, 12, 25]) {
    for (const mirada of [0, -4, 6]) {
      // El corrimiento de una mirada corrida `mirada` grados, con el modelo.
      const h = (yaw * Math.PI) / 180;
      const offsetMm = model.radiusMm * (Math.sin((mirada * Math.PI) / 180) - model.kParallax * Math.sin(h));
      const lms = cara.landmarks(cara.geometria(yaw, offsetMm, model), IDX);
      const P = (i) => geom.px(lms[i], cara.ANCHO, cara.ALTO);
      for (const ojo of Object.values(IDX)) {
        const obs = geom.observeEye(P(ojo.iris), ojo.border.map(P), P(ojo.outer), P(ojo.inner));
        assert.ok(Math.abs(obs.pxPerMm - cara.PX_POR_MM) < 1e-9, 'la escala sale del iris');
        assert.ok(Math.abs(obs.offsetMm - offsetMm) < 1e-9, `offset con yaw ${yaw} y mirada ${mirada}`);
        assert.ok(Math.abs(model.gazeAzimuthDeg(obs, yaw) - mirada) < 1e-6, 'el motor lee la misma mirada');
      }
    }
  }
});

test('el ojo sano se queda en el blanco: el motor lee mirada cero', () => {
  for (const yaw of [-25, -3, 0, 18]) {
    assert.ok(Math.abs(model.gazeAzimuthDeg({ offsetMm: cara.offsetSano(yaw, model) }, yaw)) < 1e-9);
  }
});

/**
 * Un impulso dado con el teléfono: eventos a `hz` con su temblor, el yaw con
 * velocidad gaussiana de pico `pico` °/s hacia la izquierda del paciente
 * (yaw positivo), pasados por el remuestreo y con el ojo sano.
 */
function impulsoDelTelefono({ hz = 100, pico = 200 } = {}) {
  const sigma = 0.04;
  const centro = 0.6;
  const amplitud = pico * sigma * Math.sqrt(2 * Math.PI);
  const erf = (x) => {
    const t = 1 / (1 + 0.3275911 * Math.abs(x));
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return x >= 0 ? y : -y;
  };
  const r = new Remuestreo();
  const cuadros = [];
  for (let i = 0; i * (1 / hz) < 1.4; i++) {
    const t = i / hz + (i % 3) * 0.0007;
    const yaw = amplitud * 0.5 * (1 + erf((t - centro) / sigma / Math.SQRT2));
    cuadros.push(...r.empuja(t * 1000, yaw).cuadros);
  }
  const crudo = cuadros.map((c) => ({ t: c.t, yaw: c.yaw, offsetMm: cara.offsetSano(c.yaw, model), blinkScore: 0, irisPx: cara.IRIS_PX, vergMm: 0 }));
  // El disparo, como el detector: la primera velocidad por encima del umbral.
  let tTrigger = null;
  for (let i = 1; i < crudo.length && tTrigger === null; i++) {
    const v = (crudo[i].yaw - crudo[i - 1].yaw) / (crudo[i].t - crudo[i - 1].t);
    if (Math.abs(v) > CONFIG.impulse.onDegS) tTrigger = crudo[i].t;
  }
  return { crudo, tTrigger };
}

test('un impulso del teléfono con el ojo sano da ganancia 1, a cualquier cadencia del sensor', () => {
  for (const hz of [50, 100, 200]) {
    const { crudo, tTrigger } = impulsoDelTelefono({ hz });
    const t = procesaCrudo(crudo, tTrigger, model, { windowMs: 50, degree: 2 }, CONFIG);
    assert.equal(t.rejected, null, `aceptado a ${hz} Hz`);
    assert.equal(t.side, 'izquierda', 'yaw positivo es la izquierda del paciente');
    assert.ok(Math.abs(t.gain - 1) < 0.05, `ganancia ${t.gain} a ${hz} Hz`);
    assert.equal(t.noValidado, false, 'los cuadros van a 60 Hz');
  }
});

test('con el perfil del simulador, el impulso del teléfono muestra el déficit', () => {
  const { crudo, tTrigger } = impulsoDelTelefono();
  const par = parametrosPulso('neuritis-izq', 'izquierda', 7);
  const t = procesaCrudo(simulaCrudo(crudo, tTrigger, par, model), tTrigger, model, { windowMs: 50, degree: 2 }, CONFIG);
  assert.ok(t.gain < 0.7, `ganancia ${t.gain} con neuritis izquierda (${par.ganancia.toFixed(2)})`);
});
