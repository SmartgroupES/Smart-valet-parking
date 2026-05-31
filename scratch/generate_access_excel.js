const XLSX = require('xlsx');
const { execSync } = require('child_process');
const fs = require('fs');

async function generate() {
    try {
        console.log('Consultando base de datos...');
        const dbRes = JSON.parse(execSync('npx wrangler d1 execute valet-db --remote --command="SELECT name, role, pin_hash FROM users ORDER BY role, name;" --json').toString());
        const allUsers = dbRes[0].results || [];

        const roleLabels = {
            'director': 'Directores (Acceso Total)',
            'supervisor': 'Supervisores',
            'driver': 'Drivers (Valet)',
            'valet': 'Drivers (Valet)',
            'logistics': 'Logística'
        };

        const excelDataOutput = allUsers.map(u => ({
            'Nombre': u.name,
            'Rol': roleLabels[u.role] || u.role,
            'PIN / Acceso': u.pin_hash
        }));

        const newWorkbook = XLSX.utils.book_new();
        const newWorksheet = XLSX.utils.json_to_sheet(excelDataOutput);
        XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, 'Roles y Accesos');
        XLSX.writeFile(newWorkbook, '/Users/nelsoncarrillokosak/valet-eye/documentos/Roles y acceso portal EYE STAFF.xlsx');
        console.log('Archivo Excel creado en documentos/Roles y acceso portal EYE STAFF.xlsx');
    } catch (e) {
        console.error('Error:', e);
    }
}

generate();
