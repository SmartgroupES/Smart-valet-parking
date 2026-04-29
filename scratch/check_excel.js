const XLSX = require('xlsx');
const path = require('path');

const filePath = '/Users/nelsoncarrillokosak/valet-eye/documentos/MATRIZ_carga.xlsx';

try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);
    
    console.log('Headers:', Object.keys(data[0]));
    console.log('Sample Row:', data[0]);
    console.log('Total Rows:', data.length);
} catch (e) {
    console.error('Error reading Excel:', e);
}
