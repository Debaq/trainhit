// Los paseos del tutorial. Datos puros, sin DOM: el mecanismo está en
// tutorial.js y los tests (test/tutorial.test.mjs) leen esto directo.
//
// Un paseo es un recorrido corto sobre un tema. Se eligen desde el menú
// «Aprender a usar» y se hacen en cualquier orden: quien ya mide y quiere
// entender las perillas no tiene por qué pasar por la cámara y la luz.
//
// Cada paso tiene:
//   id        único dentro de su paseo.
//   titulo, cuerpo   el cuerpo es HTML propio, nunca datos de afuera. Un
//             `<button data-accion="…">` adentro dispara esa acción (ACCIONES).
//   img       opcional, archivo de img/tutorial/. Si todavía no existe se ve
//             un recuadro con el nombre: el tutorial anda antes que las
//             imágenes. Las que faltan tienen su prompt en img/tutorial/PROMPTS.md.
//   alt       texto alternativo de la imagen: lo que la imagen TIENE que
//             mostrar, así que sirve también para revisar la que llegue.
//   objetivo  opcional, selector de la parte de la pantalla que se señala. Sin
//             objetivo el paso es una tarjeta al centro con el fondo tapado;
//             con objetivo, la página sigue usable y se ilumina ese lugar.
//   lugar     opcional, dónde se prefiere la tarjeta respecto del objetivo
//             ('izquierda' para lo que está en el cajón de la derecha).
//   espera    opcional, condición que el paso pide cumplir antes de seguir
//             (ver CONDICIONES). Nunca traba: «Saltar» sigue a mano.
//   antes     opcional, acción de la interfaz al entrar al paso.
//   pregunta  opcional, `{ caso, correcta, explica, pista }`: opción múltiple
//             sobre PATRONES. `correcta` es un patrón; `explica` se muestra al
//             acertar y `pista` al errar. Con `caso`, test/tutorial.test.mjs
//             comprueba que ese caso de ejemplo.js muestre de verdad ese patrón.
//             Con `dinamica` (una de RESPUESTAS) la respuesta sale del estado
//             al contestar, y `sinRespuesta` es lo que se dice si no hay.
//
// Un paseo puede tener `alSalir`: una acción que corre cuando se lo deja por
// cualquier camino —terminado, al menú o cerrando—. Es para lo que el paseo
// rompe a propósito y no puede quedar roto después (el k a mano en 0).

/** Lo que un paso puede esperar, con el texto de mientras tanto. */
export const CONDICIONES = {
  cara: 'esperando la cámara y una cara en el encuadre…',
  calibrado: 'esperando una calibración aceptada…',
  pulso: 'esperando pulsos: medidos o de ejemplo…',
  recalculado: 'esperando que se apriete «Recalcular»…',
};

/** Lo que un paso (o un botón de su cuerpo) puede pedirle a la interfaz. */
export const ACCIONES = ['abreHerramientas', 'cierraHerramientas', 'cargaEjemplos', 'cargaCaso', 'exportaGift', 'restauraK', 'restauraPerillas', 'revelaSimulacion'];

/** Preguntas cuya respuesta la da el estado y no el paso: el paciente simulado. */
export const RESPUESTAS = ['simulacion'];

/**
 * Las respuestas posibles de «Casos a ciegas», las mismas en todos: si cada
 * caso trajera solo las suyas, la lista delataría la respuesta.
 */
export const PATRONES = {
  normal: 'Normal en los dos lados',
  'unilateral-der': 'Déficit del lado derecho',
  'unilateral-izq': 'Déficit del lado izquierdo',
  bilateral: 'Déficit de los dos lados',
  'encubierto-der': 'Ganancia normal, pero con sacadas encubiertas del lado derecho',
  'encubierto-izq': 'Ganancia normal, pero con sacadas encubiertas del lado izquierdo',
  'no-concluyente': 'No se puede concluir: hay que repetir la prueba',
};

/** Lugares posibles de la tarjeta respecto del objetivo. */
export const LUGARES = ['abajo', 'arriba', 'derecha', 'izquierda'];

/**
 * Los paseos de leer pulsos empiezan acá: sin pulsos no hay nada que mirar,
 * y no todo el mundo tiene a alguien a mano para darle impulsos.
 */
const HACEN_FALTA_PULSOS = {
  id: 'pulsos',
  titulo: 'Hacen falta pulsos',
  espera: 'pulso',
  cuerpo: `
    <p>Este paseo mira pulsos ya medidos. Si todavía no hay, se pueden cargar los de un
    <b>paciente de ejemplo</b>: sintético, con el canal derecho sano y el izquierdo con déficit.</p>
    <p><button type="button" class="primario" data-accion="cargaEjemplos">Cargar pulsos de ejemplo</button></p>
    <p class="ayuda">Los ejemplos pasan por el mismo motor que un pulso medido, así que las perillas
    les hacen lo mismo. Reemplazan la sesión, salen marcados <b>ej</b> y se van solos al encender
    la cámara o con <b>Borrar todos</b>.</p>`,
};

export const PASEOS = [
  // ────────────────────────────────────────────────────────── conceptos ──
  {
    id: 'conceptos',
    titulo: 'Qué mide un vHIT',
    resumen: 'El reflejo, el impulso, los canales, la ganancia, las sacadas y qué patrones se buscan. Sin cámara.',
    pasos: [
      {
        id: 'vor',
        titulo: 'El reflejo vestíbulo-ocular',
        img: 'vor.svg',
        alt: 'Cabeza vista desde arriba girando hacia un lado (flecha azul) y los ojos girando hacia el otro (flechas naranjas), con la línea de mirada fija sobre un blanco.',
        cuerpo: `
          <p>Cuando la cabeza gira, los canales semicirculares del oído interno lo detectan y mueven
          los ojos <b>al revés y a la misma velocidad</b>. La mirada se queda quieta sobre lo que se
          estaba mirando.</p>
          <p>Es de los reflejos más rápidos del cuerpo: el ojo arranca unos 10 ms después que la
          cabeza. Sin él, al caminar el mundo saltaría con cada paso.</p>
          <p class="ayuda">En los gráficos de trainHIT la cabeza es siempre <b class="c-cabeza">azul</b>
          y el ojo siempre <b class="c-ojo">naranja</b>.</p>`,
      },
      {
        id: 'impulso',
        titulo: 'El impulso cefálico',
        img: 'impulso.svg',
        alt: 'Examinador detrás del paciente girando su cabeza un ángulo chico y rápido; el paciente mira fijo un punto al frente.',
        cuerpo: `
          <p>El examinador gira la cabeza del paciente un giro <b>chico</b> (10–20°), <b>rápido</b>
          (150–300 °/s) e <b>impredecible</b>, mientras el paciente mira un punto fijo.</p>
          <p>Si el canal de ese lado funciona, los ojos se quedan clavados en el punto. Si no, se van
          con la cabeza y después vuelven al blanco con un salto: la <b>sacada correctiva</b>.</p>
          <p class="ayuda">Cada canal lateral se prueba girando hacia su lado: un impulso hacia la
          derecha del paciente prueba el canal derecho.</p>`,
      },
      {
        id: 'canales',
        titulo: 'Seis canales, tres planos',
        cuerpo: `
          <p>Cada oído tiene tres canales semicirculares —lateral, anterior y posterior—, y trabajan
          en pares que comparten plano: los dos laterales; el anterior izquierdo con el posterior
          derecho (LARP); el anterior derecho con el posterior izquierdo (RALP).</p>
          <p>Un giro en un plano excita un canal del par e inhibe al otro. El impulso hacia la derecha
          prueba sobre todo el <b>lateral derecho</b>.</p>
          <p class="ayuda">trainHIT solo mide el plano <b>lateral</b>. Los verticales se prueban
          girando la cabeza en diagonal y necesitan el movimiento vertical del ojo, que el párpado
          tapa y la webcam mide mal.</p>`,
      },
      {
        id: 'ganancia',
        titulo: 'La ganancia',
        img: 'ganancia.svg',
        alt: 'Dos gráficos de velocidad contra tiempo. A la izquierda la curva del ojo se superpone con la de cabeza; a la derecha llega a la mitad.',
        cuerpo: `
          <p>La <b>ganancia</b> es cuánto giró el ojo por cada grado que giró la cabeza. Con 1 la
          compensación es perfecta; con 0,5 el ojo hizo la mitad del trabajo.</p>
          <p>Los paneles dibujan la velocidad del ojo <b>invertida</b>, para que con un reflejo normal
          las dos curvas se superpongan. Lo que se lee es la <b>separación</b> entre ellas.</p>
          <p class="ayuda">trainHIT calcula la ganancia con posiciones entre el inicio y el fin del
          impulso, que es lo mismo que el cociente de las áreas bajo las dos curvas.</p>`,
      },
      {
        id: 'sacadas',
        titulo: 'Sacadas correctivas',
        img: 'sacadas.svg',
        alt: 'Gráfico con la cabeza en azul, el ojo en naranja con ganancia baja y dos picos angostos: uno durante el impulso y otro después.',
        cuerpo: `
          <p>Cuando el reflejo no alcanza, el ojo corrige con un salto rápido hacia el blanco. Si el
          salto ocurre <b>durante</b> el giro es <b>encubierta</b>: a simple vista no se ve. Si ocurre
          <b>después</b> es <b>manifiesta</b>.</p>
          <p>Un vHIT clínico las separa del reflejo antes de calcular la ganancia (desacadizar). La
          ganancia que <b>reporta trainHIT no desacadiza</b>: una sacada encubierta queda dentro y la
          sube justo en el paciente con déficit. El sesgo es hacia el <b>falso negativo</b>.</p>
          <p class="ayuda">En los paneles cada sacada lleva un triángulo: <b class="c-covert">violeta</b>
          la encubierta, <b class="c-overt">rojo</b> la manifiesta.</p>`,
      },
      {
        id: 'interpretar',
        titulo: 'Qué patrones se buscan',
        cuerpo: `
          <p>El resultado se lee con los dos lados juntos, la ganancia <b>y</b> las sacadas:</p>
          <ul>
            <li><b>Normal</b>: ganancias cerca de 1 en los dos lados, sin sacadas.</li>
            <li><b>Déficit unilateral</b>: un lado bajo, con sacadas de ese lado; el otro normal. Es
            el patrón de una neuritis vestibular.</li>
            <li><b>Déficit bilateral</b>: los dos lados bajos, con sacadas en los dos.</li>
            <li><b>Sacadas con ganancia normal</b>: pueden ser encubiertas que tapan el déficit
            —el sesgo de este motor— o ruido: se miran pulso por pulso.</li>
          </ul>
          <p class="ayuda">En un vértigo agudo, un impulso <b>normal</b> no tranquiliza: es uno de los
          signos que hacen sospechar una causa central (protocolo HINTS). Estos patrones son para
          aprender a leer, no para diagnosticar con esta página.</p>`,
      },
      {
        id: 'limites',
        titulo: 'Lo que esto no es',
        cuerpo: `
          <p>trainHIT es para <b>aprender</b> cómo se mide el reflejo, no para diagnosticar. Una webcam
          a 30 fps, sin fijar la distancia al blanco y sin desacadizar, da valores didácticos.</p>
          <p>Por eso se procesa como mucho a 60 fps aunque la cámara dé más: <b>no es un equipo
          médico</b> y no queremos que se use como tal.</p>`,
      },
    ],
  },

  // ──────────────────────────────────────────────────────── preparación ──
  {
    id: 'preparacion',
    titulo: 'Preparar la sesión',
    resumen: 'Cámara, luz, postura y dónde van las manos del examinador.',
    pasos: [
      {
        id: 'montaje',
        titulo: 'Cámara y luz',
        img: 'montaje.svg',
        alt: 'Paciente sentado frente a una laptop con la cámara a la altura de los ojos, a un brazo de distancia, con la luz de frente y sin ventana detrás.',
        cuerpo: `
          <ul>
            <li>Cámara <b>a la altura de los ojos</b> y la cara de frente, centrada.</li>
            <li>A un brazo de distancia: lo justo para que el <b>iris se vea nítido</b> en los ojos
            ampliados. Muy lejos, el pulso sale rechazado por <i>IRIS MUY CHICO</i>.</li>
            <li>Luz <b>de frente</b> o de costado. Nunca una ventana detrás del paciente: la cara
            queda en sombra y el modelo la pierde.</li>
            <li>Sin anteojos si se puede: los reflejos tapan el iris.</li>
          </ul>`,
      },
      {
        id: 'postura',
        titulo: 'Postura y blanco',
        img: 'postura.svg',
        alt: 'Vista de perfil: la cabeza del paciente flexionada unos 30° hacia abajo, con la mirada puesta en la cámara.',
        cuerpo: `
          <p>El paciente sentado, con la cabeza <b>flexionada unos 30° hacia abajo</b>: así el canal
          lateral queda horizontal y es el que se estimula. La lectura <b>inclinación</b> lo muestra
          en vivo.</p>
          <p>El blanco es <b>la cámara misma</b>, o un punto pegado al lado del lente. El modelo de
          paralaje asume el objetivo pegado a la cámara: mirar otra cosa cambia la ganancia.</p>`,
      },
      {
        id: 'manos',
        titulo: 'Las manos del examinador',
        img: 'manos.svg',
        alt: 'Dos cuadros. Bien, con borde verde: manos sobre la parte alta de la cabeza, cara despejada. Mal, con borde rojo: dedos sobre las sienes y cejas, tapando la cara.',
        cuerpo: `
          <p>El examinador se para <b>detrás</b> y toma la cabeza por arriba, con las manos lejos de
          ojos, cejas y pómulos. El modelo sigue la cara entera: un dedo encima de una ceja basta para
          perder el seguimiento.</p>
          <p class="ayuda">Solo, sin examinador, se puede practicar girando uno mismo la cabeza. Sirve
          para aprender la herramienta, pero no mide el reflejo: un impulso activo es predecible y el
          cerebro se anticipa.</p>`,
      },
    ],
  },

  // ─────────────────────────────────────────────────── primera medición ──
  {
    id: 'primera',
    titulo: 'La primera medición',
    resumen: 'Con la cámara encendida: calibrar, dar impulsos y leer el resultado.',
    pasos: [
      {
        id: 'camara',
        titulo: 'Encender la cámara',
        objetivo: '#btn-arrancar',
        espera: 'cara',
        antes: 'cierraHerramientas',
        cuerpo: `
          <p>Apretá <b>Encender cámara</b>. La primera vez el navegador pide permiso y se baja el
          modelo de seguimiento, unos MB; después queda guardado.</p>
          <p>Seguí cuando la barra diga <b>cara sí</b>. Todo se procesa acá: el video no sale del
          equipo.</p>`,
      },
      {
        id: 'visor',
        titulo: 'Lo que ve el modelo',
        objetivo: '.visor',
        cuerpo: `
          <p>Los puntos sobre la cara son lo que sigue el modelo, cuadro a cuadro. Abajo, los dos ojos
          ampliados con el contorno del iris.</p>
          <p>Si en los ojos ampliados el iris no se ve nítido, acercate a la cámara o mejorá la luz
          antes de seguir: todo lo demás se calcula a partir de ahí.</p>`,
      },
      {
        id: 'lecturas',
        titulo: 'Las lecturas',
        objetivo: '.lecturas',
        cuerpo: `
          <p>Los números en vivo. Los que importan al preparar:</p>
          <ul>
            <li><b>iris</b>: el radio en píxeles. Por debajo del mínimo el pulso se rechaza.</li>
            <li><b>inclinación</b>: la flexión de la cabeza; buscá unos 30°.</li>
            <li><b>parpadeo</b>: un parpadeo dentro del impulso lo invalida.</li>
          </ul>
          <p class="ayuda">El resto se explica al pasar el mouse por cada número, o en <b>Qué es cada
          número</b>, abajo de las lecturas.</p>`,
      },
      {
        id: 'calibrar',
        titulo: 'Calibrar el paralaje',
        objetivo: '#btn-calibrar',
        espera: 'calibrado',
        img: 'calibracion.svg',
        alt: 'Paciente mirando fijo un punto rojo mientras gira la cabeza lento de un lado al otro, con un arco de ±20° dibujado.',
        cuerpo: `
          <p>Apretá <b>Calibrar</b> (o <kbd>C</kbd>). Aparece un punto rojo arriba al centro, junto a la
          cámara —el mismo blanco que en los impulsos—: el paciente lo mira <b>sin soltarlo</b> y gira la cabeza <b>lento</b> de un lado al otro, ±20°, durante 10 s.</p>
          <p>Al girar la cabeza el iris se corre en la imagen aunque el ojo no se mueva, y ese
          corrimiento es tan grande como la señal. Sin calibrar, un reflejo perfecto se lee ~1,9. Si
          la calibración sale rechazada, la barra de estado dice qué hacer distinto.</p>`,
      },
      {
        id: 'impulsos',
        titulo: 'Dar los impulsos',
        objetivo: '.vivo',
        espera: 'pulso',
        antes: 'cierraHerramientas',
        img: 'impulsos.svg',
        alt: 'Cabeza vista desde arriba en dos cuadros. Bien, borde verde: giro corto y rápido de unos 15°. Mal, borde rojo: giro amplio y lento de más de 40°.',
        cuerpo: `
          <p>Un giro <b>corto y rápido</b> hacia un lado, y la cabeza queda quieta ahí. Se vuelve
          despacio al centro, se espera, y el siguiente hacia un lado que el paciente no pueda
          adivinar.</p>
          <p>En la traza en vivo cada impulso es un pico <b class="c-cabeza">azul</b>; el
          <b class="c-ojo">naranja</b> es el ojo, invertido. Con un reflejo normal se tapan uno al
          otro.</p>`,
      },
      {
        id: 'paneles',
        titulo: 'Un panel por lado',
        objetivo: '.col-lados',
        cuerpo: `
          <p>Cada impulso cae en el panel de su lado. <b>Derecha e izquierda son las del paciente</b>,
          no las de la pantalla.</p>
          <p>Arriba de cada panel, todos los impulsos superpuestos; abajo, la ganancia media ± DE y la
          cuenta de aceptados. La media sale verde o roja contra el corte de 0,80, que viene de equipos
          que sí desacadizan: no es el corte de este número. Sin calibrar queda gris.</p>`,
      },
      {
        id: 'lista',
        titulo: 'Aceptados y rechazados',
        objetivo: '.lado .lista',
        cuerpo: `
          <p>Un pulso por fila: pico, duración, ganancia y estado. <b>✕</b> lo descarta, y
          <kbd>D</kbd> descarta el último; <kbd>Z</kbd> lo devuelve. Un pulso medido sin calibrar
          sale marcado <b>s/c</b> y con la ganancia tachada.</p>
          <p>Un rechazado dice por qué: <i>MUY LENTO</i> pide un impulso más fuerte, <i>PARPADEO</i>
          repetirlo con los ojos abiertos, <i>CARA PERDIDA</i> quedarse en el encuadre. Los rechazados
          no entran en la media.</p>`,
      },
      {
        id: 'csv',
        titulo: 'Llevarse los datos',
        objetivo: '#btn-csv',
        cuerpo: `
          <p><b>Exportar CSV</b> baja un archivo con las tablas de la sesión: un pulso por fila, con su
          ganancia y la configuración con que se calculó; una muestra por fila, para rehacer las
          cuentas en una planilla; y los cuadros crudos.</p>
          <p><b>Importar CSV</b> abre ese archivo en otra computadora u otro día y vuelve a calcular
          cada pulso desde el crudo: sirve para repartir un caso medido y que cada uno lo mire con
          sus perillas.</p>
          <p class="ayuda">Para seguir: <b>Leer los gráficos</b> y <b>Herramientas por dentro</b>, en
          el menú de paseos.</p>`,
      },
    ],
  },

  // ─────────────────────────────────────────────────── leer los gráficos ──
  {
    id: 'graficos',
    titulo: 'Leer los gráficos',
    resumen: 'La regla sobre el gráfico, los rechazados, las sacadas marcadas, la curva promedio y la orientación.',
    pasos: [
      HACEN_FALTA_PULSOS,
      {
        id: 'regla',
        titulo: 'El gráfico es una regla',
        objetivo: '.col-lados',
        antes: 'cierraHerramientas',
        cuerpo: `
          <p>Pasá el puntero por un panel: la línea vertical marca el instante y el cartel da la
          velocidad de cabeza y de ojo ahí.</p>
          <p>Un <b>clic</b> fija una referencia. Moviéndose desde ahí aparecen Δt, el salto de cada
          curva, el <b>área</b> de cada una en el tramo —sombreada— y la <b>ganancia del tramo</b>, que
          es el cociente de las dos áreas. Otro clic la suelta.</p>
          <p class="ayuda">Con el dedo: un toque pone el cursor, otro fija la referencia y
          arrastrar de costado mide.</p>
          <p class="ayuda">Probá medir solo la subida del impulso y después el impulso entero: la
          ganancia cambia según el tramo, y el motor usa uno solo.</p>`,
      },
      {
        id: 'seleccion',
        titulo: 'Mirar un pulso solo',
        objetivo: '.lado .lista',
        cuerpo: `
          <p>Un clic en una fila <b>resalta</b> ese pulso en el panel. Pasando el puntero por la fila
          aparecen sus otras ganancias (a 60 ms, en el pico) y la configuración con que se calculó.</p>
          <p>Si el pulso está rechazado, sobre el tramo del impulso aparece una caja punteada roja con
          el motivo. Con los ejemplos, en el lado derecho hay uno lento y uno con parpadeo.</p>`,
      },
      {
        id: 'marcas-sacadas',
        titulo: 'Las sacadas, marcadas',
        objetivo: '.col-lados',
        antes: 'cierraHerramientas',
        cuerpo: `
          <p>Cada sacada lleva un triángulo sobre su pico: <b class="c-covert">violeta</b> si arrancó
          mientras la cabeza todavía giraba (encubierta), <b class="c-overt">rojo</b> si fue después
          (manifiesta). En la lista, la columna de triángulos dice lo mismo por pulso.</p>
          <p>Con los ejemplos, el lado izquierdo tiene de las dos. Elegí un pulso con una violeta y
          pasá el mouse por su fila: <b>hasta la sacada ≈</b> es la ganancia cortada antes de la
          sacada, y suele ser bastante más baja que la reportada.</p>
          <p class="ayuda">La marca confirma lo que se ve en la curva, no lo reemplaza. A 30 fps una
          sacada son uno o dos cuadros; se apaga en Herramientas, «Marcar sacadas».</p>`,
      },
      {
        id: 'asimetria',
        titulo: 'La asimetría',
        objetivo: '#asim',
        cuerpo: `
          <p>Compara las ganancias medias de los dos lados:
          <b>(derecha − izquierda) / (derecha + izquierda)</b>, en %. Cero es simétrico; con el signo
          se sabe de qué lado está el déficit.</p>
          <p>Con los ejemplos da positiva: el izquierdo es el débil. Pero mirá los pulsos del lado
          izquierdo uno por uno: alguno se lee normal porque una sacada encubierta le tapó el
          déficit.</p>`,
      },
      {
        id: 'promedio',
        titulo: 'La curva promedio',
        objetivo: '.check:has(#promedio)',
        antes: 'abreHerramientas',
        lugar: 'izquierda',
        cuerpo: `
          <p>Encendé <b>Curva promedio del lado</b>: cada panel suma la media de sus pulsos
          aceptados, más gruesa. El ruido de seguimiento se va y queda la forma.</p>
          <p class="ayuda">Los pulsos no comparten instantes —cada uno se disparó en un frame
          distinto—, así que se promedian interpolando sobre una grilla común. Los rechazados quedan
          afuera.</p>`,
      },
      {
        id: 'suavizar',
        titulo: 'Suavizar',
        objetivo: '.check:has(#suavizar)',
        antes: 'abreHerramientas',
        lugar: 'izquierda',
        cuerpo: `
          <p>Suavizar une las muestras con una curva en vez de rectas. Es una interpolación
          <b>monótona</b>: nunca dibuja un pico más alto que el que se midió.</p>
          <p>Aun así hace <b>parecer</b> más precisa una señal de 30 fps. Por eso, mientras está
          encendido, los puntos marcan las muestras reales. Apagalo y mirá cuántas muestras tiene
          de verdad un impulso.</p>`,
      },
      {
        id: 'orientacion',
        titulo: 'Orientación de los paneles',
        objetivo: '.campo:has(#orientacion)',
        antes: 'abreHerramientas',
        lugar: 'izquierda',
        cuerpo: `
          <p><b>Comparar lados</b> (por defecto): los dos paneles con el impulso hacia arriba y el ojo
          invertido, para que con un reflejo normal las curvas se tapen.</p>
          <p><b>Dirección real</b>: cada impulso hacia su lado —derecha arriba, izquierda abajo— y el
          ojo crudo, o sea al revés que la cabeza, porque el reflejo compensa. Es lo mismo, dibujado
          como pasa.</p>`,
      },
      {
        id: 'pausa',
        titulo: 'Congelar la traza en vivo',
        objetivo: '#btn-pausa',
        antes: 'cierraHerramientas',
        cuerpo: `
          <p>La traza de abajo se mueve, así que para medirla hay que congelarla: <b>Pausar</b> o
          <kbd>Espacio</kbd>. La cámara sigue encendida; lo que se detiene es el análisis.</p>
          <p>Congelada, la regla funciona igual que en los paneles.</p>`,
      },
    ],
  },

  // ─────────────────────────────────────────────────────── casos a ciegas ──
  {
    id: 'casos',
    titulo: 'Casos a ciegas',
    resumen: 'Cinco pacientes sintéticos sin diagnóstico: mirá los paneles y decí qué patrón ves.',
    pasos: [
      {
        id: 'como-leer',
        titulo: 'Cómo se lee un caso',
        cuerpo: `
          <p>Cada caso carga los pulsos de un paciente sintético, con una letra y sin decir qué
          tiene. Mirá los dos paneles y respondé <b>antes</b> de que se cuente.</p>
          <ul>
            <li>La <b>media ± DE</b> de cada lado y cuántos pulsos se aceptaron.</li>
            <li>La <b>asimetría</b>, abajo a la derecha de la traza en vivo.</li>
            <li>La <b>forma</b> de las curvas naranjas: un pico angosto que se despega de la azul es
            una sacada. Durante el impulso, encubierta; después, manifiesta.</li>
            <li>Cuántos pulsos quedaron <b>rechazados</b>, y por qué.</li>
          </ul>
          <p class="ayuda">Los casos reemplazan la sesión, como los pulsos de ejemplo. La curva promedio
          (en Herramientas) ayuda a ver la forma.</p>`,
      },
      {
        id: 'caso-a',
        titulo: 'Caso A',
        objetivo: '.col-lados',
        antes: 'cierraHerramientas',
        cuerpo: `
          <p><button type="button" class="primario" data-accion="cargaCaso" data-arg="A">Cargar el caso A</button></p>
          <p>¿Qué patrón muestra?</p>`,
        pregunta: {
          caso: 'A',
          correcta: 'normal',
          explica: `Las dos medias cerca de 1, asimetría casi nula y las curvas naranjas tapando a las
            azules, sin picos que se despeguen. Es el patrón contra el que se compara todo lo demás.`,
          pista: 'Mirá las dos medias y si alguna curva naranja se despega de la azul.',
        },
      },
      {
        id: 'caso-b',
        titulo: 'Caso B',
        objetivo: '.col-lados',
        antes: 'cierraHerramientas',
        cuerpo: `
          <p><button type="button" class="primario" data-accion="cargaCaso" data-arg="B">Cargar el caso B</button></p>
          <p>¿Qué patrón muestra?</p>`,
        pregunta: {
          caso: 'B',
          correcta: 'unilateral-der',
          explica: `El derecho da ~0,5 y el izquierdo ~1; la asimetría sale negativa, del lado derecho.
            Después de cada impulso a la derecha hay un pico naranja: la sacada manifiesta que trae la
            mirada de vuelta. Es el patrón de una neuritis vestibular derecha.`,
          pista: 'Compará las dos medias: ¿cuál de los dos lados queda lejos de 1? Mirá también el signo de la asimetría.',
        },
      },
      {
        id: 'caso-c',
        titulo: 'Caso C',
        objetivo: '.col-lados',
        antes: 'cierraHerramientas',
        cuerpo: `
          <p><button type="button" class="primario" data-accion="cargaCaso" data-arg="C">Cargar el caso C</button></p>
          <p>¿Qué patrón muestra?</p>`,
        pregunta: {
          caso: 'C',
          correcta: 'bilateral',
          explica: `Los dos lados bajos, con sacadas manifiestas en los dos, y la asimetría casi en cero.
            <b>Una asimetría normal no es un resultado normal</b>: compara los lados entre sí, y acá
            los dos fallan igual.`,
          pista: 'La asimetría sola engaña: mirá cada media por separado.',
        },
      },
      {
        id: 'caso-d',
        titulo: 'Caso D',
        objetivo: '.col-lados',
        antes: 'cierraHerramientas',
        cuerpo: `
          <p><button type="button" class="primario" data-accion="cargaCaso" data-arg="D">Cargar el caso D</button></p>
          <p>¿Qué patrón muestra? No te quedes con el número: elegí un pulso de cada lado y miralo.</p>`,
        pregunta: {
          caso: 'D',
          correcta: 'encubierto-izq',
          explica: `Las dos medias dan normales —la izquierda hasta pasa de 1—, pero en cada impulso a
            la izquierda la curva naranja se despega con un pico angosto <b>durante</b> el giro, con su
            triángulo violeta. El reflejo izquierdo no alcanza y una sacada encubierta lo corrige a
            tiempo. Como la ganancia reportada no desacadiza, la sacada entra y la infla: es el
            <b>falso negativo</b>. En Herramientas, la fila <b>hasta la sacada ≈</b> de la tabla de
            métodos baja la izquierda a ~0,5.`,
          pista: 'Las medias no alcanzan. Seleccioná un pulso del lado izquierdo y mirá la curva naranja durante el impulso: ¿hay triángulos violetas?',
        },
      },
      {
        id: 'caso-e',
        titulo: 'Caso E',
        objetivo: '.col-lados',
        antes: 'cierraHerramientas',
        cuerpo: `
          <p><button type="button" class="primario" data-accion="cargaCaso" data-arg="E">Cargar el caso E</button></p>
          <p>¿Qué patrón muestra?</p>`,
        pregunta: {
          caso: 'E',
          correcta: 'no-concluyente',
          explica: `Casi todo salió rechazado: impulsos lentos, la cabeza que vuelve sola, la cara
            tapada por las manos, parpadeos. Con uno o ningún pulso aceptado por lado no hay media que
            leer. Lo que corresponde es corregir la técnica y repetir, no interpretar.`,
          pista: 'Mirá cuántos pulsos se aceptaron de cada lado, y los motivos de los rechazados.',
        },
      },
      {
        id: 'cierre',
        titulo: 'Lo que dejan los casos',
        cuerpo: `
          <ul>
            <li>Se lee la <b>media de cada lado</b>, no solo la asimetría (caso C).</li>
            <li>Se miran las <b>curvas</b>, no solo los números: una sacada encubierta puede dejar
            normal una ganancia que no lo es (caso D).</li>
            <li>Sin pulsos aceptados suficientes <b>no se concluye</b> (caso E).</li>
          </ul>
          <p class="ayuda">Los casos se pueden volver a cargar desde acá cuando se quiera. Para
          docentes: <button type="button" data-accion="exportaGift">preguntas para Moodle (GIFT)</button>,
          con estos casos y las ideas de los paseos.</p>`,
      },
    ],
  },

  // ──────────────────────────────────────────────────── paciente simulado ──
  {
    id: 'simulado',
    titulo: 'Paciente simulado',
    resumen: 'En parejas: un compañero sano, una patología agregada por el motor, y descubrir cuál es.',
    pasos: [
      {
        id: 'que-es',
        titulo: 'Examinar un paciente que no existe',
        cuerpo: `
          <p>Un compañero sano se sienta frente a la cámara. El motor le agrega una patología a cada
          pulso: la mirada se arrastra con la cabeza en lo que el reflejo no compensa, y sacadas la
          traen de vuelta.</p>
          <p>Los impulsos son de verdad —la velocidad, los rebotes y las manos en la cara son los
          tuyos—, así que se practica <b>examinar y leer a la vez</b>.</p>
          <p class="ayuda">Nunca pasa por una medición real: la barra dice <b>SIMULADO</b>, los pulsos
          salen con <b>sim</b> y los gráficos llevan la marca de agua.</p>`,
      },
      {
        id: 'elegir',
        titulo: 'Elegir el paciente',
        objetivo: '#h-simulacion',
        antes: 'abreHerramientas',
        lugar: 'izquierda',
        cuerpo: `
          <p>Quien hace de docente elige el perfil, o <b>uno al azar</b>, y marca <b>a ciegas</b>:
          el selector se esconde y la pantalla no dice cuál es.</p>
          <p class="ayuda">Cambiar de paciente borra los pulsos que había: mezclar dos pacientes daría
          una media que no es de nadie.</p>`,
      },
      {
        id: 'examinar',
        titulo: 'Examinar',
        objetivo: '.vivo',
        antes: 'cierraHerramientas',
        espera: 'pulso',
        cuerpo: `
          <p>Encendé la cámara, calibrá y dá impulsos como siempre. La traza de abajo ya muestra la
          patología mientras examinás.</p>
          <p>En los ojos ampliados, el <b>anillo violeta</b> es dónde estaría el iris simulado: el video
          es el real y no se mueve.</p>
          <p class="ayuda">Hacen falta al menos tres pulsos aceptados por lado para decir algo.</p>`,
      },
      {
        id: 'decidir',
        titulo: '¿Qué tiene?',
        objetivo: '.col-lados',
        cuerpo: `<p>Con los paneles, las medias, la asimetría y las sacadas: ¿qué patrón muestra tu
          paciente?</p>`,
        pregunta: {
          dinamica: 'simulacion',
          sinRespuesta: 'No hay paciente simulado: elegí uno en Herramientas › Paciente simulado.',
        },
      },
      {
        id: 'revelar',
        titulo: 'Revelar y comparar',
        objetivo: '#h-simulacion',
        antes: 'abreHerramientas',
        lugar: 'izquierda',
        cuerpo: `
          <p><button type="button" data-accion="revelaSimulacion">Revelar</button> dice qué perfil
          era. Después, <b>Ver lo real</b> recalcula cada pulso sin la patología: lo que tu compañero
          dio de verdad, con lo simulado tachado al lado.</p>
          <p class="ayuda">Si un pulso real salió rechazado, el simulado también: la técnica es la
          misma. Eso también se evalúa.</p>`,
      },
    ],
  },

  // ────────────────────────────────────────────── herramientas por dentro ──
  {
    id: 'herramientas',
    titulo: 'Herramientas por dentro',
    resumen: 'La recta del paralaje, el último pulso, la nube de ganancias, los métodos de cálculo y el k a mano.',
    alSalir: 'restauraK',
    pasos: [
      HACEN_FALTA_PULSOS,
      {
        id: 'cajon',
        titulo: 'El cajón de herramientas',
        objetivo: '#btn-herramientas',
        antes: 'abreHerramientas',
        cuerpo: `
          <p><b>Herramientas</b> (o <kbd>H</kbd>) abre el cajón con cada paso del cálculo a la vista.
          Nada de lo que hay adentro hace falta para medir: está para entender por qué da lo que
          da.</p>`,
      },
      {
        id: 'paralaje',
        titulo: 'La recta del paralaje',
        objetivo: '#h-calib',
        antes: 'abreHerramientas',
        lugar: 'izquierda',
        cuerpo: `
          <p>Cada punto es un cuadro de la calibración: el corrimiento del iris contra el seno del giro
          de la cabeza. Si el paciente fijó bien, caen sobre una <b>recta</b> y su pendiente es −k. Que
          se vea la recta es la prueba de que lo medido es paralaje y no la mirada paseando.</p>
          <p class="ayuda">Con los ejemplos se ve la calibración del paciente sintético, k = 0,95. Con
          la cámara, la de quien calibró.</p>`,
      },
      {
        id: 'ultimo',
        titulo: 'El último pulso',
        objetivo: '#h-pulso',
        antes: 'abreHerramientas',
        lugar: 'izquierda',
        cuerpo: `
          <p>El pulso seleccionado —o el último— solo, en grande. El sombreado es la <b>ventana del
          impulso</b>: el tramo entre el inicio y el fin, que es sobre el que se calcula la ganancia.
          Las líneas punteadas son los umbrales que lo delimitan.</p>
          <p>Elegí otro pulso en la lista y mirá cómo se mueve la ventana.</p>`,
      },
      {
        id: 'nube',
        titulo: 'Ganancia contra pico',
        objetivo: '#h-ganancias',
        antes: 'abreHerramientas',
        lugar: 'izquierda',
        cuerpo: `
          <p>Un punto por pulso: el pico de velocidad de la cabeza contra la ganancia. Azul el lado
          derecho, violeta el izquierdo; los rechazados, pálidos. La franja verde es el rango de pico
          aceptado y la punteada, el corte de 0,80.</p>
          <p>Un reflejo sano da una nube <b>chata y apretada</b>: la ganancia no depende de qué tan
          fuerte fue el impulso. Una nube desparramada es para desconfiar del lado.</p>`,
      },
      {
        id: 'metodos',
        titulo: 'Tres formas de calcular la ganancia',
        objetivo: '#h-ganancias',
        antes: 'abreHerramientas',
        lugar: 'izquierda',
        cuerpo: `
          <p>El mismo pulso admite varias cuentas. <b>Área</b>: cuánto giró el ojo sobre cuánto giró
          la cabeza en todo el impulso; es la que se reporta. <b>60 ms</b>: el cociente de velocidades
          en un solo instante. <b>Picos</b>: el máximo del ojo sobre el máximo de la cabeza, aunque
          no ocurran a la vez.</p>
          <p>Cambiá el <b>método</b> y mirá la tabla: con los mismos pulsos, las medias y la asimetría
          cambian. Por eso una ganancia sin su método no se compara con otra.</p>
          <p class="ayuda">Zamaro et al., 2020: los métodos de cálculo no son intercambiables entre
          sí. Y a 30 fps la de 60 ms se apoya en dos cuadros.</p>`,
      },
      {
        id: 'como',
        titulo: 'Cómo se mide, y qué no',
        objetivo: '#h-como',
        antes: 'abreHerramientas',
        lugar: 'izquierda',
        cuerpo: `
          <p>Las cinco decisiones del motor en una lista —el iris como regla, el ángulo esférico, la
          cabeza por incrementos, la derivada y la ganancia por posiciones— y, abajo, lo que el método
          no hace.</p>
          <p>Más abajo, las referencias: de dónde sale cada número.</p>`,
      },
      {
        id: 'kmanual',
        titulo: 'k a mano',
        objetivo: '.perilla:has(#k-manual)',
        antes: 'abreHerramientas',
        lugar: 'izquierda',
        espera: 'recalculado',
        cuerpo: `
          <p>El experimento que explica la calibración: poné el deslizador en <b>0</b>, marcá
          <b>usar este k</b> y apretá <b>Recalcular</b> más abajo.</p>
          <p>Las ganancias del lado sano pasan a ~1,9. Nadie tiene un reflejo de 1,9: es el paralaje
          sin corregir, que tiene el mismo tamaño que la señal.</p>
          <p class="ayuda">Va al final del paseo a propósito: con k = 0 todo lo demás se lee mal.
          Al terminar el paseo vuelve solo el k calibrado; también se puede ahora:
          <button type="button" data-accion="restauraK">volver al k calibrado</button>.</p>`,
      },
    ],
  },

  // ───────────────────────────────────────────────────────── las perillas ──
  {
    id: 'perillas',
    titulo: 'Las perillas del motor',
    resumen: 'Qué hace cada perilla, probado sobre pulsos que ya se midieron.',
    pasos: [
      HACEN_FALTA_PULSOS,
      {
        id: 'idea',
        titulo: 'Cambiar y recalcular',
        objetivo: '#btn-recalcular',
        antes: 'abreHerramientas',
        lugar: 'izquierda',
        cuerpo: `
          <p>Una perilla nueva vale para los pulsos <b>siguientes</b>. Cada pulso guarda sus muestras
          crudas, así que <b>Recalcular</b> vuelve a correr el motor entero sobre los pulsos que ya
          están, con la configuración de ahora.</p>
          <p>El método de este paseo: mové <b>una</b> perilla, recalculá, mirá qué cambió, y volvela a
          su lugar. Después de recalcular, la ganancia de antes queda <s>tachada</s> al lado de la
          nueva, los paneles dicen la media de antes y en la nube de ganancias cada punto viejo
          queda unido al nuevo.</p>
          <p class="ayuda">Mientras alguna perilla no está en su valor de fábrica, la barra de arriba
          dice <b>PERILLAS CAMBIADAS</b>: los pulsos que se midan así no son comparables con otros.</p>`,
      },
      {
        id: 'ventana',
        titulo: 'Ventana del derivador',
        objetivo: '.perilla:has(#deriv-win)',
        antes: 'abreHerramientas',
        lugar: 'izquierda',
        cuerpo: `
          <p>La velocidad sale de ajustar una parábola a las muestras de esta ventana. Más ancha,
          menos ruido pero el pico se <b>aplana</b>.</p>
          <p>Probá <b>200 ms</b> y recalculá: los picos bajan y varios pulsos pasan a
          <i>MUY LENTO</i>. La cabeza no cambió; cambió cómo se la mide.</p>`,
      },
      {
        id: 'grado',
        titulo: 'Grado del ajuste',
        objetivo: '.perilla:has(#deriv-deg)',
        antes: 'abreHerramientas',
        lugar: 'izquierda',
        cuerpo: `
          <p>Grado 1 ajusta una recta: con la ventana alrededor del pico, promedia la subida con la
          bajada y aplana justo el valor que se quiere medir. Grado 2 sigue la curvatura; grado 3 sigue
          también el ruido.</p>
          <p>Probalo con la ventana en 50 y en 100 ms. A 30 fps entran pocas muestras en la ventana, y
          con 50 ms el grado 1 puede dar picos <b>más altos</b>, no más bajos: la teoría supone
          muestras de sobra. Por eso conviene probar en vez de creer.</p>`,
      },
      {
        id: 'umbrales',
        titulo: 'Umbrales de inicio y fin',
        objetivo: '.perilla:has(#on-deg)',
        antes: 'abreHerramientas',
        lugar: 'izquierda',
        cuerpo: `
          <p>El impulso empieza cuando la cabeza pasa el <b>umbral de inicio</b> y termina cuando baja
          del <b>umbral de fin</b>, que va más bajo para que el ruido no lo corte antes de tiempo.</p>
          <p>Esos dos puntos son la ventana del impulso, y la ganancia se calcula entre ellos. Movelos
          y mirá en <b>Último pulso</b> cómo cambia el sombreado y la ganancia con él.</p>`,
      },
      {
        id: 'aceptacion',
        titulo: 'Pico y duración',
        objetivo: '.perilla:has(#peak-min)',
        antes: 'abreHerramientas',
        lugar: 'izquierda',
        cuerpo: `
          <p>Pico mínimo y máximo, duración mínima y máxima: los criterios para <b>aceptar</b> un
          pulso. No cambian ninguna ganancia; deciden cuáles entran en la media.</p>
          <p>Bajá el pico mínimo a 80 y recalculá: el pulso lento de los ejemplos pasa a aceptado y
          entra en la media. Es tan fácil como eso aflojar un criterio.</p>`,
      },
      {
        id: 'parpadeo',
        titulo: 'Parpadeo',
        objetivo: '.perilla:has(#blink)',
        antes: 'abreHerramientas',
        lugar: 'izquierda',
        cuerpo: `
          <p>Qué tan cerrado tiene que estar el ojo (0 abierto, 1 cerrado) para marcar la muestra como
          parpadeo. Un parpadeo dentro del impulso rechaza el pulso: con el ojo cerrado no hay iris.</p>
          <p>Probá subirlo a <b>0,90</b> y recalculá: el pulso con parpadeo de los ejemplos pasa a
          aceptado, con una ganancia que se calculó con el ojo cerrado. Un umbral flojo no rechaza
          menos parpadeos: acepta mediciones sin iris.</p>`,
      },
      {
        id: 'iris',
        titulo: 'Iris mínimo',
        objetivo: '.perilla:has(#iris-min)',
        antes: 'abreHerramientas',
        lugar: 'izquierda',
        cuerpo: `
          <p>El radio del iris en píxeles por debajo del cual se rechaza el pulso. Con el iris chico
          —paciente lejos, cámara de poca resolución— un píxel de error es muchos grados, y la
          ganancia deja de significar algo.</p>`,
      },
      {
        id: 'recalcular',
        titulo: 'Recalcular',
        objetivo: '#btn-recalcular',
        antes: 'abreHerramientas',
        lugar: 'izquierda',
        espera: 'recalculado',
        cuerpo: `
          <p>Mové alguna perilla y apretá <b>Recalcular</b>. Los números de la lista pasan a ser los
          de la configuración de ahora, y el CSV se lleva cuál fue.</p>
          <p>Para dejar todo como vino: <button type="button" data-accion="restauraPerillas">valores por
          defecto y recalcular</button>. El mismo botón está al pie de las perillas.</p>`,
      },
    ],
  },
];

/** Imagen del menú de paseos. */
export const PORTADA = {
  img: 'portada.svg',
  alt: 'Un examinador de pie detrás de un paciente sentado frente a una laptop, con las manos sobre la cabeza del paciente.',
};
