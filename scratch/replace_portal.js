const fs = require('fs');
let html = fs.readFileSync('frontend/index.html', 'utf8');

html = html.replace(/PORTAL/g, 'HOME');
html = html.replace(/v2\.5\.38/g, 'v2.5.39');

// Exception logic if there are any specific internal IDs that should remain portal (e.g. function exitToPortal)
// Since we only want to change UI labels, maybe a more targeted replace is better.
// But the user said: "en todas las etiquetas y textos cambiar la palabra PORTAL por HOME"
// The ID "portal-view" and function "renderPortal" use "Portal" or "portal", not "PORTAL" in uppercase.
// The uppercase "PORTAL" only appears in UI texts according to our search.

fs.writeFileSync('frontend/index.html', html);
console.log('Replaced PORTAL with HOME and updated version to 2.5.39');
