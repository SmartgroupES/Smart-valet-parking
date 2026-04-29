
const resendApiKey = "re_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF";
const to = "ncarrillok@gmail.com";

async function sendInstructions() {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'EYE STAFF <onboarding@resend.dev>',
      to: [to],
      subject: '🛰️ GUÍA DE USO: SISTEMA DE LOCALIZACIÓN V2.2.36',
      html: `
        <div style="font-family:sans-serif; max-width:600px; margin:auto; border:1px solid #eee; border-radius:15px; overflow:hidden; border-top:5px solid #6366f1;">
          <div style="padding:30px; text-align:center; background:#f8fafc;">
            <h1 style="color:#6366f1; margin:0;">EYE STAFF</h1>
            <p style="color:#64748b; font-weight:700;">INSTRUCCIONES DE LOCALIZACIÓN</p>
          </div>
          <div style="padding:30px;">
            <h2 style="color:#1e293b; font-size:1.1rem;">1. ACTIVACIÓN DEL RASTREO (MÓVIL)</h2>
            <p>Para compartir tu ubicación, pulsa el botón <b>ACTIVAR</b> en el panel azul "RASTREO EN TIEMPO REAL" de la pantalla principal.</p>
            
            <h2 style="color:#1e293b; font-size:1.1rem;">2. PANEL DE MONITOREO (DESKTOP/TAB)</h2>
            <p>Accede al módulo <b>🛰️ MONITOREO</b> para ver el mapa en vivo. Podrás ver los iconos de todo el staff activo y las zonas de geofencing.</p>

            <h2 style="color:#1e293b; font-size:1.1rem;">3. GEOCERCAS Y ALERTAS</h2>
            <p>El sistema genera alertas automáticas de entrada y salida. Puedes crear nuevas zonas pulsando en <b>GESTIONAR GEOCERCAS</b>.</p>

            <div style="background:#fefce8; border:1px solid #fef08a; padding:15px; border-radius:12px; margin-top:20px;">
              <p style="margin:0; font-size:0.85rem; color:#854d0e;"><b>NOTA:</b> El rastreo usa GPS de alta precisión. Asegúrate de otorgar permisos de ubicación en tu navegador cuando se te solicite.</p>
            </div>

            <p style="text-align:center; margin-top:30px; font-size:0.8rem; color:#94a3b8;">
              Backup realizado con éxito: <b>backup_20260426_111421_rastreo.sql</b>
            </p>
          </div>
        </div>
      `
    })
  });
  const data = await response.json();
  console.log('Email sent:', data);
}

sendInstructions();
