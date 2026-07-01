#!/usr/bin/env bash
set -euo pipefail

MONITOR_ROOT="${MONITOR_ROOT:-/opt/monitoreorevivir}"
OME_DIR="$MONITOR_ROOT/ome"

mkdir -p "$OME_DIR"
mkdir -p "$OME_DIR/conf" "$OME_DIR/logs"

echo "Stack base preparado en: $OME_DIR"
echo "Siguiente paso: copiar los archivos de Detalles/ome, ajustar el nombre de la BD a monitoreorevivir-db si corresponde, y luego ejecutar docker compose up -d en $OME_DIR"
