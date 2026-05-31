const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('frontend/index.html', 'utf8');

// Find all script tags
const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match;
let count = 0;

while ((match = scriptRegex.exec(html)) !== null) {
    const code = match[1];
    if (code.trim() === '') continue;
    count++;
    try {
        new vm.Script(code);
        console.log(`Script ${count}: OK`);
    } catch (e) {
        console.error(`Script ${count}: ERROR!`);
        console.error(e.stack);
        console.error("Code snippet:\n", code.substring(0, 500));
        process.exit(1);
    }
}
console.log("All script blocks are syntactically valid!");
