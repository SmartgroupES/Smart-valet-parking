const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const tables = [
  'users',
  'vehicles',
  'sessions',
  'staff_attendance',
  'event_reports',
  'audit_logs',
  'chat_messages',
  'job_applications',
  'equivalences',
  'geofences',
  'locations'
];

const backupPath = path.join(__dirname, '../backups/backup_database_v2.4.41_tables.json');
const dbBackup = {};

console.log('🏁 INICIANDO RESPALDO DE TABLAS D1...');

for (const table of tables) {
  try {
    console.log(`⏳ Descargando tabla: ${table}...`);
    const output = execSync(
      `npx wrangler d1 execute valet-db --command "SELECT * FROM ${table}" --remote --json`,
      { maxBuffer: 10 * 1024 * 1024 }
    ).toString();
    
    // Wrangler output has some introductory text. We find the JSON array inside.
    const jsonStartIndex = output.indexOf('[');
    if (jsonStartIndex !== -1) {
      const jsonStr = output.substring(jsonStartIndex);
      const rows = JSON.parse(jsonStr);
      dbBackup[table] = rows[0]?.results || [];
      console.log(`✅ ${table}: ${dbBackup[table].length} registros descargados.`);
    } else {
      console.log(`⚠️ ${table}: No se encontraron datos.`);
      dbBackup[table] = [];
    }
  } catch (err) {
    console.error(`❌ Error al descargar tabla ${table}:`, err.message);
  }
}

fs.writeFileSync(backupPath, JSON.stringify(dbBackup, null, 2));
console.log(`\n🎉 RESPALDO COMPLETADO EXITOSAMENTE EN: ${backupPath}\n`);
