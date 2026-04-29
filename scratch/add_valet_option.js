const fs = require('fs');
const file = '/Users/nelsoncarrillokosak/valet-eye/frontend/index.html';
let content = fs.readFileSync(file, 'utf8');

// Add "Valet Parking" option
const oldOptions = '<option value="Boda">Boda</option>';
const newOptions = '<option value="Valet Parking">Valet Parking</option>\n                            <option value="Boda">Boda</option>';

content = content.replace(oldOptions, newOptions);

fs.writeFileSync(file, content, 'utf8');
console.log('Valet Parking added to dropdown');
