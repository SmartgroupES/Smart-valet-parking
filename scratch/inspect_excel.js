const XLSX = require('xlsx');
const filePath = '/Users/nelsoncarrillokosak/valet-eye/documentos/MATRIZ_carga.xlsx';

try {
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);
    if (data.length > 0) {
        console.log('HEADERS:', Object.keys(data[0]));
        console.log('SAMPLE:', JSON.stringify(data[0], null, 2));
    } else {
        console.log('Excel is empty');
    }
} catch (e) {
    console.error('Error reading Excel:', e);
}
