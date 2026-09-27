// Laberinto 3D: cabeza, ojos y laberintos para ver qué canal siente cada giro.
//
// Toma la pantalla entera: la sección no tiene nada que ver con la cámara ni
// con los pulsos, es un modelo para mirar y tocar. La cabeza se gira con el
// mouse o el dedo, o —en un teléfono— con el teléfono mismo: el teléfono ES la
// cabeza. La webcam no se usa acá.
//
// Cinco vistas:
//   canales    los seis canales, pintados por par coplanar, con rótulos y el
//              interruptor de tamaño real.
//   ejes       el eje que excita a cada canal (mano derecha) y los tres planos
//              de examen: lateral, LARP y RALP. Vista de arriba.
//   respuesta  impulsos armados y giro libre: cada canal se pinta de rojo si
//              se excita y de azul si se inhibe, con la tasa de disparo en
//              barras, y los ojos contragiran (VOR de ganancia 1).
//   patologia  canales enfermos, nistagmo espontáneo y sacadas (patologia.js).
//   via        la vía del reflejo, del canal al músculo, animada en 2D al
//              costado del modelo (via.js).
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
  DetectorOrden,
  ORDENES_GIRO,
  aMarco,
  aMarcoCanales,
  arribaDesdeOrientacion,
  integraGiro,
  marcoDesdeArriba,
  normalDePlano,
  perfilImpulso,
  qDesdeOrientacion,
  qEjeAngulo,
  qInv,
  qMul,
  respuestas,
  velocidadAngular,
} from './canales.js';
import { OJO, mallaCabeza } from './cabeza.js';
import {
  CASO,
  CASOS,
  ESTADOS,
  Ojo,
  SACADAS,
  describeNistagmo,
  espejo,
  faseLentaEspontanea,
  funciones,
} from './patologia.js';
import { Sala, leeCabeza, leeControl, mensajeCabeza, mensajeControl, refControl, refValida, uneSala } from './enlace.js';
import { DibujoVia, actividad, vectorRotacion, velocidadOrbita } from './via.js';
import { abajoEnCabeza, nucleosOtolitos, respuestasOtolitos, torsionOtolitica } from './otolitos.js';
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

/** Paso máximo con que se avanza el ojo, en segundos físicos: sus sacadas duran 30 ms. */
const PASO_OJO_S = 0.004;
/** Lo que se ve de la traza de los ojos, en segundos, y su escala en grados. */
const TRAZA_S = 4;
const TRAZA_GRADOS = 15;
/** Ancho de cara que entra en «ojos de cerca» y a qué distancia va esa cámara. */
const OJOS_ANCHO = 0.11;
const OJOS_DIST = 0.2;
/** Constante de tiempo de la torsión que piden los utrículos, en segundos físicos. */
const TAU_TORSION_S = 0.15;
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
/** Un canal enfermo, como en aVOR: amarillo verdoso, más cuanto peor funciona. */
const COLOR_LESION = 0xa8c83a;

const NOMBRE_CANAL = {
  lat_izq: () => tx('lateral izq.'),
  ant_izq: () => tx('anterior izq.'),
  post_izq: () => tx('posterior izq.'),
  lat_der: () => tx('lateral der.'),
  ant_der: () => tx('anterior der.'),
  post_der: () => tx('posterior der.'),
};

const Q1 = () => [0, 0, 0, 1];

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
    sensor: sensorApagado(),
    // El enlace con otro aparato (enlace.js): como `visor`, la cabeza la
    // mueve un teléfono; como `cabeza`, este teléfono mueve la de un PC.
    remoto: null,
    // Qué muestra el PC cuando lo maneja un teléfono: '' es el Laberinto con
    // su panel; las otras, solo el modelo y lo que se pida (PRESENTACIONES).
    presentacion: '',
    qCabeza: Q1(),
    qPrevia: Q1(),
    // El ojo, con su VOR, su nistagmo y sus sacadas (patologia.js).
    ojo: new Ojo(),
    // La patología puesta: estados por canal y cómo se la ve.
    pat: { caso: 'sano', der: false, canales: {}, compensado: true, fijacion: false, sacadas: 'encubiertas', ciego: false },
    f: funciones(),
    lenta: [0, 0, 0],
    traza: [],
    // La vía (via.js): el dibujo se arma al abrirla; el ojo se mide para sus
    // motoneuronas.
    via: null,
    qOjoPrevio: null,
    velOjo: [0, 0, 0],
    // La torsión de los ojos por los utrículos (otolitos.js), en grados, y
    // la orientación del ojo que se ve: la del ojo de patologia.js con esa
    // torsión encima.
    torsion: 0,
    qOjo: Q1(),
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
  $('lab-visor').addEventListener('click', () => soloVisor(!seccion.classList.contains('solo-visor')));

  /**
   * Solo el visor: esconde la barra y el panel. Donde se puede, pide además
   * pantalla completa —en el teléfono es lo que más se gana—; si el navegador
   * la saca (Esc, gesto de volver), vuelven las herramientas.
   */
  function soloVisor(si) {
    seccion.classList.toggle('solo-visor', si);
    const b = $('lab-visor');
    b.setAttribute('aria-pressed', String(si));
    b.textContent = si ? '⤡' : '⤢';
    b.title = si ? tx('volver a las herramientas (H)') : tx('solo el visor 3D, sin barra ni panel (H)');
    try {
      if (si && !document.fullscreenElement) seccion.requestFullscreen?.().catch(() => {});
      if (!si && document.fullscreenElement === seccion) document.exitFullscreen?.().catch(() => {});
    } catch {
      /* sin pantalla completa: queda igual el visor solo */
    }
  }
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && seccion.classList.contains('solo-visor')) soloVisor(false);
  });
  $('lab-centrar').addEventListener('click', () => centra());
  for (const b of seccion.querySelectorAll('[data-modo-lab]')) {
    b.addEventListener('click', () => {
      marcaModo(b.dataset.modoLab);
      st.camara = MODOS_LABERINTO[st.modoLab].camara;
    });
  }

  function marcaModo(modo) {
    if (!MODOS_LABERINTO[modo]) return;
    st.modoLab = modo;
    for (const o of seccion.querySelectorAll('[data-modo-lab]')) o.setAttribute('aria-checked', String(o.dataset.modoLab === modo));
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

  const sensoresPosibles = 'DeviceMotionEvent' in window && window.matchMedia?.('(pointer: coarse)').matches;
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
    llenaSelects();
    pintaPatologia();
  }
  alCambiarIdioma(traduce);

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
    // Los impulsos armados sirven en Respuesta y en Vía: el bloque se muda al
    // panel que se ve.
    const destino = seccion.querySelector(`[data-panel="${v}"] [data-impulsos]`);
    if (destino) destino.append($('lab-impulsos'));
    seccion.dataset.vista = v;
    aplicaVista();
    pintaCapas();
  }

  /**
   * Lo que va encima del modelo: la vía y los ojos de cerca. Sin
   * presentación, según la vista; en presentación, según lo que se pidió.
   */
  function viaVisible() {
    return st.presentacion ? st.presentacion === 'via' || st.presentacion === 'todo' : st.vista === 'via';
  }

  function ojosVisibles() {
    if (st.presentacion) return st.presentacion === 'ojos' || st.presentacion === 'todo';
    return $('lab-ojos-ver').checked && (st.vista === 'patologia' || st.vista === 'respuesta');
  }

  function pintaCapas() {
    $('lab-via').hidden = !viaVisible();
    $('lab-ojos').hidden = !ojosVisibles();
    seccion.classList.toggle('presentacion', Boolean(st.presentacion));
    seccion.dataset.pres = st.presentacion;
  }

  // ------------------------------------------------------------- patología ---
  //
  // La patología vive en `st.pat`; de ahí salen las funciones de los canales
  // (`st.f`) y la fase lenta espontánea (`st.lenta`), que el cuadro usa para
  // las tasas, los colores y el ojo. Ver patologia.js.

  const selCaso = $('lab-caso');
  const selCanales = [...seccion.querySelectorAll('.lab-grilla select')];

  const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  function nombreCaso(id, der) {
    const c = CASO[id];
    if (!c) return tx('a medida');
    if (!c.unilateral) return tx(c.nombre);
    return der ? tx('{caso} derecha', { caso: tx(c.nombre) }) : tx('{caso} izquierda', { caso: tx(c.nombre) });
  }

  function llenaSelects() {
    const valor = selCaso.value;
    selCaso.replaceChildren(
      ...CASOS.map((c) => new Option(mayuscula(c.unilateral ? `${tx(c.nombre)}…` : tx(c.nombre)), c.id)),
      new Option(tx('a medida'), 'medida'),
    );
    selCaso.value = valor || st.pat.caso;
    const NOMBRE_ESTADO = { normal: tx('normal'), hipofuncion: tx('hipofunción'), arreflexia: tx('arreflexia') };
    for (const sel of selCanales) {
      const v = sel.value;
      sel.replaceChildren(...Object.keys(ESTADOS).map((e) => new Option(NOMBRE_ESTADO[e], e)));
      sel.value = v || 'normal';
    }
  }

  function ponCaso(id, der = st.pat.der) {
    const c = CASO[id];
    st.pat.caso = id;
    st.pat.der = der;
    if (c) {
      st.pat.canales = der && c.unilateral ? espejo(c.canales) : { ...c.canales };
      st.pat.compensado = c.compensado;
    }
    aplicaPatologia();
  }

  function aplicaPatologia() {
    st.f = funciones(st.pat.canales);
    st.lenta = faseLentaEspontanea(st.f, { compensado: st.pat.compensado, fijacion: st.pat.fijacion });
    pintaPatologia();
  }

  function textoNistagmo() {
    const d = describeNistagmo(st.lenta);
    if (!d) return tx('Sin nistagmo espontáneo.');
    const nombres = {
      izquierda: tx('a la izquierda'),
      derecha: tx('a la derecha'),
      arriba: tx('hacia arriba'),
      abajo: tx('hacia abajo'),
      torsional_derecha: tx('torsional hacia el oído derecho'),
      torsional_izquierda: tx('torsional hacia el oído izquierdo'),
    };
    return tx('Nistagmo espontáneo: bate {dir}; fase lenta de {v} °/s.', {
      dir: d.partes.map((p) => nombres[p]).join(', '),
      v: d.velocidad.toFixed(0),
    });
  }

  /** Pone la interfaz como dice `st.pat`. */
  function pintaPatologia() {
    const p = st.pat;
    selCaso.value = CASO[p.caso] ? p.caso : 'medida';
    $('lab-pat-der').checked = p.der;
    $('lab-pat-der').disabled = !CASO[p.caso]?.unilateral;
    for (const sel of selCanales) sel.value = p.canales[sel.dataset.canal] ?? 'normal';
    $('lab-compensado').checked = p.compensado;
    $('lab-fijacion').checked = p.fijacion;
    $('lab-sacadas').value = p.sacadas;
    $('lab-pat-controles').hidden = p.ciego;
    $('lab-ciego').hidden = !p.ciego;
    $('lab-azar').hidden = p.ciego;
    $('lab-revelar').hidden = !p.ciego;
    $('lab-tasas').hidden = p.ciego;
    $('lab-tasas-ciego').hidden = !p.ciego;
    $('lab-via-ciego').hidden = !p.ciego;
    // A ciegas el nistagmo también se calla en texto: se lo tiene que ver.
    $('lab-nistagmo').textContent = p.ciego ? '' : textoNistagmo();
    const badge = $('lab-pat-badge');
    const hayAlgo = Object.values(p.canales).some((e) => e !== 'normal');
    badge.hidden = !p.ciego && !hayAlgo;
    badge.textContent = p.ciego ? tx('PACIENTE A CIEGAS') : nombreCaso(p.caso, p.der).toUpperCase();
  }

  selCaso.addEventListener('change', () => {
    if (selCaso.value === 'medida') {
      st.pat.caso = 'medida';
      pintaPatologia();
    } else ponCaso(selCaso.value);
    $('lab-revelado').hidden = true;
  });
  $('lab-pat-der').addEventListener('change', (e) => ponCaso(st.pat.caso, e.target.checked));
  for (const sel of selCanales) {
    sel.addEventListener('change', () => {
      st.pat.canales = { ...st.pat.canales, [sel.dataset.canal]: sel.value };
      st.pat.caso = 'medida';
      aplicaPatologia();
    });
  }
  $('lab-compensado').addEventListener('change', (e) => {
    st.pat.compensado = e.target.checked;
    aplicaPatologia();
  });
  $('lab-fijacion').addEventListener('change', (e) => {
    st.pat.fijacion = e.target.checked;
    aplicaPatologia();
  });
  $('lab-sacadas').addEventListener('change', (e) => (st.pat.sacadas = e.target.value));
  $('lab-ojos-ver').addEventListener('change', pintaCapas);

  // A ciegas: un caso al azar, de un lado al azar, compensado o no y con un
  // tipo de sacada al azar. Revelar muestra qué era.
  const alAzar = (lista) => lista[Math.floor(Math.random() * lista.length)];
  $('lab-azar').addEventListener('click', () => {
    const c = alAzar(CASOS);
    ponCaso(c.id, c.unilateral && Math.random() < 0.5);
    // La neuritis puede llegar aguda o ya compensada.
    if (c.id.startsWith('neuritis')) st.pat.compensado = Math.random() < 0.5;
    st.pat.sacadas = alAzar(Object.keys(SACADAS));
    st.pat.ciego = true;
    $('lab-revelado').hidden = true;
    st.ojo.centra();
    st.qOjoPrevio = null;
    aplicaPatologia();
  });
  $('lab-revelar').addEventListener('click', () => {
    const p = st.pat;
    p.ciego = false;
    aplicaPatologia();
    const partes = [nombreCaso(p.caso, p.der)];
    if (p.caso !== 'sano') {
      partes.push(p.compensado ? tx('compensada') : tx('sin compensar'));
      partes.push(tx('sacadas {tipo}', { tipo: $('lab-sacadas').selectedOptions[0].textContent }));
    }
    const r = $('lab-revelado');
    r.textContent = tx('Era: {caso}.', { caso: partes.join(' · ') });
    r.hidden = false;
  });

  traduce();

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
    terminaEnlace();
    apagaSensores();
    soloVisor(false);
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
    if (k === 'Escape' && !$('lab-enlace').hidden) cierraDialogoEnlace();
    else if (k === 'Escape' && st.presentacion) ponPresentacion('');
    else if (k === 'Escape') seccion.classList.contains('solo-visor') ? soloVisor(false) : cierra();
    else if (k === 'h' || k === 'H') soloVisor(!seccion.classList.contains('solo-visor'));
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
    // Los laberintos, flechas y planos van en la capa 1: la cámara principal
    // ve las dos, la de los ojos de cerca solo la 0.
    camara.layers.enable(1);
    const camOjos = new T.PerspectiveCamera(12, 2.4, 0.01, 1);
    cabeza.add(camOjos);
    st.r = { renderer, escena, camara, cabeza, camOjos };
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
    for (const g of [...Object.values(laberintos), ...Object.values(st.escena.planos)]) g.traverse((o) => o.layers.set(1));
    // La cámara de los ojos de cerca, delante de la cara, a la altura de los
    // ojos y mirando hacia atrás (−z de la cabeza, que es su −z propio).
    const centroOjos = new T.Vector3();
    const listaOjos = Object.values(ojos);
    for (const o of listaOjos) centroOjos.add(o.obj.getWorldPosition(new T.Vector3()));
    if (listaOjos.length) cabeza.worldToLocal(centroOjos.divideScalar(listaOjos.length));
    else centroOjos.set(0, OJO.y, OJO.z);
    st.r.camOjos.position.set(0, centroOjos.y, centroOjos.z + OJOS_DIST);
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
    // En cámara lenta el ojo avanza en tiempo físico, como la cabeza.
    const dtFisico = dt / (st.impulso?.lentitud ?? 1);

    // 1) Dónde está la cabeza y a qué velocidad gira.
    let omegaExacta = null;
    if (st.impulso) {
      const im = st.impulso;
      const t = (ahora - im.t0) / 1000 / im.lentitud;
      const p = perfilImpulso(t, AMPLITUD_IMPULSO, im.vPico, { vuelve: im.vuelve });
      st.qCabeza = qMul(im.qBase, qEjeAngulo(im.eje, p.angulo));
      // La velocidad del impulso es la física, no la de la pantalla: en cámara
      // lenta el canal siente el impulso real.
      omegaExacta = im.eje.map((v) => v * p.velocidad);
      if (p.fin) {
        // La cabeza queda donde terminó: de vuelta en la base, o en la
        // posición nueva si el impulso no vuelve.
        st.impulso = null;
        st.qManual = qMul(qMul(im.qBase, qEjeAngulo(im.eje, p.angulo)), qInv(qFuente()));
      }
    } else if (st.remoto?.rol === 'visor') {
      // La cabeza la mueve el teléfono enlazado, y su giroscopio da la
      // velocidad directa. Sin datos frescos, quieta.
      st.qCabeza = qMul(st.qManual, st.remoto.q);
      omegaExacta = ahora - st.remoto.t < 250 ? st.remoto.w : [0, 0, 0];
    } else {
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
    st.region = regionModelo();
    if (Math.abs(cam.aspect - st.region.w / st.region.h) > 1e-4) {
      cam.aspect = st.region.w / st.region.h;
      cam.updateProjectionMatrix();
    }
    const tanH = Math.tan((cam.fov * Math.PI) / 360) * cam.aspect;
    const base = Math.max(DIST_INICIAL, modo.ancho / (2 * tanH));
    st.distBase = st.distBase === null ? base : st.distBase + (base - st.distBase) * (1 - Math.exp(-dt / TAU_MODO_S));
    st.dist = st.distBase * st.zoom;

    // 2) Los ojos: VOR, nistagmo espontáneo y sacadas, con la patología
    // puesta. Sano, la mirada queda quieta en el mundo; si el ojo llega al
    // borde de la órbita, una fase rápida lo recentra.
    const pasos = Math.max(1, Math.ceil(dtFisico / PASO_OJO_S));
    const opciones = { f: st.f, lenta: st.lenta, tipo: st.pat.sacadas };
    for (let i = 0; i < pasos; i++) st.ojo.paso(dtFisico / pasos, st.qCabeza, st.omega, opciones);

    // 3) Los otolitos: con la cabeza inclinada, los utrículos piden una
    // torsión de los ojos (la contrarrotación), que va encima del ojo. Con
    // un utrículo perdido sin compensar, una torsión quieta hacia ese lado.
    const ro = respuestasOtolitos(abajoEnCabeza(st.qCabeza), st.f);
    const torsion = torsionOtolitica(nucleosOtolitos(ro, { compensado: st.pat.compensado }));
    st.torsion += (torsion - st.torsion) * (1 - Math.exp(-dtFisico / TAU_TORSION_S));
    st.qOjo = qMul(qEjeAngulo([0, 0, 1], st.torsion), st.ojo.q);
    anotaTraza(ahora, st.qOjo);
    st.velOjo = velocidadOrbita(st.qOjoPrevio ?? st.qOjo, st.qOjo, dtFisico);
    st.qOjoPrevio = st.qOjo;

    // 4) Tasa de cada canal.
    const r = respuestas(st.omega, st.ejesMedidos, st.f);
    pinta(st.qOjo, r);
    // Los puntos de la vía van siempre en la cámara lenta elegida, no solo
    // durante un impulso: así el reposo también se frena y se compara con
    // lo que pasa al mover. Con el mouse o el teléfono la cabeza sigue en
    // tiempo real; lo lento es la vía.
    if (viaVisible()) pintaVia({ ...r, ...ro }, dt / Number($('lab-lentitud').value));
  }

  /**
   * Dónde va el modelo 3D dentro de la escena, en píxeles CSS desde arriba a
   * la izquierda: toda la escena, salvo con la vía, que ocupa un costado (o
   * abajo, en pantalla angosta), y el modelo se corre al resto. En
   * presentación, los ojos de cerca van abajo y el modelo, arriba de ellos.
   */
  function regionModelo() {
    let w = Math.max(1, caja.clientWidth);
    let h = Math.max(1, caja.clientHeight);
    const via = $('lab-via');
    if (!via.hidden) {
      if (via.offsetLeft > 10) w = Math.max(1, via.offsetLeft);
      else h = Math.max(1, via.offsetTop);
    }
    const ojos = $('lab-ojos');
    if (st.presentacion && !ojos.hidden) h = Math.max(1, Math.min(h, ojos.offsetTop - 8));
    return { x: 0, y: 0, w, h };
  }

  /** La vía: las tasas de cada tramo y el dibujo, en su lienzo. `r`: canales y otolitos. */
  function pintaVia(r, dt) {
    const lienzoVia = $('lab-via');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(lienzoVia.clientWidth * dpr);
    const h = Math.round(lienzoVia.clientHeight * dpr);
    if (!w || !h) return;
    if (lienzoVia.width !== w || lienzoVia.height !== h) Object.assign(lienzoVia, { width: w, height: h });
    st.via ??= new DibujoVia();
    const act = actividad(r, vectorRotacion(st.qOjo), st.velOjo, { compensado: st.pat.compensado });
    const ultimo = st.traza[st.traza.length - 1];
    st.via.dibuja(lienzoVia.getContext('2d'), w, h, dt, {
      act,
      f: st.f,
      filtro: $('lab-via-filtro').value,
      ciego: st.pat.ciego,
      ojo: ultimo ? ultimo.slice(1) : [0, 0, 0],
      escala: dpr,
    });
  }

  /**
   * La posición del ojo en la órbita, en grados: derecha, arriba y torsión,
   * leídas en el marco de los canales, que es el de los músculos del ojo.
   */
  function anotaTraza(ahora, q) {
    const s = Math.hypot(q[0], q[1], q[2]);
    const ang = s > 1e-9 ? (2 * Math.atan2(s, q[3]) * 180) / Math.PI : 0;
    const k = s > 1e-9 ? ang / s : 0;
    const [x, y, z] = aMarcoCanales([q[0] * k, q[1] * k, q[2] * k]);
    // Girar alrededor de −y lleva la mirada a la derecha; de −x, arriba; de
    // +z, el polo superior hacia la derecha del paciente.
    st.traza.push([ahora, -y, -x, z]);
    while (st.traza.length && ahora - st.traza[0][0] > TRAZA_S * 1000) st.traza.shift();
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
    //
    // Un canal enfermo va amarillo verdoso y se colorea en proporción a lo
    // que todavía responde: muerto, no cambia. La activación se mide contra su
    // propio reposo, que en una hipofunción es más bajo. A ciegas no se pinta
    // nada: la lesión se tiene que descubrir por los ojos.
    const exc = new T.Color(COLOR_EXCITADO);
    const inh = new T.Color(COLOR_INHIBIDO);
    const gris = new T.Color(COLOR_REPOSO);
    const lesion = new T.Color(COLOR_LESION);
    const base = new T.Color();
    const ciego = st.pat.ciego;
    const moviendo = ciego ? 0 : st.vista === 'respuesta' ? 1 : Math.min(1, Math.hypot(...st.omega) / GIRO_PARA_GRIS);
    for (const [id, c] of Object.entries(st.escena.canales)) {
      const f = ciego ? 1 : r[id].f;
      const a = ciego || f === 0 ? 0 : activacion(r[id].tasa / f);
      const k = Math.sqrt(Math.abs(a)) * f;
      base.setHex(COLOR_PAR[CANAL[id].par]).lerp(gris, moviendo).lerp(lesion, 1 - f);
      for (const m of c.materiales) {
        m.color.lerpColors(base, a >= 0 ? exc : inh, k);
        m.emissive.copy(a >= 0 ? exc : inh).multiplyScalar(0.35 * k);
      }
    }
    if (st.vista === 'respuesta' && !ciego) pintaBarras(r);
    if (st.vista === 'respuesta' || st.vista === 'via') $('lab-vcab').textContent = Math.hypot(...st.omega).toFixed(0);

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
    const reg = st.region;
    renderer.setViewport(reg.x, caja.clientHeight - reg.y - reg.h, reg.w, reg.h);
    renderer.render(escena, camara);
    if (st.rotulos) ubicaRotulos();
    if (ojosVisibles()) pintaOjosDeCerca();
  }

  /**
   * Los ojos de cerca, con una cámara pegada a la cabeza —como un video-
   * oculógrafo: la cabeza no se ve moverse, el ojo en la órbita sí— pintada en
   * el hueco de #lab-ojos-vista del mismo lienzo. Esa cámara no ve los
   * laberintos (capa 1). Abajo, la traza.
   */
  function pintaOjosDeCerca() {
    const { renderer, escena, camOjos } = st.r;
    const hueco = $('lab-ojos-vista').getBoundingClientRect();
    const todo = lienzo.getBoundingClientRect();
    const x = hueco.left - todo.left;
    const y = todo.bottom - hueco.bottom;
    camOjos.aspect = hueco.width / Math.max(1, hueco.height);
    camOjos.fov = (2 * Math.atan(OJOS_ANCHO / 2 / (OJOS_DIST * camOjos.aspect)) * 180) / Math.PI;
    camOjos.updateProjectionMatrix();
    renderer.setScissorTest(true);
    renderer.setScissor(x, y, hueco.width, hueco.height);
    renderer.setViewport(x, y, hueco.width, hueco.height);
    renderer.render(escena, camOjos);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, todo.width, todo.height);
    pintaTraza();
  }

  function pintaTraza() {
    const lienzoTraza = $('lab-traza');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(lienzoTraza.clientWidth * dpr);
    const h = Math.round(lienzoTraza.clientHeight * dpr);
    if (lienzoTraza.width !== w || lienzoTraza.height !== h) Object.assign(lienzoTraza, { width: w, height: h });
    const ctx = lienzoTraza.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(250,250,250,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    if (st.traza.length < 2) return;
    const fin = st.traza[st.traza.length - 1][0];
    const xDe = (t) => w - ((fin - t) / (TRAZA_S * 1000)) * w;
    const yDe = (g) => h / 2 - (Math.max(-TRAZA_GRADOS, Math.min(TRAZA_GRADOS, g)) / TRAZA_GRADOS) * (h / 2 - 2);
    const colores = ['#e8721c', '#4db6e8', '#9b51d0'];
    ctx.lineWidth = 1.5 * dpr;
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = colores[k];
      ctx.beginPath();
      st.traza.forEach((m, i) => (i ? ctx.lineTo(xDe(m[0]), yDe(m[k + 1])) : ctx.moveTo(xDe(m[0]), yDe(m[k + 1]))));
      ctx.stroke();
    }
  }

  function pintaBarras(r) {
    for (const c of CANALES) {
      const fila = filas[c.id];
      const { tasa: t, f } = r[c.id];
      // Excitado o inhibido respecto de SU reposo, que enfermo es más bajo.
      const reposo = f * TASA_REPOSO;
      fila.relleno.style.width = `${(100 * t) / TASA_MAX}%`;
      fila.relleno.className = `relleno ${f === 0 ? 'muerto' : t > reposo + 2 ? 'exc' : t < reposo - 2 ? 'inh' : ''}`;
      fila.valor.textContent = t.toFixed(0);
    }
  }

  function ubicaRotulos() {
    const T = st.T;
    const { camara } = st.r;
    const { x: x0, y: y0, w, h } = st.region;
    const p = new T.Vector3();
    for (const el of rotulos.children) {
      const c = st.escena.canales[el.dataset.canal];
      p.copy(c.ancla);
      c.grupo.localToWorld(p);
      p.project(camara);
      const x = x0 + ((p.x + 1) / 2) * w;
      const y = y0 + ((1 - p.y) / 2) * h;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      el.hidden = p.z > 1;
    }
  }

  function ajustaTamano() {
    const { renderer, camara } = st.r;
    const w = Math.max(1, caja.clientWidth);
    const h = Math.max(1, caja.clientHeight);
    renderer.setSize(w, h, false);
    // El aspecto de la cámara lo pone cada cuadro, según `regionModelo`.
  }

  // ---------------------------------------------------------- movimiento ---

  /** Gira la cabeza alrededor de un eje de la CÁMARA (x derecha, y arriba, z hacia uno). */
  function giraMundo(ejeCamara, grados) {
    if (st.impulso || !st.r) return;
    const e = new st.T.Vector3(...ejeCamara).applyQuaternion(st.r.camara.quaternion);
    st.qManual = qMul(qEjeAngulo([e.x, e.y, e.z], grados), st.qManual);
  }

  /** Lo que mueve la cabeza además de la mano: el teléfono enlazado o el propio. */
  function qFuente() {
    return st.remoto?.rol === 'visor' ? st.remoto.q : st.qSensor;
  }

  function centra() {
    // El teléfono enlazado también toma su posición como frente nuevo.
    if (st.remoto?.rol === 'visor' && st.remoto.canal?.readyState === 'open') st.remoto.canal.send('centrar');
    st.impulso = null;
    st.qManual = Q1();
    st.qSensor = Q1();
    st.qCabeza = Q1();
    st.qPrevia = Q1();
    st.ojo.centra();
    st.qOjoPrevio = null;
    st.omega = [0, 0, 0];
    st.pan = [0, 0, 0];
    st.zoom = 1;
    st.camara = CAMARA_FRENTE;
    st.cenital = false;
    $('lab-cenital').setAttribute('aria-pressed', 'false');
    // Con el teléfono, el frente nuevo es como se lo tiene ahora.
    if (st.sensor.activo && st.sensor.arriba) st.sensor.marco = marcoDesdeArriba(st.sensor.arriba);
  }

  function lanzaImpulso(m) {
    if (!st.r) return;
    st.impulso = {
      eje: m.eje,
      qBase: st.qCabeza,
      t0: performance.now(),
      vPico: Number($('lab-vpico').value),
      lentitud: Number($('lab-lentitud').value),
      vuelve: $('lab-volver').checked,
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
    const mPorPx = (2 * st.dist * Math.tan((camara.fov * Math.PI) / 360)) / (st.region?.h ?? Math.max(1, caja.clientHeight));
    const der = new st.T.Vector3(1, 0, 0).applyQuaternion(camara.quaternion);
    const arr = new st.T.Vector3(0, 1, 0).applyQuaternion(camara.quaternion);
    for (let i = 0; i < 3; i++) {
      st.pan[i] += (der.getComponent(i) * dx - arr.getComponent(i) * dy) * mPorPx;
    }
  }

  // ------------------------------------------------------------ sensores ---
  //
  // El giroscopio (`devicemotion.rotationRate`) da la velocidad angular del
  // teléfono en °/s, que es justo lo que sienten los canales, y se la integra
  // en `qSensor` evento a evento. No se usan los ángulos de
  // `deviceorientation` para mover la cabeza: se traban justo con el teléfono
  // parado frente a la cara (beta = 90°), que es como se lo sostiene.
  //
  // Pero `deviceorientation` sirve para dos cosas que el giroscopio no dice:
  //   - dónde está arriba (beta y gamma, sin alpha, que es lo que se traba):
  //     con eso, al prender o al centrar, se arma el marco de la cabeza en el
  //     teléfono (`marcoDesdeArriba`), y girar de costado a costado es girar
  //     la cabeza con el teléfono parado, apaisado o inclinado;
  //   - en qué orden vienen alpha, beta y gamma del giroscopio, que no es el
  //     mismo en todos los navegadores: `DetectorOrden` lo decide en el primer
  //     segundo de movimiento. Hasta entonces se integra la velocidad que sale
  //     de derivar la orientación, más ruidosa pero con los ejes bien puestos;
  //     y si no hay orientación, se supone «xyz», el del primer teléfono en
  //     que se probó.
  //
  // Girar el teléfono a la izquierda gira la cabeza a SU izquierda y excita el
  // lateral izquierdo.

  /** Sin eventos con giroscopio en este tiempo, el teléfono no tiene. */
  const ESPERA_GIROSCOPIO_MS = 1500;
  const ORDEN_SUPUESTO = 'xyz';

  function sensorApagado() {
    return { activo: false, recibio: false, tPrevio: null, arriba: null, marco: null, orden: null, qOri: null, tOri: 0, wOri: [0, 0, 0] };
  }

  function avisa(texto) {
    estado.hidden = false;
    estado.textContent = texto;
    setTimeout(() => (estado.hidden = true), 3500);
  }

  async function prendeSensores() {
    try {
      // Los dos pedidos salen juntos, dentro del mismo toque: iOS los rechaza
      // si el segundo espera al primero y el gesto ya pasó.
      const pedidos = [window.DeviceMotionEvent, window.DeviceOrientationEvent]
        .filter((E) => typeof E?.requestPermission === 'function')
        .map((E) => E.requestPermission());
      const r = await Promise.all(pedidos);
      if (r.some((x) => x !== 'granted')) {
        avisa(tx('sin permiso para leer los sensores del teléfono'));
        return;
      }
    } catch (e) {
      console.warn('laberinto: sensores', e);
      avisa(tx('sin permiso para leer los sensores del teléfono'));
      return;
    }
    st.sensor = { ...sensorApagado(), activo: true, orden: new DetectorOrden() };
    // Lo que se giró a mano queda: el teléfono suma desde ahí.
    st.qManual = st.qCabeza;
    st.qSensor = Q1();
    window.addEventListener('devicemotion', alMoverse);
    window.addEventListener('deviceorientation', alOrientar);
    pintaSensores();
    setTimeout(() => {
      if (st.sensor.activo && !st.sensor.recibio) {
        apagaSensores();
        avisa(tx('este teléfono no entrega el giroscopio'));
      }
    }, ESPERA_GIROSCOPIO_MS);
  }

  function apagaSensores() {
    if (!st.sensor.activo) return;
    window.removeEventListener('devicemotion', alMoverse);
    window.removeEventListener('deviceorientation', alOrientar);
    st.qManual = st.qCabeza;
    st.qSensor = Q1();
    st.sensor = sensorApagado();
    pintaSensores();
  }

  function alOrientar(e) {
    if (e.beta == null || e.gamma == null) return;
    const s = st.sensor;
    s.arriba = arribaDesdeOrientacion(e.beta, e.gamma);
    s.marco ??= marcoDesdeArriba(s.arriba);
    // La velocidad que sale de derivar la orientación: ruidosa, pero con los
    // ejes bien puestos. Solo sirve de referencia para el detector.
    if (e.alpha == null) return;
    const q = qDesdeOrientacion(e.alpha, e.beta, e.gamma);
    const dt = (e.timeStamp - s.tOri) / 1000;
    if (s.qOri && dt > 0.005 && dt < 0.1) {
      const w = velocidadAngular(s.qOri, q, dt);
      s.wOri = s.wOri.map((v, i) => v + 0.5 * (w[i] - v));
    }
    s.qOri = q;
    s.tOri = e.timeStamp;
  }

  function alMoverse(e) {
    const r = e.rotationRate;
    if (!r || (r.alpha == null && r.beta == null && r.gamma == null)) return;
    const s = st.sensor;
    s.recibio = true;
    // El intervalo sale de las marcas de tiempo y no de `e.interval`, que
    // unos navegadores dan en milisegundos y otros en segundos.
    const t = e.timeStamp;
    const dt = s.tPrevio === null ? 0 : Math.min(0.1, (t - s.tPrevio) / 1000);
    s.tPrevio = t;
    const reciente = s.qOri && t - s.tOri < 80;
    const orden = reciente ? s.orden.muestra(r, s.wOri) : s.orden.elegido;
    // Mientras corre un impulso armado la cabeza es del impulso.
    if (st.impulso || dt <= 0) return;
    const enTelefono = orden ? ORDENES_GIRO[orden](r) : reciente ? s.wOri : ORDENES_GIRO[ORDEN_SUPUESTO](r);
    const enCabeza = s.marco ? aMarco(s.marco, enTelefono) : enTelefono;
    st.qSensor = integraGiro(st.qSensor, enCabeza, dt);
    // Este teléfono es la cabeza de un PC: se le manda cada evento.
    const enlace = st.remoto;
    if (enlace?.rol === 'cabeza' && enlace.mueve && enlace.canal?.readyState === 'open') {
      enlace.canal.send(mensajeCabeza(qMul(st.qManual, st.qSensor), enCabeza));
    }
  }

  // -------------------------------------------------------------- enlace ---
  //
  // Teléfono y PC se presentan por el PHP de señalización (enlace.js) y
  // después hablan directo. El PC es el `visor`: muestra el modelo y usa la
  // cabeza que le llega. El teléfono es la `cabeza`: prende sus sensores,
  // manda lo que mide y deja de dibujar para ahorrar batería.
  //
  // `st.remoto` vive mientras dura el ENLACE, que es más que una conexión: si
  // la conexión se cae —el teléfono se durmió, se cortó el wifi—, el PC
  // reabre la misma sala y el teléfono vuelve a entrar con el mismo código,
  // solos, hasta que alguien aprieta «Terminar» o «Desconectar». Para que no
  // se caiga, el teléfono pide que la pantalla no se apague (Wake Lock).

  /** Tiempo de gracia de una conexión «desconectada» antes de darla por caída. */
  const GRACIA_MS = 3000;
  /** Cada cuánto reintenta el que se quedó sin conexión. */
  const REINTENTO_MS = 2000;

  function estadoEnlace(texto) {
    $('lab-enlace-estado').textContent = texto;
  }

  /** El mensaje de un enlace que no se pudo armar, con qué probar si es la red. */
  function errorEnlace(e) {
    const msg = tx('No se pudo enlazar: {msg}', { msg: e.message });
    return e.sinRuta ? `${msg}. ${tx('Probá con los dos en la misma red wifi, o con el PC conectado al punto de acceso del teléfono.')}` : msg;
  }

  /**
   * Abre el diálogo. En el PC muestra el botón del QR; con `codigo` —el
   * teléfono llegó por el QR—, solo el botón para ser la cabeza, que hace
   * falta porque el permiso de los sensores tiene que salir de un toque.
   */
  function abreEnlace(codigo = '') {
    $('lab-enlace').hidden = false;
    if (codigo) st.codigoQr = codigo;
    $('lab-enlace-visor').hidden = Boolean(codigo);
    $('lab-enlace-cabeza').hidden = !codigo;
    $('lab-enlace-terminar').hidden = !st.remoto;
    if (!st.remoto) estadoEnlace('');
    (codigo ? $('lab-enlace-unirse') : $('lab-enlace-crear')).focus();
  }

  function cierraDialogoEnlace() {
    $('lab-enlace').hidden = true;
    // Una sala que nadie usó todavía se cancela al cerrar.
    if (st.remoto?.rol === 'visor' && !st.remoto.algunaVez) terminaEnlace();
  }

  async function dibujaQr(texto) {
    const { qrcode } = await import('https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/dist/qrcode.mjs');
    const qr = qrcode(0, 'M');
    qr.addData(texto);
    qr.make();
    const n = qr.getModuleCount();
    const margen = 2;
    const lienzoQr = $('lab-enlace-qr');
    lienzoQr.width = lienzoQr.height = n + 2 * margen;
    const ctx = lienzoQr.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, n + 2 * margen, n + 2 * margen);
    ctx.fillStyle = '#000';
    for (let f = 0; f < n; f++) for (let c = 0; c < n; c++) if (qr.isDark(f, c)) ctx.fillRect(c + margen, f + margen, 1, 1);
  }

  const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));

  function pintaEnlace() {
    const r = st.remoto;
    const badge = $('lab-enlace-badge');
    badge.hidden = r?.rol !== 'visor' || !r.algunaVez;
    badge.textContent = !r?.conectado
      ? tx('ESPERANDO AL TELÉFONO…')
      : r.relevo
        ? tx('TELÉFONO ENLAZADO · POR EL SERVIDOR')
        : tx('TELÉFONO ENLAZADO');
    badge.className = `badge ${r?.conectado ? 'ok' : 'warn'}`;
    $('lab-remota').hidden = r?.rol !== 'cabeza';
    seccion.classList.toggle('control-remoto', r?.rol === 'cabeza');
    $('lab-remota-estado').textContent = r?.rol === 'cabeza' && !r.conectado ? tx('Reconectando…') : '';
    $('lab-enlace-terminar').hidden = !r;
  }

  // ---- el PC ----

  async function creaCodigo() {
    terminaEnlace();
    $('lab-enlace-codigo').hidden = true;
    estadoEnlace(tx('Abriendo la sala…'));
    let sala;
    try {
      sala = await Sala.crea();
    } catch (e) {
      estadoEnlace(errorEnlace(e));
      return;
    }
    const r = { rol: 'visor', sala, q: Q1(), w: [0, 0, 0], t: 0, conectado: false, algunaVez: false };
    st.remoto = r;
    $('lab-enlace-codigo').hidden = false;
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('enlace', sala.codigo);
    dibujaQr(url.href).catch((e) => console.warn('laberinto: QR', e));
    estadoEnlace(tx('Esperando al teléfono…'));
    pintaEnlace();
    esperaTelefono(r);
  }

  /** Deja una oferta y espera al teléfono; si falla y el enlace sigue, reintenta. */
  async function esperaTelefono(r) {
    while (st.remoto === r) {
      try {
        const { pc, canal, relevo } = await r.sala.conecta((texto) => st.remoto === r && !r.algunaVez && estadoEnlace(texto));
        if (st.remoto !== r) return pc?.close() ?? canal.close();
        engancha(r, pc, canal, relevo);
        return;
      } catch (e) {
        if (st.remoto !== r || e.message === 'cancelado') return;
        // Sin haberse conectado nunca, es un error de verdad: se avisa.
        if (!r.algunaVez) {
          terminaEnlace();
          $('lab-enlace').hidden = false;
          estadoEnlace(errorEnlace(e));
          return;
        }
        await pausa(REINTENTO_MS);
        try {
          await r.sala.reabre();
        } catch (e2) {
          console.warn('laberinto: reabrir la sala', e2);
        }
      }
    }
  }

  // ---- el teléfono ----

  async function uneComoCabeza() {
    const codigo = st.codigoQr;
    if (!codigo) return;
    // Primero los sensores: el permiso de iOS pide que sea dentro del toque.
    await prendeSensores();
    if (!st.sensor.activo) {
      estadoEnlace(tx('Sin los sensores del teléfono no se puede ser la cabeza.'));
      return;
    }
    terminaEnlace();
    estadoEnlace(tx('Conectando…'));
    const r = { rol: 'cabeza', codigo, conectado: false, algunaVez: false, despierta: null, mueve: $('lab-remota-mueve').checked };
    st.remoto = r;
    buscaPC(r);
  }

  /** Entra a la sala del PC; mientras el PC la está (re)abriendo, reintenta. */
  async function buscaPC(r) {
    for (let intentos = 0; st.remoto === r; intentos++) {
      try {
        const { pc, canal, relevo } = await uneSala(r.codigo, (texto) => {
          if (st.remoto !== r) return;
          if (r.algunaVez) $('lab-remota-estado').textContent = texto;
          else estadoEnlace(texto);
        });
        if (st.remoto !== r) return pc?.close() ?? canal.close();
        engancha(r, pc, canal, relevo);
        return;
      } catch (e) {
        if (st.remoto !== r) return;
        // La primera vez, una sala que no existe es un QR vencido, y una red
        // que no deja conectar directo no se arregla reintentando.
        if (!r.algunaVez && (e.sinRuta || (!e.todavia && intentos > 1))) {
          terminaEnlace();
          $('lab-enlace').hidden = false;
          estadoEnlace(errorEnlace(e));
          return;
        }
        // Se espera, o hasta que la página vuelva a verse (el teléfono despertó).
        await Promise.race([pausa(REINTENTO_MS), new Promise((ok) => (r.despierta = ok))]);
      }
    }
  }

  async function pideNoDormir(r) {
    try {
      r.wakeLock = await navigator.wakeLock?.request('screen');
    } catch (e) {
      console.warn('laberinto: la pantalla se puede apagar', e);
    }
  }

  // ---- los dos ----

  /**
   * Engancha un canal abierto: el de datos de WebRTC (con su `pc`) o el del
   * relevo (`pc` nulo, `relevo` true), que se usan igual.
   */
  function engancha(r, pc, canal, relevo = false) {
    Object.assign(r, { pc, canal, relevo, conectado: true, algunaVez: true });
    centra();
    const caida = () => seCae(r, canal);
    let gracia = 0;
    pc?.addEventListener('connectionstatechange', () => {
      clearTimeout(gracia);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') caida();
      // «disconnected» a veces se arregla solo: se espera un poco.
      else if (pc.connectionState === 'disconnected') gracia = setTimeout(caida, GRACIA_MS);
    });
    canal.addEventListener('close', caida);
    if (r.rol === 'visor') {
      canal.addEventListener('message', (e) => {
        if (st.remoto !== r) return;
        const m = leeCabeza(e.data);
        if (m) return void Object.assign(r, m, { t: performance.now() });
        const c = leeControl(e.data);
        if (c?.t === 'control') aplicaControl(c);
        else if (c?.t === 'presentacion') ponPresentacion(c.valor);
      });
      // El teléfono arranca mostrando lo mismo que el PC.
      avisaEstado();
    } else {
      canal.addEventListener('message', (e) => {
        if (e.data === 'centrar') return void centra();
        const c = leeControl(e.data);
        if (c?.t === 'estado') aplicaEstado(c);
      });
      // El teléfono no dibuja: su pantalla no la mira nadie.
      cancelAnimationFrame(st.raf);
      st.raf = 0;
      pideNoDormir(r);
    }
    estadoEnlace('');
    $('lab-enlace').hidden = true;
    pintaEnlace();
  }

  /** La conexión se cayó pero el enlace sigue: a reconectar. */
  function seCae(r, canal) {
    if (st.remoto !== r || r.canal !== canal || !r.conectado) return;
    r.conectado = false;
    r.pc?.close();
    canal.close();
    pintaEnlace();
    if (r.rol === 'visor') {
      r.sala.reabre().catch((e) => console.warn('laberinto: reabrir la sala', e)).finally(() => esperaTelefono(r));
    } else buscaPC(r);
  }

  /** Termina el enlace: nada de reconectar. */
  function terminaEnlace() {
    const r = st.remoto;
    if (!r) return;
    st.remoto = null;
    r.sala?.cancela();
    r.pc?.close();
    r.canal?.close();
    r.wakeLock?.release().catch(() => {});
    // Lo que se había girado queda donde estaba.
    if (r.rol === 'visor') {
      st.qManual = st.qCabeza;
      ponPresentacion('');
    }
    $('lab-enlace-codigo').hidden = true;
    pintaEnlace();
    if (r.rol === 'cabeza' && st.abierta && st.listo && !st.raf) {
      st.tPrevio = performance.now();
      st.raf = requestAnimationFrame(cuadro);
    }
  }

  // El teléfono vuelve de dormir: la pantalla se volvió a ver. El Wake Lock se
  // suelta solo al ocultarse y hay que pedirlo de nuevo; y si la conexión no
  // sobrevivió, se reintenta ya, sin esperar el turno.
  document.addEventListener('visibilitychange', () => {
    const r = st.remoto;
    if (document.visibilityState !== 'visible' || r?.rol !== 'cabeza') return;
    pideNoDormir(r);
    if (r.conectado && r.canal?.readyState !== 'open') seCae(r, r.canal);
    r.despierta?.();
  });

  $('lab-enlazar').addEventListener('click', () => abreEnlace());
  $('lab-enlace-badge').addEventListener('click', () => abreEnlace());
  $('lab-enlace-cerrar').addEventListener('click', cierraDialogoEnlace);
  $('lab-enlace-terminar').addEventListener('click', () => {
    terminaEnlace();
    estadoEnlace(tx('Enlace terminado.'));
  });
  $('lab-enlace-crear').addEventListener('click', creaCodigo);
  $('lab-enlace-unirse').addEventListener('click', uneComoCabeza);
  // En el teléfono, Centrar centra los dos: el frente del teléfono y, en el
  // PC, la cabeza, los ojos y la cámara.
  $('lab-remota-centrar').addEventListener('click', () => {
    centra();
    mandaControl({ t: 'control', ref: '#lab-centrar', click: true });
  });
  $('lab-remota-mueve').addEventListener('change', (e) => {
    const r = st.remoto;
    if (r?.rol !== 'cabeza') return;
    r.mueve = e.target.checked;
    // Al volver a mover, la posición de ahora es el frente: sin salto.
    if (r.mueve) centra();
  });
  $('lab-remota-pantalla').addEventListener('change', (e) => mandaControl({ t: 'presentacion', valor: e.target.value }));

  // ------------------------------------------------------ control remoto ---
  //
  // Enlazado, el teléfono es además el control remoto del PC: muestra las
  // pestañas y el panel, y lo que se toca ahí no se aplica en el teléfono
  // sino que viaja al PC, que lo aplica como si lo hubieran tocado en su
  // pantalla. El PC contesta cómo quedó (`estadoPanel`) y el teléfono se
  // pinta igual. Así manda uno solo: el paciente al azar lo sortea el PC, y
  // el teléfono ve el mismo.
  //
  // El PC, además, puede quedar en PRESENTACIÓN: sin barra ni panel, con el
  // modelo solo o con la vía, los ojos de cerca y sus curvas. Se elige desde
  // el teléfono; Esc en el PC la saca.

  /** Lo que el teléfono maneja: el panel, las pestañas, los modos y Centrar. */
  const ZONA_CONTROL = '.lab-panel, .lab-vistas, .lab-modos, #lab-centrar';
  const VISTAS = ['canales', 'ejes', 'respuesta', 'patologia', 'via'];
  const PRESENTACIONES = ['', 'cabeza', 'via', 'ojos', 'todo'];

  function mandaControl(m) {
    const canal = st.remoto?.canal;
    if (canal?.readyState === 'open') canal.send(mensajeControl(m));
  }

  // En el teléfono: lo que se toca va al PC y acá no se aplica. Se ataja en
  // la captura, antes de que llegue a los manejadores de cada control.
  function atajaControl(e) {
    if (st.remoto?.rol !== 'cabeza') return;
    const el = e.target.closest?.('button, input, select');
    if (!el || !el.closest(ZONA_CONTROL)) return;
    const ref = refControl(el);
    if (!ref) return;
    if (e.type === 'click') {
      // El clic de una casilla llega después como `change`.
      if (el.tagName !== 'BUTTON') return;
      e.preventDefault();
      e.stopPropagation();
      mandaControl({ t: 'control', ref, click: true });
      return;
    }
    e.stopPropagation();
    mandaControl({ t: 'control', ref, evento: e.type, valor: el.value, checked: el.checked });
  }
  for (const tipo of ['click', 'input', 'change']) seccion.addEventListener(tipo, atajaControl, true);

  // En el PC: lo del teléfono se aplica como un toque de acá.
  function aplicaControl(m) {
    if (!refValida(m.ref)) return;
    const el = seccion.querySelector(m.ref);
    if (!el || !el.closest(ZONA_CONTROL) || el.disabled) return;
    if (m.click) el.click();
    else {
      if (el.type === 'checkbox') el.checked = Boolean(m.checked);
      else el.value = String(m.valor);
      el.dispatchEvent(new Event(m.evento === 'input' ? 'input' : 'change', { bubbles: true }));
    }
    avisaEstado();
  }

  function ponPresentacion(v) {
    st.presentacion = PRESENTACIONES.includes(v) ? v : '';
    pintaCapas();
    avisaEstado();
  }

  /** Cómo quedó el panel del PC, para el teléfono. */
  function estadoPanel() {
    const valores = {};
    for (const el of seccion.querySelectorAll('.lab-panel input[id], .lab-panel select[id]')) {
      valores[el.id] = el.type === 'checkbox' ? el.checked : el.value;
    }
    const revelado = $('lab-revelado');
    return {
      t: 'estado',
      vista: st.vista,
      modoLab: st.modoLab,
      pat: st.pat,
      revelado: revelado.hidden ? null : revelado.textContent,
      presentacion: st.presentacion,
      valores,
    };
  }

  // Se manda poco después del último cambio: un deslizador que se arrastra
  // manda muchos.
  let esperaEstado = 0;
  function avisaEstado() {
    if (st.remoto?.rol !== 'visor') return;
    clearTimeout(esperaEstado);
    esperaEstado = setTimeout(() => mandaControl(estadoPanel()), 80);
  }
  // Lo que se cambia en el PC mismo también le llega al teléfono.
  for (const tipo of ['click', 'change']) seccion.addEventListener(tipo, () => avisaEstado());

  // En el teléfono: se pinta como el PC. El control que se está tocando no se
  // pisa, para que un deslizador no salte mientras se lo arrastra.
  function aplicaEstado(e) {
    const tocando = document.activeElement;
    for (const [id, v] of Object.entries(e.valores ?? {})) {
      const el = $(id);
      if (!el || el === tocando || !el.closest('.lab-panel')) continue;
      if (el.type === 'checkbox') el.checked = Boolean(v);
      else el.value = String(v);
    }
    if (e.pat && typeof e.pat === 'object') {
      st.pat = { ...st.pat, ...e.pat };
      aplicaPatologia();
    }
    if (VISTAS.includes(e.vista)) ponVista(e.vista);
    marcaModo(e.modoLab);
    const revelado = $('lab-revelado');
    revelado.hidden = !e.revelado;
    revelado.textContent = e.revelado ?? '';
    $('lab-remota-pantalla').value = PRESENTACIONES.includes(e.presentacion) ? e.presentacion : '';
    pintaVpico();
  }
  $('lab-remota-soltar').addEventListener('click', () => {
    terminaEnlace();
    apagaSensores();
  });

  // `estado` es para revolver desde la consola (window.trainhit.laberinto).
  return { abre, cierra, abierto: () => st.abierta, enlaza: abreEnlace, estado: st };
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
