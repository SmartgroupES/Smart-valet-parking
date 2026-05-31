const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function convertExcelDateToISO(serial) {
    if (!serial) return null;
    // Excel base date is December 30, 1899 due to 1900 leap year bug
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + (serial * 24 * 60 * 60 * 1000));
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

const filePath = '/Users/nelsoncarrillokosak/Downloads/cumpleaños.xlsx';
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet);

console.log(`Leídos ${data.length} registros del archivo Excel.`);

let sqlStatements = [];
let count = 0;

for (const row of data) {
    let rawCedula = row['Cédula'];
    let rawBirth = row['Fecha de Nacimiento'];

    if (!rawCedula || !rawBirth) continue;

    // Normalizar la cédula (quitar puntos, comas, espacios y guiones)
    let cedula = String(rawCedula).replace(/[\.,\-\s]/g, '').trim();
    if (!cedula) continue;

    // Convertir la fecha de nacimiento
    let birthDate = null;
    if (typeof rawBirth === 'number') {
        birthDate = convertExcelDateToISO(rawBirth);
    } else {
        // Por si acaso viene en formato texto/ISO
        birthDate = String(rawBirth).trim();
    }

    if (!birthDate) continue;

    // Crear sentencia de actualización segura
    sqlStatements.push(`UPDATE users SET birth_date = '${birthDate}' WHERE REPLACE(REPLACE(cedula, '.', ''), ' ', '') = '${cedula}';`);
    count++;
}

const sqlContent = sqlStatements.join('\n');
const outPath = path.join(__dirname, 'bulk_updates.sql');
fs.writeFileSync(outPath, sqlContent, 'utf-8');

console.log(`Se crearon ${count} sentencias SQL de actualización en ${outPath}`);
