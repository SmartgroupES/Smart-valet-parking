const fs = require('fs');
const file = '/Users/nelsoncarrillokosak/valet-eye/frontend/index.html';
let content = fs.readFileSync(file, 'utf8');

// Change the grid-template-columns to 1fr 2fr
content = content.replace('grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))', 'grid-template-columns: 1fr 2fr');

fs.writeFileSync(file, content, 'utf8');
console.log('Layout updated to 1/3 and 2/3');
