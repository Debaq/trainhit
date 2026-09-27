# Canales verticales y supresión del VOR con la webcam

Pruebas del 2026-09-27 para decidir si trainHIT puede medir los canales
verticales. De paso encontraron un sesgo en la medición lateral que ya está en
la app. Este documento junta los resultados, lo que falta probar y cómo
repetirlo; los scripts están en [`lab/`](lab/).

**En corto:**

- **Vertical: descartado con los puntos de MediaPipe.** El iris que da el
  modelo casi no refleja el giro vertical del ojo en el rango de un impulso:
  lo que manda es el párpado.
- **Lateral: la app ve más o menos la mitad del giro del ojo.** Las comisuras
  de MediaPipe acompañan al iris, y eso sesga las ganancias bajas hacia 1 (al
  falso negativo). Es un solo sujeto con una maniobra hecha a mano: falta
  confirmarlo con un blanco fijo a la cabeza (la prueba 3, abajo).
- `CANAL_AXIS.ralp` y `.larp` en `js/head.js` están mal (ver al final).

Condiciones: un sujeto adulto sano; webcam de laptop a 1280×720 y 30 fps
(MJPEG, sin recodificar); `@mediapipe/tasks-vision` 0.10.21 con
`face_landmarker` float16, el mismo que usa la app, en GPU; radio del iris de
16 a 18 px.

## La idea: dos verdades conocidas

Una ganancia no se puede validar con una persona sana dando impulsos: da ~1, y
cualquier medidor que no viera nada también daría ~1 después de calibrar. Hacen
falta dos condiciones cuya ganancia se sabe de antemano:

- **Ganancia 1**: mirar fijo la cámara mientras la cabeza se mueve. El ojo gira
  en la órbita al revés que la cabeza y la mirada queda quieta.
- **Ganancia 0**: mirar un blanco que se mueve **con** la cabeza (supresión del
  VOR). El ojo queda quieto en la órbita y la mirada acompaña a la cabeza.

Con cada método se calibra una recta fijando la cámara, `offset = b + m·sin(H)`,
como hace la calibración de paralaje de la app, y la mirada en el espacio sale
de lo que se aparta de esa recta. Un buen método da ~1 fijando la cámara **y**
~0 con el blanco que acompaña.

## Prueba 1: ¿se ve el ojo en vertical?

Protocolo (`lab/grabar.sh`, 255 s, guiado por voz, siempre mirando la lente):
quieto; giros lentos; cabeceo lento; cabeceos rápidos; giros rápidos; LARP
(cabeza girada ~40° a la derecha) lento y rápido; RALP (a la izquierda) lento y
rápido; cabeza quieta mirando arriba y abajo.

| | Resultado |
|---|---|
| Cuadros con cara | 7700 de 7700, también con la cabeza girada (LARP a ~31°) |
| Ruido quieto | vertical ≈ horizontal, ~0,7° |
| Cabeceo lento fijando la cámara | el iris respecto de las comisuras casi no cambia (k ≈ −0,1; en horizontal k = 0,87) y la apertura del párpado sigue al cabeceo (r = 0,8) |
| Cabeza quieta, mirando arriba y abajo, contra la nariz | el iris sube ~6 mm al mirar arriba y **no baja** al mirar abajo; las comisuras suben ~4,5 mm al mirar arriba |
| Cabeceos rápidos | ganancias ~0,95 y ~1,14, que no prueban nada (ver arriba) |
| LARP y RALP | el seguimiento aguantó, con el doble de residuo que de frente (2–2,5° contra 1,2°); el movimiento salió como cabeceo de la cabeza y no en el plano del canal, que sin examinador es difícil |

## Prueba 2: supresión con el pulgar

Protocolo (`lab/grabar2.sh`, 127 s): calibración vertical y horizontal fijando
la cámara; brazo estirado, mirando la uña del pulgar, cabeza y brazo moviéndose
juntos: cabeceo lento, giro lento y cabeceos rápidos; otra calibración vertical
al final.

| Método | Fijando la cámara (esperada 1) | Mirando el pulgar (esperada 0) |
|---|---|---|
| Vertical, iris contra comisuras | 1,04 | **1,30** |
| Horizontal, iris contra comisuras (la app) | 1 (se calibra ahí) | **0,49** |
| Horizontal, iris contra la punta de la nariz | — | 0,09 (pero con 6° de residuo) |

### Por qué: MediaPipe ubica el ojo por el párpado

Midiendo todo contra la nariz, que no se mueve con los ojos, y comparando fijar
la cámara (el ojo gira 1° en la órbita por cada grado de cabeza) con mirar el
pulgar (el ojo quieto en la órbita), por grado de giro del ojo:

- **Horizontal**: el iris se corre 0,158 mm (la geometría, con R = 10,5 mm,
  dice 0,183: un 86 %), pero las comisuras se corren 0,068 mm con él. Acompañan
  al iris en un **43 %**, y como la app mide iris contra comisuras, ve un
  ~50 % del giro.
- **Vertical**: el iris refleja ~15 % del giro esperado en ±15°. Solo se lo ve
  moverse en miradas extremas hacia arriba.

Los puntos del ojo de MediaPipe salen de la forma del ojo, no del cráneo: el
párpado sigue a la mirada vertical, y el contorno del ojo se deforma un poco
con la horizontal.

### Otras referencias

`lab/rigida.mjs` prueba referencias fijas al cráneo en lugar de las comisuras:

| Referencia | Residuo de calibración (H) | Pulgar, horizontal (0) | Pulgar, vertical (0) |
|---|---|---|---|
| Comisuras (la app) | 1,2° | 0,49 | 1,31 |
| Puente de la nariz (168) | 4,2° | 0,42 | 1,41 |
| Media de 4 puntos del puente | 4,5° | 0,37 | 1,41 |
| Media de 20 puntos rígidos | 4,0° | 0,30 | 1,21 |
| Comisuras «rígidas» (las del cuadro quieto llevadas por una afín ajustada a los 20 puntos) | 1,9° | 0,31 | 1,27 |

- El vertical no se salva con ninguna: falla el iris, no la referencia.
- En horizontal la mejor candidata son las comisuras rígidas: baja el sesgo
  sin subir mucho el ruido.
- Con el pulgar no se puede separar cuánto de ese 0,3 es del método y cuánto de
  la maniobra: si el brazo se atrasa, el ojo se mueve en la órbita y la
  ganancia verdadera deja de ser 0.

## Lo que significa para la app lateral

Si el método ve una fracción `s` del giro del ojo, la ganancia que da es
`1 − s·(1 − g)`. Con `s ≈ 0,5`:

| Ganancia real | Se lee |
|---|---|
| 1,0 | 1,0 |
| 0,6 | ~0,8 |
| 0,4 | ~0,7 |
| 0 | ~0,5 |

Es un sesgo al falso negativo, que se suma al de no desacadizar. La calibración
de paralaje no lo corrige: se hace solo fijando la cámara, donde el giro del
ojo y el de la cabeza van atados (`E = −H`), así que no puede separarlos.

Arreglos posibles, para probar con la prueba 3:

1. **Referencia rígida** (comisuras llevadas por los puntos rígidos, o el
   centro del ojo proyectado con la matriz de pose).
2. **Segunda calibración con supresión**: mirar un blanco que se mueve con la
   cabeza da la sensibilidad al giro del ojo, que es justo lo que falta. Es
   también didáctica: enseña la supresión del VOR.
3. Mientras tanto, **avisar** en la app y en el README que con déficit la
   ganancia lateral puede leer alto.

## Prueba 3, pendiente: un blanco fijo a la cabeza

Con la mano no hay cómo saber la verdad. El blanco tiene que moverse exactamente
con la cabeza.

### El dispositivo: láser en la cabeza

- **Materiales**: un puntero láser común de clase 2 (menos de 1 mW) y una
  vincha elástica o una gorra; cinta.
- **Montaje**: el puntero sujeto firme a la vincha, sobre la frente o a un
  costado, apuntando hacia adelante. Tiene que quedar rígido: si se bambolea,
  el punto no sigue a la cabeza.
- **Uso**: el punto cae en la pared **detrás de la laptop, cerca de la
  cámara**, así la mirada queda en la misma zona que al fijar la cámara. El
  paciente mira el punto: como el punto se mueve con la cabeza, la mirada
  también, y la ganancia es 0 exacta, lenta o en impulsos.
- **Seguridad**: nunca apuntarlo a los ojos de nadie ni a superficies que
  reflejen (vidrios, espejos). Encenderlo solo cuando ya está sujeto y
  apuntando a la pared.

La alternativa sin láser es una varilla pegada a una gorra con una tarjeta y un
punto a ~40 cm, por debajo de la línea de la cámara. Es más difícil que quede
firme y que no tape la cara.

Lo que se gana: **impulsos rápidos con ganancia 0**, además de los lentos. Eso
valida el motor dinámico (derivador, ventana, ganancia) sobre un déficit total
real, y podría ser una maniobra del simulador.

### Protocolo

`lab/grabar3.sh` (~3 min): quieto; calibración vertical y horizontal fijando la
cámara; impulsos horizontales y cabeceos fijando la cámara (ganancia 1); láser
encendido: cabeceo y giro lentos, impulsos horizontales y cabeceos mirando el
punto (ganancia 0); láser apagado y otra calibración horizontal.

Con eso se decide: el método que dé ~1 y ~0 en los impulsos, con residuo de
calibración bajo, reemplaza a iris contra comisuras. El análisis sale de
adaptar `lab/analiza2.mjs` y `lab/rigida.mjs` a las fases nuevas.

## Opciones a futuro para los verticales

Con los puntos de MediaPipe no se puede. Lo que quedaría, de más barato a más
caro:

- **Detector propio de pupila o limbo en el recorte del ojo**: ajustar una
  elipse a los bordes que se ven, descartando los que tapa el párpado, en vez
  de usar el iris que predice el modelo. Es donde está el problema, pero con 16
  a 18 px de radio de iris la resolución es justa.
- **Más resolución sobre el ojo**: la cámara (o un teléfono) más cerca, o un
  soporte tipo gafas de cartón con el teléfono delante de un ojo. Se parece más
  a un vHIT de gafas, y deja de ser «solo una webcam».
- **Luz infrarroja**: con IR la pupila se ve negra y nítida y el párpado molesta
  menos. Necesita una cámara sin filtro IR.
- **Estimadores de mirada por apariencia** (redes entrenadas para dar la
  dirección de la mirada, tipo L2CS-Net o ETH-XGaze): aprenden también del
  párpado, así que podrían dar el vertical, pero su error típico es de varios
  grados. Habría que medirlo con estas mismas pruebas.
- **RALP y LARP de verdad**: además del vertical, la cara a 45° de la cámara y
  el movimiento en el plano del canal, que sin examinador no sale. Y la
  torsión, que ninguna de estas opciones ve.

Cualquier candidato se valida igual: ~1 fijando la cámara, ~0 con el láser.

## Error en `CANAL_AXIS`

En `js/head.js`, `ralp` y `larp` son `[±√½, √½, 0]`: mezclan el eje lateral (x)
con el vertical (y). El eje de rotación de un plano vertical es **horizontal**:
tiene que mezclar el lateral con el anteroposterior (z), `[±√½, 0, √½]`. Con la
cabeza girada a la derecha (LARP) domina `[−√½, 0, √½]`. Hoy nadie usa esos ejes.

## Cómo repetirlo

Los scripts de [`lab/`](lab/) se corren desde una carpeta de datos **fuera del
repo** (las grabaciones son caras de personas; `lab/.gitignore` las deja
afuera por si acaso). En Linux, con `ffmpeg`, `espeak-ng`, `bc` y Chromium:

```sh
mkdir -p ~/.cache/trainhit-lab && cd ~/.cache/trainhit-lab
npm i puppeteer-core
L=~/Escritorio/Proyectos/trainhit/docs/investigacion/lab
bash $L/grabar2.sh                               # graba, guiado por voz
node $L/procesa.mjs grab2.mkv grab2.json         # MediaPipe cuadro por cuadro
TODOS=1 node $L/procesa.mjs grab2.mkv grab2t.json  # con los 478 puntos
node $L/analiza2.mjs grab2.json fases2.txt       # ganancias 1 y 0 por método
node $L/comisuras.mjs                            # cuánto arrastra el ojo a las comisuras
node $L/rigida.mjs grab2t.json fases2.txt        # referencias rígidas
```

- `procesa.mjs` abre Chromium **con ventana**: sin ventana no hay GPU y
  MediaPipe va muy lento.
- `/tmp` suele ser un tmpfs pequeño: un video de 4 minutos ocupa ~1 GB y sus
  cuadros otro tanto.
- `analiza.mjs`, `refs.mjs` y `series.mjs` son los de la prueba 1 (`grab.json`,
  `fases.txt`).
