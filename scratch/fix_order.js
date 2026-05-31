const fs = require('fs');
let html = fs.readFileSync('frontend/index.html', 'utf8');

const startGrid = html.indexOf('<div class="listas-grid"');
const col2Start = html.indexOf('<!-- COLUMNA 2: ASIGNACIÓN DE PERSONAL (BÚSQUEDA) -->', startGrid);
const col1Start = html.indexOf('<!-- COLUMNA 1: PANEL DE ENTRADA -->', startGrid);
const col3Start = html.indexOf('<!-- COLUMNA 3: CALENDARIO SEMANAL (ABAJO A ANCHO COMPLETO) -->', startGrid);
const endGrid = html.indexOf('</div>', col3Start);

console.log({ col1Start, col2Start, col3Start });

// If currently col2 is before col1 (which I swapped previously):
if (col2Start < col1Start) {
    const col2Code = html.substring(col2Start, col1Start);
    const col1Code = html.substring(col1Start, col3Start);
    
    const before = html.substring(0, col2Start);
    const after = html.substring(col3Start);
    
    // We want col1 (Datos) then col2 (Asignacion)
    const newHtml = before + col1Code + col2Code + after;
    fs.writeFileSync('frontend/index.html', newHtml);
    console.log("Reverted swap. Now: COL1, COL2, COL3");
} else {
    console.log("Already in COL1, COL2, COL3 order.");
}
