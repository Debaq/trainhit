#!/usr/bin/env bash
# Prueba 3: supresión del VOR con un láser sujeto a la cabeza (ver
# ../verticales-y-supresion.md). El punto del láser en la pared se mueve con la
# cabeza: mirarlo es una ganancia 0 exacta, lenta o en impulsos. Mirar la
# cámara es una ganancia 1.
set -euo pipefail
# Los archivos quedan en la carpeta desde donde se corre.
di() { espeak-ng -v es-419 -s 150 "$1" 2>/dev/null; }
rm -f grab3.mkv fases3.txt
di "Tercera prueba. Láser apagado. Luz de frente, sin anteojos. Empezamos mirando la lente de la cámara."
ffmpeg -loglevel error -f v4l2 -input_format mjpeg -video_size 1280x720 -framerate 30 -i /dev/video0 -c:v copy -t 400 grab3.mkv &
FF=$!
T0=$(date +%s.%N)
fase() { echo "$1 $(echo "$(date +%s.%N) - $T0" | bc)" >> fases3.txt; }
sleep 1.5
di "Quieto, mirando la cámara."; fase quieto; sleep 4
di "Asiente lento, mirando la cámara."; fase cal_v; sleep 12
di "Gira lento a los lados, mirando la cámara."; fase cal_h; sleep 12
di "Impulsos rápidos y cortos a los lados, mirando la cámara."; fase imp_h_1; sleep 18
di "Cabeceos rápidos y cortos, mirando la cámara."; fase imp_v_1; sleep 18
di "Quieto. Enciende el láser y mira el punto en la pared."; fase laser; sleep 4
di "Asiente lento mirando el punto del láser."; fase vors_v; sleep 12
di "Gira lento a los lados mirando el punto del láser."; fase vors_h; sleep 12
di "Impulsos rápidos y cortos a los lados, mirando el punto del láser."; fase imp_h_0; sleep 18
di "Cabeceos rápidos y cortos, mirando el punto del láser."; fase imp_v_0; sleep 18
di "Apaga el láser y mira la cámara."; fase quieto2; sleep 3
di "Gira lento a los lados, mirando la cámara."; fase cal_h2; sleep 12
fase fin; sleep 1; kill -INT $FF
di "Listo, terminamos. Gracias."
wait $FF || true
echo "grabado: $(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 grab3.mkv) cuadros"
cat fases3.txt
