const fs = require('fs');
const { execSync } = require('child_process');

const data = JSON.parse(fs.readFileSync('backups/db_backup_2026_05_31_v2.7.3.json', 'utf-8'));
const users = data.users;

if (users && users.length > 0) {
    // Get all keys dynamically from the first user
    const keys = Object.keys(users[0]);
    let sql = `INSERT INTO users (${keys.join(', ')}) VALUES `;
    
    const values = users.map(u => {
        const rowValues = keys.map(k => {
            if (u[k] === null || u[k] === undefined) return 'NULL';
            if (typeof u[k] === 'number') return u[k];
            return `'${String(u[k]).replace(/'/g, "''")}'`;
        });
        return `(${rowValues.join(', ')})`;
    }).join(',\n');
    
    fs.writeFileSync('scratch/seed_users.sql', sql + values + ';');
    console.log('SQL generated. Executing...');
    try {
        execSync('npx wrangler d1 execute d1-staging --remote --file=scratch/seed_users.sql', { stdio: 'inherit' });
        console.log('Seed successful');
    } catch (e) {
        console.error('Seed failed', e.message);
    }
} else {
    console.log('No users found in backup');
}
