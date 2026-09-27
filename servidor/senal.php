<?php
// Señalización del enlace teléfono–PC del Laberinto 3D.
//
// Solo presenta a los dos aparatos: el PC abre una sala y recibe un código
// de 6 dígitos, deja ahí su oferta WebRTC, el teléfono la lee con el código y
// deja su respuesta, y el PC la lee. Desde ese momento los datos del
// giroscopio van directo entre los dos (WebRTC), no pasan por acá.
//
// Si la conexión se cae —el teléfono se durmió, se cortó el wifi—, el PC
// reabre la MISMA sala con la llave que recibió al crearla, deja una oferta
// nueva y el teléfono vuelve a entrar con el mismo código, sin que nadie
// escriba nada. Cada oferta lleva un número (`n`) y la respuesta tiene que
// traer el de la oferta que contesta: una respuesta a una oferta vieja se
// rechaza.
//
// Un solo archivo, sin base de datos: cada sala es un JSON en el directorio
// temporal, que vence a los 10 minutos sin uso. Sube a cualquier hosting con
// PHP 7.4+.
//
//   POST ?accion=crear                               → {"codigo", "llave"}
//   POST ?accion=reabrir&codigo=…&llave=…            → {"ok": true}
//   POST ?accion=oferta&codigo=…&llave=…     (SDP)   → {"n": 3}
//   GET  ?accion=oferta&codigo=…                     → {"sdp", "n"} o 404
//   POST ?accion=respuesta&codigo=…&n=…      (SDP)   → {"ok": true}
//   GET  ?accion=respuesta&codigo=…&llave=…          → {"sdp"} o 404
//
// Los POST van con Content-Type text/plain para que el navegador no mande la
// consulta previa de CORS.

// Desde dónde se lo puede llamar: la página publicada y los servidores
// locales de prueba. Agregar acá si se la sirve desde otro lado.
const ORIGENES = [
    'https://debaq.github.io',
    'https://tecmedhub.org',
    'http://localhost:8093',
    'http://localhost:8095',
];
const VIGENCIA_S = 600;
const SDP_MAX = 20000;

$origen = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origen, ORIGENES, true)) {
    header("Access-Control-Allow-Origin: $origen");
    header('Vary: Origin');
}
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Methods: GET, POST');
    header('Access-Control-Allow-Headers: Content-Type');
    exit;
}

function responde(int $estado, array $cuerpo): void
{
    http_response_code($estado);
    echo json_encode($cuerpo);
    exit;
}

function ruta(string $codigo): string
{
    return sys_get_temp_dir() . "/trainhit-sala-$codigo.json";
}

/** Borra las salas vencidas. Barato: pocas salas vivas a la vez. */
function limpia(): void
{
    foreach (glob(sys_get_temp_dir() . '/trainhit-sala-*.json') ?: [] as $f) {
        if (filemtime($f) < time() - VIGENCIA_S) @unlink($f);
    }
}

function lee(string $codigo): ?array
{
    $f = ruta($codigo);
    if (!is_file($f) || filemtime($f) < time() - VIGENCIA_S) return null;
    $sala = json_decode((string) file_get_contents($f), true);
    return is_array($sala) ? $sala : null;
}

function guarda(string $codigo, array $sala): void
{
    file_put_contents(ruta($codigo), json_encode($sala), LOCK_EX);
}

function salaNueva(string $llave): array
{
    return ['llave' => $llave, 'n' => 0, 'oferta' => null, 'respuesta' => null];
}

$accion = $_GET['accion'] ?? '';
$codigo = preg_replace('/\D/', '', $_GET['codigo'] ?? '');
$llave = preg_replace('/[^0-9a-f]/', '', $_GET['llave'] ?? '');
$metodo = $_SERVER['REQUEST_METHOD'];

if ($accion === 'crear' && $metodo === 'POST') {
    limpia();
    // Seis dígitos al azar que no estén en uso.
    for ($i = 0; $i < 20; $i++) {
        $nuevo = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        if (lee($nuevo) === null) {
            $secreta = bin2hex(random_bytes(16));
            guarda($nuevo, salaNueva($secreta));
            responde(200, ['codigo' => $nuevo, 'llave' => $secreta]);
        }
    }
    responde(503, ['error' => 'sin códigos libres']);
}

if (strlen($codigo) !== 6) responde(400, ['error' => 'código inválido']);
$sala = lee($codigo);
$esDueno = $sala !== null && $llave !== '' && hash_equals($sala['llave'], $llave);

if ($accion === 'reabrir' && $metodo === 'POST') {
    // La sala sigue siendo del PC que la creó. Si ya venció y nadie tomó el
    // código, se la vuelve a armar con la misma llave.
    if ($sala !== null && !$esDueno) responde(403, ['error' => 'la sala es de otro']);
    if ($llave === '') responde(400, ['error' => 'falta la llave']);
    $n = $sala['n'] ?? 0;
    $sala = salaNueva($llave);
    $sala['n'] = $n;
    guarda($codigo, $sala);
    responde(200, ['ok' => true]);
}

if ($sala === null) responde(404, ['error' => 'no hay sala con ese código']);

if ($accion === 'oferta' && $metodo === 'POST') {
    if (!$esDueno) responde(403, ['error' => 'la sala es de otro']);
    $sdp = (string) file_get_contents('php://input');
    if ($sdp === '' || strlen($sdp) > SDP_MAX) responde(400, ['error' => 'SDP vacío o muy largo']);
    $sala['n'] += 1;
    $sala['oferta'] = $sdp;
    $sala['respuesta'] = null;
    guarda($codigo, $sala);
    responde(200, ['n' => $sala['n']]);
}

if ($accion === 'oferta') {
    if ($sala['oferta'] === null || $sala['respuesta'] !== null) responde(404, ['error' => 'todavía no']);
    responde(200, ['sdp' => $sala['oferta'], 'n' => $sala['n']]);
}

if ($accion === 'respuesta' && $metodo === 'POST') {
    $sdp = (string) file_get_contents('php://input');
    if ($sdp === '' || strlen($sdp) > SDP_MAX) responde(400, ['error' => 'SDP vacío o muy largo']);
    // Solo se contesta la oferta vigente, y una sola vez.
    if ((int) ($_GET['n'] ?? -1) !== $sala['n'] || $sala['oferta'] === null) responde(409, ['error' => 'oferta vieja']);
    if ($sala['respuesta'] !== null) responde(409, ['error' => 'ya escrito']);
    $sala['respuesta'] = $sdp;
    guarda($codigo, $sala);
    responde(200, ['ok' => true]);
}

if ($accion === 'respuesta') {
    if (!$esDueno) responde(403, ['error' => 'la sala es de otro']);
    if ($sala['respuesta'] === null) responde(404, ['error' => 'todavía no']);
    // Se deja la sala: sirve para reconectar. Se la toca para que no venza
    // mientras el enlace está vivo.
    touch(ruta($codigo));
    responde(200, ['sdp' => $sala['respuesta']]);
}

responde(400, ['error' => 'acción inválida']);
