const { execSync } = require('child_process');
const fs = require('fs');

const sqlFile = 'scratch/sync_staff_final.sql';

async function runRemote() {
    try {
        const content = fs.readFileSync(sqlFile, 'utf8');
        const commands = content.split(';').map(c => c.trim()).filter(c => c.length > 0);
        
        console.log(`Ejecutando ${commands.length} comandos en lotes de 10...`);
        
        for (let i = 0; i < commands.length; i += 10) {
            const batch = commands.slice(i, i + 10).join(';') + ';';
            console.log(`Lote ${Math.floor(i/10) + 1}...`);
            const tempBatchFile = `scratch/batch_${i}.sql`;
            fs.writeFileSync(tempBatchFile, batch);
            try {
                execSync(`npx wrangler d1 execute valet-db --remote -y --file=${tempBatchFile}`, { stdio: 'inherit' });
            } catch (e) {
                console.error(`Error en lote ${i}:`, e.message);
                // Intentar uno por uno si el lote falla
                console.log('Intentando comandos del lote uno por uno...');
                for (const cmd of commands.slice(i, i + 10)) {
                    try {
                        execSync(`npx wrangler d1 execute valet-db --remote -y --command="${cmd.replace(/"/g, '\\"')};"`, { stdio: 'inherit' });
                    } catch (e2) {
                        console.error('Error en comando:', cmd, e2.message);
                    }
                }
            }
            fs.unlinkSync(tempBatchFile);
        }
        
        console.log('Sincronización remota finalizada.');
    } catch (e) {
        console.error('Error general:', e);
    }
}

runRemote();
