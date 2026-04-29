const fs = require('fs');
const file = '/Users/nelsoncarrillokosak/valet-eye/frontend/index.html';
let content = fs.readFileSync(file, 'utf8');

// Replace "SEGMENTOS ACTIVOS" with "EVENTOS ACTIVOS"
content = content.replace('SEGMENTOS ACTIVOS', 'EVENTOS ACTIVOS');

// Remove the "Monitoreo en tiempo real de operaciones" span completely. 
// Note: In the HTML it is written as "Monitoreo en tiempo real de operaciones" but styled uppercase
const subtextRegex = /<span style="font-size:0\.6rem; color:var\(--muted\); font-weight:800; text-transform:uppercase; letter-spacing:1px;">Monitoreo en tiempo real de operaciones<\/span>\s*/i;
content = content.replace(subtextRegex, '');

// There is also a "NO HAY SEGMENTOS ACTIVOS" empty state message. Let's change that to EVENTOS
content = content.replace('NO HAY SEGMENTOS ACTIVOS', 'NO HAY EVENTOS ACTIVOS');

fs.writeFileSync(file, content, 'utf8');
console.log('Text updated successfully');
