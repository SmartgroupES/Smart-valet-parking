const API_KEY = "re_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF";
const TO = "eyestaff.ncarrillo@gmail.com";

const manualHtml = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: 'Outfit', 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1e293b; background: #f8fafc; margin: 0; padding: 0; }
        .container { max-width: 800px; margin: 40px auto; background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
        .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; padding: 60px 40px; text-align: center; }
        .header h1 { margin: 0; font-size: 32px; letter-spacing: -1px; font-weight: 800; }
        .content { padding: 40px; }
        .module-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 20px; }
        .module-card h3 { margin: 0 0 10px 0; font-size: 18px; color: #0f172a; }
        .footer { background: #f1f5f9; padding: 30px; text-align: center; border-top: 1px solid #e2e8f0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Manual de Uso: WhatsApp (Fase 1)</h1>
        </div>
        <div class="content">
            <p>Este es el manual rápido para el uso de la integración de WhatsApp en EYE STAFF.</p>
            
            <div class="module-card" style="border-left: 4px solid #22c55e;">
                <h3>🚗 1. Notificar al Cliente que su Vehículo está Listo</h3>
                <ol>
                    <li>Ve a la pantalla principal (Portal).</li>
                    <li>Entra en el menú de operaciones del Valet Parking.</li>
                    <li>Busca el vehículo que vas a entregar y haz clic en él.</li>
                    <li>Presiona el botón: <strong>ENTREGAR VEHÍCULO Y NOTIFICAR</strong>.</li>
                    <li>Se registrará la entrega y se abrirá una nueva pestaña hacia WhatsApp.</li>
                    <li>El mensaje ya estará redactado, solo debes darle a Enviar.</li>
                </ol>
            </div>

            <div class="module-card" style="border-left: 4px solid #ef4444;">
                <h3>🚨 2. Botón de Alerta Rápida (ALERTA WA)</h3>
                <ol>
                    <li>Ve al Menú Valet Parking principal (donde ves Recepción, Custodia, Resumen).</li>
                    <li>Justo debajo verás un botón rojo: <strong>ALERTA WA</strong>.</li>
                    <li>Haz clic en él e ingresa el número de teléfono y el mensaje de alerta.</li>
                    <li>Al aceptar, se abrirá WhatsApp con el reporte urgente listo para enviar.</li>
                </ol>
            </div>
            
            <p><strong>Nota:</strong> El dispositivo que uses debe tener iniciada la sesión de WhatsApp.</p>
        </div>
        <div class="footer">
            <p>EYE STAFF 2026 — SMART GROUP OPERATIONS</p>
        </div>
    </div>
</body>
</html>
`;

async function sendManual() {
    console.log("Enviando Manual de Uso WhatsApp...");
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
                subject: '📱 Manual de Uso: WhatsApp (Fase 1)',
                html: manualHtml
            })
        });
        const data = await res.json();
        console.log("Respuesta:", data);
    } catch (e) {
        console.error("Error:", e);
    }
}
sendManual();
