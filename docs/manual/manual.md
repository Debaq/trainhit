# Manual de uso de trainHIT

**vHIT didáctico en el navegador, con la webcam del equipo.**
Laboratorio TecMedHub · Universidad Austral de Chile, Sede Puerto Montt.

> **trainHIT no es un equipo médico.** Sirve para *aprender* cómo se mide el
> reflejo vestíbulo-ocular, no para diagnosticar. Una webcam común da 30 cuadros
> por segundo, no se fija la distancia al blanco y la ganancia que reporta no
> desacadiza. Por eso los valores son didácticos. Además la página procesa como
> mucho 60 cuadros por segundo aunque la cámara dé más: el tope está puesto a
> propósito.

## Contenido

1. [Qué es trainHIT](#1-que-es-trainhit)
2. [Antes de empezar](#2-antes-de-empezar)
3. [La pantalla](#3-la-pantalla)
4. [Preparar la sesión](#4-preparar-la-sesion)
5. [La primera medición](#5-la-primera-medicion)
6. [Leer los gráficos](#6-leer-los-graficos)
7. [Herramientas](#7-herramientas)
8. [Las perillas del motor](#8-las-perillas-del-motor)
9. [Aprender a usar: los paseos](#9-aprender-a-usar-los-paseos)
10. [Casos a ciegas](#10-casos-a-ciegas)
11. [Paciente simulado](#11-paciente-simulado)
12. [Guardar y compartir datos](#12-guardar-y-compartir-datos)
13. [Idioma, pantallas chicas y uso sin red](#13-idioma-pantallas-chicas-y-uso-sin-red)
14. [Atajos de teclado](#14-atajos-de-teclado)
15. [Problemas frecuentes](#15-problemas-frecuentes)
16. [Glosario](#16-glosario)

---

## 1. Qué es trainHIT

trainHIT mide el **reflejo vestíbulo-ocular (VOR)** con la cámara del computador.
Cuadro a cuadro sigue la cabeza y el iris, y calcula la **ganancia** de cada
impulso cefálico: cuánto giró el ojo por cada grado que giró la cabeza.

A diferencia de un equipo clínico, en trainHIT **cada paso del cálculo está a la
vista** y se puede tocar. Se ve la recta del paralaje, la ventana del impulso,
los tres métodos de ganancia y las perillas del motor. La idea es entender por
qué da lo que da.

La cámara es **remota y sin gafas**: queda fija y no va en la cabeza del
paciente. No es un vHIT incompleto sino otro método, que ya tiene normativos
publicados con cámara remota (Wiener-Vacher & Wiener, 2017). Todo se procesa en
el navegador y **el video no sale del equipo**.

### Lo que no es

- **No diagnostica.** Una webcam a 30 fps, sin fijar la distancia al blanco,
  da valores didácticos.
- **No desacadiza.** Una sacada encubierta queda dentro de la ganancia y la
  sube, justo en el paciente con déficit. El sesgo es hacia el **falso
  negativo**.
- **Solo mide el canal lateral.** Los canales verticales (RALP/LARP) necesitan
  el movimiento vertical del ojo, que el párpado tapa y la webcam mide mal.

---

## 2. Antes de empezar

### Qué hace falta

- Un computador con **webcam** y un navegador moderno (Chrome, Edge, Firefox).
- Para practicar en serio, **dos personas**: una hace de paciente y otra de
  examinador. Solo se puede aprender la herramienta, pero no se mide el
  reflejo: un giro que hace uno mismo es predecible y el cerebro se anticipa.

### Abrir la página

Si trainHIT está publicado en una dirección web, alcanza con abrirla. Para
correrlo en un computador propio, desde la carpeta del proyecto:

```
python3 -m http.server 8080
```

y abrir <http://localhost:8080>. Hace falta un servidor; abrir `index.html` con
doble clic no funciona, porque el navegador no da la cámara a un archivo local.

La primera vez se baja el modelo de seguimiento de caras (unos 10 MB). Después
queda guardado y la página funciona **sin red** (ver la
[sección 13](#13-idioma-pantallas-chicas-y-uso-sin-red)).

### La bienvenida

Al abrir aparece la bienvenida: qué mide trainHIT, sus límites y dos botones.

![Pantalla de bienvenida](img/01-bienvenida.png)

- **Aprender a usar** abre el menú de paseos guiados
  ([sección 9](#9-aprender-a-usar-los-paseos)). Es lo recomendado la primera vez.
- **Empezar** va directo a la pantalla de medición.

El **?** de la barra vuelve a abrir esta bienvenida cuando se quiera. El enlace
**Quiénes lo hacemos**, igual que la firma **TecMedHub** de la barra, abre la
tarjeta del equipo:

![Tarjeta «Quiénes lo hacemos»](img/02-acerca.png)

---

## 3. La pantalla

![Pantalla principal, todavía sin cámara ni pulsos](img/03-principal-vacia.png)

La pantalla tiene cuatro zonas:

| Zona | Qué hay |
|---|---|
| **Barra de arriba** | Estado de la calibración (**SIN CALIBRAR** / **CALIBRADO k=…**), mensaje de estado, cuadros por segundo (**FPS**), si hay **CARA** en el encuadre, velocidad de la cabeza, el **♥** (me gusta), el cambio de idioma y los botones **Aprender**, **?**, **Simulador** y **Herramientas**. |
| **Columna izquierda** | El video con los puntos de seguimiento, los dos ojos ampliados, los botones de medición y las lecturas en vivo. |
| **Centro** | Un panel por lado: **Impulsos derecha** e **Impulsos izquierda**. Cada uno tiene todos los impulsos superpuestos, la ganancia media ± DE y la lista de pulsos. |
| **Abajo** | **Velocidad en vivo**: la cabeza en azul y el ojo (invertido) en naranja, los últimos 8 segundos. A la derecha, la **asimetría**. |

**Colores que se repiten en toda la página:**

- **Azul:** la cabeza.
- **Naranja:** el ojo.
- **Triángulo violeta:** sacada encubierta.
- **Triángulo rojo:** sacada manifiesta.

**«Derecha» e «izquierda» son siempre las del paciente**, no las de la
pantalla. Un impulso hacia la derecha del paciente cae en el panel derecho.

### Los botones de medición

| Botón | Qué hace |
|---|---|
| **Encender cámara** / **Detener** | Prende o apaga la cámara. El selector de abajo elige qué cámara usar si hay más de una. |
| **Pausar** (`Espacio`) | Congela el análisis y la traza de abajo para poder medirla. La cámara sigue encendida. |
| **Calibrar** (`C`) | Calibra el paralaje durante 10 s. Es **obligatorio antes de creerle a la ganancia**. |
| **Descartar** (`D`) | Descarta el último pulso. `Z` lo devuelve. |
| **Borrar todos** (`R`) | Borra la sesión y pide confirmación. |
| **Exportar CSV** / **Importar CSV** | Guarda la sesión en un archivo o abre una guardada. |

---

## 4. Preparar la sesión

Una buena medición depende más del montaje que del software.

### Cámara y luz

- La cámara **a la altura de los ojos**, con la cara de frente y centrada.
- **A un brazo de distancia**, lo justo para que el iris se vea nítido en los
  ojos ampliados. Si queda muy lejos, el pulso sale rechazado por *IRIS MUY
  CHICO*.
- Luz **de frente** o de costado. **Nunca una ventana detrás del paciente**:
  la cara queda en sombra y el modelo la pierde.
- **Sin anteojos** si se puede, porque los reflejos tapan el iris.

### Postura y blanco

- El paciente sentado, con la cabeza **flexionada unos 30° hacia abajo**. Así
  el canal lateral queda horizontal. La lectura **inclinación** lo muestra en
  vivo.
- El blanco que se mira es **la cámara misma**, o un punto pegado al lado del
  lente. El modelo de paralaje asume que el objetivo está junto a la cámara, y
  mirar otra cosa cambia la ganancia.

### Las manos del examinador

El examinador se para **detrás** del paciente y le toma la cabeza **por
arriba**, con las manos lejos de ojos, cejas y pómulos. El modelo sigue la cara
entera: basta un dedo sobre una ceja para perder el seguimiento (*CARA PERDIDA*).

---

## 5. La primera medición

### Paso 1: Encender la cámara

Apretá **Encender cámara**. La primera vez el navegador pide permiso para usar
la cámara. Seguí cuando la barra diga **CARA sí**.

![Cámara encendida: la cara con los puntos de seguimiento y los ojos ampliados](img/28-camara-encendida.png)

Los puntos sobre la cara son lo que sigue el modelo. Debajo del video, los dos
ojos ampliados muestran el contorno del iris y su centro:

![El visor: video, ojos ampliados y botones](img/29-visor.png)

Si en los ojos ampliados el iris no se ve nítido, acercate a la cámara o mejorá
la luz **antes de seguir**. Todo lo demás se calcula a partir de ahí.

### Paso 2: Revisar las lecturas

Bajo los botones están los números en vivo:

![Lecturas en vivo](img/35-lecturas.png)

Los que importan al preparar:

- **iris:** el radio del iris en píxeles. Por debajo del mínimo (5 px por
  defecto) el pulso se rechaza.
- **inclinación:** la flexión de la cabeza; buscá unos 30°.
- **parpadeo:** un parpadeo dentro del impulso lo invalida.

Cada número explica qué es al pasar el mouse. En pantallas táctiles, **Qué es
cada número** (debajo de las lecturas) dice lo mismo a la vista.

### Paso 3: Calibrar el paralaje

Apretá **Calibrar** (o `C`). Arriba al centro, junto a la cámara, aparece un
**punto rojo**. El paciente lo mira **sin soltarlo** y gira la cabeza **lento**
de un lado al otro, unos ±20°, durante 10 segundos. Una cuenta regresiva
indica cuánto falta y el rango de giro alcanzado. El cajón de Herramientas se
abre solo, para ver cómo llegan los puntos del ajuste.

![Calibración en curso: el punto rojo de fijación y la cuenta regresiva](img/30-calibrando.png)

**Por qué hace falta:** el centro de rotación del ojo está detrás de las
comisuras. Al girar la cabeza, el iris se corre en la imagen aunque el ojo no
se mueva, y ese corrimiento es **tan grande como la señal**. Sin calibrar, un
reflejo perfecto se lee ~1,9.

Al terminar, la barra dice **CALIBRADO k=…** en verde. Si la calibración sale
rechazada, el mensaje de estado dice qué hacer distinto (girar más lento, fijar
mejor la mirada, etc.). En **Herramientas** se ve el ajuste: si el paciente fijó
bien, los puntos caen sobre una recta.

![La recta del paralaje de una calibración real](img/31-recta-calibracion.png)

### Paso 4: Dar los impulsos

Cada impulso es un giro **corto (10–20°) y rápido (150–300 °/s)** hacia un lado,
y **la cabeza queda quieta ahí**. Después se vuelve despacio al centro, se
espera y se da el siguiente hacia un lado que el paciente no pueda adivinar.

En la traza de abajo cada impulso aparece como un pico **azul** (cabeza). El
**naranja** es el ojo, dibujado invertido: con un reflejo normal las dos curvas
se tapan.

![Velocidad en vivo durante los impulsos](img/32-traza-vivo.png)

**Buena técnica:** un giro corto, rápido e impredecible. **Mala técnica:** un
giro amplio (más de 40°) y lento, o siempre hacia el mismo lado.

### Paso 5: Leer el resultado

Cada impulso cae en el panel de su lado:

![Resultado de una sesión medida con la cámara](img/33-medido.png)

- **Arriba** de cada panel, todos los impulsos superpuestos. La franja verde
  es el rango de pico de velocidad aceptado.
- **La ganancia media ± DE**, en verde o rojo contra el corte de 0,80. Ese
  corte viene de equipos que sí desacadizan, así que acá es una referencia y
  no un criterio. Sin calibrar queda gris.
- **La cuenta** de aceptados y rechazados.
- **La lista**, un pulso por fila: número, pico de velocidad, duración,
  ganancia, sacadas (▼) y estado. **✕** descarta ese pulso.

Un rechazado dice por qué, y sobre el gráfico aparece una caja punteada roja con
el motivo. Los rechazados **no entran en la media**.

| Motivo | Qué hacer |
|---|---|
| *MUY LENTO* | Dar un impulso más fuerte. |
| *MUY RÁPIDO* | Un impulso más suave; pasó el pico máximo. |
| *PARPADEO en la ventana* | Repetirlo con los ojos abiertos. |
| *CARA PERDIDA* | Quedarse en el encuadre y sacar las manos de la cara. |
| *IRIS MUY CHICO* | Acercarse a la cámara o mejorar la luz. |

Un pulso medido **sin calibrar** sale marcado **s/c** y con la ganancia
tachada: sirve para ver la forma, no el número.

### Paso 6: Pausar para medir la traza

**Pausar** (o `Espacio`) congela la traza de abajo. La cámara sigue encendida;
lo que se detiene es el análisis. Congelada, la traza se mide con la regla
([sección 6](#6-leer-los-graficos)).

![Traza en vivo congelada con Pausar](img/34-traza-pausada.png)

---

## 6. Leer los gráficos

Para esta sección no hace falta cámara: se pueden cargar los **pulsos de
ejemplo**, de un paciente sintético con el canal derecho sano y el izquierdo
con déficit. Se cargan desde **Aprender › Leer los gráficos › Cargar pulsos de
ejemplo**.

![Pulsos de ejemplo: el lado derecho sano (~0,96) y el izquierdo con déficit y sacadas](img/06-principal-ejemplo.png)

Los ejemplos pasan por el mismo motor que un pulso medido. Reemplazan la sesión,
salen marcados **ej** y la barra dice **EJEMPLO k=…**. Se van solos al encender
la cámara o con **Borrar todos**.

### La regla sobre el gráfico

Al pasar el puntero por un panel, una línea vertical marca el instante y un
cartel da la velocidad de cabeza y de ojo en ese punto.

**Un clic fija una referencia.** Desde ahí, al mover el puntero aparecen:

- **Δt** y el salto de cada curva;
- el **área** de cada curva en el tramo, sombreada. Es el desplazamiento: los
  grados que giró la cabeza y los que se movió el ojo;
- la **ganancia del tramo**: el cociente de las dos áreas.

Otro clic suelta la referencia.

![La regla: referencia fijada en 0 ms y medición hasta 150 ms](img/07-regla.png)

Con el dedo, en pantallas táctiles: un toque pone el cursor, otro fija la
referencia, arrastrar de costado mide y otro toque la suelta.

> Probá medir solo la subida del impulso y después el impulso entero: la
> ganancia cambia según el tramo, y el motor usa uno solo.

### Mirar un pulso solo

Un clic en una fila de la lista **resalta** ese pulso en el panel. Al pasar el
puntero por la fila aparecen sus otras ganancias (a 60 ms, en el pico) y la
configuración con que se calculó. Si está rechazado, aparece la caja punteada
roja con el motivo:

![Un pulso rechazado por parpadeo, seleccionado](img/08-rechazado.png)

### Las sacadas

Cada sacada lleva un triángulo sobre su pico:

- **Violeta: encubierta.** Arrancó mientras la cabeza todavía giraba.
- **Rojo: manifiesta.** Llegó después del giro.

En la lista, la columna de triángulos dice lo mismo pulso por pulso. La
**ganancia hasta la sacada ≈** (en el cartel de la fila) es la ganancia cortada
antes de la primera sacada encubierta, y suele ser bastante más baja que la
reportada.

### La asimetría

Abajo a la derecha: **(derecha − izquierda) / (derecha + izquierda)**, en %.
Cero es simétrico, y el signo dice de qué lado está el déficit: con los ejemplos
da positiva porque el izquierdo es el débil.

> **Una asimetría cercana a cero no es un resultado normal.** Si los dos lados
> fallan igual (déficit bilateral), la asimetría da cero. Hay que mirar cada
> media por separado.

### La curva promedio

En **Herramientas › Presentación › Curva promedio del lado**, cada panel suma la
media de sus pulsos aceptados, en trazo más grueso. El ruido se va y queda la
forma.

![Curva promedio de cada lado](img/17-promedio.png)

### Orientación de los paneles

En **Herramientas › Presentación › Orientación**:

- **Comparar lados** (por defecto): los dos paneles con el impulso hacia arriba
  y el ojo invertido. Con reflejo normal las curvas se tapan, y lo que se lee es
  la **separación** entre ellas.
- **Dirección real:** cada impulso hacia su lado (derecha arriba, izquierda
  abajo) y el ojo sin invertir. Es lo mismo, dibujado como pasa.

![Orientación «dirección real»](img/18-orientacion-real.png)

### Suavizar

**Suavizar las trazas** une las muestras con una curva monótona, que nunca
dibuja un pico más alto que el medido. Aun así hace **parecer** más precisa una
señal de 30 fps; por eso, mientras está encendido, los puntos marcan las
muestras reales. Apagalo para ver cuántas muestras tiene de verdad un impulso.

---

## 7. Herramientas

**Herramientas** (o `H`) abre un cajón a la derecha con cada paso del cálculo a
la vista. Nada de lo que hay adentro hace falta para medir: está para entender.

![El cajón de Herramientas abierto](img/09-herramientas.png)

### Presentación

![Opciones de presentación](img/10-h-presentacion.png)

- **Espejar el video:** con espejo, el ojo derecho del paciente queda a la
  derecha de la pantalla.
- **Suavizar las trazas**, **Marcar sacadas**, **Curva promedio del lado** y
  **Orientación:** ver la [sección 6](#6-leer-los-graficos).

### Calibración del paralaje

![Calibración del paralaje con los pulsos de ejemplo](img/11-h-calib.png)

Cada punto es un cuadro de la calibración: el corrimiento del iris contra el
seno del giro de la cabeza. Si el paciente fijó bien la mirada, los puntos caen
sobre una **recta** de pendiente −k. Que se vea la recta prueba que lo medido es
paralaje y no la mirada paseando.

**k a mano:** con el deslizador y **usar este k** se fuerza un valor de k. El
experimento que explica todo es poner **k = 0** y **Recalcular**: las ganancias
del lado sano pasan a ~1,9. Nadie tiene un reflejo de 1,9; lo que se ve es el
paralaje sin corregir.

![Con k = 0 y Recalcular, el lado sano se lee ~1,9; lo de antes queda tachado](img/19-recalcular-k0.png)

Desmarcar **usar este k** devuelve el k calibrado.

### Último pulso

![El último pulso con su ventana](img/12-h-pulso.png)

El pulso seleccionado (o el último), en grande. El **sombreado** es la ventana
del impulso, el tramo sobre el que se calcula la ganancia. Las líneas punteadas
son los umbrales de inicio y fin que la delimitan.

### Ganancia vs pico, y los métodos

![Ganancia contra pico y la tabla de métodos](img/13-h-ganancias.png)

Hay un punto por pulso: el pico de velocidad de la cabeza contra la ganancia.
Azul el lado derecho, violeta el izquierdo; los rechazados salen pálidos. Un
reflejo sano da una nube **chata y apretada**, porque la ganancia no depende de
qué tan fuerte fue el impulso.

El selector **Método** y la tabla muestran las mismas ganancias calculadas de
cuatro formas:

| Método | Qué calcula |
|---|---|
| **Área** | Cuánto giró el ojo sobre cuánto giró la cabeza en todo el impulso. **Es la que se reporta.** |
| **60 ms** | El cociente de velocidades en un solo instante. A 30 fps se apoya en dos cuadros. |
| **Picos** | El máximo del ojo sobre el máximo de la cabeza, aunque no ocurran a la vez. |
| **Hasta la sacada ≈** | El área cortada antes de la primera sacada encubierta: una desacadización aproximada, para comparar y no para informar. |

Con los mismos pulsos, las medias y la asimetría cambian según el método. Por
eso **una ganancia sin su método no se compara con otra** (Zamaro et al., 2020).

Después de un **Recalcular**, cada punto viejo queda unido al nuevo:

![La nube de ganancias después de recalcular con k = 0](img/20-nube-k0.png)

### Cómo se mide, y referencias

![Cómo se mide y lo que no hace](img/15-h-como.png)

Las cinco decisiones del motor:

1. el iris como regla;
2. el ángulo esférico;
3. la cabeza medida por incrementos;
4. la derivada por ajuste polinómico;
5. la ganancia calculada con posiciones.

Debajo está lo que el método **no** hace y las referencias bibliográficas de
cada número.

### Para docentes

![Sección para docentes](img/16-h-docentes.png)

**Preguntas para Moodle (GIFT)** baja un archivo `.txt` listo para importar en
el banco de preguntas de Moodle. Trae:

- una pregunta por cada caso a ciegas, con los números que el motor saca de
  cada uno;
- un banco de conceptos: paralaje, sacadas, falso negativo, canales, asimetría,
  calibración, rechazos, una pregunta numérica, una de verdadero/falso y un
  emparejamiento de métodos.

Sale en el idioma de la interfaz.

---

## 8. Las perillas del motor

Están al fondo del cajón de Herramientas.

![Las perillas del motor](img/14-h-perillas.png)

Una perilla cambiada vale para los pulsos **siguientes**. Cada pulso guarda sus
muestras crudas, así que **Recalcular los pulsos con esta configuración** vuelve
a correr el motor entero sobre los pulsos que ya están. Después de recalcular:

- la ganancia de antes queda tachada al lado de la nueva;
- los paneles muestran la media de antes;
- **Quitar comparación** borra lo tachado.

Mientras alguna perilla no está en su valor de fábrica, la barra dice
**PERILLAS CAMBIADAS**: esos pulsos no son comparables con otros.
**Valores por defecto** devuelve todo a su lugar.

| Perilla | Por defecto | Qué hace | Para probar |
|---|---|---|---|
| **Ventana derivador** | 50 ms | La velocidad sale de ajustar una parábola a las muestras de esta ventana. Más ancha da menos ruido, pero aplana el pico. | Poné 200 ms y recalculá: los picos bajan y varios pulsos pasan a *MUY LENTO*. |
| **Grado del ajuste** | 2 | 1 ajusta una recta y aplana el pico; 3 sigue también el ruido. | Probalo con la ventana en 50 y en 100 ms. |
| **Umbral inicio / fin** | 60 / 40 °/s | Dónde empieza y termina el impulso, o sea la ventana sobre la que se calcula la ganancia. | Movelos y mirá **Último pulso**. |
| **Pico mín / máx** | 120 / 300 °/s | Criterio para aceptar un pulso. No cambia ninguna ganancia; decide cuáles entran en la media. | Bajá el mínimo a 80: el pulso lento del ejemplo pasa a aceptado. |
| **Duración mín / máx** | 80 / 300 ms | Igual que el pico, pero con la duración. | — |
| **Parpadeo** | 0,45 | Qué tan cerrado tiene que estar el ojo (0 abierto, 1 cerrado) para contar como parpadeo. | Subilo a 0,90: el pulso con parpadeo pasa a aceptado, con una ganancia calculada con el ojo cerrado. |
| **Iris mín** | 5 px | Radio del iris por debajo del cual se rechaza el pulso. | — |

> El método es mover **una** perilla, recalcular, mirar qué cambió y volverla a
> su lugar.

---

## 9. Aprender a usar: los paseos

**Aprender** (en la barra, o `T`) abre un menú de paseos guiados cortos. Se
hacen en cualquier orden; si es la primera vez, de arriba hacia abajo. Un ✓
marca los paseos terminados.

![El menú de paseos](img/04-menu-aprender.png)

| Paseo | De qué trata | ¿Cámara? |
|---|---|---|
| **Qué mide un vHIT** | El reflejo, el impulso, los seis canales, la ganancia, las sacadas, los patrones que se buscan y los límites. | No |
| **Preparar la sesión** | Cámara, luz, postura y manos del examinador. | No |
| **La primera medición** | Calibrar, dar impulsos, leer paneles y lista, CSV. | Sí |
| **Leer los gráficos** | La regla, los rechazados, las sacadas, la asimetría, el promedio, suavizar, la orientación y la pausa. | No (usa ejemplos) |
| **Casos a ciegas** | Cinco pacientes sintéticos sin diagnóstico. | No |
| **Paciente simulado** | En parejas, una patología agregada por el motor. | Sí |
| **Herramientas por dentro** | La recta del paralaje, el último pulso, la nube, los métodos y el k a mano. | No (usa ejemplos) |
| **Las perillas del motor** | Cada perilla, probada con Recalcular. | No (usa ejemplos) |

Las tarjetas de lectura aparecen al centro con el fondo oscurecido:

![Una tarjeta del paseo «Qué mide un vHIT»](img/05-paseo-tarjeta.png)

Las demás tarjetas iluminan la parte de la pantalla de la que hablan y dejan la
página usable, porque lo que se señala tiene que poder apretarse. Algunos pasos
esperan algo (la cara, una calibración, pulsos, un recálculo), pero la espera
nunca traba: el botón dice **Saltar** hasta que se cumple.

---

## 10. Casos a ciegas

Cinco pacientes sintéticos, cada uno con una letra y **sin decir qué tiene**.
Se cargan desde **Aprender › Casos a ciegas**. Hay que mirar los paneles y
elegir el patrón de una lista, que es la misma para todos los casos: si cada
caso trajera sus propias opciones, la lista delataría la respuesta.

![Cómo se lee un caso](img/21-casos-intro.png)

Qué mirar:

- la **media ± DE** de cada lado y cuántos pulsos se aceptaron;
- la **asimetría**;
- la **forma** de las curvas naranjas: un pico angosto que se despega de la
  azul es una sacada;
- cuántos pulsos quedaron **rechazados**, y por qué.

![Caso B cargado: el derecho bajo y con sacadas manifiestas](img/22-caso-b.png)

Si la respuesta es incorrecta, aparece una pista y se puede volver a intentar.
Si es correcta, aparece la explicación:

![Caso B respondido: déficit del lado derecho](img/23-caso-b-respuesta.png)

| Caso | Lo que enseña |
|---|---|
| A | La referencia: cómo se ve lo normal. |
| B | La neuritis de libro, y el signo de la asimetría. |
| C | Una asimetría de cero no es un resultado normal. |
| D | Una media normal (¡>1!) puede esconder un déficit con sacadas encubiertas: el falso negativo. |
| E | Sin pulsos aceptados suficientes no se concluye: se repite la prueba. |

---

## 11. Paciente simulado

El **Simulador** (en la barra, o `S`) pone una patología encima de pulsos
**reales**. Un compañero sano hace de paciente y el alumno le da impulsos de
verdad, con su técnica, sus rebotes y sus manos en la cara. El motor le agrega
el déficit: la mirada se arrastra con la cabeza en lo que el reflejo no
compensa, y unas sacadas la traen de vuelta. Se practica **examinar y leer a la
vez**.

![El cajón del Simulador](img/36-simulador-cajon.png)

| Perfil | Qué agrega |
|---|---|
| Neuritis derecha / izquierda | Ganancia 0,35–0,55 de ese lado, con sacadas manifiestas. |
| Déficit compensado derecho / izquierdo | Ganancia 0,40–0,55 con sacadas encubiertas agrupadas: **se lee normal**. |
| Vestibulopatía bilateral | Los dos lados 0,30–0,50, con sacadas manifiestas. |
| Sin patología (control) | Nada: los pulsos salen marcados como simulados, pero son los reales. |

### Voy a tener suerte

Es la práctica completa en un clic.

**1.** Encendé la cámara y **calibrá** con el compañero, como siempre.

**2.** Abrí **Simulador** y apretá **Voy a tener suerte**. Se sortea un paciente
(el control sano incluido) y queda **a ciegas**.

**3.** El cajón **se cierra** para dejar los dos paneles a la vista. En la barra,
junto a **SIMULADO**, un contador lleva los pulsos aceptados de cada lado.
Un clic en el contador vuelve a abrir el cajón.

![Examinando: el cajón cerrado, los dos paneles a la vista y el contador en la barra](img/37-suerte-examinando.png)

![El contador de pulsos aceptados en la barra](img/37b-barra-contador.png)

**4.** Dale impulsos. La traza de abajo ya muestra la patología mientras se
examina. En los ojos ampliados, un **anillo violeta** marca dónde estaría el
iris simulado. El video es el real y no se mueve.

![El anillo violeta: dónde estaría el iris con la patología](img/43-anillo-violeta.png)

**5.** Con **tres pulsos aceptados por lado** el cajón se abre solo y se habilita
**Ya sé qué tiene**.

![Tres pulsos por lado: el cajón se abre para contestar](img/38-suerte-listo.png)

**6.** Aparecen tres preguntas en el orden del razonamiento clínico: qué lado está
afectado, qué sacadas aparecen y qué patrón muestra.

![Las tres preguntas](img/39-suerte-preguntas.png)

![Las respuestas elegidas](img/40-suerte-respondido.png)

**7.** **Revelar** corrige cada pregunta: verde la respuesta correcta, rojo la
elegida si no lo era. También da la nota y dice cuál era el perfil.

![Corrección: verde la correcta, rojo la elegida si no lo era](img/41-suerte-revelado.png)

**8.** **Ver lo real** recalcula cada pulso sin la patología: lo que el compañero
dio de verdad, con lo simulado tachado al lado. Los gráficos pasan a decir
**SIN SIMULAR**.

![Ver lo real: los pulsos del compañero sano, con lo simulado tachado](img/42-ver-lo-real.png)

**Otro paciente al azar** empieza de nuevo.

### Elegir el paciente a mano

Fuera de la práctica, quien hace de docente puede elegir el perfil en
**Paciente** y marcar **a ciegas**. Así el selector se esconde y la pantalla no
dice cuál es. **Revelar** lo muestra al final.

### Lo simulado nunca pasa por real

- La barra dice **SIMULADO**.
- Cada pulso lleva la marca **sim**.
- Los gráficos llevan una marca de agua, así que una captura también la lleva.
- El CSV tiene la columna `simulado` (`oculto` mientras es a ciegas).
- **Cambiar de paciente borra los pulsos:** mezclar dos pacientes daría una
  media que no es de nadie.

---

## 12. Guardar y compartir datos

### Exportar CSV

**Exportar CSV** baja un archivo con la sesión completa:

- un pulso por fila, con su ganancia y la configuración con que se calculó;
- una muestra por fila, para rehacer las cuentas en una planilla;
- los cuadros crudos.

El CSV queda siempre en español, porque es un formato de datos.

### Importar CSV

**Importar CSV** abre ese archivo en otro computador u otro día y **vuelve a
calcular cada pulso desde los datos crudos**. Sirve para repartir un caso
medido y que cada alumno lo mire con sus propias perillas. La sesión importada
reemplaza la actual, y la barra muestra que la calibración es la del archivo.

### El «me gusta»

El **♥** de la barra suma un voto a un contador público y anónimo. No viaja el
video, ni las mediciones, ni nada de la sesión. Hay un voto por navegador.

---

## 13. Idioma, pantallas chicas y uso sin red

### Idioma

trainHIT está en **español e inglés**. Arranca en el idioma del navegador, o en
el que diga la dirección (`?lang=en`, útil para un enlace de curso). El botón
**EN** / **ES** de la barra cambia el idioma en vivo, sin recargar y sin perder
la sesión.

![La interfaz en inglés](img/25-ingles.png)

### Pantallas chicas

En un teléfono, la cámara pasa a un cuadro chico con los ojos al lado. Con el
teléfono de costado, la pantalla vuelve a dos columnas.

![En un teléfono, vertical](img/26-movil.png)

![En un teléfono, de costado](img/27-movil-horizontal.png)

### Sin red

Después de la primera carga, la página y el modelo de seguimiento quedan
guardados en el navegador, y trainHIT abre y mide **sin conexión**. Está pensado
para el aula, donde el wifi falla.

---

## 14. Atajos de teclado

| Tecla | Qué hace |
|---|---|
| `C` | Calibrar el paralaje (10 s). |
| `Espacio` o `P` | Pausar y congelar la traza de abajo (la cámara sigue). |
| `D` | Descartar el último pulso. |
| `Z` | Devolver el último descartado. |
| `R` | Borrar todos los pulsos. |
| `H` | Abrir o cerrar Herramientas. |
| `S` | Abrir o cerrar el Simulador. |
| `T` | Abrir o cerrar «Aprender a usar». |

---

## 15. Problemas frecuentes

| Problema | Causa probable y solución |
|---|---|
| La cámara no enciende | El navegador no tiene permiso: hay que darlo en el candado de la barra de direcciones. Si se abrió `index.html` con doble clic, hace falta un servidor (ver la [sección 2](#2-antes-de-empezar)). |
| **CARA no** | Poca luz, luz de atrás o cara fuera del encuadre. Poné la luz de frente y centrá la cara. |
| **FPS** muy bajo (menos de 20) | El equipo va justo. Cerrá otras pestañas y programas que usen la cámara o la GPU. |
| La calibración sale rechazada | Girar más lento, sin soltar la mirada del punto rojo, y con un arco de ±20°. |
| Todos los pulsos *MUY LENTO* | Los impulsos tienen que ser más rápidos: un giro corto y seco. |
| Muchos *CARA PERDIDA* | Las manos tapan cejas o pómulos: tomá la cabeza más arriba. |
| *IRIS MUY CHICO* | El paciente está lejos o la cámara tiene poca resolución. Acercalo. |
| Ganancias cerca de 1,9 | Falta calibrar (la barra dice **SIN CALIBRAR**), o quedó **k a mano** en 0. |
| Ganancias mayores que 1 | Una sacada encubierta dentro del impulso infla la ganancia (ver el caso D). También pasa con impulsos que hace el propio paciente. |
| La barra dice **PERILLAS CAMBIADAS** | Hay perillas fuera de su valor de fábrica. Herramientas › **Valores por defecto**. |

---

## 16. Glosario

| Término | Significado |
|---|---|
| **VOR** | Reflejo vestíbulo-ocular: mueve los ojos al revés que la cabeza y a la misma velocidad, para que la mirada quede quieta. |
| **Impulso cefálico** | Un giro de cabeza chico, rápido e impredecible, dado por el examinador. |
| **Ganancia** | Cuánto giró el ojo por cada grado que giró la cabeza. 1 es compensación perfecta. |
| **Sacada correctiva** | El salto rápido con que el ojo vuelve al blanco cuando el reflejo no alcanzó. |
| **Encubierta / manifiesta** | La sacada que ocurre durante el giro / después del giro. |
| **Desacadizar** | Sacar las sacadas de la señal antes de calcular la ganancia. trainHIT no lo hace. |
| **Paralaje (k)** | El corrimiento del iris en la imagen al girar la cabeza, aunque el ojo no se mueva. La calibración lo mide. |
| **Asimetría** | (derecha − izquierda) / (derecha + izquierda), en %. |
| **Ventana del impulso** | El tramo entre el inicio y el fin del impulso, sobre el que se calcula la ganancia. |
| **RALP / LARP** | Los pares de canales verticales. trainHIT no los mide. |

---

*trainHIT es software libre (Apache-2.0), desarrollado en el Laboratorio
TecMedHub de la Universidad Austral de Chile, Sede Puerto Montt. El código y
cada decisión del cálculo están explicados en el repositorio.*
