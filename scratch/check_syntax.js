const fs = require('fs');
const html = fs.readFileSync('frontend/index.html', 'utf8');
const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gm;
let match;
let count = 0;
while ((match = scriptRegex.exec(html)) !== null) {
  count++;
  try {
    // We try to parse the JS
    new Function(match[1]);
  } catch(e) {
    console.error(`Syntax error in script block ${count}:`, e.message);
    const lines = match[1].split('\n');
    const errLine = e.lineNumber || e.line; // might not work directly but let's print around
    // Try to parse using acorn or something if available? node doesn't give line number easily with new Function
    // Let's use syntax check
    fs.writeFileSync(`scratch/script_${count}.js`, match[1]);
  }
}
console.log('Checked ' + count + ' scripts.');
