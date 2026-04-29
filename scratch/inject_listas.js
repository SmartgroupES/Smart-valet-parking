const fs = require('fs');
const file = '/Users/nelsoncarrillokosak/valet-eye/frontend/index.html';
let content = fs.readFileSync(file, 'utf8');

// 1. Reemplazar "EYE KIDS" por "LISTAS"
const oldMenu = `<div class="menu-item disabled" style="opacity:0.3; filter:grayscale(1);">
                            <i style="font-size:2rem">🎈</i>
                            <div class="menu-item-content">
                                <span class="menu-item-title" style="font-size:1rem;">EYE KIDS</span>
                                <span class="menu-item-desc" style="font-size:0.6rem;">PRÓXIMAMENTE</span>
                            </div>
                        </div>`;

const newMenu = `<div class="menu-item" onclick="enterModule('listas')" style="border-top: 4px solid #f43f5e; background: rgba(244, 63, 94, 0.05);">
                            <i style="font-size:2rem">📋</i>
                            <div class="menu-item-content">
                                <span class="menu-item-title" style="font-size:1rem;">LISTAS</span>
                                <span class="menu-item-desc" style="font-size:0.6rem;">GESTIÓN EVENTOS</span>
                            </div>
                        </div>`;

// We use string replace carefully, in case of exact match failure, we try regex
if (content.includes('EYE KIDS')) {
    // Find the block containing EYE KIDS
    content = content.replace(/<div class="menu-item disabled"[^>]*>\s*<i[^>]*>🎈<\/i>\s*<div class="menu-item-content">\s*<span[^>]*>EYE KIDS<\/span>\s*<span[^>]*>PRÓXIMAMENTE<\/span>\s*<\/div>\s*<\/div>/, newMenu);
}

// 2. Update enterModule
const enterModuleCode = `} else if (module === 'eventos') {`;
const enterModuleNew = `} else if (module === 'listas') {
            renderListas(view);
        } else if (module === 'eventos') {`;

content = content.replace(enterModuleCode, enterModuleNew);

// 3. Insert renderListas function
const renderListasCode = `
    function renderListas(view) {
        view.innerHTML = \`
            <div class="header" style="margin-bottom: 20px;">
                <h1 class="view-title">📋 GESTIÓN DE LISTAS</h1>
            </div>
            <div class="vehicle-card" style="padding:25px; border-radius:24px; animation: slideInUp 0.3s ease-out;">
                <h3 style="margin-bottom:20px; color:var(--accent);">Panel de Entrada</h3>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; text-align:left;">
                    
                    <div style="grid-column: span 1;">
                        <label style="font-size:0.7rem; color:var(--muted); font-weight:700;">FECHA DEL EVENTO</label>
                        <input type="date" id="lista-fecha" class="input-field" style="width:100%; margin-top:5px; border-radius:12px; padding:12px; box-sizing:border-box;">
                    </div>

                    <div style="grid-column: span 1;">
                        <label style="font-size:0.7rem; color:var(--muted); font-weight:700;">TIPO DE EVENTO</label>
                        <select id="lista-tipo" class="input-field" style="width:100%; margin-top:5px; border-radius:12px; padding:12px; background:var(--surface); box-sizing:border-box; color:#fff;">
                            <option value="" disabled selected>Seleccione...</option>
                            <option value="Boda">Boda</option>
                            <option value="Corporativo">Corporativo</option>
                            <option value="Cumpleaños">Cumpleaños</option>
                            <option value="Concierto">Concierto</option>
                            <option value="Otro">Otro</option>
                        </select>
                    </div>

                    <div style="grid-column: span 2;">
                        <label style="font-size:0.7rem; color:var(--muted); font-weight:700;">NOMBRE DEL EVENTO</label>
                        <input type="text" id="lista-nombre" class="input-field" placeholder="Ej. Boda Martínez" style="width:100%; margin-top:5px; border-radius:12px; padding:12px; box-sizing:border-box;">
                    </div>

                    <div style="grid-column: span 2;">
                        <label style="font-size:0.7rem; color:var(--muted); font-weight:700;">DIRECCIÓN</label>
                        <input type="text" id="lista-direccion" class="input-field" placeholder="Dirección del lugar" style="width:100%; margin-top:5px; border-radius:12px; padding:12px; box-sizing:border-box;">
                    </div>

                    <div style="grid-column: span 1;">
                        <label style="font-size:0.7rem; color:var(--muted); font-weight:700;">CONTACTO PRINCIPAL</label>
                        <input type="text" id="lista-contacto" class="input-field" placeholder="Nombre completo" style="width:100%; margin-top:5px; border-radius:12px; padding:12px; box-sizing:border-box;">
                    </div>

                    <div style="grid-column: span 1;">
                        <label style="font-size:0.7rem; color:var(--muted); font-weight:700;">TELÉFONO</label>
                        <input type="tel" id="lista-telefono" class="input-field" placeholder="+52 ..." style="width:100%; margin-top:5px; border-radius:12px; padding:12px; box-sizing:border-box;">
                    </div>

                    <div style="grid-column: span 2;">
                        <label style="font-size:0.7rem; color:var(--muted); font-weight:700;">EMAIL</label>
                        <input type="email" id="lista-email" class="input-field" placeholder="correo@ejemplo.com" style="width:100%; margin-top:5px; border-radius:12px; padding:12px; box-sizing:border-box;">
                    </div>

                    <div style="grid-column: span 2;">
                        <label style="font-size:0.7rem; color:var(--muted); font-weight:700;">OBSERVACIONES</label>
                        <textarea id="lista-observaciones" class="input-field" rows="2" placeholder="Escriba aquí (máximo 2 líneas)..." style="width:100%; margin-top:5px; border-radius:12px; padding:12px; resize:none; box-sizing:border-box;"></textarea>
                    </div>

                </div>

                <button class="btn" style="width:100%; margin-top:25px; border-radius:16px; padding:18px; font-size:1.1rem; font-weight:800; background:var(--brand-green); color:white;" onclick="toast('Datos guardados exitosamente', 'success')">GUARDAR EVENTO</button>
            </div>
        \`;
    }
`;

// Insert it before function showSessionPicker
content = content.replace('function showSessionPicker', renderListasCode + '\n    function showSessionPicker');

fs.writeFileSync(file, content, 'utf8');
console.log('Modifications applied successfully');
