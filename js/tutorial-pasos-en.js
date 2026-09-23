// Los paseos del tutorial en inglés. Es una capa sobre tutorial-pasos.js: el
// español manda la estructura —ids, objetivos, esperas, acciones, casos— y acá
// solo va el texto, por id de paseo y de paso. `tutorialEn` (en
// tutorial-pasos.js) los junta.
//
// Un paso lleva lo mismo que su versión en español: `titulo`, `cuerpo` (con
// los mismos `data-accion`), `alt` si tiene imagen, y de la `pregunta` los
// textos (`explica`, `pista`, `sinRespuesta`). `img` solo cuando la imagen
// tiene texto adentro y hay una versión inglesa. test/idioma.test.mjs revisa
// que no falte ni sobre nada.

export const CONDICIONES = {
  cara: 'waiting for the camera and a face in the frame…',
  calibrado: 'waiting for an accepted calibration…',
  pulso: 'waiting for impulses: measured or example ones…',
  recalculado: 'waiting for «Recompute» to be pressed…',
};

export const PATRONES = {
  normal: 'Normal on both sides',
  'unilateral-der': 'Right-sided deficit',
  'unilateral-izq': 'Left-sided deficit',
  bilateral: 'Deficit on both sides',
  'encubierto-der': 'Normal gain, but with covert saccades on the right side',
  'encubierto-izq': 'Normal gain, but with covert saccades on the left side',
  'no-concluyente': 'No conclusion possible: the test has to be repeated',
};

export const PORTADA = {
  alt: 'An examiner standing behind a patient seated in front of a laptop, with their hands on the patient’s head.',
};

const HACEN_FALTA_PULSOS = {
  titulo: 'Impulses are needed',
  alt: 'A head drawn with dots, made of data, with three impulses coming out of it: a normal one, one with an overt saccade and one with a covert saccade.',
  cuerpo: `
    <p>This tour looks at impulses already measured. If there are none yet, you can load those of an
    <b>example patient</b>: synthetic, with a healthy right canal and a deficit on the left.</p>
    <p><button type="button" class="primario" data-accion="cargaEjemplos">Load example impulses</button></p>
    <p class="ayuda">The examples go through the same engine as a measured impulse, so the settings
    do the same to them. They replace the session, are marked <b>ex</b> and go away on their own when
    the camera is turned on or with <b>Delete all</b>.</p>`,
};

export const PASEOS = {
  // ────────────────────────────────────────────────────────── conceptos ──
  conceptos: {
    titulo: 'What a vHIT measures',
    resumen: 'The reflex, the impulse, the canals, the gain, the saccades and which patterns to look for. No camera.',
    pasos: {
      vor: {
        titulo: 'The vestibulo-ocular reflex',
        alt: 'Head seen from above turning to one side (blue arrow) and the eyes turning to the other (orange arrows), with the line of sight fixed on a target.',
        cuerpo: `
          <p>When the head turns, the semicircular canals of the inner ear detect it and move the eyes
          <b>the opposite way and at the same speed</b>. The gaze stays still on whatever was being
          looked at.</p>
          <p>It is one of the fastest reflexes in the body: the eye starts about 10 ms after the head.
          Without it, the world would jump with every step when walking.</p>
          <p class="ayuda">In trainHIT’s plots the head is always <b class="c-cabeza">blue</b> and the
          eye always <b class="c-ojo">orange</b>.</p>`,
      },
      impulso: {
        titulo: 'The head impulse',
        alt: 'Examiner behind the patient turning their head through a small, fast angle; the patient stares at a point straight ahead.',
        cuerpo: `
          <p>The examiner turns the patient’s head through a <b>small</b> (10–20°), <b>fast</b>
          (150–300 °/s) and <b>unpredictable</b> rotation, while the patient looks at a fixed point.</p>
          <p>If the canal on that side works, the eyes stay locked on the point. If not, they go along
          with the head and then jump back to the target: the <b>corrective saccade</b>.</p>
          <p class="ayuda">Each lateral canal is tested by turning toward its side: an impulse to the
          patient’s right tests the right canal.</p>`,
      },
      canales: {
        titulo: 'Six canals, three planes',
        alt: 'Head seen from above with the three planes: the lateral one as a blue turn around the head and the two vertical ones as dotted grey diagonals at 45°.',
        cuerpo: `
          <p>Each ear has three semicircular canals —lateral, anterior and posterior— and they work in
          pairs that share a plane: the two laterals; the left anterior with the right posterior (LARP);
          the right anterior with the left posterior (RALP).</p>
          <p>A turn in one plane excites one canal of the pair and inhibits the other. The impulse to
          the right mainly tests the <b>right lateral</b> canal.</p>
          <p class="ayuda">trainHIT only measures the <b>lateral</b> plane. The vertical ones are tested
          by turning the head diagonally and need the vertical movement of the eye, which the eyelid
          covers and the webcam measures poorly.</p>`,
      },
      ganancia: {
        titulo: 'The gain',
        img: 'ganancia.en.svg',
        alt: 'Two plots of velocity against time. On the left the eye curve overlaps the head curve; on the right it reaches only half.',
        cuerpo: `
          <p>The <b>gain</b> is how much the eye turned for every degree the head turned. At 1 the
          compensation is perfect; at 0.5 the eye did half the work.</p>
          <p>The panels draw the eye velocity <b>inverted</b>, so that with a normal reflex both curves
          overlap. What you read is the <b>gap</b> between them.</p>
          <p class="ayuda">trainHIT computes the gain with positions between the start and the end of
          the impulse, which is the same as the ratio of the areas under the two curves.</p>`,
      },
      sacadas: {
        titulo: 'Corrective saccades',
        img: 'sacadas.en.svg',
        alt: 'Plot with the head in blue, the eye in orange with low gain and two narrow peaks: one during the impulse and one after it.',
        cuerpo: `
          <p>When the reflex falls short, the eye corrects with a fast jump toward the target. If the
          jump happens <b>during</b> the turn it is <b>covert</b>: it cannot be seen with the naked eye.
          If it happens <b>after</b>, it is <b>overt</b>.</p>
          <p>A clinical vHIT separates them from the reflex before computing the gain (desaccading). The
          gain that <b>trainHIT reports is not desaccaded</b>: a covert saccade stays inside and raises
          it precisely in the patient with a deficit. The bias is toward the <b>false negative</b>.</p>
          <p class="ayuda">In the panels each saccade gets a triangle: <b class="c-covert">violet</b>
          for covert, <b class="c-overt">red</b> for overt.</p>`,
      },
      interpretar: {
        titulo: 'Which patterns to look for',
        img: 'patrones.en.svg',
        alt: 'Four pairs of plots, right and left: normal, unilateral deficit with a saccade, bilateral deficit and a covert saccade inside the impulse.',
        cuerpo: `
          <p>The result is read with both sides together, the gain <b>and</b> the saccades:</p>
          <ul>
            <li><b>Normal</b>: gains close to 1 on both sides, no saccades.</li>
            <li><b>Unilateral deficit</b>: one side low, with saccades on that side; the other normal.
            It is the pattern of vestibular neuritis.</li>
            <li><b>Bilateral deficit</b>: both sides low, with saccades on both.</li>
            <li><b>Saccades with normal gain</b>: they may be covert saccades hiding the deficit
            —this engine’s bias— or noise: look impulse by impulse.</li>
          </ul>
          <p class="ayuda">In acute vertigo, a <b>normal</b> impulse is not reassuring: it is one of the
          signs that raise suspicion of a central cause (HINTS protocol). These patterns are for
          learning to read, not for diagnosing with this page.</p>`,
      },
      limites: {
        titulo: 'What this is not',
        alt: 'On the left a head impulse with few samples on the peak, as at 30 fps; on the right a laptop with a medical cross crossed out in red on top.',
        cuerpo: `
          <p>trainHIT is for <b>learning</b> how the reflex is measured, not for diagnosing. A webcam at
          30 fps, without fixing the distance to the target and without desaccading, gives values for
          teaching.</p>
          <p>That is why processing is capped at 60 fps even if the camera delivers more: <b>it is not a
          medical device</b> and we do not want it used as one.</p>`,
      },
    },
  },

  // ──────────────────────────────────────────────────────── preparación ──
  preparacion: {
    titulo: 'Preparing the session',
    resumen: 'Camera, light, posture and where the examiner’s hands go.',
    pasos: {
      montaje: {
        titulo: 'Camera and light',
        alt: 'Patient seated in front of a laptop with the camera at eye level, an arm’s length away, with the light in front and no window behind.',
        cuerpo: `
          <ul>
            <li>Camera <b>at eye level</b> and the face straight on, centered.</li>
            <li>An arm’s length away: just enough for the <b>iris to look sharp</b> in the magnified
            eyes. Too far and the impulse is rejected as <i>IRIS TOO SMALL</i>.</li>
            <li>Light <b>from the front</b> or the side. Never a window behind the patient: the face
            falls into shadow and the model loses it.</li>
            <li>No glasses if possible: reflections cover the iris.</li>
          </ul>`,
      },
      postura: {
        titulo: 'Posture and target',
        alt: 'Side view: the patient’s head flexed about 30° downward, with the gaze on the camera.',
        cuerpo: `
          <p>The patient seated, with the head <b>flexed about 30° downward</b>: that way the lateral
          canal lies horizontal and is the one stimulated. The <b>tilt</b> reading shows it live.</p>
          <p>The target is <b>the camera itself</b>, or a dot stuck next to the lens. The parallax
          model assumes the target is at the camera: looking at something else changes the gain.</p>`,
      },
      manos: {
        titulo: 'The examiner’s hands',
        alt: 'Two frames. Right, with a green border: hands on the top of the head, face clear. Wrong, with a red border: fingers on the temples and eyebrows, covering the face.',
        cuerpo: `
          <p>The examiner stands <b>behind</b> and holds the head from above, with the hands away from
          the eyes, eyebrows and cheekbones. The model tracks the whole face: one finger over an
          eyebrow is enough to lose tracking.</p>
          <p class="ayuda">Alone, without an examiner, you can practice by turning your own head. It
          helps to learn the tool, but it does not measure the reflex: an active impulse is predictable
          and the brain anticipates it.</p>`,
      },
    },
  },

  // ─────────────────────────────────────────────────── primera medición ──
  primera: {
    titulo: 'The first measurement',
    resumen: 'With the camera on: calibrate, deliver impulses and read the result.',
    pasos: {
      camara: {
        titulo: 'Turn on the camera',
        cuerpo: `
          <p>Press <b>Turn on camera</b>. The first time the browser asks for permission and the
          tracking model is downloaded, a few MB; after that it stays stored.</p>
          <p>Continue when the bar says <b>face yes</b>. Everything is processed here: the video does
          not leave the computer.</p>`,
      },
      visor: {
        titulo: 'What the model sees',
        cuerpo: `
          <p>The dots on the face are what the model tracks, frame by frame. Below, both eyes magnified
          with the outline of the iris.</p>
          <p>If the iris does not look sharp in the magnified eyes, move closer to the camera or improve
          the light before continuing: everything else is computed from there.</p>`,
      },
      lecturas: {
        titulo: 'The readings',
        cuerpo: `
          <p>The live numbers. The ones that matter while setting up:</p>
          <ul>
            <li><b>iris</b>: the radius in pixels. Below the minimum the impulse is rejected.</li>
            <li><b>tilt</b>: the head flexion; aim for about 30°.</li>
            <li><b>blink</b>: a blink inside the impulse invalidates it.</li>
          </ul>
          <p class="ayuda">The rest is explained by hovering over each number, or in <b>What each
          number means</b>, below the readings.</p>`,
      },
      calibrar: {
        titulo: 'Calibrate the parallax',
        alt: 'Patient staring at a red dot while slowly turning the head from side to side, with an arc of ±20° drawn.',
        cuerpo: `
          <p>Press <b>Calibrate</b> (or <kbd>C</kbd>). A red dot appears at the top center, next to the
          camera —the same target as in the impulses—: the patient looks at it <b>without letting go</b>
          and turns the head <b>slowly</b> from side to side, ±20°, for 10 s.</p>
          <p>When the head turns, the iris shifts in the image even if the eye does not move, and that
          shift is as large as the signal. Without calibration, a perfect reflex reads ~1.9. If the
          calibration is rejected, the status bar says what to do differently.</p>`,
      },
      impulsos: {
        titulo: 'Delivering the impulses',
        alt: 'Head seen from above in two frames. Right, green border: a short, fast turn of about 15°. Wrong, red border: a wide, slow turn of more than 40°.',
        cuerpo: `
          <p>A <b>short, fast</b> turn to one side, and the head stays still there. Go back slowly to
          the center, wait, and the next one toward a side the patient cannot guess.</p>
          <p>In the live trace each impulse is a <b class="c-cabeza">blue</b> peak; the
          <b class="c-ojo">orange</b> one is the eye, inverted. With a normal reflex they cover each
          other.</p>`,
      },
      paneles: {
        titulo: 'One panel per side',
        cuerpo: `
          <p>Each impulse lands in the panel of its side. <b>Right and left are the patient’s</b>, not
          the screen’s.</p>
          <p>At the top of each panel, all the impulses overlaid; below, the mean gain ± SD and the
          count of accepted ones. The mean shows green or red against the 0.80 cutoff, which comes from
          devices that do desaccade: it is not the cutoff for this number. Without calibration it
          stays grey.</p>`,
      },
      lista: {
        titulo: 'Accepted and rejected',
        cuerpo: `
          <p>One impulse per row: peak, duration, gain and status. <b>✕</b> discards it, and
          <kbd>D</kbd> discards the last one; <kbd>Z</kbd> brings it back. An impulse measured without
          calibration is marked <b>n/c</b> and with its gain struck through.</p>
          <p>A rejected one says why: <i>TOO SLOW</i> asks for a stronger impulse, <i>BLINK</i> to repeat
          it with the eyes open, <i>FACE LOST</i> to stay in the frame. Rejected impulses do not enter
          the mean.</p>`,
      },
      csv: {
        titulo: 'Taking the data with you',
        cuerpo: `
          <p><b>Export CSV</b> downloads a file with the session tables: one impulse per row, with its
          gain and the settings it was computed with; one sample per row, to redo the computation in a
          spreadsheet; and the raw frames.</p>
          <p><b>Import CSV</b> opens that file on another computer or another day and recomputes each
          impulse from the raw data: it is for sharing a measured case so everyone can look at it with
          their own settings.</p>
          <p class="ayuda">Next: <b>Reading the plots</b> and <b>Inside the tools</b>, in the tours
          menu.</p>`,
      },
    },
  },

  // ─────────────────────────────────────────────────── leer los gráficos ──
  graficos: {
    titulo: 'Reading the plots',
    resumen: 'The ruler on the plot, the rejected impulses, the marked saccades, the mean curve and the orientation.',
    pasos: {
      pulsos: HACEN_FALTA_PULSOS,
      regla: {
        titulo: 'The plot is a ruler',
        cuerpo: `
          <p>Move the pointer over a panel: the vertical line marks the instant and the label gives the
          head and eye velocity there.</p>
          <p>A <b>click</b> sets a reference. Moving from there you get Δt, the jump of each curve, the
          <b>area</b> of each one over the span —shaded— and the <b>gain of the span</b>, which is the
          ratio of the two areas. Another click releases it.</p>
          <p class="ayuda">With a finger: one tap places the cursor, another sets the reference and
          dragging sideways measures.</p>
          <p class="ayuda">Try measuring only the rise of the impulse and then the whole impulse: the
          gain changes with the span, and the engine uses only one.</p>`,
      },
      seleccion: {
        titulo: 'Looking at a single impulse',
        cuerpo: `
          <p>A click on a row <b>highlights</b> that impulse in the panel. Hovering over the row shows
          its other gains (at 60 ms, at the peak) and the settings it was computed with.</p>
          <p>If the impulse is rejected, a dotted red box with the reason appears over the impulse span.
          With the examples, the right side has a slow one and one with a blink.</p>`,
      },
      'marcas-sacadas': {
        titulo: 'The saccades, marked',
        cuerpo: `
          <p>Each saccade gets a triangle over its peak: <b class="c-covert">violet</b> if it started
          while the head was still turning (covert), <b class="c-overt">red</b> if it came after
          (overt). In the list, the triangle column says the same per impulse.</p>
          <p>With the examples, the left side has both kinds. Pick an impulse with a violet one and hover
          over its row: <b>up to the saccade ≈</b> is the gain cut before the saccade, and it is usually
          quite a bit lower than the reported one.</p>
          <p class="ayuda">The mark confirms what you see in the curve, it does not replace it. At 30 fps
          a saccade is one or two frames; turn it off in Tools, «Mark saccades».</p>`,
      },
      asimetria: {
        titulo: 'The asymmetry',
        cuerpo: `
          <p>It compares the mean gains of the two sides:
          <b>(right − left) / (right + left)</b>, in %. Zero is symmetric; the sign tells on which side
          the deficit is.</p>
          <p>With the examples it comes out positive: the left is the weak one. But look at the left
          impulses one by one: some read normal because a covert saccade hid the deficit.</p>`,
      },
      promedio: {
        titulo: 'The mean curve',
        cuerpo: `
          <p>Turn on <b>Mean curve per side</b>: each panel adds the mean of its accepted impulses,
          thicker. The tracking noise goes away and the shape remains.</p>
          <p class="ayuda">The impulses do not share instants —each one triggered on a different
          frame—, so they are averaged by interpolating onto a common grid. Rejected ones are left
          out.</p>`,
      },
      suavizar: {
        titulo: 'Smoothing',
        cuerpo: `
          <p>Smoothing joins the samples with a curve instead of straight lines. It is a
          <b>monotone</b> interpolation: it never draws a peak higher than the one measured.</p>
          <p>Even so it makes a 30 fps signal <b>look</b> more precise. That is why, while it is on, the
          dots mark the real samples. Turn it off and see how many samples an impulse really has.</p>`,
      },
      orientacion: {
        titulo: 'Panel orientation',
        cuerpo: `
          <p><b>Compare sides</b> (default): both panels with the impulse pointing up and the eye
          inverted, so that with a normal reflex the curves cover each other.</p>
          <p><b>Real direction</b>: each impulse toward its side —right up, left down— and the eye raw,
          that is opposite to the head, because the reflex compensates. It is the same thing, drawn as
          it happens.</p>`,
      },
      pausa: {
        titulo: 'Freezing the live trace',
        cuerpo: `
          <p>The trace below moves, so to measure it you have to freeze it: <b>Pause</b> or
          <kbd>Space</kbd>. The camera stays on; what stops is the analysis.</p>
          <p>Frozen, the ruler works just like in the panels.</p>`,
      },
    },
  },

  // ─────────────────────────────────────────────────────── casos a ciegas ──
  casos: {
    titulo: 'Blind cases',
    resumen: 'Five synthetic patients with no diagnosis: look at the panels and say which pattern you see.',
    pasos: {
      'como-leer': {
        titulo: 'How to read a case',
        alt: 'Two panels like the app’s: on the left the head and eye curves overlapping; on the right the eye far from the head and a saccade with its red triangle, seen through a magnifying glass.',
        cuerpo: `
          <p>Each case loads the impulses of a synthetic patient, with a letter and without saying what
          it has. Look at both panels and answer <b>before</b> it is told.</p>
          <ul>
            <li>The <b>mean ± SD</b> of each side and how many impulses were accepted.</li>
            <li>The <b>asymmetry</b>, at the bottom right of the live trace.</li>
            <li>The <b>shape</b> of the orange curves: a narrow peak that breaks away from the blue one is
            a saccade. During the impulse, covert; after it, overt.</li>
            <li>How many impulses were <b>rejected</b>, and why.</li>
          </ul>
          <p class="ayuda">The cases replace the session, like the example impulses. The mean curve (in
          Tools) helps to see the shape.</p>`,
      },
      'caso-a': {
        titulo: 'Case A',
        cuerpo: `
          <p><button type="button" class="primario" data-accion="cargaCaso" data-arg="A">Load case A</button></p>
          <p>Which pattern does it show?</p>`,
        pregunta: {
          explica: `Both means close to 1, almost zero asymmetry and the orange curves covering the blue
            ones, with no peaks breaking away. It is the pattern everything else is compared against.`,
          pista: 'Look at the two means and whether any orange curve breaks away from the blue one.',
        },
      },
      'caso-b': {
        titulo: 'Case B',
        cuerpo: `
          <p><button type="button" class="primario" data-accion="cargaCaso" data-arg="B">Load case B</button></p>
          <p>Which pattern does it show?</p>`,
        pregunta: {
          explica: `The right gives ~0.5 and the left ~1; the asymmetry comes out negative, on the right
            side. After each impulse to the right there is an orange peak: the overt saccade that brings
            the gaze back. It is the pattern of a right vestibular neuritis.`,
          pista: 'Compare the two means: which side is far from 1? Look also at the sign of the asymmetry.',
        },
      },
      'caso-c': {
        titulo: 'Case C',
        cuerpo: `
          <p><button type="button" class="primario" data-accion="cargaCaso" data-arg="C">Load case C</button></p>
          <p>Which pattern does it show?</p>`,
        pregunta: {
          explica: `Both sides low, with overt saccades on both, and the asymmetry almost at zero.
            <b>A normal asymmetry is not a normal result</b>: it compares the sides with each other, and
            here both fail alike.`,
          pista: 'The asymmetry alone is misleading: look at each mean separately.',
        },
      },
      'caso-d': {
        titulo: 'Case D',
        cuerpo: `
          <p><button type="button" class="primario" data-accion="cargaCaso" data-arg="D">Load case D</button></p>
          <p>Which pattern does it show? Do not settle for the number: pick an impulse from each side and look at it.</p>`,
        pregunta: {
          explica: `Both means come out normal —the left even goes above 1—, but in each impulse to the
            left the orange curve breaks away with a narrow peak <b>during</b> the turn, with its violet
            triangle. The left reflex falls short and a covert saccade corrects it in time. Since the
            reported gain is not desaccaded, the saccade gets in and inflates it: it is the
            <b>false negative</b>. In Tools, the <b>up to the saccade ≈</b> row of the methods table
            brings the left down to ~0.5.`,
          pista: 'The means are not enough. Select an impulse on the left side and look at the orange curve during the impulse: are there violet triangles?',
        },
      },
      'caso-e': {
        titulo: 'Case E',
        cuerpo: `
          <p><button type="button" class="primario" data-accion="cargaCaso" data-arg="E">Load case E</button></p>
          <p>Which pattern does it show?</p>`,
        pregunta: {
          explica: `Almost everything was rejected: slow impulses, the head bouncing back on its own, the
            face covered by the hands, blinks. With one or no accepted impulse per side there is no mean
            to read. The right thing is to fix the technique and repeat, not to interpret.`,
          pista: 'Look at how many impulses were accepted on each side, and the reasons for the rejected ones.',
        },
      },
      cierre: {
        titulo: 'What the cases leave behind',
        alt: 'Three cards, each with a green tick: two bars against a dotted cutoff line, a curve with a saccade marked in violet, and a list of impulses almost all with a red cross.',
        cuerpo: `
          <ul>
            <li>Read the <b>mean of each side</b>, not only the asymmetry (case C).</li>
            <li>Look at the <b>curves</b>, not only the numbers: a covert saccade can leave normal a gain
            that is not (case D).</li>
            <li>Without enough accepted impulses <b>there is no conclusion</b> (case E).</li>
          </ul>
          <p class="ayuda">The cases can be reloaded from here whenever you want. For teachers:
          <button type="button" data-accion="exportaGift">questions for Moodle (GIFT)</button>, with
          these cases and the ideas of the tours.</p>`,
      },
    },
  },

  // ──────────────────────────────────────────────────── paciente simulado ──
  simulado: {
    titulo: 'Simulated patient',
    resumen: 'In pairs: a healthy classmate, a pathology added by the engine, and finding out which one it is.',
    pasos: {
      'que-es': {
        titulo: 'Examining a patient who does not exist',
        alt: 'A healthy person seen from the front; their magnified eye shows the real iris in orange at the center and a violet ring shifted to one side: where the iris would be with the simulated pathology.',
        cuerpo: `
          <p>A healthy classmate sits in front of the camera. The engine adds a pathology to each
          impulse: the gaze is dragged along with the head by whatever the reflex does not compensate,
          and saccades bring it back.</p>
          <p>The impulses are real —the speed, the bounces and the hands on the face are yours—, so you
          practice <b>examining and reading at the same time</b>.</p>
          <p class="ayuda">It never passes for a real measurement: the bar says <b>SIMULATED</b>, the
          impulses are marked <b>sim</b> and the plots carry the watermark. Everything is handled from
          the <b>Simulator</b> button in the bar.</p>`,
      },
      elegir: {
        titulo: 'Choosing the patient',
        cuerpo: `
          <p>The <b>Simulator</b> button in the bar (or <kbd>S</kbd>) opens this drawer. Whoever plays
          the teacher chooses the profile, or <b>a random one</b>, and checks <b>blind</b>: the selector
          hides and the screen does not say which one it is.</p>
          <p class="ayuda">Changing patient deletes the impulses already there: mixing two patients
          would give a mean that belongs to nobody.</p>`,
      },
      examinar: {
        titulo: 'Examining',
        cuerpo: `
          <p>Turn on the camera, calibrate and deliver impulses as always. The trace below already
          shows the pathology while you examine.</p>
          <p>In the magnified eyes, the <b>violet ring</b> is where the simulated iris would be: the
          video is the real one and does not move.</p>
          <p class="ayuda">At least three accepted impulses per side are needed to say anything.</p>`,
      },
      decidir: {
        titulo: 'What does it have?',
        cuerpo: `<p>With the panels, the means, the asymmetry and the saccades: which pattern does your
          patient show?</p>`,
        pregunta: {
          sinRespuesta: 'There is no simulated patient: choose one with the Simulator button in the bar.',
        },
      },
      revelar: {
        titulo: 'Reveal and compare',
        cuerpo: `
          <p><button type="button" data-accion="revelaSimulacion">Reveal</button> says which profile it
          was. Then, <b>See the real thing</b> recomputes each impulse without the pathology: what your
          classmate actually produced, with the simulated values struck through next to it.</p>
          <p class="ayuda">If a real impulse was rejected, the simulated one was too: the technique is the
          same. That is assessed as well.</p>`,
      },
    },
  },

  // ────────────────────────────────────────────── herramientas por dentro ──
  herramientas: {
    titulo: 'Inside the tools',
    resumen: 'The parallax line, the last impulse, the gain cloud, the computation methods and the manual k.',
    pasos: {
      pulsos: HACEN_FALTA_PULSOS,
      cajon: {
        titulo: 'The tools drawer',
        cuerpo: `
          <p><b>Tools</b> (or <kbd>H</kbd>) opens the drawer with every step of the computation in plain
          sight. Nothing in it is needed to measure: it is there to understand why the result is what
          it is.</p>`,
      },
      paralaje: {
        titulo: 'The parallax line',
        cuerpo: `
          <p>Each dot is a calibration frame: the iris shift against the sine of the head turn. If the
          patient fixated well, they fall on a <b>line</b> and its slope is −k. Seeing the line is the
          proof that what was measured is parallax and not the gaze wandering.</p>
          <p class="ayuda">With the examples you see the synthetic patient’s calibration, k = 0.95. With
          the camera, that of whoever calibrated.</p>`,
      },
      ultimo: {
        titulo: 'The last impulse',
        cuerpo: `
          <p>The selected impulse —or the last one— alone, in large. The shading is the <b>impulse
          window</b>: the span between the start and the end, which is where the gain is computed. The
          dotted lines are the thresholds that bound it.</p>
          <p>Pick another impulse in the list and watch the window move.</p>`,
      },
      nube: {
        titulo: 'Gain against peak',
        cuerpo: `
          <p>One dot per impulse: the peak head velocity against the gain. Blue the right side, violet
          the left; the rejected ones, faded. The green band is the accepted peak range and the dotted
          line, the 0.80 cutoff.</p>
          <p>A healthy reflex gives a <b>flat, tight</b> cloud: the gain does not depend on how strong
          the impulse was. A scattered cloud is a reason to distrust that side.</p>`,
      },
      metodos: {
        titulo: 'Three ways to compute the gain',
        cuerpo: `
          <p>The same impulse allows several computations. <b>Area</b>: how much the eye turned over how
          much the head turned during the whole impulse; it is the one reported. <b>60 ms</b>: the
          ratio of velocities at a single instant. <b>Peaks</b>: the eye’s maximum over the head’s
          maximum, even if they do not happen at the same time.</p>
          <p>Change the <b>method</b> and look at the table: with the same impulses, the means and the
          asymmetry change. That is why a gain without its method cannot be compared with another.</p>
          <p class="ayuda">Zamaro et al., 2020: the computation methods are not interchangeable. And at
          30 fps the 60 ms one rests on two frames.</p>`,
      },
      como: {
        titulo: 'How it measures, and what it does not',
        cuerpo: `
          <p>The five decisions of the engine in one list —the iris as a ruler, the spherical angle, the
          head by increments, the derivative and the gain by positions— and, below, what the method does
          not do.</p>
          <p>Further down, the references: where each number comes from.</p>`,
      },
      kmanual: {
        titulo: 'Manual k',
        cuerpo: `
          <p>The experiment that explains the calibration: set the slider to <b>0</b>, check
          <b>use this k</b> and press <b>Recompute</b> further down.</p>
          <p>The gains of the healthy side go to ~1.9. Nobody has a reflex of 1.9: it is the uncorrected
          parallax, which is the same size as the signal.</p>
          <p class="ayuda">It comes at the end of the tour on purpose: with k = 0 everything else reads
          wrong. When the tour ends the calibrated k comes back on its own; you can also do it now:
          <button type="button" data-accion="restauraK">back to the calibrated k</button>.</p>`,
      },
    },
  },

  // ───────────────────────────────────────────────────────── las perillas ──
  perillas: {
    titulo: 'The engine settings',
    resumen: 'What each setting does, tried on impulses already measured.',
    pasos: {
      pulsos: HACEN_FALTA_PULSOS,
      idea: {
        titulo: 'Change and recompute',
        cuerpo: `
          <p>A new setting applies to the <b>following</b> impulses. Each impulse keeps its raw samples,
          so <b>Recompute</b> reruns the whole engine on the impulses already there, with the current
          settings.</p>
          <p>The method of this tour: move <b>one</b> setting, recompute, look at what changed, and put
          it back. After recomputing, the previous gain stays <s>struck through</s> next to the new one,
          the panels show the previous mean and in the gain cloud each old dot stays joined to the new
          one.</p>
          <p class="ayuda">While any setting is not at its factory value, the top bar says
          <b>SETTINGS CHANGED</b>: impulses measured that way are not comparable with others.</p>`,
      },
      ventana: {
        titulo: 'Differentiator window',
        cuerpo: `
          <p>Velocity comes from fitting a parabola to the samples in this window. Wider, less noise but
          the peak <b>flattens</b>.</p>
          <p>Try <b>200 ms</b> and recompute: the peaks drop and several impulses become
          <i>TOO SLOW</i>. The head did not change; how it is measured did.</p>`,
      },
      grado: {
        titulo: 'Fit degree',
        cuerpo: `
          <p>Degree 1 fits a straight line: with the window around the peak, it averages the rise with
          the fall and flattens exactly the value you want to measure. Degree 2 follows the curvature;
          degree 3 follows the noise too.</p>
          <p>Try it with the window at 50 and at 100 ms. At 30 fps few samples fit in the window, and at
          50 ms degree 1 can give <b>higher</b> peaks, not lower: the theory assumes plenty of samples.
          That is why it is better to try than to believe.</p>`,
      },
      umbrales: {
        titulo: 'Start and end thresholds',
        cuerpo: `
          <p>The impulse starts when the head passes the <b>start threshold</b> and ends when it drops
          below the <b>end threshold</b>, which is lower so that noise does not cut it short.</p>
          <p>Those two points are the impulse window, and the gain is computed between them. Move them
          and watch in <b>Last impulse</b> how the shading changes, and the gain with it.</p>`,
      },
      aceptacion: {
        titulo: 'Peak and duration',
        cuerpo: `
          <p>Minimum and maximum peak, minimum and maximum duration: the criteria to <b>accept</b> an
          impulse. They do not change any gain; they decide which ones enter the mean.</p>
          <p>Lower the minimum peak to 80 and recompute: the slow impulse of the examples becomes
          accepted and enters the mean. Loosening a criterion is that easy.</p>`,
      },
      parpadeo: {
        titulo: 'Blink',
        cuerpo: `
          <p>How closed the eye has to be (0 open, 1 closed) to mark the sample as a blink. A blink
          inside the impulse rejects it: with the eye closed there is no iris.</p>
          <p>Try raising it to <b>0.90</b> and recompute: the impulse with a blink in the examples
          becomes accepted, with a gain computed with the eye closed. A loose threshold does not reject
          fewer blinks: it accepts measurements without an iris.</p>`,
      },
      iris: {
        titulo: 'Minimum iris',
        cuerpo: `
          <p>The iris radius in pixels below which the impulse is rejected. With a small iris —patient
          far away, low-resolution camera— one pixel of error is many degrees, and the gain stops
          meaning anything.</p>`,
      },
      recalcular: {
        titulo: 'Recompute',
        cuerpo: `
          <p>Move some setting and press <b>Recompute</b>. The numbers in the list become those of the
          current settings, and the CSV records which ones they were.</p>
          <p>To leave everything as it came: <button type="button" data-accion="restauraPerillas">default
          values and recompute</button>. The same button is at the foot of the settings.</p>`,
      },
    },
  },
};
