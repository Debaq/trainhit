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

- **Pasada completa del manual** (`docs/manual/`): rehacer las capturas, que
  son anteriores al botón **Laberinto 3D ↗** de la barra y al tema claro (solo
  `04-menu-aprender.png` está al día, del 2026-09-27); revisar el texto contra
  la interfaz de hoy, regenerar los PDF y subirlos al release `manual`.
- **Nistagmo espontáneo con la cámara**: el paciente fija un blanco o el dedo,
  se registra el ojo 10 a 20 s y se detecta el diente de sierra, con la
  dirección de la fase rápida y la velocidad de la fase lenta; también con el
  blanco a los lados, para el evocado por la mirada.
- **Sesgo de la ganancia lateral** (prioridad): con un blanco que se mueve
  con la cabeza (ganancia 0 real) la app da ~0,5, porque las comisuras de
  MediaPipe acompañan al iris y se ve la mitad del giro del ojo. Las ganancias
  bajas se leen altas. Falta confirmarlo con un láser sujeto a la cabeza y
  elegir el arreglo (referencia rígida o segunda calibración con supresión);
  mientras tanto, avisarlo en la app y en el README. Todo en
  [docs/investigacion/verticales-y-supresion.md](docs/investigacion/verticales-y-supresion.md).
- **Canales verticales**: el paseo didáctico está (2026-09-27). Medirlos con
  los puntos de MediaPipe quedó **descartado** el mismo día: el iris casi no
  refleja el giro vertical del ojo, lo tapa el párpado. Las opciones a futuro
  (detector propio de pupila, más resolución, infrarrojo, estimadores de
  mirada) están en el mismo documento.
- **`CANAL_AXIS.ralp/larp` en `js/head.js` está mal**: `[±√½, √½, 0]` mezcla el
  eje lateral con el vertical; el de un plano vertical es horizontal,
  `[±√½, 0, √½]`. Nadie lo usa todavía.

## Ideas

- Con la cámara, más allá del nistagmo espontáneo: seguimiento lento y sacadas
  siguiendo el dedo o un blanco.
