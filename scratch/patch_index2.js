const fs = require('fs');
let html = fs.readFileSync('frontend/index.html', 'utf8');
html = html.replace(/return \\`/g, 'return `');
fs.writeFileSync('frontend/index.html', html);
