// Arranque: versión de los archivos y mapa de importación. Es un script
// clásico y va ANTES del módulo de entrada, porque el mapa de importación
// tiene que existir antes del primer `import`.
//
// Vive en un archivo aparte y no en línea para que la política de seguridad
// (CSP) de index.html pueda prohibir scripts en línea del todo.
{
  // Versión de los archivos: se toca acá o con `./bump.sh`. Cada archivo se
  // pide con `?v=…` para que alcance con recargar, sin recarga forzada.
  const V = '2026-09-21.16';
  const MODULOS = ['analysis', 'app', 'bienvenida', 'curve', 'geom', 'head', 'pipeline', 'plots', 'signal', 'tracker'];
  document.documentElement.dataset.v = V;

  const hoja = document.createElement('link');
  hoja.rel = 'stylesheet';
  hoja.href = `css/estilo.css?v=${V}`;
  document.head.appendChild(hoja);

  // El mapa de importación versiona también los `import` internos, que no
  // heredan el `?v=` del script de entrada. Va con createElement: un
  // <script> insertado como texto no se procesa.
  const mapa = document.createElement('script');
  mapa.type = 'importmap';
  mapa.textContent = JSON.stringify({
    imports: Object.fromEntries(MODULOS.map((m) => [`./js/${m}.js`, `./js/${m}.js?v=${V}`])),
  });
  document.head.appendChild(mapa);
}
