const fs = require('fs');
const file = '/Users/nelsoncarrillokosak/valet-eye/frontend/index.html';
let content = fs.readFileSync(file, 'utf8');

// Identify the block to remove in renderValetMenu
const blockToRemove = /<div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 15px;">[\s\S]*?<\/div>/;

// Replace it with empty string
content = content.replace(blockToRemove, '');

fs.writeFileSync(file, content, 'utf8');
console.log('Buttons removed from Valet Menu');
