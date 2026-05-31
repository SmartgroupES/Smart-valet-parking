const fs = require('fs');

let html = fs.readFileSync('frontend/index.html', 'utf8');

// The target section starts with <div class="stat-card" style="border-top:4px solid var(--accent); background:rgba(255,255,255,0.02); margin-top:30px;">
// and contains 📂 EVENTOS PENDIENTES POR RELACIONAR
// Let's locate it and replace it.

const searchString = `            <div class="stat-card" style="border-top:4px solid var(--accent); background:rgba(255,255,255,0.02); margin-top:30px;">
                <h3 style="margin-top:0; font-size:1.1rem; color:#fff; display:flex; align-items:center; gap:10px;">
                    <span>📂 EVENTOS PENDIENTES POR RELACIONAR</span>
                    <small style="font-size:0.6rem; color:var(--muted); text-transform:uppercase;">(POR EMPLEADO - BASE DE DATOS)</small>
                </h3>
                <p style="font-size:0.7rem; color:var(--muted); margin-bottom:20px;">
                    Eventos completados con actividad registrada que aún no han sido relacionados en un reporte de cobro por el empleado. Haz clic sobre cada empleado para desplegar sus eventos pendientes.
                </p>`;

// We need to inject JS logic to calculate stats and chart data before this block, but it's inside a template literal.
// So we insert it right after `const groupedPending = {}; ...` block.
const logicSearchString = `        const groupedPending = {};
        pendingEvents.forEach(e => {
            if (!groupedPending[e.staff_name]) {
                groupedPending[e.staff_name] = [];
            }
            groupedPending[e.staff_name].push(e);
        });`;

const logicInsertString = `        const groupedPending = {};
        const eventsByMonth = { '01':0, '02':0, '03':0, '04':0, '05':0, '06':0, '07':0, '08':0, '09':0, '10':0, '11':0, '12':0 };
        const monthNames = { '01':'Ene', '02':'Feb', '03':'Mar', '04':'Abr', '05':'May', '06':'Jun', '07':'Jul', '08':'Ago', '09':'Sep', '10':'Oct', '11':'Nov', '12':'Dic' };
        
        pendingEvents.forEach(e => {
            if (!groupedPending[e.staff_name]) {
                groupedPending[e.staff_name] = [];
            }
            groupedPending[e.staff_name].push(e);
            
            if (e.ended_at) {
                const parts = e.ended_at.split(/[- ]/);
                if (parts.length > 1) {
                    const month = parts[1];
                    if (eventsByMonth[month] !== undefined) eventsByMonth[month]++;
                }
            }
        });
        
        const totalPending = pendingEvents.length;
        const totalEmployees = Object.keys(groupedPending).length;
        const avgPending = totalEmployees > 0 ? (totalPending / totalEmployees).toFixed(1) : 0;
        
        // Calcular máximo para la gráfica
        const maxEventsMonth = Math.max(...Object.values(eventsByMonth), 1);
        `;

html = html.replace(logicSearchString, logicInsertString);

const replacementString = `            <div class="stat-card" style="border-top:4px solid var(--accent); background:rgba(255,255,255,0.02); margin-top:30px;">
                <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="const content = document.getElementById('pending-events-content'); content.style.display = content.style.display === 'none' ? 'block' : 'none'; const icon = document.getElementById('pending-events-icon'); icon.innerText = content.style.display === 'none' ? '▶' : '▼';">
                    <h3 style="margin:0; font-size:1.1rem; color:#fff; display:flex; align-items:center; gap:10px;">
                        <span>📂 EVENTOS PENDIENTES POR RELACIONAR</span>
                        <small style="font-size:0.6rem; color:var(--muted); text-transform:uppercase;">(POR EMPLEADO - BASE DE DATOS)</small>
                    </h3>
                    <span id="pending-events-icon" style="color:var(--accent); font-size:0.8rem;">▼</span>
                </div>
                
                <div id="pending-events-content" style="display:none; margin-top:20px;">
                    <p style="font-size:0.7rem; color:var(--muted); margin-bottom:20px;">
                        Eventos completados con actividad registrada que aún no han sido relacionados en un reporte de cobro por el empleado. Haz clic sobre cada empleado para desplegar sus eventos pendientes.
                    </p>
                    
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:15px; margin-bottom:25px;">
                        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:15px; border-radius:12px; text-align:center;">
                            <div style="font-size:0.6rem; color:var(--muted); font-weight:800; letter-spacing:1px;">TOTAL EVENTOS PENDIENTES</div>
                            <div style="font-size:1.8rem; font-weight:900; color:var(--warning); margin-top:5px;">\${totalPending}</div>
                        </div>
                        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:15px; border-radius:12px; text-align:center;">
                            <div style="font-size:0.6rem; color:var(--muted); font-weight:800; letter-spacing:1px;">EMPLEADOS AFECTADOS</div>
                            <div style="font-size:1.8rem; font-weight:900; color:var(--accent); margin-top:5px;">\${totalEmployees}</div>
                        </div>
                        <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:15px; border-radius:12px; text-align:center;">
                            <div style="font-size:0.6rem; color:var(--muted); font-weight:800; letter-spacing:1px;">PROMEDIO POR EMPLEADO</div>
                            <div style="font-size:1.8rem; font-weight:900; color:var(--brand-green); margin-top:5px;">\${avgPending}</div>
                        </div>
                    </div>

                    <div style="margin-bottom:25px; padding:15px; background:rgba(255,255,255,0.02); border-radius:12px; border:1px solid rgba(255,255,255,0.05);">
                        <div style="font-size:0.7rem; color:var(--accent); font-weight:900; letter-spacing:1px; margin-bottom:15px; text-align:center;">ANTIGÜEDAD DE EVENTOS (POR MES)</div>
                        <div style="display:flex; justify-content:space-between; align-items:flex-end; height:100px; gap:5px; padding:0 10px;">
                            \${Object.entries(eventsByMonth).map(([month, count]) => {
                                const height = (count / maxEventsMonth) * 100;
                                const isZero = count === 0;
                                return \`
                                    <div style="display:flex; flex-direction:column; align-items:center; flex:1; gap:5px;" title="\${monthNames[month]}: \${count} eventos">
                                        <div style="font-size:0.55rem; color:var(--text); font-weight:bold; opacity:\${isZero ? 0.3 : 1};">\${count}</div>
                                        <div style="width:100%; max-width:25px; height:\${isZero ? 2 : height}px; background:\${isZero ? 'rgba(255,255,255,0.1)' : 'var(--accent)'}; border-radius:4px 4px 0 0; transition:height 0.5s;"></div>
                                        <div style="font-size:0.55rem; color:var(--muted); font-weight:800;">\${monthNames[month]}</div>
                                    </div>
                                \`;
                            }).join('')}
                        </div>
                    </div>`;

html = html.replace(searchString, replacementString);

// Find where to close the pending-events-content div.
// It should be right before:
/*
            <div class="stat-card" style="border-top:4px solid var(--warning); background:rgba(255,255,255,0.02);">
                <h3 style="margin-top:0; font-size:1.1rem; color:#fff;">📝 DETALLE INDIVIDUAL DE REPORTES</h3>
*/

const searchCloseString = `            <div class="stat-card" style="border-top:4px solid var(--warning); background:rgba(255,255,255,0.02);">
                <h3 style="margin-top:0; font-size:1.1rem; color:#fff;">📝 DETALLE INDIVIDUAL DE REPORTES</h3>`;

const replaceCloseString = `                </div> <!-- Cierra pending-events-content -->
            </div>

            <div class="stat-card" style="border-top:4px solid var(--warning); background:rgba(255,255,255,0.02);">
                <h3 style="margin-top:0; font-size:1.1rem; color:#fff;">📝 DETALLE INDIVIDUAL DE REPORTES</h3>`;

html = html.replace(searchCloseString, replaceCloseString);

fs.writeFileSync('frontend/index.html', html, 'utf8');
console.log('Done replacing index.html');
