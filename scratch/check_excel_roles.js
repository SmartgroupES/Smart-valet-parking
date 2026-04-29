const XLSX = require('xlsx');
const filePath = '/Users/nelsoncarrillokosak/valet-eye/documentos/MATRIZ_carga.xlsx';

try {
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);
    
    const roles = new Set(data.map(r => r['Cargo EYE STAFF']));
    console.log('Unique Roles in Excel:', Array.from(roles));
} catch (e) {
    console.error(e);
}
