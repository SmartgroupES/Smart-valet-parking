const fs = require('fs');
const file = '/Users/nelsoncarrillokosak/valet-eye/frontend/index.html';
let content = fs.readFileSync(file, 'utf8');

// Change align-items:start to align-items:stretch and ensure both children have height:100%
content = content.replace('align-items:start;', 'align-items:stretch;');

// The first child (Panel de Entrada) is a .vehicle-card. 
// I'll add height:100% to its style.
content = content.replace('<div class="vehicle-card" style="padding:25px;', '<div class="vehicle-card" style="height:100%; box-sizing:border-box; padding:25px;');

// The second child (Calendar container) needs height:100% too
content = content.replace('<!-- COLUMNA 2: CALENDARIO SEMANAL -->\n                <div style="animation: slideInUp 0.4s ease-out;">', '<!-- COLUMNA 2: CALENDARIO SEMANAL -->\n                <div style="height:100%; animation: slideInUp 0.4s ease-out;">');

fs.writeFileSync(file, content, 'utf8');
console.log('Heights equalized');
