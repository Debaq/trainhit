#!/usr/bin/env python3
"""Figura 2 del artículo: el flujo de procesamiento de trainHIT.

Es un diagrama de cajas y flechas, sin datos. Este script escribe el SVG a
mano (figure2.svg, el fuente editable) y lo exporta con Inkscape a PDF
vectorial y a TIFF de 600 dpi.

Cada caja sigue al código, no al revés:
    - webcam con tope de 30 fps .................. js/tracker.js (FPS_MAX)
    - MediaPipe: cabeza, párpado, región del ojo .. js/app.js (procesaFrame)
    - centro del iris, MediaPipe o SIEV-iris ...... js/app.js, js/pupila.js
    - píxeles -> mm con el iris como regla ........ js/geom.js (observeEye)
    - paralaje (-k) ............................... js/geom.js (EyeModel)
    - ganancias, sacadas, aceptación .............. js/analysis.js
    - modo de simulación con el teléfono .......... js/app.js (cuadroTelefono)

Uso:
    python3 make_figure2.py

Salidas: figure2.svg, figure2.pdf (fuente incrustada) y figure2.tif (600 dpi,
LZW). Antes de escribir, comprueba que cada línea de texto cabe en su caja.

Probado con: Python 3.14.7, Pillow 12.3.0, Inkscape 1.4.4 y Arial (si no
está, Liberation Sans tiene las mismas métricas).
"""

import subprocess
import sys
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image, ImageFont

AQUI = Path(__file__).resolve().parent
SVG = AQUI / "figure2.svg"
PDF = AQUI / "figure2.pdf"
TIF = AQUI / "figure2.tif"

# Todo en mm. El ancho es el de una figura a dos columnas de la revista.
ANCHO = 178.0
ALTO = 104.0
DPI = 600
PT = 0.3528  # mm por punto

FAMILIA = "Arial, Helvetica, sans-serif"
TAM = {"titulo": 8.0 * PT, "texto": 7.0 * PT, "nota": 7.0 * PT}
INTERLINEA = 1.22

# Escala de grises y un solo acento, para Annotix (Okabe-Ito, «vermillion»).
NEGRO = "#1a1a1a"
GRIS = "#595959"
GRIS_CLARO = "#bfbfbf"
FONDO = "#efefef"
ACENTO = "#d55e00"
ACENTO_FONDO = "#fbe9dc"

FUENTES = {
    (False, False): ["/usr/share/fonts/TTF/arial.ttf", "/usr/share/fonts/liberation/LiberationSans-Regular.ttf"],
    (True, False): ["/usr/share/fonts/TTF/arialbd.ttf", "/usr/share/fonts/liberation/LiberationSans-Bold.ttf"],
    (False, True): ["/usr/share/fonts/TTF/ariali.ttf", "/usr/share/fonts/liberation/LiberationSans-Italic.ttf"],
}


def _fuente(negrita, cursiva):
    for ruta in FUENTES[(negrita, cursiva)]:
        if Path(ruta).exists():
            return ImageFont.truetype(ruta, 1000)
    sys.exit(f"falta la fuente: {FUENTES[(negrita, cursiva)]}")


def largo(texto, tam, negrita=False, cursiva=False):
    """Largo del texto en mm, medido con la fuente real."""
    return _fuente(negrita, cursiva).getlength(texto) / 1000 * tam


partes = []


def texto(x, y, s, tam, *, negrita=False, cursiva=False, color=NEGRO, ancla="middle"):
    peso = ' font-weight="bold"' if negrita else ""
    estilo = ' font-style="italic"' if cursiva else ""
    partes.append(
        f'<text x="{x:.2f}" y="{y:.2f}" font-size="{tam:.3f}" text-anchor="{ancla}" '
        f'fill="{color}"{peso}{estilo}>{escape(s)}</text>'
    )


def caja(x, y, w, h, lineas, *, borde=NEGRO, fondo="#ffffff", trazo=0.3, discontinua=False, radio=1.2, margen=1.4):
    """Caja con líneas centradas. `lineas`: (texto, tipo, opciones)."""
    guion = ' stroke-dasharray="1.6 1.0"' if discontinua else ""
    partes.append(
        f'<rect x="{x:.2f}" y="{y:.2f}" width="{w:.2f}" height="{h:.2f}" rx="{radio}" '
        f'fill="{fondo}" stroke="{borde}" stroke-width="{trazo}"{guion}/>'
    )
    if not lineas:
        return
    alturas = [TAM[t] * INTERLINEA for _, t, _ in lineas]
    alto_texto = sum(alturas) - (alturas[-1] - TAM[lineas[-1][1]])
    yy = y + (h - alto_texto) / 2 + TAM[lineas[0][1]] * 0.72
    for (s, tipo, op), a in zip(lineas, alturas):
        negrita = op.get("negrita", tipo == "titulo")
        cursiva = op.get("cursiva", False)
        ancho = largo(s, TAM[tipo], negrita, cursiva)
        if ancho > w - 2 * margen:
            sys.exit(f"no cabe «{s}»: {ancho:.1f} mm en una caja de {w:.1f} mm")
        texto(x + w / 2, yy, s, TAM[tipo], negrita=negrita, cursiva=cursiva, color=op.get("color", NEGRO))
        yy += a
    if yy - a + 0.8 > y + h:
        sys.exit(f"el texto se sale por abajo de la caja de «{lineas[0][0]}»")


def L(s, tipo="texto", **op):
    return (s, tipo, op)


def linea(puntos, *, color=NEGRO, trazo=0.35, flecha=True, discontinua=False):
    """Polilínea; con `flecha`, punta triangular al final."""
    if flecha:
        (x0, y0), (x1, y1) = puntos[-2], puntos[-1]
        d = ((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5
        ux, uy = (x1 - x0) / d, (y1 - y0) / d
        largo_punta, medio = 1.6, 0.65
        bx, by = x1 - ux * largo_punta, y1 - uy * largo_punta
        puntos = puntos[:-1] + [(bx, by)]
        tri = [(x1, y1), (bx - uy * medio, by + ux * medio), (bx + uy * medio, by - ux * medio)]
    guion = ' stroke-dasharray="1.6 1.0"' if discontinua else ""
    pts = " ".join(f"{x:.2f},{y:.2f}" for x, y in puntos)
    partes.append(
        f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="{trazo}" '
        f'stroke-linejoin="round"{guion}/>'
    )
    if flecha:
        pts = " ".join(f"{x:.2f},{y:.2f}" for x, y in tri)
        partes.append(f'<polygon points="{pts}" fill="{color}"/>')


def punto(x, y, color=NEGRO):
    partes.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="0.55" fill="{color}"/>')


# ------------------------------------------------------------- columnas ---
# A entradas | B MediaPipe | C centro del iris | D escala, paralaje, señales | E salidas

AX, AW = 0.4, 23.0
BX, BW = 29.5, 28.0
CX, CW = 64.0, 42.0
DX, DW = 112.5, 30.0
EX, EW = 149.0, 28.6

# --- A: la webcam ---
WY, WH = 22.0, 18.0
caja(AX, WY, AW, WH, [L("Webcam", "titulo"), L("≤ 30 fps"), L("(deliberate cap)")])

# --- B: MediaPipe y lo que entrega ---
BY, BH = 4.0, 66.0
caja(BX, BY, BW, BH, [], fondo=FONDO, borde=GRIS)
texto(BX + BW / 2, BY + 4.6, "MediaPipe", TAM["titulo"], negrita=True)
texto(BX + BW / 2, BY + 4.6 + TAM["titulo"] * INTERLINEA, "face tracking", TAM["titulo"], negrita=True)
SX, SW, SH = BX + 2.5, BW - 5.0, 10.0
OJO_Y, PARPADO_Y, CABEZA_Y = 16.0, 35.5, 55.0
caja(SX, OJO_Y, SW, SH, [L("Eye region")])
caja(SX, PARPADO_Y, SW, SH, [L("Eyelid state"), L("(blinks)")])
caja(SX, CABEZA_Y, SW, SH, [L("Head rotation"), L("(pose matrix)")])
linea([(AX + AW, WY + WH / 2), (BX, WY + WH / 2)])

# --- C: dónde está el iris ---
texto(CX + CW / 2, 8.6, "Iris centre (user-selectable)", TAM["titulo"], negrita=True)
C1Y, C1H = 12.0, 11.0
C2Y, C2H = 30.0, 21.0
caja(CX + 4, C1Y, CW - 8, C1H, [L("MediaPipe iris landmarks", negrita=True), L("(default)")])
texto(CX + CW / 2, (C1Y + C1H + C2Y) / 2 + 1.0, "or", TAM["texto"], cursiva=True, color=GRIS)
caja(
    CX + 4,
    C2Y,
    CW - 8,
    C2H,
    [
        L("YOLOv8n iris detector", negrita=True),
        L("(SIEV-iris, experimental)"),
        L("ONNX, run in the browser"),
        L("pupil = darkest region"),
        L("inside the iris box"),
    ],
)
# Annotix: el único color de la figura.
NY, NH = C2Y + C2H + 2.6, 12.0
caja(
    CX + 4,
    NY,
    CW - 8,
    NH,
    [
        L("Annotated and trained", color=ACENTO, negrita=True),
        L("in Annotix", color=ACENTO, negrita=True),
        L("on real MPIIGaze images", color=ACENTO),
    ],
    borde=ACENTO,
    fondo=ACENTO_FONDO,
    trazo=0.45,
)
linea([(CX + CW / 2, NY), (CX + CW / 2, C2Y + C2H)], color=ACENTO, trazo=0.45, flecha=False)

# Región del ojo -> los dos detectores (bifurcación).
OJO_CY = OJO_Y + SH / 2
RAMA_X = CX + 1.6
linea([(SX + SW, OJO_CY), (RAMA_X, OJO_CY)], flecha=False)
punto(RAMA_X, OJO_CY)
linea([(RAMA_X, OJO_CY), (RAMA_X, C1Y + C1H / 2), (CX + 4, C1Y + C1H / 2)])
linea([(RAMA_X, OJO_CY), (RAMA_X, C2Y + 6.0), (CX + 4, C2Y + 6.0)])

# --- D: escala, paralaje y señales ---
D1Y, D1H = 12.0, 13.0
D2Y, D2H = 31.0, 16.0
D3Y, D3H = 53.0, 15.0
caja(DX, D1Y, DW, D1H, [L("Pixels → mm", "titulo"), L("iris diameter"), L("(11.7 mm) as ruler")])
caja(DX, D2Y, DW, D2H, [L("Parallax", "titulo"), L("calibration (−k)"), L("iris offset →"), L("gaze angle")])
caja(DX, D3Y, DW, D3H, [L("Head and gaze", "titulo"), L("positions, velocities"), L("(with blink flag)")], fondo=FONDO, borde=GRIS)
linea([(DX + DW / 2, D1Y + D1H), (DX + DW / 2, D2Y)])
linea([(DX + DW / 2, D2Y + D2H), (DX + DW / 2, D3Y)])

# Las dos salidas de C se juntan y entran a D.
JUNTA_X = CX + CW + 2.6
linea([(CX + CW - 4, C1Y + C1H / 2), (JUNTA_X, C1Y + C1H / 2)], flecha=False)
linea([(CX + CW - 4, C2Y + 6.0), (JUNTA_X, C2Y + 6.0), (JUNTA_X, C1Y + C1H / 2)], flecha=False)
punto(JUNTA_X, C1Y + C1H / 2)
linea([(JUNTA_X, C1Y + C1H / 2), (DX, C1Y + C1H / 2)])

# El párpado y la cabeza, por abajo, hasta las señales. El parpadeo viaja con
# cada muestra y rechaza el pulso (analysis.js). Las dos líneas no se cruzan:
# la de más arriba sale más afuera y entra más a la izquierda.
BUS_PARPADO_Y, BUS_CABEZA_Y = 72.0, 75.0
linea([(SX + SW, PARPADO_Y + SH / 2), (BX + BW + 4.0, PARPADO_Y + SH / 2), (BX + BW + 4.0, BUS_PARPADO_Y),
       (DX + 6.0, BUS_PARPADO_Y), (DX + 6.0, D3Y + D3H)], color=GRIS, trazo=0.3)
linea([(SX + SW, CABEZA_Y + SH / 2), (BX + BW + 2.3, CABEZA_Y + SH / 2), (BX + BW + 2.3, BUS_CABEZA_Y),
       (DX + 12.0, BUS_CABEZA_Y), (DX + 12.0, D3Y + D3H)])

# --- E: salidas ---
E1Y, E1H = 12.0, 17.0
E2Y, E2H = 33.0, 12.0
E3Y, E3H = 49.0, 19.0
caja(EX, E1Y, EW, E1H, [L("Gain", "titulo"), L("area (positions,"), L("reported), 60 ms"), L("and peak (velocities)")])
caja(EX, E2Y, EW, E2H, [L("Saccades", "titulo"), L("covert and overt")])
caja(EX, E3Y, EW, E3H, [L("Accept / reject", "titulo"), L("each impulse"), L("with its reason"),
                        L("(e.g. blink, too slow)")])
# Señales -> peine hacia las tres salidas.
PEINE_X = EX - 3.0
linea([(DX + DW, D3Y + D3H / 2), (PEINE_X, D3Y + D3H / 2)], flecha=False)
linea([(PEINE_X, E1Y + E1H / 2), (PEINE_X, E3Y + E3H / 2)], flecha=False)
punto(PEINE_X, D3Y + D3H / 2)
for yy in (E1Y + E1H / 2, E2Y + E2H / 2, E3Y + E3H / 2):
    linea([(PEINE_X, yy), (EX, yy)])

# --- Modo de simulación: reemplaza a la webcam, a MediaPipe y al iris ---
MY, MH = 79.0, 23.5
MX, MW = AX, CX + CW - AX
caja(MX, MY, MW, MH, [], borde=GRIS, discontinua=True, trazo=0.4)
texto(MX + 2.0, MY + 4.0, "Simulation mode (no camera): replaces webcam, MediaPipe and iris",
      TAM["titulo"], negrita=True, ancla="start")
G1X, G1W = MX + 3.0, 46.0
G2X, G2W = G1X + G1W + 8.0, 46.0
GY, GH = MY + 7.0, 13.5
caja(G1X, GY, G1W, GH, [L("Smartphone gyroscope", negrita=True), L("worn on the head"), L("resampled to 30 Hz")])
caja(G2X, GY, G2W, GH, [L("Simulated-patient eye", negrita=True), L("drawn face, known parallax"),
                        L("(no calibration needed)")])
# Todo el modo de simulación entra a las señales.
texto((G1X + G1W + G2X) / 2, GY + GH / 2 + 1.2, "+", TAM["titulo"], negrita=True, color=GRIS)
SIM_ENTRA_X = DX + DW - 6.0
SIM_Y = GY + GH / 2
linea([(MX + MW, SIM_Y), (SIM_ENTRA_X, SIM_Y), (SIM_ENTRA_X, D3Y + D3H)], color=GRIS, discontinua=True)

# --- Nota ---
texto(EX + EW / 2, 86.5, "All processing runs", TAM["nota"], cursiva=True, color=GRIS)
texto(EX + EW / 2, 86.5 + TAM["nota"] * INTERLINEA, "locally in the browser", TAM["nota"], cursiva=True, color=GRIS)

# ---------------------------------------------------------------- salida ---


def escribe_svg():
    cuerpo = "\n  ".join(partes)
    SVG.write_text(
        f'<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{ANCHO}mm" height="{ALTO}mm" '
        f'viewBox="0 0 {ANCHO} {ALTO}" font-family="{FAMILIA}">\n'
        f'  <title>trainHIT processing pipeline (Figure 2)</title>\n'
        f'  <rect width="{ANCHO}" height="{ALTO}" fill="#ffffff"/>\n'
        f"  {cuerpo}\n</svg>\n",
        encoding="utf-8",
    )


def exporta():
    subprocess.run(["inkscape", str(SVG), "--export-type=pdf", f"--export-filename={PDF}"], check=True)
    png = AQUI / "figure2_600dpi.png"
    subprocess.run(
        ["inkscape", str(SVG), "--export-type=png", f"--export-dpi={DPI}", "--export-background=#ffffff",
         "--export-background-opacity=1", f"--export-filename={png}"],
        check=True,
    )
    with Image.open(png) as im:
        im.convert("RGB").save(TIF, compression="tiff_lzw", dpi=(DPI, DPI))
    png.unlink()


if __name__ == "__main__":
    escribe_svg()
    exporta()
    with Image.open(TIF) as im:
        print(f"{TIF.name}: {im.size[0]}×{im.size[1]} px, {im.info.get('dpi')} dpi")
    print(f"{PDF.name}, {SVG.name}: listos")
