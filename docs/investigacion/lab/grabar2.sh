#!/usr/bin/env bash
# Prueba 2: supresión del VOR. Mirar el pulgar que se mueve con la cabeza es
# una ganancia 0 verdadera; fijar la cámara, una ganancia 1.
set -euo pipefail
# Los archivos quedan en la carpeta desde donde se corre.
di() { espeak-ng -v es-419 -s 150 "$1" 2>/dev/null; }
rm -f grab2.mkv fases2.txt
di "Segunda prueba. Luz de frente, sin anteojos. Empezamos mirando la lente de la cámara."
ffmpeg -loglevel error -f v4l2 -input_format mjpeg -video_size 1280x720 -framerate 30 -i /dev/video0 -c:v copy -t 300 grab2.mkv &
FF=$!
T0=$(date +%s.%N)
fase() { echo "$1 $(echo "$(date +%s.%N) - $T0" | bc)" >> fases2.txt; }
sleep 1.5
di "Quieto, mirando la cámara."; fase quieto; sleep 4
di "Asiente lento, mentón arriba y abajo, sin dejar de mirar la cámara."; fase cal_v; sleep 12
di "Ahora gira lento a los lados, mirando la cámara."; fase cal_h; sleep 12
di "Quieto. Estira un brazo con el pulgar hacia arriba, justo debajo de la cámara, sin taparte la cara. Mira la uña del pulgar."; fase pulgar; sleep 3
di "Asiente lento moviendo la cabeza y el brazo juntos, como un solo bloque. Los ojos siempre en la uña."; fase vors_v; sleep 12
di "Ahora gira lento a los lados, cabeza y brazo juntos, mirando la uña."; fase vors_h; sleep 12
di "Ahora cabeceos cortos y más rápidos, cabeza y brazo juntos, mirando la uña."; fase vors_v_rapido; sleep 12
di "Baja el brazo y mira la cámara."; fase quieto2; sleep 2
di "Asiente lento otra vez, mirando la cámara."; fase cal_v2; sleep 10
fase fin; sleep 1; kill -INT $FF
di "Listo, terminamos. Gracias."
wait $FF || true
echo "grabado: $(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 grab2.mkv) cuadros"
cat fases2.txt
