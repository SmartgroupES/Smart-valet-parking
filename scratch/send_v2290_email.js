const RESEND_API_KEY = "re_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF";

async function sendEmail() {
    console.log("Enviando notificación de actualización v2.2.90...");
    
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: 'EYE STAFF <onboarding@resend.dev>',
            to: ['ncarrillok@gmail.com'],
            subject: '🚀 ACTUALIZACIÓN SISTEMA: Activación Manual v2.2.90',
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; border-radius: 20px; overflow: hidden; border-top: 6px solid #f59e0b;">
                    <div style="padding: 40px; background: #fafafa;">
                        <h2 style="color: #f59e0b; margin: 0; font-size: 24px;">ACTUALIZACIÓN COMPLETADA</h2>
                        <p style="color: #666; font-size: 14px;">VERSIÓN v2.2.90 • 29 DE ABRIL 2026</p>
                        
                        <hr style="border: 0; border-top: 1px solid #eee; margin: 25px 0;">
                        
                        <h3 style="color: #333;">🔒 NUEVO CONTROL DE ACTIVACIÓN MANUAL</h3>
                        <p style="color: #555;">Se ha eliminado el inicio automático de sesiones para garantizar un control operativo total.</p>
                        <ul style="color: #555;">
                            <li><b>Eventos Planificados:</b> Aparecen en gris en el selector del menú principal.</li>
                            <li><b>Botón de Operación:</b> Solo se habilitan los módulos (Recepción, Custodia) tras presionar "INICIAR OPERACIÓN AHORA".</li>
                            <li><b>Seguridad Operativa:</b> Previene el inicio accidental de eventos antes de que el personal esté en sitio.</li>
                        </ul>

                        <h3 style="color: #333;">💾 SEGURIDAD</h3>
                        <p style="color: #555;">Se ha realizado un <b>BACKUP TOTAL (v2.2.90)</b> de código y base de datos.</p>
                        
                        <div style="margin-top: 40px; padding: 20px; background: #f0f0f0; border-radius: 12px; text-align: center;">
                            <p style="margin: 0; font-weight: bold; color: #f59e0b;">SISTEMA OPERATIVO Y ACTUALIZADO</p>
                        </div>
                    </div>
                </div>
            `
        })
    });

    const result = await response.json();
    console.log("Resultado Resend:", result);
}

sendEmail();
