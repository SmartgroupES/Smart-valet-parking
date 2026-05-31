const XLSX = require('xlsx');

const filePath = '/Users/nelsoncarrillokosak/Downloads/cumpleaños.xlsx';
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet);

for (let i = 0; i < 20; i++) {
    const row = data[i];
    if (!row) break;
    console.log(`Fila ${i + 1}: Keys:`, Object.keys(row));
    console.log(`   Cédula:`, row['Cédula'], ` | Tipo:`, typeof row['Cédula']);
    console.log(`   Fecha Nacimiento:`, row['Fecha de Nacimiento'], ` | Tipo:`, typeof row['Fecha de Nacimiento']);
}
