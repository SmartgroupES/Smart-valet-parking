const XLSX = require('xlsx');

const filePath = '/Users/nelsoncarrillokosak/Downloads/cumpleaños.xlsx';
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(sheet);

let withCedula = 0;
let withBirth = 0;
let withBoth = 0;
let blankRows = 0;

data.forEach((row, i) => {
    const hasCedula = row['Cédula'] !== undefined;
    const hasBirth = row['Fecha de Nacimiento'] !== undefined;
    
    if (hasCedula) withCedula++;
    if (hasBirth) withBirth++;
    if (hasCedula && hasBirth) withBoth++;
    if (!hasCedula && !hasBirth) blankRows++;
});

console.log('Total rows in JSON:', data.length);
console.log('Rows with Cédula:', withCedula);
console.log('Rows with Birth:', withBirth);
console.log('Rows with both:', withBoth);
console.log('Blank rows:', blankRows);
