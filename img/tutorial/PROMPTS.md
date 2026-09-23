# Imágenes del tutorial

El tutorial (`js/tutorial.js`, pasos en `js/tutorial-pasos.js`) ya funciona
sin imágenes: donde falta una muestra un recuadro con el nombre del archivo.
Apenas el archivo aparece en esta carpeta con ese nombre, se ve.

Son **8 ilustraciones** para generar. Los dos gráficos de curvas
(`ganancia.svg` y `sacadas.svg`) **no** están acá: están dibujados con
`diagramas.mjs` a partir de curvas sintéticas, porque un generador de imágenes
inventa la forma de las curvas, y la forma es justo lo que se enseña.

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

---

## Después de agregarlas

1. Copiar cada `.webp` acá con el nombre exacto de la tabla.
2. Abrir **Aprender** en la barra (o `T`) y pasar por los paseos de conceptos,
   preparación y primera medición: el recuadro «imagen pendiente» tiene que
   haber desaparecido.
3. `npm test`: el test del tutorial comprueba que cada imagen que nombran los
   pasos esté en esta tabla o en la carpeta.
