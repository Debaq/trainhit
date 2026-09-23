// Diccionario inglés. Ver idioma.js: `HTML` va por clave (`data-i18n` de
// index.html) y `TEXTO` por la frase en español que el código pasa a `tx()`.
// test/idioma.test.mjs avisa lo que falta y lo que sobra.
//
// Los términos clínicos siguen la literatura del vHIT en inglés: gain, covert
// y overt saccades, head impulse, lateral canal. Los `{nombre}` tienen que
// quedar tal cual, y los motivos de rechazo conservan el « —» que separa la
// parte corta de la recomendación.

export const HTML = {
  // ── barra ──
  'barra.acerca': 'who makes trainHIT',
  'barra.tope': '60 FPS CAP',
  'barra.perillas': 'SETTINGS CHANGED',
  'barra.simulado': 'SIMULATED',
  'barra.fps.t': 'frames per second PROCESSED, not the ones the camera delivers',
  'barra.cara': 'face',
  'barra.cara.t': 'whether the model finds a face in the frame',
  'barra.vcab': 'head v',
  'barra.vcab.t': 'head turning velocity right now, in °/s',
  'barra.megusta': 'like',
  'barra.aprender': 'Learn',
  'barra.aprender.t': 'guided tours of the page (T)',
  'barra.ayuda': 'what is this',
  'barra.simulador': 'Simulator',
  'barra.simulador.t': 'simulated patient: a pathology on top of real impulses (S)',
  'barra.herramientas': 'Tools',

  fijacion: 'Look at the dot —or at the camera, if it is elsewhere— <b>without letting go</b> and turn your head slowly, ±20°',

  // ── carga y bienvenida ──
  'carga.titulo': 'Preparing train<b>HIT</b>',
  'carga.ayuda': 'It is downloaded only once: it stays stored in the browser and opens instantly next time.',
  'bienvenida.p1':
    'trainHIT measures the vestibulo-ocular reflex with the computer’s camera: it tracks the head and the iris frame by frame and computes the gain of each head impulse.',
  'bienvenida.p2':
    'It uses a remote camera, no goggles: the same approach that has published norms at 100 fps with the target at 1–1.3 m (<a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5594068/" target="_blank" rel="noopener">Wiener-Vacher &amp; Wiener, 2017</a>).',
  'bienvenida.p3':
    'Everything is processed in the browser and every step of the computation is in plain sight under <b>Tools</b>. At 30 fps and without fixing the distance to the target, the values are for teaching.',
  'bienvenida.tope':
    'Processing is capped at 60 fps even if the camera delivers more. The cap is there on purpose: this is not a medical device and we do not want it used as one.',
  'bienvenida.calibrar': 'Calibrate the parallax with <kbd>C</kbd> before measuring.',
  'bienvenida.credito': 'Developed at <b>TecMedHub</b>, Universidad Austral de Chile.',
  'bienvenida.acerca': 'Who we are',
  'bienvenida.tutorial': 'Learn how to use it',
  'bienvenida.empezar': 'Start',
  version: 'version',

  // ── acerca de ──
  'acerca.bajada': 'the vestibulo-ocular reflex, frame by frame and in plain sight',
  'acerca.dedicatoria':
    'For those who walk through the lab door with more questions than answers, and hungry for knowledge. May every number on this page be something you can open, touch and understand: that is how the curiosity that later becomes a craft begins.',
  'acerca.desarrollo': 'Development',
  'acerca.lab': 'TecMedHub Lab',
  'acerca.sede': 'Universidad Austral de Chile · Puerto Montt campus',
  'acerca.aviso':
    'Teaching tool: it is not a medical device. The code is open (Apache-2.0) and every decision in the computation is explained in <a href="https://github.com/Debaq/trainhit" target="_blank" rel="noopener">the repository</a>.',
  'acerca.volver': 'Back',

  // ── tutorial ──
  'tuto.menu': '‹ Tours',
  'tuto.menu.t': 'back to the list of tours',
  'tuto.salir': 'Exit',
  'tuto.anterior': 'Previous',
  'tuto.siguiente': 'Next',

  // ── video y botonera ──
  'video.apagada': 'camera off',
  'video.ojoDer': 'right eye',
  'video.ojoDer.t': 'right eye, magnified',
  'video.ojoIzq': 'left eye',
  'video.ojoIzq.t': 'left eye, magnified',
  'boton.pausa.t': 'freezes the trace below so it can be measured',
  'boton.calibrar': 'Calibrate <kbd>C</kbd>',
  'boton.descartar': 'Discard <kbd>D</kbd>',
  'boton.deshacer': 'Undo <kbd>Z</kbd>',
  'boton.deshacer.t': 'brings back the last discarded impulse',
  'boton.borrar': 'Delete all <kbd>R</kbd>',
  'boton.csv': 'Export CSV',
  'boton.csv.t': 'one file with the impulse, sample and raw tables',
  'boton.importar': 'Import CSV',
  'boton.importar.t': 'opens an exported session and recomputes it from the raw data',
  'boton.camara': 'camera',
  'boton.herramientas': 'display and measurement under <b>Tools</b> <kbd>H</kbd>',

  // ── lecturas ──
  'lect.offset': 'iris offset',
  'lect.offset.t':
    'how far the iris center is shifted from the midpoint between the eye corners, in mm: it mixes eye rotation with parallax',
  'lect.escala': 'scale',
  'lect.escala.t': 'pixels per millimeter in the image, taken from the iris (11.7 mm across)',
  'lect.iris.t': 'iris radius in pixels: below the minimum the landmark is too coarse for the scale',
  'lect.yaw': 'head yaw',
  'lect.yaw.t': 'head rotation about its vertical axis; positive toward the patient’s left',
  'lect.inclin': 'tilt',
  'lect.inclin.t':
    'angle between the head’s vertical axis and the camera’s, unsigned; the lateral vHIT is done with ~30° of flexion',
  'lect.azimut': 'gaze azimuth',
  'lect.azimut.t': 'where the gaze points in space, parallax already corrected: with a perfect VOR it does not move',
  'lect.vojo': 'comp. eye v',
  'lect.vojo.t': 'eye velocity within the orbit: the one that compensates the head turn',
  'lect.blink': 'blink',
  'lect.blink.t': 'whether the eyelid is closed enough to cover the iris',
  glosario: 'What each number means',
  'glosario.dl': `
              <dt>iris offset</dt><dd>How far the iris center is shifted from the midpoint between the eye corners, in mm. It mixes eye rotation with parallax: that is why calibration is needed.</dd>
              <dt>scale</dt><dd>Pixels per millimeter in the image. It comes from the iris, which measures ~11.7 mm in almost everyone: it is the ruler.</dd>
              <dt>iris</dt><dd>Iris radius in pixels. Below the minimum, one pixel of error is many degrees and the impulse is rejected.</dd>
              <dt>head yaw</dt><dd>Head rotation about its own vertical axis, in degrees. Positive toward the patient’s left.</dd>
              <dt>tilt</dt><dd>How tilted the head is relative to the camera. For the lateral canal, ~30° of flexion is the goal.</dd>
              <dt>gaze azimuth</dt><dd>Where the gaze points in space, parallax already corrected. With a perfect reflex it stays still even as the head turns.</dd>
              <dt>comp. eye v</dt><dd>Eye velocity within the orbit, in °/s: the one that compensates the head. With gain 1 it equals the head’s, in reverse.</dd>
              <dt>blink</dt><dd>Whether the eyelid covers the iris. A blink inside the impulse rejects it.</dd>
            `,

  // ── paneles ──
  'lado.der': 'Rightward impulses',
  'lado.der.t': 'impulses to the right: head and eye velocity overlaid',
  'lado.izq': 'Leftward impulses',
  'lado.izq.t': 'impulses to the left: head and eye velocity overlaid',
  vivo: 'Live velocity',
  'vivo.cabeza': 'head',
  'vivo.t': 'live head and eye velocity',

  // ── herramientas ──
  'h.t': 'tools',
  'h.cerrar': 'close tools',
  'h.presentacion': 'Display',
  'h.espejo': 'Mirror the video',
  'h.suavizar': 'Smooth the traces',
  'h.suavizar.t': 'monotone interpolation between samples; the dots are the real samples',
  'h.sacadas': 'Mark saccades',
  'h.sacadas.t': 'triangle over the peak of each saccade: violet covert, red overt',
  'h.sacadas.leyenda': '<i class="c-covert">▼</i>covert <i class="c-overt">▼</i>overt',
  'h.promedio': 'Mean curve per side',
  'h.promedio.t': 'mean of the accepted impulses of the side, aligned on the trigger',
  'h.orientacion': 'Orientation',
  'h.orientacion.t': 'which way each impulse points and on which side the eye trace goes',
  'h.orientacion.comparativo': 'compare sides (impulse up)',
  'h.orientacion.real': 'real direction (right up, left down)',
  'h.suavizar.ayuda':
    'Smoothing makes a 30 fps signal LOOK more precise: while it is on, the dots mark the real samples.',
  'h.medir': 'Measuring on the plots',
  'h.medir.p1':
    'The pointer over any impulse plot reads the instant and both velocities. A click sets the reference: from there you get Δt, the jump of each trace, the <b>area</b> of each one over the span —shaded— and the gain of that span, which is the ratio of the areas. Another click releases it.',
  'h.medir.p2': 'The trace below is measured the same way, with <kbd>Space</kbd> to freeze it first.',
  'h.calib': 'Parallax calibration',
  'h.calib.t': 'parallax fit: iris offset against sine of yaw',
  'h.calib.p1':
    'The eye’s center of rotation lies behind the eye corners: when the head turns, the iris shifts without the eye moving, by the same magnitude as the signal.',
  'h.calib.p2': 'Fixate a point and move the head slowly for 10 s, ±20°. The dots should fall on a line with slope −k.',
  'h.kmanual': 'manual k',
  'h.kmanual.usar': 'use this k',
  'h.kmanual.ayuda': 'With k = 0 a normal VOR reads ~1.9. Unchecking restores the calibrated k.',
  'h.pulso': 'Last impulse',
  'h.pulso.t': 'last impulse with the impulse window',
  'h.pulso.ayuda': 'Shaded: the impulse window. Dotted: the start and end thresholds.',
  'h.ganancias': 'Gain vs peak',
  'h.ganancias.t': 'gain of each impulse against its peak velocity',
  'h.metodo': 'Method',
  'h.metodo.t': 'which computation gives the gain of each impulse',
  'h.metodo.area': 'area (positions, onset→offset)',
  'h.metodo.60ms': 'instantaneous at 60 ms',
  'h.metodo.picos': 'ratio of peaks',
  'h.metodo.desacadizada': 'area up to the first covert saccade (≈)',
  'h.ganancias.corte': 'Dotted: 0.80 cutoff, from studies with desaccaded signal. This engine does not desaccade.',
  'h.tabla.metodo': 'method',
  'h.tabla.der': 'right',
  'h.tabla.izq': 'left',
  'h.tabla.asim': 'asym.',
  'h.ganancias.ayuda':
    'Same impulses, three computations. <b>Area</b> is the one reported. <b>60 ms</b> looks at a single instant: at 30 fps that is two frames of support. <b>Peaks</b> divides maxima that do not happen at the same time. They are not interchangeable. <b>Up to the saccade</b> cuts the area before the first covert saccade: an approximate desaccading, to see how much the saccade inflated the area gain, not for reporting.',
  'h.perillas': 'Settings',
  'p.derivWin': 'Differentiator window',
  'p.derivWin.ayuda': 'Wider flattens the peak.',
  'p.derivDeg': 'Fit degree',
  'p.derivDeg.ayuda': 'Degree 1 flattens the impulse peak.',
  'p.onDeg': 'Start threshold',
  'p.offDeg': 'End threshold',
  'p.peakMin': 'Min peak',
  'p.peakMax': 'Max peak',
  'p.durMin': 'Min duration',
  'p.durMax': 'Max duration',
  'p.blink': 'Blink',
  'p.irisMin': 'Min iris',
  'p.irisMin.ayuda': 'Iris radius below which the impulse is rejected.',
  'h.perillas.ayuda':
    'Changes apply to the following impulses. Each impulse keeps its raw samples: the button recomputes all of them with the current settings, thresholds and <b>k</b>, which is how you see what each setting does to an impulse already measured.',
  'h.recalcular': 'Recompute the impulses with these settings',
  'h.defecto': 'Default values',
  'h.defecto.t': 'every setting back to its factory value',
  'h.sinAntes': 'Remove comparison',
  'h.sinAntes.t': 'removes the struck-through values from before recomputing',
  'h.como': 'How it measures',
  'h.como.lista': `
            <li><b>Iris as ruler.</b> 11.7 mm across; the major semi-axis does not change with rotation ⇒ px/mm scale.</li>
            <li><b>Spherical angle.</b> sin(azimuth) = offset/R, R ≈ 10.5 mm.</li>
            <li><b>Head by increments</b> projected on the canal axis, which travels with the head.</li>
            <li><b>Derivative</b> by polynomial fit over the real frame timestamps.</li>
            <li><b>Gain</b> = 1 − Δgaze/Δhead, with positions, between onset and offset.</li>
          `,
  'h.limites': 'What it does not do',
  'h.limites.lista': `
            <li>The gain it reports is not desaccaded ⇒ bias toward false negatives. Saccades are marked and there is an approximate desaccaded gain for comparison, at 30 fps.</li>
            <li>It does not fix the distance to the target.</li>
            <li>30 fps: the peak falls between samples. 60 fps cap on purpose: it is not a medical device.</li>
            <li>Head and eye come from the same image: a tracking error enters both signals.</li>
            <li>Lateral canal only; the vertical ones need the vertical component of the eye.</li>
          `,
  'h.docentes': 'For teachers',
  'h.docentes.ayuda':
    'Self-assessment questions in GIFT format, for the Moodle question bank: one for each blind case —with the numbers the engine gets from each— and others on the concepts of the tours. A measured session is shared with <b>Export CSV</b> and each student opens it with <b>Import CSV</b>.',
  'h.gift': 'Questions for Moodle (GIFT)',
  'h.refs': 'Where the numbers come from',
  'h.refs.lista': `
            <li>
              <a href="https://pubmed.ncbi.nlm.nih.gov/3390028/" target="_blank" rel="noopener">Halmagyi &amp; Curthoys, 1988</a>
              — the head impulse as a clinical sign. <i>Arch Neurol.</i>
            </li>
            <li>
              <a href="https://pubmed.ncbi.nlm.nih.gov/19805730/" target="_blank" rel="noopener">MacDougall et al., 2009</a>
              — vHIT against the scleral search coil: the source of the 0.80 cutoff, with desaccaded area gain at ~250 Hz and the target at ~1 m. <i>Neurology.</i>
            </li>
            <li>
              <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5594068/" target="_blank" rel="noopener">Wiener-Vacher &amp; Wiener, 2017</a>
              — norms with a remote camera at 100 fps, target at 1–1.3 m: the precedent for the goggle-free approach. <i>Front Neurol.</i>
            </li>
            <li>
              <a href="https://pubmed.ncbi.nlm.nih.gov/29865935/" target="_blank" rel="noopener">Judge et al., 2018</a>
              — target distance and size change the measured gain.
              <i>Otolaryngol Head Neck Surg.</i>
            </li>
            <li>
              <a href="https://pubmed.ncbi.nlm.nih.gov/30537706/" target="_blank" rel="noopener">Castro et al., 2018</a>
              — target distance and VOR gain. <i>Audiol Neurootol.</i>
            </li>
            <li>
              <a href="https://pubmed.ncbi.nlm.nih.gov/34057110/" target="_blank" rel="noopener">Jacobsen et al., 2021</a>
              — regression gain against instantaneous gain: which is more reproducible.
              <i>J Vestib Res.</i>
            </li>
            <li>
              <a href="https://pubmed.ncbi.nlm.nih.gov/36970532/" target="_blank" rel="noopener">Money-Nolan &amp; Devroede, 2023</a>
              — systematic review of what makes the gain vary: gain is not a fixed number, norms are needed per device and protocol. <i>Front Neurol.</i>
            </li>
            <li>
              <a href="https://pubmed.ncbi.nlm.nih.gov/32930021/" target="_blank" rel="noopener">Du et al., 2021</a>
              — gain and PR score in peripheral vestibular disorders. <i>Acta Otolaryngol.</i>
            </li>
          `,
  'h.refs.ganancias': 'Full comparison against the literature: <code>GANANCIAS.md</code> in the main repository (in Spanish).',

  // ── simulador ──
  'sim.titulo': 'Simulated patient',
  'sim.cerrar': 'close the simulator',
  'sim.ayuda':
    'A healthy classmate in front of the camera, and the engine adds a pathology: the gaze is dragged along with the head and comes back with saccades. The impulses, the noise and the rejections are those of the real test.',
  'sim.suerte.ayuda':
    'A random patient, blind —it may turn out healthy—. Examine and, with three impulses per side, answer three questions before revealing.',
  'sim.o': 'or choose the patient:',
  'sim.paciente': 'Patient',
  'sim.perfil.t': 'which pathology is added to the impulses',
  'sim.sano': 'healthy: measure the real thing',
  'sim.azar': 'a random one (blind)',
  'sim.ciego': 'blind: the screen does not say which one',
  'sim.revelar': 'Reveal',
  'sim.como': 'How to use it',
  'sim.como.lista': `
            <li><b>Choose the patient</b> —or a random one— and check <b>blind</b> if the examiner must not know.</li>
            <li><b>Turn on the camera and calibrate</b> with the classmate, as always.</li>
            <li><b>Deliver impulses.</b> The trace below already shows the pathology during the exam.</li>
            <li><b>Decide what it is</b> with the panels, the means, the asymmetry and the saccades.</li>
            <li><b>Reveal</b> and, with <b>See the real thing</b>, compare with what the classmate actually produced.</li>
          `,
  'sim.como.ayuda':
    'In the magnified eyes, the violet ring is where the simulated iris would be: the video is the real one and does not move with the pathology. Changing patient deletes the impulses already there.',
};

export const TEXTO = {
  // ── barra de estado ──
  'encender la cámara': 'turn on the camera',
  'pidiendo cámara…': 'requesting camera…',
  'cargando modelo…': 'loading model…',
  midiendo: 'measuring',
  'midiendo ({notas})': 'measuring ({notas})',
  'modelo en CPU: más lento': 'model on CPU: slower',
  'sin rVFC: timestamps peores': 'no rVFC: worse timestamps',
  'error: {msg}': 'error: {msg}',
  detenido: 'stopped',
  'calibración cancelada: se apagó la cámara': 'calibration cancelled: the camera was turned off',
  'encender la cámara antes de calibrar': 'turn on the camera before calibrating',
  'calibrando: fijar un punto y mover la cabeza LENTO, ±20°': 'calibrating: fixate a point and move the head SLOWLY, ±20°',
  'calibración fallida: casi no hubo muestras': 'calibration failed: there were almost no samples',
  'calibración RECHAZADA — {motivo}': 'calibration REJECTED — {motivo}',
  'calibrado: k={k} · residuo {res}°': 'calibrated: k={k} · residual {res}°',
  'calibrado: k={k} · residuo {res}° · k fuera del rango anatómico ({rango}): repetir':
    'calibrated: k={k} · residual {res}° · k outside the anatomical range ({rango}): repeat',
  '{n} pulsos recalculados con la configuración actual: tachado, lo de antes':
    '{n} impulses recomputed with the current settings: struck through, the previous values',
  'caso {caso}: {n} pulsos de un paciente sintético. ¿Qué patrón muestra?':
    'case {caso}: {n} impulses from a synthetic patient. What pattern does it show?',
  '{n} pulsos de ejemplo: paciente sintético, canal izquierdo con déficit':
    '{n} example impulses: synthetic patient, left canal with a deficit',
  'pulso #{id} descartado · Z para deshacer': 'impulse #{id} discarded · Z to undo',
  'pulso #{id} de vuelta': 'impulse #{id} restored',
  'k puesto a mano: la ganancia NO está calibrada': 'k set by hand: the gain is NOT calibrated',
  'volvió el k de antes (k={k})': 'the previous k is back (k={k})',
  'volvió el k de antes (k={k}): «Recalcular» para verlo en los pulsos':
    'the previous k is back (k={k}): «Recompute» to see it in the impulses',
  'perillas en sus valores por defecto': 'settings at their default values',
  'perillas en sus valores por defecto: «Recalcular» para aplicarlas a los pulsos':
    'settings at their default values: «Recompute» to apply them to the impulses',
  'pausado: medí en la traza de abajo (clic fija la referencia)':
    'paused: measure on the trace below (a click sets the reference)',
  'lo que el compañero dio de verdad: tachado, lo simulado':
    'what the classmate actually produced: struck through, the simulated values',
  'de vuelta a la simulación: tachado, lo real': 'back to the simulation: struck through, the real values',
  'paciente simulado apagado: se mide lo real': 'simulated patient off: measuring the real thing',
  'paciente simulado a ciegas: examinar y decidir qué tiene': 'blind simulated patient: examine and decide what it has',
  'paciente simulado: {nombre}': 'simulated patient: {nombre}',
  'el paciente simulado era: {nombre}': 'the simulated patient was: {nombre}',
  'preguntas bajadas: en Moodle, Banco de preguntas › Importar › formato GIFT':
    'questions downloaded: in Moodle, Question bank › Import › GIFT format',
  'no se pudo importar {archivo}: {msg}': 'could not import {archivo}: {msg}',
  '{n} pulsos importados de {archivo}: se van al encender la cámara o con «Borrar todos»':
    '{n} impulses imported from {archivo}: they go away when the camera is turned on or with «Delete all»',
  '{n} pulsos importados de {archivo} ({fallidos} sin muestras suficientes): se van al encender la cámara o con «Borrar todos»':
    '{n} impulses imported from {archivo} ({fallidos} without enough samples): they go away when the camera is turned on or with «Delete all»',

  // ── carga ──
  'Cargando el motor de visión…': 'Loading the vision engine…',
  'Descargando el modelo…': 'Downloading the model…',
  'Iniciando el modelo…': 'Starting the model…',
  '{a} de {b} MB': '{a} of {b} MB',

  // ── barra y botones ──
  'Encender cámara': 'Turn on camera',
  Detener: 'Stop',
  Pausar: 'Pause',
  Reanudar: 'Resume',
  Espacio: 'Space',
  'cámara {n}': 'camera {n}',
  sí: 'yes',
  no: 'no',
  'SIN CALIBRAR': 'NOT CALIBRATED',
  'CALIBRADO k={k}': 'CALIBRATED k={k}',
  'k A MANO={k}': 'MANUAL k={k}',
  'IMPORTADO k={k}': 'IMPORTED k={k}',
  'EJEMPLO k={k}': 'EXAMPLE k={k}',
  'sesión de {archivo}: la calibración es la del archivo': 'session from {archivo}: the calibration is the file’s',
  'Esta cámara puede entregar {fps} fps. trainHIT procesa como mucho {max}: es una herramienta didáctica, y el tope está puesto a propósito para que no se use como equipo médico.':
    'This camera can deliver {fps} fps. trainHIT processes at most {max}: it is a teaching tool, and the cap is there on purpose so that it is not used as a medical device.',
  'Se están procesando {fps} fps con el tope puesto en {max}: el tope no está funcionando en este dispositivo. Los pulsos salen marcados NO VALIDADO.':
    '{fps} fps are being processed with the cap set at {max}: the cap is not working on this device. Impulses are marked NOT VALIDATED.',
  'No están en su valor de fábrica: {lista}. «Valores por defecto» en Herramientas.':
    'Not at their factory value: {lista}. «Default values» in Tools.',
  'el contador no responde': 'the counter does not respond',
  'voto registrado en este navegador': 'vote recorded in this browser',

  // ── confirmaciones ──
  '¿Borrar los {n} pulsos?': 'Delete the {n} impulses?',
  'Los ejemplos reemplazan los {n} pulsos medidos. ¿Seguir?': 'The examples replace the {n} measured impulses. Continue?',
  'La sesión importada reemplaza los {n} pulsos medidos. ¿Seguir?':
    'The imported session replaces the {n} measured impulses. Continue?',
  'Cambiar el paciente borra los {n} pulsos medidos. ¿Seguir?': 'Changing the patient deletes the {n} measured impulses. Continue?',

  // ── lista de pulsos ──
  sim: 'sim',
  imp: 'imp',
  ej: 'ex',
  's/c': 'n/c',
  'paciente simulado: patología agregada a un pulso real': 'simulated patient: pathology added to a real impulse',
  'pulso importado de un CSV': 'impulse imported from a CSV',
  'pulso de ejemplo: paciente sintético': 'example impulse: synthetic patient',
  'medido sin calibrar: la ganancia incluye el paralaje': 'measured without calibration: the gain includes the parallax',
  'sacada encubierta': 'covert saccade',
  'sacada manifiesta': 'overt saccade',
  descartar: 'discard',
  'descartar el pulso {id}': 'discard impulse {id}',
  'área {area} · 60 ms {i60} · pico {pico}': 'area {area} · 60 ms {i60} · peak {pico}',
  'sacadas: {enc} encubiertas, {man} manifiestas · hasta la sacada ≈ {desac}':
    'saccades: {enc} covert, {man} overt · up to the saccade ≈ {desac}',
  'iris {iris} px · ojos {ojos} mm · hueco {hueco} ms': 'iris {iris} px · eyes {ojos} mm · gap {hueco} ms',
  'k {k} · derivador {win} ms grado {grado}': 'k {k} · differentiator {win} ms degree {grado}',
  'medido SIN calibrar': 'measured WITHOUT calibration',
  'pulso de EJEMPLO: paciente sintético': 'EXAMPLE impulse: synthetic patient',
  'antes de recalcular: {g} {est}': 'before recomputing: {g} {est}',
  '{n} aceptados · {m} rechazados': '{n} accepted · {m} rejected',
  antes: 'before',
  asimetría: 'asymmetry',

  // ── calibración ──
  '{t}/{dur}s · {n} muestras · rango {rango}°/{min}°': '{t}/{dur}s · {n} samples · range {rango}°/{min}°',
  '¡MÁS LENTO!': 'SLOWER!',
  'faltan {s} s · rango {rango}° de {min}°': '{s} s left · range {rango}° of {min}°',
  'k={k} · residuo {res}° · n={n}': 'k={k} · residual {res}° · n={n}',
  'sin calibrar': 'not calibrated',

  // ── traza y simulador ──
  'ojo (crudo)': 'eye (raw)',
  'ojo (invertido)': 'eye (inverted)',
  'Apagado: se mide lo real.': 'Off: measuring the real thing.',
  'Perfil oculto. Examiná, decidí qué tiene el paciente y después apretá Revelar.':
    'Hidden profile. Examine, decide what the patient has and then press Reveal.',
  'Ver lo real': 'See the real thing',
  'Ver lo simulado': 'See the simulation',
  'Paciente simulado, a ciegas: los pulsos llevan una patología agregada por el motor.':
    'Simulated patient, blind: the impulses carry a pathology added by the engine.',
  'Paciente simulado: {nombre}. Los pulsos llevan una patología agregada por el motor.':
    'Simulated patient: {nombre}. The impulses carry a pathology added by the engine.',
  'Mirá las dos medias por separado, la asimetría y los triángulos de sacadas: ¿de qué lado y cuándo corrigen?':
    'Look at the two means separately, the asymmetry and the saccade triangles: on which side and when do they correct?',

  // ── práctica: «Voy a tener suerte» ──
  'Voy a tener suerte': 'I’m feeling lucky',
  'Otro paciente al azar': 'Another random patient',
  'paciente al azar, a ciegas: examinar y, con {min} pulsos por lado, contestar':
    'random patient, blind: examine and, with {min} impulses per side, answer',
  '{n} de {total} correctas · era: {nombre}': '{n} of {total} correct · it was: {nombre}',
  '{n} de {total} correctas': '{n} of {total} correct',
  'Paciente al azar: puede tener una patología o ninguna. Examiná como siempre.':
    'Random patient: it may have a pathology or none. Examine as always.',
  'Aceptados: derecha {d}/{min} · izquierda {i}/{min}': 'Accepted: right {d}/{min} · left {i}/{min}',
  'Ya sé qué tiene': 'I know what it has',
  'Hacen falta {min} pulsos aceptados de cada lado.': '{min} accepted impulses are needed on each side.',
  Revelar: 'Reveal',
  '¿Qué lado está afectado?': 'Which side is affected?',
  'El derecho': 'The right',
  'El izquierdo': 'The left',
  'Los dos': 'Both',
  Ninguno: 'Neither',
  '¿Qué sacadas correctivas aparecen?': 'Which corrective saccades appear?',
  Ninguna: 'None',
  'Encubiertas: durante el giro': 'Covert: during the turn',
  'Manifiestas: después del giro': 'Overt: after the turn',
  'De los dos tipos': 'Both kinds',
  '¿Qué patrón muestra?': 'Which pattern does it show?',

  // ── gráficos ──
  cabeza: 'head',
  ojo: 'eye',
  ganancia: 'gain',
  'ganancia / °/s': 'gain / °/s',
  encubierta: 'covert',
  manifiesta: 'overt',
  'NO VALIDADO': 'NOT VALIDATED',
  SIMULADO: 'SIMULATED',
  'SIN SIMULAR': 'NOT SIMULATED',
  'sin pulsos': 'no impulses',
  'sin pulsos todavía': 'no impulses yet',
  'promedio de {n}': 'mean of {n}',

  // ── tutorial (el marco; los paseos van en tutorial-pasos-en.js) ──
  'Aprender a usar trainHIT': 'Learn to use trainHIT',
  'Paseos cortos, cada uno sobre un tema. Se hacen en cualquier orden; si es la primera vez, de arriba hacia abajo.':
    'Short tours, each on one topic. They can be taken in any order; if it is your first time, from top to bottom.',
  '✓ visto · {n} pasos': '✓ seen · {n} steps',
  '{n} pasos': '{n} steps',
  'listo ✓': 'done ✓',
  Terminar: 'Finish',
  Siguiente: 'Next',
  Saltar: 'Skip',
  respuestas: 'answers',
  'Sí.': 'Yes.',
  'No.': 'No.',
  'imagen pendiente · {img}': 'image pending · {img}',

  // ── importar ──
  'el archivo no trae la tabla de crudo (se exportó con una versión anterior): no se puede volver a calcular':
    'the file has no raw table (it was exported with an earlier version): it cannot be recomputed',
  'no parece un CSV de trainHIT': 'it does not look like a trainHIT CSV',

  // ── tablas de los módulos del motor (las revisa test/idioma.test.mjs) ──
  // RECHAZO_TEXT, analysis.js
  'CARA PERDIDA — quedarse en el encuadre': 'FACE LOST — stay in the frame',
  'IRIS MUY CHICO — acercarse a la cámara': 'IRIS TOO SMALL — move closer to the camera',
  'MUY LENTO — impulso más fuerte': 'TOO SLOW — stronger impulse',
  'MUY RÁPIDO': 'TOO FAST',
  'MUY CORTO': 'TOO SHORT',
  'MUY LARGO': 'TOO LONG',
  'REBOTE — la cabeza volvió sola': 'REBOUND — the head came back on its own',
  'SIN IMPULSO': 'NO IMPULSE',
  'PARPADEO en la ventana': 'BLINK in the window',
  'SIN GANANCIA MEDIBLE': 'NO MEASURABLE GAIN',
  // CALIB_ISSUE_TEXT, geom.js
  'Casi no se vio la cara. Mejorar la luz y permanecer en el encuadre.':
    'The face was barely seen. Improve the lighting and stay in the frame.',
  'La cabeza se movió poco. Se necesitan ±20° a cada lado.': 'The head moved too little. ±20° to each side is needed.',
  'La mirada no se quedó quieta. Fijar un punto y mover la cabeza MÁS LENTO.':
    'The gaze did not stay still. Fixate a point and move the head MORE SLOWLY.',
  'El ajuste cerró pero k da un disparate: no es paralaje lo que se midió.':
    'The fit converged but k is absurd: what was measured is not parallax.',
  // METODOS_GANANCIA, plots.js
  área: 'area',
  '60 ms': '60 ms',
  picos: 'peaks',
  'hasta la sacada ≈': 'up to the saccade ≈',
  // PERFILES, simulacion.js
  'Neuritis vestibular derecha': 'Right vestibular neuritis',
  'Neuritis vestibular izquierda': 'Left vestibular neuritis',
  'Déficit izquierdo compensado con sacadas encubiertas': 'Left deficit compensated with covert saccades',
  'Déficit derecho compensado con sacadas encubiertas': 'Right deficit compensated with covert saccades',
  'Vestibulopatía bilateral': 'Bilateral vestibulopathy',
  'Déficit del canal lateral derecho, agudo: ganancia baja y sacadas manifiestas que llegan tarde y a destiempo.':
    'Acute right lateral canal deficit: low gain and overt saccades that arrive late and scattered.',
  'Déficit del canal lateral izquierdo, agudo: ganancia baja y sacadas manifiestas que llegan tarde y a destiempo.':
    'Acute left lateral canal deficit: low gain and overt saccades that arrive late and scattered.',
  'Déficit izquierdo en el que el cerebro aprendió a corregir durante el giro: sacadas encubiertas, agrupadas y tempranas. La ganancia de área se lee normal: el falso negativo.':
    'Left deficit in which the brain learned to correct during the turn: covert saccades, clustered and early. The area gain reads normal: the false negative.',
  'Déficit derecho en el que el cerebro aprendió a corregir durante el giro: sacadas encubiertas, agrupadas y tempranas. La ganancia de área se lee normal: el falso negativo.':
    'Right deficit in which the brain learned to correct during the turn: covert saccades, clustered and early. The area gain reads normal: the false negative.',
  'Los dos canales laterales con ganancia baja y sacadas manifiestas en los dos lados. La asimetría queda cerca de cero.':
    'Both lateral canals with low gain and overt saccades on both sides. The asymmetry stays close to zero.',
  'Sin patología (control)': 'No pathology (control)',
  'Los dos canales laterales sanos: el motor no agregó nada. Las ganancias y las sacadas que se vieron son las del compañero.':
    'Both lateral canals healthy: the engine added nothing. The gains and saccades seen are the classmate’s own.',
};
