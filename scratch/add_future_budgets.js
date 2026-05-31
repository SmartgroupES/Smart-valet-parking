const fs = require('fs');
let html = fs.readFileSync('frontend/index.html', 'utf8');

const checkActiveSessionTarget = `        const resC = await apiFetch('/api/sessions/concluded');
        const concludedSessions = (resC && resC.sessions) ? resC.sessions : [];
        
        window.allSessions = [...activeSessions, ...concludedSessions];`;

const checkActiveSessionReplacement = `        const resC = await apiFetch('/api/sessions/concluded');
        const concludedSessions = (resC && resC.sessions) ? resC.sessions : [];
        
        const resB = await apiFetch('/api/presupuestos');
        if (resB && resB.budgets) {
            window._globalBudgets = resB.budgets.map(d => ({
                ...d,
                form: typeof d.form_data === 'string' ? JSON.parse(d.form_data) : d.form_data,
                items: typeof d.items_data === 'string' ? JSON.parse(d.items_data) : d.items_data
            }));
        }
        
        window.allSessions = [...activeSessions, ...concludedSessions];`;

html = html.replace(checkActiveSessionTarget, checkActiveSessionReplacement);

const renderPlanningTarget = `                                                const planning = (window.activeSessions || []).filter(s => {
                                                    if (s.status !== 'planning') return false;
                                                    if (isDirector) return true;
                                                    return s.assigned_staff_list && s.assigned_staff_list.some(staff => staff.id == user.id);
                                                });
                                                planning.sort((a, b) => {`;

const renderPlanningReplacement = `                                                const planning = (window.activeSessions || []).filter(s => {
                                                    if (s.status !== 'planning') return false;
                                                    if (isDirector) return true;
                                                    return s.assigned_staff_list && s.assigned_staff_list.some(staff => staff.id == user.id);
                                                });
                                                
                                                // Inject approved budgets
                                                if (window._globalBudgets) {
                                                    const futureBudgets = window._globalBudgets.filter(b => {
                                                        if (b.estatus !== 'APROBADO') return false;
                                                        const bDateStr = (b.fecha && b.fecha !== 'N/A') ? b.fecha : (b.form && b.form.fecha);
                                                        if (!bDateStr) return false;
                                                        const d = new Date(bDateStr);
                                                        d.setHours(23,59,59,999);
                                                        return d.getTime() >= Date.now();
                                                    }).map(b => ({
                                                        id: 'budget-' + b.id,
                                                        name: b.evento || 'PRESUPUESTO APROBADO',
                                                        started_at: (b.fecha && b.fecha !== 'N/A' ? b.fecha : (b.form && b.form.fecha)) + 'T' + (b.form && b.form.inicio ? b.form.inicio : '00:00') + ':00',
                                                        event_start_time: (b.form && b.form.inicio) || '00:00',
                                                        type: (b.form && b.form.tipoEvento) || 'SERVICIO',
                                                        assigned_staff_count: 0,
                                                        client: b.empresa || 'N/A',
                                                        phone: (b.form && b.form.telefonos) || '-',
                                                        is_budget: true,
                                                        budget_id: b.id,
                                                        budget_timestamp: b.timestamp
                                                    }));
                                                    planning.push(...futureBudgets);
                                                }
                                                
                                                planning.sort((a, b) => {`;

html = html.replace(renderPlanningTarget, renderPlanningReplacement);

const renderRowTarget = `                                                    return planning.map(s => \`
                                                        <tr onclick="renderScheduledEventDetail(\${s.id})" style="border-bottom:1px solid rgba(255,255,255,0.03); opacity:0.8; cursor:pointer; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">`;

const renderRowReplacement = `                                                    return planning.map(s => \`
                                                        <tr onclick="\${s.is_budget ? \`cargarPresupuestoDesdeHistorial('\${s.budget_id}', \${s.budget_timestamp}); document.getElementById('current-view').style.display='none'; document.getElementById('presupuestos-view').style.display='block'; window.scrollTo(0,0);\` : \`renderScheduledEventDetail(\${s.id})\`}" style="border-bottom:1px solid rgba(255,255,255,0.03); opacity:0.8; cursor:pointer; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.05)'" onmouseout="this.style.background='transparent'">`;

html = html.replace(renderRowTarget, renderRowReplacement);

fs.writeFileSync('frontend/index.html', html);
console.log("Done modifying index.html");
