const fs = require('fs');
let html = fs.readFileSync('frontend/index.html', 'utf8');

// The error is because `\`` and `\${` are literally in the code.
// We only want to replace it inside `renderGuardiaPresentation`, `renderGuardia`, and `renderGuardiaDashboard`.
const startIndex = html.indexOf('function renderGuardiaPresentation(el) {');
const endIndex = html.indexOf('function renderRentaEquipos(el) {');

if (startIndex !== -1 && endIndex !== -1) {
  let block = html.substring(startIndex, endIndex);
  
  // unescape backticks
  block = block.replace(/\\\`/g, '`');
  
  // unescape variables
  block = block.replace(/\\\$/g, '$');
  
  html = html.substring(0, startIndex) + block + html.substring(endIndex);
  fs.writeFileSync('frontend/index.html', html);
  console.log('Fixed syntax in guardia block');
} else {
  console.log('Block not found');
}
