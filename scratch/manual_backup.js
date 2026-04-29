const { execSync } = require('child_process');
const fs = require('fs');

const tables = ['users', 'sessions', 'vehicles', 'assets', 'locations', 'staff_attendance'];
const backup = {};

tables.forEach(table => {
    try {
        console.log(`Backing up ${table}...`);
        const output = execSync(`npx wrangler d1 execute valet-db --remote --command="SELECT * FROM ${table}" --json`, { encoding: 'utf-8' });
        backup[table] = JSON.parse(output)[0].results;
    } catch (e) {
        console.error(`Failed to backup ${table}: ${e.message}`);
    }
});

fs.writeFileSync('./backups/data_backup_2026_04_25.json', JSON.stringify(backup, null, 2));
console.log('Backup completed: ./backups/data_backup_2026_04_25.json');
