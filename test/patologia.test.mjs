// El modelo de patologías (js/patologia.js): que el VOR sano sea perfecto,
// que un canal muerto deje sin reflejo el giro hacia su lado, que el
// nistagmo espontáneo bata hacia el lado sano y que cada tipo de sacada
// correctiva salga cuando tiene que salir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CANAL, perfilImpulso, qEjeAngulo, qMul } from '../js/canales.js';
import {
  CASO,
  CASOS,
  Ojo,
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

test('los casos nombran solo canales que existen', () => {
  for (const c of CASOS) for (const id of Object.keys(c.canales)) assert.ok(CANAL[id], `${c.id}: ${id}`);
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
