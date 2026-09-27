#!/usr/bin/env python3
"""Pasa el manual de uso y guía docente de Markdown a PDF, en los dos idiomas:
manual.md → trainhit-manual.pdf y manual.en.md → trainhit-manual-en.pdf.

    python3 docs/manual/generar-pdf.py

Hace falta `pip install markdown weasyprint`. El Markdown es la fuente. Los PDF
no van en el repo (.gitignore): son assets del release «manual» de GitHub, que
es de donde los baja la página. Para publicar una versión nueva:

    gh release upload manual docs/manual/trainhit-manual*.pdf --clobber
"""
import re
from pathlib import Path

import markdown
from weasyprint import HTML

AQUI = Path(__file__).resolve().parent

CSS = """
@page { @top-right { content: '%(encabezado)s'; } @bottom-left { content: '%(pie)s'; } }
@page {
  size: A4;
  margin: 2cm 1.8cm 2.2cm;
  @top-right { font: 8pt 'Noto Sans', sans-serif; color: #999; }
  @bottom-left { font: 8pt 'Noto Sans', sans-serif; color: #777; }
  @bottom-right { content: counter(page); font: 9pt 'Noto Sans', sans-serif; color: #777; }
}
@page :first { @top-right { content: none; } @bottom-right { content: none; } }
body { font: 10.5pt/1.5 'Noto Sans', 'DejaVu Sans', sans-serif; color: #1d1d22; }
h1 { font-size: 40pt; margin: 5cm 0 0.1cm; color: #111; }
h1 + p { font-size: 20pt; color: #2b6fd6; margin: 0 0 0.3cm; }
h1 + p + p { font-size: 12pt; color: #555; margin-bottom: 2.5cm; }
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
.indice ul { list-style: none; padding-left: 8pt; }
/* Los logos del laboratorio y de la universidad, al pie de la portada. */
.logos { display: flex; align-items: center; gap: 1.6cm; margin-top: 3.2cm; }
.logos img { height: 2.6cm; width: auto; }
"""


def figuras(html: str) -> str:
    """Cada imagen sola en un párrafo pasa a figura, con su alt como epígrafe."""
    return re.sub(
        r'<p><img alt="([^"]*)" src="([^"]+)" ?/?></p>',
        r'<figure><img alt="\1" src="\2"><figcaption>\1</figcaption></figure>',
        html,
    )


IDIOMAS = {
    'es': {
        'fuente': 'manual.md',
        'salida': 'trainhit-manual.pdf',
        'titulo': 'trainHIT · Manual de uso y guía docente',
        'pie': 'TecMedHub · Universidad Austral de Chile, Sede Puerto Montt',
    },
    'en': {
        'fuente': 'manual.en.md',
        'salida': 'trainhit-manual-en.pdf',
        'titulo': 'trainHIT · User manual and teacher’s guide',
        'pie': 'TecMedHub · Universidad Austral de Chile, Puerto Montt campus',
    },
}


def main() -> None:
    for lang, d in IDIOMAS.items():
        md = (AQUI / d['fuente']).read_text(encoding='utf-8')
        cuerpo = markdown.markdown(md, extensions=['tables', 'fenced_code', 'toc', 'sane_lists', 'md_in_html'])
        # El % de CSS no es un formato: solo se reemplazan las dos claves.
        css = CSS.replace('%(encabezado)s', d['titulo']).replace('%(pie)s', d['pie'])
        html = (
            f'<!doctype html><html lang="{lang}"><head><meta charset="utf-8">'
            f'<title>{d["titulo"]}</title><style>{css}</style></head><body>{figuras(cuerpo)}</body></html>'
        )
        salida = AQUI / d['salida']
        HTML(string=html, base_url=str(AQUI)).write_pdf(salida)
        print(salida)


if __name__ == '__main__':
    main()
