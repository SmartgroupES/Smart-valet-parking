# 📘 Manual de Restauración de Antigravity

Este manual describe el proceso paso a paso para restaurar el sistema y los archivos del proyecto utilizando los respaldos almacenados en **Google Drive**.

## 📍 Ubicación de los Respaldos
Los archivos se encuentran en:
`Google Drive > Mi unidad > Backups_Antigravity`

Se generan dos archivos `.zip` por cada ejecución:
1.  `antigravity_and_cloudflare_YYYY-MM-DD_HH-MM-SS.zip`: Contiene la "memoria" del asistente y sesiones de trabajo.
2.  `all_projects_full_YYYY-MM-DD_HH-MM-SS.zip`: Contiene el código fuente COMPLETO de Valet Eye, Valet App y Crosti Management, incluyendo archivos .env y configuraciones.

---

## 🛠 Pasos para la Restauración

### 1. Restaurar Memoria de Antigravity (IA)
Si Antigravity "olvida" el contexto o necesitas recuperar una sesión anterior:
1.  Localiza el archivo `antigravity_and_cloudflare_...zip` más reciente.
2.  Extrae el contenido.
3.  Copia la carpeta resultante a la ruta original:
    *   **Ruta destino:** `/Users/nelsoncarrillokosak/.gemini/antigravity`
4.  *Nota:* Esto restaurará el historial de conversaciones y el conocimiento que la IA ha adquirido sobre el repositorio.

### 2. Restaurar Credenciales y Configuración (Cloudflare/Env)
Si pierdes acceso a la base de datos o el despliegue falla:
1.  Localiza el archivo `all_projects_essentials_...zip`.
2.  Extrae los archivos.
3.  Mueve los archivos `.env` y `wrangler.toml` a sus carpetas correspondientes:
    *   **Valet Eye:** `/Users/nelsoncarrillokosak/valet-eye/`
    *   **Valet App:** `/Users/nelsoncarrillokosak/valet-app/`
    *   **Crosti Management:** `/Users/nelsoncarrillokosak/crosti-management/`

### 3. Recuperar la Sesión de Wrangler
Si el comando `npx wrangler` te pide iniciar sesión nuevamente:
1.  El respaldo de la carpeta `.wrangler` está incluido en el primer zip.
2.  Copia el contenido extraído de `.wrangler` a:
    *   **Ruta destino:** `/Users/nelsoncarrillokosak/.wrangler`

---

## ⚠️ Consideraciones Importantes
*   **Frecuencia:** Los respaldos se realizan diariamente al encender el ordenador.
*   **Limpieza:** El sistema mantiene los últimos **15 días** de respaldos. Si necesitas una versión más antigua, asegúrate de guardarla en una carpeta aparte antes de que se cumpla el plazo.
*   **Base de Datos D1:** Para restaurar la base de datos D1 específicamente, se recomienda usar el comando `npx wrangler d1 migrations apply` o restaurar desde el panel de Cloudflare si tienes backups habilitados allí.

---
*Manual generado por Antigravity - Abril 2026*
