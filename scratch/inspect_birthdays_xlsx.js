const XLSX = require('xlsx');

const filePath = '/Users/nelsoncarrillokosak/Downloads/cumpleaños.xlsx';
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet);

console.log('Total filas:', data.length);
console.log('Primeras 3 filas:');
console.log(data.slice(0, 3));
