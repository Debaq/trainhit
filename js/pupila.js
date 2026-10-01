// Detector de pupila alternativo: el modelo SIEV-VNG (YOLOv8n de una clase,
// «OJO»), exportado a ONNX y corrido con onnxruntime-web.
//
// Es EXPERIMENTAL. El modelo se entrenó con imágenes infrarrojas de gafas VNG
// (los dos ojos de cerca, 424×240) y lo que entrega es la CAJA de cada ojo, no
// la pupila. Por eso aquí:
//   - MediaPipe sigue a cargo de la cabeza, el parpadeo y las comisuras: este
//     modelo solo reemplaza el centro del iris.
//   - El cuadro de la webcam se recorta y se pasa a gris imitando el encuadre
//     de las gafas, que es lo que el modelo conoce.
//   - Dentro de cada caja, la pupila es el centroide de los píxeles más
//     oscuros, como hacía la app VNG con su umbral. La caja se refresca cada
//     tanto y la pupila se busca en cada cuadro: ver `crearDetectorPupila`.

const ORT_VERSION = '1.30.0';
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
export const MODELO_URL = './modelos/siev_vng_r01.onnx';

/** Lado de la entrada del modelo (imgsz del entrenamiento). */
export const LADO = 320;
/** Gris del relleno del letterbox de ultralytics. */
const RELLENO = 114 / 255;

/**
 * Encuadre de las imágenes de entrenamiento, medido sobre el dataset: cuadro
 * de 424×240, los centros de los ojos separados el 68 % del ancho y a un 34 %
 * del alto desde arriba.
 */
export const ENCUADRE = { ancho: 424, alto: 240, sepOjos: 0.68, altoOjos: 0.34 };

export const CONF_MIN = 0.25;
const IOU_NMS = 0.5;
/** Fracción de los píxeles de la caja que se toman como pupila. */
const FRACCION_OSCURA = 0.12;

/**
 * La caja del recorte, en píxeles del video, para dos centros de ojo dados.
 * Ignora el ladeo de la cabeza: con el ojo ya grande en el recorte, un ladeo
 * pequeño no le cambia nada al detector.
 */
export function encuadre(ojoA, ojoB) {
  const d = Math.hypot(ojoB.x - ojoA.x, ojoB.y - ojoA.y);
  const ancho = d / ENCUADRE.sepOjos;
  const alto = (ancho * ENCUADRE.alto) / ENCUADRE.ancho;
  const cx = (ojoA.x + ojoB.x) / 2;
  const cy = (ojoA.y + ojoB.y) / 2;
  return { x0: cx - ancho / 2, y0: cy - ENCUADRE.altoOjos * alto, ancho, alto };
}

const iou = (a, b) => {
  const ix = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const iy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const inter = ix * iy;
  const union = (a.x1 - a.x0) * (a.y1 - a.y0) + (b.x1 - b.x0) * (b.y1 - b.y0) - inter;
  return union > 0 ? inter / union : 0;
};

/**
 * De la salida cruda de YOLOv8 (`[5, n]`: cx, cy, w, h, confianza, en
 * píxeles de la entrada) a cajas `{x0, y0, x1, y1, conf}` en el mismo
 * sistema, con supresión de no máximos.
 */
export function decodifica(datos, n, { confMin = CONF_MIN, iouMax = IOU_NMS } = {}) {
  const cand = [];
  for (let i = 0; i < n; i++) {
    const conf = datos[4 * n + i];
    if (conf < confMin) continue;
    const cx = datos[i];
    const cy = datos[n + i];
    const w = datos[2 * n + i];
    const h = datos[3 * n + i];
    cand.push({ x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2, conf });
  }
  cand.sort((a, b) => b.conf - a.conf);
  const quedan = [];
  for (const c of cand) if (quedan.every((q) => iou(q, c) <= iouMax)) quedan.push(c);
  return quedan;
}

/**
 * La caja que le toca a un ojo: la de más confianza cuyo centro cae cerca
 * del centro que da MediaPipe. Sin esto una ceja o una fosa nasal (que el
 * modelo a veces confunde con un ojo) podría pasar por el ojo.
 */
export function cajaDelOjo(cajas, ojo, radio) {
  let mejor = null;
  for (const c of cajas) {
    const d = Math.hypot((c.x0 + c.x1) / 2 - ojo.x, (c.y0 + c.y1) / 2 - ojo.y);
    if (d <= radio && (!mejor || c.conf > mejor.conf)) mejor = c;
  }
  return mejor;
}

/**
 * Centro de la pupila dentro de una caja: centroide de la `fraccion` más
 * oscura de sus píxeles, pesado por lo oscuro que es cada uno. Se recorta un
 * poco la caja por los costados, donde las comisuras y las pestañas también
 * son oscuras.
 *
 * @param {Float32Array|Uint8ClampedArray} gris luminancia, fila por fila
 */
export function centroOscuro(gris, ancho, alto, caja, fraccion = FRACCION_OSCURA) {
  const margen = 0.12 * (caja.x1 - caja.x0);
  const x0 = Math.max(0, Math.round(caja.x0 + margen));
  const x1 = Math.min(ancho, Math.round(caja.x1 - margen));
  const y0 = Math.max(0, Math.round(caja.y0));
  const y1 = Math.min(alto, Math.round(caja.y1));
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;

  // Umbral por histograma: el valor bajo el que queda la `fraccion` pedida.
  const hist = new Uint32Array(256);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) hist[gris[y * ancho + x] | 0]++;
  const meta = fraccion * (x1 - x0) * (y1 - y0);
  let umbral = 0;
  for (let acum = 0; umbral < 255; umbral++) {
    acum += hist[umbral];
    if (acum >= meta) break;
  }

  let sx = 0;
  let sy = 0;
  let sp = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const v = gris[y * ancho + x] | 0;
      if (v > umbral) continue;
      const p = umbral - v + 1;
      sx += p * (x + 0.5);
      sy += p * (y + 0.5);
      sp += p;
    }
  }
  return sp ? { x: sx / sp, y: sy / sp } : null;
}

const lienzo = (w, h) => {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/**
 * Cada cuánto se vuelve a correr el modelo, como mínimo. Si una inferencia
 * tarda más, se espera a que termine.
 */
export const REFRESCO_MS = 250;
/** Cuánto vale una caja sin que el modelo la vuelva a encontrar. */
export const VIGENCIA_MS = 1000;

/**
 * Carga onnxruntime-web y el modelo. `onProgreso` recibe las mismas fases que
 * `crearLandmarker`, así el modal de carga sirve tal cual.
 *
 * Por qué es rápido aunque el modelo no lo sea (~90 ms por inferencia en wasm
 * de un hilo; los hilos piden aislamiento de origen cruzado, COOP/COEP, que
 * el sitio no tiene):
 *   - el modelo solo da la CAJA del ojo, y el recorte se arma desde los
 *     centros de ojo de MediaPipe, así que la caja casi no se mueve dentro
 *     del recorte de un cuadro a otro;
 *   - entonces la pupila se busca en CADA cuadro, sincrónica (cuesta ~1 ms),
 *     dentro de la última caja conocida, y el modelo corre aparte cada
 *     `REFRESCO_MS` para refrescarla, en un worker (`proxy`) para que no
 *     trabe el hilo de la página.
 */
export async function crearDetectorPupila({ onProgreso } = {}) {
  onProgreso?.({ fase: 'motor', recibido: 0, total: null });
  // tracker.js se importa aquí y no arriba porque trae MediaPipe de la CDN:
  // así las funciones puras de este módulo se pueden probar en node.
  const { bajaModelo } = await import('./tracker.js');
  const ort = await import(`${ORT_BASE}ort.wasm.min.mjs`);
  ort.env.wasm.wasmPaths = ORT_BASE;
  ort.env.wasm.proxy = true;
  const bytes = await bajaModelo(onProgreso, MODELO_URL);
  onProgreso?.({ fase: 'iniciando', recibido: bytes.byteLength, total: bytes.byteLength });
  const sesion = await ort.InferenceSession.create(bytes, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  const entrada = sesion.inputNames[0];

  const { ancho: FW, alto: FH } = ENCUADRE;
  const escala = LADO / FW;
  const fuente = lienzo(FW, FH);
  // SIN `willReadFrequently`, a propósito: en Chromium ese canvas vive en CPU
  // y dibujar el video ahí cuesta ~5 ms por cuadro; en GPU dibujar y leer
  // los 424×240 suma ~3 ms.
  const cFuente = fuente.getContext('2d');
  const grisFuente = new Uint8ClampedArray(FW * FH);
  const radio = 0.25 * ENCUADRE.sepOjos * FW;
  /** La última caja de cada ojo, en píxeles del recorte, con su hora `t`. */
  const cajas = { derecho: null, izquierdo: null };
  let ocupado = false;
  let ultimoLanzado = -Infinity;
  let msInferencia = null;

  /**
   * Corre el modelo sobre el recorte que está en `grisFuente`. El tensor es
   * nuevo cada vez: con `proxy` su buffer se TRANSFIERE al worker y queda
   * inutilizable aquí. Son 1,2 MB cada `REFRESCO_MS`, nada.
   */
  const lanza = (centros) => {
    const tensor = new Float32Array(3 * LADO * LADO);
    // Letterbox como ultralytics: la imagen arriba a la izquierda, el resto gris.
    const altoRed = Math.round(FH * escala);
    tensor.fill(RELLENO);
    const plano = LADO * LADO;
    for (let y = 0; y < altoRed; y++) {
      const fy = Math.min(FH - 1, Math.floor(y / escala));
      for (let x = 0; x < LADO; x++) {
        const v = grisFuente[fy * FW + Math.min(FW - 1, Math.floor(x / escala))] / 255;
        const k = y * LADO + x;
        tensor[k] = v;
        tensor[plano + k] = v;
        tensor[2 * plano + k] = v;
      }
    }
    ocupado = true;
    const t0 = performance.now();
    sesion
      .run({ [entrada]: new ort.Tensor('float32', tensor, [1, 3, LADO, LADO]) })
      .then((out) => {
        msInferencia = performance.now() - t0;
        const salida = out[sesion.outputNames[0]];
        // De la entrada de la red al recorte de 424×240.
        const encontradas = decodifica(salida.data, salida.dims[2]).map((c) => ({
          x0: c.x0 / escala,
          y0: c.y0 / escala,
          x1: c.x1 / escala,
          y1: c.y1 / escala,
          conf: c.conf,
        }));
        const t = performance.now();
        for (const lado of ['derecho', 'izquierdo']) {
          const c = cajaDelOjo(encontradas, centros[lado], radio);
          if (c) cajas[lado] = { ...c, t };
        }
      })
      .catch((e) => console.warn('detector SIEV-VNG', e))
      .finally(() => {
        ocupado = false;
      });
  };

  return {
    /** Lo que tardó la última inferencia, en ms (null antes de la primera). */
    get msInferencia() {
      return msInferencia;
    },
    /**
     * La pupila de cada ojo en el cuadro actual del video. Sincrónica: busca
     * dentro de la última caja que dio el modelo y, si toca, lanza otra
     * inferencia con este mismo cuadro.
     *
     * @param {{x:number,y:number}} ojoDer centro del ojo derecho según MediaPipe, en px del video
     * @param {{x:number,y:number}} ojoIzq ídem, ojo izquierdo
     * @returns {{derecho: object|null, izquierdo: object|null}} por ojo
     *   `{ caja, pupila, conf }`, caja y pupila en px del video; null si el
     *   modelo no encontró ese ojo hace menos de `VIGENCIA_MS`
     */
    detecta(video, ojoDer, ojoIzq) {
      const enc = encuadre(ojoDer, ojoIzq);
      cFuente.fillStyle = '#727272';
      cFuente.fillRect(0, 0, FW, FH);
      cFuente.drawImage(video, enc.x0, enc.y0, enc.ancho, enc.alto, 0, 0, FW, FH);
      // Gris: las imágenes de entrenamiento son infrarrojas, sin color.
      const px = cFuente.getImageData(0, 0, FW, FH).data;
      for (let i = 0, j = 0; j < grisFuente.length; i += 4, j++) {
        grisFuente[j] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      }

      const k = enc.ancho / FW;
      const aVideo = (p) => ({ x: enc.x0 + p.x * k, y: enc.y0 + p.y * k });
      const aFuente = (p) => ({ x: (p.x - enc.x0) / k, y: (p.y - enc.y0) / k });
      const ahora = performance.now();
      if (!ocupado && ahora - ultimoLanzado >= REFRESCO_MS) {
        ultimoLanzado = ahora;
        lanza({ derecho: aFuente(ojoDer), izquierdo: aFuente(ojoIzq) });
      }

      const ojo = (lado) => {
        const c = cajas[lado];
        if (!c || ahora - c.t > VIGENCIA_MS) return null;
        const p = centroOscuro(grisFuente, FW, FH, c);
        if (!p) return null;
        const a = aVideo({ x: c.x0, y: c.y0 });
        const b = aVideo({ x: c.x1, y: c.y1 });
        return { caja: { x0: a.x, y0: a.y, x1: b.x, y1: b.y }, pupila: aVideo(p), conf: c.conf };
      };
      return { derecho: ojo('derecho'), izquierdo: ojo('izquierdo') };
    },
  };
}
