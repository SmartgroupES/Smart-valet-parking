const XLSX = require('xlsx');
const workbook = XLSX.readFile('/Users/nelsoncarrillokosak/valet-eye/documentos/Checklist Rastreo Empleados.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);
console.log(JSON.stringify(data, null, 2));
