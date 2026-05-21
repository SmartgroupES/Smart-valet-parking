const fs = require('fs');

async function sendBackupSummary() {
    const apiKey = 're_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF';
    
    const payload = {
        from: 'EYE STAFF BACKUP <onboarding@resend.dev>',
        to: ['ncarrillok@gmail.com'],
        subject: '📦 BACKUP FINAL & RESUMEN DE CAMBIOS - v2.3.70',
        html: `
            <div style="font-family: sans-serif; color: #333; max-width: 700px; margin: 0 auto; border: 1px solid #ddd; border-radius: 12px; overflow: hidden;">
                <div style="background: #0f172a; color: #fff; padding: 30px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px; letter-spacing: 2px;">EYE STAFF SYSTEM</h1>
                    <p style="margin: 5px 0 0 0; opacity: 0.7;">Resumen de Actualización y Backup</p>
                </div>
                
                <div style="padding: 30px;">
                    <h2 style="color: #6366f1; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px;">Versión Actualizada: v2.3.70</h2>
                    
                    <h3 style="margin-top: 25px;">🛠️ Mejoras y Correcciones:</h3>
                    <ul style="line-height: 1.6;">
                        <li><b>Recuperación del Sistema:</b> Se restauró la estabilidad tras el colapso de la v2.3.62 (causado por una etiqueta de script mal cerrada).</li>
                        <li><b>Módulo de Personal:</b> Se integró el campo <b>EMAIL</b> en el formulario de registro y en la matriz administrativa (editable).</li>
                        <li><b>Estabilidad del Servidor:</b> Se corrigió un crash (Error 500) que ocurría al intentar guardar personal mientras la seguridad está en modo bypass.</li>
                        <li><b>Consistencia UI:</b> Actualización de etiquetas de versión en cabeceras y footers.</li>
                    </ul>

                    <h3 style="margin-top: 25px;">💾 Respaldos Generados:</h3>
                    <ul style="line-height: 1.6;">
                        <li><b>Database:</b> Export de D1 completado (<code>backups/database_backup_20260429_final.sql</code>).</li>
                        <li><b>Frontend:</b> Copia local <code>frontend/backup_v2370_index.html</code>.</li>
                        <li><b>Backend:</b> Copia local <code>backup_v2370_index.ts</code>.</li>
                    </ul>

                    <div style="background: #fffbeb; border: 1px solid #fef3c7; padding: 15px; border-radius: 8px; margin-top: 30px;">
                        <p style="margin: 0; color: #92400e; font-size: 0.9rem;">
                            <b>Nota:</b> El sistema ya se encuentra desplegado y operativo en el entorno de producción.
                        </p>
                    </div>
                </div>

                <div style="background: #f8fafc; padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #f1f5f9;">
                    EYE STAFF — Gestión Operativa 2026
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
        const data = await res.json();
        console.log('Summary email sent:', data);
    } catch (e) {
        console.error('Error sending summary email:', e);
    }
}

sendBackupSummary();
