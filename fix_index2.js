const fs = require('fs');
let content = fs.readFileSync('frontend/index.html', 'utf8');

content = content.replace(
    /const clickAction = hasStaff \? \(s\.is_budget \? `cargarPresupuestoDesdeHistorial\([\s\S]*?` : `renderScheduledEventDetail\(\$\{s\.id\}\)`\) : '';/g,
    "const clickAction = hasStaff ? (s.is_budget ? `cargarPresupuestoDesdeHistorial(${JSON.stringify(s.budget_id || '').replace(/\"/g, '&quot;')}, ${s.budget_timestamp}); document.getElementById('current-view').style.display='none'; document.getElementById('presupuestos-view').style.display='block'; window.scrollTo(0,0);` : `renderScheduledEventDetail(${s.id})`) : '';"
);

fs.writeFileSync('frontend/index.html', content);
console.log('Fixed index.html clickAction');
