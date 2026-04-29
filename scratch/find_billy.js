const XLSX = require('xlsx');
const filePath = '/Users/nelsoncarrillokosak/valet-eye/documentos/MATRIZ_carga.xlsx';

try {
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);
    
    const billy = data.find(r => r['Primer_Nombre'] && r['Primer_Nombre'].toUpperCase().includes('BILLY'));
    console.log('Billy in Excel:', billy ? 'YES' : 'NO');
    if (billy) console.log(billy);
} catch (e) {
    console.error(e);
}
