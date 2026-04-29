const fs = require('fs');
const { execSync } = require('child_process');

const sqlFile = 'scratch/sync_staff_v2.sql';
const sql = fs.readFileSync(sqlFile, 'utf8');
const commands = sql.split(';\n').filter(c => c.trim().length > 0);

console.log(`Executing ${commands.length} commands in batches...`);

const batchSize = 10;
for (let i = 0; i < commands.length; i += batchSize) {
    const batch = commands.slice(i, i + batchSize).join(';') + ';';
    console.log(`Batch ${i / batchSize + 1}...`);
    try {
        execSync(`npx wrangler d1 execute valet-db --remote --command="${batch.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });
    } catch (e) {
        console.error('Error in batch:', e.message);
    }
}
