<?php
// Señalización del enlace teléfono–PC del Laberinto 3D.
//
// Solo presenta a los dos aparatos: el PC abre una sala y recibe un código
// de 6 dígitos, deja ahí su oferta WebRTC, el teléfono la lee con el código y
// deja su respuesta, y el PC la lee. Desde ese momento los datos del
// giroscopio van directo entre los dos (WebRTC), no pasan por acá.
//
// Un solo archivo, sin base de datos: cada sala es un JSON en el directorio
// temporal, que vence a los 10 minutos. Sube a cualquier hosting con PHP 7.4+.
//
//   POST ?accion=crear                       → {"codigo": "482913"}
//   POST ?accion=oferta&codigo=…      (SDP)  → {"ok": true}
//   GET  ?accion=oferta&codigo=…             → {"sdp": …} o 404 si no hay
//   POST ?accion=respuesta&codigo=…   (SDP)  → {"ok": true}
//   GET  ?accion=respuesta&codigo=…          → {"sdp": …} o 404 si todavía no
//
// Los POST van con Content-Type text/plain para que el navegador no mande la
// consulta previa de CORS.

// Desde dónde se lo puede llamar. La página publicada y el servidor local de
// pruebas; agregar acá si se la sirve desde otro lado.
const ORIGENES = [
    'https://debaq.github.io',
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

$accion = $_GET['accion'] ?? '';
$codigo = preg_replace('/\D/', '', $_GET['codigo'] ?? '');
$metodo = $_SERVER['REQUEST_METHOD'];

if ($accion === 'crear' && $metodo === 'POST') {
    limpia();
    // Seis dígitos al azar que no estén en uso.
    for ($i = 0; $i < 20; $i++) {
        $nuevo = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        if (lee($nuevo) === null) {
            guarda($nuevo, ['oferta' => null, 'respuesta' => null]);
            responde(200, ['codigo' => $nuevo]);
        }
    }
    responde(503, ['error' => 'sin códigos libres']);
}

if (strlen($codigo) !== 6) responde(400, ['error' => 'código inválido']);
if (!in_array($accion, ['oferta', 'respuesta'], true)) responde(400, ['error' => 'acción inválida']);
$sala = lee($codigo);
if ($sala === null) responde(404, ['error' => 'no hay sala con ese código']);

if ($metodo === 'POST') {
    $sdp = (string) file_get_contents('php://input');
    if ($sdp === '' || strlen($sdp) > SDP_MAX) responde(400, ['error' => 'SDP vacío o muy largo']);
    // Cada lado escribe una sola vez: nadie pisa una sala ya armada.
    if ($sala[$accion] !== null) responde(409, ['error' => 'ya escrito']);
    $sala[$accion] = $sdp;
    guarda($codigo, $sala);
    responde(200, ['ok' => true]);
}

if ($sala[$accion] === null) responde(404, ['error' => 'todavía no']);
$sdp = $sala[$accion];
// Leída la respuesta, la sala ya no sirve para nada más.
if ($accion === 'respuesta') @unlink(ruta($codigo));
responde(200, ['sdp' => $sdp]);
