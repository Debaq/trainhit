# trainHIT

Desarrollado en **TecMedHub**, Universidad Austral de Chile.

vHIT (video Head Impulse Test) **didáctico**, en el navegador, con la webcam del
equipo. Sin instalar nada: se abre `index.html` desde un servidor local y mide.

Es el repo hermano de [vhit-wout-google](https://github.com/Debaq/vhit-wout-google),
que es el motor nativo en Rust. Acá el objetivo no es medir mejor: es que cada
paso del cálculo **se vea**, se pueda tocar y se entienda por qué está hecho así.

> **No reemplaza a un equipo clínico.** Corre a los 30 fps de una webcam común;
> un vHIT de gafas usa cámara >250 Hz, y el remoto comercial más lento va a 100 fps.
> Por eso mismo **se procesa como mucho a 60 fps** aunque la cámara dé más
> (ver [Tope de 60 fps](#tope-de-60-fps)).

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
| `Z` | Devolver el último descartado |
| `H` | Abrir o cerrar las herramientas |
| `T` | Abrir o cerrar «Aprender a usar» |
| `Espacio` o `P` | Pausar y congelar la traza de abajo para medirla (la cámara sigue) |

## Aprender a usar

**Aprender**, en la barra (o `T`, o el botón de la bienvenida), abre un menú de
paseos cortos, cada uno sobre un tema y en cualquier orden:

| Paseo | De qué trata |
|---|---|
| Qué mide un vHIT | el reflejo, el impulso, los seis canales, la ganancia, las sacadas, qué patrones se buscan, los límites |
| Preparar la sesión | cámara, luz, postura, manos del examinador |
| La primera medición | con la cámara: calibrar, impulsos, paneles, lista, CSV |
| Leer los gráficos | la regla, los rechazados, la asimetría, promedio, suavizar, orientación, pausa |
| Casos a ciegas | cinco pacientes sintéticos sin diagnóstico: el alumno responde qué patrón ve |
| Herramientas por dentro | la recta del paralaje, el último pulso, ganancia contra pico, los tres métodos de ganancia, k a mano |
| Las perillas del motor | cada perilla, probada con «Recalcular» sobre pulsos ya medidos |

Las tarjetas de leer van al centro con el fondo tapado. Las demás iluminan la
parte de la pantalla de la que hablan y dejan la página usable, porque lo que se
señala tiene que poder apretarse. Algunos pasos esperan algo —la cara, una
calibración aceptada, pulsos, un recálculo—, pero la espera nunca traba: el
botón dice «Saltar» hasta que se cumple. El menú marca con ✓ los paseos
terminados (en `localStorage`, solo como comodidad).

Lo que un paseo rompe a propósito no se queda roto: el de herramientas pone
`k = 0` para mostrar el paralaje, así que ese paso va último y el `k`
calibrado vuelve solo al dejar el paseo por cualquier camino (`alSalir`). Las
esperas miran lo que pasa **durante** el paso: un Recalcular de otro paseo no
cuenta, y la calibración del paciente de ejemplo no cuenta como calibrar.

### Pulsos de ejemplo

Los paseos de gráficos, herramientas y perillas necesitan pulsos, y no siempre
hay alguien a quien darle impulsos. Por eso arrancan ofreciendo los de un
**paciente sintético** (`js/ejemplo.js`): canal derecho sano, izquierdo con
déficit y sacadas encubiertas, un pulso lento y uno con parpadeo, más su
calibración. No son resultados armados a mano: son muestras crudas por frame
que pasan por el motor entero, así que las perillas y «Recalcular» les hacen lo
mismo que a un pulso medido.

Como el motor no desacadiza, alguno del lado malo se lee normal: la sacada
encubierta le tapa el déficit. Es el sesgo al falso negativo, a la vista.

Los ejemplos reemplazan la sesión (mezclar pulsos sintéticos con medidos daría
una media que no es de nadie), salen marcados **ej** en la lista y con
`ejemplo=si` en el CSV, y la barra dice **EJEMPLO k=…** en vez de CALIBRADO,
porque esa calibración es la del paciente sintético. Se van solos al encender la
cámara o con **Borrar todos**, y vuelve la calibración que había.

### Casos a ciegas

Cinco pacientes sintéticos (`CASOS` en `js/ejemplo.js`), cada uno con una
letra y sin decir qué tiene. El alumno los carga, mira los paneles y elige un
patrón de una lista que es la misma para todos —si cada caso trajera sus
opciones, la lista delataría la respuesta—. Errar da una pista de dónde
mirar y se puede volver a intentar; acertar da la explicación.

| Caso | Patrón | Lo que enseña |
|---|---|---|
| A | normal | la referencia |
| B | déficit derecho, sacadas manifiestas | la neuritis de libro, y el signo de la asimetría |
| C | déficit bilateral | una asimetría de cero no es un resultado normal |
| D | déficit izquierdo con sacadas encubiertas | la media se lee normal (¡>1!): el falso negativo de no desacadizar |
| E | casi todo rechazado | sin pulsos aceptados no se concluye |

Son muestras crudas que pasan por el motor entero, igual que el ejemplo de
siempre. El test genera cada caso y comprueba que el motor muestre el patrón
que dice su respuesta, así una pregunta no puede quedar con la respuesta
equivocada sin que CI lo note.

### Preguntas para Moodle

**Preguntas para Moodle (GIFT)**, en Herramientas › Para docentes (y al final
de los casos), baja un `.txt` en formato GIFT para importar en el banco de
preguntas: una por cada caso a ciegas y un banco de conceptos —paralaje,
sacadas, sesgo al falso negativo, canales, asimetría, calibración, rechazos,
una numérica de ganancia, un verdadero/falso y un emparejamiento de
métodos— (`js/preguntas.js`). El enunciado de cada caso lleva los números
que el motor le saca **al exportar** —medias, aceptados, motivos de rechazo,
sacadas, asimetría—, así que si el motor cambia las preguntas cambian con él.
`test/preguntas.test.mjs` revisa que cada una tenga su título, un solo bloque
de respuestas, una sola correcta y la sintaxis de GIFT escapada: un `=`
suelto en un enunciado rompe la pregunta y el error aparece recién al subirla.

### Dónde está cada cosa

El mecanismo está en `js/tutorial.js` y el contenido en `js/tutorial-pasos.js`,
datos puros que `test/tutorial.test.mjs` recorre: cada objetivo tiene que
existir en `index.html`, cada imagen tiene que estar en `img/tutorial/` o
encargada en `img/tutorial/PROMPTS.md` (con su prompt y la guía de estilo), y
el paciente de ejemplo tiene que hacer lo que dicen los textos —el lado sano en
~1, k = 0 dando ~1,9, la ventana de 200 ms dejando pulsos en MUY LENTO—. Si el
motor cambia y eso deja de ser cierto, el test lo dice antes que un alumno.

Mientras una imagen falta se ve un recuadro con su nombre. Los dos gráficos de
curvas no se generan con IA —inventaría la forma de las curvas, que es lo que se
enseña—: los dibuja `node img/tutorial/diagramas.mjs`.

## Medir sobre el gráfico

El puntero sobre cualquier gráfico de pulsos —los dos paneles de lado y el
del pulso solo— es una regla: el cursor marca el instante y el cartel da el
valor de cabeza y de ojo. Un clic fija una referencia y a partir de ahí el
cartel suma, contra ese punto:

- **Δt** y el salto de cada traza;
- el **área** de cada una en el tramo, sombreada bajo la curva. Integrar
  velocidad da desplazamiento, así que esa superficie son los grados que giró
  la cabeza —y los que se movió el ojo— en ese tramo;
- la **ganancia del tramo**, que es el cociente de las dos áreas: la misma
  cuenta que hace el motor sobre la ventana del impulso, acá sobre la ventana
  que uno elija.

Otro clic suelta la referencia.

Con el dedo no hay «pasar por encima», así que la regla va por toques: el
primero pone el cursor, el segundo fija la referencia, arrastrar de costado
mide y otro toque la suelta. Arrastrar hacia arriba o abajo sigue desplazando
la página (`touch-action: pan-y`). Antes, levantar el dedo borraba el cursor y
no había forma de fijar una referencia en un teléfono.

La traza de abajo se mide igual, pero antes
hay que congelarla con `Espacio` (o `P`): la cámara sigue encendida y lo que
se detiene es el análisis. Un pulso ya medido no se mueve, así que ahí no hace
falta pausar nada.

Hay un cursor a la vez, el del gráfico donde está el puntero: dos cursores
vivos en paneles distintos se leen como si midieran lo mismo, y no es así.

Sin esto solo se podía estimar a ojo contra la grilla, y la separación entre
cabeza y ojo —que es el hallazgo— es justo lo que hay que poder medir.

## Sacadas

`detectaSacadas` (`js/analysis.js`) busca, desde el inicio del impulso hasta
el final de la ventana, los tramos donde la mirada salta **hacia el blanco**
más rápido que 80 °/s. Con VOR normal la mirada queda quieta; con déficit se
arrastra con la cabeza, y la sacada es el salto de vuelta, con el signo
contrario. Si arranca antes del fin del impulso es **encubierta**; si no,
**manifiesta**. En los paneles cada una lleva un triángulo sobre su pico
—violeta encubierta, rojo manifiesta, los colores del motor nativo— y en la
lista una columna con los mismos triángulos. «Marcar sacadas», en
Presentación, lo apaga.

La **ganancia hasta la sacada** es la de área cortada justo antes de la primera
sacada encubierta: lo que viene después ya es corrección, no reflejo. Es una
desacadización aproximada —a 30 fps quedan dos o tres cuadros antes de la
sacada— y está para comparar con la reportada y ver cuánto la infló la
sacada. Con el caso D, la de área da ~1,04 a la izquierda y esta ~0,49.

El umbral es bajo a propósito: a 30 fps y con el derivador de 50 ms, una
encubierta temprana se ve de ~90 °/s porque se superpone con el arrastre. Con
los pacientes sintéticos el ruido de la mirada no pasa de 10 °/s; con una
webcam real puede haber falsas sacadas, y es parte de lo que se aprende a
mirar.

## Tres métodos de ganancia

**Ganancia vs pico**, en Herramientas, tiene un selector de **método** —área,
instantánea a 60 ms y cociente de picos— y una tabla con la media por lado y
la asimetría de cada uno, sobre los mismos pulsos aceptados. El motor siempre
calculó las tres, pero las otras dos vivían en un tooltip; lado a lado se ve
lo que dice la literatura (Zamaro et al., 2020): no son intercambiables, y una
ganancia sin su método no se compara con otra.

## Qué es cada número

Cada lectura y cada chip de la barra explica qué es al pasar el mouse, y
**Qué es cada número**, abajo de las lecturas, dice lo mismo a la vista para
las pantallas táctiles, donde no hay mouse que pase por encima.

## Curva promedio

**Curva promedio del lado**, en Herramientas, superpone la media de los pulsos
aceptados de cada panel, más gruesa que los pulsos sueltos porque es el
resumen y no uno más. Los pulsos no comparten instantes —cada uno se disparó
en un frame distinto—, así que se promedian sobre una grilla de tiempo común
interpolando cada uno. Los rechazados quedan afuera: promediar un pulso con la
cara perdida ensucia la media justo donde importa. Con el promedio a la vista,
el cursor mide sobre él.

Promediar es lo que hace visible lo que un pulso suelto esconde: el ruido de
seguimiento se va y queda la forma.

**Espejar**, **suavizar**, la curva promedio y la orientación viven en
Herramientas: son ajustes de presentación, y en la barra del video quedaba
todo mezclado con los controles de la medición. Ahí abajo quedan la cámara y
el botón de pausa.

El botón de pausa era una casilla perdida entre las opciones del video. Ahora
es un botón que se ve apretado cuando lo está (`aria-pressed`), y el atajo
funciona aunque el foco esté en otro botón: antes el espacio ACCIONABA ese
botón además de pausar, así que pausar justo después de encender la cámara la
apagaba.

## Orientación de los paneles

Dos modos, que son **una sola decisión** con dos combinaciones coherentes
(igual que `PanelOrientation` y `TraceSides` en el motor nativo):

- **Comparar lados**: los dos paneles se normalizan con el impulso hacia
  arriba y la traza ocular va invertida, para que se superponga con la de
  cabeza. Lo que se lee es la separación entre curvas. Es el modo por defecto.
- **Dirección real**: cada impulso va hacia su lado —derecha del paciente
  arriba, izquierda abajo— y la traza ocular va cruda, o sea al revés que la
  cabeza, porque el VOR es un reflejo compensatorio.

Dos cosas que es fácil hacer mal y acá están cubiertas por tests:

- La banda verde de velocidad aceptada y los umbrales del impulso tienen que
  caer **del lado donde se dibuja el pulso**, que no es el factor del panel a
  secas (`signoBanda` en `js/plots.js`).
- «Dirección real» no es dibujar la señal cruda. El motor tiene el yaw
  positivo hacia la **izquierda** del paciente (`SIGNO_DERECHA`), así que
  dibujarla tal cual manda el impulso derecho hacia abajo, que es lo contrario
  de lo que el modo promete.

## Pulsos rechazados

Un pulso rechazado se dibujaba más pálido y nada más: alcanzaba para no
confundirlo con los buenos, pero no para saber qué salió mal sin ir a la
tabla. Ahora el pulso que se está mirando lleva una caja punteada roja sobre
el tramo del impulso con el motivo escrito encima: `MUY LENTO`, `PARPADEO`,
`CARA PERDIDA`. En el overlay la caja es solo para el pulso seleccionado: con
diez rechazados encima, diez cajas no se leen.

## El punto de fijación

Al calibrar aparece un punto rojo arriba al centro, pegado al borde, con la
cuenta de lo que falta y el rango de cabeza logrado. Está ahí porque ahí está
la cámara de casi cualquier equipo: el blanco de los impulsos es la cámara
—el modelo de paralaje asume el objetivo pegado a ella— y calibrar mirando el
centro de la pantalla pedía una cosa para calibrar y otra para medir. Si la
cámara está en otro lado, se mira la cámara. El paciente tiene que mirar algo
quieto mientras gira la cabeza: si no fija, lo que se mide no es el paralaje
sino la mirada paseando. No captura el puntero, así que el operador sigue
usando los controles con el punto puesto.

## Tope de 60 fps

Si la cámara puede entregar más de 60 cuadros por segundo, trainHIT la pide
a 60 como máximo y, si igual llegan más, descarta los que sobran. En la barra
aparece **TOPE 60 FPS** con la explicación al pasar el mouse.

No es una limitación técnica: es una decisión. Con una cámara rápida los
números de esta página empezarían a parecerse a los de un equipo clínico sin
tener ni la validación ni el control de la distancia al objetivo que eso
exige. El tope está para que nadie use esto como equipo médico. Está en
`FPS_MAX` de `js/tracker.js`, y el aviso en `avisaTope` de `js/app.js`.

El tope se aplica dos veces: en la restricción que se le pide a
`getUserMedia` y, si el navegador la ignora, descartando los frames que llegan
de más (`limitadorDeCadencia` en `js/signal.js`). Ese filtro mira dos relojes
con papeles distintos: el de pared es la cota dura, y el del video
(`mediaTime`) se suma **solo mientras avanza**. Filtrando solo por el del
video, un reloj que miente rompe el tope —hubo un caso de 240 fps procesados
en Android con el tope en 60—; bloqueando cuando está congelado, la página
deja de procesar del todo.

El fps del chip de la barra es el de frames **procesados**, no el que entrega
la cámara. Si supera el tope se pone en rojo y salta el aviso: eso significa
que el tope no está funcionando en ese dispositivo, y es el dato que hace
falta para diagnosticarlo.

El tope operativo viene acompañado de un **umbral de validez** aparte,
`FPS_VALIDADO` en `js/analysis.js`. Son dos cosas distintas a propósito:

- `FPS_MAX` decide qué se le pide a la cámara y qué frames se descartan.
- `FPS_VALIDADO` decide si el resultado se puede leer como lo que trainHIT
  dice medir. La cadencia **se mide del pulso** (`cadenciaFps`, mediana de los
  intervalos entre muestras), no se declara: si un pulso se muestreó más
  rápido que el umbral, sale marcado `NO VALIDADO` encima de los gráficos y
  con `no_validado=si` y el `fps_muestreo` real en el CSV.

En uso normal —cualquier webcam a 30 o 60 fps— no se ve ninguna marca: el
estudiante trabaja con los gráficos limpios. Aflojar `FPS_MAX` no apaga el
rótulo, porque el rótulo no depende de `FPS_MAX` sino de los datos.

## La espera del modelo

La primera vez hay que bajar el runtime de MediaPipe y el modelo
`face_landmarker.task` —unos MB—, y esa espera antes era una pantalla quieta.
Ahora el modelo lo baja `bajaModelo` (`js/tracker.js`) leyendo el cuerpo de a
pedazos y se le pasa a MediaPipe ya resuelto en `modelAssetBuffer`: así se
puede contar lo que llega y mostrarlo. El modal es `#carga` en `index.html` y
lo maneja `modalCarga` en `js/app.js`.

No se abre de entrada. Espera `DEMORA_MODAL_MS` (350 ms): si el modelo ya está
en la caché del service worker la carga dura un suspiro y un modal que
aparece y desaparece molesta más que la espera. Si el servidor no manda
`Content-Length` no hay porcentaje honesto, y la barra va indeterminada en vez
de inventar uno.

## La tarjeta de enlace

Cuando el link se pega en WhatsApp, Slack, X o un LMS, la vista previa sale de
los `og:`/`twitter:` de `index.html` y de `img/og.png`. La imagen se edita en
`img/og.svg` y se regenera con:

```sh
rsvg-convert -w 1200 -h 630 img/og.svg -o img/og.png
```

La leyenda **NO ES UN EQUIPO MÉDICO** está adentro de la imagen a propósito:
así viaja con el link aunque el que lo comparte no escriba nada. Si el sitio
se sirve en otro dominio hay que actualizar las URL absolutas de `og:url`,
`og:image`, `twitter:image` y el `canonical`: los scrapers no resuelven rutas
relativas de forma confiable.

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
js/tutorial.js  «Aprender a usar»: el menú de paseos; el contenido, en js/tutorial-pasos.js
js/ejemplo.js   el paciente sintético de los paseos
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

- **La ganancia que reporta no desacadiza.** Las sacadas correctivas quedan
  dentro, y el sesgo es direccional: infla la ganancia justo en el paciente con
  déficit. Es un sesgo hacia el **falso negativo**. El corte de 0,80 que dibuja
  el gráfico viene de estudios que sí desacadizan: no es el corte de este
  número. Las sacadas se marcan y hay una desacadizada aproximada para
  comparar (ver [Sacadas](#sacadas)), pero no es la que se informa.
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

El parpadeo también se recalcula: cada frame guarda el **puntaje** de
parpadeo (0 abierto, 1 cerrado) y no el sí/no, así que la perilla se aplica de
nuevo sobre pulsos ya medidos.

Un pulso medido sin calibrar sale en la lista con **s/c** y la ganancia
tachada: el número incluye el paralaje entero y no se lee como resultado.

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

Recalcular deja a la vista lo que había: en la lista la ganancia de antes
tachada al lado de la nueva (y el estado viejo en el tooltip), en cada panel
la media de antes, la asimetría de antes, y en la nube de ganancias un
círculo hueco donde estaba cada punto, unido al de ahora. Antes el efecto de
una perilla había que recordarlo de memoria. La comparación dura hasta el
próximo pulso, los ejemplos, **Borrar todos** o **Quitar comparación**.

**Valores por defecto**, al pie de las perillas, devuelve cada una a su valor
de fábrica. Mientras alguna no lo está, la barra dice **PERILLAS CAMBIADAS**
(con cuáles al pasar el mouse): una ventana de 200 ms que quedó puesta de un
experimento no puede pasar desapercibida al medir de verdad. El `k` a mano
es aparte: mientras está puesto la barra dice **k A MANO**, y desmarcar la
casilla —o calibrar de nuevo— devuelve el `k` que había.

**Exportar CSV** baja un solo archivo con las tablas una abajo de la otra,
separadas por una línea `# TABLA: …` (`js/sesion.js`): un pulso por fila —con
la configuración con la que se calculó cada uno—, una muestra por fila de
todos los pulsos, con lo derivado y lo crudo al lado para rehacer el cálculo
en una planilla, los cuadros **crudos** de cada pulso (con el margen que el
derivador necesita para arrancar) y las muestras de la última calibración.
Eran dos descargas distintas y había que acordarse de bajar las dos; el
resumen y las muestras que lo producen terminaban en carpetas separadas.

**Importar CSV** abre un archivo exportado y vuelve a calcular cada pulso
desde el crudo, con **su** `k` y **su** derivador; los umbrales y criterios
son las perillas de ahora. Es para que un docente reparta una sesión medida y
cada alumno la abra, la recalcule y la mida, o para seguir otro día. La
sesión importada toma el lugar de la actual, igual que los ejemplos: sale
marcada **imp**, la barra dice **IMPORTADO k=…** y se va al encender la
cámara o con **Borrar todos**. Acepta el CSV que devuelve una planilla en
configuración regional latina (punto y coma y coma decimal). Los archivos
exportados antes de la tabla de crudo no se pueden importar, y el mensaje lo
dice. `test/sesion.test.mjs` hace la ida y la vuelta.

## Licencia

Apache-2.0, igual que el repo principal.
