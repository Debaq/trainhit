#!/usr/bin/env bash
# Grabación para la prueba de factibilidad del ojo vertical.
set -euo pipefail
# Los archivos quedan en la carpeta desde donde se corre.
di() { espeak-ng -v es-419 -s 150 "$1" 2>/dev/null; }
DUR=300
rm -f grab.mkv fases.txt
di "Prepárate: luz de frente, sin anteojos, la cámara a la altura de los ojos. Mira la lente de la cámara y no la sueltes en toda la prueba. Empezamos."
ffmpeg -loglevel error -f v4l2 -input_format mjpeg -video_size 1280x720 -framerate 30 -i /dev/video0 -c:v copy -t $DUR grab.mkv &
FF=$!
T0=$(date +%s.%N)
fase() { echo "$1 $(echo "$(date +%s.%N) - $T0" | bc)" >> fases.txt; }
sleep 1.5
di "Quieto, mirando la cámara."; fase quieto; sleep 6
di "Gira la cabeza lento hacia los lados, unos veinte grados, sin dejar de mirar la cámara."; fase yaw_lento; sleep 16
di "Quieto."; fase quieto2; sleep 2
di "Ahora asiente lento, mentón arriba y abajo, unos quince grados, mirando la cámara."; fase pitch_lento; sleep 16
di "Quieto."; fase quieto3; sleep 2
di "Ahora cabeceos cortos y rápidos: mentón abajo y volver, mentón arriba y volver. Siempre mirando la cámara."; fase pitch_rapido; sleep 22
di "Quieto."; fase quieto4; sleep 2
di "Ahora giros cortos y rápidos a los lados, mirando la cámara."; fase yaw_rapido; sleep 18
di "Quieto. Ahora gira la cabeza unos cuarenta grados hacia tu derecha, pero con los ojos sigue mirando la cámara."; sleep 2
di "Así girado, mueve la cabeza lento hacia adelante y hacia atrás, en dirección a la cámara."; fase larp_lento; sleep 14
di "Igual, pero ahora cabeceos cortos y rápidos, adelante y atrás, siempre mirando la cámara."; fase larp_rapido; sleep 18
di "Vuelve al frente. Quieto."; fase quieto5; sleep 2
di "Ahora gira la cabeza unos cuarenta grados hacia tu izquierda, con los ojos en la cámara."; sleep 2
di "Así girado, mueve la cabeza lento hacia adelante y hacia atrás, en dirección a la cámara."; fase ralp_lento; sleep 14
di "Igual, pero ahora cabeceos cortos y rápidos, adelante y atrás, siempre mirando la cámara."; fase ralp_rapido; sleep 18
di "Vuelve al frente. Quieto."; fase quieto6; sleep 2
di "Ahora, con la cabeza quieta, mira despacio hacia arriba y hacia abajo, tres veces."; fase ojos_vertical; sleep 12
fase fin; sleep 1; kill -INT $FF
di "Listo, terminamos. Gracias."
wait $FF || true
echo "grabado: $(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 grab.mkv) cuadros"
cat fases.txt
