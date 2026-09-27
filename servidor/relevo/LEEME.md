# Relevo del enlace teléfono–PC

Una tubería por WebSocket para cuando la red no deja que el teléfono y el PC
se hablen directo: el teléfono con datos móviles y el PC en otra red, o un
wifi institucional con aislamiento de clientes. Sin el relevo, el enlace del
Laberinto 3D solo funciona donde la conexión directa se puede. Con el relevo,
si la directa no se abre en unos segundos, los dos aparatos pasan solos por
acá, y la barra del PC dice «TELÉFONO ENLAZADO · POR EL SERVIDOR».

Son dos archivos, `relevo.js` y `package.json`. No hay que instalar nada: no
tiene dependencias.

## Cargarlo en cPanel

1. En cPanel, sección **Software**, entrar a **Setup Node.js App**.
2. Apretar **Create Application** y completar:
   - **Node.js version**: la más nueva que ofrezca (18 o más).
   - **Application mode**: `Production`.
   - **Application root**: `trainhit-relevo`. Es una carpeta en tu directorio
     personal, **fuera** de `public_html`.
   - **Application URL**: elegir `tecmedhub.org` y escribir `trainhit-relevo`.
   - **Application startup file**: `relevo.js`.

   Y apretar **Create**.
3. Con el **Administrador de archivos** (File Manager), entrar a la carpeta
   `trainhit-relevo` de tu directorio personal y subir `relevo.js` y
   `package.json`, los de esta carpeta. Si cPanel creó un `app.js` de
   ejemplo, se lo puede borrar.
4. Volver a **Setup Node.js App** y, en la aplicación, apretar **Restart**.

## Probarlo

1. Abrir <https://tecmedhub.org/trainhit-relevo/> en el navegador. Tiene que
   decir `trainHIT relevo: ok · 0 salas`. Si no, mirar el archivo
   `stderr.log` de la carpeta `trainhit-relevo`.
2. Probar la tubería de verdad: en el PC, abrir trainHIT con `?forzar=relevo`
   al final de la dirección
   (<https://tecmedhub.org/trainhit/?forzar=relevo>), entrar al Laberinto 3D,
   **Enlazar**, y escanear el QR con el teléfono. Así se salta la conexión
   directa. La barra tiene que decir «TELÉFONO ENLAZADO · POR EL SERVIDOR» y la
   cabeza tiene que seguir al teléfono.

Si el paso 1 anda pero el 2 no, es probable que el hosting no deje pasar
WebSocket a las aplicaciones Node. En ese caso hay otro camino (una tubería por
el PHP, con un poco más de demora): avisar.

## Detalles

- Guarda las salas en memoria. Si el hosting corriera **varias copias** de la
  aplicación a la vez, dos aparatos podrían caer en copias distintas y no
  encontrarse; cPanel corre una sola por defecto.
- Si nadie lo usa por un rato, cPanel lo duerme y lo despierta con el próximo
  pedido: la primera conexión después tarda un poco más.
- Desde dónde se lo puede usar está en `ORIGENES`, al principio de
  `relevo.js`, igual que en `senal.php`.
- Para probar en la propia máquina: `node relevo.js` (escucha en el puerto
  3001) y abrir la página con `?relevo=local`; hay que sumar
  `ws://localhost:3001` a `connect-src` en la CSP de `index.html`, que no lo
  trae para no abrir la página publicada a nada local.
