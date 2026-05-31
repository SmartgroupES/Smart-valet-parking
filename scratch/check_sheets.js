const XLSX = require('xlsx');
const workbook = XLSX.readFile('/Users/nelsoncarrillokosak/valet-eye/documentos/Roles y acceso portal EYE STAFF.xlsx');
console.log(workbook.SheetNames);
