const fs = require('fs');
let html = fs.readFileSync('frontend/index.html', 'utf8');

const oldRenderAccessControl = `    function renderAccessControl(el) {
        if (!el) return;
        
        const activeSessions = (window.allSessions || []).filter(s => s.status === 'active' && s.type && s.type.toUpperCase().includes('ACCESOS'));
        let session = null;
        if (window.currentAccesosSessionId) {
            session = activeSessions.find(s => s.id === window.currentAccesosSessionId);
        }
        if (!session && activeSessions.length > 0) {
            session = activeSessions[0];
            window.currentAccesosSessionId = session.id;
        }

        if (!session) {
            renderAccessControlPresentation(el);
            return;
        }

        el.innerHTML = '<div style="padding: 40px; text-align:center; color:var(--muted);">Cargando módulo de operación...</div>';

        apiFetch(\`/api/accesos/\${session.id}/guests\`).then(res => {
            let guests = [];
            if (res && res.success) guests = res.data;
            window._currentAccessGuests = guests;
            renderAccessControlDashboard(el, session, guests);
        });
    }`;

const newRenderAccessControl = `    function renderAccessControl(el) {
        if (!el) return;
        
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const isAdmin = isUserAdminOrStaff(user) || user.profile_admin === 'DIRECTOR' || user.profile_admin === 'COORDINADOR';

        let filteredSessions = (window.allSessions || []).filter(s => {
            const isAcceso = s.type && s.type.toUpperCase().includes('ACCESOS');
            if (!isAcceso) return false;
            if (s.status !== 'active' && s.status !== 'planning') return false;
            
            if (isAdmin) return true;
            return s.assigned_staff_list && s.assigned_staff_list.some(staff => staff.id == user.id);
        });

        if (filteredSessions.length === 0) {
            renderAccessControlPresentation(el);
            return;
        }

        let session = null;
        if (window.currentAccesosSessionId) {
            session = filteredSessions.find(s => s.id === window.currentAccesosSessionId);
        }
        if (!session && filteredSessions.length > 0) {
            session = filteredSessions[0];
            window.currentAccesosSessionId = session.id;
        }

        // Si la sesión elegida no es válida, tomar la primera
        if (!session) {
            session = filteredSessions[0];
            window.currentAccesosSessionId = session.id;
        }

        // --- Render UI ---
        // Selector Header
        const headerHtml = \`
            <div id="access-control-view" style="animation: fadeIn 0.3s ease;">
                <div class="view-header" style="justify-content: center; text-align: center; margin-bottom: 20px;">
                    <h1 class="view-title" style="color:#a855f7; font-size: 1.8rem; letter-spacing: 1px;">🆔 CONTROL DE ACCESOS 🚧</h1>
                </div>

                <!-- SELECTOR DE EVENTO -->
                <div class="stat-card" style="margin-bottom: 20px; max-width: 500px; margin-left: auto; margin-right: auto; background: rgba(255,255,255,0.03); border: 1px solid var(--border); padding: 12px;">
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <label style="font-size: 0.6rem; color: var(--muted); font-weight: 800; letter-spacing: 1px;">EVENTO SELECCIONADO</label>
                        <select onchange="window.currentAccesosSessionId = parseInt(this.value); renderAccessControl(document.getElementById('current-view'));" 
                            style="width: 100%; background: var(--surface2); border: 1px solid var(--border); padding: 8px; border-radius: 10px; color: #fff; font-weight: 700; font-size: 0.8rem;">
                            \${filteredSessions.map(s => 
                                \`<option value="\${s.id}" \${session.id == s.id ? 'selected' : ''} style="color:\${s.status === 'active' ? 'var(--success)' : 'var(--warning)'};">
                                    \${s.name.toUpperCase()} (\${s.status === 'active' ? 'ACTIVO' : 'PLANIFICADO'})
                                </option>\`
                            ).join('')}
                        </select>
                    </div>
                </div>
        \`;

        if (session.status === 'planning') {
            const schedDate = new Date(session.started_at || session.created_at);
            const diffMs = schedDate.getTime() - Date.now();
            const diffHoursTotal = diffMs / (1000 * 60 * 60);

            const isAuthorizedSupervisor = (user && (
                user.id === session.supervisor_id || 
                user.role === 'director' ||
                user.profile_admin === 'DIRECTOR' ||
                user.profile_admin === 'COORDINADOR' ||
                isUserAdminOrStaff(user)
            ));

            let actionHtml = '';
            if (isAuthorizedSupervisor) {
                actionHtml = \`
                    <div style="margin-top:20px;">
                        <button class="btn" style="background:var(--success); color:white; width:100%; padding:18px; border-radius:16px; font-weight:900; font-size:1rem; box-shadow: 0 10px 20px rgba(34, 197, 94, 0.2);" onclick="activatePlannedSession(\${session.id})">🚀 INICIAR OPERACIÓN AHORA</button>
                    </div>
                \`;
            } else {
                actionHtml = \`
                    <div style="margin-top:20px; border-top:1px solid rgba(255,255,255,0.05); padding-top:15px; text-align:center;">
                        <div style="font-size:0.8rem; font-weight:900; color:var(--warning); margin-bottom:5px;">🕒 ESPERANDO INICIO DE OPERACIÓN</div>
                        <div style="font-size:0.6rem; color:var(--muted); font-weight:700;">EL SUPERVISOR O ADMINISTRADOR DEBE INICIAR EL EVENTO PARA PODER EMPEZAR.</div>
                    </div>
                \`;
            }

            el.innerHTML = headerHtml + \`
                <div class="stat-card" style="margin: 20px auto; max-width: 500px; text-align:center; background:rgba(245, 158, 11, 0.05); border:1px solid var(--warning); padding:25px; border-radius:24px;">
                    <i style="font-size:2.5rem; display:block; margin-bottom:15px;">🕒</i>
                    <h2 style="color:var(--warning); margin:0 0 5px 0; font-size:1.2rem; font-weight:900;">EVENTO PLANIFICADO</h2>
                    <div style="font-size:1.1rem; font-weight:900; color:#fff; margin-bottom:15px; text-transform:uppercase; letter-spacing:0.5px;">\${session.name}</div>
                    <p style="font-size:0.7rem; color:var(--muted); margin-bottom:20px; font-weight:700;">EL EVENTO ESTÁ EN LISTA PERO AÚN NO HA INICIADO OPERATIVAMENTE.</p>
                    
                    <div style="margin-top:15px; border-top:1px solid rgba(255,255,255,0.05); padding-top:15px;">
                        <div style="font-size:0.6rem; color:var(--muted); font-weight:800; letter-spacing:1px; margin-bottom:5px;">EL EVENTO ESTÁ PROGRAMADO PARA EL DÍA:</div>
                        <div style="font-size:1.1rem; font-weight:900; color:var(--accent);">\${formatDateExplicit(schedDate)} A LAS \${session.event_start_time || '00:00'}</div>
                        \${actionHtml}
                    </div>
                </div>
            </div>\`;
        } else {
            // Es activo
            el.innerHTML = headerHtml + '<div id="ac-dashboard-container" style="padding: 20px; text-align:center; color:var(--muted);">Cargando módulo de operación...</div></div>';
            
            apiFetch(\`/api/accesos/\${session.id}/guests\`).then(res => {
                let guests = [];
                if (res && res.success) guests = res.data;
                window._currentAccessGuests = guests;
                renderAccessControlDashboard(document.getElementById('ac-dashboard-container'), session, guests);
            });
        }
    }`;

if (html.includes(oldRenderAccessControl)) {
    html = html.replace(oldRenderAccessControl, newRenderAccessControl);
} else {
    console.log('No se encontro el codigo antiguo exacto. Intentando un reemplazo manual...');
}

// Ahora modificar renderAccessControlDashboard para quitar su header, porque ya lo pusimos en renderAccessControl
// El dashboard de Control de Accesos inicia con <div id="access-control-view" style="animation: fadeIn 0.3s ease;"> y el h1.
const oldDashboardHeader = \`            <div id="access-control-view" style="animation: fadeIn 0.3s ease;">
                <div class="view-header" style="justify-content: center; text-align: center; margin-bottom: 30px;">
                    <h1 class="view-title" style="color:#a855f7; font-size: 1.8rem; letter-spacing: 1px;">🆔 CONTROL DE ACCESOS: \${session.name.toUpperCase()} 🚧</h1>
                </div>\`;

const newDashboardHeader = \`            <div style="animation: fadeIn 0.3s ease;">\`;

if (html.includes(oldDashboardHeader)) {
    html = html.replace(oldDashboardHeader, newDashboardHeader);
}

fs.writeFileSync('frontend/index.html', html);
console.log('Cambios aplicados exitosamente a renderAccessControl');
