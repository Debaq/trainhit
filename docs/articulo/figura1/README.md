# Figura 1: calibración del paralaje

Figura 1 del artículo para *Advances in Physiology Education*.

- **A:** cuadros de la calibración del paralaje (desplazamiento del iris dividido por R contra el seno del giro de la cabeza) y la recta ajustada, cuya pendiente es −k.
- **B:** los mismos impulsos del lado sano, calculados con ese k y con k = 0.

## De dónde salen los datos

`sesion_figura1.csv` es una sesión de trainHIT exportada con «Exportar CSV». El paciente es uno de los autores, que autorizó publicar los datos.

La sesión tiene dos partes:

1. Una calibración con webcam: fijar un punto junto a la cámara y girar la cabeza lento, ±20°.
2. Varios impulsos hacia el lado sano, sin recalibrar entre medio.

El archivo trae solo números, sin imágenes:

| Tabla | Contenido |
|---|---|
| `calibracion` | desplazamiento del iris en mm y giro de la cabeza, por cuadro |
| `crudo` | cuadros de cada impulso antes del derivador |
| `pulsos` | lado, k y derivador con que se midió cada impulso |

## Cómo se calcula

Los números no se calculan con fórmulas propias. `figure1_datos.mjs` importa el motor de la app (`js/`) y hace lo mismo que «Importar CSV» seguido de «Recalcular»:

- `leeSesion` lee el archivo.
- `fitParallax` ajusta la calibración: regresión de offset/R contra sin(giro), con R = 10,5 mm. La pendiente es −k.
- `procesaCrudo` y `analyzeTrial` recalculan cada impulso, una vez con ese k y otra con k = 0.

La ganancia es la que reporta la app, la de área: 1 − Δmirada/Δcabeza, del inicio al fin del impulso. Lo único que se calcula fuera del motor es:

- el R² de la recta (la app da el residuo en grados);
- la curva media del panel B, interpolada con `sampleAt` de la app.

### Cuándo se rechaza la sesión

El script **se detiene y dice por qué** en estos casos:

- la sesión no trae calibración, o la app la rechaza;
- hay menos de 5 impulsos aceptados hacia el lado sano;
- algún impulso se midió con otro k (se recalibró en medio);
- hay pulsos de ejemplo o del simulador.

Nunca completa con datos sintéticos.

## Cómo regenerar la figura

Requisitos:

- Node ≥ 20;
- Python 3 con las versiones de `requirements.txt`;
- la fuente Liberation Sans (paquete `ttf-liberation` o `fonts-liberation`).

```sh
cd docs/articulo/figura1
python3 -m pip install -r requirements.txt   # si hace falta
python3 make_figure1.py                       # agregar --lado derecha|izquierda si hay impulsos aceptados a los dos lados
```

Salidas:

- `figure1.pdf`: vectorial, con la fuente incrustada.
- `figure1.tif`: 600 dpi, RGB, compresión LZW, 17,8 cm de ancho.
- `figure1_valores.txt`: k, R², R, la ganancia de cada impulso con los dos k, la media ± DE y las versiones usadas.

`python3 make_figure1.py --sintetico` prueba el flujo con el paciente de ejemplo de la app. Escribe en `prueba/`, que no se versiona, y no sirve para la figura.
