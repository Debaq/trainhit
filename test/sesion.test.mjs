// Exportar y volver a importar una sesión tiene que dar los mismos pulsos:
// si el CSV pierde precisión o el margen del derivador, recalcular un pulso
// importado da otra ganancia y nadie se entera.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASOS, K_EJEMPLO, calibracionDeEjemplo, crudoDeEjemplo } from '../js/ejemplo.js';
import { procesaCrudo } from '../js/pipeline.js';
import { CONFIG } from '../js/analysis.js';
import * as geom from '../js/geom.js';
import { leeSesion, tablas, textoSesion } from '../js/sesion.js';

const DERIV = { windowMs: 50, degree: 2 };

function sesionDe(letra) {
  const model = new geom.EyeModel();
  model.kParallax = K_EJEMPLO;
  model.calibrated = true;
  return CASOS[letra].pulsos.map((p, i) => {
    const { crudo, tTrigger } = crudoDeEjemplo(p, 100 + i);
    // Como un pulso medido: el tiempo es el del video, no arranca en cero.
    const corrido = crudo.map((c) => ({ ...c, t: c.t + 37.5 }));
    const t = procesaCrudo(corrido, tTrigger + 37.5, model, DERIV, CONFIG);
    return Object.assign(t, { id: i + 1, crudo: corrido, calibrado: true, k: K_EJEMPLO, deriv: DERIV });
  });
}

function reimporta(texto) {
  return leeSesion(texto).pulsos.map((p) => {
    const model = new geom.EyeModel();
    model.kParallax = p.k;
    model.calibrated = p.calibrado;
    return procesaCrudo(p.crudo, 0, model, p.deriv, CONFIG);
  });
}

test('exportar e importar da los mismos pulsos', () => {
  const orig = sesionDe('D');
  const texto = textoSesion({ trials: orig, version: 'x', calibracion: calibracionDeEjemplo() });
  const vuelta = reimporta(texto);
  assert.equal(vuelta.length, orig.length);
  vuelta.forEach((t, i) => {
    assert.equal(t.side, orig[i].side);
    assert.equal(t.rejected, orig[i].rejected);
    assert.ok(Math.abs(t.gain - orig[i].gain) < 0.005, `#${i + 1}: ${t.gain} vs ${orig[i].gain}`);
    assert.equal(t.sacadas.length, orig[i].sacadas.length);
  });
  const { calibracion } = leeSesion(texto);
  const fit = geom.fitParallax(calibracion, geom.EYE_ROTATION_RADIUS_MM);
  assert.ok(Math.abs(fit.kParallax - K_EJEMPLO) < 0.03);
});

test('el parpadeo viaja como puntaje y se puede volver a umbralizar', () => {
  const orig = sesionDe('E');
  const p = leeSesion(textoSesion({ trials: orig })).pulsos;
  assert.ok(p.every((x) => x.crudo.every((c) => typeof c.blinkScore === 'number')));
});

test('se lee un CSV guardado por una planilla con punto y coma y coma decimal', () => {
  const texto = textoSesion({ trials: sesionDe('A') })
    .split('\n')
    .map((l) => (l.startsWith('#') ? l : l.replaceAll(',', ';').replace(/(\d)\.(\d)/g, '$1,$2')))
    .join('\n');
  const t = tablas(texto);
  assert.ok(t.crudo.length > 100);
  const vuelta = reimporta(texto);
  const orig = sesionDe('A');
  vuelta.forEach((x, i) => assert.ok(Math.abs(x.gain - orig[i].gain) < 0.005));
});

test('un CSV sin tabla de crudo dice por qué no se puede importar', () => {
  assert.throws(() => leeSesion('# TABLA: pulsos\nid,lado\n1,derecha\n'), /versión anterior/);
  assert.throws(() => leeSesion('hola,mundo\n'), /no parece/);
});
