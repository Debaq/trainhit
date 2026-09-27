// El modelo de patologías (js/patologia.js): que el VOR sano sea perfecto,
// que un canal muerto deje sin reflejo el giro hacia su lado, que el
// nistagmo espontáneo bata hacia el lado sano y que cada tipo de sacada
// correctiva salga cuando tiene que salir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CANAL, perfilImpulso, qEjeAngulo, qMul, velocidadAngular } from '../js/canales.js';
import {
  CASO,
  CASOS,
  ORGANOS,
  Ojo,
  CON_FIJACION,
  FLOCULOS,
  avanzaCuadro,
  factorAlexander,
  gradoAlexander,
  frenoFijacion,
  mirarHacia,
  describeNistagmo,
  espejo,
  faseLentaEspontanea,
  funciones,
  velocidadVOR,
} from '../js/patologia.js';

const sano = funciones();
const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const escala = (v, k) => v.map((x) => x * k);

test('sano: el ojo gira exactamente contra la cabeza, en cualquier eje', () => {
  for (const w of [
    [0, 200, 0],
    [120, -30, 40],
    [-5, 3, 250],
  ]) {
    const v = velocidadVOR(w, sano);
    w.forEach((x, i) => assert.ok(Math.abs(v[i] + x) < 1e-9, `${w} → ${v}`));
  }
});

test('lateral izquierdo muerto: el giro rápido a la izquierda casi no tiene reflejo', () => {
  const f = funciones({ lat_izq: 'arreflexia' });
  const n = CANAL.lat_izq.eje;
  const ganancia = (w) => -punto(velocidadVOR(escala(n, w), f), n) / w;
  const izq = ganancia(200);
  const der = ganancia(-200);
  assert.ok(izq > 0.15 && izq < 0.3, `izq ${izq}`);
  assert.ok(der > 0.7 && der < 0.9, `der ${der}`);
  // Lento, los dos lados se parecen más: la asimetría es de los giros rápidos.
  assert.ok(ganancia(20) > 0.45 && ganancia(20) < 0.55);
  // Los verticales siguen perfectos.
  const v = velocidadVOR(escala(CANAL.ant_izq.eje, 150), f);
  assert.ok(Math.abs(punto(v, CANAL.ant_izq.eje) + 150) < 1e-9);
});

test('neuritis superior aguda: nistagmo horizontal-torsional que bate hacia el lado sano', () => {
  const f = funciones(CASO.neuritis_superior.canales);
  const lenta = faseLentaEspontanea(f);
  // La fase lenta va hacia la izquierda (el lado enfermo): giro del ojo en +y.
  assert.ok(lenta[1] > 0);
  const d = describeNistagmo(lenta);
  assert.ok(d.partes.includes('derecha'), String(d.partes));
  assert.ok(d.partes.some((p) => p.startsWith('torsional')), String(d.partes));
  assert.ok(d.velocidad > 5 && d.velocidad < 20);
  // Del otro lado, al revés.
  const otro = describeNistagmo(faseLentaEspontanea(funciones(espejo(CASO.neuritis_superior.canales))));
  assert.ok(otro.partes.includes('izquierda'));
});

test('sin nistagmo si está compensada o si la pérdida es pareja', () => {
  const f = funciones(CASO.neuritis_superior.canales);
  assert.deepEqual(faseLentaEspontanea(f, { compensado: true }), [0, 0, 0]);
  assert.equal(describeNistagmo(faseLentaEspontanea(funciones(CASO.arreflexia_bilateral.canales))), null);
  assert.equal(describeNistagmo(faseLentaEspontanea(sano)), null);
  // La fijación lo frena pero no lo borra.
  const libre = Math.hypot(...faseLentaEspontanea(f));
  const fijo = Math.hypot(...faseLentaEspontanea(f, { fijacion: true }));
  assert.ok(fijo > 0 && fijo < 0.5 * libre);
});

test('los casos nombran solo órganos que existen', () => {
  for (const c of CASOS) for (const id of Object.keys(c.canales)) assert.ok(ORGANOS.includes(id), `${c.id}: ${id}`);
});

/**
 * Un impulso de 20° a 200 °/s alrededor de `eje` y el ojo siguiéndolo a pasos
 * de 1 ms. Devuelve cuándo salió cada sacada, cuándo se frenó la cabeza, y el
 * error de mirada al final.
 */
function impulso(f, tipo, eje = CANAL.lat_izq.eje, lenta = [0, 0, 0]) {
  const ojo = new Ojo();
  const dt = 0.001;
  const tiempos = [];
  let frena = null;
  let previas = 0;
  for (let t = 0; t < 1.5; t += dt) {
    const p = perfilImpulso(t, 20, 200);
    if (frena === null && t > 0.05 && p.velocidad === 0) frena = t;
    ojo.paso(dt, qEjeAngulo(eje, p.angulo), escala(eje, p.velocidad), { f, lenta, tipo });
    if (ojo.sacadas > previas) tiempos.push(t);
    previas = ojo.sacadas;
    if (t > 0.7) break; // antes de la vuelta lenta
  }
  return { tiempos, frena };
}

test('sano: ni una sacada en el impulso', () => {
  assert.deepEqual(impulso(sano, 'encubiertas').tiempos, []);
});

test('cada tipo de sacada sale cuando tiene que salir', () => {
  const f = funciones({ lat_izq: 'arreflexia' });
  const enc = impulso(f, 'encubiertas');
  const abi = impulso(f, 'abiertas');
  const tar = impulso(f, 'tardias');
  // Encubierta: durante el giro, que termina cuando la cabeza se frena.
  assert.ok(enc.tiempos.length > 0 && enc.tiempos[0] < enc.frena, `${enc.tiempos} / ${enc.frena}`);
  // Abierta: después de frenar; tardía, bastante después.
  assert.ok(abi.tiempos[0] > abi.frena, `${abi.tiempos} / ${abi.frena}`);
  assert.ok(tar.tiempos[0] > abi.tiempos[0] + 0.15, `${tar.tiempos} vs ${abi.tiempos}`);
  // Hacia el lado sano el reflejo alcanza: a lo sumo una corrección chica.
  const sanoLado = impulso(f, 'abiertas', CANAL.lat_der.eje);
  assert.ok(sanoLado.tiempos.length <= 1);
});

test('nistagmo con la cabeza quieta: diente de sierra alrededor del blanco', () => {
  const f = funciones(CASO.neuritis_superior.canales);
  const lenta = faseLentaEspontanea(f);
  const ojo = new Ojo();
  let maxError = 0;
  for (let t = 0; t < 2; t += 0.001) {
    ojo.paso(0.001, [0, 0, 0, 1], [0, 0, 0], { f, lenta, tipo: 'abiertas' });
    const ang = (2 * Math.acos(Math.min(1, Math.abs(ojo.q[3]))) * 180) / Math.PI;
    maxError = Math.max(maxError, ang);
  }
  // Unas tres a seis batidas por segundo, y el ojo sin irse lejos.
  assert.ok(ojo.sacadas >= 5 && ojo.sacadas <= 14, `${ojo.sacadas} batidas`);
  assert.ok(maxError < 4.5, `error ${maxError}`);
});

test('con la cabeza quieta en otra postura, el ojo vuelve a mirar al frente', () => {
  // Nariz abajo 25° y quieta: el VOR deja el ojo arriba, y al rato una sacada
  // lo trae al centro de la órbita.
  const ojo = new Ojo();
  const eje = [1, 0, 0];
  const angulo = (q) => (2 * Math.acos(Math.min(1, Math.abs(q[3]))) * 180) / Math.PI;
  for (let t = 0; t < 0.25; t += 0.001) {
    const g = Math.min(25, 100 * t);
    ojo.paso(0.001, qEjeAngulo(eje, g), escala(eje, t < 0.25 ? 100 : 0), { f: sano });
  }
  for (let t = 0; t < 0.5; t += 0.001) ojo.paso(0.001, qEjeAngulo(eje, 25), [0, 0, 0], { f: sano });
  assert.ok(angulo(ojo.q) > 20, `todavía fijando: ${angulo(ojo.q)}`);
  for (let t = 0; t < 1; t += 0.001) ojo.paso(0.001, qEjeAngulo(eje, 25), [0, 0, 0], { f: sano });
  assert.ok(angulo(ojo.q) < 2, `al frente: ${angulo(ojo.q)}`);
});

/**
 * Un impulso de 20° cuadro a cuadro, como laberinto.js: la cabeza se da como
 * orientaciones sueltas y, si `suaviza`, `omega` sale de derivarlas y
 * suavizarlas, como con el mouse o el teléfono.
 */
function cuadroACuadro(f, { fps = 60, vPico = 150, suaviza = false, tipo = 'encubiertas' } = {}) {
  const ojo = new Ojo();
  const eje = CANAL.lat_izq.eje;
  const dt = 1 / fps;
  let qAntes = [0, 0, 0, 1];
  let omega = [0, 0, 0];
  let error = 0;
  for (let t = 0; t < 3; t += dt) {
    const p = perfilImpulso(t, 20, vPico);
    const q = qEjeAngulo(eje, p.angulo);
    if (suaviza) {
      const w = velocidadAngular(qAntes, q, dt);
      omega = omega.map((v, i) => v + (1 - Math.exp(-dt / 0.06)) * (w[i] - v));
    } else omega = eje.map((v) => v * p.velocidad);
    avanzaCuadro(ojo, qAntes, q, dt, omega, { f, tipo });
    qAntes = q;
    const mirada = qMul(q, ojo.q);
    error = Math.max(error, (2 * Math.acos(Math.min(1, Math.abs(mirada[3]))) * 180) / Math.PI);
  }
  return { sacadas: ojo.sacadas, error };
}

test('sano cuadro a cuadro: ganancia 1 y ninguna sacada, a cualquier cadencia y movido a mano', () => {
  for (const o of [{}, { fps: 30 }, { vPico: 300, fps: 30 }, { suaviza: true }, { suaviza: true, vPico: 250 }]) {
    const r = cuadroACuadro(sano, o);
    assert.equal(r.sacadas, 0, JSON.stringify(o));
    assert.ok(r.error < 0.05, `${JSON.stringify(o)}: la mirada se corrió ${r.error}°`);
  }
});

test('cuadro a cuadro, un canal muerto sigue dando sacadas', () => {
  const f = funciones({ lat_izq: 'arreflexia' });
  for (const o of [{}, { suaviza: true }]) assert.ok(cuadroACuadro(f, o).sacadas > 0, JSON.stringify(o));
});

test('un salto de la cabeza (centrar) no es un giro: no mueve el ojo', () => {
  const ojo = new Ojo();
  avanzaCuadro(ojo, [0, 0, 0, 1], qEjeAngulo([0, 1, 0], 60), 1 / 60, [0, 0, 0], { f: sano });
  assert.deepEqual(ojo.q.slice(0, 3).map((v) => Math.abs(v) < 1e-9), [true, true, true]);
});

/** La cabeza gira `grados` sobre el lateral y se queda; el ojo mira un blanco adelante. */
function giraYQueda(f, grados, blanco = [0, 0, 1]) {
  const ojo = new Ojo();
  const eje = CANAL.lat_izq.eje;
  const dt = 1 / 60;
  let qAntes = [0, 0, 0, 1];
  let mirada = null;
  for (let t = 0; t < 4; t += dt) {
    const p = perfilImpulso(t, grados, 150, { vuelve: false });
    const q = qEjeAngulo(eje, p.angulo);
    avanzaCuadro(ojo, qAntes, q, dt, eje.map((v) => v * p.velocidad), { f, blanco });
    qAntes = q;
    mirada = qMul(q, ojo.q);
  }
  // Se mide hacia dónde apunta la mirada, no la torsión: el giro lateral es
  // sobre un eje inclinado y deja algo de torsión aunque la mirada esté bien.
  const aDelFrente = (q) => {
    const z = qMul(qMul(q, [0, 0, 1, 0]), [-q[0], -q[1], -q[2], q[3]]);
    return (Math.acos(Math.max(-1, Math.min(1, z[2]))) * 180) / Math.PI;
  };
  return { sacadas: ojo.sacadas, mirada: aDelFrente(mirada), enOrbita: aDelFrente(ojo.q) };
}

test('con blanco en la pantalla, un sano con la cabeza girada sigue mirándolo: sin volver al frente', () => {
  const r = giraYQueda(sano, 20);
  assert.equal(r.sacadas, 0);
  assert.ok(r.mirada < 0.05, `la mirada se corrió ${r.mirada}°`);
  // El eje del lateral está inclinado 30°: 20° sobre él desvían la mirada 20·cos 30°.
  const esperado = 20 * Math.cos(Math.PI / 6);
  assert.ok(Math.abs(r.enOrbita - esperado) < 0.1, `el ojo quedó a ${r.enOrbita}° en la órbita`);
});

test('con blanco fuera de la órbita, el ojo queda en el borde sin sacadas en bucle', () => {
  const r = giraYQueda(sano, 60);
  assert.ok(Math.abs(r.enOrbita - 40) < 0.5, `${r.enOrbita}°`);
  assert.ok(r.sacadas <= 2, `${r.sacadas} sacadas`);
});

test('con blanco, un canal muerto hace sacadas para volver a él', () => {
  const r = giraYQueda(funciones({ lat_izq: 'arreflexia' }), 20);
  assert.ok(r.sacadas > 0);
  assert.ok(r.mirada < 1.5, `${r.mirada}°`);
});

test('mirarHacia sigue la ley de Listing: sin torsión, eje en el plano frontal', () => {
  const s = Math.sin(Math.PI / 9);
  const q = mirarHacia([s, 0, Math.cos(Math.PI / 9)]);
  assert.ok(Math.abs(q[2]) < 1e-12);
  assert.ok(Math.abs((2 * Math.acos(q[3]) * 180) / Math.PI - 20) < 1e-9);
});

test('el freno de la fijación lo pone el flóculo: OFI bajo en lo periférico, alto si falla', () => {
  assert.ok(Math.abs(frenoFijacion(sano) - CON_FIJACION) < 1e-12);
  assert.equal(frenoFijacion(funciones({ floculo_izq: 'arreflexia', floculo_der: 'arreflexia' })), 1);
  const neuritis = funciones(CASO.neuritis_superior.canales);
  const aica = funciones(CASO.aica.canales);
  const ofi = (f) =>
    Math.hypot(...faseLentaEspontanea(f, { fijacion: true })) / Math.hypot(...faseLentaEspontanea(f, { fijacion: false }));
  assert.ok(ofi(neuritis) < 0.5, `neuritis: ${ofi(neuritis)}`);
  assert.ok(ofi(aica) > 0.5, `AICA: ${ofi(aica)}`);
});

test('los casos bilaterales periféricos no tocan el cerebelo', () => {
  for (const id of ['hipofuncion_bilateral', 'arreflexia_bilateral']) {
    for (const fl of FLOCULOS) assert.equal(CASO[id].canales[fl], undefined, `${id}: ${fl}`);
  }
});

test('ley de Alexander: mirando hacia la fase rápida bate más, al revés menos', () => {
  const lenta = faseLentaEspontanea(funciones({ lat_izq: 'arreflexia' }));
  // Con el lateral izquierdo muerto la fase rápida va a la derecha: mirar a
  // la derecha es girar el ojo sobre −y.
  const aLaDerecha = qEjeAngulo([0, -1, 0], 20);
  const aLaIzquierda = qEjeAngulo([0, 1, 0], 20);
  assert.ok(factorAlexander(aLaDerecha, lenta) > 1.4);
  assert.ok(factorAlexander(aLaIzquierda, lenta) < 0.6);
  assert.equal(factorAlexander([0, 0, 0, 1], lenta), 1);
});

test('el grado de Alexander sale de la intensidad: fuerte III, medio II, débil I', () => {
  assert.equal(gradoAlexander(14), 3);
  assert.equal(gradoAlexander(4), 2);
  assert.equal(gradoAlexander(2), 1);
  assert.equal(gradoAlexander(1), 0);
});

test('con la mirada a la derecha, una neuritis izquierda bate más veces que a la izquierda', () => {
  const f = funciones(CASO.neuritis_superior.canales);
  const lenta = faseLentaEspontanea(f);
  const s = Math.sin(Math.PI / 9);
  const c = Math.cos(Math.PI / 9);
  const batidas = (blanco) => {
    const ojo = new Ojo();
    const q = [0, 0, 0, 1];
    for (let t = 0; t < 6; t += 1 / 60) avanzaCuadro(ojo, q, q, 1 / 60, [0, 0, 0], { f, lenta, blanco });
    return ojo.sacadas;
  };
  const derecha = batidas([-s, 0, c]);
  const izquierda = batidas([s, 0, c]);
  assert.ok(derecha > izquierda * 1.3, `derecha ${derecha}, izquierda ${izquierda}`);
});
