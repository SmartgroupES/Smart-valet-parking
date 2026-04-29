const fs = require('fs');
const file = '/Users/nelsoncarrillokosak/valet-eye/frontend/index.html';
let content = fs.readFileSync(file, 'utf8');

// 1. Update enterModule to refresh active sessions
const oldEnterValet = "if (module === 'valet') {";
const newEnterValet = "if (module === 'valet') {\n            checkActiveSession().then(() => renderHome(view));";
// Remove the existing call to renderHome(view) if it's there
content = content.replace("if (module === 'valet') {\n            renderHome(view);", newEnterValet);

// 2. Update saveListaEvento to refresh active sessions after activation
const oldToast = "toast('🚀 EVENTO DE VALET ACTIVADO EN EL MENÚ', 'success');";
const newToast = "await checkActiveSession();\n                toast('🚀 EVENTO DE VALET ACTIVADO EN EL MENÚ', 'success');";
content = content.replace(oldToast, newToast);

fs.writeFileSync(file, content, 'utf8');
console.log('Refresh logic added to enterModule and saveListaEvento');
