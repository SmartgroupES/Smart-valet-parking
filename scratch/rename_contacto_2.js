const fs = require('fs');
let html = fs.readFileSync('frontend/index.html', 'utf8');

html = html.replace(
    '<div style="font-weight:700; color:#fff; font-size:0.85rem; text-align:center;">${s.client || \'N/A\'}</div>',
    '<div style="font-weight:700; color:#fff; font-size:0.85rem; text-align:center;">${s.contact_name || s.client || \'N/A\'}</div>'
);

fs.writeFileSync('frontend/index.html', html);
console.log("Done");
