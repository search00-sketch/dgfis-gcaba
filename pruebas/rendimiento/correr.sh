#!/usr/bin/env bash
# Prepara librerías (npm) + la versión de referencia y corre una prueba.
#   ./correr.sh simulado            datos sintéticos (no toca Firestore)
#   ./correr.sh buscador            Firestore real, Buscador de permisos (público)
#   ./correr.sh personal            Firestore real con login (DGF_TEST_USER/DGF_TEST_PASS)
# REF = versión "antes" a comparar (por defecto origin/main).
set -euo pipefail
cd "$(dirname "$0")"
RAIZ="$(git rev-parse --show-toplevel)"; REF="${REF:-origin/main}"
if [ ! -d .libs/firebase ]; then
  mkdir -p .libs && (cd .libs && for p in leaflet@1.9.4 leaflet.heat@0.2.0 chart.js@4.4.0 xlsx@0.18.5 leaflet.markercluster@1.5.3 jszip@3.10.1 firebase@10.12.0; do
    t=$(npm pack "$p" --silent); n=${t%.tgz}; [ "${n#firebase}" != "$n" ] && n=firebase; mkdir -p "$n" && tar xzf "$t" -C "$n" && rm "$t"; done)
fi
VIEJO=.version-ref; rm -rf "$VIEJO"; mkdir -p "$VIEJO"; git -C "$RAIZ" archive "$REF" | tar -x -C "$VIEJO"
cp -n "$RAIZ/config.js" "$VIEJO/" 2>/dev/null || true
case "${1:-simulado}" in
  simulado) node simulado.js "$VIEJO" "$RAIZ" ;;
  buscador) node real.js "$VIEJO" "$RAIZ" ;;
  personal) node real-personal.js "$VIEJO" "$RAIZ" ;;
  *) echo "uso: $0 simulado|buscador|personal"; exit 1 ;;
esac
