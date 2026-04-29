const fs = require('fs');
const pdf = require('pdf-parse');
const path = require('path');

// El primer argumento es el nombre del archivo PDF
const fileName = process.argv[2];

if (!fileName) {
    console.error('❌ Por favor, indica el nombre del archivo PDF. Ejemplo: node extract_pdf.js manual.pdf');
    process.exit(1);
}

const pdfPath = path.join(__dirname, '..', fileName);
const outputPath = path.join(__dirname, '..', fileName.replace('.pdf', '_extraido.txt'));

if (!fs.existsSync(pdfPath)) {
    console.error(`❌ El archivo no existe en: ${pdfPath}`);
    process.exit(1);
}

let dataBuffer = fs.readFileSync(pdfPath);

pdf(dataBuffer).then(function(data) {
    // Escribir el texto extraído a un archivo
    fs.writeFileSync(outputPath, data.text);
    console.log(`✅ ÉXITO: Texto extraído y guardado en: ${outputPath}`);
    console.log('\n--- VISTA PREVIA DEL CONTENIDO ---');
    console.log(data.text.substring(0, 500) + '...');
}).catch(err => {
    console.error('❌ Error procesando el PDF:', err);
});
