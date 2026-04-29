const fs = require('fs');
const file = '/Users/nelsoncarrillokosak/valet-eye/frontend/index.html';
let content = fs.readFileSync(file, 'utf8');

const calendarFn = `
    function getWeekNumber(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
        var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
        return weekNo;
    }

    function generateWeeklyCalendarHTML() {
        const today = new Date();
        const currentDay = today.getDay();
        const diff = today.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
        const startOfCurrentWeek = new Date(today.setDate(diff));
        
        const startOfCalendar = new Date(startOfCurrentWeek);
        startOfCalendar.setDate(startOfCalendar.getDate() - 14);
        
        const weekDays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
        
        let html = \`
        <div style="background:var(--surface2); border:1px solid var(--border); border-radius:24px; padding:25px; height:100%; box-sizing:border-box;">
            <h3 style="margin-bottom:20px; color:var(--accent);">Calendario de Eventos</h3>
            <div style="display:grid; grid-template-columns: 40px repeat(7, 1fr); gap:6px; text-align:center;">
                <div></div> <!-- Empty top-left for week number -->
                \${weekDays.map(d => \`<div style="font-size:0.6rem; color:var(--muted); font-weight:800; padding-bottom:10px;">\${d}</div>\`).join('')}
        \`;
        
        const currentDateIterator = new Date(startOfCalendar);
        const actualToday = new Date();
        actualToday.setHours(0,0,0,0);
        
        for (let w = 0; w < 5; w++) {
            const weekNum = getWeekNumber(new Date(currentDateIterator));
            const isCurrentWeek = w === 2;
            
            html += \`<div style="display:flex; align-items:center; justify-content:center; font-size:0.65rem; color:\${isCurrentWeek ? 'var(--accent)' : 'var(--muted)'}; font-weight:900;">S\${weekNum}</div>\`;
            
            for (let d = 0; d < 7; d++) {
                currentDateIterator.setHours(0,0,0,0);
                const isToday = currentDateIterator.getTime() === actualToday.getTime();
                const dateStr = currentDateIterator.getDate();
                
                let bg = 'rgba(255,255,255,0.02)';
                let color = 'var(--text)';
                let border = '1px solid transparent';
                
                if (isToday) {
                    bg = 'var(--accent)';
                    color = '#fff';
                } else if (isCurrentWeek) {
                    bg = 'rgba(99, 102, 241, 0.1)';
                    border = '1px solid rgba(99, 102, 241, 0.2)';
                }
                
                html += \`
                    <div style="background:\${bg}; color:\${color}; border:\${border}; border-radius:8px; padding:10px 0; font-size:0.8rem; font-weight:700; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                        \${dateStr}
                        \${isToday ? \`<div style="width:4px; height:4px; background:#fff; border-radius:50%; margin-top:2px;"></div>\` : ''}
                    </div>
                \`;
                
                currentDateIterator.setDate(currentDateIterator.getDate() + 1);
            }
        }
        
        html += \`</div>
            <div style="margin-top:25px; display:flex; gap:15px; font-size:0.65rem; color:var(--muted); align-items:center; justify-content:center;">
                <div style="display:flex; align-items:center; gap:5px;"><div style="width:10px; height:10px; background:var(--accent); border-radius:2px;"></div> Hoy</div>
                <div style="display:flex; align-items:center; gap:5px;"><div style="width:10px; height:10px; background:rgba(99, 102, 241, 0.1); border:1px solid rgba(99, 102, 241, 0.2); border-radius:2px;"></div> Semana Actual</div>
            </div>
        </div>\`;
        
        return html;
    }
`;

// Extract renderListas block using index
const startIdx = content.indexOf('function renderListas(view) {');
const endIdx = content.indexOf('function showSessionPicker', startIdx);

if (startIdx !== -1 && endIdx !== -1) {
    const renderListasCode = `
    function renderListas(view) {
        view.innerHTML = \`
            <div class="header" style="margin-bottom: 20px;">
                <h1 class="view-title">📋 GESTIÓN DE LISTAS</h1>
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; align-items:start;">
                <!-- COLUMNA 1: PANEL DE ENTRADA -->
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
                
                <!-- COLUMNA 2: CALENDARIO SEMANAL -->
                <div style="animation: slideInUp 0.4s ease-out;">
                    \${generateWeeklyCalendarHTML()}
                </div>
            </div>
        \`;
    }
`;

    content = content.substring(0, startIdx) + calendarFn + renderListasCode + content.substring(endIdx);
    fs.writeFileSync(file, content, 'utf8');
    console.log('Calendar injected successfully');
} else {
    console.error('Could not find renderListas block');
}
