const fs = require('fs');
let content = fs.readFileSync('frontend/index.html', 'utf8');

// The active events row
content = content.replace(
    /onclick="selectSession\(\$\{s\.id\}, '\$\{\(s\.type \|\| 'valet'\)[\s\S]*?'\)"/g,
    'onclick="selectSession(${s.id}, ${JSON.stringify(s.type || \'valet\').replace(/\"/g, \'&quot;\')})"'
);

// The planning events action
content = content.replace(
    /cargarPresupuestoDesdeHistorial\('\$\{\(s\.budget_id \|\| ''\)[\s\S]*?'\)/g,
    'cargarPresupuestoDesdeHistorial(${JSON.stringify(s.budget_id || \'\').replace(/\"/g, \'&quot;\')})'
);

fs.writeFileSync('frontend/index.html', content);
console.log('Fixed index.html');
