const fs = require('fs');

let html = fs.readFileSync('frontend/index.html', 'utf8');

// The HTML to swap is inside `renderListas`
// We will locate the two vehicle-card blocks and swap them.

const startGrid = html.indexOf('<div class="listas-grid"');
if (startGrid === -1) throw new Error("Could not find listas-grid");

// Find COLUMNA 1 and COLUMNA 2
const col1Start = html.indexOf('<!-- COLUMNA 1: PANEL DE ENTRADA -->', startGrid);
const col2Start = html.indexOf('<!-- COLUMNA 2: ASIGNACIÓN DE PERSONAL (BÚSQUEDA) -->', col1Start);
const col3Start = html.indexOf('<!-- COLUMNA 3: CALENDARIO SEMANAL (ABAJO A ANCHO COMPLETO) -->', col2Start);

if (col1Start === -1 || col2Start === -1 || col3Start === -1) {
    throw new Error("Could not find columns");
}

const col1Code = html.substring(col1Start, col2Start);
const col2Code = html.substring(col2Start, col3Start);

// Swap them
const before = html.substring(0, col1Start);
const after = html.substring(col3Start);

const newHtml = before + col2Code + col1Code + after;

fs.writeFileSync('frontend/index.html', newHtml);
console.log("Swapped successfully");
