const fs = require('fs');
const file = '/Users/nelsoncarrillokosak/valet-eye/frontend/index.html';
let content = fs.readFileSync(file, 'utf8');

// 1. Enlarge days: Change padding from 10px 0 to 25px 0 and add a min-height
content = content.replace('padding:10px 0; font-size:0.8rem;', 'padding:25px 0; font-size:1rem; min-height:80px;');

// 2. Increase gap in the calendar grid
content = content.replace('gap:6px; text-align:center;', 'gap:12px; text-align:center;');

// 3. Adjust bubble position for larger days
content = content.replace('top:-5px; right:-5px;', 'top:5px; right:5px;');

fs.writeFileSync(file, content, 'utf8');
console.log('Days enlarged and tooltips refined');
