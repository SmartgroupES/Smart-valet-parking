const fs = require('fs');
const html = fs.readFileSync('frontend/index.html', 'utf8');
const scriptMatches = html.match(/<script>([\s\S]*?)<\/script>/g);
if (scriptMatches) {
  scriptMatches.forEach((match, i) => {
    fs.writeFileSync(`test_script_${i}.js`, match.replace(/<\/?script>/g, ''));
  });
}
