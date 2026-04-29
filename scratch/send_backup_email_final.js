const fs = require('fs');

async function sendBackup() {
    const file = '/Users/nelsoncarrillokosak/valet-eye/frontend/index.html';
    const content = fs.readFileSync(file, 'utf8');
    const apiKey = 're_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF'; // From Env metadata
    
    const payload = {
        from: 'EYE STAFF BACKUP <onboarding@resend.dev>',
        to: ['ncarrillok@gmail.com'],
        subject: '📦 BACKUP EYE STAFF - Módulo Listas Integrado',
        html: `
            <div style="font-family: sans-serif; color: #333;">
                <h2>Respaldo de Seguridad EYE STAFF</h2>
                <p>Se adjunta la versión actual de <b>index.html</b> con las siguientes mejoras:</p>
                <ul>
                    <li>Integración de Listas con Sesiones de Valet Parking.</li>
                    <li>Activación automática de eventos creados desde Listas.</li>
                    <li>Refresco de estado al navegar entre módulos.</li>
                    <li>Eliminación de botones redundantes en el menú de operación.</li>
                </ul>
                <p><b>Versión:</b> 2.2.71 - Cambio Versión_022</p>
            </div>
        `,
        attachments: [
            {
                filename: 'index_backup_20260428.html',
                content: Buffer.from(content).toString('base64')
            }
        ]
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
        const data = await res.json();
        console.log('Email sent successfully:', data);
    } catch (e) {
        console.error('Error sending email:', e);
    }
}

sendBackup();
