# trainHIT

vHIT (video Head Impulse Test) **didáctico**, en el navegador, con la webcam del
equipo. Sin instalar nada: se abre `index.html` desde un servidor local y mide.

Es el repo hermano de [vhit-wout-google](https://github.com/Debaq/vhit-wout-google),
que es el motor nativo en Rust. Acá el objetivo no es medir mejor: es que cada
paso del cálculo **se vea**, se pueda tocar y se entienda por qué está hecho así.

> **No reemplaza a un equipo clínico.** Corre a los 30 fps de una webcam común;
> un vHIT de gafas usa cámara >250 Hz, y el remoto comercial más lento va a 100 fps.
> Por eso mismo **se procesa como mucho a 100 fps** aunque la cámara dé más
> (ver [Tope de 100 fps](#tope-de-100-fps)).

Medir con cámara remota y sin gafas **es otro método, no un vHIT incompleto**.
Hay normativos publicados con cámara remota a 100 fps y blanco a 1–1,3 m
([Wiener-Vacher & Wiener, 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5594068/)),
y el enfoque tiene una ventaja propia: sin gafas no existe el deslizamiento, un
artefacto documentado que con gafas flojas llega a dar ganancias instantáneas de
1,24, que no son fisiológicas. Lo que separa a esto de un equipo clínico son la
tasa de cuadros, la distancia al objetivo sin fijar y la falta de validación
propia, no la ausencia de giroscopio.

## Uso

```
python3 -m http.server 8080
```

y abrir <http://localhost:8080>. Hace falta servidor (no `file://`): los módulos
ES y `getUserMedia` lo exigen. En red hace falta HTTPS; en `localhost` no.

La primera carga baja de CDN el runtime de MediaPipe Tasks Vision y el modelo
`face_landmarker.task`; después quedan guardados. Todo el procesamiento —y el
video— se queda en la máquina.

### Sin red

Un service worker (`sw.js`) guarda lo pesado —runtime y modelo, unos 10 MB— la
primera vez, y los archivos propios cada vez que se cargan. Después la página
abre y mide sin conexión. Es para el aula, donde el wifi falla. Los archivos
propios se piden con red primero, así que una versión nueva se baja sola; sin
red se sirve la última copia que haya. Sin service worker (navegador viejo,
`file://`) la página funciona igual, solo que necesita red.

### La pantalla

Sigue el reparto del motor nativo: a la izquierda el video con los puntos de
seguimiento, los dos ojos ampliados y los controles; al centro un panel por
lado —ganancia media ± DE, todos los impulsos superpuestos y la lista de
pulsos—; abajo, a lo ancho, la velocidad contra el tiempo.

«Derecha» e «izquierda» son las del paciente: un impulso hacia su derecha cae
en el panel derecho. El yaw del motor tiene el signo contrario (positivo es
hacia la izquierda del paciente) y el lado se nombra en un solo lugar,
`SIGNO_DERECHA` de `js/analysis.js`.

Los paneles de cada lado se normalizan con el impulso **hacia arriba** y la
traza ocular invertida, que es la convención clínica: con VOR normal las dos
curvas se superponen y la separación entre ellas es el hallazgo.

En pantallas chicas la cámara pasa a un cuadrito con los ojos al lado y los dos
paneles quedan igual lado a lado. Con el teléfono de costado se vuelve a dos
columnas —cámara y controles a la izquierda, los paneles ocupando el resto— y se
recogen la lista de pulsos y las lecturas, que es lo que sobra cuando falta
alto.

El botón **Herramientas** abre el cajón didáctico: el ajuste del paralaje
dibujado, el último pulso con su ventana, la nube de ganancia contra pico y las
perillas. El **?** de la barra vuelve a abrir la bienvenida.

**Suavizar** interpola entre muestras con Hermite monótona (Fritsch-Carlson,
`js/curve.js`). Se eligió monótona y no una spline cualquiera porque
Catmull-Rom o la cúbica natural **sobrepasan** los datos: dibujarían un pico de
velocidad que nunca se midió, y el pico es uno de los números que se reportan.
Aun así suavizar hace parecer más precisa una señal de 30 fps, así que mientras
está encendido las trazas de cada pulso muestran los puntos de las muestras
reales —y el interruptor lo apaga—.

### El «me gusta»

El corazón de la barra suma en un contador público y anónimo
([Abacus](https://abacus.jasoncameron.dev)), justamente para que no haga falta
cuenta de GitHub ni de nada para dejar constancia de que la página sirvió. Se
manda una petición sin datos: no viaja el video, ni las mediciones, ni nada de
la sesión. Un voto por navegador, recordado en `localStorage`.

Aparte del modelo de MediaPipe, es lo único que sale de la página: una lectura
del número al cargar y, si alguien aprieta el botón, el voto. Ninguna de las
dos lleva datos.

### Versión y caché

Cada archivo se pide con `?v=…`, así que al publicar alcanza con recargar: no
hace falta recarga forzada. La versión vive en el mapa de importación de
`index.html`, que versiona los `import` internos (no heredan el `?v=` del
script de entrada); `js/arranque.js` la lee de ahí para la hoja de estilo y el
módulo de entrada, y se muestra en la bienvenida y en Herramientas. Se sube
con `./bump.sh`, que regenera el mapa con todos los módulos de `js/`.
`index.html` y `js/arranque.js` quedan sujetos a la caché del servidor: GitHub
Pages los sirve con `max-age=600`.

`index.html` lleva una política de seguridad (CSP) que prohíbe scripts en
línea y limita las conexiones a lo que la página usa: jsdelivr y Google
Storage para MediaPipe, y Abacus para el contador. El mapa de importación no
puede ser externo, así que va autorizado por su hash sha256 en la CSP;
`bump.sh` actualiza los dos y `npm test` comprueba que coincidan.

### Atajos

| Tecla | Qué hace |
|---|---|
| `C` | Calibrar el paralaje (10 s). **Obligatorio antes de creerle a la ganancia.** |
| `R` | Borrar todos los pulsos |
| `D` | Descartar el último |
| `H` | Abrir o cerrar las herramientas |
| `Espacio` | Pausar el análisis (la cámara sigue) |

## Tope de 100 fps

Si la cámara puede entregar más de 100 cuadros por segundo, trainHIT la pide
a 100 como máximo y, si igual llegan más, descarta los que sobran. En la barra
aparece **TOPE 100 FPS** con la explicación al pasar el mouse.

No es una limitación técnica: es una decisión. Con una cámara rápida los
números de esta página empezarían a parecerse a los de un equipo clínico sin
tener ni la validación ni el control de la distancia al objetivo que eso
exige. El tope está para que nadie use esto como equipo médico. Está en
`FPS_MAX` de `js/tracker.js`, y el aviso en `avisaTope` de `js/app.js`.

## Calibrar primero, y por qué

La página arranca marcando **SIN CALIBRAR** en rojo. El centro de rotación del
ojo está unos milímetros detrás del plano de las comisuras, así que girar la
cabeza produce un desplazamiento aparente del iris que no viene de ningún
movimiento ocular:

```
offset_medido = R·sin(φ) − t·sin(H)
⇒ sin(φ) = offset/R + k·sin(H),   k = t/R ≈ 0,9–1,0
```

Ese artefacto tiene **la misma magnitud que la señal**. Con `k = 0` un VOR
perfecto se lee como ganancia ~1,9. Por eso `k` no se asume: se mide.

La maniobra: fijar un punto quieto y mover la cabeza **lento** 10 s, cubriendo
±20°. A baja velocidad el VOR es esencialmente perfecto, o sea que el azimut de
mirada tiene que quedarse constante; de esa restricción sale una recta y `k` es
su pendiente cambiada de signo. El panel de calibración dibuja esa recta: que se
vea **es** la prueba de que lo medido es paralaje y no otra cosa.

Se rechaza la calibración si el rango de cabeza fue menor a 20°, si el residuo
supera 2,5° o si `k` da un disparate. Cada rechazo dice qué hacer distinto.

## Cómo está hecho

```
js/geom.js      iris como regla, ángulo de mirada, ajuste del paralaje
js/head.js      rotación de cabeza: incrementos proyectados sobre el eje del canal
js/signal.js    derivada por ajuste polinómico sobre ventana temporal
js/analysis.js  ventana del impulso, ganancias, criterios de aceptación
js/pipeline.js  de muestras crudas a pulso analizado: lo que corre al medir y al recalcular
js/tracker.js   MediaPipe Face Landmarker + cámara + bucle de frames
js/plots.js     los cuatro gráficos, en canvas y sin librerías
js/app.js       el cableado y la interfaz
```

Las cinco decisiones que importan, resumidas:

1. **El iris es la regla.** Su diámetro es ~11,7 mm con poca varianza
   poblacional, y al proyectarse el semieje mayor de la elipse sigue midiendo el
   radio real. Da una escala px/mm independiente de la distancia y del giro. El
   ancho del ojo no sirve: se acorta con cos(yaw) *correlacionado en el tiempo
   con el impulso*, o sea que es sesgo dentro de la ventana medida, no ruido.
2. **El ángulo sale de un modelo esférico**, `sin(azimut) = offset_mm/R`, no de
   una regla de tres con una constante inventada.
3. **La cabeza se mide por incrementos proyectados sobre el eje de la cabeza.**
   El canal semicircular viaja con la cabeza, y en un vHIT la cabeza está
   flexionada ~30°: ahí el yaw de Euler sobreestima +15 % y proyectar sobre el
   eje del mundo subestima −13 %.
4. **Se deriva con un ajuste polinómico de grado 2** sobre una ventana temporal,
   usando los timestamps reales del frame (`requestVideoFrameCallback`). Grado 1
   aplanaría el pico, que es el valor que se quiere medir.
5. **La ganancia se calcula con posiciones**, `1 − Δmirada/Δcabeza` entre onset y
   offset. Con los mismos extremos es idéntica a integrar velocidades, y no
   arrastra el ruido de derivar.

## Lo que este método no hace

- **No desacadiza.** Las sacadas correctivas quedan dentro de la ganancia, y el
  sesgo es direccional: infla la ganancia justo en el paciente con déficit. Es
  un sesgo hacia el **falso negativo**. El corte de 0,80 que dibuja el gráfico
  viene de estudios que sí desacadizan: no es el corte de este número.
- **No fija la distancia al objetivo**, de la que la ganancia VOR depende por
  convergencia. El modelo de paralaje asume un objetivo pegado a la cámara.
- **30 fps.** El pico del impulso cae entre dos muestras, y la ganancia
  instantánea a 60 ms queda con dos frames de soporte: se calcula pero no se
  reporta.
- **Cabeza y ojo salen de la misma imagen**, así que un error de seguimiento
  entra en las dos señales a la vez. No es el precio de no tener giroscopio: es
  la contrapartida de medir la cabeza donde está el ojo.
- **Solo canal lateral.** Los verticales necesitan la componente vertical del
  movimiento ocular, más ruidosa por el párpado.

El análisis largo de todo esto está en `GANANCIAS.md` del repo principal.

## De dónde salen los números

- [Halmagyi & Curthoys, 1988](https://pubmed.ncbi.nlm.nih.gov/3390028/) — el
  impulso cefálico como signo clínico. *Arch Neurol.*
- [MacDougall et al., 2009](https://pubmed.ncbi.nlm.nih.gov/19805730/) — el vHIT
  contra bobina escleral. De acá sale el corte de 0,80, medido con ganancia de
  área **desacadizada**, ~250 Hz y blanco a ~1 m. *Neurology.*
- [Wiener-Vacher & Wiener, 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5594068/)
  — normativos con cámara remota a 100 fps y blanco a 1–1,3 m: el precedente del
  enfoque sin gafas. *Front Neurol.*
- [Judge et al., 2018](https://pubmed.ncbi.nlm.nih.gov/29865935/) — la distancia
  y el tamaño del blanco cambian la ganancia medida. *Otolaryngol Head Neck Surg.*
- [Castro et al., 2018](https://pubmed.ncbi.nlm.nih.gov/30537706/) — la distancia
  del objetivo y la ganancia del VOR. *Audiol Neurootol.*
- [Jacobsen et al., 2021](https://pubmed.ncbi.nlm.nih.gov/34057110/) — ganancia
  por regresión contra ganancia instantánea: cuál es más reproducible.
  *J Vestib Res.*
- [Money-Nolan & Devroede, 2023](https://pubmed.ncbi.nlm.nih.gov/36970532/) —
  revisión sistemática de qué hace variar la ganancia: no es un número fijo, y
  hacen falta normativos por equipo y protocolo. *Front Neurol.*
- [Du et al., 2021](https://pubmed.ncbi.nlm.nih.gov/32930021/) — ganancia y PR
  score en trastornos vestibulares periféricos. *Acta Otolaryngol.*
- [Zamaro et al., 2020](https://doi.org/10.3233/ves-200708) — los métodos de
  cálculo de ganancia en vHIT no son intercambiables entre sí. *J Vestib Res.*

## Tests y banco sintético

```
npm test          # tests con assert (node --test, sin dependencias)
npm run banco     # imprime los números del banco sintético
```

Los dos corren el mismo pipeline sobre impulsos generados con ganancia
conocida (`test/sintetico.mjs`), sin cámara ni MediaPipe. Los tests afirman
que el motor devuelve la ganancia que se le puso a 30, 60 y 120 fps, que los
rechazos disparan cuando corresponde, que `fitParallax` recupera la `k` con la
que se generaron los datos y rechaza una calibración mala, que el eje de cabeza
no mezcla un cabeceo con el canal lateral, y que el suavizado no sobrepasa las
muestras. Corren en CI con cada push.

El banco sirve para **ver el efecto del paralaje sin calibrar**: con `k = 0` un
VOR perfecto se lee 1,95.

## Las perillas

Todo lo que en un equipo comercial es una constante escondida, acá es un slider:
ventana y grado del derivador, umbrales de inicio y fin del impulso, rango de
pico y de duración aceptados, umbral de parpadeo, y un `k` que se puede poner a
mano para **ver** cómo el paralaje mueve la ganancia entera.

Mover una perilla no recalcula los pulsos viejos: afecta a los siguientes, y
los números de la tabla son los que se midieron con la configuración que había
en ese momento. Pero cada pulso guarda sus muestras crudas —yaw y offset del
iris por frame—, y el botón **Recalcular** de Herramientas vuelve a correr el
motor entero sobre todos con las perillas, los umbrales y el `k` de ahora. Es
la forma de ver qué hace cada perilla sobre un pulso ya medido: subir la
ventana del derivador y ver cómo baja el pico, o poner `k = 0` y ver la
ganancia irse a 1,9, sin tener que hacer otro impulso. El motor que corre al
medir y al recalcular es el mismo (`js/pipeline.js`), así que con la misma
configuración da lo mismo.

Los dos botones de CSV bajan un pulso por fila (con la configuración con la
que se calculó cada uno) o una muestra por fila de todos los pulsos, con lo
derivado y lo crudo al lado, para rehacer el cálculo en una planilla.

## Licencia

Apache-2.0, igual que el repo principal.
