const fs = require('fs');

let html = fs.readFileSync('frontend/index.html', 'utf8');

// 1. Datos del evento
html = html.replace(
    '<h3 style="margin-bottom:20px; color:var(--accent);">Datos del Evento</h3>\n                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; text-align:left;">',
    `<div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; margin-bottom:20px;" onclick="const content = document.getElementById('datos-evento-content'); content.style.display = content.style.display === 'none' ? 'block' : 'none'; const icon = document.getElementById('datos-evento-icon'); icon.innerText = content.style.display === 'none' ? '▶' : '▼';">
                            <h3 style="margin:0; color:var(--accent);">Datos del Evento</h3>
                            <span id="datos-evento-icon" style="color:var(--accent); font-size:0.8rem;">▼</span>
                        </div>
                        <div id="datos-evento-content" style="display:block;">
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; text-align:left;">`
);

// Close Datos del Evento content div after the map
html = html.replace(
    '</div>\n\n                    <!-- COLUMNA 2: ASIGNACIÓN DE PERSONAL (BÚSQUEDA) -->',
    '</div>\n                        </div>\n\n                    <!-- COLUMNA 2: ASIGNACIÓN DE PERSONAL (BÚSQUEDA) -->'
);


// 2. Asignación de personal
html = html.replace(
    '<h3 style="margin-bottom:20px; color:var(--warning);">Asignación de Personal</h3>\n                        \n                        <!-- SECCIÓN SUPERVISORES -->',
    `<div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; margin-bottom:20px;" onclick="const content = document.getElementById('asignacion-personal-content'); content.style.display = content.style.display === 'none' ? 'block' : 'none'; const icon = document.getElementById('asignacion-personal-icon'); icon.innerText = content.style.display === 'none' ? '▶' : '▼';">
                            <h3 style="margin:0; color:var(--warning);">Asignación de Personal</h3>
                            <span id="asignacion-personal-icon" style="color:var(--warning); font-size:0.8rem;">▼</span>
                        </div>
                        <div id="asignacion-personal-content" style="display:block;">
                        
                        <!-- SECCIÓN SUPERVISORES -->`
);

// Close Asignación content div after the GUARDAR EVENTO button
html = html.replace(
    '</button>\n                    </div>\n                    \n                    <!-- COLUMNA 3: CALENDARIO SEMANAL (ABAJO A ANCHO COMPLETO) -->',
    '</button>\n                        </div>\n                    </div>\n                    \n                    <!-- COLUMNA 3: CALENDARIO SEMANAL (ABAJO A ANCHO COMPLETO) -->'
);

// 3. Calendario Semanal
// The calendar header is inside generateWeeklyCalendarHTML()
// Let's modify generateWeeklyCalendarHTML header in index.html

html = html.replace(
    '<h3 style="margin:0; color:var(--accent); font-size:1.1rem; font-weight:900;">CALENDARIO SEMANAL</h3>',
    `<div style="display:flex; align-items:center; gap:10px; cursor:pointer;" onclick="const content = document.getElementById('calendario-content'); content.style.display = content.style.display === 'none' ? 'flex' : 'none'; const icon = document.getElementById('calendario-icon'); icon.innerText = content.style.display === 'none' ? '▶' : '▼';">
                    <h3 style="margin:0; color:var(--accent); font-size:1.1rem; font-weight:900;">CALENDARIO SEMANAL</h3>
                    <span id="calendario-icon" style="color:var(--accent); font-size:0.8rem;">▼</span>
                </div>`
);

html = html.replace(
    '<div style="font-size:0.8rem; color:var(--accent); font-weight:900; background:rgba(99, 102, 241, 0.1); padding:8px 15px; border-radius:10px; text-align:center; margin-bottom:20px;">',
    `<div id="calendario-content" style="display:flex; flex-direction:column; width:100%;">
            <div style="font-size:0.8rem; color:var(--accent); font-weight:900; background:rgba(99, 102, 241, 0.1); padding:8px 15px; border-radius:10px; text-align:center; margin-bottom:20px;">`
);

// Close Calendario content div just before the end of the wrapper
html = html.replace(
    '<div style="display:flex; align-items:center; gap:5px;"><div style="width:10px; height:10px; background:rgba(255, 255, 255, 0.05); border-left:2px solid rgba(255,255,255,0.1); border-radius:2px;"></div> CERRADOS</div>\n            </div>\n        </div>`;',
    '<div style="display:flex; align-items:center; gap:5px;"><div style="width:10px; height:10px; background:rgba(255, 255, 255, 0.05); border-left:2px solid rgba(255,255,255,0.1); border-radius:2px;"></div> CERRADOS</div>\n            </div>\n            </div>\n        </div>`;'
);

fs.writeFileSync('frontend/index.html', html, 'utf8');
console.log('Done replacing index.html');
