// La vía del reflejo (js/via.js): que cada canal llegue a los músculos de
// libro, que en reposo todo dispare igual, que un giro encienda la vía del
// canal que excita y que la compensación central devuelva el reposo al núcleo
// de un nervio muerto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CANAL, CANALES, TASA_REPOSO, qEjeAngulo, qMul, respuestas } from '../js/canales.js';
import { funciones, velocidadVOR } from '../js/patologia.js';
import { abajoEnCabeza, respuestasOtolitos } from '../js/otolitos.js';
import { FILTROS, actividad, musculosDe, tramos, vectorRotacion, velocidadOrbita } from '../js/via.js';

const cerca = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;
const escala = (v, k) => v.map((x) => x * k);

test('cada canal excita los músculos de libro, y cada músculo tiene un solo canal', () => {
  const esperado = {
    lat_izq: ['rm izq', 'rl der'],
    lat_der: ['rm der', 'rl izq'],
    ant_izq: ['rs izq', 'oi der'],
    ant_der: ['rs der', 'oi izq'],
    post_izq: ['os izq', 'ri der'],
    post_der: ['os der', 'ri izq'],
  };
  const todos = [];
  for (const c of CANALES) {
    const m = musculosDe(c.id).map((x) => `${x.musculo} ${x.lado}`);
    assert.deepEqual(m, esperado[c.id], c.id);
    todos.push(...m);
  }
  assert.equal(new Set(todos).size, 12);
});

test('la vía de cada canal cruza la línea media y los filtros cubren los seis', () => {
  for (const c of CANALES) {
    const ts = tramos(c.id);
    assert.equal(ts[0].tasa, 'aferente', c.id);
    // El nervio queda de su lado; el núcleo motor, del otro.
    const lado = (x) => Math.sign(x - 50);
    const suLado = c.lado === 'izq' ? 1 : -1;
    for (const [x] of ts[0].puntos) assert.equal(lado(x), suLado, c.id);
    const central = ts.find((t) => t.tasa === 'nucleo');
    assert.equal(lado(central.puntos.at(-1)[0]), -suLado, c.id);
    for (const t of ts) assert.ok(t.largo > 0);
  }
  assert.deepEqual(
    [...FILTROS.lateral, ...FILTROS.larp, ...FILTROS.ralp, ...FILTROS.otolitos].sort(),
    [...FILTROS.todos].sort(),
  );
});

test('en reposo y sano, todo dispara al reposo', () => {
  const a = actividad(respuestas([0, 0, 0]), [0, 0, 0], [0, 0, 0]);
  for (const c of CANALES) {
    assert.equal(a.aferente[c.id], TASA_REPOSO);
    assert.equal(a.nucleo[c.id], TASA_REPOSO);
    assert.equal(a.motor[c.id], TASA_REPOSO);
  }
});

test('un giro a la izquierda enciende la vía del lateral izquierdo y apaga la del derecho', () => {
  const omega = escala(CANAL.lat_izq.eje, 100);
  const f = funciones();
  const a = actividad(respuestas(omega, null, f), [0, 0, 0], velocidadVOR(omega, f));
  for (const tramo of ['aferente', 'nucleo', 'motor']) {
    assert.ok(a[tramo].lat_izq > TASA_REPOSO + 20, `${tramo} izq ${a[tramo].lat_izq}`);
    assert.ok(a[tramo].lat_der < TASA_REPOSO - 20, `${tramo} der ${a[tramo].lat_der}`);
  }
  // La comisura suma: el núcleo se aparta más del reposo que su nervio.
  assert.ok(a.nucleo.lat_izq > a.aferente.lat_izq);
});

test('neuritis sin compensar: el núcleo del lado enfermo calla; compensada, vuelve al reposo', () => {
  const f = funciones({ lat_izq: 'arreflexia' });
  const r = respuestas([0, 0, 0], null, f);
  const aguda = actividad(r, [0, 0, 0], [0, 0, 0], { compensado: false });
  assert.equal(aguda.aferente.lat_izq, 0);
  assert.equal(aguda.nucleo.lat_izq, 0);
  assert.equal(aguda.nucleo.lat_der, TASA_REPOSO);
  const vieja = actividad(r, [0, 0, 0], [0, 0, 0], { compensado: true });
  assert.equal(vieja.aferente.lat_izq, 0);
  assert.equal(vieja.nucleo.lat_izq, TASA_REPOSO);
  // Y el núcleo del lado muerto responde, por la comisura, a un giro al otro lado.
  const giro = actividad(respuestas(escala(CANAL.lat_der.eje, 100), null, f), [0, 0, 0], [0, 0, 0], { compensado: true });
  assert.ok(giro.nucleo.lat_izq < TASA_REPOSO - 20, `${giro.nucleo.lat_izq}`);
});

test('la motoneurona sigue la posición del ojo: mirando a la derecha, el recto lateral derecho dispara más', () => {
  // Mirar a la derecha es girar el ojo alrededor de −y: contra el eje del lateral izquierdo.
  const a = actividad(respuestas([0, 0, 0]), [0, -20, 0], [0, 0, 0]);
  assert.ok(a.motor.lat_izq > TASA_REPOSO + 20);
  assert.ok(a.motor.lat_der < TASA_REPOSO - 20);
});

test('velocidad y posición del ojo desde sus orientaciones', () => {
  const w = [30, -120, 45];
  const q0 = qEjeAngulo([0.2, 1, -0.3], 12);
  const dt = 0.01;
  const m = Math.hypot(...w);
  const q1 = qMul(qEjeAngulo(w, m * dt), q0);
  velocidadOrbita(q0, q1, dt).forEach((v, i) => assert.ok(cerca(v, w[i], 1e-6), `${v} vs ${w[i]}`));
  const rv = vectorRotacion(qEjeAngulo([0, 0, 1], 25));
  assert.ok(cerca(rv[2], 25) && cerca(rv[0], 0) && cerca(rv[1], 0));
  // Con w negativo (la misma rotación), el mismo vector.
  const rvNeg = vectorRotacion(qEjeAngulo([0, 0, 1], 25).map((x) => -x));
  assert.ok(cerca(rvNeg[2], 25));
});

test('los otolitos: el utrículo mueve los músculos de los verticales de su lado; el sáculo, el ECM', () => {
  assert.deepEqual(
    musculosDe('utr_izq').map((x) => `${x.musculo} ${x.lado}`),
    ['rs izq', 'oi der', 'os izq', 'ri der'],
  );
  assert.deepEqual(musculosDe('sac_der'), [{ musculo: 'ecm', lado: 'der' }]);
  // El utrículo va por la rama superior, con el anterior y el lateral; el
  // sáculo, por la inferior, con el posterior.
  const nervio = (id) => tramos(id)[0].puntos[1];
  assert.deepEqual(nervio('utr_izq'), nervio('ant_izq'));
  assert.deepEqual(nervio('sac_izq'), nervio('post_izq'));
  assert.notDeepEqual(nervio('utr_izq'), nervio('sac_izq'));
});

test('oreja izquierda abajo: el utrículo izquierdo dispara más, y su núcleo más todavía', () => {
  const abajo = abajoEnCabeza(qEjeAngulo([0, 0, -1], 30));
  const ro = respuestasOtolitos(abajo);
  const a = actividad({ ...respuestas([0, 0, 0]), ...ro }, [0, 0, 0], [0, 0, 0]);
  assert.ok(a.aferente.utr_izq > TASA_REPOSO + 20 && a.aferente.utr_der < TASA_REPOSO - 20);
  assert.ok(a.nucleo.utr_izq > a.aferente.utr_izq);
  // El sáculo no siente el rolido.
  assert.ok(cerca(a.nucleo.sac_izq, TASA_REPOSO, 1e-6));
});
