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
import { CORTE_S, HZ_CAMARA, Remuestreo, aMarco, leeGiro, marcoDesdeArriba, mensajeGiro, qEjeAngulo } from '../js/giroscopio.js';
import { CANAL_AXIS, CANALES_DEL_PLANO } from '../js/head.js';
import * as cara from '../js/cara.js';

// Los índices de tracker.js, que no se puede importar aquí (trae MediaPipe).
const IDX = {
  derecho: { iris: 468, border: [469, 470, 471, 472], outer: 33, inner: 133 },
  izquierdo: { iris: 473, border: [474, 475, 476, 477], outer: 362, inner: 263 },
};

const model = new geom.EyeModel();
model.kParallax = K_EJEMPLO;
model.calibrated = true;

/** Un giro de costado: el giro por eje y la orientación de un yaw. */
const deYaw = (yaw) => [[0, yaw, 0], qEjeAngulo([0, 1, 0], yaw)];

test('el mensaje del giro va y vuelve, y lo demás no se lee como giro', () => {
  const q = qEjeAngulo([1, 2, 3], 40);
  const m = leeGiro(mensajeGiro(1234.5, [1, -12.25, 3], q));
  assert.equal(m.tMs, 1234.5);
  assert.deepEqual(m.giro, [1, -12.25, 3]);
  m.q.forEach((v, i) => assert.ok(Math.abs(v - q[i]) < 1e-12));
  // El mensaje de antes, solo con el yaw: un teléfono con la página vieja.
  const viejo = leeGiro(new Float64Array([2, 10, -12.25]).buffer);
  assert.deepEqual(viejo.giro, [0, -12.25, 0]);
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
  for (let i = 0; i <= 100; i++) cuadros.push(...r.empuja(i * 10, ...deYaw(i * 0.5)).cuadros);
  const dt = cuadros.slice(1).map((c, i) => c.t - cuadros[i].t);
  assert.ok(dt.every((d) => Math.abs(d - 1 / HZ_CAMARA) < 1e-9), 'cuadros parejos');
  assert.equal(cuadros.length, 61);
  for (const c of cuadros) {
    assert.ok(Math.abs(c.giro[1] - c.t * 50) < 1e-9, `giro interpolado en ${c.t}`);
    // La orientación interpolada es la del yaw interpolado (a 0,5° entre eventos, sobra).
    const q = qEjeAngulo([0, 1, 0], c.t * 50);
    assert.ok(c.q.every((v, i) => Math.abs(v - q[i]) < 1e-5), `orientación en ${c.t}`);
  }
});

test('el remuestreo tira los atrasados y empieza de nuevo tras un corte o un reloj nuevo', () => {
  const r = new Remuestreo();
  r.empuja(0, ...deYaw(0));
  r.empuja(20, ...deYaw(1));
  assert.deepEqual(r.empuja(15, ...deYaw(5)), { cuadros: [], corte: false }, 'atrasado');
  const corte = r.empuja(20 + CORTE_S * 1000 + 50, ...deYaw(2));
  assert.equal(corte.corte, true);
  assert.equal(corte.cuadros.length, 1);
  r.empuja(5000, ...deYaw(3));
  // El teléfono recargó la página: su reloj volvió a cero.
  const nuevo = r.empuja(5, ...deYaw(0));
  assert.equal(nuevo.corte, true);
  assert.equal(nuevo.cuadros[0].t, 0.005);
});

test('la cara dibujada muestra el ojo que el motor lee', () => {
  for (const yaw of [-20, -7, 0, 12, 25]) {
    for (const mirada of [0, -4, 6]) {
      // El corrimiento de una mirada corrida `mirada` grados, con el modelo.
      const h = (yaw * Math.PI) / 180;
      const offsetMm = model.radiusMm * (Math.sin((mirada * Math.PI) / 180) - model.kParallax * Math.sin(h));
      const lms = cara.landmarks(cara.geometria(cara.poseLateral(yaw, mirada), model), IDX);
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
 * Un impulso dado con el teléfono: eventos a `hz` con su temblor, un giro con
 * velocidad gaussiana de pico `pico` °/s, pasados por el remuestreo y con el
 * ojo sano. Sin más, un giro de costado hacia la izquierda del paciente (yaw
 * positivo). Con `yaw0` la cabeza está girada de antemano y con `cabeceo` el
 * impulso es de nariz abajo (positivo) o arriba, alrededor del eje de las
 * orejas del MUNDO, que es como se cabecea con la cabeza girada. `plano` es el
 * que se examina: el giro que llega al motor es el de ese plano.
 */
function impulsoDelTelefono({ hz = 100, pico = 200, yaw0 = 0, cabeceo = 0, plano = 'lateral' } = {}) {
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
    const ang = amplitud * 0.5 * (1 + erf((t - centro) / sigma / Math.SQRT2));
    let giro;
    let q;
    if (cabeceo) {
      // El eje de las orejas del mundo, visto desde la cabeza girada yaw0.
      const h = (yaw0 * Math.PI) / 180;
      const orejas = [Math.cos(h), 0, Math.sin(h)];
      const p = cabeceo * ang;
      giro = orejas.map((v, i) => v * p + (i === 1 ? yaw0 : 0));
      q = qMulPrueba(qEjeAngulo([1, 0, 0], p), qEjeAngulo([0, 1, 0], yaw0));
    } else [giro, q] = deYaw(yaw0 + ang);
    cuadros.push(...r.empuja(t * 1000, giro, q).cuadros);
  }
  const eje = CANAL_AXIS[plano];
  const crudo = cuadros.map((c) => {
    const yaw = eje.reduce((s, e, i) => s + e * c.giro[i], 0);
    const fuera = c.giro.map((g, i) => g - yaw * eje[i]);
    return { t: c.t, yaw, fuera, offsetMm: cara.offsetSano(yaw, model), blinkScore: 0, irisPx: cara.IRIS_PX, vergMm: 0 };
  });
  // El disparo, como el detector: la primera velocidad por encima del umbral.
  let tTrigger = null;
  for (let i = 1; i < crudo.length && tTrigger === null; i++) {
    const v = (crudo[i].yaw - crudo[i - 1].yaw) / (crudo[i].t - crudo[i - 1].t);
    if (Math.abs(v) > CONFIG.impulse.onDegS) tTrigger = crudo[i].t;
  }
  return { crudo, tTrigger };
}

function qMulPrueba(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
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

test('los planos verticales: con la cabeza a 45°, nariz abajo y arriba estimulan el canal que dicen', () => {
  // LARP: cabeza a la derecha (yaw negativo). RALP: a la izquierda.
  for (const [plano, yaw0] of [
    ['larp', -45],
    ['ralp', 45],
  ]) {
    for (const [cabeceo, esperado] of [
      [1, { larp: 'anterior-izq', ralp: 'anterior-der' }],
      [-1, { larp: 'posterior-der', ralp: 'posterior-izq' }],
    ]) {
      const { crudo, tTrigger } = impulsoDelTelefono({ yaw0, cabeceo, plano });
      const t = procesaCrudo(crudo, tTrigger, model, { windowMs: 50, degree: 2 }, CONFIG);
      const nombre = `${plano}, nariz ${cabeceo > 0 ? 'abajo' : 'arriba'}`;
      assert.equal(CANALES_DEL_PLANO[plano][t.side], esperado[plano], nombre);
      assert.equal(t.rejected, null, nombre);
      assert.ok(t.fueraDeg < 2, `${nombre}: en el plano (${t.fueraDeg.toFixed(1)}°)`);
      assert.ok(Math.abs(t.gain - 1) < 0.05, `${nombre}: ganancia ${t.gain}`);
    }
  }
});

test('cabecear sin girar la cabeza no es el plano de un vertical: se rechaza', () => {
  const { crudo, tTrigger } = impulsoDelTelefono({ yaw0: 0, cabeceo: 1, plano: 'larp' });
  const t = procesaCrudo(crudo, tTrigger, model, { windowMs: 50, degree: 2 }, CONFIG);
  assert.ok(Math.abs(t.fueraDeg - 45) < 2, `a 45° del plano (${t.fueraDeg.toFixed(1)}°)`);
  assert.equal(t.rejected, 'fuera-del-plano');
  // Y un giro de costado limpio no se aparta del lateral.
  const lat = impulsoDelTelefono();
  assert.ok(procesaCrudo(lat.crudo, lat.tTrigger, model, { windowMs: 50, degree: 2 }, CONFIG).fueraDeg < 1);
});

test('en un vertical, el simulador afecta el canal que dice el perfil', () => {
  // Neuritis derecha: la rama superior lleva el anterior derecho y deja el posterior.
  assert.ok(parametrosPulso('neuritis-der', 'derecha', 3, 'ralp'), 'anterior derecho afectado');
  assert.equal(parametrosPulso('neuritis-der', 'derecha', 3, 'larp'), null, 'posterior derecho sano');
  const { crudo, tTrigger } = impulsoDelTelefono({ yaw0: 45, cabeceo: 1, plano: 'ralp' });
  const par = parametrosPulso('neuritis-der', 'derecha', 3, 'ralp');
  const t = procesaCrudo(simulaCrudo(crudo, tTrigger, par, model), tTrigger, model, { windowMs: 50, degree: 2 }, CONFIG);
  assert.ok(t.gain < 0.7, `ganancia ${t.gain} del anterior derecho`);
});

/** La torsión que se ve: cuánto rodó en la imagen el eje del iris que va hacia la izquierda del ojo. */
function torsionVista(pose) {
  const o = cara.geometria(pose, model).izquierdo;
  const [a, b] = [o.iris, o.borde[0]];
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

test('los vasos y las fibras ruedan con el ojo: con la cabeza a 45° el vertical casi no tuerce', () => {
  const qGirada = qEjeAngulo([0, 1, 0], -45);
  const qDeFrente = [0, 0, 0, 1];
  const eje = CANAL_AXIS.larp;
  // Ojo sano: quieto en el mundo, sin torsión aunque la cabeza gire.
  assert.ok(Math.abs(torsionVista(cara.pose(qGirada, eje, 0))) < 1e-9);
  // Con déficit la mirada se va 10° alrededor del eje del canal.
  const girada = torsionVista(cara.pose(qGirada, eje, 10));
  const deFrente = torsionVista(cara.pose(qDeFrente, eje, 10));
  assert.ok(Math.abs(girada) < 1, `cabeza a 45°: ${girada.toFixed(2)}° de torsión`);
  assert.ok(Math.abs(Math.abs(deFrente) - 7) < 1, `cabeza de frente: ${deFrente.toFixed(2)}°, mitad del giro`);
});
