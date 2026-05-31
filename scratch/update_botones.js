const fs = require('fs');
let html = fs.readFileSync('frontend/index.html', 'utf8');

// The replacement patterns
// Pattern 1: <button class="btn btn-secondary btn-sm" onclick="exitToPortal()" ...>← VOLVER AL PORTAL</button>
const btnRegexPortal = /<button[^>]*onclick="exitToPortal\(\)"[^>]*>.*?VOLVER AL PORTAL.*?<\/button>/gs;
html = html.replace(btnRegexPortal, '${getVolverBtn(\'VOLVER AL PORTAL\', \'exitToPortal()\')}');

// Pattern 2: exitToPortal inside a div with class="back-nav"
const divRegexPortal = /<div[^>]*class="back-nav"[^>]*onclick="exitToPortal\(\)"[^>]*>.*?VOLVER AL PORTAL.*?<\/div>/gs;
html = html.replace(divRegexPortal, '${getVolverBtn(\'VOLVER AL PORTAL\', \'exitToPortal()\')}');

// Pattern 3: <div class="back-nav" onclick="showTab('home')"...>← IR AL MENÚ VALET</div>
const divRegexValet = /<div[^>]*class="back-nav"[^>]*onclick="showTab\('home'\)"[^>]*>.*?IR AL MENÚ VALET.*?<\/div>/gs;
html = html.replace(divRegexValet, '${getVolverBtn(\'MENÚ VALET\', \'showTab(\\\'home\\\')\')}');

// Pattern 4: <button class="btn btn-secondary" onclick="closeModal(); showTab('home');">VOLVER AL MENU</button>
const btnRegexMenu = /<button[^>]*onclick="closeModal\(\);\s*showTab\('home'\);"[^>]*>.*?VOLVER AL MEN[UÚ].*?<\/button>/gs;
html = html.replace(btnRegexMenu, '${getVolverBtn(\'MENÚ VALET\', \'closeModal(); showTab(\\\'home\\\');\')}');

// Pattern 5: renderAdmin menu returns
const btnRegexAdminMenu = /<button[^>]*onclick="renderAdmin\(document\.getElementById\('current-view'\), 'menu'\)"[^>]*>.*?VOLVER.*?<\/button>/gs;
html = html.replace(btnRegexAdminMenu, '${getVolverBtn(\'MENÚ ADMIN\', \'renderAdmin(document.getElementById(\\\'current-view\\\'), \\\'menu\\\')\')}');

const divRegexAdminMenu = /<div[^>]*class="back-nav"[^>]*onclick="renderAdmin\(document\.getElementById\('current-view'\), 'menu'\)"[^>]*>.*?VOLVER.*?<\/div>/gs;
html = html.replace(divRegexAdminMenu, '${getVolverBtn(\'MENÚ ADMIN\', \'renderAdmin(document.getElementById(\\\'current-view\\\'), \\\'menu\\\')\')}');

const divRegexAdminGeneral = /<div[^>]*class="back-nav"[^>]*onclick="renderAdmin\(document\.getElementById\('current-view'\)\)"[^>]*>.*?VOLVER.*?<\/div>/gs;
html = html.replace(divRegexAdminGeneral, '${getVolverBtn(\'MENÚ ADMIN\', \'renderAdmin(document.getElementById(\\\'current-view\\\'))\')}');

const divRegexAdminTab = /<div[^>]*class="back-nav"[^>]*onclick="showTab\('admin'\)"[^>]*>.*?VOLVER ATRÁS.*?<\/div>/gs;
html = html.replace(divRegexAdminTab, '${getVolverBtn(\'ADMINISTRACIÓN\', \'showTab(\\\'admin\\\')\')}');

const btnRegexHr = /<button[^>]*onclick="renderAdmin\(document\.getElementById\('current-view'\), 'hr'\)"[^>]*>.*?VOLVER A ADMINISTRACIÓN.*?<\/button>/gs;
html = html.replace(btnRegexHr, '${getVolverBtn(\'MENÚ ADMIN\', \'renderAdmin(document.getElementById(\\\'current-view\\\'), \\\'hr\\\')\')}');

fs.writeFileSync('frontend/index.html', html);
console.log('Botones de regreso estandarizados (con multiline).');
