# trainHIT

vHIT (video Head Impulse Test) **didáctico**, en el navegador, con la webcam del
equipo. Sin instalar nada: se abre `index.html` desde un servidor local y mide.

Es el repo hermano de [vhit-wout-google](https://github.com/Debaq/vhit-wout-google),
que es el motor nativo en Rust. Acá el objetivo no es medir mejor: es que cada
paso del cálculo **se vea**, se pueda tocar y se entienda por qué está hecho así.

> **No reemplaza a un equipo clínico.** Corre a los 30 fps de una webcam común;
> un vHIT real usa cámara >250 Hz y giroscopio solidario a la cabeza.

## Uso

```
python3 -m http.server 8080
```

y abrir <http://localhost:8080>. Hace falta servidor (no `file://`): los módulos
ES y `getUserMedia` lo exigen. En red hace falta HTTPS; en `localhost` no.

La primera carga baja de CDN el runtime de MediaPipe Tasks Vision y el modelo
`face_landmarker.task`; después el navegador los cachea. Todo el procesamiento
—y el video— se queda en la máquina.

### Atajos

| Tecla | Qué hace |
|---|---|
| `C` | Calibrar el paralaje (10 s). **Obligatorio antes de creerle a la ganancia.** |
| `R` | Borrar todos los pulsos |
| `D` | Descartar el último |
| `Espacio` | Pausar el análisis (la cámara sigue) |

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
- **Sin giroscopio**: cabeza y ojo salen de la misma imagen, así que un error de
  seguimiento entra en las dos señales a la vez.
- **Solo canal lateral.** Los verticales necesitan la componente vertical del
  movimiento ocular, más ruidosa por el párpado.

El análisis largo de todo esto, con las fuentes, está en `GANANCIAS.md` del repo
principal.

## Banco sintético

```
node test/banco.mjs
```

Corre el mismo pipeline sobre impulsos generados con ganancia conocida, sin
cámara ni MediaPipe. Sirve para dos cosas: comprobar que el motor devuelve la
ganancia que se le puso, y **ver el efecto del paralaje sin calibrar** — con
`k = 0` un VOR perfecto se lee 1,95. También verifica que `fitParallax` recupera
la `k` que se usó para generar los datos, y que el eje de cabeza no mezcla un
cabeceo con el canal lateral.

## Las perillas

Todo lo que en un equipo comercial es una constante escondida, acá es un slider:
ventana y grado del derivador, umbrales de inicio y fin del impulso, rango de
pico y de duración aceptados, umbral de parpadeo, y un `k` que se puede poner a
mano para **ver** cómo el paralaje mueve la ganancia entera.

Mover una perilla no recalcula los pulsos viejos: afecta a los siguientes. Es a
propósito — los números de la tabla son los que se midieron con la configuración
que había en ese momento.

## Licencia

Apache-2.0, igual que el repo principal.
