const fs = require('fs');
const file = '/Users/nelsoncarrillokosak/valet-eye/frontend/index.html';
let content = fs.readFileSync(file, 'utf8');

const updatedCalendarFn = `
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
        const activeSessions = window.activeSessions || [];
        
        let html = \`
        <div style="background:var(--surface2); border:1px solid var(--border); border-radius:24px; padding:25px; height:100%; box-sizing:border-box;">
            <h3 style="margin-bottom:20px; color:var(--accent);">Calendario de Eventos</h3>
            <div style="display:grid; grid-template-columns: 40px repeat(7, 1fr); gap:6px; text-align:center;">
                <div></div>
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
                
                // Buscar eventos para este día
                const sessionsThisDay = activeSessions.filter(s => {
                    const sDate = new Date(s.started_at);
                    sDate.setHours(0,0,0,0);
                    return sDate.getTime() === currentDateIterator.getTime();
                });
                
                const count = sessionsThisDay.length;
                const tooltipText = count > 0 ? \`Eventos del día:\\n\${sessionsThisDay.map(s => \`• \${s.name} (\${s.type || 'Valet'})\`).join('\\n')}\` : '';
                
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
                    <div title="\${tooltipText}" style="position:relative; background:\${bg}; color:\${color}; border:\${border}; border-radius:8px; padding:10px 0; font-size:0.8rem; font-weight:700; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.transform='scale(1.05)'; this.style.zIndex='10';" onmouseout="this.style.transform='scale(1)'; this.style.zIndex='1';">
                        \${dateStr}
                        \${count > 0 ? \`<div style="position:absolute; top:-5px; right:-5px; background:var(--brand-red); color:white; font-size:0.55rem; min-width:14px; height:14px; border-radius:7px; display:flex; align-items:center; justify-content:center; font-weight:900; padding:0 3px; box-shadow:0 2px 4px rgba(0,0,0,0.3); z-index:2;">\${count}</div>\` : ''}
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
                \${activeSessions.length > 0 ? \`<div style="display:flex; align-items:center; gap:5px; margin-left:10px;"><div style="width:10px; height:10px; background:var(--brand-red); border-radius:2px;"></div> Eventos Activos</div>\` : ''}
            </div>
        </div>\`;
        
        return html;
    }
`;

// Extract and replace generateWeeklyCalendarHTML
const startIdx = content.indexOf('function getWeekNumber(d) {');
const endIdx = content.indexOf('function renderListas(view) {', startIdx);

if (startIdx !== -1 && endIdx !== -1) {
    content = content.substring(0, startIdx) + updatedCalendarFn + content.substring(endIdx);
    fs.writeFileSync(file, content, 'utf8');
    console.log('Calendar logic updated successfully');
} else {
    console.error('Could not find calendar function block');
}
