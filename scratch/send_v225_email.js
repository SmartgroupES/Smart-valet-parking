const API_KEY = "re_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF";
const TO = "ncarrillok@gmail.com";

const html = `
    <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 30px; border-radius: 20px; border-top: 10px solid #ef4444;">
      <h1 style="color: #ef4444; margin-bottom: 5px;">EYE STAFF v2.2.5</h1>
      <p style="color: #666; font-weight: bold;">ACTUALIZACIÓN DE SEGURIDAD Y PERMISOS</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
      
      <p>Hola, se ha completado la migración al sistema de <b>Permisos Dinámicos (RBAC)</b>. Aquí los cambios clave:</p>
      
      <ul style="line-height: 1.8;">
        <li><b>🔐 Gestión de Permisos (RBAC):</b> Ahora RR.HH. puede decidir qué módulos ve cada perfil (Operador, Supervisor, Director) desde el panel de Administración.</li>
        <li><b>📱 Dashboard Inteligente:</b> La pantalla principal ahora solo muestra los módulos autorizados, eliminando el ruido visual.</li>
        <li><b>🛡️ Seguridad 2FA Reforzada:</b> Se han eliminado los tokens antiguos del ticket inicial. Ahora el PIN dinámico es la única llave para la entrega.</li>
        <li><b>📄 Tickets Limpios:</b> El PDF y el ticket web ahora son más profesionales, sin códigos de seguridad visibles hasta la conformidad.</li>
        <li><b>💾 Backup v2.2.4:</b> Se ha generado un respaldo completo de la base de datos antes de la actualización.</li>
      </ul>

      <div style="background: #f8fafc; padding: 20px; border-radius: 12px; margin-top: 30px; text-align: center;">
        <p style="margin: 0; font-size: 0.9rem;">El sistema ya está operativo con la versión <b>2.2.5</b>.</p>
      </div>

      <div style="text-align: center; margin-top: 30px; font-size: 0.8rem; color: #999;">EYE STAFF 2026 — Grupo Eye Operations</div>
    </div>
`;

async function send() {
    console.log("Enviando email de actualización v2.2.5...");
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 
            'Authorization': `Bearer ${API_KEY}`, 
            'Content-Type': 'application/json' 
        },
        body: JSON.stringify({
            from: 'EYE STAFF <onboarding@resend.dev>',
            to: [TO],
            subject: '🚀 EYE STAFF: Actualización v2.2.5 - Permisos Dinámicos (RBAC)',
            html: html
        })
    });
    const data = await res.json();
    console.log("Respuesta de Resend:", data);
}

send();
