const API_KEY = "re_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF";
const TO = "ncarrillok@gmail.com";

const html = `
    <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 30px; border-radius: 20px; border-top: 10px solid #6366f1;">
      <h1 style="color: #6366f1; margin-bottom: 5px;">ACTUALIZACIÓN Y RESPALDO - v2.2.30</h1>
      <p style="color: #666; font-weight: bold;">SEGURIDAD, SUPERVISIÓN E IMAGEN</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
      
      <p>Hola, se ha realizado un respaldo completo de la base de datos y se ha desplegado la versión <b>v2.2.30</b> con mejoras críticas en la operativa:</p>
      
      <ul style="line-height: 1.8;">
        <li><b>🛡️ Restricción de Seguridad:</b> Bloqueo automático de ingresos si no hay personal activo (con entrada marcada) en el evento.</li>
        <li><b>⭐ Roles de Supervisión:</b> Identificación visual de supervisores en el seguimiento operativo con una estrella dorada.</li>
        <li><b>🚀 Gestión de Eventos:</b> Nueva interfaz profesional (modal) para el inicio de jornadas con asignación obligatoria de responsable.</li>
        <li><b>📸 Imagen y RRSS:</b> Lanzamiento del nuevo módulo para el análisis de imagen corporativa y gestión de redes sociales.</li>
      </ul>

      <div style="background: #f8fafc; padding: 20px; border-radius: 12px; margin-top: 30px; border: 1px solid #e2e8f0;">
        <p style="margin: 0; font-size: 0.8rem; color: #64748b;">
            <b>BACKUP GENERADO:</b> backups/backup_20260426_1553.sql<br>
            <b>SUPERVISOR ASIGNADO (TOPOTEPUY):</b> Antony Salazar
        </p>
      </div>

      <div style="text-align: center; margin-top: 30px; font-size: 0.8rem; color: #999;">EYE STAFF 2026 — Smart Group Operations</div>
    </div>
`;

async function send() {
    console.log("Enviando resumen v2.2.30...");
    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${API_KEY}`, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
                from: 'EYE STAFF <onboarding@resend.dev>',
                to: [TO],
                subject: '🚀 EYE STAFF v2.2.30: Supervisión, Seguridad y Respaldo',
                html: html
            })
        });
        const data = await res.json();
        console.log("Respuesta de Resend:", data);
    } catch (e) {
        console.error("Error al enviar email:", e);
    }
}

send();
