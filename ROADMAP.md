# Roadmap — Laberinto 3D

La sección **Laberinto 3D** (botón en la barra o tecla `L`) recrea la app aVOR
de la Universidad de Sydney, que era solo para iOS y ya no está disponible: un
modelo de cabeza, ojos y laberintos para ver qué siente cada canal con cada giro
y qué hace el ojo. No usa la webcam: se mueve con mouse, dedo o el giroscopio
del teléfono. Los detalles de cómo funciona están en el README, sección
«Laberinto 3D».

Rama: `main` (se trabajó en `feat/laberinto-3d` y se unió el 2026-09-27).
Publicado en el servidor propio del proyecto (PHP y Node.js).

## Hecho

### Escena y modelo

- Sección a pantalla completa con barra propia, panel y cinco vistas:
  Canales, Ejes, Respuesta, Patología y Vía.
- Botón de solo visor (⤢ o `H`): esconde barra y panel, con pantalla completa
  donde se puede.
- three.js bajado recién al abrir, fijo en el import map como `three`
  (`bump.mjs`), guardado por el service worker.
- Modelo provisorio:
  - cabeza de una sola pieza como superficie implícita (`js/cabeza.js`, surface
    nets, unos 300 ms): cráneo, cara, nariz, labios, cejas, orejas y párpados;
  - ojos con iris, pupila y marca de torsión, que se ven solo por los párpados
    (la piel se dibuja antes en el z-buffer);
  - laberintos con los seis canales separados, ampollas, vestíbulo y la cóclea
    saliendo del vestíbulo.
- Contrato para el modelo de la diseñadora: si existe `modelos/laberinto.glb`
  se usa ese, con nombres fijos (`cabeza`, `ojo_izq`, `canal_lat_izq`…). El eje
  de cada canal se mide en la malla y la consola avisa si se aparta más de 35°
  del de libro. `modelos/provisorio.glb` es la referencia exportada.
- Tres formas de ver los laberintos, como en aVOR: a los lados de la cabeza
  (por defecto, cámara de frente), en su lugar ×4 (cámara en tres cuartos) y a
  tamaño real, con transición animada.

### Física de los canales (`js/canales.js`)

- Modelo de libro: tres canales ortogonales por lado, el conjunto levantado 30°.
- Tasa de disparo: 90 espigas/s en reposo, 0,5 por °/s, entre 0 y 400. La
  segunda ley de Ewald se ve en las barras.
- Los canales se pintan de rojo (excitado) o azul (inhibido) al mover la cabeza,
  en todas las vistas; quietos, con el color de su par.
- Impulsos armados en los planos de examen (lateral, nariz, oreja, LARP, RALP),
  con velocidad pico y cámara lenta en tiempo físico. Pueden no volver: la
  cabeza se queda donde llegó y se encadenan posiciones.
- Vista Ejes: flechas del eje excitador (regla de la mano derecha) y planos de
  examen opcionales.

### Control

- Mouse y dedo: girar, rolar, zoom, mover y doble toque para centrar. Teclado:
  flechas, `Q`/`E`, `0`.
- «Centrar» deja la cámara de frente.
- Teléfono con el giroscopio (`devicemotion`) integrado:
  - el orden de ejes de `rotationRate` se detecta solo, porque no es igual en
    todos los navegadores;
  - el marco de la cabeza sale de la gravedad, así que funciona con el teléfono
    parado, apaisado o inclinado;
  - pide permiso en iOS y avisa si el teléfono no entrega giroscopio;
  - **probado con éxito en un teléfono real** el 2026-09-27.

### Enlace teléfono–PC (`js/enlace.js`, `servidor/senal.php`)

- El teléfono hace de cabeza y el PC muestra el modelo, con la patología
  elegida en el PC.
- El PC muestra un QR y el teléfono lo escanea; no hay código a mano.
- La presentación pasa por un PHP de un solo archivo (`servidor/senal.php`,
  junto a la página), sin base de datos; el giroscopio va después directo por
  WebRTC.
- Reconexión sola si el teléfono se duerme o se corta la red: el PC reabre la
  misma sala con su llave secreta y el teléfono vuelve a entrar al despertar.
  Mientras hace de cabeza, el teléfono no dibuja y pide que la pantalla no se
  apague (Wake Lock).
- Si la red no deja conectar directo, **relevo por WebSocket** en el mismo
  servidor (`servidor/relevo/relevo.js`, Node.js sin dependencias, cargado con
  «Setup Node.js App» de cPanel: ver su LEEME.md). Probado en local, también
  con caída y reconexión; `?forzar=relevo` lo prueba en producción.
- «Centrar» en el PC recentra también el teléfono.
- Probado con dos pestañas contra el PHP local, incluido cortar la conexión y
  reengancharse, y **con éxito con un teléfono y un PC reales** en el servidor
  propio el 2026-09-27.

### Patología (`js/patologia.js`)

- Cada canal normal, con hipofunción o en arreflexia: en grilla o con casos
  armados (neuritis superior e inferior, pérdida unilateral, hipofunción
  lateral, hipofunción y arreflexia bilaterales), de cualquier lado.
- Sin guiones por enfermedad: todo sale de la función de cada canal.
  - VOR por par, dominado por el canal excitado (ganancia 0,2 y 0,8 con un canal
    muerto).
  - Nistagmo espontáneo en 3D si la lesión no está compensada, frenado al 30 %
    con fijación.
  - Sacadas correctivas desde el error de mirada: encubiertas (~80 ms), abiertas
    (~270 ms), tardías (~500 ms) o mixtas.
  - El ojo se lee en el marco de los canales (Simpson y Graf).
- Paciente al azar a ciegas: sin colores, tasas ni nombre. «Revelar» dice qué
  era.
- Ojos de cerca: cámara pegada a la cabeza, como un video-oculógrafo, con la
  traza horizontal, vertical y torsional.
- Con la cabeza quieta en otra postura más de 1 s, los ojos vuelven a mirar al
  frente con una sacada, como una persona; antes quedaban pegados mirando el
  blanco viejo.
- Canales enfermos en amarillo verdoso.

### La vía del reflejo (`js/via.js`)

- Vista **Vía**: el esquema en 2D a la derecha (abajo en pantalla angosta) y
  el modelo 3D corrido al hueco que queda.
- El arco de tres neuronas de cada canal, de frente como la cámara: nervio
  (rama superior o inferior) → núcleos vestibulares → cruce → VI, IV o III
  (con el FLM) → los dos músculos que excita, uno de cada ojo. Lateral: RM
  propio y RL contrario; anterior: RS propio y OI contrario; posterior: OS
  propio y RI contrario.
- Puntos que corren al ritmo de cada neurona (uno cada 15 espigas): en reposo
  blancos, tenues y lentos; inhibidos azules, más lentos y más separados;
  excitados rojos y rápidos. Tramos del mismo color, punteados si callan.
- Tasas: el nervio de canales.js; el núcleo, con la comisura del compañero
  coplanar y el reposo devuelto si la lesión está compensada; la motoneurona,
  con la posición y la velocidad reales del ojo (sacadas incluidas).
- La lesión va como cruz (arreflexia) o barra (hipofunción) en el nervio.
- Filtro por plano (laterales, LARP, RALP o los tres). Los impulsos armados
  están también en su panel, con la velocidad de la cabeza. Los puntos corren
  en tiempo físico: la cámara lenta los frena. A ciegas no muestra actividad
  ni lesión.
- Los ojos del esquema se mueven con el ojo del modelo.
- **Utrículo y sáculo** (`js/otolitos.js`): sienten la inclinación respecto de
  la gravedad. El utrículo, por la rama superior, llega a RS y OS de su ojo y
  a OI y RI del otro (contrarrotación ocular, vía del oVEMP), y la
  contrarrotación se suma a los ojos. El sáculo, por la inferior, baja al ECM
  de su lado (vía del cVEMP). Filtro propio en Vía, filas en la grilla de
  Patología y en los casos según la rama del nervio. Un utrículo perdido sin
  compensar deja una torsión hacia su lado.

### Calidad

- Tests en node de la física, la cabeza, el giroscopio, las patologías y la vía
  (127 en total con el resto de trainHIT).
- Todo traducido al inglés.

## Falta probar

- La reconexión después de dormir el teléfono, con aparatos reales.
- El relevo ya responde en el servidor propio (`servidor/relevo/`); falta
  probar un enlace entero por él (`?forzar=relevo`): que el hosting deje pasar
  WebSocket a la aplicación Node. Si no, plan B: tubería por el PHP.
- El enlace en la red de la colega a la que no le conectó (teléfono con datos
  móviles o wifi con aislamiento de clientes), ya con el relevo.
- Que los ojos ya no se queden pegados (vuelven al frente con la cabeza quieta
  más de 1 s), con el teléfono como cabeza.

- El diente de sierra del nistagmo y las sacadas en pantalla, a velocidad
  normal (los tests del modelo los cubren).
- La vía con el teléfono enlazado, en un PC de verdad.
- Revisión clínica de la vía: el trayecto de los verticales (el anterior va
  en realidad también por el tracto tegmental ventral y el brachium
  conjunctivum, acá todo por el FLM) y las constantes de núcleo y motoneurona.
- Revisión clínica de los otolitos: 60 espigas/s por g, la contrarrotación de
  15° por g (unos 7° con la oreja 30° abajo) y la torsión de un utrículo
  perdido (unos 6°). El sáculo solo siente la inclinación adelante-atrás.
- Revisión clínica de las constantes: 10 °/s de fase lenta por canal muerto, la
  fijación al 30 %, y la pérdida unilateral total, que sale con la torsional
  algo mayor que la horizontal.

## Pendiente

- **Nistagmo espontáneo con la cámara** (en trainHIT, no en el Laberinto): el
  paciente fija un blanco o el dedo, se registra el ojo 10 a 20 s y se detecta
  el diente de sierra, con la dirección de la fase rápida y la velocidad de la
  fase lenta; también con el blanco a los lados, para el evocado por la mirada.

- **VPPB**: partículas en los canales (canalitiasis), su nistagmo al cambiar de
  posición la cabeza y las maniobras (Dix-Hallpike, Epley, rolido).
- **Disfunción cerebelosa**, como en aVOR.
- **Referencia de fijación** cabeza o mundo, como en aVOR.
- Modelo definitivo de la diseñadora (`modelos/laberinto.glb`).

## Ideas

- En la Vía, las lesiones centrales: cortar el FLM (oftalmoplejía
  internuclear) o un núcleo, además de las periféricas.
- En la Vía, las proyecciones inhibidoras al mismo lado, prendibles.
- La reacción de inclinación ocular completa: con un solo ojo en el modelo no
  sale la desviación oblicua (skew), que necesita un ojo más bajo que el otro.
- Los otolitos en el modelo 3D: el vestíbulo no los separa, así que no se
  pintan; con el modelo de la diseñadora podrían ir `utriculo_izq`, etc.
- Simular un VEMP: el estímulo (sonido o vibración) y la respuesta en el ECM o
  en el OI.
- Con la cámara, más allá del nistagmo espontáneo: seguimiento lento y sacadas
  siguiendo el dedo o un blanco.
