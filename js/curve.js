// Interpolación para DIBUJAR curvas, no para medir. Port de `rust/src/curve.rs`.
//
// A 30 fps un impulso cae en unas cinco muestras, así que unir los puntos con
// rectas da una traza angulosa. La tentación es pasarle una spline y listo.
//
// El problema es que las splines habituales —Catmull-Rom, cúbica natural—
// SOBREPASAN los datos: entre dos muestras pueden dibujar un valor más alto que
// las dos. En un gráfico de velocidad eso es dibujar un pico que nunca se
// midió, y el pico de velocidad es uno de los números que se reportan. Sería
// inventar un dato con forma de suavizado.
//
// Por eso se usa Hermite cúbica monótona (Fritsch-Carlson): acota las tangentes
// para que la curva nunca se salga del rango de los puntos que une. Pasa exacto
// por cada muestra y entre dos se queda entre sus valores. Es lo máximo que se
// puede suavizar sin mentir.
//
// Aun así, suavizar una señal submuestreada la hace PARECER más precisa de lo
// que es. Por eso, con el suavizado encendido, los gráficos dibujan además los
// puntos de las muestras reales: la densidad de los marcadores es lo que
// muestra cuántos datos hay. Y por eso se puede apagar.

/** Cuántos puntos se generan entre dos muestras al suavizar. */
export const SUBDIVISIONES = 8;

/**
 * Interpola `pts` (pares `[x, y]`, ordenados por x) con Hermite monótona.
 *
 * Con menos de tres puntos devuelve la entrada tal cual: cualquier spline sobre
 * dos puntos es la recta.
 */
export function monotona(pts, subdiv = SUBDIVISIONES) {
  const n = pts.length;
  if (n < 3 || subdiv === 0) return pts;

  // Pendientes de los segmentos.
  const sec = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1][0] - pts[i][0];
    sec.push(Math.abs(dx) < 1e-12 ? 0 : (pts[i + 1][1] - pts[i][1]) / dx);
  }

  // Tangente en cada punto: promedio de las dos pendientes vecinas. Un cambio
  // de signo es un extremo local: tangente cero, para que la curva no se pase
  // de largo justo en el pico.
  const m = [sec[0]];
  for (let i = 1; i < n - 1; i++) {
    m.push(sec[i - 1] * sec[i] <= 0 ? 0 : (sec[i - 1] + sec[i]) * 0.5);
  }
  m.push(sec[n - 2]);

  // Acotado de Fritsch-Carlson: es lo que garantiza que no haya sobrepaso.
  for (let i = 0; i < n - 1; i++) {
    const d = sec[i];
    if (d === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const alpha = m[i] / d;
    const beta = m[i + 1] / d;
    const s = alpha * alpha + beta * beta;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * alpha * d;
      m[i + 1] = tau * beta * d;
    }
  }

  const out = [];
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const hh = x1 - x0;
    out.push([x0, y0]);
    if (Math.abs(hh) < 1e-12) continue;
    for (let k = 1; k < subdiv; k++) {
      const t = k / subdiv;
      const t2 = t * t;
      const t3 = t2 * t;
      // Base de Hermite.
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      out.push([x0 + t * hh, h00 * y0 + h10 * hh * m[i] + h01 * y1 + h11 * hh * m[i + 1]]);
    }
  }
  out.push(pts[n - 1]);
  return out;
}
