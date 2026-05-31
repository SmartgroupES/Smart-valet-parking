const apiKey = 're_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF';

async function sendNotification() {
    const date = new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' });
    const gDrivePath = "/Users/nelsoncarrillokosak/Library/CloudStorage/GoogleDrive-ncarrillok@gmail.com/Mi unidad/Backups_Antigravity";
    
    const payload = {
        from: 'ANTIGRAVITY BACKUP <onboarding@resend.dev>',
        to: ['ncarrillok@gmail.com'],
        subject: `✅ BACKUP COMPLETADO - ${new Date().toLocaleDateString()}`,
        html: `
            <div style="font-family: sans-serif; background-color: #f9f9f9; padding: 20px;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; padding: 30px; border-radius: 12px; border: 1px solid #eee;">
                    <h2 style="color: #10b981; margin-top: 0;">🚀 Respaldo Full Exitoso</h2>
                    <p>El respaldo automático COMPLETO (IA + Código Fuente de todos los proyectos) se ha completado correctamente al encender el equipo.</p>
                    
                    <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <strong style="color: #374151; display: block; margin-bottom: 5px;">📍 Ubicación en Google Drive:</strong>
                        <code style="word-break: break-all; color: #4b5563;">Mi unidad > Backups_Antigravity</code>
                    </div>

                    <p style="font-size: 0.9rem; color: #6b7280;">
                        <strong>Fecha/Hora:</strong> ${date}<br>
                        <strong>Equipo:</strong> Mac Nelson
                    </p>
                    
                    <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
                    
                    <p style="font-size: 0.8rem; color: #9ca3af; text-align: center;">
                        Este es un mensaje automático generado por el sistema de backup de Antigravity.
                    </p>
                </div>
            </div>
        `
    };

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        if (res.ok) console.log('Notificación enviada');
        else console.error('Error al enviar:', await res.text());
    } catch (e) {
        console.error('Error:', e);
    }
}

sendNotification();
