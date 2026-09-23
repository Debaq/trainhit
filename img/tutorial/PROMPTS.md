# Imágenes del tutorial

El tutorial (`js/tutorial.js`, pasos en `js/tutorial-pasos.js`) funciona
sin imágenes: donde falta una muestra un recuadro con el nombre del archivo.

**Hoy las catorce están como esquemas SVG**, dibujados por
`node img/tutorial/ilustraciones.mjs` con esta misma guía de estilo (plano,
sin texto, azul la cabeza, naranja el ojo, verde bien, rojo mal). Cumplen su
`alt` pero son esquemas. Los prompts de abajo siguen sirviendo para
reemplazarlos por ilustraciones: se deja el `.webp` acá y se cambia la
extensión en `js/tutorial-pasos.js`.

Son **14 ilustraciones** para generar. Los tres gráficos de curvas
(`ganancia.svg`, `sacadas.svg` y `patrones.svg`) **no** están acá: están
dibujados con `diagramas.mjs` a partir de curvas sintéticas, porque un
generador de imágenes inventa la forma de las curvas, y la forma es justo lo
que se enseña. Por la misma razón, en las ilustraciones 11, 12 y 14 los
gráficos chicos son decorado: si el generador los dibuja raros, se tapan o se
simplifican, pero no se les pide una forma precisa.

| # | Archivo | Paso | Se ve |
|---|---|---|---|
| 1 | `portada.webp` | menú «Aprender a usar» | encabezado (recortada a 16:5) |
| 2 | `vor.webp` | El reflejo vestíbulo-ocular | tarjeta grande |
| 3 | `impulso.webp` | El impulso cefálico | tarjeta grande |
| 4 | `montaje.webp` | Cámara y luz | tarjeta grande |
| 5 | `postura.webp` | Postura y blanco | tarjeta grande |
| 6 | `manos.webp` | Las manos del examinador | tarjeta grande |
| 7 | `calibracion.webp` | Calibrar el paralaje | tarjeta flotante (recortada) |
| 8 | `impulsos.webp` | Dar los impulsos | tarjeta flotante (recortada) |
| 9 | `canales.webp` | Seis canales, tres planos | tarjeta grande |
| 10 | `limites.webp` | Lo que esto no es | tarjeta grande |
| 11 | `casos.webp` | Cómo se lee un caso (Casos a ciegas) | tarjeta grande |
| 12 | `casos-cierre.webp` | Lo que dejan los casos | tarjeta grande |
| 13 | `simulado.webp` | Examinar un paciente que no existe (Paciente simulado) | tarjeta grande |
| 14 | `pulsos.webp` | Hacen falta pulsos (paciente de ejemplo) | tarjeta grande |

## Entrega

- **1600 × 900 px (16:9)**, en WebP. Si el generador da PNG o JPG:

  ```sh
  cwebp -q 82 entrada.png -o img/tutorial/vor.webp
  # o, con ImageMagick:
  magick entrada.png -resize 1600x900^ -gravity center -extent 1600x900 -quality 82 img/tutorial/vor.webp
  ```

- Menos de ~250 KB cada una: el service worker las guarda para el modo sin red.
- **Zona segura.** La tarjeta grande muestra la imagen entera. La flotante
  (7 y 8) la recorta a 16:7, o sea que se pierden ~100 px arriba y abajo, y la
  portada va de encabezado del menú recortada a 16:5 (~200 px arriba y abajo):
  lo importante tiene que caer en la franja central.
- **Sin texto adentro.** Los generadores escriben mal, y el texto ya está en la
  tarjeta. Si sale alguna letra, número o marca de agua, se descarta o se borra.
- Cada paso tiene en `js/tutorial-pasos.js` un `alt` que dice qué TIENE que
  mostrar la imagen. Sirve para revisar la que llegue: si no cumple el `alt`,
  no sirve, por linda que sea.

## Guía de estilo (va en todos los prompts)

Las ocho tienen que parecer de la misma serie y de la misma app. La app es
oscura, sobria, sin degradés: la imagen no puede ser lo más brillante de la
pantalla.

- **Estilo:** ilustración vectorial plana, médica y didáctica. Líneas limpias,
  sombreado mínimo, sin fotorrealismo, sin 3D brillante.
- **Fondo:** gris casi negro liso, `#18181b` (el de las tarjetas).
- **Colores con significado** — son los mismos de los gráficos, no decorativos:
  - azul `#2e7dd6`: **la cabeza** y su movimiento (flechas de giro de cabeza).
  - naranja `#e8721c`: **el ojo** y la mirada (flechas de ojo, línea de mirada).
  - verde `#2e9e54`: **correcto**; rojo `#d62d2d`: **incorrecto** (bordes de
    los cuadros «bien / mal»). El rojo también es el punto de fijación.
  - el resto en grises neutros; piel y ropa en tonos apagados.
- **Personas:** adultos, rasgos neutros, sin marcas ni logos. Variar entre
  imágenes edad, sexo y tono de piel. El paciente con ropa de calle; el
  examinador con camisa o ambo liso, sin estetoscopio (no es la escena).
- **Equipos:** una laptop genérica, sin logo. Nada de gafas de vHIT: acá se
  mide sin gafas, con la cámara de la laptop.

Bloque de estilo para pegar al final de cada prompt:

```
flat vector medical illustration, clean educational diagram style, minimal shading,
solid dark charcoal background #18181b, muted neutral palette, head movement shown in
blue #2e7dd6, eye and gaze shown in orange #e8721c, generic unbranded objects, no text,
no letters, no numbers, no labels, no watermark, no logo, 16:9
```

Negativo (si el generador lo acepta):

```
text, letters, words, numbers, captions, watermark, logo, brand, photorealistic, 3D render,
glossy, gradient background, white background, goggles, VR headset, stethoscope, blood,
extra fingers, deformed hands, distorted face
```

---

## 1. `portada.webp` — Menú «Aprender a usar»

**Tiene que mostrar:** la escena completa del examen con esta herramienta. Un
paciente sentado frente a una laptop sobre una mesa, mirando la pantalla; un
examinador de pie detrás, con las manos sobre la parte alta de la cabeza del
paciente. La cara del paciente despejada y hacia la cámara de la laptop.
Va recortada a una franja ancha: las dos personas y la laptop, en el medio.

```
A patient sitting at a desk facing an open laptop, looking straight at the laptop's
webcam. An examiner stands directly behind the patient, both hands resting gently on
the top of the patient's head, fingers away from the face. Three-quarter view from the
front-side so both people and the laptop are visible. Calm clinical training room
suggested with a few simple shapes. A thin orange line goes from the patient's eyes to
the webcam. Wide composition, everything in the horizontal middle band.
[BLOQUE DE ESTILO]
```

## 2. `vor.webp` — El reflejo vestíbulo-ocular

**Tiene que mostrar:** una cabeza **vista desde arriba** (desde el techo)
girando hacia un lado —flecha curva **azul** alrededor de la cabeza— y los dos
ojos girando hacia el **lado contrario** —flechas curvas **naranjas** chicas—,
con la línea de mirada recta y fija hacia un punto adelante. Opcional, sutil:
el oído interno insinuado a los costados.

```
Top-down view (from the ceiling) of a stylized human head, nose pointing up toward a
small target dot at the top of the image. A large curved blue arrow around the head
shows the head rotating clockwise. Inside the head, the two eyeballs each have a small
curved orange arrow rotating counter-clockwise, the opposite direction. Two straight
orange gaze lines go from the eyes to the target dot and stay perfectly on it. Small
stylized inner ear semicircular canals hinted on both sides of the head in blue.
Symmetric, centered, schematic. [BLOQUE DE ESTILO]
```

**Revisar:** que las flechas de ojo vayan AL REVÉS que la de cabeza. Es el
error más probable del generador y es todo el concepto.

## 3. `impulso.webp` — El impulso cefálico

**Tiene que mostrar:** el examinador detrás, dando un giro **chico y rápido**
a la cabeza del paciente. El paciente mira fijo adelante. El movimiento
sugerido con líneas de velocidad **azules** cortas, no con un giro grande.

```
Front-side view of a seated patient and an examiner standing behind, the examiner's
hands on the top of the patient's head, rotating the head sharply but only slightly to
one side, about 15 degrees. Short blue motion lines next to the head show a quick small
rotation. The patient's eyes stay fixed forward on a small dot in front, marked by a
straight orange gaze line. Focus on the head and hands, upper bodies only.
[BLOQUE DE ESTILO]
```

## 4. `montaje.webp` — Cámara y luz

**Tiene que mostrar:** vista lateral de la mesa. Laptop con la cámara **a la
altura de los ojos** del paciente (la laptop sobre unos libros o un soporte),
a un brazo de distancia. Una lámpara o luz suave **de frente** al paciente.
Detrás del paciente, pared lisa: **ninguna ventana**.

```
Side view of a seated patient in front of a laptop raised on a stack of books so the
webcam is exactly at the patient's eye level, about one arm's length away. A soft desk
lamp beside the laptop lights the patient's face from the front. Behind the patient
there is a plain wall, no window. A thin orange line runs horizontally from the eyes to
the webcam, showing they are level. Clean, simple, schematic setup. [BLOQUE DE ESTILO]
```

## 5. `postura.webp` — Postura y blanco

**Tiene que mostrar:** perfil de la cabeza y el cuello, con la cabeza
**flexionada unos 30° hacia abajo** (mentón hacia el pecho), y la mirada
—línea **naranja**— yendo a la cámara de la laptop. Un arco que marque el
ángulo de flexión, sin número.

```
Strict side profile of a seated person's head, neck and shoulders. The head is tilted
forward and down about 30 degrees, chin toward the chest. A thin grey dashed line shows
the neutral upright head axis and a solid blue line shows the tilted axis, with a small
blue arc between them marking the angle. The eyes look up and forward along a straight
orange line to the webcam of a laptop in front. No numbers on the angle.
[BLOQUE DE ESTILO]
```

## 6. `manos.webp` — Las manos del examinador

**Tiene que mostrar:** **dos cuadros lado a lado**, la misma persona vista de
frente con manos de otro detrás.

- Izquierda, **borde verde**: manos sobre la parte alta de la cabeza, cara
  despejada —ojos, cejas, pómulos a la vista—.
- Derecha, **borde rojo**: los dedos sobre las sienes y las cejas, tapando
  parte de la cara.

```
Split image, two side-by-side panels of the same seated patient seen from the front,
with the hands of an examiner standing behind. Left panel with a thin green #2e9e54
border: the examiner's hands rest on the top of the head, the whole face clearly
visible, eyes, eyebrows and cheeks uncovered. Right panel with a thin red #d62d2d
border: the examiner's fingers press on the temples and eyebrows, partially covering the
face near the eyes. Same pose and framing in both panels. [BLOQUE DE ESTILO]
```

**Revisar las manos con cuidado** (dedos de más, manos fundidas). Si el
generador no puede hacer los dos cuadros juntos, generar cada uno aparte y
unirlos:

```sh
magick bien.png mal.png -resize x900 +append -resize 1600x900^ -gravity center -extent 1600x900 manos.png
```

## 7. `calibracion.webp` — Calibrar el paralaje

Aparece en la tarjeta flotante: **lo importante en la franja central**.

**Tiene que mostrar:** de frente, una persona mirando fijo un **punto rojo**
delante suyo mientras gira la cabeza **lento** de lado a lado. Un arco **azul**
amplio y tranquilo a los costados (unos ±20°), con la cabeza en dos o tres
posiciones fantasma semitransparentes. La mirada, **naranja**, siempre clavada
en el punto.

```
Front view of a person's head and shoulders, looking steadily at a small glowing red
dot in the center foreground. The head is shown in three semi-transparent ghost
positions, turned slightly left, centered, and turned slightly right, about 20 degrees
each way, with a wide calm blue double-headed arc above the head showing a slow
side-to-side rotation. Orange gaze lines from the eyes all converge on the red dot in
every position. Keep all important elements in the horizontal middle band of the
image. [BLOQUE DE ESTILO]
```

## 8. `impulsos.webp` — Dar los impulsos

Aparece en la tarjeta flotante: **lo importante en la franja central**.

**Tiene que mostrar:** **dos cuadros**, una cabeza **vista desde arriba** en
cada uno.

- Izquierda, **borde verde**: giro **corto**, ~15°, con una flecha **azul**
  corta y gruesa y líneas de velocidad (rápido).
- Derecha, **borde rojo**: giro **amplio**, más de 40°, con una flecha azul
  larga y fina, sin líneas de velocidad (lento).

```
Split image, two side-by-side panels, each showing a stylized human head seen from
directly above, nose pointing up. Left panel with a thin green #2e9e54 border: a short,
thick blue curved arrow shows a small quick rotation of about 15 degrees, with short
speed lines. Right panel with a thin red #d62d2d border: a long, thin blue curved arrow
shows a wide slow rotation of more than 40 degrees, no speed lines. A faint grey wedge
behind each arrow shows the angle covered. Keep everything in the horizontal middle
band of the image. [BLOQUE DE ESTILO]
```

## 9. `canales.webp` — Seis canales, tres planos

**Tiene que mostrar:** una cabeza **vista desde arriba**, nariz hacia arriba,
y los tres planos de los canales semicirculares. El **lateral** es el plano
de la imagen: una flecha curva **azul** que rodea la cabeza, bien visible,
porque es el que se mide. Los dos **verticales** (LARP y RALP) son dos
diagonales **grises punteadas** a 45° que se cruzan sobre la cabeza, más
apagadas: existen pero trainHIT no los mide. Junto a cada oreja, los tres
canales insinuados como tres anillitos.

```
Top-down view (from the ceiling) of a stylized human head, nose pointing up, centered.
A large curved blue arrow circles around the head in the image plane (horizontal
rotation), strong and clear. Two gray dashed diagonal lines at 45 degrees cross over the
head from corner to corner, forming an X, clearly fainter than the blue arrow. Near each
ear, three tiny interlocking rings suggest the semicircular canals of the inner ear, one
blue and two gray. Symmetric, schematic, calm. [BLOQUE DE ESTILO]
```

**Revisar:** que el giro azul se lea como el protagonista y las diagonales
como secundarias. Si las diagonales salen del mismo color que el giro, no sirve.

## 10. `limites.webp` — Lo que esto no es

**Tiene que mostrar:** que esto es una herramienta de aprender, no un equipo
médico. A la derecha, una **laptop de frente** con su cámara, y sobre ella
una **cruz médica gris tachada** con un círculo rojo de prohibido. A la
izquierda, una curva de impulso **azul** con **pocos puntos** sobre el pico
—cuatro o cinco—, unidos por rectas: la cámara lenta ve pocas muestras.

```
On the right, a generic open laptop seen from the front with a small webcam dot on top
of the screen. Floating above the laptop, a plain gray medical cross inside a red
prohibition circle with a diagonal red slash. On the left, a small dark chart panel with
a single blue bell-shaped curve drawn with only five or six big blue dots connected by
straight segments, sparse samples over the peak. Clean, balanced composition.
[BLOQUE DE ESTILO]
```

**Revisar:** que el símbolo tachado no parezca una ambulancia, un hospital ni
una marca. Es la idea «no es un equipo médico», sin texto.

## 11. `casos.webp` — Cómo se lee un caso

**Tiene que mostrar:** dos paneles de gráfico oscuros, como los de la app,
uno al lado del otro. En el de la izquierda la curva **azul** (cabeza) y la
**naranja** (ojo) se tapan. En el de la derecha la naranja queda a la mitad
de alto y más tarde aparece un **pico naranja angosto** con un **triángulo
rojo** encima. Una **lupa** gris sobre ese pico.

```
Two dark rounded chart panels side by side, like a medical software screen. Left panel:
a blue bell curve and an orange bell curve almost perfectly overlapping. Right panel:
the same blue bell curve, the orange curve only half its height, and later a narrow
sharp orange spike with a tiny red triangle marker above it. A gray magnifying glass
hovers over the orange spike in the right panel. Flat, schematic, no axes labels.
[BLOQUE DE ESTILO]
```

## 12. `casos-cierre.webp` — Lo que dejan los casos

**Tiene que mostrar:** tres tarjetas en fila, cada una con una **tilde verde**
en la esquina, que resumen lo que hay que mirar: (1) dos **barras** —una
**azul** alta y una **violeta** baja— contra una línea de corte punteada;
(2) un gráfico chico con la curva naranja y una **sacada marcada con un
triángulo violeta**; (3) una lista de renglones grises, casi todos con una
**cruz roja** y pocos con **tilde verde**.

```
Three dark rounded cards in a row, each with a small green check mark in its top right
corner. Card one: a tall blue bar and a short violet bar standing next to each other,
with a gray dashed horizontal line crossing between their heights. Card two: a tiny
chart with a blue bell curve and an orange curve with a narrow spike marked by a small
violet triangle. Card three: five gray horizontal rows like a list, three marked with
red crosses and two with green checks. Minimal, icon-like, evenly spaced.
[BLOQUE DE ESTILO] Also use violet #9b51d0 for the covert saccade marker and the short bar.
```

## 13. `simulado.webp` — Examinar un paciente que no existe

**Tiene que mostrar:** una persona **sana** de frente (el compañero que hace
de paciente) y, al lado, una **ampliación circular de uno de sus ojos**. En
la ampliación: el iris real **naranja** en el centro y un **anillo violeta**
del mismo tamaño **corrido hacia un costado**, con una flechita violeta: ahí
estaría el iris con la patología simulada. Un cono fino une el ojo con la
ampliación.

```
Left: a friendly adult seen from the front, head and shoulders, calm neutral
expression, casual clothes. A thin circle around one of their eyes connects with two
thin gray lines to a large circular magnified view on the right. Inside the magnified
view: the eye with a white sclera, an orange iris with a dark pupil exactly in the
center, and an empty violet ring of the same size shifted sideways from the iris, plus
a small violet arrow pointing in the direction of the shift. The violet ring must look
like a ghost or overlay, not a second eye. [BLOQUE DE ESTILO] Also use violet #9b51d0
for the ghost iris ring.
```

**Revisar:** que el anillo violeta se entienda como una superposición sobre el
ojo real y no como un ojo deforme o con dos iris.

## 14. `pulsos.webp` — Hacen falta pulsos (paciente de ejemplo)

**Tiene que mostrar:** un **paciente sintético**: una cabeza de frente
dibujada **con puntos**, como hecha de datos, sin rasgos de una persona real,
con los ojos **naranjas**. De la cabeza salen tres líneas grises que llegan a
**tres paneles chicos** apilados, cada uno con un pulso: uno **normal**
(curvas superpuestas), uno con una **sacada manifiesta** (triángulo **rojo**
después del pulso) y uno con una **encubierta** (triángulo **violeta** en el
pulso).

```
Left: a stylized human head seen from the front made only of evenly spaced gray dots,
like a point cloud or data mannequin, with two small orange dots as eyes and a dotted
nose, no other features, clearly artificial. From the right side of the head, three
thin gray curved lines branch out to three small stacked dark chart panels on the
right. Each panel shows a blue bell curve and an orange curve: top panel curves
overlapping; middle panel orange lower with a later narrow orange spike marked by a
tiny red triangle; bottom panel with a narrow orange spike during the blue curve marked
by a tiny violet triangle. [BLOQUE DE ESTILO] Also use violet #9b51d0 for the covert
marker.
```

---

## Después de agregarlas

1. Copiar cada `.webp` acá con el nombre exacto de la tabla.
2. Cambiar la extensión en `js/tutorial-pasos.js` (de `.svg` a `.webp`) de las
   que se reemplazaron.
3. Abrir **Aprender** en la barra (o `T`) y pasar por los paseos: ningún paso
   tiene que mostrar el recuadro «imagen pendiente».
4. `npm test`: el test del tutorial comprueba que cada imagen que nombran los
   pasos esté en esta tabla o en la carpeta.
