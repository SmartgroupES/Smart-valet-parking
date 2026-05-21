#!/bin/bash

# Configuración de rutas
SOURCE_DIR="/Users/nelsoncarrillokosak/.gemini/antigravity"
PROJECT_DIR="/Users/nelsoncarrillokosak/valet-eye"
# Cambio a Google Drive por capacidad (Dropbox colapsado)
GDRIVE_BACKUP_DIR="/Users/nelsoncarrillokosak/Library/CloudStorage/GoogleDrive-ncarrillok@gmail.com/Mi unidad/Backups_Antigravity"
DATE=$(date +%Y-%m-%d_%H-%M-%S)

echo "--- Iniciando Backup de Seguridad (Google Drive) ---"

# Crear carpeta en Google Drive si no existe
mkdir -p "$GDRIVE_BACKUP_DIR"

# 1. Backup de la memoria de Antigravity (Oculta) y Sesión Cloudflare
echo "Copiando memoria de Antigravity y sesión Cloudflare..."
zip -r "$GDRIVE_BACKUP_DIR/antigravity_and_cloudflare_$DATE.zip" "$SOURCE_DIR" "/Users/nelsoncarrillokosak/.wrangler" -x "*.log" > /dev/null

# 2. Backup FULL de todos los proyectos (Código fuente, Configuración y Scripts)
echo "Copiando código fuente y configuración de todos los proyectos (Excluyendo node_modules)..."
# Excluimos node_modules porque se pueden regenerar con 'npm install' y pesan GBs innecesarios
zip -r "$GDRIVE_BACKUP_DIR/all_projects_full_$DATE.zip" \
    "/Users/nelsoncarrillokosak/valet-eye" \
    "/Users/nelsoncarrillokosak/valet-app" \
    "/Users/nelsoncarrillokosak/crosti-management" \
    -x "*/node_modules/*" -x "*/.git/*" -x "*.log" -x "*/.wrangler/*" > /dev/null

echo "--- Backup Multi-Proyecto Completado con éxito ---"
echo "Ubicación: $GDRIVE_BACKUP_DIR"

# 3. Limpieza de backups antiguos (Mantener últimos 15 días en GDrive ya que hay más espacio)
echo "Limpiando backups antiguos (más de 15 días)..."
find "$GDRIVE_BACKUP_DIR" -name "*.zip" -mtime +15 -delete

echo "--- Proceso Finalizado ---"

# Enviar Notificación por Email
node /Users/nelsoncarrillokosak/valet-eye/scratch/create_complete_backup_v2.4.47.js
