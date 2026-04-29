const API_KEY = "re_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF";
const TO = "ncarrillok@gmail.com";

const html = `
    <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 30px; border-radius: 20px; border-top: 10px solid #22c55e;">
      <h1 style="color: #22c55e; margin-bottom: 5px;">RESPALDO EXITOSO - v2.2.71</h1>
      <p style="color: #666; font-weight: bold;">BACKUP GENERADO (Cambio Versión_022)</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
      
      <p>Hola, se ha realizado un respaldo completo del archivo index.html (backup_20260428_1.html) en preparación para los ajustes visuales del efecto hover en el menú.</p>
      
      <p><strong>Versión actual:</strong> v2.2.71</p>
      <p><strong>Cambio Versión:</strong> 022</p>

      <div style="background: #f0fdf4; padding: 20px; border-radius: 12px; margin-top: 30px; text-align: center; border: 1px solid #bbf7d0;">
        <p style="margin: 0; font-size: 0.9rem; color: #166534;">El sistema está respaldado correctamente para proceder con los cambios solicitados.</p>
      </div>

      <div style="text-align: center; margin-top: 30px; font-size: 0.8rem; color: #999;">EYE STAFF 2026 — Smart Group Operations</div>
    </div>
`;

async function send() {
    console.log("Enviando resumen de backup de versión 2.2.71...");
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
                subject: '✅ EYE STAFF: Respaldo de Seguridad v2.2.71',
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
