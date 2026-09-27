# Roadmap — trainHIT

trainHIT es el vHIT didáctico en el navegador: mide la ganancia del reflejo
vestíbulo-ocular con la webcam y deja cada paso del cálculo a la vista. Cómo
funciona lo que ya está, en el README.

## El Laberinto 3D se mudó

El Laberinto 3D —la recreación de aVOR: cabeza, ojos y laberintos, con
patologías, la vía del reflejo y el teléfono como cabeza— se hizo acá y el
2026-09-27 se mudó a su propio proyecto, **Labyrinthus 3D**, con su historia de
commits:

- sitio: <https://tecmedhub.org/labyrinthus3d/>;
- código y roadmap: <https://github.com/Debaq/labyrinthus3d>
  (`ROADMAP.md`, con lo que estaba acá del Laberinto y el plan de la vía
  auditiva).

trainHIT solo lo enlaza: el botón **Laberinto 3D ↗** de la barra y la tecla
`L` abren el sitio en otra pestaña, y un QR viejo del enlace teléfono–PC que
llegue con `?enlace=` se reenvía allá con el mismo código.

Falta, del lado de trainHIT:

- Sacar del servidor `tecmedhub.org/trainhit/` la carpeta `servidor/` (el PHP
  del enlace y el relevo), una vez que el de Labyrinthus 3D ande; y borrar la
  aplicación Node.js del relevo que apunta a esa carpeta en cPanel.

## Pendiente

- **Nistagmo espontáneo con la cámara**: el paciente fija un blanco o el dedo,
  se registra el ojo 10 a 20 s y se detecta el diente de sierra, con la
  dirección de la fase rápida y la velocidad de la fase lenta; también con el
  blanco a los lados, para el evocado por la mirada.
- **Canales verticales**, diferidos a propósito el 2026-09-22: primero un paseo
  didáctico y después el VOR vertical en cabeceo (anteriores y posteriores
  juntos, rotulado «no es RALP/LARP»), probado con cámara real antes de mostrar
  ganancias. La cabeza ya está resuelta (`CANAL_AXIS` en `js/head.js`); falta
  el ojo vertical.

## Ideas

- Con la cámara, más allá del nistagmo espontáneo: seguimiento lento y sacadas
  siguiendo el dedo o un blanco.
