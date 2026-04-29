    function renderMonitoreo(el) {
        el.innerHTML = `
            <div style="margin-bottom:15px; display:flex; justify-content:flex-start;">
                <button class="btn btn-secondary btn-sm" onclick="exitToPortal()" style="border-radius:10px; padding:8px 15px; font-weight:800; background:rgba(255,255,255,0.05); border:1px solid var(--border);">← VOLVER AL PORTAL</button>
            </div>
            <div class="view-header">
                <h1 class="view-title">🛰️ MONITOREO REAL-TIME</h1>
            </div>
            
            <div class="grid">
                <div class="stat-card">
                    <div class="stat-label">ESTADO DEL RASTREO</div>
                    <div class="stat-value" style="color:var(--success)">ACTIVO</div>
                    <div style="margin-top:10px; font-size:0.7rem; color:var(--muted);">ENVIANDO COORDENADAS CADA 30S</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">DISPOSITIVOS ACTIVOS</div>
                    <div class="stat-value">1</div>
                    <div style="margin-top:10px; font-size:0.7rem; color:var(--muted);">TU DISPOSITIVO ACTUAL</div>
                </div>
            </div>

            <div class="card" style="margin-top:20px; padding:20px; border:1px solid var(--border); border-radius:16px; background:var(--surface);">
                <h3 style="margin-top:0; font-size:1rem; border-bottom:1px solid var(--border); padding-bottom:10px;">INFRAESTRUCTURA DE RASTREO (v2.2.28)</h3>
                <p style="color:var(--muted); font-size:0.8rem;">SISTEMA DE GEOLOCALIZACIÓN PARA PERSONAL EN CAMPO Y ACTIVOS DE LOGÍSTICA ACTIVADO.</p>
                <div style="background:#000; height:200px; border-radius:12px; display:grid; place-items:center; border:1px solid var(--border);">
                    <div style="text-align:center;">
                        <i style="font-size:2rem; display:block; margin-bottom:10px;">🗺️</i>
                        <span style="font-size:0.7rem; color:var(--muted);">MAPA DE CALOR EN DESARROLLO</span>
                    </div>
                </div>
            </div>
        `;
        startGPSTracking();
    }
