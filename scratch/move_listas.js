const fs = require('fs');
const file = '/Users/nelsoncarrillokosak/valet-eye/frontend/index.html';
let content = fs.readFileSync(file, 'utf8');

const listasBlockRegex = /\s*<div class="menu-item" onclick="enterModule\('listas'\)"[^>]*>\s*<i[^>]*>📋<\/i>\s*<div class="menu-item-content">\s*<span[^>]*>LISTAS<\/span>\s*<span[^>]*>GESTIÓN EVENTOS<\/span>\s*<\/div>\s*<\/div>/;

const match = content.match(listasBlockRegex);

if (match) {
    const listasHtml = match[0];
    
    // Remove from current position
    content = content.replace(listasHtml, '');
    
    // Find FORMATOS
    const formatosStr = `<div class="menu-item" onclick="enterModule('formatos')"`;
    const formatosIndex = content.indexOf(formatosStr);
    
    if (formatosIndex !== -1) {
        // Insert just before FORMATOS
        content = content.substring(0, formatosIndex) + listasHtml + '\n                        ' + content.substring(formatosIndex);
        fs.writeFileSync(file, content, 'utf8');
        console.log('Moved successfully');
    } else {
        console.error('FORMATOS not found');
    }
} else {
    console.error('LISTAS block not found');
}
