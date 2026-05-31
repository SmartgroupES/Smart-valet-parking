const fs = require('fs');
let html = fs.readFileSync('frontend/index.html', 'utf8');

// 1. Move Map below Direccion
const direccionTarget = `<div class="field" style="grid-column: 1 / -1;">
                    <label>DIRECCIÓN DEL EVENTO</label>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <input type="text" id="pres-direccion" placeholder="Ej. Quinta La Esmeralda, Campo Alegre" style="flex:1;">
                        <button class="btn btn-secondary" onclick="verEnMapa()" title="Ver en Google Maps" style="padding:0 15px; height:42px; border-radius:8px;">🗺️</button>
                    </div>
                </div>`;

const direccionReplacement = `<div class="field" style="grid-column: 1 / -1;">
                    <label>DIRECCIÓN DEL EVENTO</label>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <input type="text" id="pres-direccion" placeholder="Ej. Quinta La Esmeralda, Campo Alegre" style="flex:1;" oninput="updatePresupuestoMap()">
                    </div>
                    <div style="margin-top:10px; height:200px; border-radius:12px; overflow:hidden; border:1px solid var(--border);">
                        <iframe id="pres-map-iframe" width="100%" height="100%" frameborder="0" style="border:0; filter: grayscale(0.5) contrast(1.2) opacity(0.8);" src="https://www.google.com/maps?q=Caracas&output=embed" allowfullscreen></iframe>
                    </div>
                </div>`;

html = html.replace(direccionTarget, direccionReplacement);

// 2. Add map update function
const funcTarget = `    window.handleAddressChange = function(val) {`;
const funcReplacement = `    window.updatePresupuestoMap = function() {
        const val = document.getElementById('pres-direccion').value;
        const addr = val.trim() || window.DEFAULT_MAP_ADDRESS;
        const iframe = document.getElementById('pres-map-iframe');
        if (iframe) {
            iframe.src = \`https://www.google.com/maps?q=\${encodeURIComponent(addr)}&output=embed\`;
        }
    };
    
    window.handleAddressChange = function(val) {`;
html = html.replace(funcTarget, funcReplacement);

// 3. Change time inputs
// pres-inicio
html = html.replace(
    '<div style="flex:1"><label>HORA DE INICIO</label><input type="time" id="pres-inicio" step="60" style="background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:0 10px; color:#fff; width:100%; height:42px;"></div>',
    '<div style="flex:1"><label>HORA DE INICIO</label><input type="text" id="pres-inicio" placeholder="HH:MM" maxlength="5" oninput="if(this.value.length === 2 && !this.value.includes(\':\')) this.value += \':\'" style="background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:0 10px; color:#fff; width:100%; height:42px; text-align:center;"></div>'
);

// pres-fin-hora
html = html.replace(
    '<div style="flex:1"><label>HORA CULMINACIÓN</label><input type="time" id="pres-fin-hora" step="60" style="background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:0 10px; color:#fff; width:100%; height:42px;"></div>',
    '<div style="flex:1"><label>HORA CULMINACIÓN</label><input type="text" id="pres-fin-hora" placeholder="HH:MM" maxlength="5" oninput="if(this.value.length === 2 && !this.value.includes(\':\')) this.value += \':\'" style="background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:0 10px; color:#fff; width:100%; height:42px; text-align:center;"></div>'
);

fs.writeFileSync('frontend/index.html', html);
console.log("UX elements updated");
