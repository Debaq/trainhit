#!/usr/bin/env python3
"""Pasa manual.md a manual.pdf.

    python3 docs/manual/generar-pdf.py

Hace falta `pip install markdown weasyprint`. El Markdown es la fuente: el PDF
se regenera cada vez que el manual o las capturas de img/ cambian.
"""
import re
from pathlib import Path

import markdown
from weasyprint import HTML

AQUI = Path(__file__).resolve().parent

CSS = """
@page {
  size: A4;
  margin: 2cm 1.8cm 2.2cm;
  @bottom-center { content: counter(page); font: 9pt 'Noto Sans', sans-serif; color: #777; }
  @top-right { content: 'Manual de uso de trainHIT'; font: 8pt 'Noto Sans', sans-serif; color: #999; }
}
@page :first { @top-right { content: none; } @bottom-center { content: none; } }
body { font: 10.5pt/1.5 'Noto Sans', 'DejaVu Sans', sans-serif; color: #1d1d22; }
h1 { font-size: 30pt; margin: 5cm 0 0.2cm; color: #111; }
h1 + p { font-size: 13pt; color: #2b6fd6; }
h2 { break-before: page; font-size: 18pt; color: #111; border-bottom: 3px solid #2b6fd6;
     padding-bottom: 4pt; margin-top: 0; }
h3 { font-size: 12.5pt; color: #2b6fd6; margin: 16pt 0 4pt; break-after: avoid; }
a { color: #2b6fd6; text-decoration: none; }
code, pre { font-family: 'Noto Sans Mono', 'DejaVu Sans Mono', monospace; font-size: 9pt; }
code { background: #f1f1f4; padding: 0 3pt; border-radius: 3pt; }
pre { background: #f1f1f4; padding: 6pt 10pt; border-radius: 4pt; }
blockquote { margin: 10pt 0; padding: 6pt 12pt; border-left: 4px solid #e8791e;
             background: #fdf3ea; border-radius: 0 4pt 4pt 0; }
blockquote p { margin: 3pt 0; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 9pt; break-inside: auto; }
th { background: #1d1d22; color: #fff; text-align: left; }
th, td { padding: 4pt 6pt; border: 1px solid #d4d4dc; vertical-align: top; }
tr { break-inside: avoid; }
tr:nth-child(even) td { background: #f7f7fa; }
figure { margin: 10pt 0 14pt; text-align: center; break-inside: avoid; }
figure img { max-width: 100%; max-height: 10.5cm; border: 1px solid #c8c8d0; border-radius: 4pt; }
figcaption { font-size: 8.5pt; color: #666; margin-top: 4pt; font-style: italic; }
hr { display: none; }
ol, ul { padding-left: 16pt; }
li { margin: 2pt 0; }
"""


def figuras(html: str) -> str:
    """Cada imagen sola en un párrafo pasa a figura, con su alt como epígrafe."""
    return re.sub(
        r'<p><img alt="([^"]*)" src="([^"]+)" ?/?></p>',
        r'<figure><img alt="\1" src="\2"><figcaption>\1</figcaption></figure>',
        html,
    )


def main() -> None:
    md = (AQUI / 'manual.md').read_text(encoding='utf-8')
    cuerpo = markdown.markdown(md, extensions=['tables', 'fenced_code', 'toc', 'sane_lists'])
    html = f'<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Manual de uso de trainHIT</title><style>{CSS}</style></head><body>{figuras(cuerpo)}</body></html>'
    salida = AQUI / 'manual.pdf'
    HTML(string=html, base_url=str(AQUI)).write_pdf(salida)
    print(salida)


if __name__ == '__main__':
    main()
