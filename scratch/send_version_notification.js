
const resendApiKey = "re_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF";
const to = "ncarrillok@gmail.com";

async function sendNotification() {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'EYE STAFF <onboarding@resend.dev>',
      to: [to],
      subject: '🚀 ACTUALIZACIÓN DE SISTEMA: v2.2.28',
      html: `
        <div style="font-family:sans-serif; max-width:500px; margin:auto; border:1px solid #eee; border-radius:15px; overflow:hidden; border-top:5px solid #6366f1;">
          <div style="padding:30px; text-align:center;">
            <h1 style="color:#6366f1; margin:0;">EYE STAFF</h1>
            <p style="color:#64748b; font-weight:700;">NOTIFICACIÓN DE VERSIÓN</p>
            <div style="background:#f8fafc; padding:20px; border-radius:12px; margin:20px 0; text-align:left;">
              <p><strong>NUEVA VERSIÓN:</strong> v2.2.28</p>
              <p><strong>ESTADO:</strong> Backup realizado con éxito.</p>
              <p><strong>CAMBIOS PRINCIPALES:</strong></p>
              <ul style="color:#334155; font-size:0.9rem;">
                <li>Reordenamiento de módulos: Eventos, Monitoreo y Administración.</li>
                <li>Corrección de navegación en botones "Volver" (retorno al menú Valet).</li>
                <li>Optimización del temporizador de inactividad (10s) en todas las vistas operativas.</li>
                <li>Infraestructura de rastreo GPS en tiempo real activada.</li>
              </ul>
            </div>
            <p>El sistema se encuentra estable y respaldado. ¡Disfruta el descanso!</p>
          </div>
        </div>
      `
    })
  });
  const data = await response.json();
  console.log('Email sent:', data);
}

sendNotification();
