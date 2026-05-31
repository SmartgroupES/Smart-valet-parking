const fs = require('fs');

let html = fs.readFileSync('frontend/index.html', 'utf8');

// 1. Add window.calendarViewDate state and changeCalendarWeek function before generateWeeklyCalendarHTML
const stateCode = `
    window.calendarViewDate = window.calendarViewDate || new Date();
    window.changeCalendarWeek = function(offset) {
        if (offset === 'today') {
            window.calendarViewDate = new Date();
        } else {
            window.calendarViewDate.setDate(window.calendarViewDate.getDate() + offset);
        }
        const container = document.getElementById('calendar-wrapper-container');
        if (container) {
            container.innerHTML = generateWeeklyCalendarHTML();
        }
    };

    function generateWeeklyCalendarHTML`;

html = html.replace('    function generateWeeklyCalendarHTML', stateCode);

// 2. Wrap generateWeeklyCalendarHTML call in renderListas
html = html.replace(
    '<div class="listas-calendar-wrapper-col">\n                        ${generateWeeklyCalendarHTML()}\n                    </div>',
    '<div class="listas-calendar-wrapper-col" id="calendar-wrapper-container">\n                        ${generateWeeklyCalendarHTML()}\n                    </div>'
);

// 3. Replace generateWeeklyCalendarHTML implementation
const startIndex = html.indexOf('function generateWeeklyCalendarHTML() {');
const endIndex = html.indexOf('    async function saveListaEvento() {');

if (startIndex !== -1 && endIndex !== -1) {
    const newFunction = `function generateWeeklyCalendarHTML() {
        const viewDate = window.calendarViewDate || new Date();
        
        // Find Monday of the viewed week
        const currentDay = viewDate.getDay();
        const diff = viewDate.getDate() - currentDay + (currentDay === 0 ? -6 : 1);
        const startOfWeek = new Date(viewDate.setDate(diff));
        startOfWeek.setHours(0,0,0,0);
        
        const weekDays = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];
        const userStr = localStorage.getItem('user');
        const user = userStr ? JSON.parse(userStr) : { role: 'valet' };
        const isDirector = isUserAdminOrStaff(user);

        const allSessionsRaw = window.allSessions || [];
        const allSessions = allSessionsRaw.filter(s => {
            if (isDirector) return true;
            return s.assigned_staff_list && s.assigned_staff_list.some(staff => staff.id == user.id);
        });
        
        function getEventColor(s) {
            if (s.status === 'closed' || s.status === 'concluded') {
                return { bg: 'rgba(255, 255, 255, 0.05)', border: 'rgba(255,255,255,0.1)', text: 'var(--muted)', grayscale: true };
            }
            const type = s.type;
            const t = (type || '').toLowerCase();
            if (t.includes('valet')) return { bg: 'rgba(239, 68, 68, 0.15)', border: 'var(--brand-red)', text: '#ef4444' };
            if (t.includes('boda')) return { bg: 'rgba(245, 158, 11, 0.15)', border: 'var(--warning)', text: '#f59e0b' };
            if (t.includes('corp')) return { bg: 'rgba(99, 102, 241, 0.15)', border: 'var(--accent)', text: '#818cf8' };
            if (t.includes('cumple')) return { bg: 'rgba(16, 185, 129, 0.15)', border: 'var(--brand-green)', text: '#10b981' };
            if (t.includes('conciert')) return { bg: 'rgba(168, 85, 247, 0.15)', border: '#a855f7', text: '#c084fc' };
            return { bg: 'rgba(255, 255, 255, 0.05)', border: 'var(--muted)', text: 'var(--text)' };
        }

        const monthName = startOfWeek.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase();
        
        let html = \`
        <div id="calendar-wrapper" style="background:var(--surface2); border:1px solid var(--border); border-radius:24px; padding:20px; width:100%; box-sizing:border-box; display:flex; flex-direction:column; position:relative; overflow:hidden;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:10px;">
                <h3 style="margin:0; color:var(--accent); font-size:1.1rem; font-weight:900;">CALENDARIO SEMANAL</h3>
                <div style="display:flex; gap:10px; align-items:center;">
                    <button class="btn btn-sm" style="background:rgba(255,255,255,0.05); padding:8px 12px; font-size:1rem;" onclick="changeCalendarWeek(-7)">⬅️</button>
                    <button class="btn btn-sm" style="background:rgba(255,255,255,0.05); padding:8px 12px; font-size:0.8rem; font-weight:bold; color:white;" onclick="changeCalendarWeek('today')">HOY</button>
                    <button class="btn btn-sm" style="background:rgba(255,255,255,0.05); padding:8px 12px; font-size:1rem;" onclick="changeCalendarWeek(7)">➡️</button>
                </div>
            </div>
            
            <div style="font-size:0.8rem; color:var(--accent); font-weight:900; background:rgba(99, 102, 241, 0.1); padding:8px 15px; border-radius:10px; text-align:center; margin-bottom:20px;">
                \${monthName}
            </div>
            
            <div style="display:flex; flex-direction:column; gap:12px; width:100%;">
        \`;
        
        const currentDateIterator = new Date(startOfWeek);
        const actualToday = new Date();
        actualToday.setHours(0,0,0,0);
        
        for (let d = 0; d < 7; d++) {
            const isToday = currentDateIterator.getTime() === actualToday.getTime();
            const dateStr = currentDateIterator.getDate();
            const dayName = weekDays[d];
            
            const sessionsThisDay = allSessions.filter(s => {
                if (s.status === 'budgeted') return false;
                const rawDate = s.started_at || s.created_at;
                
                let sDate;
                if (typeof rawDate === 'string' && rawDate.length === 10 && rawDate.includes('-')) {
                    const parts = rawDate.split('-');
                    sDate = new Date(parts[0], parts[1] - 1, parts[2]);
                } else {
                    sDate = new Date(rawDate);
                }
                
                sDate.setHours(0,0,0,0);
                return sDate.getTime() === currentDateIterator.getTime();
            });
            
            let bg = 'rgba(255,255,255,0.015)';
            let border = '1px solid rgba(255,255,255,0.03)';
            if (isToday) {
                bg = 'rgba(99, 102, 241, 0.05)';
                border = '1px solid var(--accent)';
            }
            
            let eventsHtml = '';
            if (sessionsThisDay.length > 0) {
                eventsHtml = sessionsThisDay.map(s => {
                    const colorSet = getEventColor(s);
                    const isClosed = s.status === 'closed' || s.status === 'concluded';
                    return \`
                        <div onclick="showDayDetails('\${currentDateIterator.toISOString()}')" style="cursor:pointer; background:\${colorSet.bg}; border-left:4px solid \${colorSet.border}; color:\${colorSet.text}; font-size:0.8rem; padding:10px 12px; border-radius:8px; margin-bottom:6px; display:flex; flex-direction:column; gap:4px; transition:0.2s; filter:\${colorSet.grayscale ? 'grayscale(1)' : 'none'}; opacity:\${colorSet.grayscale ? '0.7' : '1'};" onmouseover="this.style.background='rgba(255,255,255,0.08)';" onmouseout="this.style.background='\${colorSet.bg}';">
                            <div style="font-weight:900; font-size:0.9rem;">\${s.name.toUpperCase()} \${isClosed ? ' (FINALIZADO)' : ''}</div>
                            <div style="display:flex; flex-wrap:wrap; gap:10px; font-size:0.7rem; color:var(--muted);">
                                <span><b>TIPO:</b> \${s.type ? s.type.toUpperCase() : 'N/A'}</span>
                                <span><b>DIR:</b> \${s.address || 'N/A'}</span>
                                <span><b>PERSONAL:</b> \${s.assigned_staff || 'SIN ASIGNAR'}</span>
                            </div>
                        </div>
                    \`;
                }).join('');
            } else {
                eventsHtml = \`<div style="color:var(--muted); font-size:0.75rem; font-style:italic; padding:5px 0;">Sin eventos programados.</div>\`;
            }

            html += \`
                <div style="background:\${bg}; border:\${border}; border-radius:16px; padding:15px; display:flex; flex-direction:column; gap:10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px;">
                        <span style="font-size:0.9rem; font-weight:900; color:\${isToday ? 'var(--accent)' : 'var(--text)'}; opacity:\${isToday ? '1' : '0.8'};">
                            \${dayName} \${dateStr}
                        </span>
                        \${isToday ? \`<div style="background:var(--accent); color:white; font-size:0.6rem; font-weight:900; padding:2px 8px; border-radius:10px;">HOY</div>\` : ''}
                    </div>
                    <div style="display:flex; flex-direction:column;">
                        \${eventsHtml}
                    </div>
                </div>
            \`;
            
            currentDateIterator.setDate(currentDateIterator.getDate() + 1);
        }
        
        html += \`</div>
            <div style="margin-top:20px; display:flex; gap:15px; font-size:0.65rem; color:var(--muted); align-items:center; justify-content:center; text-transform:uppercase; letter-spacing:1px; font-weight:800; flex-wrap:wrap;">
                <div style="display:flex; align-items:center; gap:5px;"><div style="width:10px; height:10px; background:rgba(239, 68, 68, 0.2); border-left:2px solid var(--brand-red); border-radius:2px;"></div> VALET</div>
                <div style="display:flex; align-items:center; gap:5px;"><div style="width:10px; height:10px; background:rgba(245, 158, 11, 0.2); border-left:2px solid var(--warning); border-radius:2px;"></div> BODA</div>
                <div style="display:flex; align-items:center; gap:5px;"><div style="width:10px; height:10px; background:rgba(16, 185, 129, 0.2); border-left:2px solid var(--brand-green); border-radius:2px;"></div> CUMPLE</div>
                <div style="display:flex; align-items:center; gap:5px;"><div style="width:10px; height:10px; background:rgba(255, 255, 255, 0.05); border-left:2px solid rgba(255,255,255,0.1); border-radius:2px;"></div> CERRADOS</div>
            </div>
        </div>\`;
        
        return html;
    }
`;

    const before = html.substring(0, startIndex);
    const after = html.substring(endIndex);
    html = before + newFunction + '\n    ' + after;

    fs.writeFileSync('frontend/index.html', html, 'utf8');
    console.log('Calendario actualizado exitosamente.');
} else {
    console.error('No se pudo encontrar la funcion generateWeeklyCalendarHTML.');
}
