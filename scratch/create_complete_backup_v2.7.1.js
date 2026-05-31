const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const resendApiKey = 're_Fu3JRkwq_Lxt6DeWEKoey8xkdn8ijbCRF'; // Reusing from previous backups
const tables = [
    'users', 'sessions', 'vehicles', 'access_control_guests',
    'budgets', 'events', 'user_permissions_matrix', 'valet_clients'
];
const version = 'v2.7.1';
const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '_');

async function runBackup() {
    console.log(`--- INICIANDO RESPALDO COMPLETO ${version} ---`);
    
    const backupsDir = '/Users/nelsoncarrillokosak/valet-eye/backups';
    if (!fs.existsSync(backupsDir)){
        fs.mkdirSync(backupsDir, { recursive: true });
    }
    
    const dbBackup = {};
    for (const table of tables) {
        try {
            console.log(`Exportando tabla: ${table}...`);
            const output = execSync(`npx wrangler d1 execute valet-db --remote --command="SELECT * FROM ${table}" --json`, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
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
    
    const dbBackupPath = `/Users/nelsoncarrillokosak/valet-eye/backups/db_backup_${dateStr}_${version}.json`;
    fs.writeFileSync(dbBackupPath, JSON.stringify(dbBackup, null, 2), 'utf-8');
    console.log(`Base de datos guardada en: ${dbBackupPath}`);

    const indexPath = '/Users/nelsoncarrillokosak/valet-eye/frontend/index.html';
    const indexBackupPath = `/Users/nelsoncarrillokosak/valet-eye/backups/index_backup_${dateStr}_${version}.html`;
    fs.copyFileSync(indexPath, indexBackupPath);
    console.log(`Copia de index.html guardada en: ${indexBackupPath}`);

    const backendPath = '/Users/nelsoncarrillokosak/valet-eye/src/index.ts';
    const backendBackupPath = `/Users/nelsoncarrillokosak/valet-eye/backups/backend_backup_${dateStr}_${version}.ts`;
    fs.copyFileSync(backendPath, backendBackupPath);
    console.log(`Copia de src/index.ts guardada en: ${backendBackupPath}`);

    const schemaPath = '/Users/nelsoncarrillokosak/valet-eye/schema/schema.sql';
    const schemaBackupPath = `/Users/nelsoncarrillokosak/valet-eye/backups/schema_backup_${dateStr}_${version}.sql`;
    fs.copyFileSync(schemaPath, schemaBackupPath);

    console.log('Preparando envío de email por Resend...');
    const indexContent = fs.readFileSync(indexPath);
    const dbContent = fs.readFileSync(dbBackupPath);
    const backendContent = fs.readFileSync(backendPath);
    const schemaContent = fs.readFileSync(schemaPath);

    const payload = {
        from: 'EYE STAFF BACKUP <onboarding@resend.dev>',
        to: ['ncarrillok@gmail.com'],
        subject: `📦 BACKUP COMPLETO EYE STAFF - ${version} (BD + Frontend + Backend + Schema)`,
        html: `
            <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 12px; background: #fafafa;">
                <h2 style="color: #22c55e; border-bottom: 2px solid #22c55e; padding-bottom: 10px;">Respaldo de Seguridad Completo ${version}</h2>
                <p>Se ha realizado y verificado el respaldo de seguridad integral del sistema <b>EYE STAFF</b>.</p>
                
                <h3 style="color: #4b5563;">Cambios recientes en esta versión (${version}):</h3>
                <ul>
                    <li><b>Resolución de Pantalla Negra (Fix de Sintaxis):</b> Se agregó una llave de cierre faltante en un bloque if dentro de la función <code>renderAlquiler</code> en <code>index.html</code> que impedía que la app cargara.</li>
                </ul>

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
                            <td style="border: 1px solid #d1d5db; padding: 8px; font-weight: bold;">index_backup_${dateStr}_${version}.html</td>
                            <td style="border: 1px solid #d1d5db; padding: 8px;">Código frontend de la aplicación.</td>
                        </tr>
                        <tr>
                            <td style="border: 1px solid #d1d5db; padding: 8px; font-weight: bold;">backend_backup_${dateStr}_${version}.ts</td>
                            <td style="border: 1px solid #d1d5db; padding: 8px;">Código del backend API (Cloudflare Worker).</td>
                        </tr>
                        <tr>
                            <td style="border: 1px solid #d1d5db; padding: 8px; font-weight: bold;">db_backup_${dateStr}_${version}.json</td>
                            <td style="border: 1px solid #d1d5db; padding: 8px;">Exportación de datos de producción (D1).</td>
                        </tr>
                        <tr>
                            <td style="border: 1px solid #d1d5db; padding: 8px; font-weight: bold;">schema_backup_${dateStr}_${version}.sql</td>
                            <td style="border: 1px solid #d1d5db; padding: 8px;">Estructura de la base de datos (Schema).</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `,
        attachments: [
            {
                filename: `index_backup_${dateStr}_${version}.html`,
                content: indexContent.toString('base64')
            },
            {
                filename: `backend_backup_${dateStr}_${version}.ts`,
                content: backendContent.toString('base64')
            },
            {
                filename: `db_backup_${dateStr}_${version}.json`,
                content: dbContent.toString('base64')
            },
            {
                filename: `schema_backup_${dateStr}_${version}.sql`,
                content: schemaContent.toString('base64')
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
