// Arranque: hoja de estilo y módulo de entrada, versionados.
//
// La versión vive en el mapa de importación de index.html, que es el único
// lugar donde tiene que estar: de ahí salen los `?v=` de todos los módulos.
// Acá se la lee para ponérsela a la hoja de estilo y al módulo de entrada, y
// para mostrarla en la página. Se sube con `./bump.sh`.
//
// Es un script clásico aparte y no en línea porque la política de seguridad
// (CSP) de index.html prohíbe scripts en línea; el mapa de importación, que
// no puede ser externo, va autorizado por hash.
{
  const mapa = JSON.parse(document.querySelector('script[type="importmap"]').textContent);
  const V = mapa.imports['./js/app.js'].split('?v=')[1];
  document.documentElement.dataset.v = V;

  const hoja = document.createElement('link');
  hoja.rel = 'stylesheet';
  hoja.href = `css/estilo.css?v=${V}`;
  document.head.appendChild(hoja);

  // Un `<script type="module">` en línea lo prohíbe la CSP: se inserta desde
  // acá, con su `?v=`. Sus imports internos pasan por el mapa.
  const entrada = document.createElement('script');
  entrada.type = 'module';
  entrada.src = `js/app.js?v=${V}`;
  document.head.appendChild(entrada);
}
