#!/usr/bin/env python3
"""Figura 1 del artículo: calibración del paralaje en trainHIT.

Los números NO se calculan aquí: los saca figure1_datos.mjs con el motor de la
app (js/). Este script solo dibuja y exporta.

Uso:
    python3 make_figure1.py                    # la figura final, de sesion_figura1.csv
    python3 make_figure1.py --lado derecha     # si la sesión trae impulsos aceptados a los dos lados
    python3 make_figure1.py --sintetico        # prueba del flujo con el paciente de ejemplo -> prueba/

Salidas (la final): figure1.pdf (vectorial, fuente incrustada), figure1.tif
(600 dpi, LZW) y figure1_valores.txt (lo mismo que se imprime en la consola).

Probado con: Node 22.23.2, Python 3.14.7, matplotlib 3.11.1, numpy 2.5.2,
Pillow 12.3.0 y la fuente Liberation Sans (métricas de Arial). Ver
requirements.txt.
"""

import argparse
import io
import json
import platform
import subprocess
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import PIL  # noqa: E402
from matplotlib import font_manager  # noqa: E402
from PIL import Image  # noqa: E402

AQUI = Path(__file__).resolve().parent
CSV = AQUI / "sesion_figura1.csv"

CM = 1 / 2.54
ANCHO_CM = 17.8  # dos columnas
ALTO_CM = 7.0
DPI_TIFF = 600

FUENTE = "Liberation Sans"
NEGRO = "black"
GRIS = "0.55"
ACENTO = "#a50f15"  # rojo oscuro: el único color, para k = 0

# Ventana del panel B, en ms desde el inicio del impulso.
B_DESDE_MS = -50
B_HASTA_MS = 300


def datos(args):
    """Corre el motor de la app (vía Node) y devuelve su JSON."""
    cmd = ["node", str(AQUI / "figure1_datos.mjs")]
    if args.sintetico:
        cmd.append("--sintetico")
    else:
        if not CSV.exists():
            sys.exit(f"No está {CSV.name}: exportar la sesión desde la app y dejarla en {AQUI}.")
        cmd.append(str(CSV))
    if args.lado:
        cmd += ["--lado", args.lado]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(r.stderr.strip() or f"figure1_datos.mjs salió con código {r.returncode}")
    return json.loads(r.stdout)


def estilo():
    if not any(f.name == FUENTE for f in font_manager.fontManager.ttflist):
        sys.exit(f"Falta la fuente {FUENTE} (paquete ttf-liberation / fonts-liberation).")
    plt.rcParams.update(
        {
            "font.family": FUENTE,
            "font.size": 8,
            "axes.labelsize": 8,
            "xtick.labelsize": 7,
            "ytick.labelsize": 7,
            "legend.fontsize": 7,
            "axes.linewidth": 0.6,
            "xtick.major.width": 0.6,
            "ytick.major.width": 0.6,
            "xtick.major.size": 3,
            "ytick.major.size": 3,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "axes.unicode_minus": True,
            "pdf.fonttype": 42,  # TrueType incrustada: el texto sigue siendo texto
            "svg.fonttype": "none",
        }
    )


def letra(ax, texto):
    ax.text(-0.16, 1.04, texto, transform=ax.transAxes, fontsize=11, fontweight="bold", va="bottom", ha="left")


def num(v, d):
    """Número con signo menos tipográfico, como en los ejes."""
    return f"{v:.{d}f}".replace("-", "−")


def r2(v):
    """R² con tres decimales; si redondea a 1, «> 0.999» en vez de un 1.000 que no es."""
    return "> 0.999" if round(v, 3) >= 1 else f"= {v:.3f}"


def panel_a(ax, cal):
    p = np.array(cal["puntos"])
    ax.scatter(p[:, 0], p[:, 1], s=3, c=GRIS, linewidths=0, rasterized=False, zorder=2)
    x = np.array([p[:, 0].min(), p[:, 0].max()])
    ax.plot(x, cal["ordenada"] + cal["pendiente"] * x, color=NEGRO, lw=1.2, zorder=3)
    ax.set_xlabel("Sine of head rotation")
    ax.set_ylabel("Iris offset / R")
    ax.text(
        0.97,
        0.96,
        f"Slope (−k) = {num(cal['pendiente'], 3)}\nR² {r2(cal['r2'])}\nn = {cal['n']} frames",
        transform=ax.transAxes,
        ha="right",
        va="top",
        linespacing=1.4,
    )
    letra(ax, "A")


def curva(c, campo):
    t = np.array([m["t"] for m in c])
    v = np.array([m[campo] for m in c])
    dentro = (t >= B_DESDE_MS) & (t <= B_HASTA_MS)
    return t[dentro], v[dentro]


def media(m):
    a = np.array(m)
    dentro = (a[:, 0] >= B_DESDE_MS) & (a[:, 0] <= B_HASTA_MS)
    return a[dentro, 0], a[dentro, 1]


def panel_b(ax, d):
    fino = dict(lw=0.4, alpha=0.45)
    for imp in d["impulsos"]:
        ax.plot(*curva(imp["curvaK"], "cabeza"), color=NEGRO, **fino)
        ax.plot(*curva(imp["curvaK"], "ojo"), color=GRIS, **fino)
        ax.plot(*curva(imp["curva0"], "ojo"), color=ACENTO, ls=(0, (3, 1.5)), **fino)

    rk, r0 = d["resumenK"], d["resumen0"]
    k = d["calibracion"]["k"]
    # Con k corregido el ojo calza con la cabeza: la cabeza va encima y más
    # delgada, para que el gris se vea como un borde a cada lado.
    ax.plot(*media(d["media"]["ojoK"]), color=GRIS, lw=2.6, label=f"Eye, k = {k:.2f}: gain {rk['media']:.2f} ± {rk['de']:.2f}")
    ax.plot(*media(d["media"]["ojo0"]), color=ACENTO, lw=1.6, ls=(0, (4, 2)), label=f"Eye, k = 0: gain {r0['media']:.2f} ± {r0['de']:.2f}")
    ax.plot(*media(d["media"]["cabeza"]), color=NEGRO, lw=1.2, label="Head")
    # La leyenda en el orden de lectura: cabeza, ojo corregido, ojo con k = 0.
    h, l = ax.get_legend_handles_labels()
    orden = [2, 0, 1]
    ax.axhline(0, color="0.8", lw=0.5, zorder=0)
    ax.set_xlim(B_DESDE_MS, B_HASTA_MS)
    ax.set_xlabel("Time from impulse onset (ms)")
    ax.set_ylabel("Velocity (°/s)")
    ax.legend([h[i] for i in orden], [l[i] for i in orden], loc="upper right", frameon=False, handlelength=2.6, borderaxespad=0.2)
    letra(ax, "B")


def figura(d):
    estilo()
    fig, (a, b) = plt.subplots(
        1, 2, figsize=(ANCHO_CM * CM, ALTO_CM * CM), gridspec_kw={"width_ratios": [1, 1.25], "wspace": 0.32}
    )
    panel_a(a, d["calibracion"])
    panel_b(b, d)
    fig.subplots_adjust(left=0.075, right=0.975, bottom=0.17, top=0.9)
    return fig


def exporta(fig, base):
    base.parent.mkdir(parents=True, exist_ok=True)
    # Sin fecha de creación: el mismo CSV da el mismo PDF byte a byte.
    fig.savefig(base.with_suffix(".pdf"), metadata={"CreationDate": None, "Creator": "make_figure1.py"})
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=DPI_TIFF)
    buf.seek(0)
    # RGB sin canal alfa: algunos sistemas editoriales rechazan TIFF con transparencia.
    Image.open(buf).convert("RGB").save(base.with_suffix(".tif"), compression="tiff_lzw", dpi=(DPI_TIFF, DPI_TIFF))


def informe(d):
    cal = d["calibracion"]
    lineas = [
        f"Datos: {d['origen']}",
        "",
        "Panel A: calibración del paralaje (fitParallax, js/geom.js)",
        f"  R (centro de rotación del globo -> iris) = {d['R_mm']} mm",
        f"  k = {cal['k']:.4f}   pendiente (-k) = {cal['pendiente']:.4f}   ordenada = {cal['ordenada']:.4f}",
        f"  R² = {cal['r2']:.5f}   residuo = {cal['residuoDeg']:.3f}°   rango de cabeza = {cal['rangoDeg']:.1f}°   n = {cal['n']} cuadros",
        "",
        f"Panel B: impulsos aceptados hacia la {d['lado']} (lado sano), ganancia de área (computeGains, js/analysis.js)",
        f"  {'id':>4} {'pico °/s':>9} {'dur ms':>7} {'k corr.':>9} {'k = 0':>9}   (pico: {'k corr.':>7} {'k = 0':>7})",
    ]
    for i in d["impulsos"]:
        lineas.append(
            f"  {i['id']:>4} {i['picoCabezaDegS']:>9.1f} {i['duracionMs']:>7.1f} {i['gananciaK']:>9.4f} {i['ganancia0']:>9.4f}"
            f"   (       {i['gananciaPicoK']:>7.4f} {i['gananciaPico0']:>7.4f})"
        )
    rk, r0, pk, p0 = d["resumenK"], d["resumen0"], d["resumenPicoK"], d["resumenPico0"]
    lineas += [
        f"  media ± DE (n = {rk['n']}):  k = {cal['k']:.4f}: {rk['media']:.4f} ± {rk['de']:.4f}   k = 0: {r0['media']:.4f} ± {r0['de']:.4f}",
        f"  (ganancia de pico, solo referencia: {pk['media']:.4f} ± {pk['de']:.4f} y {p0['media']:.4f} ± {p0['de']:.4f})",
        f"  derivador: {', '.join(sorted({f'{i['deriv']['windowMs']} ms grado {i['deriv']['degree']}' for i in d['impulsos']}))}",
    ]
    if d["avisos"]:
        lineas += ["", "Avisos:"] + [f"  - {a}" for a in d["avisos"]]
    lineas += [
        "",
        "Versiones:",
        f"  Node {d['node'].lstrip('v')}, Python {platform.python_version()}, matplotlib {matplotlib.__version__}, "
        f"numpy {np.__version__}, Pillow {PIL.__version__}, fuente {FUENTE}",
    ]
    return "\n".join(lineas) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sintetico", action="store_true", help="probar el flujo con el paciente de ejemplo (sale a prueba/)")
    ap.add_argument("--lado", choices=["derecha", "izquierda"], help="lado sano, si hay impulsos aceptados a los dos lados")
    args = ap.parse_args()

    d = datos(args)
    base = AQUI / "prueba" / "figure1_sintetico" if args.sintetico else AQUI / "figure1"
    exporta(figura(d), base)
    texto = informe(d)
    base.with_name(base.name + "_valores.txt").write_text(texto, encoding="utf-8")
    print(texto, end="")
    print(f"\nEscrito: {base.with_suffix('.pdf')}, {base.with_suffix('.tif')}")


if __name__ == "__main__":
    main()
