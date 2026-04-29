const API_KEY = "re_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF";
const TO = "ncarrillok@gmail.com";

const html = `
    <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 30px; border-radius: 20px; border-top: 10px solid #22c55e;">
      <h1 style="color: #22c55e; margin-bottom: 5px;">RESPALDO EXITOSO - v2.2.10</h1>
      <p style="color: #666; font-weight: bold;">BACKUP Y RESUMEN DE ACTUALIZACIONES</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
      
      <p>Hola, se ha realizado un respaldo completo de la base de datos y se ha desplegado la versión <b>v2.2.10</b> con los siguientes ajustes:</p>
      
      <ul style="line-height: 1.8;">
        <li><b>📥 Estabilidad en Recepción:</b> Se ha eliminado el temporizador de retorno en la pantalla de ingreso para permitir inspecciones sin interrupciones.</li>
        <li><b>🕒 Formato de Tiempo Mejorado:</b> El contador ahora se muestra como <code>[ 15 SEG ]</code> para una lectura clara y profesional.</li>
        <li><b>🏠 Iconografía:</b> Sustitución de texto por iconos en la navegación superior.</li>
        <li><b>🧠 Inteligencia Predictiva:</b> Auto-completado de placas, clientes y marcas totalmente operativo.</li>
      </ul>

      <div style="background: #f0fdf4; padding: 20px; border-radius: 12px; margin-top: 30px; text-align: center; border: 1px solid #bbf7d0;">
        <p style="margin: 0; font-size: 0.9rem; color: #166534;">El sistema está actualizado y respaldado correctamente.</p>
      </div>

      <div style="text-align: center; margin-top: 30px; font-size: 0.8rem; color: #999;">EYE STAFF 2026 — Smart Group Operations</div>
    </div>
`;

async function send() {
    console.log("Enviando resumen de backup y actualizaciones...");
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
                subject: '✅ EYE STAFF: Respaldo de Seguridad y Resumen de Mejoras',
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
