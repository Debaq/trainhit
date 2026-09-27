# Relevo del enlace teléfono–PC

Una tubería por WebSocket para cuando la red no deja que el teléfono y el PC
se hablen directo: el teléfono con datos móviles y el PC en otra red, o un
wifi institucional con aislamiento de clientes. Sin el relevo, el enlace del
Laberinto 3D solo funciona donde la conexión directa se puede. Con el relevo,
si la directa no se abre en unos segundos, los dos aparatos pasan solos por
acá, y la barra del PC dice «TELÉFONO ENLAZADO · POR EL SERVIDOR».

Son dos archivos, `relevo.js` y `package.json`. No hay que instalar nada: no
tiene dependencias.

La página lo busca en `servidor/relevo/`, al lado de ella
(`<meta name="trainhit-relevo">` en index.html). Lo más simple es cargarlo en
esa misma carpeta del servidor, que ya queda al subir trainHIT completo.

## Cargarlo en cPanel

En lo que sigue, `CARPETA` es donde está trainHIT en el servidor (por ejemplo
`public_html/trainhit`) y `DOMINIO/RUTA` es su dirección (por ejemplo
`ejemplo.org/trainhit`).

1. Subir trainHIT completo, si no está: el relevo queda en
   `CARPETA/servidor/relevo`.
2. En cPanel, sección **Software**, entrar a **Setup Node.js App**.
3. Apretar **Create Application** y completar:
   - **Node.js version**: la más nueva que ofrezca (18 o más).
   - **Application mode**: `Production`.
   - **Application root**: `CARPETA/servidor/relevo`.
   - **Application URL**: `DOMINIO` y `RUTA/servidor/relevo`.
   - **Application startup file**: `relevo.js`.

   Y apretar **Create**.
4. Si cPanel creó un `app.js` de ejemplo en esa carpeta, se lo puede borrar.
   En la aplicación, apretar **Restart**.

Dos cuidados:

- Al crear la aplicación, cPanel escribe un `.htaccess` en esa carpeta para
  mandarle el tráfico a Node. Al actualizar trainHIT, copiar y sobrescribir
  archivos está bien; reemplazar la carpeta entera borra ese `.htaccess` y el
  relevo deja de responder (se arregla volviendo a crear la aplicación).
- Cuando cambie `relevo.js`, apretar **Restart** para que lo tome.

## Probarlo

1. Abrir `https://DOMINIO/RUTA/servidor/relevo/` en el navegador. Tiene que
   decir `trainHIT relevo: ok · 0 salas`. Si no, mirar el archivo
   `stderr.log` de la carpeta.
2. Probar la tubería de verdad: en el PC, abrir trainHIT con `?forzar=relevo`
   al final de la dirección, entrar al Laberinto 3D, **Enlazar**, y escanear
   el QR con el teléfono. Así se salta la conexión directa. La barra tiene que
   decir «TELÉFONO ENLAZADO · POR EL SERVIDOR» y la cabeza tiene que seguir al
   teléfono.

Si el paso 1 anda pero el 2 no, es probable que el hosting no deje pasar
WebSocket a las aplicaciones Node. En ese caso hay otro camino (una tubería por
el PHP, con un poco más de demora).

## Detalles

- Una página del mismo dominio que el relevo entra siempre. Para usarlo desde
  una página publicada en otro sitio, sumarlo a `ORIGENES` al principio de
  `relevo.js`, o en la variable de entorno `RELEVO_ORIGENES` (separados por
  comas), que se carga en la misma pantalla de cPanel.
- Guarda las salas en memoria. Si el hosting corriera **varias copias** de la
  aplicación a la vez, dos aparatos podrían caer en copias distintas y no
  encontrarse; cPanel corre una sola por defecto.
- Si nadie lo usa por un rato, cPanel lo duerme y lo despierta con el próximo
  pedido: la primera conexión después tarda un poco más.
- Para probar en la propia máquina: `node relevo.js` (escucha en el puerto
  3001) y abrir la página con `?relevo=local`; hay que sumar
  `ws://localhost:3001` a `connect-src` en la CSP de `index.html`, que no lo
  trae para no abrir la página publicada a nada local.
