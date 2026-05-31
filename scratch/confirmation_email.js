const fs = require('fs');

async function sendConfirmation() {
    const apiKey = 're_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF';
    
    const payload = {
        from: 'EYE STAFF SYSTEM <onboarding@resend.dev>',
        to: ['ncarrillok@gmail.com'],
        subject: '✅ SISTEMA RESTAURADO - EYE STAFF',
        html: `
            <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                <h2 style="color: #22c55e;">Confirmación de Restauración</h2>
                <p>El sistema ha sido restaurado exitosamente tras el colapso reportado.</p>
                
                <h3 style="border-bottom: 2px solid #eee; padding-bottom: 5px;">Detalles de la Acción:</h3>
                <ul>
                    <li><b>Acción:</b> Restauración de archivo <code>index.html</code>.</li>
                    <li><b>Origen:</b> Backup estable <code>v2.3.52</code>.</li>
                    <li><b>Estado:</b> Despliegue completado en Cloudflare Workers.</li>
                </ul>

                <h3 style="border-bottom: 2px solid #eee; padding-bottom: 5px;">Diagnóstico Técnico:</h3>
                <p>Se identificó una etiqueta <code>&lt;/script&gt;</code> mal escapada en la versión v2.3.62 que cortaba la ejecución del código principal, causando el "bloqueo" y la fuga de código fuente en pantalla.</p>
                
                <p style="background: #f8fafc; padding: 15px; border-radius: 8px; font-size: 0.9rem;">
                    <b>Nota:</b> El sistema ahora debería cargar la pantalla de login/portal correctamente. Se recomienda limpiar la caché del navegador si persisten problemas visuales.
                </p>

                <p style="color: #64748b; font-size: 0.8rem; margin-top: 30px; text-align: center;">
                    EYE STAFF — Módulo de Seguridad y Recuperación 2026
                </p>
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
        const data = await res.json();
        console.log('Confirmation email sent:', data);
    } catch (e) {
        console.error('Error sending confirmation email:', e);
    }
}

sendConfirmation();
