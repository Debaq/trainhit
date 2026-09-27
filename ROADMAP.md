# Roadmap — Laberinto 3D

La sección **Laberinto 3D** (botón en la barra o tecla `L`) recrea la app aVOR
de la Universidad de Sydney, que era solo para iOS y ya no está disponible: un
modelo de cabeza, ojos y laberintos para ver qué siente cada canal con cada giro
y qué hace el ojo. No usa la webcam: se mueve con mouse, dedo o el giroscopio
del teléfono. Los detalles de cómo funciona están en el README, sección
«Laberinto 3D».

Rama: `feat/laberinto-3d`.

## Hecho

### Escena y modelo

- Sección a pantalla completa con barra propia, panel y cuatro vistas:
  Canales, Ejes, Respuesta y Patología.
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
  con velocidad pico y cámara lenta en tiempo físico.
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
  - pide permiso en iOS y avisa si el teléfono no entrega giroscopio.

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
- Canales enfermos en amarillo verdoso.

### Calidad

- Tests en node de la física, la cabeza, el giroscopio y las patologías (104 en
  total con el resto de trainHIT).
- Todo traducido al inglés.

## Falta probar

- **En un teléfono real**, el giroscopio después del arreglo del orden de ejes y
  del marco por gravedad: se probó con eventos simulados de los dos órdenes.
  Hace falta HTTPS (GitHub Pages).
- El diente de sierra del nistagmo y las sacadas en pantalla, a velocidad
  normal (los tests del modelo los cubren).
- Revisión clínica de las constantes: 10 °/s de fase lenta por canal muerto, la
  fijación al 30 %, y la pérdida unilateral total, que sale con la torsional
  algo mayor que la horizontal.

## Pendiente

- **VPPB**: partículas en los canales (canalitiasis), su nistagmo al cambiar de
  posición la cabeza y las maniobras (Dix-Hallpike, Epley, rolido).
- **Disfunción cerebelosa**, como en aVOR.
- **Referencia de fijación** cabeza o mundo, como en aVOR.
- Modelo definitivo de la diseñadora (`modelos/laberinto.glb`).
- Merge a `main` y publicación.

## Ideas

- Con la cámara (fuera del Laberinto 3D, que no la usa): evaluación de
  movimientos oculares, con el paciente siguiendo el dedo o un blanco
  (seguimiento lento, sacadas, mirada excéntrica).
