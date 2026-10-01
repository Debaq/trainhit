// Las partes puras del detector SIEV-VNG (pupila.js): encuadre, decodificación
// de la salida de YOLOv8, elección de la caja de cada ojo y pupila por
// centroide oscuro. La inferencia en sí necesita el navegador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENCUADRE, cajaDelOjo, centroOscuro, decodifica, encuadre } from '../js/pupila.js';

test('encuadre: los ojos caen donde caían en las imágenes de entrenamiento', () => {
  const a = { x: 400, y: 300 };
  const b = { x: 500, y: 300 };
  const e = encuadre(a, b);
  assert.ok(Math.abs(e.ancho * ENCUADRE.sepOjos - 100) < 1e-9);
  assert.ok(Math.abs(e.alto / e.ancho - ENCUADRE.alto / ENCUADRE.ancho) < 1e-9);
  assert.ok(Math.abs((a.x - e.x0) / e.ancho - (1 - ENCUADRE.sepOjos) / 2) < 1e-9);
  assert.ok(Math.abs((a.y - e.y0) / e.alto - ENCUADRE.altoOjos) < 1e-9);
});

test('decodifica: umbral de confianza y supresión de no máximos', () => {
  // Cuatro candidatos en el layout [5, n]: dos casi iguales, uno aparte y uno flojo.
  const cand = [
    [50, 50, 20, 10, 0.9],
    [51, 50, 20, 10, 0.8],
    [200, 50, 20, 10, 0.7],
    [120, 120, 20, 10, 0.1],
  ];
  const n = cand.length;
  const datos = new Float32Array(5 * n);
  cand.forEach((c, i) => c.forEach((v, k) => (datos[k * n + i] = v)));
  const cajas = decodifica(datos, n);
  assert.equal(cajas.length, 2);
  assert.ok(Math.abs(cajas[0].conf - 0.9) < 1e-6);
  assert.deepEqual([cajas[0].x0, cajas[0].y0, cajas[0].x1, cajas[0].y1], [40, 45, 60, 55]);
  assert.ok(Math.abs(cajas[1].conf - 0.7) < 1e-6);
});

test('cajaDelOjo: la más confiable cerca del ojo, nada si está lejos', () => {
  const cajas = [
    { x0: 0, y0: 0, x1: 20, y1: 10, conf: 0.5 },
    { x0: 2, y0: 0, x1: 22, y1: 10, conf: 0.6 },
    { x0: 100, y0: 0, x1: 120, y1: 10, conf: 0.99 },
  ];
  assert.equal(cajaDelOjo(cajas, { x: 11, y: 5 }, 30).conf, 0.6);
  assert.equal(cajaDelOjo(cajas, { x: 60, y: 60 }, 30), null);
});

test('centroOscuro: encuentra un disco oscuro dentro de la caja', () => {
  const W = 60;
  const H = 30;
  const gris = new Uint8ClampedArray(W * H).fill(200);
  const c = { x: 33.5, y: 14.5 };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) if (Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) <= 4) gris[y * W + x] = 20;
  }
  const p = centroOscuro(gris, W, H, { x0: 10, y0: 2, x1: 50, y1: 28 });
  assert.ok(Math.hypot(p.x - c.x, p.y - c.y) < 0.6, `pupila en ${p.x},${p.y}`);
  assert.equal(centroOscuro(gris, W, H, { x0: 10, y0: 2, x1: 11, y1: 3 }), null);
});
