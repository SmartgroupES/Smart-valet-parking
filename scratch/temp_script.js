    // --- CONFIG & STATE ---
    const API_BASE = window.location.origin;
    const VERSION_TAG = "V2.2.28 25/04/26 18:00";
    let currentStaff = { id: 1, name: 'Director Valet', role: 'director' };
    let vehicles = [];
    let settings = { currency: '$', company_name: 'EYE STAFF' };
    let currentTab = 'portal';


    // --- INACTIVITY REDIRECT LOGIC (10s) ---
    let inactivityTimeout;

    function resetInactivityTimer() {
        clearTimeout(inactivityTimeout);
        
        // Vistas operativas que deben retornar al menú tras inactividad
        const operationalTabs = ['eventos', 'resumen', 'checkin', 'checkout'];
        
        if (operationalTabs.includes(currentTab)) {
            inactivityTimeout = setTimeout(async () => {
                if (currentTab !== 'home' && currentTab !== 'valet-menu') {
                    await smoothTransition(() => showTab('home'));
                    toast('RETORNO AL MENÚ POR INACTIVIDAD', 'info');
                }
            }, 10000); // 10 segundos
        }
    }


    async function smoothTransition(callback) {
        const overlay = document.getElementById('fade-overlay');
        overlay.classList.add('active');
        await new Promise(r => setTimeout(r, 600));
        if (callback) callback();
        await new Promise(r => setTimeout(r, 200));
        overlay.classList.remove('active');
    }

    // --- REAL-TIME TRACKING LOGIC ---
    let watchId = null;
    let isTracking = false;

    async function toggleTracking() {
        if (!isTracking) {
            if (!navigator.geolocation) return toast('Geolocation no soportada', 'error');
            
            showLoading('ACTIVANDO RASTREO...');
            watchId = navigator.geolocation.watchPosition(
                async (pos) => {
                    const { latitude, longitude, accuracy } = pos.coords;
                    const userId = localStorage.getItem('userId') || 1; // Default to 1 for tests
                    
                    // Actualizar UI
                    const statusText = document.getElementById('tracking-status-text');
                    if (statusText) {
                        statusText.innerHTML = `COMPARTIENDO UBICACIÓN ACTIVAMENTE <br><span style="color:var(--success); font-weight:900;">PRECISIÓN: ${Math.round(accuracy)}m</span>`;
                    }

                    await apiFetch('/api/locations/update', {
                        method: 'POST',
                        body: JSON.stringify({
                            entity_id: parseInt(userId),
                            entity_type: 'staff',
                            latitude,
                            longitude,
                            accuracy
                        })
                    }, true); // Silent update

                    document.getElementById('tracking-pulse').style.display = 'inline-block';
                    document.getElementById('btn-tracking').innerText = 'DETENER';
                    document.getElementById('btn-tracking').style.background = 'var(--danger)';
                    isTracking = true;
                },
                (err) => {
                    console.error('GPS Error:', err);
                    hideLoading();
                    let msg = 'Error GPS: ' + err.message;
                    if (err.code === 1) msg = '⚠️ PERMISO DENEGADO: Por favor activa el GPS en tu navegador';
                    toast(msg, 'error');
                    
                    const statusText = document.getElementById('tracking-status-text');
                    if (statusText) {
                        statusText.innerHTML = `<span style="color:var(--danger); font-weight:800;">${msg}</span>`;
                    }
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
            hideLoading();
        } else {
            if (watchId) navigator.geolocation.clearWatch(watchId);
            document.getElementById('tracking-pulse').style.display = 'none';
            document.getElementById('btn-tracking').innerText = 'ACTIVAR';
            document.getElementById('btn-tracking').style.background = 'var(--accent)';
            isTracking = false;
            
            const statusText = document.getElementById('tracking-status-text');
            if (statusText) {
                statusText.innerText = 'DESACTIVADO (USAR DURANTE TRASLADOS)';
            }
            toast('RASTREO DESACTIVADO', 'info');
        }
    }


    // --- INITIALIZATION ---
    window.onload = async () => {
        // 1. UI Inmediato
        updateFooterInfo();
        initScreenSaver();
        exitToPortal(); 
        
        console.log('EYE STAFF v2.2.28 Initialized');
        
        // 2. Cache Kill
        try {
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
            }
            if ('caches' in window) {
                caches.keys().then(names => names.forEach(n => caches.delete(n)));
            }
        } catch(e) {}

        const splash = document.getElementById('splash-screen');
        if (splash) splash.style.display = 'flex';
        
        // 3. Auth
        if (!localStorage.getItem('token')) {
            localStorage.setItem('token', 'master-bypass-token');
        }
        
        const loginView = document.getElementById('login-view');
        if (loginView) loginView.style.display = 'none';

        // 4. Data (Non-blocking)
        loadSettings().then(() => checkActiveSession()).catch(e => console.error('Data error:', e));
        
        // 5. Hide Splash
        setTimeout(() => {
            if (splash) {
                splash.style.opacity = '0';
                setTimeout(() => splash.style.display = 'none', 500);
            }
        }, 800);
    };

    async function handleLogin() {
        const pin = document.getElementById('login-pin').value;
        if (!pin) return toast('INGRESE PIN', 'error');
        
        try {
            const res = await fetch(API_BASE + '/api/staff/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin })
            });
            const data = await res.json();
            
            if (res.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data));
                location.reload(); // Recargar para inicializar todo
            } else {
                toast(data.error || 'PIN INCORRECTO', 'error');
            }
        } catch (e) {
            toast('ERROR DE CONEXIÓN', 'error');
        }
    }


    function updateFooterInfo() {
        document.querySelectorAll('.footer-info').forEach(el => {
            el.textContent = `EYE STAFF COPYRIGHT 2026 - ${VERSION_TAG}`;
        });
    }

    function enterModule(module) {
        const view = document.getElementById('current-view');
        const btn = document.getElementById('btn-back-portal');
        btn.style.display = 'flex';
        btn.innerHTML = '🏠';
        btn.onclick = exitToPortal;
        
        if (module === 'valet') {
            const valetSessions = (window.activeSessions || []).filter(s => (s.type === 'valet' || !s.type) && s.status === 'active');
            if (valetSessions.length === 1) {
                window.activeSession = valetSessions[0];
                localStorage.setItem('selectedSessionId', valetSessions[0].id);
            }
            renderHome(view);
        } else if (module === 'hr') {
            showTab('staff');
        } else if (module === 'eventos') {
            renderEventsDashboard(view);
        } else if (module === 'accesos' || module === 'renta' || module === 'formatos' || module === 'eyekids' || module === 'xpress' || module === 'ranking') {
            const pass = prompt('INTRODUZCA CLAVE DE ACCESO (MÓDULO EN DESARROLLO):');
            if (pass === '1234') {
                if (module === 'accesos') renderAccessControl(view);
                else if (module === 'renta') renderRentaEquipos(view);
                else if (module === 'formatos') renderFormatos(view);
                else {
                    toast('🚀 MÓDULO EN DESARROLLO - PRÓXIMAMENTE', 'info');
                }
            } else if (pass !== null) {
                toast('❌ CLAVE INCORRECTA', 'error');
            }
        } else if (module === 'monitoreo') {
            renderMonitoring(view);
        }
    }



    function showSessionPicker(type) {
        const sessions = window.activeSessions.filter(s => (s.type === type || (!s.type && type === 'valet')) && s.status === 'active');
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:400px; text-align:center; background:var(--surface2); border:1px solid var(--border); box-shadow: 0 20px 50px rgba(0,0,0,0.5);">
                <h2 style="margin-bottom:20px; font-size:1.2rem; color:var(--brand-white); letter-spacing:1px;">SELECCIONE EVENTO ACTIVO</h2>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${sessions.map(s => `
                        <button class="btn" style="padding:15px; text-align:left; display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); border:1px solid var(--border);" onclick="selectSession(${s.id}, '${type}')">
                            <span style="font-weight:700;">${s.name}</span>
                            <span style="font-size:0.7rem; opacity:0.6;">ID: ${s.id}</span>
                        </button>
                    `).join('')}
                    <hr style="border:0; border-top:1px solid var(--border); margin:15px 0; opacity:0.3;">
                    <button class="btn" style="background:var(--success); color:white; font-weight:800;" onclick="selectSession('new', '${type}')">+ INICIAR OTRO EVENTO</button>
                    <button class="btn btn-secondary" onclick="this.closest('.modal').remove()" style="margin-top:10px;">CANCELAR</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    window.selectSession = async function(id, type) {
        document.querySelector('.modal')?.remove();
        if (id === 'new') {
            window.activeSession = null;
            localStorage.removeItem('selectedSessionId');
            if (type === 'valet') renderHome(document.getElementById('current-view'));
            if (type === 'eventos') renderEventsDashboard(document.getElementById('current-view'));
        } else {
            const session = window.activeSessions.find(s => s.id == id);
            window.activeSession = session;
            localStorage.setItem('selectedSessionId', id);
            if (type === 'valet') renderHome(document.getElementById('current-view'));
            if (type === 'eventos') renderEventsDashboard(document.getElementById('current-view'));
        }
        await checkActiveSession(); // Refrescar conteos y UI
    }

    function exitToPortal() {
        const view = document.getElementById('current-view');
        document.getElementById('btn-back-portal').style.display = 'none';
        renderPortal(view);
    }

    function renderPortal(el) {
        if (!el) return;
        
        // Calcular estado de Valet Parking
        const valetSessions = (window.activeSessions || []).filter(s => (s.type === 'valet' || !s.type) && s.status === 'active');
        let valetStatus = 'GESTIÓN VEHÍCULOS';
        const hasPulse = valetSessions.length > 0 ? '<span class="status-pulse"></span>' : '';
        if (valetSessions.length > 1) valetStatus = `${hasPulse}<b>${valetSessions.length}</b> EVENTOS ACTIVOS`;
        else if (valetSessions.length === 1) valetStatus = `${hasPulse}<b>${window.activeVehiclesCount || 0}</b> VEHÍCULOS ACTIVOS`;

        el.innerHTML = `
            <div id="portal-view">
                <div class="view-header" style="text-align: center; display: block; margin-bottom: 20px;">
                    <h1 class="view-title" style="font-size: 2.4rem; letter-spacing: -1px; color:var(--brand-white);">¡PASIÓN POR LOS <span style="color:var(--brand-red)">EVENTOS!</span></h1>
                </div>

                <!-- SECCIÓN DE RASTREO RÁPIDO -->
                <div style="background:var(--surface2); border:1px solid var(--border); padding:15px; border-radius:20px; display:flex; align-items:center; justify-content:space-between; margin-bottom:30px; box-shadow: 0 10px 30px rgba(0,0,0,0.2);">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span id="tracking-pulse" class="status-pulse" style="display:${isTracking ? 'inline-block' : 'none'};"></span>
                        <div>
                            <div style="font-size:0.75rem; font-weight:800; color:white;">📍 RASTREO EN TIEMPO REAL</div>
                            <div id="tracking-status-text" style="font-size:0.55rem; color:var(--muted); text-transform:uppercase; letter-spacing:1px; margin-top:2px; line-height:1.2;">
                                ${isTracking ? 'COMPARTIENDO UBICACIÓN ACTIVAMENTE' : 'DESACTIVADO (USAR DURANTE TRASLADOS)'}
                            </div>
                        </div>
                    </div>
                    <button id="btn-tracking" class="btn btn-sm" onclick="toggleTracking()" style="background:${isTracking ? 'var(--danger)' : 'var(--accent)'}; font-size:0.65rem; padding:8px 15px; border-radius:12px; font-weight:800;">
                        ${isTracking ? 'DETENER' : 'ACTIVAR'}
                    </button>
                </div>

                <!-- SECCIÓN 1: SERVICIOS -->
                <div style="margin-bottom: 40px;">
                    <h2 style="font-size: 0.9rem; color: var(--muted); margin-bottom: 15px; border-bottom: 1px solid var(--border); padding-bottom: 8px; letter-spacing: 2px;">SERVICIOS</h2>
                    <div class="menu-grid" style="margin-top:0;">
                        <!-- VALET PARKING -->
                        <div class="menu-item" onclick="enterModule('valet')" style="border-top: 4px solid var(--brand-red); background: rgba(239, 68, 68, 0.05);">
                            <i style="font-size:2rem">🚗</i>
                            <div class="menu-item-content">
                                <span class="menu-item-title" style="font-size:1rem;">VALET PARKING</span>
                                <span class="menu-item-desc" style="font-size:0.6rem;">${valetStatus}</span>
                            </div>
                        </div>
                        <!-- CONTROL DE ACCESOS -->
                        <div class="menu-item disabled" style="opacity:0.3; filter:grayscale(1);">
                            <i style="font-size:2rem">🆔</i>
                            <div class="menu-item-content">
                                <span class="menu-item-title" style="font-size:1rem;">CONTROL DE ACCESOS</span>
                                <span class="menu-item-desc" style="font-size:0.6rem;">PRÓXIMAMENTE</span>
                            </div>
                        </div>
                        <!-- RENTA EQUIPOS -->
                        <div class="menu-item disabled" style="opacity:0.3; filter:grayscale(1);">
                            <i style="font-size:2rem">🏗️</i>
                            <div class="menu-item-content">
                                <span class="menu-item-title" style="font-size:1rem;">RENTA EQUIPOS</span>
                                <span class="menu-item-desc" style="font-size:0.6rem;">PRÓXIMAMENTE</span>
                            </div>
                        </div>
                        <!-- EYE KIDS -->
                        <div class="menu-item" onclick="enterModule('eyekids')" style="border-top: 4px solid #60a5fa; background: rgba(96, 165, 250, 0.05);">
                            <i style="font-size:2rem">🧸</i>
                            <div class="menu-item-content">
                                <span class="menu-item-title" style="font-size:1rem;">EYE KIDS</span>
                                <span class="menu-item-desc" style="font-size:0.6rem;">CUIDADO INFANTIL</span>
                            </div>
                        </div>
                        <!-- XPRESS PROTECTION -->
                        <div class="menu-item" onclick="enterModule('xpress')" style="border-top: 4px solid #94a3b8; background: rgba(148, 163, 184, 0.05);">
                            <i style="font-size:2rem">🛡️</i>
                            <div class="menu-item-content">
                                <span class="menu-item-title" style="font-size:1rem;">XPRESS PROTECTION</span>
                                <span class="menu-item-desc" style="font-size:0.6rem;">PROTECCIÓN Y SEGURO</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- SECCIÓN 2: OPERACIONES -->
                <div>
                    <h2 style="font-size: 0.9rem; color: var(--muted); margin-bottom: 15px; border-bottom: 1px solid var(--border); padding-bottom: 8px; letter-spacing: 2px;">OPERACIONES</h2>
                    <div class="menu-grid" style="margin-top:0;">
                        <!-- EVENTOS -->
                        <div class="menu-item" onclick="enterModule('eventos')" style="border-top: 4px solid var(--warning); background: rgba(245, 158, 11, 0.05);">
                            <i>📊</i>
                            <div class="menu-item-content">
                                <span class="menu-item-title" style="font-size:1rem;">EVENTOS</span>
                                <span class="menu-item-desc" style="font-size:0.6rem; display: block; line-height: 1.4; margin-top: 5px;">
                                    ${(() => {
                                        const active = (window.activeSessions || []).filter(s => s.status === 'active');
                                        if (active.length > 0) {
                                            const list = active.map(s => `<div style="display:flex; align-items:center; gap:5px;"><span class="status-pulse" style="position:static; margin:0;"></span><b>${(s.type || 'Valet').toUpperCase()} ${s.name}</b></div>`).join('');
                                            return list;
                                        }
                                        return 'ESTADÍSTICAS EN VIVO';
                                    })()}
                                </span>
                            </div>
                        </div>
                        <!-- MONITOREO GPS -->
                        <div class="menu-item" onclick="enterModule('monitoreo')" style="border-top: 4px solid var(--accent); background: rgba(99, 102, 241, 0.05);">
                            <i>🛰️</i>
                            <div class="menu-item-content">
                                <span class="menu-item-title" style="font-size:1rem;">MONITOREO</span>
                                <span class="menu-item-desc" style="font-size:0.6rem;">UBICACIÓN EQUIPOS Y STAFF</span>
                            </div>
                        </div>
                        <!-- RANKING DE EMPLEADOS -->
                        <div class="menu-item" onclick="enterModule('ranking')" style="border-top: 4px solid #fbbf24; background: rgba(251, 191, 36, 0.05);">
                            <i>🏆</i>
                            <div class="menu-item-content">
                                <span class="menu-item-title" style="font-size:1rem;">RANKING EMPLEADOS</span>
                                <span class="menu-item-desc" style="font-size:0.6rem;">METAS Y DESEMPEÑO</span>
                            </div>
                        </div>
                        <!-- ADMINISTRACIÓN (RRHH) -->
                        <div class="menu-item" onclick="enterModule('hr')" style="border-top: 4px solid #6366f1; background: rgba(99, 102, 241, 0.05);">
                            <i>⚙️</i>
                            <div class="menu-item-content">
                                <span class="menu-item-title" style="font-size:1rem;">ADMINISTRACIÓN</span>
                                <span class="menu-item-desc" style="font-size:0.6rem;">CONTROL GENERAL</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="footer-info" style="margin-top: 60px;"></div>
            </div>
        `;
        updateFooterInfo();
    }

    // --- SCREEN SAVER LOGIC ---
    let idleTime = 0;
    let currentPattern = [];
    let isDrawing = false;
    const SAVED_PATTERN = "012"; // Default pattern, could be fetched from API

    function initScreenSaver() {
        document.onmousemove = document.onkeypress = document.ontouchstart = () => {
            idleTime = 0;
            resetInactivityTimer();
        };
        setInterval(() => {
            idleTime++;
            if (idleTime >= 300) { // 5 minutes inactivity
                document.getElementById('screensaver').style.display = 'flex';
            }
        }, 1000);
    }

    function hideScreenSaver() {
        document.getElementById('screensaver').style.display = 'none';
        idleTime = 0;
    }

    async function checkActiveSession() {
        const res = await apiFetch('/api/sessions/active');
        const sessions = (res && res.sessions) ? res.sessions : [];
        window.activeSessions = sessions;
        
        // Intentar recuperar sesión seleccionada previamente
        const savedId = localStorage.getItem('selectedSessionId');
        let session = sessions.find(s => s.id == savedId && s.status === 'active');
        
        // Si no hay guardada o no es válida, tomar la primera activa si existe
        if (!session) {
            session = sessions.find(s => s.status === 'active');
            if (session) localStorage.setItem('selectedSessionId', session.id);
        }

        window.activeSession = session;
        const display = document.getElementById('active-session-display');
        
        if (session) {
            if (display) {
                display.textContent = session.name;
                display.style.display = 'block';
            }
            
            // Cargar conteo de vehículos activos para la sesión seleccionada
            const vRes = await apiFetch('/api/vehicles/active?session_id=' + session.id);
            window.activeVehiclesCount = vRes ? (vRes.vehicles || []).length : 0;
        } else {
            window.activeVehiclesCount = 0;
            if (display) display.style.display = 'none';
        }

        // Actualizar habilitación de botones de menú si existen
        if (document.getElementById('menu-checkin')) {
            const hasAnyActive = sessions.some(s => s.status === 'active');
            if (hasAnyActive) {
                document.getElementById('menu-checkin').classList.remove('disabled');
                document.getElementById('menu-eventos').classList.remove('disabled');
            } else {
                document.getElementById('menu-checkin').classList.add('disabled');
                document.getElementById('menu-eventos').classList.add('disabled');
            }
        }

        // Si estamos en el portal, refrescar para mostrar estado actual
        if (document.getElementById('portal-view')) {
            renderPortal(document.getElementById('current-view'));
        }
    }

    // NAVIGATION
    async function showTab(tab) {
        currentTab = tab;
        resetInactivityTimer();
        const view = document.getElementById('current-view');
        const btn = document.getElementById('btn-back-portal');
        
        if (tab === 'home' || tab === 'valet-menu') {
            await renderHome(view);
            btn.innerHTML = '🏠';
            btn.onclick = exitToPortal;
            return;
        }

        // Si entramos a una sub-vista, el botón de arriba debe volver al menú del módulo
        btn.innerHTML = '🏠 MENÚ';
        btn.onclick = () => showTab('home');

        // Bloqueo de seguridad: No permitir operar si no hay evento activo
        const operationalTabs = ['checkin', 'eventos', 'resumen'];
        if (operationalTabs.includes(tab) && !window.activeSession) {
            toast('⚠️ DEBE INICIAR UN EVENTO EN ADMIN PARA OPERAR', 'warning');
            return;
        }

        // Renderizar la vista correspondiente
        switch(tab) {
            case 'checkin': renderCheckin(view); break;
            case 'eventos': renderEvents(view); break;
            case 'checkout': renderCheckout(view); break;
            case 'resumen': renderResumen(view); break;
            case 'admin': renderAdmin(view); break;
            case 'staff': renderStaff(view); break;
        }
    }

    async function renderHome(el) {
        document.getElementById('btn-back-portal').style.display = 'flex';
        el.innerHTML = `
            <div id="home-view">
                <div class="view-header" style="justify-content: center; text-align: center; margin-bottom:10px;">
                    <h1 class="view-title">MENÚ VALET PARKING</h1>
                </div>

                <!-- SELECTOR DE EVENTO SUPERIOR -->
                <div style="display:flex; flex-direction:column; align-items:center; gap:10px; margin-bottom:25px;">
                    <div style="background:var(--surface2); border:1px solid var(--border); padding:8px 20px; border-radius:40px; display:flex; align-items:center; gap:15px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); min-width:320px; max-width:90%; justify-content:center;">
                        <span class="status-pulse"></span>
                        <div style="flex:1; display:flex; flex-direction:column; min-width:140px;">
                            <label style="font-size:0.55rem; color:var(--muted); margin-bottom:0; font-weight:800; letter-spacing:0.5px; text-align:left;">EVENTO SELECCIONADO</label>
                            <select onchange="selectSession(this.value, 'valet')" style="background:transparent; border:none; color:#fff; font-weight:900; font-size:1.1rem; cursor:pointer; padding:0; width:100%; outline:none;">
                                ${!window.activeSession ? '<option value="" selected disabled>— SELECCIONE —</option>' : ''}
                                ${(window.activeSessions || []).filter(s => (s.type === 'valet' || !s.type) && s.status === 'active').map(s => `
                                    <option value="${s.id}" ${window.activeSession && window.activeSession.id == s.id ? 'selected' : ''}>
                                        ${s.name.toUpperCase()}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        ${window.activeSession ? `
                        <div style="border-left:1px solid var(--border); padding-left:15px; text-align:right;">
                            <div style="font-size:0.55rem; color:var(--muted); font-weight:800;">CUSTODIA</div>
                            <div style="font-size:1.3rem; font-weight:900; color:var(--success); line-height:1;" id="header-custody-count">${window.activeVehiclesCount || 0}</div>
                        </div>
                        ` : ''}
                    </div>
                </div>

                <div class="menu-grid" style="grid-template-columns: repeat(3, 1fr); max-width: 1000px; margin: 20px auto;">
                    <div id="menu-checkin" class="menu-item ${!window.activeSession ? 'disabled' : ''}" onclick="${window.activeSession ? "showTab('checkin')" : "toast('⚠️ SELECCIONE UN EVENTO ACTIVO', 'warning')"}" style="${!window.activeSession ? 'opacity:0.4; cursor:not-allowed;' : ''}">
                        <i>🚗</i>
                        <div class="menu-item-content">
                            <span class="menu-item-title">RECEPCIÓN</span>
                            <span class="menu-item-desc">INGRESAR VEHÍCULO</span>
                        </div>
                    </div>
                    
                    <div id="menu-eventos" class="menu-item ${!window.activeSession ? 'disabled' : ''}" onclick="${window.activeSession ? "showTab('eventos')" : ""}" style="${!window.activeSession ? 'opacity:0.4; cursor:not-allowed;' : ''}">
                        <i>📊</i>
                        <div class="menu-item-content">
                            <span class="menu-item-title">CUSTODIA <span id="custody-count-inline" style="color:var(--success); margin-left:5px; font-weight:900;"></span></span>
                            <span class="menu-item-desc">VEHÍCULOS EN RECINTO</span>
                        </div>
                    </div>

                    <div id="menu-resumen" class="menu-item ${!window.activeSession ? 'disabled' : ''}" onclick="${window.activeSession ? "showTab('resumen')" : ""}" style="${!window.activeSession ? 'opacity:0.4; cursor:not-allowed;' : ''}">
                        <i>📋</i>
                        <div class="menu-item-content">
                            <span class="menu-item-title">RESUMEN</span>
                            <span class="menu-item-desc">REPORTE Y CIERRE</span>
                        </div>
                    </div>
                </div>


                ${window.activeSession ? `
                <!-- SECCIÓN DE SEGUIMIENTO OPERATIVO -->
                <div class="operational-section">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                        <div>
                            <div style="font-size:0.65rem; color:var(--muted); text-transform:uppercase; font-weight:800; letter-spacing:1px;">📊 Seguimiento Operativo</div>
                            <div style="font-size:0.75rem; color:white; font-weight:700; margin-top:2px;">INICIADO: ${new Date(window.activeSession.started_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                        </div>
                        <button class="btn btn-sm" onclick="showAssignStaffModal(${window.activeSession.id})" style="background:var(--accent); font-size:0.65rem; padding:6px 12px; border-radius:8px; font-weight:800;">+ ASIGNAR PERSONAL</button>
                    </div>

                    <div id="home-staff-list" class="staff-grid">
                        Cargando personal...
                    </div>
                </div>
                
                ` : ''}

                <!-- CONTROL DE JORNADA REUBICADO Y REDUCIDO -->
                <div class="card" style="max-width: 450px; margin: 30px auto 30px auto; border: 1px solid var(--border); padding: 15px; text-align: center; background: rgba(255,255,255,0.03); border-radius: 15px;">
                    <div style="font-size: 0.65rem; color: var(--muted); margin-bottom: 12px; text-transform: uppercase; letter-spacing: 1px;">Gestión de Eventos</div>
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <button class="btn btn-success" 
                                onclick="protectedAction(startNewSession)" 
                                style="flex: 1; height: 38px; font-weight: 800; font-size: 0.75rem;">
                            + INICIAR OTRO
                        </button>
                        <button class="btn btn-danger" 
                                onclick="protectedAction(closeSession)" 
                                style="flex: 1; height: 38px; font-weight: 800; font-size: 0.75rem; ${!window.activeSession ? 'opacity:0.3; pointer-events:none;' : ''}">
                            FINALIZAR ACTUAL
                        </button>
                    </div>
                    ${!window.activeSession ? '<div style="color: var(--warning); font-size: 0.7rem; margin-top: 10px; font-weight: 700;">⚠️ SELECCIONE O INICIE UN EVENTO</div>' : ''}
                </div>

                <div style="display: flex; justify-content: center; margin-top: 20px; padding-bottom: 20px;">
                    <button class="btn btn-secondary" onclick="exitToPortal()" style="border-radius: 30px; padding: 10px 30px; font-size: 0.9rem; font-weight: 800; background: rgba(255,255,255,0.05); border: 1px solid var(--border);">
                        🏠 VOLVER
                    </button>
                </div>

                <div class="footer-info" style="margin-top: 40px;"></div>
            </div>
        `;
        
        updateFooterInfo();
        // Cargar contador de custodia si hay sesión
        if (window.activeSession) {
            updateCustodyCounter();
            loadHomeStaffTracking(window.activeSession.id);
            loadAttendanceStatus();
        }
    }

    function calculateDuration(start, end) {
        if (!start) return '--:--';
        const s = new Date(start);
        const e = new Date(end);
        const diffMs = e - s;
        if (diffMs < 0) return '00:00';
        const diffHrs = Math.floor(diffMs / 3600000);
        const diffMins = Math.floor((diffMs % 3600000) / 60000);
        return `${String(diffHrs).padStart(2, '0')}:${String(diffMins).padStart(2, '0')}`;
    }

    async function loadHomeStaffTracking(sessionId) {
        const staffListEl = document.getElementById('home-staff-list');
        if (!staffListEl) return;

        try {
            const [staffRes, attendance] = await Promise.all([
                apiFetch('/api/staff'),
                apiFetch('/api/attendance/session/' + sessionId)
            ]);

            const allStaff = staffRes?.staff || [];
            const sessionStaff = allStaff.filter(u => u.current_session_id == sessionId);

            // Ya no manipulamos gridTemplateColumns aquí, se maneja por CSS (clase staff-grid)
            
            staffListEl.innerHTML = sessionStaff.map(u => {
                const userLogs = (attendance || []).filter(l => l.user_id === u.id).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
                const lastLog = userLogs[0];
                const lastType = lastLog?.type || 'none';
                
                // Calcular tiempos
                const entries = userLogs.filter(l => l.type === 'entry').sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
                const exits = userLogs.filter(l => l.type === 'exit').sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
                const arrival = entries.length > 0 ? entries[0].timestamp : null;
                const departure = exits.length > 0 ? exits[0].timestamp : null;
                
                const activeTime = arrival ? calculateDuration(arrival, departure || new Date()) : '--:--';

                return `
                <div class="staff-card">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:10px; height:10px; border-radius:50%; background:${u.role === 'supervisor' ? 'var(--warning)' : 'var(--accent)'}; box-shadow:0 0 8px ${u.role === 'supervisor' ? 'var(--warning)' : 'var(--accent)'}"></div>
                        <div style="font-size:0.85rem; font-weight:800; color:white; flex:1;">${u.name.toUpperCase()}</div>
                        <button onclick="unassignStaff(${sessionId}, ${u.id})" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:0.9rem; opacity:0.3; padding:5px;">✕</button>
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:8px;">
                        <button class="btn btn-sm" onclick="logAttendance('entry', ${u.id})" style="font-size:0.55rem; height:32px; background:var(--success); ${(lastType !== 'none' && lastType !== 'exit') ? 'opacity:0.2; pointer-events:none;' : ''}">ENTRADA</button>
                        <button class="btn btn-sm" onclick="logAttendance('${lastType === 'break_start' ? 'break_end' : 'break_start'}', ${u.id})" style="font-size:0.55rem; height:32px; background:var(--warning); ${(lastType === 'none' || lastType === 'exit') ? 'opacity:0.2; pointer-events:none;' : ''}">${lastType === 'break_start' ? 'VUELTA' : 'DESCANSO'}</button>
                        <button class="btn btn-sm" onclick="logAttendance('exit', ${u.id})" style="font-size:0.55rem; height:32px; background:var(--danger); ${(lastType === 'none' || lastType === 'exit' || lastType === 'break_start') ? 'opacity:0.2; pointer-events:none;' : ''}">SALIDA</button>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:6px; border-top:1px solid rgba(255,255,255,0.05); padding-top:10px;">
                        <div style="display:flex; justify-content:space-between; font-size:0.6rem;">
                            <span style="color:var(--muted)">LLEGADA:</span>
                            <span style="color:${arrival ? 'var(--success)' : 'var(--danger)'}; font-weight:800;">${arrival ? new Date(arrival).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--'}</span>
                        </div>
                        
                        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); padding:4px 8px; border-radius:6px; margin:2px 0;">
                            <span style="font-size:0.6rem; color:var(--muted); font-weight:800;">TIEMPO ACTIVO:</span>
                            <span style="font-size:0.8rem; font-weight:900; color:${departure ? 'var(--muted)' : '#fff'}; letter-spacing:1px;">${activeTime}</span>
                        </div>

                        <div style="display:flex; justify-content:space-between; font-size:0.6rem;">
                            <span style="color:var(--muted)">SALIDA:</span>
                            <span style="color:${departure ? 'var(--muted)' : (arrival ? 'var(--warning)' : 'var(--danger)')}; font-weight:800;">${departure ? new Date(departure).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : (arrival ? (lastType === 'break_start' ? 'EN DESCANSO' : 'ACTIVO') : '--:--')}</span>
                        </div>
                    </div>
                </div>
            `; }).join('') || '<div style="font-size:0.65rem; color:var(--muted); text-align:center; padding:20px; grid-column: 1/-1;">Sin personal asignado</div>';

        } catch (e) {
            console.error(e);
            staffListEl.innerHTML = '<div style="font-size:0.6rem; color:var(--danger);">Error al cargar personal</div>';
        }
    }

    async function updateCustodyCounter() {
        if (!window.activeSession) return;
        const stats = await apiFetch('/api/events/stats?session_id=' + window.activeSession.id);
        const count = stats ? (stats.custody || 0) : 0;
        window.activeVehiclesCount = count;
        
        const el = document.getElementById('custody-count-inline');
        if (el) {
            el.textContent = '(' + count + ')';
            el.style.color = '#10b981';
        }
        
        const headerEl = document.getElementById('header-custody-count');
        if (headerEl) headerEl.textContent = count;
    }

    // --- FORMATOS (PAYROLL) ---
    async function renderFormatos(el) {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        el.innerHTML = `
            <div style="margin-bottom:15px; display:flex; justify-content:flex-start;">
                <button class="btn btn-secondary btn-sm" onclick="exitToPortal()" style="border-radius:10px; padding:8px 15px; font-weight:800; background:rgba(255,255,255,0.05); border:1px solid var(--border);">🏠 VOLVER</button>
            </div>
            <div class="view-header">
                <h1 class="view-title">📄 FORMATOS DE COBRO</h1>
                <div id="payroll-view-toggle" style="display:flex; gap:10px;">
                    ${user.role === 'director' ? `
                        <button class="btn btn-secondary btn-sm" onclick="renderAdminPayrollDashboard(document.getElementById('payroll-content'))">📊 DASHBOARD CFO</button>
                        <button class="btn btn-secondary btn-sm" onclick="renderStaffPayrollForm(document.getElementById('payroll-content'))">✍️ NUEVO REPORTE</button>
                    ` : ''}
                </div>
            </div>
            <div id="payroll-content"></div>
            <div class="footer-info" style="margin-top:60px;"></div>
        `;
        
        updateFooterInfo();
        if (user.role === 'director') {
            renderAdminPayrollDashboard(document.getElementById('payroll-content'));
        } else {
            renderStaffPayrollForm(document.getElementById('payroll-content'));
        }
    }

    async function renderStaffPayrollForm(el) {
        el.innerHTML = '<div class="spinner"></div>';
        
        // El usuario logueado por defecto
        const user = JSON.parse(localStorage.getItem('user') || '{}');

        el.innerHTML = `
            <div class="card" style="max-width:600px; margin:0 auto; background:var(--surface); border:1px solid var(--border); padding:30px; border-radius:24px;">
                <h2 style="margin-bottom:20px; font-size:1.2rem; color:#fff;">REPORTE DE EVENTO</h2>
                <form id="payroll-form" onsubmit="submitPayroll(event)">
                    <div class="field">
                        <label>NOMBRE</label>
                        <input type="text" id="staff-search-input" placeholder="BUSCAR NOMBRE..." list="staff-datalist" autocomplete="off" required value="${user.name || ''}">
                        <datalist id="staff-datalist"></datalist>
                        <input type="hidden" name="user_id" id="selected-user-id" value="${user.id || ''}">
                    </div>
                    
                    <div id="event-matrix-section" style="display:none; margin-top:20px;">
                        <label style="font-size:0.75rem; color:var(--muted); font-weight:800; display:block; margin-bottom:10px;">SELECCIONE EVENTOS PARA COBRO</label>
                        <div id="event-matrix-container" style="display:flex; flex-direction:column; gap:10px; margin-bottom:20px;">
                            <!-- Matrix items will be rendered here -->
                        </div>
                    </div>

                    <div class="field">
                        <label>ENTIDAD BANCARIA</label>
                        <select name="bank_select" id="bank-select" required onchange="toggleManualBank(this.value)">
                            <option value="">SELECCIONE BANCO...</option>
                            <option value="BDV" ${user.bank_name === 'BDV' ? 'selected' : ''}>BANCO DE VENEZUELA (BDV)</option>
                            <option value="BNC" ${user.bank_name === 'BNC' ? 'selected' : ''}>BANCO NACIONAL DE CRÉDITO (BNC)</option>
                            <option value="BANESCO" ${user.bank_name === 'BANESCO' ? 'selected' : ''}>BANESCO</option>
                            <option value="MERCANTIL" ${user.bank_name === 'MERCANTIL' ? 'selected' : ''}>MERCANTIL</option>
                            <option value="PROVINCIAL" ${user.bank_name === 'PROVINCIAL' ? 'selected' : ''}>BBVA PROVINCIAL</option>
                            <option value="BBVA" ${user.bank_name === 'BBVA' ? 'selected' : ''}>BBVA</option>
                            <option value="EXTERIOR" ${user.bank_name === 'EXTERIOR' ? 'selected' : ''}>BANCO EXTERIOR</option>
                            <option value="VENEZOLANO DE CREDITO" ${user.bank_name === 'VENEZOLANO DE CREDITO' ? 'selected' : ''}>VENEZOLANO DE CRÉDITO</option>
                            <option value="BANCAMIGA" ${user.bank_name === 'BANCAMIGA' ? 'selected' : ''}>BANCAMIGA</option>
                            <option value="BANCARIBE" ${user.bank_name === 'BANCARIBE' ? 'selected' : ''}>BANCARIBE</option>
                            <option value="OTRO" ${user.bank_name && !['BDV','BNC','BANESCO','MERCANTIL','PROVINCIAL','BBVA','EXTERIOR','VENEZOLANO DE CREDITO','BANCAMIGA','BANCARIBE'].includes(user.bank_name) ? 'selected' : ''}>OTRO (ESPECIFICAR)</option>
                        </select>
                    </div>

                    <div id="manual-bank-field" class="field" style="display: ${user.bank_name && !['BDV','BNC','BANESCO','MERCANTIL','PROVINCIAL','BBVA','EXTERIOR','VENEZOLANO DE CREDITO','BANCAMIGA','BANCARIBE'].includes(user.bank_name) ? 'block' : 'none'};">
                        <label>ESPECIFIQUE ENTIDAD BANCARIA</label>
                        <input type="text" name="bank_name_manual" id="bank-name-manual" value="${user.bank_name || ''}" placeholder="NOMBRE DEL BANCO EN MAYÚSCULAS" style="border: 2px solid var(--accent);">
                    </div>

                    <div class="field">
                        <label>CUENTA / CLABE / EMAIL PAGO</label>
                        <input type="text" name="bank_account" id="bank-account-input" value="${user.bank_account || ''}" placeholder="NÚMERO DE CUENTA O CORREO" required>
                    </div>

                    <button type="submit" class="btn" style="width:100%; height:55px; font-size:1.1rem; background:var(--success); margin-top:10px;">
                        ENVIAR REPORTE DE COBRO
                    </button>
                </form>
            </div>
        `;

        // Si ya hay un usuario seleccionado (el logueado), cargar sus sesiones
        if (user.id) loadEventMatrix(user.id);

        // Listeners para búsqueda predictiva
        const searchInput = document.getElementById('staff-search-input');
        searchInput.addEventListener('input', async () => {
            const val = searchInput.value;
            if (val.length < 2) return;
            const res = await apiFetch('/api/staff/search?q=' + encodeURIComponent(val));
            if (res) {
                const dl = document.getElementById('staff-datalist');
                dl.innerHTML = res.map(s => `<option value="${s.name}" data-id="${s.id}" data-bank="${s.bank_name || ''}" data-account="${s.bank_account || ''}">${s.name}</option>`).join('');
            }
        });

        searchInput.addEventListener('change', async () => {
            const val = searchInput.value;
            const options = document.querySelectorAll('#staff-datalist option');
            const match = Array.from(options).find(o => o.value === val);
            if (match) {
                const userId = match.getAttribute('data-id');
                const bankName = match.getAttribute('data-bank');
                const bankAccount = match.getAttribute('data-account');
                
                document.getElementById('selected-user-id').value = userId;
                
                // Auto-fill bank
                const bankSelect = document.getElementById('bank-select');
                const manualInput = document.getElementById('bank-name-manual');
                const manualField = document.getElementById('manual-bank-field');
                
                if (bankName) {
                    const optionExists = Array.from(bankSelect.options).some(o => o.value === bankName);
                    if (optionExists) {
                        bankSelect.value = bankName;
                        manualField.style.display = 'none';
                    } else {
                        bankSelect.value = 'OTRO';
                        manualInput.value = bankName;
                        manualField.style.display = 'block';
                    }
                }
                
                const accountInput = document.getElementById('bank-account-input');
                if (bankAccount) accountInput.value = bankAccount;
                
                loadEventMatrix(userId);
            }
        });
    }

    async function loadEventMatrix(userId) {
        const matrixSection = document.getElementById('event-matrix-section');
        const matrixContainer = document.getElementById('event-matrix-container');
        if (!matrixSection || !matrixContainer) return;

        matrixContainer.innerHTML = '<div class="spinner" style="scale:0.5"></div>';
        matrixSection.style.display = 'block';

        const sessions = await apiFetch(`/api/staff/${userId}/available-sessions`);
        if (sessions && sessions.length > 0) {
            matrixContainer.innerHTML = sessions.map(s => `
                <div class="card" style="padding:12px; display:flex; align-items:center; gap:15px; background:var(--surface2); border:1px solid var(--border);">
                    <input type="checkbox" name="selected_sessions" value="${s.id}" data-name="${s.name}" data-date="${new Date(s.ended_at).toLocaleDateString()}" data-role="${s.role}" style="width:20px; height:20px; accent-color:var(--accent);">
                    <div style="flex:1">
                        <div style="font-weight:800; color:var(--accent); font-size:0.85rem">${s.name}</div>
                        <div style="font-size:0.7rem; color:var(--muted)">${new Date(s.ended_at).toLocaleDateString()} • ${s.role.toUpperCase()}</div>
                    </div>
                </div>
            `).join('');
        } else {
            matrixContainer.innerHTML = '<div style="color:var(--muted); font-size:0.75rem; text-align:center; padding:10px;">NO HAY EVENTOS DISPONIBLES PARA ESTE NOMBRE</div>';
        }
    }


    window.toggleManualBank = function(val) {
        const manualField = document.getElementById('manual-bank-field');
        const manualInput = document.getElementById('bank-name-manual');
        if (val === 'OTRO') {
            manualField.style.display = 'block';
            manualInput.required = true;
        } else {
            manualField.style.display = 'none';
            manualInput.required = false;
        }
    }

    window.submitPayroll = async function(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Recolectar sesiones seleccionadas
        const selectedCheckboxes = Array.from(form.querySelectorAll('input[name="selected_sessions"]:checked'));
        if (selectedCheckboxes.length === 0) {
            return toast('⚠️ SELECCIONE AL MENOS UN EVENTO', 'warning');
        }

        const sessionsData = selectedCheckboxes.map(cb => ({
            session_id: cb.value,
            name: cb.getAttribute('data-name'),
            date: cb.getAttribute('data-date'),
            role: cb.getAttribute('data-role')
        }));

        data.session_ids = sessionsData.map(s => s.session_id);
        data.sessions_data = sessionsData;

        // Manejar Banco (Matrix vs Manual)
        let finalBank = data.bank_select;
        if (finalBank === 'OTRO') {
            finalBank = data.bank_name_manual;
        }
        data.bank_name = (finalBank || '').toUpperCase();

        if (!data.bank_name) return toast('INDIQUE ENTIDAD BANCARIA', 'error');

        showLoading('ENVIANDO REPORTE...');
        try {
            // 1. Enviar Reporte
            const res = await apiFetch('/api/payroll/submit', {
                method: 'POST',
                body: JSON.stringify(data)
            });

            if (res && res.success) {
                // Actualizar LocalStorage
                const user = JSON.parse(localStorage.getItem('user') || '{}');
                user.bank_name = data.bank_name;
                user.bank_account = data.bank_account;
                localStorage.setItem('user', JSON.stringify(user));

                toast('REPORTE ENVIADO CON ÉXITO', 'success');
                exitToPortal();
            }
        } catch (err) {
            toast('ERROR AL ENVIAR', 'error');
        } finally {
            hideLoading();
        }
    }


    window.renderAdminPayrollDashboard = async function(el) {
        el.innerHTML = '<div class="spinner"></div>';
        const res = await apiFetch('/api/payroll/submissions');
        const submissions = (res && res.submissions) ? res.submissions : [];
        
        // Calcular Totales Generales
        const totalToPay = submissions.reduce((sum, s) => sum + (s.amount || 0), 0);
        
        // Agrupar por empleado para el resumen lateral
        const byEmployee = submissions.reduce((acc, s) => {
            if (!acc[s.user_name]) acc[s.user_name] = 0;
            acc[s.user_name] += (s.amount || 0);
            return acc;
        }, {});

        el.innerHTML = `
            <div class="grid" style="grid-template-columns: 1fr 3fr; gap:20px; align-items: start;">
                <!-- PANEL LATERAL: RESUMEN POR EMPLEADO -->
                <div style="display:flex; flex-direction:column; gap:20px; position:sticky; top:10px;">
                    <div class="card" style="background:linear-gradient(135deg, #1e253c, #0b0f19); border:1px solid var(--accent); padding:20px; border-radius:20px;">
                        <div style="font-size:0.7rem; color:var(--muted); font-weight:800; text-transform:uppercase; margin-bottom:15px;">💰 PRESUPUESTO ESTIMADO</div>
                        <div style="font-size:2.2rem; font-weight:900; color:var(--accent); margin-bottom:5px;">${settings.currency}${totalToPay.toLocaleString()}</div>
                        <div style="font-size:0.6rem; color:var(--muted);">SUMATORIA TOTAL DE JORNADA</div>
                    </div>

                    <div class="card" style="padding:20px; border-radius:20px; background:var(--surface); border:1px solid var(--border);">
                        <div style="font-size:0.7rem; color:var(--muted); font-weight:800; text-transform:uppercase; margin-bottom:15px;">👥 TOTAL POR EMPLEADO</div>
                        <div style="display:flex; flex-direction:column; gap:10px;">
                            ${Object.entries(byEmployee).map(([name, total]) => `
                                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:5px;">
                                    <span style="font-size:0.75rem; font-weight:700;">${name}</span>
                                    <span style="font-size:0.85rem; font-weight:900; color:var(--success);">${settings.currency}${total.toLocaleString()}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <!-- MATRIZ PRINCIPAL: DETALLE DE EVENTOS -->
                <div class="card" style="padding:0; border-radius:24px; overflow:hidden; background:var(--surface); border:1px solid var(--border);">
                    <div style="padding:20px; background:rgba(255,255,255,0.03); border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
                        <h3 style="margin:0; font-size:1rem; font-weight:800;">📊 MATRIZ DE COBROS PENDIENTES</h3>
                        <button class="btn btn-secondary btn-sm" onclick="renderAdminPayrollDashboard(document.getElementById('payroll-content'))">🔄 ACTUALIZAR</button>
                    </div>
                    
                    <div style="overflow-x:auto;">
                        <table style="width:100%; border-collapse:collapse; font-size:0.75rem;">
                            <thead>
                                <tr style="background:rgba(0,0,0,0.2); text-align:left; color:var(--muted);">
                                    <th style="padding:15px;">NOMBRE</th>
                                    <th style="padding:10px;">EVENTO / FECHA</th>
                                    <th style="padding:10px;">ROL</th>
                                    <th style="padding:10px;">INFO BANCARIA</th>
                                    <th style="text-align:right; padding:15px;">MONTO A PAGAR</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${submissions.map(s => `
                                    <tr style="border-bottom:1px solid var(--border);">
                                        <td style="padding:15px;">
                                            <div style="font-weight:900; color:#fff;">${s.user_name}</div>
                                            <div style="font-size:0.6rem; color:var(--muted);">ID: ${s.user_id}</div>
                                        </td>
                                        <td style="padding:10px;">
                                            <div style="font-weight:800; color:var(--accent);">${s.session_name}</div>
                                            <div style="font-size:0.65rem; color:var(--muted);">${s.date}</div>
                                        </td>
                                        <td style="padding:10px; font-weight:700; opacity:0.8;">${s.role_at_event.toUpperCase()}</td>
                                        <td style="padding:10px;">
                                            <div style="font-size:0.65rem; color:var(--muted);">${s.bank_name || 'N/A'}</div>
                                            <div style="font-family:var(--font-mono); font-size:0.7rem;">${s.bank_account || 'N/A'}</div>
                                        </td>
                                        <td style="text-align:right; padding:15px;">
                                            <div style="display:flex; align-items:center; justify-content:flex-end; gap:5px;">
                                                <span style="font-weight:900; color:var(--success); font-size:1rem;">${settings.currency}</span>
                                                <input type="number" 
                                                       value="${s.amount || 0}" 
                                                       onchange="updateSubmissionAmount(${s.id}, this.value)"
                                                       style="width:90px; height:35px; background:rgba(0,0,0,0.3); border:1px solid var(--accent); color:#fff; text-align:right; padding:5px; border-radius:8px; font-weight:900; font-size:1rem;">
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    window.updateSubmissionAmount = async function(id, val) {
        const amount = parseFloat(val) || 0;
        try {
            const res = await apiFetch('/api/payroll/update-amount', {
                method: 'POST',
                body: JSON.stringify({ id, amount })
            });
            if (res && res.success) {
                toast('MONTO ACTUALIZADO', 'success');
                // Recargar para actualizar totales sin refrescar toda la página
                renderAdminPayrollDashboard(document.getElementById('payroll-content'));
            }
        } catch (e) {
            toast('ERROR AL ACTUALIZAR', 'error');
        }
    }

    window.approvePayroll = async function(id, status) {
        if (!confirm(`¿CONFIRMA ${status === 'approved' ? 'APROBAR' : 'RECHAZAR'} ESTA SOLICITUD?`)) return;
        
        try {
            const res = await apiFetch('/api/payroll/approve', {
                method: 'POST',
                body: JSON.stringify({ id, status })
            });
            
            if (res && res.success) {
                toast(`SOLICITUD ${status.toUpperCase()}`, 'success');
                renderAdminPayrollDashboard(document.getElementById('payroll-content'));
            }
        } catch (e) {
            toast('ERROR DE CONEXIÓN', 'error');
        }
    }
    async function protectedAction(callback) {
        const pass = prompt('INTRODUZCA CLAVE DE AUTORIZACIÓN (ADMIN):');
        if (!pass) return;
        
        // Validar contra la clave de admin
        if (pass === 'EYE-ADMIN-2026') {
            callback();
        } else {
            toast('❌ CLAVE INCORRECTA', 'error');
        }
    }

    async function renderEventsDashboard(el) {
        showLoading('CARGANDO EVENTOS...');
        try {
            const res = await apiFetch('/api/sessions/active');
            const sessions = (res && res.sessions) ? res.sessions : [];
            window.activeSessions = sessions;
            
            if (sessions.length === 0) {
                el.innerHTML = `
                    <div style="margin-bottom:15px; display:flex; justify-content:flex-start;">
                        <button class="btn btn-secondary btn-sm" onclick="exitToPortal()" style="border-radius:10px; padding:8px 15px; font-weight:800; background:rgba(255,255,255,0.05); border:1px solid var(--border);">🏠 VOLVER</button>
                    </div>
                    <div class="view-header"><h1 class="view-title">📅 EVENTOS</h1></div>
                    <div class="stat-card" style="text-align:center; padding:50px;">
                        <i style="font-size:4rem; display:block; margin-bottom:20px;">⚠️</i>
                        <h2 style="color:var(--danger)">SIN EVENTOS ACTIVOS</h2>
                        <p style="color:var(--muted)">Inicie una sesión de Valet Parking en el Menú Principal para ver reportes.</p>
                    </div>
                `;
                return;
            }

            const staffRes = await apiFetch('/api/staff');
            const allStaff = staffRes?.staff || [];

            let html = `
                <div style="margin-bottom:15px; display:flex; justify-content:flex-start;">
                    <button class="btn btn-secondary btn-sm" onclick="exitToPortal()" style="border-radius:10px; padding:8px 15px; font-weight:800; background:rgba(255,255,255,0.05); border:1px solid var(--border);">🏠 VOLVER</button>
                </div>
                <div class="view-header">
                    <h1 class="view-title">📅 MONITOREO DE EVENTOS</h1>
                </div>
            `;

            for (const session of sessions) {
                const stats = await apiFetch('/api/events/stats?session_id=' + session.id);
                const attendance = await apiFetch('/api/attendance/session/' + session.id);
                const sessionStaff = allStaff.filter(u => u.current_session_id == session.id);

                const staffWithTimes = sessionStaff.map(u => {
                    const userLogs = (attendance || []).filter(l => l.user_id === u.id);
                    // Agrupar por tipo para obtener la primera entrada y última salida
                    const entries = userLogs.filter(l => l.type === 'entry').sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                    const exits = userLogs.filter(l => l.type === 'exit').sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                    
                    const arrival = entries.length > 0 ? entries[0].timestamp : null;
                    const departure = exits.length > 0 ? exits[0].timestamp : null;
                    return { ...u, arrival, departure };
                });
                
                html += `
                    <div class="stat-card" style="margin-top:20px; border-top:4px solid var(--accent); padding:20px; background: rgba(99, 102, 241, 0.03);">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:15px; gap:10px; flex-wrap:wrap;">
                            <div>
                                <h2 style="margin:0; font-size:1.1rem; color:white;">${session.name.toUpperCase()}</h2>
                                <div style="font-size:0.65rem; color:var(--muted); margin-top:4px;">ID: ${session.id} • INICIADO: ${new Date(session.started_at).toLocaleTimeString()}</div>
                            </div>
                            <button class="btn btn-danger btn-sm" onclick="closeSessionFromDashboard(${session.id}, '${session.name}')" style="padding: 6px 12px; border-radius:10px; font-size:0.7rem;">
                                🏁 CERRAR JORNADA
                            </button>
                        </div>

                        <div class="grid" style="grid-template-columns: repeat(3, 1fr); gap:10px; margin-bottom:20px;">
                            <div class="stat-card category-btn" onclick="toggleVehicleCategory(${session.id}, 'total')" style="background:var(--surface2); padding:10px; text-align:center; cursor:pointer; transition: transform 0.2s;">
                                <div style="font-size:0.6rem; color:var(--muted); margin-bottom:5px;">ENTRADAS</div>
                                <div style="font-size:1.2rem; font-weight:800; color:var(--accent)">${stats?.total || 0}</div>
                            </div>
                            <div class="stat-card category-btn" onclick="toggleVehicleCategory(${session.id}, 'custody')" style="background:var(--surface2); padding:10px; text-align:center; cursor:pointer; transition: transform 0.2s;">
                                <div style="font-size:0.6rem; color:var(--muted); margin-bottom:5px;">CUSTODIA</div>
                                <div style="font-size:1.2rem; font-weight:800; color:var(--success)">${stats?.custody || 0}</div>
                            </div>
                            <div class="stat-card category-btn" onclick="toggleVehicleCategory(${session.id}, 'exits')" style="background:var(--surface2); padding:10px; text-align:center; cursor:pointer; transition: transform 0.2s;">
                                <div style="font-size:0.6rem; color:var(--muted); margin-bottom:5px;">SALIDAS</div>
                                <div style="font-size:1.2rem; font-weight:800; color:var(--muted)">${stats?.exits || 0}</div>
                            </div>
                        </div>

                        <!-- LISTADO DE VEHÍCULOS POR CATEGORÍA -->
                        <div id="vehicle-list-${session.id}" style="display:none; margin-bottom:20px; background:rgba(0,0,0,0.4); border-radius:15px; padding:18px; border:2px solid var(--accent); box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px;">
                                <h4 id="vehicle-list-title-${session.id}" style="margin:0; font-size:0.85rem; letter-spacing:1px; font-weight:900; color:var(--accent);">LISTADO</h4>
                                <button class="btn btn-sm" onclick="closeVehicleCategory(${session.id})" style="background:rgba(255,255,255,0.1); border:none; color:white; font-size:0.7rem; font-weight:800; cursor:pointer; padding:4px 10px; border-radius:6px;">CERRAR ✕</button>
                            </div>
                            <div id="vehicle-list-content-${session.id}" style="max-height:400px; overflow-y:auto; display:grid; gap:10px;">
                                <div style="text-align:center; padding:20px; color:var(--muted);">Cargando...</div>
                            </div>
                        </div>

                        <div style="border-top: 1px solid var(--border); padding-top:15px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                                <div style="font-size:0.7rem; color:var(--muted); font-weight:800; letter-spacing:1px;">👥 PERSONAL ASIGNADO (${sessionStaff.length})</div>
                                <button class="btn btn-sm" onclick="showAssignStaffModal(${session.id})" style="font-size:0.6rem; padding:4px 10px; background:var(--accent); color:white; border-radius:6px;">+ AGREGAR PERSONAL</button>
                            </div>
                            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap:10px;">
                                ${staffWithTimes.length > 0 ? staffWithTimes.map(u => `
                                    <div style="background:rgba(255,255,255,0.03); padding:10px; border-radius:12px; border:1px solid var(--border); position:relative;">
                                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                                            <div style="width:8px; height:8px; border-radius:50%; background:${u.role === 'supervisor' ? 'var(--warning)' : 'var(--accent)'}; box-shadow:0 0 5px ${u.role === 'supervisor' ? 'var(--warning)' : 'var(--accent)'}"></div>
                                            <div style="font-size:0.75rem; font-weight:800; color:white; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${u.name.toUpperCase()}</div>
                                            <button onclick="unassignStaff(${session.id}, ${u.id})" style="background:none; border:none; color:var(--danger); cursor:pointer; font-size:0.8rem; font-weight:bold; opacity:0.6; padding:0 5px;">✕</button>
                                        </div>
                                        <div style="display:flex; flex-direction:column; gap:4px;">
                                            <div style="display:flex; justify-content:space-between; font-size:0.6rem;">
                                                <span style="color:var(--muted)">LLEGADA:</span>
                                                <span style="color:${u.arrival ? 'var(--success)' : 'var(--danger)'}; font-weight:700;">${u.arrival ? new Date(u.arrival).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--:--'}</span>
                                            </div>
                                            <div style="display:flex; justify-content:space-between; font-size:0.6rem;">
                                                <span style="color:var(--muted)">SALIDA:</span>
                                                <span style="color:${u.departure ? 'var(--muted)' : (u.arrival ? 'var(--warning)' : 'var(--danger)')}; font-weight:700;">${u.departure ? new Date(u.departure).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : (u.arrival ? 'ACTIVO' : '--:--')}</span>
                                            </div>
                                        </div>
                                    </div>
                                `).join('') : '<div style="font-size:0.6rem; color:var(--muted); grid-column:1/-1; text-align:center; padding:10px;">Sin personal asignado</div>'}
                            </div>
                        </div>
                    </div>
                `;
            }

            html += `
                <div style="display: flex; justify-content: center; margin-top: 30px;">
                    <button class="btn btn-secondary" onclick="exitToPortal()" style="border-radius: 30px; padding: 10px 30px; font-size: 0.9rem; font-weight: 800; background: rgba(255,255,255,0.05); border: 1px solid var(--border);">
                        🏠 VOLVER
                    </button>
                </div>
                <div class="footer-info" style="margin-top:60px;"></div>
            `;

            el.innerHTML = html;
            updateFooterInfo();
        } catch (e) {
            console.error('Events Dashboard Error:', e);
            toast('ERROR AL CARGAR EVENTOS', 'error');
        } finally {
            hideLoading();
        }
    }

    window.toggleVehicleCategory = async (sessionId, category) => {
        console.log('Toggling Category:', category, 'for Session:', sessionId);
        const container = document.getElementById(`vehicle-list-${sessionId}`);
        const content = document.getElementById(`vehicle-list-content-${sessionId}`);
        const title = document.getElementById(`vehicle-list-title-${sessionId}`);
        
        if (!container) {
            console.error('Container not found:', `vehicle-list-${sessionId}`);
            return;
        }

        // Si ya está abierto y es la misma categoría, cerrar
        if (container.style.display === 'block' && container.dataset.category === category) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        content.innerHTML = '<div style="text-align:center; padding:30px; color:var(--muted);"><div class="spinner" style="margin:0 auto 10px auto; width:30px; height:30px;"></div>CARGANDO DATOS...</div>';
        container.dataset.category = category;
        container.scrollIntoView({ behavior: 'smooth', block: 'center' });

        try {
            const res = await apiFetch('/api/vehicles?session_id=' + sessionId);
            if (!res || !res.vehicles) {
                content.innerHTML = '<p style="text-align:center; color:var(--danger); padding:20px;">Error al cargar datos</p>';
                return;
            }
            
            let filtered = res.vehicles;
            let titleText = 'TODAS LAS ENTRADAS';
            let color = 'var(--accent)';
            
            if (category === 'custody') {
                filtered = res.vehicles.filter(v => !v.check_out_at);
                titleText = 'VEHÍCULOS EN CUSTODIA';
                color = 'var(--success)';
            } else if (category === 'exits') {
                filtered = res.vehicles.filter(v => v.check_out_at);
                titleText = 'VEHÍCULOS ENTREGADOS (SALIDAS)';
                color = '#ff4d4d';
            }
            
            title.innerText = titleText;
            title.style.color = color;
            container.style.borderColor = color;
            
            content.innerHTML = filtered.map(v => `
                <div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:12px; border:1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center; animation: fadeIn 0.3s ease;">
                    <div>
                        <div style="font-weight:900; font-size:1rem; color:white; letter-spacing:1px; margin-bottom:4px;">${v.plate.toUpperCase()}</div>
                        <div style="font-size:0.65rem; color:var(--muted); text-transform:uppercase; font-weight:700;">${v.brand || ''} ${v.model || ''} • ${v.color || ''}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:0.7rem; color:white; font-weight:800; margin-bottom:4px;">${v.owner_name ? v.owner_name.toUpperCase() : 'SIN NOMBRE'}</div>
                        <div style="font-size:0.6rem; color:var(--muted); font-weight:600; background:rgba(0,0,0,0.3); padding:3px 8px; border-radius:4px;">
                            ${new Date(v.check_in_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                            ${v.check_out_at ? ' → ' + new Date(v.check_out_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''}
                        </div>
                    </div>
                </div>
            `).join('') || '<p style="text-align:center; color:var(--muted); font-size:0.8rem; padding:40px;">No hay registros para mostrar</p>';
            
        } catch (e) {
            console.error('Toggle Category Error:', e);
            content.innerHTML = '<p style="text-align:center; color:var(--danger); padding:20px;">Error crítico al procesar</p>';
        }
    };

    window.closeVehicleCategory = (sessionId) => {
        document.getElementById(`vehicle-list-${sessionId}`).style.display = 'none';
    };

    async function closeSessionFromDashboard(id, name) {
        if (!confirm(`¿ESTÁ SEGURO QUE DESEA CERRAR LA JORNADA DE "${name.toUpperCase()}"?\n\nESTO ENVIARÁ LOS REPORTES AUTOMÁTICAMENTE.`)) return;
        
        showLoading('CERRANDO JORNADA...');
        try {
            const res = await apiFetch('/api/sessions/close', {
                method: 'POST',
                body: JSON.stringify({ id })
            });
            
            if (res && res.success) {
                toast('✅ JORNADA CERRADA Y REPORTES ENVIADOS', 'success');
                // Recargar el dashboard de eventos
                renderEventsDashboard(document.getElementById('current-view'));
            } else {
                toast('❌ ERROR AL CERRAR JORNADA', 'error');
            }
        } catch (e) {
            toast('❌ ERROR DE CONEXIÓN', 'error');
        } finally {
            hideLoading();
        }
    }

    async function renderEvents(el) {
        el.innerHTML = `
            <div class="view-header"><h1 class="view-title">📊 CUSTODIA</h1></div>
            <div id="custodia-hero" style="margin-bottom:25px"></div>
            
            <div class="stat-card" style="margin-bottom:20px">
                <div class="field">
                    <label>BUSCADOR DE PLACA</label>
                    <input type="text" id="custodia-search" placeholder="BUSCAR VEHÍCULO..." oninput="filterCustodia(this.value)" style="text-transform:uppercase; font-size:1.2rem; text-align:center; height:50px;">
                </div>
            </div>

            <div id="custodia-list-detail"></div>
            <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 30px; align-items: center;">
                <button class="btn btn-secondary" onclick="showTab('home')" style="border-radius: 30px; padding: 10px 30px; font-size: 0.9rem; font-weight: 800; background: rgba(255,255,255,0.05); border: 1px solid var(--border); width: fit-content;">
                    🏠 VOLVER
                </button>
                <div class="back-nav" onclick="showTab('home')" style="margin:0; width: fit-content; background:transparent; border:none;">← IR AL MENÚ VALET</div>
            </div>
            <div class="chat-access-btn" onclick="showGlobalChat()">💬 CONTÁCTANOS</div>
            <div class="footer-info">COPYRIGHT EYE STAFF 2026</div>
        `;
        loadCustodiaOnly();
    }

    let fullCustodiaList = [];
    async function loadCustodiaOnly() {
        if (!window.activeSession) return;
        // Cargar stats
        const stats = await apiFetch('/api/events/stats?session_id=' + window.activeSession.id);
        const hero = document.getElementById('custodia-hero');
        if (stats && hero) {
            hero.innerHTML = `
                <div class="stat-card" style="text-align:center; border-bottom:5px solid var(--success); padding:30px;">
                    <div style="font-size:1rem; color:var(--muted); font-weight:700;">VEHÍCULOS EN RECINTO</div>
                    <div style="font-size:4rem; font-weight:900; color:var(--success)">${stats.custody || stats.in_custody || 0}</div>
                </div>
            `;
        }

        const res = await apiFetch('/api/events/detail/CUSTODIA?session_id=' + window.activeSession.id);
        if (res && res.list) {
            fullCustodiaList = res.list;
            renderCustodiaList(fullCustodiaList);
        }
    }

    function filterCustodia(q) {
        const filtered = fullCustodiaList.filter(v => v.plate.includes(q.toUpperCase()));
        renderCustodiaList(filtered);
    }

    function renderCustodiaList(list) {
        const container = document.getElementById('custodia-list-detail');
        if (!container) return;

        // Estilo de rejilla responsiva (6 columnas en desktop)
        container.style.display = 'grid';
        container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(200px, 1fr))';
        container.style.gap = '15px';

        const sorted = [...list].sort((a, b) => {
            const aReq = a.status === 'pending_retrieval';
            const bReq = b.status === 'pending_retrieval';
            if (aReq && !bReq) return -1;
            if (!aReq && bReq) return 1;
            return 0;
        });

        container.innerHTML = sorted.map(v => {
            const time = v.time_in || '--:--';
            return `
                <div class="vehicle-card" onclick="viewVehicleDetail(${v.id})" style="border-top:4px solid ${v.status === 'pending_retrieval' ? 'var(--danger)' : 'var(--success)'}; margin-bottom:0; cursor:pointer; position:relative; overflow:hidden; padding:15px; height:100%; display:flex; flex-direction:column; justify-content:space-between;">
                    ${v.status === 'pending_retrieval' ? `
                        <div style="position:absolute; top:0; right:0; background:var(--danger); color:white; font-size:0.5rem; font-weight:900; padding:2px 6px; border-bottom-left-radius:8px; animation: pulse 1s infinite;">PEDIDO</div>
                    ` : ''}
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <div class="plate-tag" style="font-size:0.9rem; padding:2px 8px;">${v.plate}</div>
                            <div style="font-size:0.6rem; color:var(--muted)">${time}</div>
                        </div>
                        <div style="font-weight:800; font-size:0.85rem; color:white; margin-bottom:4px;">${(v.owner_name || 'SIN NOMBRE').toUpperCase()}</div>
                        <div style="font-size:0.7rem; color:var(--accent2); font-weight:700; text-transform:uppercase;">
                            ${v.brand || ''} ${v.model || ''}
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px;">
                            <div style="font-size:0.6rem; color:var(--muted); font-weight:700;">${v.color || 'N/A'}</div>
                            <div style="font-size:0.7rem; color:var(--accent); font-weight:800;">#${String(v.daily_seq || 0).padStart(5, '0')}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('') || '<p style="grid-column:1/-1; text-align:center; color:var(--muted)">NO SE ENCONTRARON VEHÍCULOS</p>';
    }

    async function viewStatsDetail(type) {
        const container = document.getElementById('stats-detail-list');
        showLoading('CARGANDO DETALLE...');
        const res = await apiFetch('/api/events/detail/' + type);
        hideLoading();
        if (!res) return;

        container.innerHTML = `
            <div class="card" style="border:1px solid var(--accent)">
                <h3 style="margin-top:0">DETALLE: ${type}</h3>
                <div style="overflow-x:auto">
                    <table class="table" style="font-size:0.85rem;">
                        <thead>
                            <tr><th>PLACA</th><th>NOMBRE</th><th>HORA</th></tr>
                        </thead>
                        <tbody>
                            ${res.list.map(v => `
                                <tr onclick="viewVehicleDetail(${v.id})" style="cursor:pointer">
                                    <td><b>${v.plate}</b></td>
                                    <td>${v.owner_name || '—'}</td>
                                    <td>${v.time || '—'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        container.scrollIntoView({ behavior: 'smooth' });
    }

    async function updateEventStats() {
        const session = await apiFetch('/api/sessions/active');
        const nameEl = document.getElementById('active-session-name');
        
        if (session && !session.error) {
            nameEl.textContent = session.name;
            const stats = await apiFetch('/api/sessions/active/stats');
            if (stats) {
                document.getElementById('val-reservations').textContent = stats.reservations || 0;
                document.getElementById('val-recibidos').textContent = stats.recibidos || 0;
                document.getElementById('val-custodia').textContent = stats.custodia || 0;
                document.getElementById('val-entregados').textContent = stats.entregados || 0;
            }
        } else {
            nameEl.textContent = 'SIN EVENTO ACTIVO';
        }
    }

    async function updateEventSessionUI() {
        const container = document.getElementById('event-session-status');
        const session = await apiFetch('/api/sessions/active');
        if (session && !session.error) {
            container.innerHTML = `
                <div style="color:var(--success); font-weight:800; font-size:1.2rem; margin-bottom:10px">● ACTIVA</div>
                <div style="font-size:1.1rem">${session.name}</div>
                <div style="color:var(--muted); font-size:0.8rem; margin-top:5px">Iniciada: ${new Date(session.created_at || Date.now()).toLocaleString()}</div>
            `;
        } else {
            container.innerHTML = `<div style="color:var(--muted)">No hay una sesión de trabajo activa.</div>`;
        }
    }

    async function startNewSession() {
        const name = prompt('Nombre del evento o jornada (ej: Boda Familia Perez):');
        if (!name) return;
        
        // Detectar tipo según la vista actual o por defecto valet
        const type = document.getElementById('home-view') ? 'valet' : 'valet';

        showLoading('Iniciando sesión...');
        try {
            const res = await apiFetch('/api/sessions/plan', { 
                method: 'POST', 
                body: JSON.stringify({ name, type }) 
            });
            if (res) {
                await apiFetch('/api/sessions/activate', { method: 'POST', body: JSON.stringify({ id: res.id }) });
                // ENVIAR REPORTE DE INICIO (No bloquea si falla)
                apiFetch('/api/reports/send-start', { method: 'POST', body: JSON.stringify({ id: res.id }) }).catch(e => console.error('Error enviando reporte inicio:', e));
                
                toast('Sesión iniciada', 'success');
                await checkActiveSession();
                showTab('home');
            }
        } catch (e) {
            toast('Error al iniciar sesión: ' + e.message, 'danger');
        } finally {
            hideLoading();
        }
    }

    async function renderCheckin(el) {
        currentDamageMarks = [];
        photoData = {};
        el.innerHTML = `
            <div class="view-header">
                <h1 class="view-title">🚗 RECEPCIÓN</h1>
                <a href="manual.html" target="_blank" style="text-decoration:none; background:rgba(255,255,255,0.05); padding:8px 15px; border-radius:10px; font-size:0.7rem; color:var(--muted); font-weight:800; border:1px solid var(--border);">📖 MANUAL</a>
            </div>

            
            <div class="grid" style="display: flex; flex-direction: column; align-items: center; gap: 20px;">
                <!-- SECCIÓN DE ESCANEO IA (REGLA DE LAS 4 FOTOS) -->
                <div class="stat-card" style="width: 100%; max-width: 500px; border-top: 4px solid var(--accent); position: relative; overflow: hidden;">
                    <div style="background: rgba(99, 102, 241, 0.1); margin: -20px -20px 20px -20px; padding: 15px; border-bottom: 1px solid var(--border);">
                        <div style="font-size: 0.9rem; font-weight: 800; display: flex; align-items: center; gap: 10px;">
                            📸 CAPTURA DE VEHÍCULO (5 FOTOS)
                        </div>
                        <div style="font-size: 0.65rem; color: var(--muted); margin-top: 4px; font-weight: 600;">PLACA + 4 ÁNGULOS PRINCIPALES</div>
                    </div>
                    
                    <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;">
                        <!-- FOTO PLACA (FULL WIDTH) -->
                        <div class="photo-slot" onclick="triggerPhoto('plate')" id="slot-plate" style="height: 140px; width:100%;">
                            <span style="font-size: 1rem; font-weight: 900; opacity: 0.2; position: absolute; top: 10px; right: 15px;">PLACA</span>
                            <i>📷</i><span class="photo-label">PLACA</span>
                        </div>
                        
                        <!-- 4 FOTOS GRID -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <div class="photo-slot" onclick="triggerPhoto(1)" id="slot-1" style="height: 110px;">
                                <span style="font-size: 1.2rem; font-weight: 900; opacity: 0.2; position: absolute; top: 5px; right: 10px;">F1</span>
                                <i>📷</i><span class="photo-label">FOTO 1</span>
                            </div>
                            <div class="photo-slot" onclick="triggerPhoto(2)" id="slot-2" style="height: 110px;">
                                <span style="font-size: 1.2rem; font-weight: 900; opacity: 0.2; position: absolute; top: 5px; right: 10px;">F2</span>
                                <i>📷</i><span class="photo-label">FOTO 2</span>
                            </div>
                            <div class="photo-slot" onclick="triggerPhoto(3)" id="slot-3" style="height: 110px;">
                                <span style="font-size: 1.2rem; font-weight: 900; opacity: 0.2; position: absolute; top: 5px; right: 10px;">F3</span>
                                <i>📷</i><span class="photo-label">FOTO 3</span>
                            </div>
                            <div class="photo-slot" onclick="triggerPhoto(4)" id="slot-4" style="height: 110px;">
                                <span style="font-size: 1.2rem; font-weight: 900; opacity: 0.2; position: absolute; top: 5px; right: 10px;">F4</span>
                                <i>📷</i><span class="photo-label">FOTO 4</span>
                            </div>
                        </div>
                    </div>
                    
                    <button id="btn-ai-scan" class="btn" style="width: 100%; height: 55px; font-weight: 900; background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%); border: none; box-shadow: 0 10px 20px rgba(99, 102, 241, 0.3);" onclick="processAIPhotos()">
                        🤖 ANALIZAR CON IA Y AUTOCOMPLETAR
                    </button>
                </div>

                <div class="stat-card" style="width: 100%; max-width: 500px; margin: 0 auto;">
                    <div style="font-size:0.7rem; color:var(--accent); font-weight:800; margin-bottom:15px; letter-spacing:1px; text-align:center;">VERIFIQUE LOS DATOS ANTES DE DAR ENTRADA</div>
                    
                    <div id="duplicate-plate-alert" style="display:none; background:#fef2f2; border:2px solid #ef4444; color:#991b1b; padding:15px; border-radius:12px; margin-bottom:15px; text-align:center; font-weight:900; animation: blink-red 1s infinite;">
                        ⚠️ ¡ALERTA! ESTA PLACA YA SE ENCUENTRA EN EL RECINTO
                    </div>

                    <div class="field"><label>PLACA * OBLIGATORIO <span style="color:var(--brand-red)">*</span></label><input type="text" id="in-plate" placeholder="EJ: ABC-123" oninput="handlePlateInput(this.value)" list="predictive-plates" required></div>
                    <datalist id="predictive-plates"></datalist>
                    
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                        <div class="field"><label>MARCA <span style="color:var(--brand-red)">*</span></label><input type="text" id="in-brand" placeholder="EJ: TOYOTA" required></div>
                        <div class="field"><label>MODELO <span style="color:var(--brand-red)">*</span></label><input type="text" id="in-model" placeholder="EJ: COROLLA" required></div>
                    </div>
                    
                    <div class="field"><label>COLOR <span style="color:var(--brand-red)">*</span></label><input type="text" id="in-color" placeholder="EJ: BLANCO" required></div>
                    
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                        <div class="field"><label>NOMBRE <span style="color:var(--brand-red)">*</span></label><input type="text" id="in-owner" placeholder="EJ: JUAN PEREZ" oninput="handleNameInput(this.value)" list="predictive-names" required></div>
                        <datalist id="predictive-names"></datalist>
                        <div class="field"><label>CONTACTO <span style="color:var(--brand-red)">*</span></label><input type="text" id="in-phone" placeholder="EJ: +584141234567" required></div>
                    </div>
                    <div class="field"><label>EMAIL <span style="color:var(--brand-red)">*</span></label><input type="email" id="in-email" placeholder="EJ: CLIENTE@CORREO.COM" required></div>

                    <div class="detail-section-title" style="margin-top:20px">INSPECCIÓN DE ENTRADA</div>
                    <div style="border-bottom: 1px solid var(--border); margin: 10px 0 20px 0; opacity: 0.3;"></div>
                    <div class="damage-canvas" onclick="markDamage(event)" style="max-width:320px; background:white; padding:0; border-radius:15px; position:relative; overflow:hidden; border:1px solid var(--border);">
                        <img src="car-blueprint.png" style="width:100%; display:block; pointer-events:none;">
                        <svg viewBox="0 0 1000 1000" id="damage-svg" style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none;">
                            <g id="damage-marks"></g>
                        </svg>
                    </div>
                    <hr style="border:0; border-top:1px solid var(--border); margin:15px 0;">
                    <button class="btn btn-sm btn-secondary" onclick="clearDamage()" style="width:100%; margin-bottom:20px;">🧹 LIMPIAR MARCAS</button>
                    <textarea id="in-notes" placeholder="NOTAS ADICIONALES SOBRE EL ESTADO..." style="height:80px; margin-bottom:20px;"></textarea>

                    <input type="file" id="photo-input" accept="image/*,image/heic,image/heif,image/webp" capture="environment" style="display:none" onchange="handlePhoto(this)">
                    
                    <button class="btn" style="width:100%; margin-top:30px; height:70px; font-size:1.4rem" onclick="processCheckin()">GENERAR TICKET</button>
                </div>
            <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 30px; align-items: center;">
                <button class="btn btn-secondary" onclick="showTab('home')" style="border-radius: 30px; padding: 10px 30px; font-size: 0.9rem; font-weight: 800; background: rgba(255,255,255,0.05); border: 1px solid var(--border); width: fit-content;">
                    🏠 VOLVER
                </button>
                <div class="back-nav" onclick="showTab('home')" style="margin:0; width: fit-content; background:transparent; border:none;">← IR AL MENÚ VALET</div>
            </div>
            <div class="chat-access-btn" onclick="showGlobalChat()">💬 CONTÁCTANOS</div>
            <div class="footer-info">COPYRIGHT EYE STAFF 2026</div>
        `;
        
        // Inicializar estado de asistencia
        loadAttendanceStatus();
    }

    let currentDamageMarks = [];
    let photoData = {};
    let activePhotoSlot = null;

    function markDamage(e) {
        const svg = document.getElementById('damage-svg');
        const rect = svg.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 1000;
        const y = ((e.clientY - rect.top) / rect.height) * 1000;
        currentDamageMarks.push({x, y});
        renderDamageMarks();
    }

    function renderDamageMarks() {
        const g = document.getElementById('damage-marks');
        g.innerHTML = currentDamageMarks.map(m => `<circle cx="${m.x}" cy="${m.y}" r="20" fill="var(--brand-red)" stroke="white" stroke-width="4"/>`).join('');
    }

    function clearDamage() { currentDamageMarks = []; renderDamageMarks(); }

    async function processAIPhotos() {
        const images = Object.values(photoData);
        if (images.length === 0) {
            return toast('📸 TOMA AL MENOS 1 FOTO PARA ANALIZAR', 'warning');
        }

        const btn = document.getElementById('btn-ai-scan');
        const originalText = btn.innerHTML;
        btn.innerHTML = '🤖 ANALIZANDO...';
        btn.disabled = true;
        btn.style.opacity = '0.7';

        showLoading('🤖 IA ANALIZANDO VEHÍCULO...');

        try {
            const res = await apiFetch('/api/ai/scan-vehicle', {
                method: 'POST',
                body: JSON.stringify({ images })
            });

            if (res && res.success) {
                if (res.plate && res.plate !== 'REVISAR') document.getElementById('in-plate').value = res.plate.toUpperCase();
                if (res.brand && res.brand !== 'REVISAR') document.getElementById('in-brand').value = res.brand.toUpperCase();
                if (res.model && res.model !== 'REVISAR') document.getElementById('in-model').value = res.model.toUpperCase();
                if (res.color && res.color !== 'REVISAR') document.getElementById('in-color').value = res.color.toUpperCase();
                
                if (res.comments && res.comments !== 'REVISAR') {
                    const notesEl = document.getElementById('in-notes');
                    if (notesEl.value) notesEl.value += '\n';
                    notesEl.value += `[IA]: ${res.comments}`;
                }

                toast('✅ DATOS RECONOCIDOS POR IA', 'success');
            } else {
                toast('⚠️ IA NO PUDO RECONOCER TODOS LOS DATOS', 'warning');
            }
        } catch (e) {
            toast('❌ ERROR EN EL ESCANEO IA', 'error');
        } finally {
            hideLoading();
            btn.innerHTML = originalText;
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    }

    async function triggerPhoto(idx) {
        activePhotoSlot = idx;
        document.getElementById('photo-input').click();
    }

    async function handlePhoto(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        
        showLoading('OPTIMIZANDO IMAGEN...');
        
        try {
            // Comprimimos a un tamaño razonable para el slot y para la IA
            const base64 = await compressImage(file, 1024, 0.7);
            photoData[activePhotoSlot] = base64;
            const slot = document.getElementById('slot-' + activePhotoSlot);
            slot.classList.add('filled');
            const displayLabel = activePhotoSlot === 'plate' ? 'PLACA' : 'FOTO ' + activePhotoSlot;
            slot.innerHTML = `
                <img src="${base64}">
                <span style="font-size: 0.8rem; font-weight: 900; opacity: 0.9; position: absolute; top: 5px; right: 10px; color: white; text-shadow: 0 0 10px black; background:rgba(0,0,0,0.5); padding:2px 6px; border-radius:4px;">${displayLabel}</span>
                <button type="button" onclick="removePhoto('${activePhotoSlot}', event)" style="position:absolute; bottom:8px; right:8px; background:rgba(220,38,38,0.9); color:white; border:none; border-radius:50%; width:28px; height:28px; cursor:pointer; font-size:14px; font-weight:bold; display:flex; align-items:center; justify-content:center; z-index:10; box-shadow: 0 2px 10px rgba(0,0,0,0.5);">✕</button>
            `;
            toast('📸 FOTO CAPTURADA', 'success');
        } catch (e) {
            toast('Error al procesar foto', 'error');
        } finally {
            hideLoading();
        }
    }
    function removePhoto(idx, event) {
        if (event) event.stopPropagation();
        delete photoData[idx];
        const slot = document.getElementById('slot-' + idx);
        slot.classList.remove('filled');
        const displayLabel = idx === 'plate' ? 'PLACA' : 'FOTO ' + idx;
        const shortLabel = idx === 'plate' ? 'PLACA' : 'F' + idx;
        const topPos = idx === 'plate' ? '10px' : '5px';
        
        slot.innerHTML = `
            <span style="font-size: ${idx === 'plate' ? '1rem' : '1.2rem'}; font-weight: 900; opacity: 0.2; position: absolute; top: ${topPos}; right: 10px;">${shortLabel}</span>
            <i>📷</i><span class="photo-label">${displayLabel}</span>
        `;
        toast('🗑️ FOTO ELIMINADA', 'info');
    }

    function compressImage(file, maxWidth = 1200, quality = 0.7) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (e) => {
                const img = new Image();
                img.src = e.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = maxWidth;
                    let width = img.width;
                    let height = img.height;

                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
            };
        });
    }

    async function renderCheckout(el) {
        el.innerHTML = `
            <div class="view-header"><h1 class="view-title">📤 ENTREGA</h1></div>
            <div style="display:flex; flex-direction:column; gap:20px;">
                <div class="stat-card">
                    <div class="field"><label>BUSCADOR RAPIDO</label>
                        <input type="text" id="out-search" list="active-plates" placeholder="BUSCAR PLACA..." oninput="searchCheckout(this.value)" style="text-transform:uppercase; font-size:1.5rem; text-align:center; height:60px;">
                        <datalist id="active-plates"></datalist>
                    </div>
                    <div id="out-results" style="margin-top:20px"></div>
                </div>
                
                <div class="stat-card">
                    <h2 style="margin-top:0; margin-bottom:15px; font-size:1.2rem;">🏎️ VEHÍCULOS SOLICITADOS</h2>
                    <div id="out-grid" style="display:grid; grid-template-columns:1fr; gap:15px;">CARGANDO VEHÍCULOS...</div>
                </div>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 30px; align-items: center;">
                <button class="btn btn-secondary" onclick="showTab('home')" style="border-radius: 30px; padding: 10px 30px; font-size: 0.9rem; font-weight: 800; background: rgba(255,255,255,0.05); border: 1px solid var(--border); width: fit-content;">
                    🏠 VOLVER
                </button>
                <div class="back-nav" onclick="showTab('home')" style="margin:0; width: fit-content; background:transparent; border:none;">← IR AL MENÚ VALET</div>
            </div>
            <div class="chat-access-btn" style="margin-top:20px" onclick="showGlobalChat()">💬 ACCEDER AL CENTRO DE MENSAJES</div>
            <div class="footer-info">COPYRIGHT EYE STAFF 2026 - v1.1</div>
        `;
        loadActivePlates();
        loadCheckoutGrid();
    }

    async function loadCheckoutGrid() {
        const data = await apiFetch('/api/vehicles/active');
        const grid = document.getElementById('out-grid');
        if (data && data.vehicles) {
            grid.innerHTML = data.vehicles.map(v => `
                <div class="vehicle-card photo-tooltip-trigger" onclick="viewVehicleDetail(${v.id})">
                    <div style="display:flex; justify-content:space-between; align-items:center">
                        <div class="plate-tag">${v.plate}</div>
                        <div style="background:var(--accent); color:white; font-size:0.7rem; font-weight:800; padding:2px 6px; border-radius:4px;">#${(v.daily_seq || 0).toString().padStart(5, '0')}</div>
                    </div>
                    <div style="margin-top:10px; font-weight:700; color:var(--accent2)">${v.brand || 'Vehículo'}</div>
                    <div style="font-size:0.8rem; color:var(--muted)">${v.owner_name || ''}</div>
                    ${v.first_photo ? `
                        <div class="photo-tooltip">
                            <img src="/api/photos/${v.first_photo}" style="width:180px; border-radius:8px">
                        </div>
                    ` : ''}
                </div>
            `).join('') || '<p>No hay vehículos para entregar</p>';
        }
    }

    async function loadActivePlates() {
        const data = await apiFetch('/api/vehicles/active');
        const dl = document.getElementById('active-plates');
        if (data?.vehicles) {
            dl.innerHTML = data.vehicles.map(v => `<option value="${v.plate}">`).join('');
        }
    }

    async function searchCheckout(q) {
        if (q.length < 2) return document.getElementById('out-results').innerHTML = '';
        const data = await apiFetch('/api/vehicles/search?q=' + encodeURIComponent(q));
        const results = document.getElementById('out-results');
        results.innerHTML = data?.map(v => `
            <div class="vehicle-card" onclick="viewVehicleDetail(${v.id})">
                <div style="display:flex; justify-content:space-between; align-items:center">
                    <div class="plate-tag">${v.plate}</div>
                    <span style="font-size:0.8rem; color:var(--muted)">${v.owner_name || ''}</span>
                </div>
            </div>
        `).join('') || '<p>No se encontraron resultados</p>';
    }

    async function viewVehicleDetail(id) {
        const v = await apiFetch('/api/vehicles/' + id);
        if (!v) return;
        
        const marks = v.damage_json ? JSON.parse(v.damage_json) : [];
        const modalBody = document.getElementById('modal-body');

        const statusLabels = {
            'parked': 'EN CUSTODIA',
            'pending_retrieval': 'PEDIDO',
            'retrieved': 'ENTREGADO',
            'delivering': 'ENTREGANDO',
            'requested': 'SOLICITADO'
        };
        const displayStatus = statusLabels[v.status] || v.status.toUpperCase();
        
        modalBody.innerHTML = `
            <h2 style="margin-top:0">${v.plate}</h2>
            <div class="grid" style="grid-template-columns:1fr 1fr; gap:10px; margin-bottom:20px">
                <div><label>NOMBRE</label><div>${(v.owner_name || '—').toUpperCase()}</div></div>
                <div><label>ESTADO</label><div style="color:var(--accent2); font-weight:900;">${displayStatus}</div></div>
            </div>

            <div id="security-verification-box" style="background:#064e3b20; border:1px solid #10b981; padding:15px; border-radius:12px; margin-bottom:20px; text-align:center;">
                <div style="font-size:0.7rem; color:#10b981; font-weight:800; margin-bottom:5px; text-transform:uppercase;">Claves Dinámicas (Verificar al entregar)</div>
                <div style="display:flex; justify-content:center; align-items:center; gap:20px;">
                    <div style="font-size:1.4rem; font-weight:900; letter-spacing:3px;">
                        <span>${v.auth_token_1 || '—'}</span>
                        <span>${v.auth_token_2 || '—'}</span>
                    </div>
                    <button id="btn-verify-security" class="btn btn-sm" style="background:#10b981; color:white; padding:5px 15px;" onclick="verifySecurityTokens(${v.id})">VERIFICAR QR</button>
                </div>
                <div id="verification-status" style="font-size:0.6rem; color:#10b981; font-weight:800; margin-top:8px; display:none;">✅ IDENTIDAD CONFIRMADA</div>
            </div>
            
            <div class="detail-section-title">INSPECCIÓN DE ENTRADA</div>
            <div style="border-bottom: 1px solid var(--border); margin: 10px 0 20px 0; opacity: 0.3;"></div>
            <div class="damage-canvas" style="margin-bottom:20px; max-width:320px; background:white; padding:0; border-radius:15px; position:relative; overflow:hidden; border:1px solid var(--border);">
                <img src="car-blueprint.png" style="width:100%; display:block; pointer-events:none;">
                <svg viewBox="0 0 1000 1000" style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none;">
                    <g id="detail-damage-marks">
                        ${marks.map(m => `<circle cx="${m.x}" cy="${m.y}" r="25" fill="var(--accent2)" stroke="white" stroke-width="5"/>`).join('')}
                    </g>
                </svg>
            </div>
            
            <div class="detail-section-title">Chat con el Cliente</div>
            <div id="staff-chat-box" style="height:150px; overflow-y:auto; background:var(--surface2); border-radius:12px; padding:10px; margin-bottom:10px; display:flex; flex-direction:column; gap:8px;">
                <div style="text-align:center; color:var(--muted); font-size:0.7rem; margin-top:60px;">Cargando mensajes...</div>
            </div>
            <div style="display:flex; gap:8px; margin-bottom:20px;">
                <input type="text" id="staff-chat-input" placeholder="Responder al cliente..." style="flex:1; background:var(--surface2); border:1px solid var(--border); color:white; padding:10px; border-radius:10px;">
                <button class="btn btn-accent" onclick="sendStaffMessage(${v.id})" style="padding:0 15px;">Enviar</button>
            </div>

            <div class="detail-section-title">Fotos de Evidencia</div>
            <div id="detail-photos" class="photo-grid" style="margin-bottom:20px">Cargando fotos...</div>
            
            <div style="display:flex; gap:10px; flex-wrap: wrap;">
                <button id="btn-do-checkout" class="btn" style="flex:2; min-height:50px; font-size:0.9rem; padding: 10px; opacity:0.5;" onclick="doCheckout(${v.id}, '${v.owner_phone || ''}', '${v.plate}')" disabled>ENTREGAR VEHÍCULO Y NOTIFICAR</button>
                <button class="btn btn-secondary" style="flex:1; min-height:50px; font-size:0.9rem" onclick="closeModal()">CERRAR</button>
            </div>
        `;
        openModal();
        loadDetailPhotos(v.id);
        loadStaffChat(v.id);
    }

    async function loadStaffChat(vehicleId) {
        const messages = await apiFetch('/api/messages/' + vehicleId);
        const box = document.getElementById('staff-chat-box');
        if (messages && messages.length > 0) {
            box.innerHTML = messages.map(m => `
                <div style="align-self:${m.from_role === 'staff' ? 'flex-end' : 'flex-start'}; background:${m.from_role === 'staff' ? 'var(--accent)' : 'var(--surface)'}; color:white; padding:8px 12px; border-radius:12px; max-width:80%; font-size:0.8rem; border-bottom-${m.from_role === 'staff' ? 'right' : 'left'}-radius:2px;">
                    ${m.text}
                </div>
            `).join('');
            box.scrollTop = box.scrollHeight;
        } else {
            box.innerHTML = '<div style="text-align:center; color:var(--muted); font-size:0.7rem; margin-top:60px;">No hay mensajes</div>';
        }
    }

    async function sendStaffMessage(vehicleId) {
        const input = document.getElementById('staff-chat-input');
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        await apiFetch('/api/messages/' + vehicleId, { method: 'POST', body: JSON.stringify({ text }) });
        loadStaffChat(vehicleId);
    }

    function shareWhatsApp(phone, plate, code) {
        /*
        const msg = `Hola, este es el ticket digital de tu vehículo (Placa: ${plate}). Puedes solicitar tu auto o ver fotos aquí: ${API_BASE}/ticket/${code}`;
        const url = `https://wa.me/${phone.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
        */
        toast('WhatsApp desactivado temporalmente', 'info');
    }

    async function loadDetailPhotos(id) {
        const data = await apiFetch(`/api/vehicles/${id}/photos`);
        const el = document.getElementById('detail-photos');
        if (data?.photos?.length) {
            el.innerHTML = data.photos.map((p, idx) => {
                // Forzar URL absoluta para evitar problemas de base path
                const baseUrl = window.location.origin;
                const photoUrl = p.url.startsWith('/') ? p.url : `/api/photos/${p.url}`;
                const fullUrl = baseUrl + photoUrl;

                return `
                    <div class="photo-slot filled" style="background:#1a1a1a; cursor:pointer;" onclick="openPhotoViewer(${JSON.stringify(data.photos.map(x => x.url.startsWith('/') ? x.url : '/api/photos/' + x.url)).replace(/"/g, '&quot;')}, ${idx})">
                        <img src="${fullUrl}" 
                             style="width:100%; height:100%; object-fit:cover; display:block;" 
                             onerror="this.onerror=null; this.src='https://via.placeholder.com/400x300?text=ERROR+FOTO'; this.parentElement.style.borderColor='var(--danger)';"
                             onload="this.style.opacity='1';">
                    </div>
                `;
            }).join('');
        } else {
            el.innerHTML = '<p style="grid-column:1/-1; color:var(--muted); text-align:center; padding:20px;">No hay fotos de evidencia registradas</p>';
        }
    }

    // --- PHOTO VIEWER ---
    function openPhotoViewer(urls, startIdx = 0) {
        let currentIdx = startIdx;
        const modal = document.getElementById('modal-container');
        const body = document.getElementById('modal-body');
        
        const updateView = () => {
            body.innerHTML = `
                <div class="photo-modal-content">
                    <button class="photo-close-btn" onclick="closeModal()">Cerrar</button>
                    <div class="photo-viewer-container">
                        <img src="${API_BASE}/api/photos/${urls[currentIdx]}" class="photo-viewer-img">
                        ${urls.length > 1 ? `
                            <div class="photo-viewer-nav">
                                <button class="photo-nav-btn" id="prev-photo"><i>◀</i></button>
                                <button class="photo-nav-btn" id="next-photo"><i>▶</i></button>
                            </div>
                        ` : ''}
                    </div>
                    <div style="text-align:center; margin-top:20px; color:var(--muted); font-size:0.9rem">
                        Foto ${currentIdx + 1} de ${urls.length}
                    </div>
                </div>
            `;
            
            if (urls.length > 1) {
                document.getElementById('prev-photo').onclick = (e) => { e.stopPropagation(); currentIdx = (currentIdx - 1 + urls.length) % urls.length; updateView(); };
                document.getElementById('next-photo').onclick = (e) => { e.stopPropagation(); currentIdx = (currentIdx + 1) % urls.length; updateView(); };
            }
        };

        updateView();
        modal.classList.add('open');
        modal.onclick = (e) => { if (e.target === modal) closeModal(); };
    }

    // --- PREDICTIVE CHECK-IN ---
    let predictiveData = [];
    async function handlePlateInput(val) {
        if (val.length < 2) {
            document.getElementById('duplicate-plate-alert').style.display = 'none';
            return;
        }

        // Verificar duplicados activos
        const activeRes = await apiFetch('/api/vehicles/active');
        if (activeRes && activeRes.vehicles) {
            const isDuplicate = activeRes.vehicles.some(v => v.plate.toUpperCase() === val.toUpperCase());
            document.getElementById('duplicate-plate-alert').style.display = isDuplicate ? 'block' : 'none';
        }

        // Búsqueda predictiva para el datalist
        const res = await apiFetch('/api/vehicles/predictive?q=' + encodeURIComponent(val));
        if (res) {
            const dl = document.getElementById('predictive-plates');
            dl.innerHTML = res.map(v => `<option value="${v.plate}">${v.brand || ''} ${v.owner_name ? '— ' + v.owner_name : ''}</option>`).join('');
            
        // Si la placa coincide exactamente, traer ÚLTIMOS datos completos (SILENCIOSO)
        if (val.length >= 4) {
            const latest = await apiFetch('/api/vehicles/by-plate/' + encodeURIComponent(val.toUpperCase()), {}, true);
            if (latest && !latest.error) {
                if (latest.brand) document.getElementById('in-brand').value = latest.brand;
                if (latest.model) document.getElementById('in-model').value = latest.model;
                if (latest.color) document.getElementById('in-color').value = latest.color;
                if (latest.owner_name) document.getElementById('in-owner').value = latest.owner_name;
                if (latest.owner_phone) document.getElementById('in-phone').value = latest.owner_phone;
                if (latest.owner_email) document.getElementById('in-email').value = latest.owner_email;
                // Toast eliminado a petición del usuario
            }
        }
    }
}

    async function handleNameInput(val) {
        if (val.length < 3) return;

        // Búsqueda predictiva para nombres
        const res = await apiFetch('/api/customers/predictive?q=' + encodeURIComponent(val));
        if (res) {
            const dl = document.getElementById('predictive-names');
            dl.innerHTML = res.map(c => `<option value="${c.owner_name}">${c.owner_phone || ''}</option>`).join('');

            // Si el nombre coincide exactamente, traer ÚLTIMOS datos de contacto (SILENCIOSO)
            const latest = await apiFetch('/api/customers/by-name/' + encodeURIComponent(val.toUpperCase()), {}, true);
            if (latest && !latest.error) {
                if (latest.owner_phone) document.getElementById('in-phone').value = latest.owner_phone;
                if (latest.owner_email) document.getElementById('in-email').value = latest.owner_email;
                // Toast eliminado a petición del usuario
            }
        }
    }

    function verifySecurityTokens(id) {
        // En una implementación real con cámara, aquí se activaría el escáner.
        // Por ahora simulamos la validación que activa el botón.
        const confirm = window.confirm("¿HA ESCANEADO EL QR DEL CLIENTE Y COINCIDEN LAS CLAVES DINÁMICAS?");
        if (confirm) {
            document.getElementById('btn-do-checkout').disabled = false;
            document.getElementById('btn-do-checkout').style.opacity = '1';
            document.getElementById('btn-verify-security').style.display = 'none';
            document.getElementById('verification-status').innerHTML = '✅ CLAVE DINÁMICA CONFIRMADA';
            document.getElementById('verification-status').style.display = 'block';
            toast('IDENTIDAD VERIFICADA', 'success');
        }
    }

    async function doCheckout(id, phone, plate) {
        if (!confirm('¿CONFIRMAR ENTREGA DEL VEHÍCULO?')) return;
        
        showLoading('REGISTRANDO ENTREGA...');
        const res = await apiFetch('/api/events/checkout', {
            method: 'POST',
            body: JSON.stringify({ id: id })
        });
        
        if (res) {
            hideLoading();
            toast('✅ Vehículo entregado', 'success');
            closeModal();
            showTab('resumen');
        } else {
            hideLoading();
        }
    }

    async function renderSettings(el) {
        el.innerHTML = `
            <div class="view-header"><h1 class="view-title">⚙️ Ajustes</h1><button class="btn" onclick="saveSettings()">Guardar</button></div>
            <div class="grid">
                <div class="stat-card">
                    <div class="field"><label>Nombre de Empresa</label><input type="text" id="set-name" value="${settings.company_name}"></div>
                    <div class="field"><label>Moneda</label><input type="text" id="set-currency" value="${settings.currency}"></div>
                </div>
                
                <div class="stat-card" style="margin-top:20px; border-left:4px solid var(--accent2);">
                    <div class="stat-label" style="color:var(--accent2)">DOCUMENTACIÓN Y ACCESOS</div>
                    <div style="margin-top:15px; display:flex; flex-direction:column; gap:10px;">
                        <a href="/manual.html" target="_blank" class="btn" style="background:var(--accent2); text-decoration:none;">📘 VER MANUAL DE OPERACIÓN (PDF)</a>
                        <div style="background:var(--surface2); padding:15px; border-radius:10px; font-size:0.85rem; border:1px solid var(--border);">
                            <strong>Claves de Acceso del Sistema:</strong><br>
                            • Administración: <code>EYE-ADMIN-2026</code><br>
                            • Operativo: <code>STAFF-EYE-01</code>
                        </div>
                    </div>
                </div>

                <div style="text-align:center; margin-top: 40px; margin-bottom: 60px;">
                    <button class="btn btn-secondary" onclick="exitToPortal()" style="border-radius: 30px; padding: 10px 30px; font-size: 0.9rem; font-weight: 800; background: rgba(255,255,255,0.05); border: 1px solid var(--border);">
                        🏠 VOLVER
                    </button>
                </div>
            </div>
        `;
    }

    function renderHistory(el) {
        el.innerHTML = `
            <div class="view-header"><h1 class="view-title">📜 Historial de Auditoría</h1></div>
            <div class="stat-card" style="margin-bottom:20px;">
                <div class="field"><label>Filtrar por Placa</label>
                    <input type="text" id="hist-search" placeholder="Escribe placa para buscar..." oninput="filterHistory(this.value)" style="text-transform:uppercase">
                </div>
            </div>
            <div id="history-container" class="stat-card" style="padding:0; overflow-x:auto;">
                <table class="data-table" style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="text-align:left; border-bottom:1px solid var(--border)">
                            <th style="padding:15px">Placa</th>
                            <th>Entrada</th>
                            <th>Salida</th>
                            <th>Estado</th>
                            <th>Acción</th>
                        </tr>
                    </thead>
                    <tbody id="history-table-body">
                        <tr><td colspan="5" style="text-align:center; padding:20px;">Cargando historial...</td></tr>
                    </tbody>
                </table>
            </div>
        `;
        loadHistory();
    }

    async function loadHistory() {
        const data = await apiFetch('/api/vehicles');
        const list = data?.vehicles || data || [];
        window.fullHistory = list;
        renderHistoryTable(list);
    }

    function renderHistoryTable(list) {
        const tbody = document.getElementById('history-table-body');
        tbody.innerHTML = list.map(v => `
            <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:15px"><div class="plate-tag" style="font-size:0.8rem">${v.plate}</div></td>
                <td style="font-size:0.85rem">${new Date(v.created_at).toLocaleString()}</td>
                <td style="font-size:0.85rem">${v.check_out_at ? new Date(v.check_out_at).toLocaleString() : '-'}</td>
                <td><span class="status-dot status-${v.status}"></span> ${v.status === 'parked' ? 'En Parking' : 'Entregado'}</td>
                <td><button class="btn btn-sm" onclick="viewVehicleDetail(${v.id})">Ver Detalle</button></td>
            </tr>
        `).join('') || '<tr><td colspan="5" style="text-align:center; padding:20px;">No hay registros</td></tr>';
    }

    function filterHistory(q) {
        const filtered = window.fullHistory.filter(v => v.plate.includes(q.toUpperCase()));
        renderHistoryTable(filtered);
    }

    async function renderVehicles(el) {
        const vehicles = await apiFetch('/api/vehicles');
        el.innerHTML = `
            <div class="view-header"><h1 class="view-title">🏎️ Inventario de Autos</h1></div>
            <div class="stat-card" style="overflow-x:auto">
                <table style="width:100%; border-collapse:collapse; min-width:800px">
                    <thead>
                        <tr style="text-align:left; border-bottom:1px solid var(--border)">
                            <th style="padding:15px">Placa (Hover para Foto)</th>
                            <th>Marca / Color</th>
                            <th>NOMBRE / TELÉFONO</th>
                            <th>Hora Entrada</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${vehicles?.map(v => `
                            <tr style="border-bottom:1px solid rgba(255,255,255,0.05)">
                                <td style="padding:15px">
                                    <div class="plate-tag photo-tooltip-trigger" style="display:inline-block">
                                        ${v.plate}
                                        ${v.first_photo ? `
                                            <div class="photo-tooltip">
                                                <div style="font-size:0.7rem; margin-bottom:5px; color:var(--accent2)">VISTA RÁPIDA</div>
                                                <img src="/api/photos/${v.first_photo}" style="width:200px; border-radius:8px; display:block">
                                            </div>
                                        ` : ''}
                                    </div>
                                </td>
                                <td>
                                    <div style="font-weight:600">${v.brand || '-'}</div>
                                    <div style="font-size:0.75rem; color:var(--muted)">${v.color || ''}</div>
                                </td>
                                <td>
                                    <div style="font-size:0.9rem">${v.owner_name || '-'}</div>
                                    <div style="font-size:0.75rem; color:var(--muted)">${v.owner_phone || ''}</div>
                                </td>
                                <td style="font-size:0.8rem">${new Date(v.created_at).toLocaleString()}</td>
                                <td><span class="status-badge status-${v.status}">${v.status.toUpperCase()}</span></td>
                                <td>
                                    <button class="btn btn-sm" onclick="viewVehicleDetail(${v.id})">Detalles</button>
                                </td>
                            </tr>
                        `).join('') || '<tr><td colspan="6" style="padding:20px; text-align:center; color:var(--muted)">No hay vehículos registrados</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
    }

    async function renderResumen(el) {
        el.innerHTML = `
            <div class="view-header"><h1 class="view-title">📋 RESUMEN JORNADA</h1></div>
            
            <div class="grid" style="display: flex; flex-direction: column; align-items: center; gap: 20px;">
                <div id="block-custodia" class="stat-card" style="width: 100%; max-width: 500px; cursor: pointer; border-bottom: 5px solid var(--success);">
                    <div class="stat-label">EN CUSTODIA</div>
                    <div id="total-custodia" class="stat-value">0</div>
                    <div id="list-custodia" style="display: none; margin-top: 20px; text-align: left;"></div>
                </div>

                <div id="block-entregados" class="stat-card" style="width: 100%; max-width: 500px; cursor: pointer; border-bottom: 5px solid var(--warning);">
                    <div class="stat-label">ENTREGADOS</div>
                    <div id="total-entregados" class="stat-value">0</div>
                    <div id="list-entregados" style="display: none; margin-top: 20px; text-align: left;"></div>
                </div>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 30px; align-items: center;">
                <button class="btn btn-secondary" onclick="showTab('home')" style="border-radius: 30px; padding: 10px 30px; font-size: 0.9rem; font-weight: 800; background: rgba(255,255,255,0.05); border: 1px solid var(--border); width: fit-content;">
                    🏠 VOLVER
                </button>
                <div class="back-nav" onclick="showTab('home')" style="margin:0; width: fit-content; background:transparent; border:none;">← IR AL MENÚ VALET</div>
            </div>
            <div class="footer-info" style="margin-top:40px; text-align:center;">COPYRIGHT EYE STAFF 2026</div>
        `;
        
        document.getElementById('block-entregados').onclick = () => toggleResumenList('list-entregados');
        document.getElementById('block-custodia').onclick = () => toggleResumenList('list-custodia');

        loadFullResumen();
    }

    function toggleResumenList(id) {
        const el = document.getElementById(id);
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
        event.stopPropagation();
    }

    async function loadFullResumen() {
        if (!window.activeSession) return;
        const sid = window.activeSession.id;
        
        const resDel = await apiFetch('/api/events/detail/ENTREGADOS?session_id=' + sid);
        if (resDel && resDel.list) {
            document.getElementById('total-entregados').textContent = resDel.list.length;
            document.getElementById('list-entregados').innerHTML = renderMiniList(resDel.list, 'var(--warning)');
        }
        const resAct = await apiFetch('/api/events/detail/CUSTODIA?session_id=' + sid);
        if (resAct && resAct.list) {
            document.getElementById('total-custodia').textContent = resAct.list.length;
            document.getElementById('list-custodia').innerHTML = renderMiniList(resAct.list, 'var(--success)');
        }
    }

    function renderMiniList(items, color) {
        if (!items || items.length === 0) return '<p style="font-size:0.8rem; color:var(--muted); text-align:center;">SIN REGISTROS</p>';
        return items.map(v => {
            const time = v.time_out || v.time_in || '--:--';
            const label = v.time_out ? 'SALIDA' : 'ENTRADA';
            return `
            <div style="background:var(--surface2); padding:12px; border-radius:10px; border-left:4px solid ${color}; display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border:1px solid var(--border);">
                <div>
                    <div style="font-weight:900; font-size:1.1rem; letter-spacing:1px; display:flex; align-items:center; gap:8px;">
                        ${v.plate}
                        <span style="font-size:0.7rem; color:var(--accent); font-weight:800;">#${String(v.daily_seq || 0).padStart(5, '0')}</span>
                    </div>
                    <div style="font-size:0.75rem; color:white; font-weight:700; margin-top:2px;">${(v.owner_name || '—').toUpperCase()}</div>
                    <div style="font-size:0.65rem; color:var(--accent2); font-weight:700; text-transform:uppercase; margin-top:2px;">
                        ${v.brand || ''} ${v.model || ''} | ${v.color || ''}
                    </div>
                </div>
                <div style="text-align:right">
                    <div style="font-size:0.7rem; color:var(--muted); font-weight:700;">${label}: ${time}</div>
                </div>
                </div>
            </div>
            `;
        }).join('');
    }

    function renderResumenItems(items) {
        const list = document.getElementById('resumen-list');
        list.innerHTML = items.map(v => `
            <div class="vehicle-card" style="border-left:4px solid var(--accent2)">
                <div style="display:flex; justify-content:space-between; align-items:center">
                    <div class="plate-tag">${v.plate}</div>
                    <div style="font-size:0.75rem; color:var(--muted)">ENTREGA: ${new Date(v.check_out_at).toLocaleTimeString()}</div>
                </div>
                <div style="margin-top:10px; font-weight:700;">${v.owner_name || 'SIN NOMBRE'}</div>
                <div style="font-size:0.8rem; color:var(--muted)">${v.brand || ''} ${v.model || ''}</div>
            </div>
        `).join('') || '<p style="text-align:center; color:var(--muted)">SIN RESULTADOS</p>';
    }

    function filterResumen(q) {
        const filtered = fullResumenList.filter(v => v.plate.includes(q.toUpperCase()));
        renderResumenItems(filtered);
    }

    // --- ASISTENCIA (FICHAJE) ---
    async function loadAttendanceStatus() {
        if (!window.activeSession) return;
        
        try {
            const statusRes = await apiFetch('/api/attendance/current?session_id=' + window.activeSession.id);
            const status = statusRes?.status || 'none';
            
            const badge = document.getElementById('attendance-status-badge');
            const btnEntry = document.getElementById('btn-att-entry');
            const btnBreak = document.getElementById('btn-att-break');
            const btnExit = document.getElementById('btn-att-exit');
            
            if (!badge) return;

            // Reset states
            [btnEntry, btnBreak, btnExit].forEach(b => {
                b.disabled = false;
                b.style.opacity = '1';
                b.style.boxShadow = 'none';
                b.style.background = b.id === 'btn-att-entry' ? 'var(--success)' : 
                                   b.id === 'btn-att-break' ? 'var(--warning)' : 'var(--danger)';
            });

            switch(status) {
                case 'entry':
                    badge.textContent = '🟢 EN TURNO';
                    badge.style.background = 'rgba(34, 197, 94, 0.1)';
                    badge.style.color = 'var(--success)';
                    btnEntry.disabled = true;
                    btnEntry.style.opacity = '0.3';
                    btnBreak.textContent = 'DESCANSO';
                    btnBreak.onclick = () => logAttendance('break_start');
                    break;
                case 'break_start':
                    badge.textContent = '🟠 EN DESCANSO';
                    badge.style.background = 'rgba(245, 158, 11, 0.1)';
                    badge.style.color = 'var(--warning)';
                    btnEntry.disabled = true;
                    btnEntry.style.opacity = '0.3';
                    btnBreak.textContent = 'VOLVER';
                    btnBreak.onclick = () => logAttendance('break_end');
                    btnExit.disabled = true;
                    btnExit.style.opacity = '0.3';
                    break;
                case 'break_end':
                    badge.textContent = '🟢 EN TURNO (VUELTA)';
                    badge.style.background = 'rgba(34, 197, 94, 0.1)';
                    badge.style.color = 'var(--success)';
                    btnEntry.disabled = true;
                    btnEntry.style.opacity = '0.3';
                    btnBreak.textContent = 'DESCANSO';
                    btnBreak.onclick = () => logAttendance('break_start');
                    break;
                case 'exit':
                    badge.textContent = '⚪ JORNADA FINALIZADA';
                    badge.style.background = 'rgba(255, 255, 255, 0.05)';
                    badge.style.color = 'var(--muted)';
                    [btnEntry, btnBreak, btnExit].forEach(b => {
                        b.disabled = true;
                        b.style.opacity = '0.3';
                    });
                    break;
                default:
                    badge.textContent = '🔴 SIN FICHAJE';
                    badge.style.background = 'rgba(239, 68, 68, 0.1)';
                    badge.style.color = 'var(--danger)';
                    btnBreak.disabled = true;
                    btnBreak.style.opacity = '0.3';
                    btnExit.disabled = true;
                    btnExit.style.opacity = '0.3';
            }

            // Load active staff list
            const staffLogs = await apiFetch('/api/attendance/session/' + window.activeSession.id);
            updateAttendanceUI(staffLogs);

        } catch (e) {
            console.error('Attendance Load Error:', e);
        }
    }


    function updateAttendanceUI(logs) {
        const list = document.getElementById('active-staff-list');
        if (!list) return;

        if (!logs || logs.length === 0) {
            list.innerHTML = '<div style="font-size:0.6rem; color:var(--muted); text-align:center; padding:10px;">Nadie ha fichado aún</div>';
            return;
        }

        // Get latest status for each user
        const latestByUser = {};
        logs.forEach(log => {
            if (!latestByUser[log.user_id]) {
                latestByUser[log.user_id] = log;
            }
        });

        const statusMap = {
            'entry': { label: 'ENTRADA', color: 'var(--success)' },
            'break_start': { label: 'DESCANSO', color: 'var(--warning)' },
            'break_end': { label: 'RETORNO', color: 'var(--success)' },
            'exit': { label: 'SALIDA', color: 'var(--danger)' }
        };

        list.innerHTML = Object.values(latestByUser).map(log => {
            const st = statusMap[log.type] || { label: log.type.toUpperCase(), color: 'var(--muted)' };
            const time = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `
                <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:8px 12px; border-radius:10px; border:1px solid var(--border);">
                    <div>
                        <div style="font-size:0.7rem; font-weight:800; color:#fff;">${log.user_name.toUpperCase()}</div>
                        <div style="font-size:0.55rem; color:var(--muted); font-weight:700;">ÚLTIMO: ${st.label} A LAS ${time}</div>
                    </div>
                    <div style="width:8px; height:8px; border-radius:50%; background:${st.color}; box-shadow:0 0 5px ${st.color};"></div>
                </div>
            `;
        }).join('');
    }

    // --- GESTIÓN DE PERSONAL EN EVENTOS ---
    async function showAssignStaffModal(sessionId) {
        showLoading('CARGANDO PERSONAL...');
        const res = await apiFetch('/api/staff');
        hideLoading();
        
        if (!res || !res.staff) return;
        
        const availableStaff = res.staff.filter(u => u.current_session_id != sessionId);
        
        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = `
            <h2 style="margin-top:0; color:var(--accent); text-align:center; letter-spacing:1px;">ASIGNAR PERSONAL</h2>
            
            <div style="margin-bottom:20px;">
                <input type="text" id="staff-search" placeholder="🔍 BUSCAR PERSONAL..." 
                       style="width:100%; padding:15px; background:rgba(0,0,0,0.2); border:1px solid var(--accent); border-radius:12px; color:white; font-size:0.9rem; font-weight:700; outline:none;"
                       oninput="filterStaffList(this.value)">
            </div>
            
            <div id="assign-staff-list" style="max-height:400px; overflow-y:auto; display:grid; gap:12px; padding:5px;">
                ${availableStaff.map(u => `
                    <div class="staff-row" data-name="${u.name.toLowerCase()}" style="background:var(--surface2); padding:15px; border-radius:15px; border:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="font-weight:900; font-size:0.9rem; color:white;">${u.name.toUpperCase()}</div>
                            <div style="font-size:0.6rem; color:var(--muted); text-transform:uppercase; font-weight:700; letter-spacing:1px; margin-top:2px;">${u.role}</div>
                        </div>
                        <button class="btn btn-sm" onclick="assignStaff(${sessionId}, ${u.id})" style="background:var(--accent); padding:8px 15px; border-radius:10px; font-weight:800; font-size:0.7rem;">ASIGNAR</button>
                    </div>
                `).join('') || '<p style="text-align:center; color:var(--muted); padding:20px;">No hay personal disponible</p>'}
            </div>
            
            <button class="btn btn-secondary" onclick="closeModal()" style="margin-top:25px; width:100%; border-radius:12px; font-weight:800;">CERRAR VENTANA</button>
        `;

        window.filterStaffList = (val) => {
            const query = val.toLowerCase();
            document.querySelectorAll('.staff-row').forEach(row => {
                const name = row.getAttribute('data-name');
                row.style.display = name.includes(query) ? 'flex' : 'none';
            });
        };

        openModal();
        setTimeout(() => document.getElementById('staff-search').focus(), 100);
    }

    async function assignStaff(sessionId, userId) {
        showLoading('ASIGNANDO...');
        const res = await apiFetch(`/api/sessions/${sessionId}/assign-staff`, {
            method: 'POST',
            body: JSON.stringify({ user_id: userId })
        });
        if (res) {
            toast('✅ PERSONAL ASIGNADO', 'success');
            if (currentTab === 'home') loadHomeStaffTracking(sessionId);
            else if (currentTab === 'eventos') renderEventsDashboard(document.getElementById('current-view'));
            closeModal();
        }
        hideLoading();
    }

    async function unassignStaff(sessionId, userId) {
        if (!confirm('¿QUITAR PERSONAL DE ESTE EVENTO?')) return;
        
        showLoading('QUITANDO...');
        const res = await apiFetch(`/api/sessions/${sessionId}/unassign-staff`, {
            method: 'POST',
            body: JSON.stringify({ user_id: userId })
        });
        if (res) {
            toast('✅ PERSONAL REMOVIDO', 'info');
            if (currentTab === 'home') loadHomeStaffTracking(sessionId);
            else if (currentTab === 'eventos') renderEventsDashboard(document.getElementById('current-view'));
        }
        hideLoading();
    }

    async function renderMonitoring(el) {
        currentTab = 'monitoreo';
        el.innerHTML = `
            <div id="monitoring-view" style="height: calc(100vh - 140px); display: flex; flex-direction: column; gap:15px;">
                <div class="view-header" style="margin-bottom:0; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <h1 class="view-title">CENTRO DE MONITOREO</h1>
                        <p style="font-size:0.6rem; color:var(--muted); text-transform:uppercase; letter-spacing:1px; margin-top:5px;">Rastreo Satelital de Activos y Personal</p>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button class="btn btn-sm btn-secondary" onclick="updateMonitoringData()" style="padding:10px 15px; border-radius:12px;">🔄</button>
                        <button class="btn btn-sm" onclick="exitToPortal()" style="padding:10px 20px; border-radius:12px; font-weight:800; background:rgba(255,255,255,0.05);">SALIR</button>
                    </div>
                </div>
                
                <div style="flex:1; display:flex; gap:15px; min-height:0;">
                    <!-- LISTA DE ENTIDADES (LADO IZQUIERDO EN PC, OCULTO O BOTTOM EN MÓVIL) -->
                    <div id="entity-list" style="width:280px; background:var(--surface); border-radius:24px; border:1px solid var(--border); overflow-y:auto; padding:15px; display:flex; flex-direction:column; gap:10px;">
                        <div style="font-size:0.7rem; font-weight:800; color:var(--muted); border-bottom:1px solid var(--border); padding-bottom:8px; margin-bottom:5px;">PERSONAL Y EQUIPOS</div>
                        <div id="entity-items-container" style="display:flex; flex-direction:column; gap:8px;">
                            <p style="font-size:0.7rem; color:var(--muted); text-align:center; margin-top:20px;">Cargando activos...</p>
                        </div>
                    </div>

                    <!-- MAPA -->
                    <div id="map" style="flex:1; border-radius:24px; border:1px solid var(--border); background:var(--surface1); overflow:hidden; z-index:1;"></div>
                </div>
                
                <div id="monitoring-stats" style="display:grid; grid-template-columns: repeat(3, 1fr); gap:10px;">
                    <div class="card" style="padding:15px; text-align:center; border-radius:20px; background:var(--surface);">
                        <div style="font-size:0.5rem; color:var(--muted); font-weight:800;">ACTIVOS EN LÍNEA</div>
                        <div id="count-online" style="font-size:1.5rem; font-weight:900; color:var(--success);">0</div>
                    </div>
                    <div class="card" style="padding:15px; text-align:center; border-radius:20px; background:var(--surface);">
                        <div style="font-size:0.5rem; color:var(--muted); font-weight:800;">EQUIPOS RUTA</div>
                        <div id="count-assets" style="font-size:1.5rem; font-weight:900; color:var(--accent);">0</div>
                    </div>
                    <div class="card" style="padding:15px; text-align:center; border-radius:20px; background:var(--surface);">
                        <div style="font-size:0.5rem; color:var(--muted); font-weight:800;">ÚLTIMA SYNC</div>
                        <div id="last-sync-time" style="font-size:0.8rem; font-weight:900; color:white; margin-top:10px;">--:--</div>
                    </div>
                </div>
            </div>
            <style>
                @media (max-width: 768px) {
                    #monitoring-view { height: auto; min-height: calc(100vh - 120px); }
                    #monitoring-view > div:nth-child(2) { flex-direction: column-reverse; height: 600px; }
                    #entity-list { width: 100% !important; height: 250px; }
                    #map { height: 350px; flex: none; width: 100%; }
                }
            </style>
        `;

        // Inicializar Mapa
        setTimeout(() => {
            map = L.map('map').setView([10.4806, -66.9036], 13); // Caracas default
            
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap'
            }).addTo(map);

            updateMonitoringData();
            if (monitoringInterval) clearInterval(monitoringInterval);
            monitoringInterval = setInterval(updateMonitoringData, 30000); // Cada 30s
        }, 100);
    }

    async function updateMonitoringData() {
        if (currentTab !== 'monitoreo') {
            if (monitoringInterval) clearInterval(monitoringInterval);
            return;
        }

        const res = await apiFetch('/api/locations/latest');
        if (!res || !res.locations) return;

        const locs = res.locations;
        let onlineCount = 0;
        let assetCount = 0;
        const container = document.getElementById('entity-items-container');
        if (container) container.innerHTML = '';

        locs.forEach(l => {
            const lastUpdate = new Date(l.ts);
            const diffMin = (new Date() - lastUpdate) / 60000;
            const isOnline = diffMin < 10; // Online si reportó hace menos de 10 min

            if (isOnline) onlineCount++;
            if (l.entity_type === 'asset') assetCount++;

            const markerKey = `${l.entity_type}_${l.entity_id}`;
            const pos = [l.latitude, l.longitude];
            
            const color = l.entity_type === 'staff' ? 'var(--accent)' : 'var(--warning)';
            const iconHtml = `
                <div style="background:${color}; width:35px; height:35px; border-radius:50%; border:3px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; color:white; font-size:1rem; position:relative;">
                    ${l.entity_type === 'staff' ? '👤' : '🚚'}
                    <div style="position:absolute; bottom:-2px; right:-2px; width:12px; height:12px; background:${isOnline ? 'var(--success)' : 'var(--muted)'}; border-radius:50%; border:2px solid white;"></div>
                </div>
            `;
            const icon = L.divIcon({
                html: iconHtml,
                className: 'custom-div-icon',
                iconSize: [35, 35],
                iconAnchor: [17, 17]
            });

            if (markers[markerKey]) {
                markers[markerKey].setLatLng(pos);
            } else {
                markers[markerKey] = L.marker(pos, { icon }).addTo(map)
                    .bindPopup(`<b>${l.entity_name}</b><br>${l.entity_subinfo}<br><small>${lastUpdate.toLocaleString()}</small>`);
            }

            // Agregar a la lista lateral
            if (container) {
                const item = document.createElement('div');
                item.className = 'menu-item';
                item.style.padding = '10px';
                item.style.borderRadius = '15px';
                item.style.background = 'rgba(255,255,255,0.03)';
                item.style.fontSize = '0.65rem';
                item.style.display = 'flex';
                item.style.alignItems = 'center';
                item.style.gap = '10px';
                item.onclick = () => focusOnMarker(markerKey, pos);
                
                item.innerHTML = `
                    <div style="width:30px; height:30px; background:${color}20; color:${color}; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:1rem;">
                        ${l.entity_type === 'staff' ? '👤' : '🚚'}
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight:800; color:white;">${l.entity_name}</div>
                        <div style="font-size:0.55rem; color:var(--muted);">${l.entity_subinfo.toUpperCase()}</div>
                    </div>
                    <div style="width:8px; height:8px; background:${isOnline ? 'var(--success)' : 'var(--muted)'}; border-radius:50%;"></div>
                `;
                container.appendChild(item);
            }
        });

        document.getElementById('count-online').innerText = onlineCount;
        document.getElementById('count-assets').innerText = assetCount;
        document.getElementById('last-sync-time').innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function focusOnMarker(key, pos) {
        if (!map || !markers[key]) return;
        map.setView(pos, 16);
        markers[key].openPopup();
    }


    async function apiFetch(path, options = {}, silent = false) {
        const token = localStorage.getItem('token');
        const headers = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', ...options.headers };
        try {
            const res = await fetch(API_BASE + path, { ...options, headers });
            const data = await res.json();
            if (!res.ok) {
                if (!silent) toast(data.error || 'Error en la solicitud', 'error');
                return null;
            }
            return data;
        } catch (e) {
            console.error('API Fetch Error:', e);
            if (!silent) toast('Error de conexión con el servidor', 'error');
            return null;
        }
    }

    async function downloadDailyReport() {
        showLoading('Generando archivo...');
        const data = await apiFetch('/api/vehicles/active');
        if (data && data.vehicles) {
            let csv = 'PLACA,MARCA,MODELO,NOMBRE,TELÉFONO,ENTRADA\n';
            data.vehicles.forEach(v => {
                csv += `"${v.plate}","${v.brand || ''}","${v.model || ''}","${v.owner_name || ''}","${v.owner_phone || ''}","${new Date(v.created_at).toLocaleString()}"\n`;
            });
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.setAttribute('hidden', '');
            a.setAttribute('href', url);
            a.setAttribute('download', `reporte_valet_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
        hideLoading();
    }

    async function sendClosingReport() {
        if (!confirm('¿Seguro que deseas finalizar la jornada y enviar el reporte a ncarrillok@gmail.com?')) return;
        
        showLoading('Generando y enviando reporte...');
        const res = await apiFetch('/api/reports/send-summary', { method: 'POST' });
        
        hideLoading();
        if (res && res.success) {
            toast('📧 Reporte enviado con éxito', 'success');
        } else {
            toast('Error al enviar reporte', 'error');
        }
    }

    async function loadDashboardData() {
        if (!window.activeSession) return;
        const sid = window.activeSession.id;
        
        const stats = await apiFetch('/api/dashboard/today?session_id=' + sid);
        if (stats) {
            document.getElementById('val-parked').textContent = stats.total || 0;
            document.getElementById('val-checkins').textContent = stats.checkins || 0;
            document.getElementById('val-earnings').textContent = '$' + (stats.earnings || 0);
        }
        const data = await apiFetch('/api/vehicles/active?session_id=' + sid);
        if (data && data.vehicles) {
            document.getElementById('dash-recent').innerHTML = data.vehicles.slice(0,8).map(v => `
                <div class="vehicle-card photo-tooltip-trigger" onclick="viewVehicleDetail(${v.id})">
                    <div style="display:flex; justify-content:space-between; align-items:start">
                        <div style="display:flex; gap:8px; align-items:center;">
                            <div style="background:var(--accent); color:white; font-size:0.7rem; font-weight:800; padding:2px 6px; border-radius:4px;">#${(v.daily_seq || 0).toString().padStart(5, '0')}</div>
                            <div class="plate-tag">${v.plate}</div>
                        </div>
                        <div style="font-size:0.7rem; color:var(--muted)">${new Date(v.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                    </div>
                    <div style="margin-top:12px; font-weight:700; color:var(--accent2)">${v.brand || 'Vehículo'}</div>
                    <div style="font-size:0.85rem; margin-top:4px;">${v.owner_name || 'Sin nombre'}</div>
                    <div style="font-size:0.75rem; color:var(--muted); margin-top:2px;">${v.owner_phone || ''}</div>
                    
                    ${v.first_photo ? `
                        <div class="photo-tooltip">
                            <div style="font-size:0.7rem; margin-bottom:5px; color:var(--accent2)">VISTA PREVIA</div>
                            <img src="/api/photos/${v.first_photo}" style="width:220px; border-radius:8px; display:block">
                        </div>
                    ` : ''}
                </div>
            `).join('') || '<p>No hay vehículos activos</p>';
        }
    }

    async function processCheckin() {
        const body = {
            plate: document.getElementById('in-plate').value.toUpperCase(),
            owner_name: document.getElementById('in-owner').value,
            owner_phone: document.getElementById('in-phone').value,
            brand: document.getElementById('in-brand').value,
            model: document.getElementById('in-model').value,
            color: document.getElementById('in-color').value,
            owner_email: document.getElementById('in-email').value,
            damage_json: JSON.stringify(currentDamageMarks),
            damage_notes: document.getElementById('in-notes').value,
            photos: photoData,
            session_id: window.activeSession?.id
        };
        
        if (!body.plate) return toast('LA PLACA ES OBLIGATORIA', 'error');
        if (!body.brand) return toast('LA MARCA ES OBLIGATORIA', 'error');
        if (!body.model) return toast('EL MODELO ES OBLIGATORIO', 'error');
        if (!body.color) return toast('EL COLOR ES OBLIGATORIO', 'error');
        if (!body.owner_name) return toast('EL NOMBRE ES OBLIGATORIO', 'error');
        if (!body.owner_phone) return toast('EL CONTACTO ES OBLIGATORIO', 'error');
        if (!body.owner_email) return toast('EL EMAIL ES OBLIGATORIO', 'error');
        if (!body.session_id) return toast('⚠️ NO HAY SESIÓN ACTIVA. INICIE EVENTO EN ADMIN.', 'error');
        
        // Validación básica de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(body.owner_email)) return toast('FORMATO DE EMAIL INVÁLIDO', 'error');
        
        showLoading('GUARDANDO REGISTRO Y EVIDENCIA...');
        const res = await apiFetch('/api/events/checkin', { 
            method: 'POST', 
            body: JSON.stringify(body) 
        });
        
        if (res && res.vehicle) {
            hideLoading();
            const v = res.vehicle;
            const ticketUrl = `${window.location.origin}/ticket/${res.ticket_code}?v1=${v.auth_token_1}&v2=${v.auth_token_2}`;
            const modalBody = document.getElementById('modal-body');
            modalBody.innerHTML = `
                <div style="text-align:center">
                    <div style="font-size:3rem; margin-bottom:10px">✅</div>
                    <h2 style="margin:0; color:var(--success)">REGISTRO EXITOSO</h2>
                    <div style="font-size:1.5rem; font-weight:900; margin:20px 0; letter-spacing:2px; background:var(--surface2); padding:10px; border-radius:12px; border:1px dashed var(--border)">${res.vehicle.plate.toUpperCase()}</div>
                    
                    <div style="margin:20px 0; background:white; padding:15px; display:inline-block; border-radius:15px; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
                        <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(ticketUrl)}" style="width:200px; height:200px; display:block;">
                    </div>
                    <div style="font-size:0.9rem; color:var(--text); font-weight:700; margin-bottom:20px;">MUESTRE ESTE CÓDIGO AL CLIENTE</div>

                    <div style="text-align:left; background:var(--surface2); padding:15px; border-radius:12px; margin-bottom:20px; font-size:0.9rem">
                        <div><strong>NOMBRE:</strong> ${(res.vehicle.owner_name || '—').toUpperCase()}</div>
                        <div style="margin-top:5px; font-size:1.1rem; color:var(--accent)"><strong>TICKET:</strong> #${String(res.daily_seq).padStart(5, '0')}</div>
                    </div>

                    <button class="btn btn-accent" style="width:100%; height:60px; font-size:1.2rem; margin-bottom:10px" onclick="window.open('${ticketUrl}', '_blank')">VER TICKET DIGITAL</button>
                    <button class="btn btn-secondary" style="width:100%" onclick="closeModal(); showTab('home');">VOLVER AL MENU</button>
                    <div id="redirect-timer" style="margin-top:15px; font-size:0.8rem; color:var(--accent); font-weight:700;">VOLVIENDO AL MENÚ EN 15 SEGUNDOS...</div>
                </div>
            `;
            openModal();
            
            // Auto-cerrar y volver al inicio tras 15 seg
            let timeLeft = 15;
            const timerInterval = setInterval(() => {
                timeLeft--;
                const timerEl = document.getElementById('redirect-timer');
                if (timerEl) timerEl.textContent = `VOLVIENDO AL MENÚ EN ${timeLeft} SEGUNDOS...`;
                if (timeLeft <= 0) {
                    clearInterval(timerInterval);
                    const mc = document.getElementById('modal-container');
                    if (mc && mc.classList.contains('open')) {
                        closeModal();
                        showTab('home');
                    }
                }
            }, 1000);
            
            // Limpiar intervalo si se cierra manualmente
            window.lastTimer = timerInterval;
        } else {
            hideLoading();
        }
    }

    function showLoading(text) {
        document.getElementById('loading-text').innerText = text;
        document.getElementById('loading-overlay').classList.add('active');
    }

    function updateLoadingText(text) {
        document.getElementById('loading-text').innerText = text;
    }

    function hideLoading() {
        document.getElementById('loading-overlay').classList.remove('active');
    }

    // --- UTILS ---
    function toast(msg, type = 'info') {
        const t = document.createElement('div');
        t.className = 'toast';
        t.style.borderLeft = `5px solid ${type === 'error' ? 'var(--accent2)' : 'var(--success)'}`;
        t.textContent = msg;
        document.getElementById('toast-container').appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }

    async function showGlobalChat() {
        showLoading('CARGANDO CENTRO DE MENSAJES...');
        const res = await apiFetch('/api/vehicles/active');
        hideLoading();
        if (!res) return;

        const vehicles = res.vehicles.filter(v => v.status !== 'retrieved');
        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = `
            <h2 style="margin-top:0">CENTRO DE MENSAJES</h2>
            <p style="font-size:0.8rem; color:var(--muted); margin-bottom:20px;">SELECCIONE UN VEHÍCULO PARA CHATEAR CON EL CLIENTE</p>
            <div class="grid" style="grid-template-columns: 1fr; gap:10px; max-height:60vh; overflow-y:auto;">
                ${vehicles.map(v => `
                    <div class="card" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; padding:15px; border:1px solid var(--border);" onclick="closeModal(); viewVehicleDetail(${v.id})">
                        <div>
                            <div style="font-weight:900; font-size:1.1rem; color:var(--accent)">${v.plate}</div>
                            <div style="font-size:0.75rem; color:var(--muted)">${v.owner_name}</div>
                        </div>
                        <div style="color:var(--danger)">CHATEAR →</div>
                    </div>
                `).join('')}
                ${vehicles.length === 0 ? '<p style="text-align:center; color:var(--muted)">NO HAY VEHÍCULOS ACTIVOS</p>' : ''}
            </div>
            <button class="btn btn-secondary" style="width:100%; margin-top:20px" onclick="closeModal()">CERRAR</button>
        `;
        openModal();
    }
    async function loadSettings() {
        const data = await apiFetch('/api/settings');
        if (data) settings = { ...settings, ...data };
    }

    function openModal() { document.getElementById('modal-container').classList.add('open'); }
    function closeModal() { 
        document.getElementById('modal-container').classList.remove('open'); 
        if (window.lastTimer) { clearInterval(window.lastTimer); window.lastTimer = null; }
    }
    function fmtDate(d) { return d ? new Date(d).toLocaleString('es-VE') : '—'; }
    // --- ADMIN & HISTORY ---
    let isAdminAuthenticated = false;

    async function renderAdmin(el, tab = 'personal') {
        if (!isAdminAuthenticated) {
            const key = prompt('INGRESE CLAVE DE ADMINISTRADOR:');
            if (!key) return exitToPortal();
            const res = await apiFetch('/api/admin/verify', { method: 'POST', body: JSON.stringify({ key }) });
            if (res && res.valid) {
                isAdminAuthenticated = true;
            } else {
                toast('CLAVE INCORRECTA', 'error');
                return exitToPortal();
            }
        }

        el.innerHTML = `
            <div class="view-header">
                <h1 class="view-title">🔒 ADMINISTRACIÓN <small style="font-size:0.8rem; opacity:0.6;">v2.2.28</small></h1>
            </div>

            <div class="admin-tabs">
                <div class="admin-tab ${tab === 'personal' ? 'active' : ''}" onclick="renderAdmin(document.getElementById('current-view'), 'personal')">GESTIÓN DE PERSONAL</div>
                <div class="admin-tab ${tab === 'equipos' ? 'active' : ''}" onclick="renderAdmin(document.getElementById('current-view'), 'equipos')">GESTIÓN DE EQUIPOS</div>
                <div class="admin-tab ${tab === 'formatos' ? 'active' : ''}" onclick="renderAdmin(document.getElementById('current-view'), 'formatos')">GESTIÓN DE FORMATOS</div>
            </div>

            <div id="admin-content"></div>
            
            <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 30px; align-items: center;">
                <button class="btn btn-secondary" onclick="exitToPortal()" style="border-radius: 30px; padding: 10px 30px; font-size: 0.9rem; font-weight: 800; background: rgba(255,255,255,0.05); border: 1px solid var(--border); width: fit-content;">
                    🏠 VOLVER
                </button>
            </div>
            <div class="footer-info">COPYRIGHT EYE STAFF 2026</div>
        `;

        const content = document.getElementById('admin-content');
        if (tab === 'personal') {
            // Combinar General (Estadísticas/Control) y Personal (Staff)
            content.innerHTML = '<div id="admin-general-sub"></div><hr style="border:0; border-top:2px solid var(--border); margin:40px 0;"><div id="admin-staff-sub"></div>';
            renderAdminGeneral(document.getElementById('admin-general-sub'));
            renderStaff(document.getElementById('admin-staff-sub'));
        } else if (tab === 'equipos') {
            renderAdminAssets(content);
        } else if (tab === 'formatos') {
            renderAdminPayrollDashboard(content);
        }
    }

    async function renderAdminAssets(el) {
        el.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h3 style="margin:0">INVENTARIO DE EQUIPOS (TRACKING)</h3>
                <button class="btn btn-sm" onclick="showAddAssetModal()" style="padding:10px 20px; border-radius:12px; font-weight:800;">+ NUEVO EQUIPO</button>
            </div>
            <div id="assets-list-container" class="grid" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));">
                <p style="text-align:center; color:var(--muted); grid-column:1/-1;">Cargando inventario...</p>
            </div>
        `;

        const res = await apiFetch('/api/assets');
        const list = document.getElementById('assets-list-container');
        if (!res || !res.assets || res.assets.length === 0) {
            list.innerHTML = '<p style="text-align:center; color:var(--muted); grid-column:1/-1;">No hay equipos registrados para tracking.</p>';
            return;
        }

        list.innerHTML = res.assets.map(a => `
            <div class="card" style="padding:20px; border:1px solid var(--border); position:relative;">
                <div style="display:flex; align-items:center; gap:15px; margin-bottom:15px;">
                    <div style="width:45px; height:45px; background:var(--accent)20; color:var(--accent); border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.5rem;">
                        ${a.type === 'equipment' ? '🛠️' : '🚚'}
                    </div>
                    <div>
                        <div style="font-weight:900; color:white; font-size:1.1rem;">${a.name}</div>
                        <div style="font-size:0.6rem; color:var(--muted); text-transform:uppercase;">ID: ${a.id} • ${a.type}</div>
                    </div>
                </div>
                <div style="font-size:0.75rem; color:var(--muted); margin-bottom:15px;">${a.description || 'Sin descripción'}</div>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-sm btn-secondary" onclick="showEditAssetModal(${JSON.stringify(a).replace(/"/g, '&quot;')})" style="flex:1;">EDITAR</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteAsset(${a.id})" style="width:40px;">🗑️</button>
                </div>
            </div>
        `).join('');
    }

    function showAddAssetModal() {
        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = `
            <h2 style="margin-top:0">NUEVO EQUIPO/ACTIVO</h2>
            <div class="field">
                <label>Nombre del Activo</label>
                <input type="text" id="asset-name" placeholder="Ej: GRÚA 01, MOTO 05...">
            </div>
            <div class="field">
                <label>Tipo</label>
                <select id="asset-type">
                    <option value="equipment">Equipamiento (General)</option>
                    <option value="vehicle">Vehículo / Traslado</option>
                </select>
            </div>
            <div class="field">
                <label>Descripción / Observaciones</label>
                <textarea id="asset-desc" rows="3"></textarea>
            </div>
            <div style="display:flex; gap:10px; margin-top:20px;">
                <button class="btn" style="flex:1" onclick="saveAsset()">GUARDAR ACTIVO</button>
                <button class="btn btn-secondary" onclick="closeModal()">CANCELAR</button>
            </div>
        `;
        openModal();
    }

    async function saveAsset() {
        const name = document.getElementById('asset-name').value;
        const type = document.getElementById('asset-type').value;
        const description = document.getElementById('asset-desc').value;

        if (!name) return toast('Nombre requerido', 'error');

        showLoading('GUARDANDO...');
        const res = await apiFetch('/api/assets', {
            method: 'POST',
            body: JSON.stringify({ name, type, description })
        });
        hideLoading();

        if (res) {
            toast('✅ ACTIVO REGISTRADO', 'success');
            closeModal();
            renderAdmin(document.getElementById('current-view'), 'equipos');
        }
    }

    async function deleteAsset(id) {
        if (!confirm('¿Seguro que deseas eliminar este activo del inventario de tracking?')) return;
        showLoading('ELIMINANDO...');
        const res = await apiFetch('/api/assets/' + id, { method: 'DELETE' });
        hideLoading();
        if (res) {
            toast('🗑️ ACTIVO ELIMINADO', 'info');
            renderAdmin(document.getElementById('current-view'), 'equipos');
        }
    }

    function showEditAssetModal(a) {
        const modalBody = document.getElementById('modal-body');
        modalBody.innerHTML = `
            <h2 style="margin-top:0">EDITAR ACTIVO</h2>
            <div class="field">
                <label>Nombre del Activo</label>
                <input type="text" id="edit-asset-name" value="${a.name}">
            </div>
            <div class="field">
                <label>Tipo</label>
                <select id="edit-asset-type">
                    <option value="equipment" ${a.type === 'equipment' ? 'selected' : ''}>Equipamiento (General)</option>
                    <option value="vehicle" ${a.type === 'vehicle' ? 'selected' : ''}>Vehículo / Traslado</option>
                </select>
            </div>
            <div class="field">
                <label>Estado</label>
                <select id="edit-asset-status">
                    <option value="available" ${a.status === 'available' ? 'selected' : ''}>Disponible</option>
                    <option value="in_use" ${a.status === 'in_use' ? 'selected' : ''}>En Uso / Ruta</option>
                    <option value="maintenance" ${a.status === 'maintenance' ? 'selected' : ''}>Mantenimiento</option>
                </select>
            </div>
            <div class="field">
                <label>Descripción / Observaciones</label>
                <textarea id="edit-asset-desc" rows="3">${a.description || ''}</textarea>
            </div>
            <div style="display:flex; gap:10px; margin-top:20px;">
                <button class="btn" style="flex:1" onclick="updateAsset(${a.id})">ACTUALIZAR</button>
                <button class="btn btn-secondary" onclick="closeModal()">CANCELAR</button>
            </div>
        `;
        openModal();
    }

    async function updateAsset(id) {
        const name = document.getElementById('edit-asset-name').value;
        const type = document.getElementById('edit-asset-type').value;
        const status = document.getElementById('edit-asset-status').value;
        const description = document.getElementById('edit-asset-desc').value;

        if (!name) return toast('Nombre requerido', 'error');

        showLoading('ACTUALIZANDO...');
        const res = await apiFetch('/api/assets/' + id, {
            method: 'PUT',
            body: JSON.stringify({ name, type, status, description })
        });
        hideLoading();

        if (res) {
            toast('✅ ACTIVO ACTUALIZADO', 'success');
            closeModal();
            renderAdmin(document.getElementById('current-view'), 'equipos');
        }
    }


    async function renderAdminGeneral(el) {
        el.innerHTML = `
            <div class="stat-card" style="margin-bottom:30px; border-left:4px solid var(--accent2); background:rgba(67, 97, 238, 0.05);">
                <div class="stat-label" style="color:var(--accent2); font-size:0.9rem;">📚 DOCUMENTACIÓN OFICIAL</div>
                <div style="margin-top:15px; display:flex; flex-direction:column; gap:12px;">
                    <a href="/manual.html" target="_blank" class="btn" style="background:var(--accent2); text-decoration:none; height:45px; font-weight:800; display:grid; place-items:center;">📘 DESCARGAR MANUAL PDF</a>
                    <div style="background:var(--surface2); padding:15px; border-radius:10px; font-size:0.85rem; border:1px solid var(--border);">
                        <strong>Claves de Acceso del Sistema:</strong><br>
                        • Administración: <code>EYE-ADMIN-2026</code><br>
                        • Operativo: <code>STAFF-EYE-01</code>
                    </div>
                </div>
            </div>
            
            <div class="stat-card" style="margin-bottom:30px; border-left:4px solid ${window.activeSession ? 'var(--success)' : 'var(--danger)'}">
                <h3 style="margin-top:0; font-size:1rem;">CONTROL DE JORNADA (EVENTOS)</h3>
                <div id="admin-session-status-container">
                    <p style="font-size:0.75rem; color:var(--muted); margin-bottom:20px;">
                        ${window.activeSession ? 'Actualmente hay un evento en curso.' : 'No hay ningún evento activo. Inicie uno para comenzar la jornada.'}
                    </p>
                    <div style="display:flex; gap:12px;">
                        <button class="btn btn-secondary" onclick="startNewSession()" style="flex:1; height:50px; font-weight:800; ${window.activeSession ? 'opacity:0.5; pointer-events:none;' : ''}">INICIAR EVENTO</button>
                        <button class="btn btn-danger" onclick="closeSession()" style="flex:1; height:50px; font-weight:800; ${!window.activeSession ? 'opacity:0.5; pointer-events:none;' : ''}">FINALIZAR EVENTO</button>
                    </div>
                </div>
            </div>

            <div class="card" style="margin-bottom:30px">
                <h3 style="margin-top:0">CARGAR LISTA PREVIA (EXCEL/CSV)</h3>
                <p style="font-size:0.75rem; color:var(--muted); margin-bottom:15px;">FORMATO: PLACA, NOMBRE, CONTACTO, MARCA, MODELO</p>
                <div style="display:flex; flex-direction:column; gap:12px;">
                    <div style="display:flex; gap:10px;">
                        <input type="file" id="csv-file" accept=".csv" style="flex:1; padding:10px; background:var(--surface2); border-radius:8px; font-size:0.8rem;">
                        <button class="btn" onclick="uploadCSV()" style="padding:0 20px; font-weight:800;">SUBIR</button>
                    </div>
                    <button class="btn btn-secondary" onclick="downloadTemplate()" style="width:100%; height:45px; font-size:0.8rem; font-weight:800;">📥 DESCARGAR PLANTILLA (EXCEL)</button>
                </div>
            </div>

            <div class="card">
                <h3 style="margin-top:0">HISTORIAL DE EVENTOS CERRADOS</h3>
                <div id="admin-session-list" class="grid" style="grid-template-columns: 1fr; gap:10px;"></div>
            </div>
            <div id="admin-detail-container" style="margin-top:30px;"></div>
        `;
        loadAdminSessions();
    }

    async function uploadCSV() {
        const fileInput = document.getElementById('csv-file');
        if (!fileInput.files.length) return toast('SELECCIONE UN ARCHIVO', 'error');
        
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target.result;
            showLoading('PROCESANDO LISTA...');
            const res = await apiFetch('/api/admin/preload-csv', {
                method: 'POST',
                body: JSON.stringify({ csv: text })
            });
            hideLoading();
            if (res && res.success) {
                toast('LISTA PREVIA CARGADA: ' + res.count + ' VEHÍCULOS', 'success');
                fileInput.value = '';
            }
        };
        reader.readAsText(file);
    }

    async function loadAdminSessions() {
        const list = document.getElementById('admin-session-list');
        const sessions = await apiFetch('/api/admin/sessions');
        if (!sessions || sessions.length === 0) {
            list.innerHTML = '<p style="color:var(--muted)">No hay eventos cerrados registrados.</p>';
            return;
        }

        list.innerHTML = sessions.map(s => `
            <div class="card" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="viewAdminDetail(${s.id})">
                <div>
                    <div style="font-weight:700;">${s.name}</div>
                    <div style="font-size:0.8rem; color:var(--muted)">Finalizado: ${new Date(s.ended_at).toLocaleString()}</div>
                </div>
                <div style="color:var(--accent)">Ver Detalle →</div>
            </div>
        `).join('');
    }

    async function viewAdminDetail(id) {
        showLoading('Cargando detalle del evento...');
        const data = await apiFetch('/api/admin/sessions/' + id + '/detail');
        hideLoading();
        if (!data) return;

        const container = document.getElementById('admin-detail-container');
        container.innerHTML = `
            <div class="card" style="border:1px solid var(--accent)">
                <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:20px;">
                    <div>
                        <h2 style="margin:0">${data.session.name}</h2>
                        <p style="color:var(--muted)">Resumen de Auditoría</p>
                    </div>
                    <button class="btn btn-secondary" onclick="exportSessionCSV(${id})">📥 Exportar CSV (Excel)</button>
                </div>
                <div class="grid" style="margin-bottom:20px;">
                    <div class="stat-card"><h3>TOTAL VEHÍCULOS</h3><div class="stat-value">${data.stats.total_cars}</div></div>
                    <div class="stat-card"><h3>ENTREGADOS</h3><div class="stat-value">${data.stats.exits}</div></div>
                    <div class="stat-card"><h3>INGRESOS</h3><div class="stat-value">$${data.stats.revenue || 0}</div></div>
                </div>
                <div style="overflow-x:auto">
                    <table class="table" style="font-size:0.85rem;">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Placa</th>
                                <th>Entrada</th>
                                <th>Salida</th>
                                <th>Chofer In</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.vehicles.map(v => `
                                <tr>
                                    <td>${v.daily_seq || '—'}</td>
                                    <td><b>${v.plate}</b></td>
                                    <td>${new Date(v.check_in_at).toLocaleTimeString()}</td>
                                    <td>${v.check_out_at ? new Date(v.check_out_at).toLocaleTimeString() : '—'}</td>
                                    <td>${v.valet_in || '—'}</td>
                                    <td style="color:${v.status === 'retrieved' ? 'var(--accent2)' : 'var(--accent)'}">${v.status.toUpperCase()}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        container.scrollIntoView({ behavior: 'smooth' });
    }

    window.exportSessionCSV = async function(id) {
        const data = await apiFetch('/api/admin/sessions/' + id + '/detail');
        if (!data) return;
        
        let csv = 'DailySeq,Plate,Brand,Owner,CheckIn,CheckOut,ValetIn,Status,Revenue\n';
        data.vehicles.forEach(v => {
            csv += `${v.daily_seq},${v.plate},${v.brand},${v.owner_name},${v.check_in_at},${v.check_out_at || ''},${v.valet_in},${v.status},${v.fee_amount || 0}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Reporte_${data.session.name}.csv`;
        a.click();
    };

    async function closeSession() {
        if (!window.activeSession) return toast('No hay una sesión activa', 'warning');
        if (!confirm('¿CONFIRMAR CIERRE DEL EVENTO? ESTO GENERARÁ EL PDF Y EL EXCEL AUTOMÁTICAMENTE.')) return;
        
        showLoading('PROCESANDO CIERRE Y REPORTES...');
        const sid = window.activeSession.id;
        
        try {
            // Un solo llamado que cierra y envía reporte completo (PDF + EXCEL)
            const res = await apiFetch('/api/sessions/close', { 
                method: 'POST',
                body: JSON.stringify({ id: sid })
            });

            if (res) {
                toast('✅ EVENTO CERRADO: REPORTES ENVIADOS (PDF + EXCEL)', 'success');
                window.activeSession = null;
                await checkActiveSession();
                showTab('home');
            }
        } catch (e) {
            console.error('Error en cierre:', e);
            toast('Error al finalizar: ' + e.message, 'danger');
        } finally {
            hideLoading();
        }
    }

    async function loadPreListaCheckin() {
        const res = await apiFetch('/api/events/detail/PRE-LISTA');
        const container = document.getElementById('pre-lista-checkin');
        if (!container) return;
        if (res && res.list && res.list.length > 0) {
            container.innerHTML = res.list.map(v => `
                <div class="card" onclick="selectFromPreLista(${v.id})" style="padding:10px; cursor:pointer; border:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--surface); margin-bottom:5px">
                    <div>
                        <div style="font-weight:900; color:var(--accent)">${v.plate}</div>
                        <div style="font-size:0.75rem; color:var(--muted)">${v.owner_name}</div>
                    </div>
                    <div style="font-size:0.7rem; color:var(--accent2); font-weight:800">${v.brand || ''}</div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<div style="color:var(--muted); font-size:0.8rem; text-align:center; padding:20px;">NO HAY INVITADOS PENDIENTES</div>';
        }
    }

    async function selectFromPreLista(id) {
        showLoading('CARGANDO DATOS...');
        const v = await apiFetch('/api/vehicles/' + id);
        hideLoading();
        if (v) {
            document.getElementById('in-plate').value = v.plate || '';
            document.getElementById('in-owner').value = v.owner_name || '';
            document.getElementById('in-phone').value = v.owner_phone || '';
            document.getElementById('in-brand').value = v.brand || '';
            document.getElementById('in-model').value = v.model || '';
            toast('DATOS CARGADOS: ' + v.plate, 'success');
            document.getElementById('in-plate').scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    window.downloadTemplate = function() {
        const csv = 'PLACA,NOMBRE,CONTACTO,MARCA,MODELO\nABC-123,JUAN PEREZ,+584141234567,TOYOTA,COROLLA';
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'plantilla_valet_eye.csv';
        a.click();
    };

    function logout() { localStorage.removeItem('token'); location.reload(); }

    async function renderStaff(el) {
        el.innerHTML = `
            <div style="display: flex; gap: 10px; margin-bottom: 20px; align-items: center; justify-content: center;">
                <button class="btn btn-secondary" onclick="exitToPortal()" style="border-radius: 30px; padding: 10px 30px; font-size: 0.9rem; font-weight: 800; background: rgba(255,255,255,0.05); border: 1px solid var(--border);">
                    🏠 VOLVER
                </button>
                <div class="back-nav" onclick="showTab('admin')" style="margin:0; width: fit-content; background:transparent; border:none;">← VOLVER ATRÁS</div>
            </div>
            <div class="view-header"><h1 class="view-title">👥 GESTIÓN DE PERSONAL</h1></div>
            
            <!-- 1. REGISTRO -->
            <div class="stat-card" style="margin-bottom:30px; border-left:4px solid #6366f1;">
                <h2 style="margin-top:0; margin-bottom:20px; font-size:1rem; letter-spacing:1px; color:#fff;">REGISTRAR NUEVO EMPLEADO</h2>
                <div class="grid" style="grid-template-columns: 1.5fr 1fr 1fr 1fr; gap:15px; align-items: flex-end;">
                    <div class="field" style="margin-bottom:0;"><label>NOMBRE COMPLETO</label><input type="text" id="staff-name" placeholder="EJ: JUAN PÉREZ"></div>
                    <div class="field" style="margin-bottom:0;"><label>ROL</label>
                        <select id="staff-role" style="width:100%; height:45px; background:var(--surface2); border:1px solid var(--border); border-radius:8px; color:white; padding:0 10px;">
                            <option value="VALET / OPERADOR">VALET / OPERADOR</option>
                            <option value="SUPERVISOR">SUPERVISOR</option>
                            <option value="DIRECTOR">DIRECTOR</option>
                            <option value="ADMINISTRATIVO">ADMINISTRATIVO</option>
                        </select>
                    </div>
                    <div class="field" style="margin-bottom:0;"><label>PIN DE ACCESO (6 CARACT.)</label><input type="text" id="staff-pin" maxlength="6" value="eye001" placeholder="eye001"></div>
                    <button class="btn" onclick="saveNewStaff()" style="height:45px; background:#6366f1; font-weight:800;">GUARDAR EMPLEADO</button>
                </div>
            </div>

            <!-- 2. BUSCADOR Y LISTA -->
            <div style="margin-bottom:40px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border); padding-bottom:10px;">
                    <h2 style="margin:0; font-size:1rem; letter-spacing:1px; color:#fff;">LISTA DE PERSONAL ACTIVO</h2>
                    <button class="btn btn-sm btn-secondary" onclick="downloadStaffCSV()" style="font-size:0.7rem;">📥 DESCARGAR LISTA (CSV)</button>
                </div>
                
                <div class="field" style="max-width:500px; margin-bottom:20px;">
                    <label>🔍 BUSCAR POR NOMBRE...</label>
                    <input type="text" id="staff-search-input" placeholder="ESCRIBA PARA FILTRAR..." oninput="filterStaffList(this.value)" style="background:var(--surface2); border:2px solid var(--accent2);">
                </div>

                <div id="staff-list-container" style="overflow-x:auto; background:var(--surface); border-radius:16px; border:1px solid var(--border);">
                    <div style="text-align:center; padding:20px;">Cargando matriz de personal...</div>
                </div>
            </div>

            <!-- 3. IMPORTACIÓN (AL FINAL) -->
            <div class="card" style="margin-bottom:30px; opacity:0.9; background:rgba(255,255,255,0.02);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <h2 style="margin:0; font-size:1rem; letter-spacing:1px; color:#fff;">IMPORTACIÓN / ACTUALIZACIÓN RRHH</h2>
                    <button class="btn btn-sm btn-accent" onclick="downloadRRHHTemplate()" style="font-size:0.7rem;">📥 DESCARGAR PLANTILLA RRHH</button>
                </div>
                <p style="font-size:0.75rem; color:var(--muted); margin-bottom:10px;">FORMATO CSV REQUERIDO (11 COLUMNAS). EL SISTEMA ACTUALIZARÁ POR PIN O CREARÁ NUEVOS.</p>
                <div style="display:flex; gap:10px;">
                    <input type="file" id="staff-csv-file" accept=".csv" style="flex:1; padding:10px; background:var(--surface2); border-radius:8px; font-size:0.8rem;">
                    <button class="btn btn-secondary" onclick="importStaffCSV()" style="padding:0 20px; font-weight:800;">IMPORTAR</button>
                </div>
            </div>

            <div class="footer-info" style="margin-top:60px; text-align:center; opacity:0.5; font-size:0.8rem;">
                COPYRIGHT EYE STAFF 2026
            </div>
        `;
        loadStaffList();
    }

    let fullStaffData = [];
    let availableSessions = [];
    async function loadStaffList() {
        const res = await apiFetch('/api/staff');
        if (res) {
            fullStaffData = res.staff || [];
            availableSessions = res.sessions || [];
            renderFilteredStaff(fullStaffData);
        }
    }

    function filterStaffList(query) {
        const filtered = fullStaffData.filter(u => u.name.toLowerCase().includes(query.toLowerCase()));
        renderFilteredStaff(filtered);
    }

    function renderFilteredStaff(staffList) {
        const container = document.getElementById('staff-list-container');
        if (!container) return;

        if (staffList.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:20px; color:var(--muted);">Sin personal registrado</div>';
            return;
        }

        container.innerHTML = `
            <table style="width:100%; border-collapse: collapse; font-size:0.75rem; text-align:left; min-width:1400px;">
                <thead>
                    <tr style="background:var(--surface2); color:var(--muted); border-bottom:1px solid var(--border);">
                        <th style="padding:12px; min-width:150px;">NOMBRE</th>
                        <th style="padding:12px; width:100px;">ROL</th>
                        <th style="padding:12px; width:80px;">PIN (6)</th>
                        <th style="padding:12px; width:100px;">CÉDULA</th>
                        <th style="padding:12px; min-width:150px;">CARGO</th>
                        <th style="padding:12px; width:100px;">ESTATUS</th>
                        <th style="padding:12px; width:120px;">TELÉFONO</th>
                        <th style="padding:12px; min-width:180px;">EMAIL</th>
                        <th style="padding:12px; min-width:150px;">SECTOR</th>
                        <th style="padding:12px; min-width:200px;">DIRECCIÓN</th>
                        <th style="padding:12px; width:100px;">FECHA NAC.</th>
                        <th style="padding:12px; width:130px;">ASIGNAR EVENTO</th>
                        <th style="padding:12px;">ACCIONES</th>
                    </tr>
                </thead>
                <tbody>
                    ${staffList.map(u => `
                        <tr style="border-bottom:1px solid var(--border);">
                            <td style="padding:12px; font-weight:800; color:var(--brand-white); white-space:nowrap;">${u.name}</td>
                            <td style="padding:12px;">
                                <select onchange="updateStaffField(${u.id}, 'role', this.value)" style="background:transparent; border:none; color:var(--accent); font-weight:700; font-size:0.7rem;">
                                    <option value="driver" ${u.role === 'driver' ? 'selected' : ''}>VALET</option>
                                    <option value="supervisor" ${u.role === 'supervisor' ? 'selected' : ''}>SUPERVISOR</option>
                                    <option value="director" ${u.role === 'director' ? 'selected' : ''}>DIRECTOR</option>
                                </select>
                            </td>
                            <td style="padding:12px;">
                                <input type="text" value="${u.pin_hash || ''}" maxlength="6" 
                                    style="width:100%; background:rgba(255,255,255,0.05); border:1px solid var(--border); padding:4px; border-radius:4px; color:var(--success); font-family:var(--font-mono); font-size:0.7rem;"
                                    onchange="updateStaffField(${u.id}, 'pin_hash', this.value)">
                            </td>
                            <td style="padding:12px;">
                                <input type="text" value="${u.cedula || ''}" placeholder="CÉDULA"
                                    style="width:100%; background:transparent; border:none; color:var(--text); font-size:0.7rem;"
                                    onblur="updateStaffField(${u.id}, 'cedula', this.value)">
                            </td>
                            <td style="padding:12px;">
                                <input type="text" value="${u.cargo || ''}" placeholder="CARGO"
                                    style="width:100%; background:transparent; border:none; color:var(--text); font-size:0.7rem;"
                                    onblur="updateStaffField(${u.id}, 'cargo', this.value)">
                            </td>
                            <td style="padding:12px;">
                                <select onchange="updateStaffField(${u.id}, 'status', this.value)" style="background:transparent; border:none; color: ${u.status === 'ACTIVO' ? 'var(--success)' : 'var(--muted)'}; font-weight:700; font-size:0.7rem;">
                                    <option value="ACTIVO" ${u.status === 'ACTIVO' ? 'selected' : ''}>ACTIVO</option>
                                    <option value="INACTIVO" ${u.status === 'INACTIVO' ? 'selected' : ''}>INACTIVO</option>
                                </select>
                            </td>
                            <td style="padding:12px;">
                                <input type="text" value="${u.phone || ''}" placeholder="TEL"
                                    style="width:100%; background:transparent; border:none; color:var(--text); font-size:0.7rem;"
                                    onblur="updateStaffField(${u.id}, 'phone', this.value)">
                            </td>
                            <td style="padding:12px;">
                                <input type="text" value="${u.email || ''}" placeholder="EMAIL"
                                    style="width:100%; background:transparent; border:none; color:var(--text); font-size:0.7rem;"
                                    onblur="updateStaffField(${u.id}, 'email', this.value)">
                            </td>
                            <td style="padding:12px;">
                                <input type="text" value="${u.sector || ''}" placeholder="SECTOR"
                                    style="width:100%; background:transparent; border:none; color:var(--text); font-size:0.7rem;"
                                    onblur="updateStaffField(${u.id}, 'sector', this.value)">
                            </td>
                            <td style="padding:12px;">
                                <input type="text" value="${u.address || ''}" placeholder="DIRECCIÓN"
                                    style="width:100%; background:transparent; border:none; color:var(--text); font-size:0.7rem;"
                                    onblur="updateStaffField(${u.id}, 'address', this.value)">
                            </td>
                            <td style="padding:12px;">
                                <input type="text" value="${u.birth_date || ''}" placeholder="NACIMIENTO"
                                    style="width:100%; background:transparent; border:none; color:var(--text); font-size:0.7rem;"
                                    onblur="updateStaffField(${u.id}, 'birth_date', this.value)">
                            </td>
                            <td style="padding:12px;">
                                <select onchange="updateStaffField(${u.id}, 'current_session_id', this.value)" style="background:var(--surface2); border:1px solid var(--border); color:var(--warning); font-weight:700; border-radius:6px; font-size:0.7rem; width:100%;">
                                    <option value="">— SIN —</option>
                                    ${availableSessions.map(s => `<option value="${s.id}" ${u.current_session_id == s.id ? 'selected' : ''}>${s.name.toUpperCase()}</option>`).join('')}
                                </select>
                            </td>
                            <td style="padding:12px;">
                                <button class="btn btn-sm btn-danger" onclick="deleteStaff(${u.id})" style="padding:4px 8px; font-size:0.6rem;">✕</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    async function updateStaffField(id, field, value) {
        const res = await apiFetch('/api/staff/update', {
            method: 'POST',
            body: JSON.stringify({ id, field, value })
        });
        if (res && res.success) {
            toast('CAMBIO GUARDADO', 'success');
        }
    }

    async function logAttendance(type, userId = null) {
        if (!window.activeSession) return toast('No hay sesión activa', 'error');
        
        showLoading('REGISTRANDO...');
        const res = await apiFetch('/api/attendance/log', {
            method: 'POST',
            body: JSON.stringify({
                type: type,
                session_id: window.activeSession.id,
                user_id: userId
            })
        });
        
        if (res) {
            toast('REGISTRO EXITOSO', 'success');
            // Retardo de 500ms para asegurar persistencia en backend antes de refrescar
            setTimeout(() => {
                if (currentTab === 'home' && window.activeSession) {
                    loadHomeStaffTracking(window.activeSession.id);
                } else {
                    loadAttendanceStatus();
                }
            }, 500);
        }
        hideLoading();
    }

    // Auto-refresco de seguimiento operativo cada 30s
    setInterval(() => {
        if (currentTab === 'home' && window.activeSession) {
            loadHomeStaffTracking(window.activeSession.id);
        }
    }, 30000);

    async function saveNewStaff() {
        let name = document.getElementById('staff-name').value.trim();
        const role = document.getElementById('staff-role').value;
        const pin = document.getElementById('staff-pin').value.trim();
        
        if (!name || !pin) return toast('Nombre y PIN son obligatorios', 'warning');
        
        // Limpieza de nombre (LAST, FIRST -> FIRST LAST) y MAYÚSCULAS
        if (name.includes(',')) {
            const parts = name.split(',').map(p => p.trim());
            name = (parts[1] + ' ' + parts[0]);
        }
        name = name.toUpperCase();

        showLoading('REGISTRANDO...');
        const res = await apiFetch('/api/staff', {
            method: 'POST',
            body: JSON.stringify({ name, role, pin_hash: pin })
        });
        hideLoading();
        
        if (res) {
            toast('EMPLEADO REGISTRADO: ' + name, 'success');
            document.getElementById('staff-name').value = '';
            document.getElementById('staff-pin').value = '';
            loadStaffList();
        }
    }


    async function deleteStaff(id) {
        if (!confirm('¿ESTÁ SEGURO DE ELIMINAR A ESTE EMPLEADO?')) return;
        const res = await apiFetch('/api/staff/' + id, { method: 'DELETE' });
        if (res) {
            toast('Empleado eliminado', 'success');
            loadStaffList();
        }
    }

    async function importStaffCSV() {
        const fileInput = document.getElementById('staff-csv-file');
        if (!fileInput.files.length) return toast('Seleccione un archivo CSV', 'warning');
        
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target.result;
            showLoading('IMPORTANDO PERSONAL...');
            const res = await apiFetch('/api/staff/import', {
                method: 'POST',
                body: JSON.stringify({ csv: text })
            });
            hideLoading();
            if (res && res.success) {
                toast('IMPORTACIÓN EXITOSA: ' + res.count + ' EMPLEADOS', 'success');
                loadStaffList();
            }
        };
        reader.readAsText(file);
    }

    async function downloadStaffCSV() {
        const res = await apiFetch('/api/staff');
        if (res && res.staff) {
            const csvRows = [
                ['ID', 'NOMBRE', 'ROL', 'FECHA REGISTRO'].join(','),
                ...res.staff.map(u => [u.id, `"${u.name}"`, u.role, u.created_at].join(','))
            ];
            const csvString = csvRows.join('\n');
            const blob = new Blob([csvString], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.setAttribute('href', url);
            a.setAttribute('download', 'staff_eye_staff.csv');
            a.click();
        }
    }
    async function downloadRRHHTemplate() {
        const res = await apiFetch('/api/staff');
        if (res && res.staff) {
            const csvRows = [
                ['Item', 'Codigo(PIN)', 'Status', 'Cargo', 'Nombre', 'Cedula', 'Sector', 'Telefono', 'Familiar', 'TelFamiliar', 'Alergias'].join(','),
                ...res.staff.map((u, i) => [
                    i + 1, 
                    u.pin_hash || '1234', 
                    'ACTIVO', 
                    u.role.toUpperCase(), 
                    `"${u.name}"`, 
                    u.cedula || '', 
                    `"${u.sector || ''}"`, 
                    u.phone || '', 
                    `"${u.emergency_contact || ''}"`, 
                    u.emergency_phone || '', 
                    u.is_allergic || ''
                ].join(','))
            ];
            const csvString = csvRows.join('\n');
            const blob = new Blob([csvString], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.setAttribute('href', url);
            a.setAttribute('download', 'PLANTILLA_RRHH_EYE_STAFF.csv');
            a.click();
        }
    }

    async function renderPermissionsView() {
        const view = document.getElementById('current-view');
        showLoading('CARGANDO PERMISOS...');
        const data = await apiFetch('/api/admin/permissions');
        hideLoading();

        if (!data) return;

        const roles = ['driver', 'supervisor', 'director'];
        const roleLabels = { 'driver': 'OPERADOR VALET', 'supervisor': 'SUPERVISOR', 'director': 'ADMINISTRADOR' };

        view.innerHTML = `
            <div style="display: flex; gap: 10px; margin-bottom: 20px; align-items: center; justify-content: center;">
                <button class="btn btn-secondary" onclick="exitToPortal()" style="border-radius: 30px; padding: 10px 30px; font-size: 0.9rem; font-weight: 800; background: rgba(255,255,255,0.05); border: 1px solid var(--border);">
                    🏠 VOLVER
                </button>
                <div class="back-nav" onclick="showTab('admin')" style="margin:0; width: fit-content; background:transparent; border:none;">← VOLVER ATRÁS</div>
            </div>
            <div class="view-header">
                <h1 class="view-title">🔐 GESTIÓN DE PERMISOS</h1>
            </div>

            <div class="stat-card" style="margin-bottom:20px;">
                <label>SELECCIONAR PERFIL:</label>
                <select id="rbac-role-selector" class="input" style="margin-top:10px;" onchange="updatePermissionsTable(this.value)">
                    ${roles.map(r => `<option value="${r}">${roleLabels[r]}</option>`).join('')}
                </select>
            </div>

            <div id="permissions-table-container"></div>
        `;

        window.rbacData = data;
        updatePermissionsTable('driver');
    }

    function updatePermissionsTable(role) {
        const container = document.getElementById('permissions-table-container');
        const modules = window.rbacData.modules;
        const perms = window.rbacData.permissions;

        container.innerHTML = `
            <div class="stat-card">
                <h3 style="margin-top:0">MÓDULOS PERMITIDOS</h3>
                <div style="display:grid; gap:15px;">
                    ${modules.map(m => {
                        const isChecked = perms.find(p => p.role === role && p.module_id === m.id && p.can_view === 1);
                        return `
                            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; background:var(--surface2); border-radius:10px;">
                                <div>
                                    <div style="font-weight:700;">${m.display_name}</div>
                                    <div style="font-size:0.7rem; color:var(--muted)">${m.category}</div>
                                </div>
                                <input type="checkbox" style="width:25px; height:25px; accent-color:var(--success);" 
                                    ${isChecked ? 'checked' : ''} 
                                    onchange="togglePermission('${role}', '${m.id}', this.checked)">
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    async function togglePermission(role, moduleId, canView) {
        const res = await apiFetch('/api/admin/permissions', {
            method: 'POST',
            body: JSON.stringify({ role, module_id: moduleId, can_view: canView })
        });
        if (res && res.success) {
            toast('PERMISO ACTUALIZADO', 'success');
            // Actualizar caché local de permisos
            const data = await apiFetch('/api/admin/permissions');
            if (data) window.rbacData = data;
        }
    }

    function renderAccessControl(el) {
        if (!el) return;
        el.innerHTML = `
            <div id="access-control-view">
                <div class="view-header" style="justify-content: center; text-align: center; margin-bottom: 20px;">
                    <h1 class="view-title" style="color:#a855f7;">🆔 CONTROL DE ACCESOS DIGITAL 🚧</h1>
                </div>

                <div class="stat-card" style="border-top: 4px solid #a855f7; margin-bottom: 30px; background: rgba(168, 85, 247, 0.02);">
                    <p style="color:var(--muted); font-size:1rem; text-align:center; line-height:1.6; max-width:800px; margin:0 auto;">
                        Nuestro sistema de control de acceso integral equilibra la <b>seguridad técnica</b>, la <b>fluidez del ingreso</b> y la <b>recolección de datos estratégica</b> para transformar el flujo de personas en métricas accionables.
                    </p>
                </div>

                <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom:40px;">
                    <!-- ARQUITECTURA -->
                    <div class="stat-card">
                        <div class="stat-label" style="color:#a855f7">ARQUITECTURA DE ACCESO</div>
                        <div style="margin-top:15px; display:flex; flex-direction:column; gap:15px;">
                            <div style="background:var(--surface2); padding:15px; border-radius:12px; border:1px solid var(--border);">
                                <h3 style="margin-top:0; color:#fff; font-size:0.9rem;">👥 PARA INVITADOS / VIP</h3>
                                <ul style="margin:8px 0 0 0; padding-left:20px; font-size:0.75rem; color:var(--muted); line-height:1.4;">
                                    <li>QR Dinámico vía WhatsApp/Email</li>
                                    <li>Check-in rápido vía Tablets</li>
                                    <li>Brazaletes con NFC/RFID o Térmicos</li>
                                </ul>
                            </div>
                            <div style="background:var(--surface2); padding:15px; border-radius:12px; border:1px solid var(--border);">
                                <h3 style="margin-top:0; color:#fff; font-size:0.9rem;">👷 PARA STAFF / PROVEEDORES</h3>
                                <ul style="margin:8px 0 0 0; padding-left:20px; font-size:0.75rem; color:var(--muted); line-height:1.4;">
                                    <li>Acreditación Digital con Docs Legales</li>
                                    <li>Control de Horarios y Montajes</li>
                                    <li>Diferenciación de Zonas Restringidas</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <!-- MÉTRICAS -->
                    <div class="stat-card">
                        <div class="stat-label" style="color:#22c55e">DASHBOARD EN TIEMPO REAL</div>
                        <div style="margin-top:15px; display:flex; flex-direction:column; gap:15px;">
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                                <div style="background:rgba(34, 197, 94, 0.1); padding:15px; border-radius:12px; text-align:center;">
                                    <div style="font-size:0.6rem; color:#22c55e; font-weight:800; text-transform:uppercase;">Show-up Rate</div>
                                    <div style="font-size:1.5rem; font-weight:900; color:#fff;">--%</div>
                                </div>
                                <div style="background:rgba(34, 197, 94, 0.1); padding:15px; border-radius:12px; text-align:center;">
                                    <div style="font-size:0.6rem; color:#22c55e; font-weight:800; text-transform:uppercase;">Aforo Actual</div>
                                    <div style="font-size:1.5rem; font-weight:900; color:#fff;">--/--</div>
                                </div>
                            </div>
                            <div style="background:var(--surface2); padding:15px; border-radius:12px; border:1px solid var(--border);">
                                <h3 style="margin-top:0; color:#fff; font-size:0.9rem;">📊 KPIs ESTRATÉGICOS</h3>
                                <ul style="margin:8px 0 0 0; padding-left:20px; font-size:0.75rem; color:var(--muted); line-height:1.4;">
                                    <li>Curva de Afluencia Horaria</li>
                                    <li>Índice de Recurrencia (Loyalty)</li>
                                    <li>Tiempo de Permanencia Promedio</li>
                                    <li>Alertas VVIP e Incidencias</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="stat-card" style="margin-bottom:40px;">
                    <div class="stat-label">FLUJO OPERATIVO "LLAVE EN MANO"</div>
                    <div style="overflow-x:auto; margin-top:15px;">
                        <table style="width:100%; border-collapse:collapse; font-size:0.8rem; text-align:left;">
                            <thead>
                                <tr style="border-bottom:2px solid var(--border);">
                                    <th style="padding:10px;">ETAPA</th>
                                    <th style="padding:10px;">ACCIÓN DIGITAL</th>
                                    <th style="padding:10px;">ELEMENTO FÍSICO</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr style="border-bottom:1px solid var(--border);">
                                    <td style="padding:10px; font-weight:700;">PRE-EVENTO</td>
                                    <td style="padding:10px; color:var(--muted);">Registro landing y base de datos</td>
                                    <td style="padding:10px; color:#a855f7;">Envío de QR digital</td>
                                </tr>
                                <tr style="border-bottom:1px solid var(--border);">
                                    <td style="padding:10px; font-weight:700;">INGRESO</td>
                                    <td style="padding:10px; color:var(--muted);">Escaneo y validación ID</td>
                                    <td style="padding:10px; color:#a855f7;">Colocación brazalete</td>
                                </tr>
                                <tr style="border-bottom:1px solid var(--border);">
                                    <td style="padding:10px; font-weight:700;">DURANTE</td>
                                    <td style="padding:10px; color:var(--muted);">Monitoreo zonas de calor/VIP</td>
                                    <td style="padding:10px; color:#a855f7;">Uso para consumos (NFC)</td>
                                </tr>
                                <tr style="border-bottom:1px solid var(--border);">
                                    <td style="padding:10px; font-weight:700;">POST-EVENTO</td>
                                    <td style="padding:10px; color:var(--muted);">Cierre asistencia y encuestas</td>
                                    <td style="padding:10px; color:#a855f7;">Dashboard final KPIs</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="grid" style="grid-template-columns: 1fr 1fr; gap:20px; margin-bottom:60px;">
                    <div class="stat-card" style="border-left:4px solid var(--accent);">
                        <div class="stat-label">HARDWARE Y LOGÍSTICA</div>
                        <ul style="margin:10px 0 0 0; padding-left:20px; font-size:0.8rem; color:var(--muted); line-height:1.6;">
                            <li><b>Handhelds Industriales</b> de alto rendimiento</li>
                            <li><b>Infraestructura Física:</b> Unifilas y tótems</li>
                            <li><b>Conectividad:</b> Wi-Fi Móvil o Starlink</li>
                            <li><b>Modo Offline:</b> Escaneo sin internet</li>
                        </ul>
                    </div>
                    <div class="stat-card" style="border-left:4px solid var(--warning);">
                        <div class="stat-label">PERFILES DE STAFF</div>
                        <ul style="margin:10px 0 0 0; padding-left:20px; font-size:0.8rem; color:var(--muted); line-height:1.6;">
                            <li>Hostess / Recepción VIP Bilingüe</li>
                            <li>Validadores de Alto Volumen (Scanners)</li>
                            <li>Gestores de Acreditación Staff</li>
                            <li>Supervisores de Flujo (Lead Staff)</li>
                        </ul>
                    </div>
                </div>

                <div style="text-align:center; margin-bottom:40px;">
                    <button class="btn btn-secondary" onclick="exitToPortal()" style="border-radius: 30px; padding: 10px 30px; font-size: 0.9rem; font-weight: 800; background: rgba(255,255,255,0.05); border: 1px solid var(--border);">
                        🏠 VOLVER
                    </button>
                </div>
            </div>
        `;
    }

    function renderRentaEquipos(el) {
        if (!el) return;
        el.innerHTML = `
            <div id="renta-view">
                <div class="view-header" style="justify-content: center; text-align: center; margin-bottom: 20px;">
                    <h1 class="view-title" style="color:#6366f1;">🏗️ RENTA DE EQUIPOS PRO</h1>
                    <div style="background:#6366f120; color:#6366f1; padding:5px 15px; border-radius:20px; font-size:0.7rem; font-weight:900; margin-top:5px;">WORKFLOW RENTMAN</div>
                </div>

                <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom:30px;">
                    <!-- 1. PLANIFICACIÓN -->
                    <div class="stat-card" style="border-top: 4px solid #6366f1;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div class="stat-label">PLANIFICACIÓN Y FALTANTES</div>
                            <span style="background:#ef444420; color:#ef4444; padding:2px 8px; border-radius:10px; font-size:0.6rem; font-weight:800;">4 SHORTAGES</span>
                        </div>
                        <p style="font-size:0.7rem; color:var(--muted); margin:10px 0;">Espejo estratégico de Rentman. Gestiona traslados y sub-alquileres.</p>
                        <div style="background:var(--surface2); padding:10px; border-radius:8px; font-size:0.7rem; margin-top:10px;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                                <span>LED Screen P2.6</span>
                                <span style="color:#ef4444; font-weight:800;">-12 m²</span>
                            </div>
                            <div style="display:flex; gap:5px;">
                                <button class="btn btn-sm" style="font-size:0.6rem; padding:4px 8px; background:var(--accent);">SOLICITAR SUB-ALQUILER</button>
                            </div>
                        </div>
                    </div>

                    <!-- 2. ALMACÉN -->
                    <div class="stat-card" style="border-top: 4px solid #22c55e;">
                        <div class="stat-label">ALMACÉN: PACK & PREP</div>
                        <p style="font-size:0.7rem; color:var(--muted); margin:10px 0;">Digital Packing List. Escaneo obligatorio de salida y retorno.</p>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
                            <button class="btn" style="background:#22c55e; font-size:0.7rem; padding:12px;">📤 SALIDA (CHECK-OUT)</button>
                            <button class="btn" style="background:var(--surface2); border:1px solid #22c55e; color:#22c55e; font-size:0.7rem; padding:12px;">📥 RETORNO (CHECK-IN)</button>
                        </div>
                        <div style="margin-top:10px; font-size:0.6rem; color:#22c55e; font-weight:700;">● 2 PROYECTOS LISTOS PARA CARGA</div>
                    </div>

                    <!-- 3. LOGÍSTICA -->
                    <div class="stat-card" style="border-top: 4px solid #f59e0b;">
                        <div class="stat-label">LOGÍSTICA: ON-SITE</div>
                        <p style="font-size:0.7rem; color:var(--muted); margin:10px 0;">Entrega, montaje y conformidad. Reporte de incidencias in-situ.</p>
                        <div style="background:var(--surface2); padding:12px; border-radius:10px; margin-top:10px;">
                            <div style="font-size:0.7rem; font-weight:800; margin-bottom:5px;">📍 HOTEL RITZ - SALÓN REAL</div>
                            <div style="display:flex; justify-content:space-between; font-size:0.6rem;">
                                <span style="color:var(--muted);">Estado: Montaje</span>
                                <span style="color:#f59e0b;">Ver Hoja de Ruta →</span>
                            </div>
                        </div>
                    </div>

                    <!-- 4. ACTIVOS -->
                    <div class="stat-card" style="border-top: 4px solid #3b82f6;">
                        <div class="stat-label">GESTIÓN DE ACTIVOS</div>
                        <p style="font-size:0.7rem; color:var(--muted); margin:10px 0;">Base de datos física y estado de inventario por semáforo.</p>
                        <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
                            <div style="display:flex; align-items:center; gap:8px; font-size:0.7rem;">
                                <span style="width:8px; height:8px; border-radius:50%; background:#3b82f6;"></span>
                                <span>820 DISPONIBLES</span>
                            </div>
                            <div style="display:flex; align-items:center; gap:8px; font-size:0.7rem;">
                                <span style="width:8px; height:8px; border-radius:50%; background:#f59e0b;"></span>
                                <span>145 ALQUILADOS</span>
                            </div>
                            <div style="display:flex; align-items:center; gap:8px; font-size:0.7rem;">
                                <span style="width:8px; height:8px; border-radius:50%; background:#ef4444;"></span>
                                <span>12 EN REPARACIÓN</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- SECCIÓN DE SEGURIDAD RENTMAN -->
                <div class="stat-card" style="background:rgba(99, 102, 241, 0.05); border:1px dashed #6366f1; margin-bottom:40px;">
                    <div style="display:flex; align-items:center; gap:15px;">
                        <div style="font-size:2rem;">🛡️</div>
                        <div>
                            <div style="font-size:0.8rem; font-weight:900; color:#6366f1; text-transform:uppercase;">Protocolo de Seguridad Rentman</div>
                            <p style="font-size:0.7rem; color:var(--muted); margin:5px 0;">No se permite cerrar un servicio si el escaneo no coincide al 100% con la lista de empaque (Digital Packing List).</p>
                        </div>
                    </div>
                </div>

                <div style="text-align:center; margin-bottom:40px;">
                    <button class="btn btn-secondary" onclick="exitToPortal()" style="border-radius: 30px; padding: 10px 30px; font-size: 0.9rem; font-weight: 800; background: rgba(255,255,255,0.05); border: 1px solid var(--border);">
                        🏠 VOLVER
                    </button>
                </div>
            </div>
        `;
    }

    async function renderAdminPayrollDashboard(el) {
        showLoading('CARGANDO FORMATOS DE COBRO...');
        const res = await apiFetch('/api/admin/payroll-submissions');
        hideLoading();

        if (!res || !res.submissions) return;

        // Consolidado por empleado y Total General
        let totalGeneral = 0;
        const consolidated = {};
        res.submissions.forEach(s => {
            if (!consolidated[s.staff_name]) {
                consolidated[s.staff_name] = { total: 0, events: 0, bank: s.bank_name || 'N/A', account: s.bank_account || 'N/A' };
            }
            const amt = s.amount || 0;
            consolidated[s.staff_name].total += amt;
            consolidated[s.staff_name].events += 1;
            totalGeneral += amt;
        });

        el.innerHTML = `
            <div class="stat-card" style="margin-bottom:30px; background:linear-gradient(135deg, var(--accent) 0%, #4361ee 100%); border:none; color:white;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-size:0.8rem; opacity:0.8; font-weight:800; letter-spacing:1px;">TOTAL POR JORNADA DE RECEPCIÓN</div>
                        <div style="font-size:2.5rem; font-weight:900; margin-top:5px;">$${totalGeneral.toLocaleString()}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:0.8rem; opacity:0.8; font-weight:800;">FORMATOS PROCESADOS</div>
                        <div style="font-size:1.8rem; font-weight:800;">${res.submissions.length}</div>
                    </div>
                </div>
            </div>

            <div class="stat-card" style="margin-bottom:20px; border-top:4px solid var(--accent);">
                <h3 style="margin-top:0; font-size:1rem; color:var(--accent);">📊 RESUMEN CONSOLIDADO (POR EMPLEADO)</h3>
                <div style="overflow-x:auto;">
                    <table class="table" style="font-size:0.8rem;">
                        <thead>
                            <tr>
                                <th>EMPLEADO</th>
                                <th>EVENTOS</th>
                                <th>ENTIDAD BANCARIA</th>
                                <th>NÚMERO DE CUENTA</th>
                                <th>TOTAL ACUMULADO</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(consolidated).map(([name, data]) => `
                                <tr>
                                    <td style="font-weight:800;">${name}</td>
                                    <td>${data.events}</td>
                                    <td>${data.bank}</td>
                                    <td style="font-family:var(--font-mono);">${data.account}</td>
                                    <td style="color:var(--success); font-weight:800;">$${data.total.toLocaleString()}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="stat-card" style="border-top:4px solid var(--warning);">
                <h3 style="margin-top:0; font-size:1rem; color:var(--warning);">📝 DETALLE DE FORMATOS GESTIONADOS</h3>
                <div style="overflow-x:auto;">
                    <table class="table" style="font-size:0.75rem;">
                        <thead>
                            <tr>
                                <th>FECHA</th>
                                <th>EMPLEADO</th>
                                <th>EVENTO</th>
                                <th>MONTO ($)</th>
                                <th>ESTADO</th>
                                <th>ACCIÓN</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${res.submissions.map(s => `
                                <tr>
                                    <td>${new Date(s.created_at).toLocaleDateString()}</td>
                                    <td style="font-weight:700;">${s.staff_name}</td>
                                    <td>${s.event_name}</td>
                                    <td>
                                        <input type="number" value="${s.amount}" id="amount-${s.id}" 
                                            style="width:80px; background:rgba(255,255,255,0.05); border:1px solid var(--border); padding:4px; border-radius:4px; color:var(--success); font-weight:800;">
                                    </td>
                                    <td>
                                        <select id="status-${s.id}" style="background:var(--surface2); border:1px solid var(--border); color:var(--text); font-size:0.7rem; padding:4px; border-radius:4px;">
                                            <option value="pending" ${s.status === 'pending' ? 'selected' : ''}>PENDIENTE</option>
                                            <option value="approved" ${s.status === 'approved' ? 'selected' : ''}>APROBADO</option>
                                            <option value="paid" ${s.status === 'paid' ? 'selected' : ''}>PAGADO</option>
                                        </select>
                                    </td>
                                    <td>
                                        <button class="btn btn-sm" onclick="updatePayrollSubmission(${s.id})" style="padding:4px 8px; font-size:0.6rem;">GUARDAR</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }


    async function updatePayrollSubmission(id) {
        const amount = parseFloat(document.getElementById('amount-' + id).value);
        const status = document.getElementById('status-' + id).value;
        
        showLoading('GUARDANDO CAMBIOS...');
        const res = await apiFetch('/api/admin/update-payroll-submission', {
            method: 'POST',
            body: JSON.stringify({ id, amount, status })
        });
        hideLoading();
        
        if (res && res.success) {
            toast('FORMATO ACTUALIZADO', 'success');
            renderAdmin(document.getElementById('current-view'), 'formatos');
        }
    }
