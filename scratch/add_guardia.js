const fs = require('fs');

let html = fs.readFileSync('frontend/index.html', 'utf8');

const targetLine = "    function renderRentaEquipos(el) {";
const insertion = `
    function renderGuardiaPresentation(el) {
        el.innerHTML = \`
            <div id="guardia-view" style="padding-top:20px; animation: fadeIn 0.3s ease;">
                <div class="view-header" style="justify-content: center; text-align: center; margin-bottom:20px;">
                    <h1 class="view-title" style="color:#6366f1; font-size: 1.8rem; letter-spacing: 1px;">🌙 GUARDIA DIURNA/NOCTURNA</h1>
                </div>
                <div class="stat-card" style="margin: 40px auto; max-width: 500px; text-align:center; background:rgba(99, 102, 241, 0.05); border:1px solid #6366f1; padding:35px; border-radius:24px;">
                    <i style="font-size:3rem; display:block; margin-bottom:15px;">🌙</i>
                    <h2 style="font-size:1.1rem; color:#fff; font-weight:900; margin-bottom:10px;">SIN GUARDIA ASIGNADA</h2>
                    <p style="font-size:0.8rem; color:var(--muted); font-weight:bold; line-height:1.5;">
                        No tiene ninguna guardia asignada actualmente o planificada.
                    </p>
                </div>
            </div>
        \`;
    }

    function renderGuardia(el) {
        if (!el) return;
        
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const isAdmin = isUserAdminOrStaff(user) || user.profile_admin === 'DIRECTOR' || user.profile_admin === 'COORDINADOR';

        let filteredSessions = (window.allSessions || []).filter(s => {
            const isGuardia = s.type && s.type.toLowerCase().includes('guardia');
            if (!isGuardia) return false;
            if (s.status !== 'active' && s.status !== 'planning') return false;
            
            if (isAdmin) return true;
            return s.assigned_staff_list && s.assigned_staff_list.some(staff => staff.id == user.id);
        });

        if (filteredSessions.length === 0) {
            renderGuardiaPresentation(el);
            return;
        }

        let session = null;
        if (window.currentGuardiaSessionId) {
            session = filteredSessions.find(s => s.id === window.currentGuardiaSessionId);
        }
        if (!session && filteredSessions.length > 0) {
            session = filteredSessions[0];
            window.currentGuardiaSessionId = session.id;
        }

        if (!session) {
            session = filteredSessions[0];
            window.currentGuardiaSessionId = session.id;
        }

        window.activeSession = session;

        const headerHtml = \`
            <div id="guardia-view" style="animation: fadeIn 0.3s ease;">
                <div class="view-header" style="justify-content: center; text-align: center; margin-bottom: 20px;">
                    <h1 class="view-title" style="color:#6366f1; font-size: 1.8rem; letter-spacing: 1px;">🌙 GUARDIA DIURNA/NOCTURNA</h1>
                </div>

                <div class="stat-card" style="margin-bottom: 20px; max-width: 500px; margin-left: auto; margin-right: auto; background: rgba(255,255,255,0.03); border: 1px solid var(--border); padding: 12px;">
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <label style="font-size: 0.6rem; color: var(--muted); font-weight: 800; letter-spacing: 1px;">GUARDIA SELECCIONADA</label>
                        <select onchange="window.currentGuardiaSessionId = parseInt(this.value); renderGuardia(document.getElementById('current-view'));" 
                            style="width: 100%; background: var(--surface2); border: 1px solid var(--border); padding: 8px; border-radius: 10px; color: #fff; font-weight: 700; font-size: 0.8rem;">
                            \${filteredSessions.map(s => 
                                \\\`<option value="\\\${s.id}" \\\${session.id == s.id ? 'selected' : ''} style="color:\\\${s.status === 'active' ? 'var(--success)' : 'var(--warning)'};">
                                    \\\${s.name.toUpperCase()} (\\\${s.status === 'active' ? 'ACTIVO' : 'PLANIFICADO'})
                                </option>\\\`
                            ).join('')}
                        </select>
                    </div>
                </div>
                <div id="guardia-dashboard-container">
                    <div style="padding: 20px; text-align:center; color:var(--muted);">Cargando detalles...</div>
                </div>
            </div>
        \`;

        el.innerHTML = headerHtml;
        renderGuardiaDashboard(document.getElementById('guardia-dashboard-container'), session);
    }

    async function renderGuardiaDashboard(el, session) {
        if (!el || !session) return;
        try {
            const staffRes = await apiFetch('/api/staff');
            const allStaff = staffRes?.staff || [];
            const sessionStaffRaw = allStaff.filter(u => String(u.current_session_id || '').split(',').includes(String(session.id)));
            
            const supervisors = sessionStaffRaw.filter(u => u.id == session.supervisor_id || ['supervisor', 'director'].includes(String(u.role).toLowerCase()));
            const employees = sessionStaffRaw.filter(u => !(u.id == session.supervisor_id || ['supervisor', 'director'].includes(String(u.role).toLowerCase())));
            
            supervisors.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
            employees.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
            
            const sessionStaff = [...supervisors, ...employees];

            el.innerHTML = \`
                <div style="max-width:1200px; margin:0 auto; padding:0 15px;">
                    <div class="stat-card" style="border-top:4px solid #6366f1; padding:25px; background: rgba(255, 255, 255, 0.02); border-radius:24px; position:relative; box-shadow: 0 15px 30px rgba(0,0,0,0.3);">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; gap:10px;">
                            <div>
                                <h2 style="margin:0; font-size:1.4rem; color:white; font-weight:900; letter-spacing:-0.5px;">\${(session.type || 'EVENTO').toUpperCase()} - \${(session.name || '').toUpperCase()}</h2>
                                <div style="font-size:0.8rem; color:#6366f1; font-weight:900; margin-top:10px; display:flex; align-items:flex-start; gap:8px; background:rgba(99,102,241,0.08); padding:10px 14px; border-radius:12px; border:1px solid rgba(99,102,241,0.2);">
                                    <span style="font-size:1.1rem; margin-top:2px;">📅</span>
                                    <span style="display:flex; flex-direction:column; gap:2px;">
                                        <span style="color:white; font-size:0.85rem; font-weight:900;">\${(() => {
                                            try {
                                                const d = new Date(session.started_at || session.created_at);
                                                if (isNaN(d.getTime())) return 'S/F';
                                                return d.toLocaleDateString('es-ES', {weekday:'long', day:'numeric', month:'long'}).toUpperCase();
                                            } catch(e) {
                                                return 'S/F';
                                            }
                                        })()}</span>
                                        <span style="font-size:0.7rem; color:var(--muted); font-weight:800; display:flex; gap:12px; margin-top:2px; flex-wrap:wrap;">
                                            <span>📢 CONVOCATORIA: <b style="color:#6366f1;">\${session.convocation_time || '00:00'} H</b></span>
                                            <span>🚀 INICIO: <b style="color:white;">\${session.event_start_time || '00:00'} H</b></span>
                                        </span>
                                    </span>
                                </div>
                                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-top:15px; width:100%;">
                                    <div style="font-size:0.7rem; color:var(--muted); font-weight:800; text-transform:uppercase; display:flex; flex-direction:column; gap:4px;">
                                        <span style="color:var(--muted); font-size:0.6rem; font-weight:800; letter-spacing:0.5px;">👤 CLIENTE / CONTACTO</span>
                                        <span style="color:white; font-size:0.8rem; font-weight:700;">\${(session.contact_name || session.client || 'NO ESPECIFICADO').toUpperCase()}</span>
                                    </div>
                                    <div style="font-size:0.7rem; color:var(--muted); font-weight:800; text-transform:uppercase; display:flex; flex-direction:column; gap:4px;">
                                        <span style="color:var(--muted); font-size:0.6rem; font-weight:800; letter-spacing:0.5px;">🏁 FINALIZACIÓN ESTIMADA</span>
                                        <span style="color:white; font-size:0.8rem; font-weight:700;">
                                            \${(() => {
                                                try {
                                                    if (!session.event_end_date) return 'NO ESPECIFICADA';
                                                    const d = new Date(session.event_end_date + 'T00:00:00');
                                                    if (isNaN(d.getTime())) return 'NO ESPECIFICADA';
                                                    const datePart = d.toLocaleDateString('es-ES', {weekday:'long', day:'numeric', month:'long'}).toUpperCase();
                                                    const timePart = session.event_end_time ? \\\` - \\\${session.event_end_time} H\\\` : '';
                                                    return \\\`\\\${datePart}\\\${timePart}\\\`;
                                                } catch(e) {
                                                    return 'NO ESPECIFICADA';
                                                }
                                            })()}
                                        </span>
                                    </div>
                                </div>
                                <div style="font-size:0.7rem; color:var(--muted); font-weight:800; text-transform:uppercase; margin-top:12px; display:flex; flex-direction:column; gap:4px; max-width:100%; word-break:break-word;">
                                    <span style="color:var(--muted); font-size:0.6rem; font-weight:800; letter-spacing:0.5px;">📍 DIRECCIÓN</span>
                                    \${session.address ? \\\`
                                        <a href="https://www.google.com/maps/search/?api=1&query=\\\${encodeURIComponent(session.address)}" target="_blank" style="color:var(--accent); text-decoration:none; font-weight:bold; font-size:0.75rem; border-bottom:1px dashed var(--accent); align-self:flex-start; line-height:1.2;">
                                            \\\${session.address.toUpperCase()} 🔗
                                        </a>
                                    \\\` : '<span style="color:var(--muted); font-style:italic; font-size:0.7rem;">NO ESPECIFICADA</span>'}
                                </div>
                            </div>
                        </div>
 
                        <div style="border-top:1px solid var(--border); padding-top:20px; margin-top:20px;">
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:15px;">
                                <i style="font-size:1.1rem; opacity:0.6;">📋</i>
                                <span style="font-size:0.75rem; color:var(--muted); font-weight:800; text-transform:uppercase; letter-spacing:1px;">Control de Personal</span>
                            </div>
                            
                            <div class="scheduled-staff-grid">
                                \${(() => {
                                    if (sessionStaff.length > 0) {
                                        return sessionStaff.map(u => {

                                            const isSupervisor = u.id == session.supervisor_id || ['supervisor', 'director'].includes(String(u.role).toLowerCase());
                                            const hasApiKey = !!u.callmebot_api_key;
                                            return \\\`
                                                <div class="admin-globo" style="width:100%; display:flex; justify-content:space-between; align-items:center; padding:12px 18px; box-sizing:border-box; border-radius:18px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); gap:10px;">
                                                    <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
                                                        <div style="font-size:0.82rem; font-weight:900; color:white; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:flex; align-items:center;">
                                                            \\\${u.name.toUpperCase()}
                                                            \\\${isSupervisor ? \\\`
                                                                <span style="font-size:0.55rem; background:rgba(99,102,241,0.12); color:#6366f1; padding:2px 6px; border-radius:6px; margin-left:8px; font-weight:900; border:1px solid rgba(99,102,241,0.25); letter-spacing:0.5px; text-transform:uppercase; flex-shrink:0;">
                                                                    SUPERVISOR
                                                                </span>
                                                            \\\` : ''}
                                                        </div>
                                                    </div>
                                                    <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                                                        \\\${hasApiKey ? \\\`
                                                            <button class="btn btn-sm btn-primary" class="btn btn-sm" style="background:#0088cc; color:white; border:none; padding:6px 12px; font-size:0.65rem; font-weight:900; border-radius:8px; display:flex; align-items:center; gap:4px; cursor:pointer;" onclick="triggerTelegramConvocation(\\\${u.id}, '\\\${u.name}', '\\\${session.name}', '\\\${session.convocation_time || ''}', '\\\${session.event_start_time || ''}', '\\\${session.event_end_time || ''}', '\\\${session.address || ''}')" title="Notificar por Telegram (Directo)" style="padding:6px 12px; font-size:0.65rem; font-weight:900; border-radius:8px; display:flex; align-items:center; gap:4px; cursor:pointer;">
                                                                📲 AUTO
                                                            </button>
                                                        \\\` : ''}
                                                        <button class="btn btn-sm btn-secondary" onclick="openDirectConvocationLink('\\\${u.name}', '\\\${u.phone || ''}', '\\\${session.name}', '\\\${session.convocation_time || ''}', '\\\${session.event_start_time || ''}', '\\\${session.event_end_time || ''}', '\\\${session.address || ''}')" title="Enviar enlace de Telegram pre-redactado" style="padding:6px 10px; font-size:0.75rem; font-weight:900; border-radius:8px; display:flex; align-items:center; justify-content:center; background:rgba(34, 197, 94, 0.12); color:#22c55e; border:1px solid rgba(34, 197, 94, 0.3); cursor:pointer;">
                                                            💬
                                                        </button>
                                                    </div>
                                                </div>
                                            \\\`;
                                        }).join('');
                                    }
                                    return '<div style="font-size:0.65rem; color:var(--muted); font-style:italic; text-align:center; padding:20px;">SIN PERSONAL ASIGNADO</div>';
                                })()}
                            </div>
                        </div>
                    </div>
                </div>
            \`;
        } catch (e) {
            console.error('Render Guardia Error:', e);
            el.innerHTML = '<div style="color:var(--danger); padding:20px;">ERROR AL CARGAR DETALLES</div>';
        }
    }
`;

html = html.replace(targetLine, insertion + "\n" + targetLine);
fs.writeFileSync('frontend/index.html', html);
console.log('Done inserting functions.');
