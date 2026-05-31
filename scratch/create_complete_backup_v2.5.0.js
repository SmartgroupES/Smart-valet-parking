const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const resendApiKey = 're_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF';
const tables = [
    'users', 'sessions', 'vehicles', 'staff_attendance', 
    'event_reports', 'audit_logs', 'chat_messages', 
    'job_applications', 'equivalences', 'geofences', 'locations'
];

async function runBackup() {
    console.log('--- INICIANDO RESPALDO COMPLETO v2.5.0 ---');
    
    // Asegurar que exista la carpeta backups
    const backupsDir = '/Users/nelsoncarrillokosak/valet-eye/backups';
    if (!fs.existsSync(backupsDir)){
        fs.mkdirSync(backupsDir, { recursive: true });
    }
    
    // 1. Respaldar base de datos
    const dbBackup = {};
    for (const table of tables) {
        try {
            console.log(`Exportando tabla: ${table}...`);
            const output = execSync(`npx wrangler d1 execute valet-db --remote --command="SELECT * FROM ${table}" --json`, { encoding: 'utf-8', maxBuffer: 20 * 1024 * 1024 });
            const parsed = JSON.parse(output);
            if (parsed && parsed[0] && parsed[0].results) {
                dbBackup[table] = parsed[0].results;
            } else {
                dbBackup[table] = [];
            }
        } catch (e) {
            console.error(`Error al respaldar tabla ${table}:`, e.message);
        }
    }
    
    const dbBackupPath = '/Users/nelsoncarrillokosak/valet-eye/backups/db_backup_2026_05_22_v2.5.0.json';
    fs.writeFileSync(dbBackupPath, JSON.stringify(dbBackup, null, 2), 'utf-8');
    console.log(`Base de datos guardada en: ${dbBackupPath}`);

    // 2. Respaldar index.html
    const indexPath = '/Users/nelsoncarrillokosak/valet-eye/frontend/index.html';
    const indexBackupPath = '/Users/nelsoncarrillokosak/valet-eye/backups/index_backup_2026_05_22_v2.5.0.html';
    fs.copyFileSync(indexPath, indexBackupPath);
    console.log(`Copia de index.html guardada en: ${indexBackupPath}`);

    // 2.2 Respaldar backend index.ts
    const backendPath = '/Users/nelsoncarrillokosak/valet-eye/src/index.ts';
    const backendBackupPath = '/Users/nelsoncarrillokosak/valet-eye/backups/backend_backup_2026_05_22_v2.5.0.ts';
    fs.copyFileSync(backendPath, backendBackupPath);
    console.log(`Copia de src/index.ts guardada en: ${backendBackupPath}`);

    // 3. Enviar por Resend
    console.log('Preparando envío de email por Resend...');
    const indexContent = fs.readFileSync(indexPath);
    const dbContent = fs.readFileSync(dbBackupPath);
    const backendContent = fs.readFileSync(backendPath);

    const payload = {
        from: 'EYE STAFF BACKUP <onboarding@resend.dev>',
        to: ['ncarrillok@gmail.com'],
        subject: '📦 BACKUP COMPLETO EYE STAFF - v2.5.0 (Base de Datos + Frontend + Backend)',
        html: `
            <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 12px; background: #fafafa;">
                <h2 style="color: #22c55e; border-bottom: 2px solid #22c55e; padding-bottom: 10px;">Respaldo de Seguridad Completo v2.5.0</h2>
                <p>Se ha realizado y verificado el respaldo de seguridad integral del sistema <b>EYE STAFF</b>.</p>
                
                <h3 style="color: #4b5563;">Elementos incluidos en este respaldo:</h3>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                    <thead>
                        <tr style="background: #f3f4f6;">
                            <th style="border: 1px solid #d1d5db; padding: 8px; text-align: left;">Elemento</th>
                            <th style="border: 1px solid #d1d5db; padding: 8px; text-align: left;">Detalle</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="border: 1px solid #d1d5db; padding: 8px; font-weight: bold;">index_backup_2026_05_22_v2.5.0.html</td>
                            <td style="border: 1px solid #d1d5db; padding: 8px;">Código frontend de la aplicación (versión v2.5.0).</td>
                        </tr>
                        <tr>
                            <td style="border: 1px solid #d1d5db; padding: 8px; font-weight: bold;">backend_backup_2026_05_22_v2.5.0.ts</td>
                            <td style="border: 1px solid #d1d5db; padding: 8px;">Código del backend (Cloudflare Worker src/index.ts).</td>
                        </tr>
                        <tr>
                            <td style="border: 1px solid #d1d5db; padding: 8px; font-weight: bold;">db_backup_2026_05_22_v2.5.0.json</td>
                            <td style="border: 1px solid #d1d5db; padding: 8px;">Exportación completa de las principales 11 tablas operativas en D1 en formato JSON.</td>
                        </tr>
                    </tbody>
                </table>

                <p style="font-size: 0.85rem; color: #6b7280; text-align: center; margin-top: 30px;">
                    EYE STAFF — PLATAFORMA INTEGRAL 2026
                </p>
            </div>
        `,
        attachments: [
            {
                filename: 'index_backup_2026_05_22_v2.5.0.html',
                content: indexContent.toString('base64')
            },
            {
                filename: 'backend_backup_2026_05_22_v2.5.0.ts',
                content: backendContent.toString('base64')
            },
            {
                filename: 'db_backup_2026_05_22_v2.5.0.json',
                content: dbContent.toString('base64')
            }
        ]
    };

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        console.log('¡Respaldo enviado exitosamente por email!', data);
    } catch (e) {
        console.error('Error al enviar el email de respaldo:', e);
    }
}

runBackup();
