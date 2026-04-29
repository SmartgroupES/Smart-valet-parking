#!/bin/bash

# Configuración de rutas
SOURCE_DIR="/Users/nelsoncarrillokosak/.gemini/antigravity"
PROJECT_DIR="/Users/nelsoncarrillokosak/valet-eye"
DROPBOX_BACKUP_DIR="/Users/nelsoncarrillokosak/Dropbox/Backups_Antigravity"
DATE=$(date +%Y-%m-%d_%H-%M-%S)

echo "--- Iniciando Backup de Seguridad ---"

# Crear carpeta en Dropbox si no existe
mkdir -p "$DROPBOX_BACKUP_DIR"

# 1. Backup de la memoria de Antigravity (Oculta) y Sesión Cloudflare
echo "Copiando memoria de Antigravity y sesión Cloudflare..."
zip -r "$DROPBOX_BACKUP_DIR/antigravity_and_cloudflare_$DATE.zip" "$SOURCE_DIR" "/Users/nelsoncarrillokosak/.wrangler" -x "*.log" > /dev/null

# 2. Backup de archivos críticos de TODOS los proyectos
echo "Copiando archivos sensibles de todos los proyectos..."
zip -r "$DROPBOX_BACKUP_DIR/all_projects_essentials_$DATE.zip" \
    "/Users/nelsoncarrillokosak/valet-eye/scratch" \
    "/Users/nelsoncarrillokosak/valet-eye/.env" \
    "/Users/nelsoncarrillokosak/valet-app/.env" \
    "/Users/nelsoncarrillokosak/crosti-management/.env" \
    "/Users/nelsoncarrillokosak/valet-eye/wrangler.toml" \
    "/Users/nelsoncarrillokosak/valet-app/wrangler.toml" \
    "/Users/nelsoncarrillokosak/crosti-management/wrangler.toml" \
    2>/dev/null > /dev/null

echo "--- Backup Multi-Proyecto Completado con éxito ---"
echo "Ubicación: $DROPBOX_BACKUP_DIR"
