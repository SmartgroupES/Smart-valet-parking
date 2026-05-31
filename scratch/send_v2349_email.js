const API_KEY = "re_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF";
const TO = "ncarrillok@gmail.com";

const html = `
    <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 30px; border-radius: 20px; border-top: 10px solid #6366f1;">
      <h1 style="color: #6366f1; margin-bottom: 5px;">RESPALDO EXITOSO - v2.3.49</h1>
      <p style="color: #666; font-weight: bold;">BACKUP GENERADO (Cambio Versión_023)</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
      
      <p>Hola, se ha realizado un respaldo preventivo de los archivos principales:</p>
      <ul>
        <li><strong>frontend/index.html</strong> -> backup_v2349_index.html</li>
        <li><strong>src/index.ts</strong> -> backup_v2349_index.ts</li>
        <li><strong>package.json</strong> -> backup_v2349_package.json</li>
      </ul>
      
      <p><strong>Versión actual:</strong> v2.3.49</p>
      <p><strong>Cambio Versión:</strong> 023</p>

      <div style="background: #eef2ff; padding: 20px; border-radius: 12px; margin-top: 30px; text-align: center; border: 1px solid #c7d2fe;">
        <p style="margin: 0; font-size: 0.9rem; color: #3730a3;">El sistema está respaldado correctamente. Listo para nuevas implementaciones.</p>
      </div>

      <div style="text-align: center; margin-top: 30px; font-size: 0.8rem; color: #999;">EYE STAFF 2026 — Smart Group Operations</div>
    </div>
`;

async function send() {
    console.log("Enviando resumen de backup de versión 2.3.49...");
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
                subject: '✅ EYE STAFF: Respaldo de Seguridad v2.3.49',
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
