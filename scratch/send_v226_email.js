const API_KEY = "re_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF";
const TO = "ncarrillok@gmail.com";

const html = `
    <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 30px; border-radius: 20px; border-top: 10px solid #ef4444;">
      <h1 style="color: #ef4444; margin-bottom: 5px;">EYE STAFF v2.2.6</h1>
      <p style="color: #666; font-weight: bold;">CONTROL OPERATIVO Y DASHBOARD DE EVENTOS</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
      
      <p>Hola, se ha completado la actualización a la versión <b>v2.2.6</b>. Aquí los cambios clave de este despliegue:</p>
      
      <ul style="line-height: 1.8;">
        <li><b>🚀 Dashboard Operativo:</b> Se ha activado la pestaña de EVENTOS en Operaciones, permitiendo ver en tiempo real el estado del evento activo.</li>
        <li><b>📊 Estadísticas en Vivo:</b> Visualización directa de vehículos Recibidos, en Custodia, Pedidos y Entregados para una mejor toma de decisiones.</li>
        <li><b>👥 Personal en Turno:</b> El dashboard ahora muestra al Supervisor y Operadores asignados específicamente al evento actual.</li>
        <li><b>📸 Fotografía Profesional:</b> Se han renombrado las etiquetas de evidencia (FRENTE/TRASERA -> FOTO 1/2/3/4) para mayor claridad operativa.</li>
        <li><b>⚠️ Validación de Ingreso:</b> Se ha marcado el campo de PLACA como obligatorio con indicadores visuales (*) para asegurar la integridad de los datos.</li>
      </ul>

      <div style="background: #f8fafc; padding: 20px; border-radius: 12px; margin-top: 30px; text-align: center;">
        <p style="margin: 0; font-size: 0.9rem;">El sistema ya está operativo con la versión <b>2.2.6</b>.</p>
      </div>

      <div style="text-align: center; margin-top: 30px; font-size: 0.8rem; color: #999;">EYE STAFF 2026 — Grupo Eye Operations</div>
    </div>
`;

async function send() {
    console.log("Enviando email de actualización v2.2.6...");
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
                subject: '🚀 EYE STAFF: Actualización v2.2.6 - Dashboard Operativo de Eventos',
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
