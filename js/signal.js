// Derivación y suavizado de señales angulares. Port didáctico de
// `rust/src/signal.rs` (sin el achique adaptativo de ventana del original).
//
// Derivar con (a - prev)/dt usando el reloj del bucle tiene dos problemas:
//
// 1. Un derivador puro amplifica el ruido del landmark linealmente con la
//    frecuencia, y el ruido de MediaPipe en el centro del iris no es chico.
// 2. El dt del bucle incluye el jitter de captura e inferencia, que no tiene
//    nada que ver con cuándo se tomó realmente el frame.
//
// Acá se ajusta un polinomio por mínimos cuadrados sobre una ventana temporal y
// se evalúan p y p' en el instante de interés: un Savitzky-Golay generalizado a
// muestreo NO uniforme. Con los timestamps reales de cada frame, el jitter deja
// de ser ruido y pasa a ser información sobre dónde cae cada punto.
//
// Grado 2 y no 1 a propósito: un ajuste lineal APLANA EL PICO del impulso, que
// es justamente el valor que se quiere medir.

/**
 * Ajusta un polinomio de grado `degree` a los puntos (t, v) y devuelve
 * `{value, slope, rms}` evaluados en `tEval`.
 *
 * El eje de tiempo se centra en `tEval` y se normaliza por el semiancho de la
 * ventana antes de armar las ecuaciones normales: sin ese escalado, con tiempos
 * en segundos y ventanas de 50 ms, la matriz queda mal condicionada.
 */
export function lsqFit(pts, tEval, degree) {
  const d = Math.min(degree, 3);
  if (pts.length < d + 1) return null;

  const scale = pts.reduce((m, [t]) => Math.max(m, Math.abs(t - tEval)), 0);
  if (scale <= 0) return null; // todas las muestras en el mismo instante

  const m = d + 1;
  const moments = new Array(2 * d + 1).fill(0);
  const rhs = new Array(m).fill(0);
  for (const [t, v] of pts) {
    const u = (t - tEval) / scale;
    let p = 1;
    for (let k = 0; k <= 2 * d; k++) {
      moments[k] += p;
      if (k < m) rhs[k] += v * p;
      p *= u;
    }
  }

  // Ecuaciones normales: A[i][j] = sum(u^(i+j)).
  const a = new Array(m * m);
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) a[i * m + j] = moments[i + j];
  const coeffs = solveDense(a, rhs.slice(), m);
  if (!coeffs) return null;

  let sq = 0;
  for (const [t, v] of pts) {
    const u = (t - tEval) / scale;
    let p = 1;
    let fit = 0;
    for (const c of coeffs) {
      fit += c * p;
      p *= u;
    }
    sq += (v - fit) ** 2;
  }

  // p(u) = c0 + c1*u + ...  con u = (t - tEval)/scale.
  // En tEval: valor = c0, y dp/dt = c1/scale.
  return { value: coeffs[0], slope: coeffs[1] / scale, rms: Math.sqrt(sq / pts.length) };
}

/** Eliminación gaussiana con pivoteo parcial, para sistemas chicos (m <= 4). */
function solveDense(a, b, m) {
  for (let col = 0; col < m; col++) {
    let pivot = col;
    for (let row = col + 1; row < m; row++) {
      if (Math.abs(a[row * m + col]) > Math.abs(a[pivot * m + col])) pivot = row;
    }
    if (Math.abs(a[pivot * m + col]) < 1e-12) return null;
    if (pivot !== col) {
      for (let k = 0; k < m; k++) {
        const t = a[col * m + k];
        a[col * m + k] = a[pivot * m + k];
        a[pivot * m + k] = t;
      }
      const t = b[col];
      b[col] = b[pivot];
      b[pivot] = t;
    }
    for (let row = col + 1; row < m; row++) {
      const f = a[row * m + col] / a[col * m + col];
      if (f === 0) continue;
      for (let k = col; k < m; k++) a[row * m + k] -= f * a[col * m + k];
      b[row] -= f * b[col];
    }
  }
  const x = new Array(m).fill(0);
  for (let i = m - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < m; j++) s -= a[i * m + j] * x[j];
    x[i] = s / a[i * m + i];
  }
  return x;
}

/**
 * Deriva cabeza y mirada sobre una ventana deslizante.
 *
 * Evalúa en el CENTRO de la ventana, no en el borde: un ajuste evaluado en el
 * extremo extrapola, y extrapolar un polinomio de grado 2 sobre ruido es la
 * receta del sobre-tiro. El precio es una latencia de media ventana, que para
 * medir no importa porque el análisis es fuera de línea respecto del pulso.
 */
export class Differentiator {
  constructor(windowMs = 50, degree = 2) {
    this.windowS = windowMs / 1000;
    this.degree = degree;
    this.samples = [];
  }

  setWindow(windowMs, degree) {
    this.windowS = windowMs / 1000;
    this.degree = degree;
  }

  reset() {
    this.samples = [];
  }

  /**
   * Agrega una muestra `{t, headDeg, gazeDeg}` (t en segundos) y devuelve
   * `{t, headDeg, gazeDeg, headVel, gazeVel, residDeg}` o null si la ventana
   * todavía no está caliente.
   */
  push(sample) {
    const last = this.samples[this.samples.length - 1];
    // Un salto hacia atrás solo puede venir de un frame desordenado: la ventana
    // deja de ser válida.
    if (last && sample.t < last.t) this.samples.length = 0;
    this.samples.push(sample);

    // Se recorta por TIEMPO, pero nunca por debajo de degree+1 muestras: con esa
    // cantidad el ajuste pasa exacto por los puntos y equivale a una diferencia
    // centrada, que es lo máximo que da una cámara de 30 fps (a 30 fps una
    // ventana de 50 ms son 2 muestras y no alcanzarían).
    const minSamples = this.degree + 1;
    const newest = this.samples[this.samples.length - 1].t;
    while (this.samples.length > minSamples && newest - this.samples[0].t > this.windowS) {
      this.samples.shift();
    }
    if (this.samples.length < minSamples) return null;

    const oldest = this.samples[0].t;
    const tEval = (oldest + newest) * 0.5;
    const head = this.samples.map((s) => [s.t, s.headDeg]);
    const gaze = this.samples.map((s) => [s.t, s.gazeDeg]);
    const fh = lsqFit(head, tEval, this.degree);
    const fg = lsqFit(gaze, tEval, this.degree);
    if (!fh || !fg) return null;

    return {
      t: tEval,
      headDeg: fh.value,
      gazeDeg: fg.value,
      headVel: fh.slope,
      gazeVel: fg.slope,
      residDeg: Math.max(fh.rms, fg.rms),
      n: this.samples.length,
    };
  }
}
