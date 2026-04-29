const fs = require('fs');
const file = '/Users/nelsoncarrillokosak/valet-eye/frontend/index.html';
let content = fs.readFileSync(file, 'utf8');

const backBtnHtml = `<div style="margin-bottom:15px; display:flex; justify-content:flex-start;">
                <button class="btn btn-secondary btn-sm" onclick="exitToPortal()" style="border-radius:10px; padding:8px 15px; font-weight:800; background:rgba(255,255,255,0.05); border:1px solid var(--border);">← VOLVER AL PORTAL</button>
            </div>\n            `;

content = content.replace('<div class="header" style="margin-bottom: 20px;">', backBtnHtml + '<div class="header" style="margin-bottom: 20px;">');

fs.writeFileSync(file, content, 'utf8');
console.log('Back button added to Listas');
