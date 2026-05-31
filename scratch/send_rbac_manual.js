const RESEND_API_KEY = "re_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF";

async function sendManual() {
    const html = `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 800px; margin: 0 auto; border: 1px solid #eee; padding: 40px; border-radius: 20px;">
            <div style="background: #ef4444; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
                <h1 style="margin: 0;">VALET EYE: MANUAL DE SEGURIDAD</h1>
                <p style="margin: 5px 0 0 0; opacity: 0.8;">Versión 2.2.89 — RBAC & Auditoría</p>
            </div>

            <div style="padding: 20px; line-height: 1.6;">
                <p>Hola Nelson y Nicolás,</p>
                <p>He completado la implementación del sistema de control de acceso. A continuación, les detallo el procedimiento para operar la plataforma bajo este nuevo esquema de seguridad:</p>

                <h3 style="color: #ef4444;">1. Acceso al Portal</h3>
                <p>Al abrir la URL, el sistema les solicitará:</p>
                <ul>
                    <li><b>Nombre Completo:</b> (Ej: NELSON CARRILLO o NICOLAS BETANCOURT)</li>
                    <li><b>Cédula:</b> Actúa como contraseña de acceso.</li>
                </ul>

                <h3 style="color: #ef4444;">2. Panel de Auditoría (Exclusivo Superadmins)</h3>
                <p>Para supervisar quién entra y qué hace el personal:</p>
                <ol>
                    <li>Ingresen al módulo <b>Administración</b>.</li>
                    <li>Pulsen el botón <b>🛡️ AUDITORÍA</b> (visible solo para ustedes).</li>
                    <li>Allí verán el registro histórico de ingresos, IPs y dispositivos.</li>
                </ol>

                <h3 style="color: #ef4444;">3. Sesiones y Salida</h3>
                <p>El sistema recordará su sesión automáticamente. Si desean forzar el cierre de sesión en un dispositivo, usen el icono de la <b>puerta (🚪)</b> en la cabecera.</p>

                <p style="background: #f8fafc; padding: 15px; border-radius: 10px; font-size: 0.9em;">
                    <b>Nota:</b> Por ahora, el sistema es permisivo una vez superado el login. No hay restricciones de módulos internas todavía, pero toda actividad está siendo grabada en el log de auditoría.
                </p>

                <p style="margin-top: 30px; text-align: center; color: #777; font-size: 0.8em;">
                    Este es un documento técnico generado por Antigravity para Smartgroup Valet Parking.
                </p>
            </div>
        </div>
    `;

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                from: 'EYE STAFF <onboarding@resend.dev>',
                to: ['ncarrillok@gmail.com'],
                subject: '🛡️ VALET EYE: Manual Detallado de Seguridad (RBAC)',
                html: html
            })
        });
        const data = await response.json();
        console.log('Email sent:', data);
    } catch (e) { console.error('Error:', e); }
}

sendManual();
