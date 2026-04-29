const fs = require('fs');
const file = '/Users/nelsoncarrillokosak/valet-eye/frontend/index.html';
let content = fs.readFileSync(file, 'utf8');

// 1. Update enterModule('listas') to fetch next correlativo
const oldListasEntry = "renderListas(view);";
const newListasEntry = "apiFetch('/api/sessions/next-correlativo').then(res => {\n                window.nextCorrelativo = res.next || 1;\n                renderListas(view);\n            });";
content = content.replace(oldListasEntry, newListasEntry);

// 2. Add Correlativo field to renderListas
const correlativoField = `
                        <div style="grid-column: span 1;">
                            <label style="font-size:0.7rem; color:var(--muted); font-weight:700;">CORRELATIVO</label>
                            <input type="text" id="lista-correlativo" class="input-field" value="\${window.nextCorrelativo || ''}" readonly style="width:100%; margin-top:5px; border-radius:12px; padding:12px; box-sizing:border-box; background:rgba(255,255,255,0.03); opacity:0.8; font-weight:800; color:var(--accent);">
                        </div>
`;

// Insert it before DIRECCIÓN
content = content.replace('<div style="grid-column: span 2;">\n                            <label style="font-size:0.7rem; color:var(--muted); font-weight:700;">DIRECCIÓN</label>', 
correlativoField + '\n                        <div style="grid-column: span 2;">\n                            <label style="font-size:0.7rem; color:var(--muted); font-weight:700;">DIRECCIÓN</label>');

// 3. Update saveListaEvento to include correlativo in name
const oldNameGather = "const name = document.getElementById('lista-nombre').value;";
const newNameGather = "const baseName = document.getElementById('lista-nombre').value;\n        const correlativo = document.getElementById('lista-correlativo').value;\n        const name = `\${baseName}_\${correlativo}`;";
content = content.replace(oldNameGather, newNameGather);

fs.writeFileSync(file, content, 'utf8');
console.log('Correlativo system integrated successfully');
