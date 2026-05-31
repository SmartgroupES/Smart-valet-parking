const fs = require('fs');
let html = fs.readFileSync('frontend/index.html', 'utf8');

const oldCheck = `if (!pin || pin.trim().toUpperCase() !== user.pin_hash) {`;
const newCheck = `if (!pin || pin.trim().toLowerCase() !== (user.pin_hash || '').toLowerCase()) {`;

if (html.includes(oldCheck)) {
    html = html.replace(oldCheck, newCheck);
    fs.writeFileSync('frontend/index.html', html);
    console.log('index.html patched');
} else {
    console.log('oldCheck not found in index.html');
}
