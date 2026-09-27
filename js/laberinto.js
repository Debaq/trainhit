// Laberinto 3D: cabeza, ojos y laberintos para ver qué canal siente cada giro.
//
// Toma la pantalla entera: la sección no tiene nada que ver con la cámara ni
// con los pulsos, es un modelo para mirar y tocar. La cabeza se gira con el
// mouse o el dedo, o —en un teléfono— con el teléfono mismo: el teléfono ES la
// cabeza. La webcam no se usa acá.
//
// Tres vistas:
//   canales    los seis canales, pintados por par coplanar, con rótulos y el
//              interruptor de tamaño real.
//   ejes       el eje que excita a cada canal (mano derecha) y los tres planos
//              de examen: lateral, LARP y RALP. Vista de arriba.
//   respuesta  impulsos armados y giro libre: cada canal se pinta de rojo si
//              se excita y de azul si se inhibe, con la tasa de disparo en
//              barras, y los ojos contragiran (VOR de ganancia 1).
//
// La física —ejes, tasas, perfiles— está en canales.js, sin DOM. Acá va la
// escena y la interfaz.
//
// El modelo: si existe `modelos/laberinto.glb` se usa ese; si no, uno
// provisorio armado con primitivas. Los dos siguen el mismo contrato de nombres
// (ver `NOMBRES`) y el mismo marco que canales.js: metros, +x a la izquierda
// del paciente, +y arriba, +z hacia la nariz. En Blender eso es exportar a
// glTF con «+Y Up» y la cara mirando a −Y.
//
// three.js se baja recién al abrir la sección: el resto de la página no lo
// necesita y pesa unos 2 MB. Después queda en el service worker como MediaPipe.

import {
  CANALES,
  CANAL,
  MOVIMIENTOS,
  TASA_MAX,
  TASA_REPOSO,
  activacion,
  normalDePlano,
  perfilImpulso,
  qEjeAngulo,
  qInv,
  qMul,
  respuestas,
  velocidadAngular,
} from './canales.js';
import { OJO, mallaCabeza } from './cabeza.js';
import { alCambiarIdioma, tx } from './idioma.js';

const $ = (id) => document.getElementById(id);

const MODELO_URL = 'modelos/laberinto.glb';

/** Nombres de los objetos en el .glb: el contrato con quien hace el modelo. */
export const NOMBRES = {
  cabeza: 'cabeza',
  ojos: { izq: 'ojo_izq', der: 'ojo_der' },
  vestibulo: { izq: 'vestibulo_izq', der: 'vestibulo_der' },
  coclea: { izq: 'coclea_izq', der: 'coclea_der' },
  // Los canales usan el id de canales.js: canal_lat_izq, canal_ant_der…
  canal: (id) => `canal_${id}`,
};

/**
 * Desde dónde mira la cámara, en grados. Con los laberintos a los lados, de
 * frente: se ven los dos, uno a cada lado. En su lugar, en tres cuartos desde
 * la izquierda del paciente y un poco arriba: de frente quedan detrás de los
 * ojos y no se distingue un canal del otro. «Centrar» vuelve siempre de
 * frente, cara a cara, que es como se piensa la mirada al frente.
 */
const CAMARA_TRES_CUARTOS = { az: 32, el: 14 };
const CAMARA_FRENTE = { az: 0, el: 0 };

/**
 * Dónde y a qué escala van los laberintos. Son las tres formas de aVOR:
 *
 *   lados  afuera de la cabeza, uno a cada lado y bien grandes: se ven sin
 *          nada adelante, y giran con la cabeza igual que en su lugar.
 *   lugar  en su posición anatómica, agrandados cuatro veces.
 *   real   en su posición anatómica y a tamaño real: un canal mide unos 6 mm
 *          de lado a lado, más chico que el iris.
 *
 * `x` es a qué distancia del plano medio va el centro de cada vestíbulo
 * (null: la anatómica). `ancho` es lo que tiene que entrar de costado a
 * costado en la pantalla, para alejar la cámara en un teléfono parado.
 * Elegir un modo lleva la cámara a la suya.
 */
const MODOS_LABERINTO = {
  lados: { aumento: 7, x: 0.14, ancho: 0.5, camara: CAMARA_FRENTE },
  lugar: { aumento: 4, x: null, ancho: 0.24, camara: CAMARA_TRES_CUARTOS },
  real: { aumento: 1, x: null, ancho: 0.24, camara: CAMARA_TRES_CUARTOS },
};
/** Constante de tiempo del paso de una forma a otra, en segundos. */
const TAU_MODO_S = 0.12;

/** Hasta dónde gira el ojo en la órbita antes de una fase rápida, en grados. */
const LIMITE_OJO_DEG = 40;
/** Constante de tiempo de la fase rápida que devuelve el ojo al centro. */
const TAU_SACADA_S = 0.025;
/** Suavizado de la velocidad medida de a cuadros (mouse, dedo, teléfono). */
const TAU_OMEGA_S = 0.06;

/** Grados por píxel al arrastrar. */
const GRADOS_POR_PX = 0.45;
/** Distancia mínima de la cámara; más lejos si el modo no entra en pantalla. */
const DIST_INICIAL = 0.42;
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 3.5;
/** Altura del punto al que mira la cámara: entre los ojos y los oídos. */
const MIRA_Y = 0.015;


/** Amplitud de los impulsos armados, en grados: la de un impulso de vHIT. */
const AMPLITUD_IMPULSO = 20;

// Colores. Los de par no usan rojo ni azul: esos dos quedan para excitado e
// inhibido, que es lo que se lee en «respuesta».
const COLOR_PAR = { lateral: 0x4db6e8, larp: 0xd18800, ralp: 0x9b51d0 };
const COLOR_REPOSO = 0x8a8a93;
/** Con este giro, en °/s, los canales ya dejaron el color de par por el gris. */
const GIRO_PARA_GRIS = 15;
const COLOR_EXCITADO = 0xe0302a;
const COLOR_INHIBIDO = 0x2e7dd6;

const NOMBRE_CANAL = {
  lat_izq: () => tx('lateral izq.'),
  ant_izq: () => tx('anterior izq.'),
  post_izq: () => tx('posterior izq.'),
  lat_der: () => tx('lateral der.'),
  ant_der: () => tx('anterior der.'),
  post_der: () => tx('posterior der.'),
};

const Q1 = () => [0, 0, 0, 1];

/** Esférica entre dos cuaterniones [x, y, z, w]. */
function qSlerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const bb = d < 0 ? b.map((v) => -v) : b;
  d = Math.abs(d);
  if (d > 0.9995) {
    const q = a.map((v, i) => v + (bb[i] - v) * t);
    const n = Math.hypot(...q);
    return q.map((v) => v / n);
  }
  const th = Math.acos(d);
  const s = Math.sin(th);
  const ka = Math.sin((1 - t) * th) / s;
  const kb = Math.sin(t * th) / s;
  return a.map((v, i) => ka * v + kb * bb[i]);
}

const anguloDe = (q) => (2 * Math.acos(Math.min(1, Math.abs(q[3])))) * (180 / Math.PI);

export function montaLaberinto() {
  const st = {
    abierta: false,
    listo: null, // promesa de la carga
    T: null, // three.js
    vista: 'canales',
    cenital: false,
    modoLab: 'lados',
    rotulos: true,
    // Orientación de la cabeza en el mundo: la manual (mouse, dedo, teclas)
    // compuesta con la del teléfono.
    qManual: Q1(),
    qSensor: Q1(),
    sensor: { activo: false, qRef: null, q: null },
    qCabeza: Q1(),
    qPrevia: Q1(),
    // Hacia dónde mira el ojo en el mundo. Con VOR perfecto no se mueve.
    qMirada: Q1(),
    faseRapida: false,
    omega: [0, 0, 0],
    impulso: null,
    dist: DIST_INICIAL,
    distBase: null,
    zoom: 1,
    camara: CAMARA_FRENTE,
    pan: [0, 0, 0],
    tPrevio: 0,
    raf: 0,
    ejesMedidos: null,
  };

  const seccion = $('laberinto');
  const lienzo = $('lab-canvas');
  const caja = $('lab-escena');
  const rotulos = $('lab-rotulos');
  const estado = $('lab-estado');

  // ------------------------------------------------------------ interfaz ---

  for (const b of seccion.querySelectorAll('[data-vista]')) {
    b.addEventListener('click', () => ponVista(b.dataset.vista));
  }
  $('lab-salir').addEventListener('click', () => cierra());
  $('lab-centrar').addEventListener('click', () => centra());
  for (const b of seccion.querySelectorAll('[data-modo-lab]')) {
    b.addEventListener('click', () => {
      st.modoLab = b.dataset.modoLab;
      st.camara = MODOS_LABERINTO[st.modoLab].camara;
      for (const o of seccion.querySelectorAll('[data-modo-lab]')) {
        o.setAttribute('aria-checked', String(o === b));
      }
    });
  }
  $('lab-rotulos-ver').addEventListener('change', (e) => {
    st.rotulos = e.target.checked;
    rotulos.hidden = !st.rotulos;
  });
  $('lab-cabeza-ver').addEventListener('change', (e) => {
    if (st.escena) st.escena.piel.forEach((m) => (m.visible = e.target.checked));
  });
  for (const par of ['lateral', 'larp', 'ralp']) {
    $(`lab-plano-${par}`).addEventListener('change', (e) => {
      if (st.escena) st.escena.planos[par].visible = e.target.checked;
    });
  }
  $('lab-flechas').addEventListener('change', () => aplicaVista());
  $('lab-cenital').addEventListener('click', () => {
    st.cenital = !st.cenital;
    $('lab-cenital').setAttribute('aria-pressed', String(st.cenital));
  });
  $('lab-vpico').addEventListener('input', pintaVpico);
  pintaVpico();

  const botonesMov = $('lab-movimientos');
  for (const m of MOVIMIENTOS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.mov = m.id;
    b.addEventListener('click', () => lanzaImpulso(m));
    botonesMov.append(b);
  }

  // Una fila de barra por canal, en el orden de canales.js.
  const barras = $('lab-barras');
  const filas = {};
  for (const c of CANALES) {
    const fila = document.createElement('div');
    fila.className = `lab-fila par-${c.par}`;
    fila.innerHTML = '<span class="nombre"></span><span class="pista"><i class="relleno"></i><i class="reposo"></i></span><b class="valor"></b>';
    barras.append(fila);
    filas[c.id] = {
      nombre: fila.querySelector('.nombre'),
      relleno: fila.querySelector('.relleno'),
      valor: fila.querySelector('.valor'),
    };
    fila.querySelector('.reposo').style.left = `${(100 * TASA_REPOSO) / TASA_MAX}%`;
  }

  const sensoresPosibles =
    'DeviceOrientationEvent' in window && window.matchMedia?.('(pointer: coarse)').matches;
  $('lab-sensores').hidden = !sensoresPosibles;
  $('lab-sensores').addEventListener('click', () => (st.sensor.activo ? apagaSensores() : prendeSensores()));

  function traduce() {
    for (const b of botonesMov.children) {
      b.textContent = tx(MOVIMIENTOS.find((m) => m.id === b.dataset.mov).nombre);
    }
    for (const c of CANALES) filas[c.id].nombre.textContent = NOMBRE_CANAL[c.id]();
    for (const r of rotulos.children) r.textContent = NOMBRE_CANAL[r.dataset.canal]();
    pintaVpico();
    pintaSensores();
  }
  alCambiarIdioma(traduce);
  traduce();

  function pintaVpico() {
    $('lab-vpico-valor').textContent = `${$('lab-vpico').value} °/s`;
  }

  function pintaSensores() {
    const b = $('lab-sensores');
    b.textContent = st.sensor.activo ? tx('Soltar el teléfono') : tx('Mover con el teléfono');
    b.setAttribute('aria-pressed', String(st.sensor.activo));
  }

  function ponVista(v) {
    st.vista = v;
    for (const b of seccion.querySelectorAll('[data-vista]')) b.setAttribute('aria-selected', String(b.dataset.vista === v));
    for (const p of seccion.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== v;
    // Los ejes se entienden desde arriba; al salir se vuelve de frente.
    st.cenital = v === 'ejes';
    $('lab-cenital').setAttribute('aria-pressed', String(st.cenital));
    aplicaVista();
  }

  // ------------------------------------------------------ abrir y cerrar ---

  function abre() {
    if (st.abierta) return;
    st.abierta = true;
    seccion.hidden = false;
    document.body.classList.add('con-laberinto');
    $('btn-laberinto').setAttribute('aria-pressed', 'true');
    st.listo ??= carga();
    st.listo.then((ok) => {
      if (ok && st.abierta && !st.raf) {
        st.tPrevio = performance.now();
        st.raf = requestAnimationFrame(cuadro);
      }
    });
    $('lab-salir').focus();
  }

  function cierra() {
    if (!st.abierta) return;
    st.abierta = false;
    seccion.hidden = true;
    document.body.classList.remove('con-laberinto');
    $('btn-laberinto').setAttribute('aria-pressed', 'false');
    cancelAnimationFrame(st.raf);
    st.raf = 0;
    apagaSensores();
    $('btn-laberinto').focus();
  }

  document.addEventListener('keydown', (e) => {
    if (!st.abierta || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const k = e.key;
    const paso = 5;
    const gira = (eje, g) => {
      e.preventDefault();
      giraMundo(eje, g);
    };
    if (k === 'Escape') cierra();
    else if (k === 'ArrowLeft') gira([0, 1, 0], -paso);
    else if (k === 'ArrowRight') gira([0, 1, 0], paso);
    else if (k === 'ArrowUp') gira([1, 0, 0], -paso);
    else if (k === 'ArrowDown') gira([1, 0, 0], paso);
    else if (k === 'q' || k === 'Q') gira([0, 0, 1], paso);
    else if (k === 'e' || k === 'E') gira([0, 0, 1], -paso);
    else if (k === '0' || k === 'Home') centra();
  });

  // --------------------------------------------------------------- carga ---

  async function carga() {
    estado.hidden = false;
    estado.textContent = tx('cargando el modelo 3D…');
    try {
      st.T = await import('three');
      montaEscena();
      // GET y no HEAD: el service worker solo guarda los GET, y sin red el
      // modelo tiene que salir de ahí.
      let glb = null;
      try {
        const r = await fetch(MODELO_URL);
        if (r.ok) glb = await cargaGlb(await r.arrayBuffer());
      } catch (e) {
        console.warn('laberinto: sin modelo .glb, va el provisorio', e);
      }
      armaModelo(glb);
      estado.hidden = true;
      new ResizeObserver(ajustaTamano).observe(caja);
      ajustaTamano();
      return true;
    } catch (e) {
      console.error('laberinto:', e);
      estado.textContent = tx('no se pudo cargar three.js: hace falta red la primera vez');
      st.listo = null; // que se reintente al volver a abrir
      return false;
    }
  }

  async function cargaGlb(datos) {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const gltf = await new GLTFLoader().parseAsync(datos, '');
    return gltf.scene;
  }

  function montaEscena() {
    const T = st.T;
    const renderer = new T.WebGLRenderer({ canvas: lienzo, antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x09090b);
    const escena = new T.Scene();
    const camara = new T.PerspectiveCamera(35, 1, 0.01, 10);
    escena.add(new T.HemisphereLight(0xffffff, 0x303038, 1.4));
    const sol = new T.DirectionalLight(0xffffff, 1.6);
    sol.position.set(0.6, 1, 1.2);
    escena.add(sol);
    const contra = new T.DirectionalLight(0xffffff, 0.5);
    contra.position.set(-0.8, 0.3, -1);
    escena.add(contra);
    // La cabeza: todo lo que gira con ella cuelga de acá.
    const cabeza = new T.Group();
    escena.add(cabeza);
    st.r = { renderer, escena, camara, cabeza };
  }

  // -------------------------------------------------------------- modelo ---

  /**
   * Arma el modelo en la cabeza: el .glb si vino, si no el provisorio. De los
   * dos saca lo mismo —piel, ojos, laberintos y canales— para que el resto no
   * sepa cuál es.
   */
  function armaModelo(glb) {
    const T = st.T;
    const { cabeza } = st.r;
    const raiz = glb ?? modeloProvisorio(T);
    cabeza.add(raiz);
    raiz.updateMatrixWorld(true);

    // Todo se busca antes de mover nada: después los laberintos cuelgan de
    // sus grupos y ya no están debajo de `raiz`.
    const busca = (nombre) => raiz.getObjectByName(nombre);
    const objCanal = Object.fromEntries(CANALES.map((c) => [c.id, busca(NOMBRES.canal(c.id))]));
    const cab = busca(NOMBRES.cabeza);
    const ojos = {};
    for (const lado of ['izq', 'der']) {
      const o = busca(NOMBRES.ojos[lado]);
      if (o) ojos[lado] = { obj: o, reposo: o.quaternion.clone() };
    }

    // Cada laberinto en un grupo centrado en su vestíbulo, para agrandarlo
    // sobre sí mismo sin que se vaya de lugar.
    const laberintos = {};
    const canales = {};
    const ejes = {};
    for (const lado of ['izq', 'der']) {
      const piezas = [
        busca(NOMBRES.vestibulo[lado]),
        busca(NOMBRES.coclea[lado]),
        ...CANALES.filter((c) => c.lado === lado).map((c) => objCanal[c.id]),
      ].filter(Boolean);
      if (!piezas.length) continue;
      const centro = new T.Box3().setFromObject(piezas[0]).getCenter(new T.Vector3());
      const grupo = new T.Group();
      grupo.position.copy(cabeza.worldToLocal(centro.clone()));
      cabeza.add(grupo);
      grupo.updateMatrixWorld(true);
      for (const p of piezas) grupo.attach(p);
      grupo.userData.anatomica = grupo.position.clone();
      laberintos[lado] = grupo;
    }
    for (const c of CANALES) {
      const obj = objCanal[c.id];
      if (!obj) continue;
      const materiales = [];
      obj.traverse((m) => {
        if (!m.isMesh) return;
        m.material = new T.MeshStandardMaterial({ roughness: 0.45, metalness: 0 });
        materiales.push(m.material);
      });
      const grupo = laberintos[c.lado];
      // El rótulo va más afuera que el centro del canal, alejado del
      // vestíbulo: en el centro se pisaban los tres de cada lado.
      const ancla = grupo.worldToLocal(new T.Box3().setFromObject(obj).getCenter(new T.Vector3())).multiplyScalar(1.8);
      canales[c.id] = { obj, materiales, ancla, grupo };
      // Con el modelo de verdad, el eje sale de la malla y no del libro.
      if (glb) ejes[c.id] = ejeDeMalla(obj, c.eje);
    }
    st.ejesMedidos = glb && Object.keys(ejes).length === CANALES.length ? ejes : null;

    // La piel: lo de la cabeza que no es ojo ni laberinto, translúcido.
    // Los laberintos ya se mudaron a sus grupos; los ojos pueden seguir
    // colgando de la cabeza y se los saltea.
    //
    // Los ojos no se ven a través de la piel sino por la hendidura de los
    // párpados. Para eso la piel se dibuja dos veces: primero invisible, solo
    // en el z-buffer, y recién después los ojos, que quedan tapados salvo
    // donde la piel tiene el hueco. Los laberintos van antes que todo eso y
    // se siguen viendo a través. El orden: laberintos (0), piel en el z-buffer
    // (1), ojos (2), y la piel translúcida al final, que es transparente.
    const esOjo = (m) => {
      for (let o = m; o && o !== cab; o = o.parent) if (/^ojo_/.test(o.name)) return true;
      return false;
    };
    const mallasPiel = [];
    cab?.traverse((m) => {
      if (m.isMesh && !esOjo(m)) mallasPiel.push(m);
    });
    const piel = [];
    const soloProfundidad = new T.MeshBasicMaterial({ colorWrite: false });
    for (const m of mallasPiel) {
      m.material = m.material.clone();
      Object.assign(m.material, { transparent: true, opacity: 0.22, depthWrite: false });
      const oclusor = new T.Mesh(m.geometry, soloProfundidad);
      oclusor.renderOrder = 1;
      m.add(oclusor);
      piel.push(m);
    }
    for (const o of Object.values(ojos)) o.obj.traverse((m) => (m.renderOrder = 2));

    // Rótulos: uno por canal, en HTML encima del lienzo.
    rotulos.replaceChildren(
      ...Object.keys(canales).map((id) => {
        const r = document.createElement('span');
        r.className = `lab-rotulo par-${CANAL[id].par}`;
        r.dataset.canal = id;
        r.textContent = NOMBRE_CANAL[id]();
        return r;
      }),
    );

    st.escena = { ojos, laberintos, canales, piel, ...ejesYPlanos(T, laberintos) };
    ubicaLaberintos(1);
    aplicaVista();
    if (!glb) console.info('laberinto: modelo provisorio (no hay %s)', MODELO_URL);
  }

  /** El eje de un canal medido en su malla, con el signo del de libro. */
  function ejeDeMalla(obj, ideal) {
    const T = st.T;
    const pts = [];
    const v = new T.Vector3();
    const aCabeza = new T.Matrix4().copy(st.r.cabeza.matrixWorld).invert();
    obj.updateMatrixWorld(true);
    obj.traverse((m) => {
      if (!m.isMesh) return;
      const pos = m.geometry.attributes.position;
      const paso = Math.max(1, Math.floor(pos.count / 2000));
      const aLocal = new T.Matrix4().multiplyMatrices(aCabeza, m.matrixWorld);
      for (let i = 0; i < pos.count; i += paso) {
        v.fromBufferAttribute(pos, i).applyMatrix4(aLocal);
        pts.push([v.x, v.y, v.z]);
      }
    });
    let n = normalDePlano(pts);
    const c = n[0] * ideal[0] + n[1] * ideal[1] + n[2] * ideal[2];
    if (c < 0) n = n.map((x) => -x);
    const grados = (Math.acos(Math.min(1, Math.abs(c))) * 180) / Math.PI;
    if (grados > 35) console.warn(`laberinto: ${obj.name} está a ${grados.toFixed(0)}° del modelo de libro`);
    return n;
  }

  /** Flechas de los ejes (en cada laberinto) y los tres planos de examen. */
  function ejesYPlanos(T, laberintos) {
    const flechas = [];
    for (const c of CANALES) {
      const grupo = laberintos[c.lado];
      if (!grupo) continue;
      const eje = new T.Vector3(...(st.ejesMedidos?.[c.id] ?? c.eje));
      // Largo en el marco del grupo, que se agranda: se corrige en ubicaLaberintos.
      const f = new T.ArrowHelper(eje, new T.Vector3(), 1, COLOR_PAR[c.par]);
      f.userData.largo = 0.045;
      grupo.add(f);
      flechas.push(f);
    }
    const planos = {};
    for (const [par, id] of [
      ['lateral', 'lat_izq'],
      ['larp', 'ant_izq'],
      ['ralp', 'ant_der'],
    ]) {
      const m = new T.Mesh(
        new T.CircleGeometry(0.1, 64),
        new T.MeshBasicMaterial({
          color: COLOR_PAR[par],
          transparent: true,
          opacity: 0.1,
          side: T.DoubleSide,
          depthWrite: false,
          // Sin esto la piel, que ya está en el z-buffer, los tapaba.
          depthTest: false,
        }),
      );
      // El círculo nace en el plano xy, mirando a +z: se lo gira a la normal.
      m.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), new T.Vector3(...CANAL[id].eje));
      m.visible = $(`lab-plano-${par}`).checked;
      st.r.cabeza.add(m);
      planos[par] = m;
    }
    return { flechas, planos };
  }

  /**
   * Lleva cada laberinto hacia el lugar y la escala del modo, una fracción
   * `a` del camino (1: de una). Cuadro a cuadro, el cambio de modo se anima.
   */
  function ubicaLaberintos(a) {
    const modo = MODOS_LABERINTO[st.modoLab];
    for (const g of Object.values(st.escena.laberintos)) {
      const destino = g.userData.anatomica.clone();
      if (modo.x !== null) destino.x = Math.sign(destino.x) * modo.x;
      g.position.lerp(destino, a);
      const k = g.scale.x + (modo.aumento - g.scale.x) * a;
      if (Math.abs(k - g.scale.x) < 1e-6 && g.userData.flechasEn === k) continue;
      g.scale.setScalar(k);
      g.userData.flechasEn = k;
      for (const f of g.children) {
        if (!f.userData.largo) continue;
        // La flecha vive dentro del grupo agrandado: se la achica para que
        // mida lo mismo en la cabeza con cualquier escala.
        const l = f.userData.largo / k;
        f.setLength(l, 0.3 * l, 0.18 * l);
      }
    }
  }

  function aplicaVista() {
    if (!st.escena) return;
    const enEjes = st.vista === 'ejes';
    for (const f of st.escena.flechas) f.visible = enEjes && $('lab-flechas').checked;
    for (const [par, p] of Object.entries(st.escena.planos)) p.visible = enEjes && $(`lab-plano-${par}`).checked;
  }

  // -------------------------------------------------------------- cuadro ---

  function cuadro(ahora) {
    st.raf = requestAnimationFrame(cuadro);
    const dt = Math.min(0.1, Math.max(1e-3, (ahora - st.tPrevio) / 1000));
    st.tPrevio = ahora;

    // 1) Dónde está la cabeza y a qué velocidad gira.
    let omegaExacta = null;
    if (st.impulso) {
      const im = st.impulso;
      const t = (ahora - im.t0) / 1000 / im.lentitud;
      const p = perfilImpulso(t, AMPLITUD_IMPULSO, im.vPico);
      st.qCabeza = qMul(im.qBase, qEjeAngulo(im.eje, p.angulo));
      // La velocidad del impulso es la física, no la de la pantalla: en cámara
      // lenta el canal siente el impulso real.
      omegaExacta = im.eje.map((v) => v * p.velocidad);
      if (p.fin) {
        st.impulso = null;
        st.qManual = qMul(im.qBase, qInv(st.qSensor));
      }
    } else {
      if (st.sensor.activo && st.sensor.q && st.sensor.qRef) st.qSensor = qMul(qInv(st.sensor.qRef), st.sensor.q);
      st.qCabeza = qMul(st.qManual, st.qSensor);
    }
    if (omegaExacta) st.omega = omegaExacta;
    else {
      const w = velocidadAngular(st.qPrevia, st.qCabeza, dt);
      const a = 1 - Math.exp(-dt / TAU_OMEGA_S);
      st.omega = st.omega.map((v, i) => v + a * (w[i] - v));
    }
    st.qPrevia = st.qCabeza;
    ubicaLaberintos(1 - Math.exp(-dt / TAU_MODO_S));
    // La cámara se aleja o se acerca a lo que el modo necesita que entre.
    const cam = st.r.camara;
    const modo = MODOS_LABERINTO[st.modoLab];
    const tanH = Math.tan((cam.fov * Math.PI) / 360) * cam.aspect;
    const base = Math.max(DIST_INICIAL, modo.ancho / (2 * tanH));
    st.distBase = st.distBase === null ? base : st.distBase + (base - st.distBase) * (1 - Math.exp(-dt / TAU_MODO_S));
    st.dist = st.distBase * st.zoom;

    // 2) Los ojos: VOR de ganancia 1, la mirada queda quieta en el mundo.
    // Si el ojo llega al borde de la órbita, una fase rápida lo recentra: con
    // un giro sostenido eso es un nistagmo.
    let enOrbita = qMul(qInv(st.qCabeza), st.qMirada);
    if (anguloDe(enOrbita) > LIMITE_OJO_DEG) st.faseRapida = true;
    if (st.faseRapida) {
      st.qMirada = qSlerp(st.qMirada, st.qCabeza, 1 - Math.exp(-dt / TAU_SACADA_S));
      enOrbita = qMul(qInv(st.qCabeza), st.qMirada);
      if (anguloDe(enOrbita) < 1) st.faseRapida = false;
    }

    // 3) Tasa de cada canal.
    const r = respuestas(st.omega, st.ejesMedidos);
    pinta(enOrbita, r);
  }

  function pinta(enOrbita, r) {
    const T = st.T;
    const { renderer, escena, camara, cabeza } = st.r;
    cabeza.quaternion.set(...st.qCabeza);
    cabeza.position.set(...st.pan);
    const qo = new T.Quaternion(...enOrbita);
    for (const o of Object.values(st.escena.ojos)) o.obj.quaternion.copy(qo).multiply(o.reposo);

    // Cada canal se pinta de rojo si se excita y de azul si se inhibe, en
    // todas las vistas: mover la cabeza a mano tiene que mostrarlo igual que
    // un impulso armado. Mezclado con el color del par no se leía (el lateral
    // celeste inhibido era otro azul), así que en cuanto la cabeza se mueve
    // todos pasan a gris y de ahí a rojo o azul; quieta, cada uno vuelve al
    // color de su par (en Respuesta, siempre gris). La intensidad va con la
    // raíz de la activación para que un giro lento ya se note; el número
    // exacto está en las barras.
    const exc = new T.Color(COLOR_EXCITADO);
    const inh = new T.Color(COLOR_INHIBIDO);
    const gris = new T.Color(COLOR_REPOSO);
    const base = new T.Color();
    const moviendo = st.vista === 'respuesta' ? 1 : Math.min(1, Math.hypot(...st.omega) / GIRO_PARA_GRIS);
    for (const [id, c] of Object.entries(st.escena.canales)) {
      const a = activacion(r[id].tasa);
      const k = Math.sqrt(Math.abs(a));
      base.setHex(COLOR_PAR[CANAL[id].par]).lerp(gris, moviendo);
      for (const m of c.materiales) {
        m.color.lerpColors(base, a >= 0 ? exc : inh, k);
        m.emissive.copy(a >= 0 ? exc : inh).multiplyScalar(0.35 * k);
      }
    }
    if (st.vista === 'respuesta') pintaBarras(r);

    // Cámara: en tres cuartos o de arriba, a `dist` del centro de la cabeza.
    if (st.cenital) {
      camara.up.set(0, 0, 1);
      camara.position.set(0, st.dist, 0);
      camara.lookAt(0, 0, 0);
    } else {
      const az = (st.camara.az * Math.PI) / 180;
      const el = (st.camara.el * Math.PI) / 180;
      camara.up.set(0, 1, 0);
      camara.position.set(
        st.dist * Math.cos(el) * Math.sin(az),
        MIRA_Y + st.dist * Math.sin(el),
        st.dist * Math.cos(el) * Math.cos(az),
      );
      camara.lookAt(0, MIRA_Y, 0);
    }
    camara.updateMatrixWorld();
    escena.updateMatrixWorld();
    renderer.render(escena, camara);
    if (st.rotulos) ubicaRotulos();
  }

  function pintaBarras(r) {
    for (const c of CANALES) {
      const f = filas[c.id];
      const t = r[c.id].tasa;
      f.relleno.style.width = `${(100 * t) / TASA_MAX}%`;
      f.relleno.className = `relleno ${t > TASA_REPOSO + 2 ? 'exc' : t < TASA_REPOSO - 2 ? 'inh' : ''}`;
      f.valor.textContent = t.toFixed(0);
    }
    $('lab-vcab').textContent = Math.hypot(...st.omega).toFixed(0);
  }

  function ubicaRotulos() {
    const T = st.T;
    const { camara } = st.r;
    const w = caja.clientWidth;
    const h = caja.clientHeight;
    const p = new T.Vector3();
    for (const el of rotulos.children) {
      const c = st.escena.canales[el.dataset.canal];
      p.copy(c.ancla);
      c.grupo.localToWorld(p);
      p.project(camara);
      const x = ((p.x + 1) / 2) * w;
      const y = ((1 - p.y) / 2) * h;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      el.hidden = p.z > 1;
    }
  }

  function ajustaTamano() {
    const { renderer, camara } = st.r;
    const w = Math.max(1, caja.clientWidth);
    const h = Math.max(1, caja.clientHeight);
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    camara.updateProjectionMatrix();
  }

  // ---------------------------------------------------------- movimiento ---

  /** Gira la cabeza alrededor de un eje de la CÁMARA (x derecha, y arriba, z hacia uno). */
  function giraMundo(ejeCamara, grados) {
    if (st.impulso || !st.r) return;
    const e = new st.T.Vector3(...ejeCamara).applyQuaternion(st.r.camara.quaternion);
    st.qManual = qMul(qEjeAngulo([e.x, e.y, e.z], grados), st.qManual);
  }

  function centra() {
    st.impulso = null;
    st.qManual = Q1();
    st.qSensor = Q1();
    st.qCabeza = Q1();
    st.qPrevia = Q1();
    st.qMirada = Q1();
    st.omega = [0, 0, 0];
    st.faseRapida = false;
    st.pan = [0, 0, 0];
    st.zoom = 1;
    st.camara = CAMARA_FRENTE;
    st.cenital = false;
    $('lab-cenital').setAttribute('aria-pressed', 'false');
    if (st.sensor.q) st.sensor.qRef = st.sensor.q;
  }

  function lanzaImpulso(m) {
    if (!st.r) return;
    st.impulso = {
      eje: m.eje,
      qBase: st.qCabeza,
      t0: performance.now(),
      vPico: Number($('lab-vpico').value),
      lentitud: Number($('lab-lentitud').value),
    };
  }

  // Puntero: un dedo o el botón izquierdo gira; el derecho o Mayús rola; dos
  // dedos desplazan, pellizcan (zoom) y rolan al torcer. Doble toque centra.
  const punteros = new Map();
  let gesto = null;
  let ultimoToque = { t: 0, x: 0, y: 0 };

  lienzo.addEventListener('contextmenu', (e) => e.preventDefault());
  lienzo.addEventListener('pointerdown', (e) => {
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    try {
      lienzo.setPointerCapture(e.pointerId);
    } catch {
      /* un puntero que ya se soltó: se sigue sin captura */
    }
    gesto = null;
  });
  lienzo.addEventListener('pointermove', (e) => {
    const p = punteros.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (punteros.size === 1) {
      p.x = e.clientX;
      p.y = e.clientY;
      if (e.buttons & 2 || e.shiftKey) giraMundo([0, 0, 1], -dx * GRADOS_POR_PX);
      else {
        giraMundo([0, 1, 0], dx * GRADOS_POR_PX);
        giraMundo([1, 0, 0], dy * GRADOS_POR_PX);
      }
      return;
    }
    p.x = e.clientX;
    p.y = e.clientY;
    const [a, b] = [...punteros.values()];
    const ahora = {
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      d: Math.hypot(a.x - b.x, a.y - b.y),
      ang: Math.atan2(b.y - a.y, b.x - a.x),
    };
    if (gesto) {
      desplaza(ahora.cx - gesto.cx, ahora.cy - gesto.cy);
      if (ahora.d > 10 && gesto.d > 10) acerca(gesto.d / ahora.d);
      let da = ahora.ang - gesto.ang;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      giraMundo([0, 0, 1], (-da * 180) / Math.PI);
    }
    gesto = ahora;
  });
  const suelta = (e) => {
    const p = punteros.get(e.pointerId);
    punteros.delete(e.pointerId);
    gesto = null;
    if (!p || e.type === 'pointercancel') return;
    // Un toque sin arrastre: si es el segundo seguido, centra.
    if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 8) {
      const t = performance.now();
      if (t - ultimoToque.t < 350 && Math.hypot(e.clientX - ultimoToque.x, e.clientY - ultimoToque.y) < 30) {
        centra();
        ultimoToque.t = 0;
      } else ultimoToque = { t, x: e.clientX, y: e.clientY };
    }
  };
  lienzo.addEventListener('pointerup', suelta);
  lienzo.addEventListener('pointercancel', suelta);
  lienzo.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      acerca(Math.exp(e.deltaY * 0.0015));
    },
    { passive: false },
  );

  function acerca(k) {
    st.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, st.zoom * k));
  }

  /** Mueve la cabeza en el plano de la pantalla, en píxeles. */
  function desplaza(dx, dy) {
    if (!st.r) return;
    const { camara } = st.r;
    const mPorPx = (2 * st.dist * Math.tan((camara.fov * Math.PI) / 360)) / Math.max(1, caja.clientHeight);
    const der = new st.T.Vector3(1, 0, 0).applyQuaternion(camara.quaternion);
    const arr = new st.T.Vector3(0, 1, 0).applyQuaternion(camara.quaternion);
    for (let i = 0; i < 3; i++) {
      st.pan[i] += (der.getComponent(i) * dx - arr.getComponent(i) * dy) * mPorPx;
    }
  }

  // ------------------------------------------------------------ sensores ---
  //
  // `deviceorientation` da la orientación del teléfono como ángulos Z-X'-Y''
  // (alpha, beta, gamma). El marco del teléfono —x a la derecha, y hacia
  // arriba de la pantalla, z saliendo de la pantalla hacia uno— es el mismo de
  // la cámara de la escena, así que el giro del teléfono desde que se lo tomó
  // se le aplica tal cual a la cabeza: girar el teléfono a la izquierda gira
  // la cabeza a SU izquierda y excita el lateral izquierdo.

  async function prendeSensores() {
    try {
      const pide = window.DeviceOrientationEvent?.requestPermission;
      if (typeof pide === 'function' && (await pide.call(window.DeviceOrientationEvent)) !== 'granted') {
        estado.hidden = false;
        estado.textContent = tx('sin permiso para leer los sensores del teléfono');
        setTimeout(() => (estado.hidden = true), 3000);
        return;
      }
    } catch (e) {
      console.warn('laberinto: sensores', e);
      return;
    }
    st.sensor = { activo: true, qRef: null, q: null };
    // Lo que se giró a mano queda: el teléfono suma desde ahí.
    st.qManual = st.qCabeza;
    st.qSensor = Q1();
    window.addEventListener('deviceorientation', alOrientar);
    pintaSensores();
  }

  function apagaSensores() {
    if (!st.sensor.activo) return;
    window.removeEventListener('deviceorientation', alOrientar);
    st.qManual = st.qCabeza;
    st.qSensor = Q1();
    st.sensor = { activo: false, qRef: null, q: null };
    pintaSensores();
  }

  function alOrientar(e) {
    if (e.alpha == null) return;
    const giroPantalla = screen.orientation?.angle ?? window.orientation ?? 0;
    let q = qMul(qEjeAngulo([0, 0, 1], e.alpha), qEjeAngulo([1, 0, 0], e.beta));
    q = qMul(q, qEjeAngulo([0, 1, 0], e.gamma));
    q = qMul(q, qEjeAngulo([0, 0, 1], -giroPantalla));
    st.sensor.q = q;
    st.sensor.qRef ??= q;
  }

  return { abre, cierra, abierto: () => st.abierta };
}

// ------------------------------------------------------ modelo provisorio ---
//
// Medidas aproximadas de un adulto, en metros, con los nombres del contrato.
// La cabeza sale de cabeza.js; ojos y laberintos son primitivas. Es para trabajar mientras llega el modelo de verdad:
// lo que importa es que los canales estén en sus planos, no la anatomía fina.
// Exportado a `modelos/provisorio.glb`, es también la referencia para quien
// haga el de verdad: se importa en Blender y muestra nombres, escala y ejes.

/** Centro de cada laberinto: a la altura del conducto auditivo, hacia adentro. */
const X_LABERINTO = 0.038;
/** Radio de un canal (de su eje al centro del tubo) y del tubo óseo. */
const R_CANAL = 0.0032;
const R_TUBO = 0.00042;

export function modeloProvisorio(T) {
  const raiz = new T.Group();
  raiz.name = 'provisorio';

  // Cabeza: una sola piel, de la superficie implícita de cabeza.js.
  // Translúcida desde armaModelo.
  const m = mallaCabeza();
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(m.posiciones, 3));
  geo.setAttribute('normal', new T.BufferAttribute(m.normales, 3));
  geo.setIndex(new T.BufferAttribute(m.indices, 1));
  const cabeza = new T.Mesh(geo, new T.MeshStandardMaterial({ color: 0xd9b89c, roughness: 0.75 }));
  cabeza.name = NOMBRES.cabeza;
  raiz.add(cabeza);

  // Ojos: esclera, iris, pupila y una marca a las 12 para ver la torsión.
  const blanco = new T.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.35 });
  const iris = new T.MeshStandardMaterial({ color: 0x3f78b5, roughness: 0.5 });
  const negro = new T.MeshBasicMaterial({ color: 0x050505 });
  const marca = new T.MeshBasicMaterial({ color: 0xffffff });
  for (const [lado, s] of [
    ['izq', 1],
    ['der', -1],
  ]) {
    const ojo = new T.Group();
    ojo.name = NOMBRES.ojos[lado];
    ojo.position.set(s * OJO.x, OJO.y, OJO.z);
    ojo.add(new T.Mesh(new T.SphereGeometry(OJO.radio, 32, 24), blanco));
    const disco = (r, z, mat) => {
      const m = new T.Mesh(new T.CircleGeometry(r, 32), mat);
      m.position.z = z;
      ojo.add(m);
    };
    disco(0.0056, OJO.radio + 0.0001, iris);
    disco(0.0024, OJO.radio + 0.00015, negro);
    const raya = new T.Mesh(new T.PlaneGeometry(0.0008, 0.0028), marca);
    raya.position.set(0, 0.0041, OJO.radio + 0.0002);
    ojo.add(raya);
    raiz.add(ojo);
  }

  // Laberintos.
  const hueso = new T.MeshStandardMaterial({ color: 0xcfc6b4, roughness: 0.6 });
  for (const [lado, s] of [
    ['izq', 1],
    ['der', -1],
  ]) {
    const centro = new T.Vector3(s * X_LABERINTO, 0, 0);
    const vest = new T.Mesh(new T.SphereGeometry(1, 24, 16), hueso);
    vest.name = NOMBRES.vestibulo[lado];
    vest.position.copy(centro);
    vest.scale.set(0.0021, 0.0024, 0.0029);
    raiz.add(vest);
    for (const c of CANALES.filter((k) => k.lado === lado)) raiz.add(canalProvisorio(T, c, centro, s));
    raiz.add(cocleaProvisoria(T, hueso, centro, s, NOMBRES.coclea[lado]));
  }
  return raiz;
}

/**
 * Un canal: un arco de tubo en el plano normal a su eje, abierto hacia el
 * vestíbulo, con la ampolla en su extremo. `s` es +1 a la izquierda, −1 a la
 * derecha.
 */
function canalProvisorio(T, c, centro, s) {
  const n = new T.Vector3(...c.eje);
  // Hacia dónde sale el arco desde el vestíbulo, antes de proyectarlo al plano.
  const sale = {
    lateral: [s * 1, 0, -0.6],
    anterior: [s * 0.3, 1, 0.45],
    posterior: [s * 0.4, 0.5, -1],
  }[c.tipo];
  const u = new T.Vector3(...sale);
  u.addScaledVector(n, -u.dot(n)).normalize();
  const hueco = (70 * Math.PI) / 180;
  // Que el hueco del toro (entre `arco` y 2π) quede mirando al vestíbulo, −u.
  const e1 = u.clone().negate().applyAxisAngle(n, hueco / 2);
  const e2 = new T.Vector3().crossVectors(n, e1);
  const arco = 2 * Math.PI - hueco;

  const grupo = new T.Group();
  grupo.name = NOMBRES.canal(c.id);
  grupo.position.copy(centro).addScaledVector(u, R_CANAL + 0.001);
  grupo.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(e1, e2, n));
  const mat = new T.MeshStandardMaterial();
  grupo.add(new T.Mesh(new T.TorusGeometry(R_CANAL, R_TUBO, 12, 72, arco), mat));

  // La ampolla: adelante en el lateral y el anterior, abajo en el posterior.
  const extremo = (a) => new T.Vector3(Math.cos(a) * R_CANAL, Math.sin(a) * R_CANAL, 0);
  const aMundo = (v) => v.clone().applyQuaternion(grupo.quaternion);
  const [a0, a1] = [extremo(0), extremo(arco)];
  const cuenta = c.tipo === 'posterior' ? (v) => -aMundo(v).y : (v) => aMundo(v).z;
  const amp = new T.Mesh(new T.SphereGeometry(R_TUBO * 2.3, 16, 12), mat);
  amp.position.copy(cuenta(a0) > cuenta(a1) ? a0 : a1);
  grupo.add(amp);
  return grupo;
}

/**
 * Cóclea: dos vueltas y media de espiral cónica, adelante, adentro y un poco
 * abajo del vestíbulo, con el ápice hacia adelante y afuera. La vuelta basal
 * nace del vestíbulo mismo, como en el hueso: no es una pieza suelta al lado.
 */
function cocleaProvisoria(T, mat, centro, s, nombre) {
  const eje = new T.Vector3(s * 0.7, -0.35, 0.6).normalize();
  const base = centro.clone().add(new T.Vector3(-s * 0.0022, -0.0018, 0.0042));
  const a = new T.Vector3(0, 1, 0).cross(eje).normalize();
  const b = new T.Vector3().crossVectors(eje, a);
  // La espiral arranca en el punto de la vuelta basal que mira al vestíbulo.
  const hacia = centro.clone().sub(base);
  hacia.addScaledVector(eje, -hacia.dot(eje));
  const th0 = Math.atan2(hacia.dot(b), hacia.dot(a));
  const pts = [centro.clone()];
  const vueltas = 2.5;
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    const th = th0 + s * t * vueltas * 2 * Math.PI;
    const r = 0.003 * (1 - 0.7 * t);
    pts.push(
      base
        .clone()
        .addScaledVector(a, r * Math.cos(th))
        .addScaledVector(b, r * Math.sin(th))
        .addScaledVector(eje, 0.003 * t),
    );
  }
  const m = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 180, 0.00065, 10), mat);
  m.name = nombre;
  return m;
}
