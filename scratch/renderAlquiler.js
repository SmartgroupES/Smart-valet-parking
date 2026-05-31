    async function renderAlquiler(el) {
        if (!el) return;
        el.innerHTML = `
            <div style="display: flex; justify-content: flex-start; margin-bottom: 20px;">
                ${getVolverBtn('VOLVER AL PORTAL', 'renderPortal(document.getElementById(\\'current-view\\'))')}
            </div>
            <div class="view-header" style="justify-content: center; text-align: center; margin-bottom: 20px;">
                <h1 class="view-title" style="color:var(--warning);">🏗️ ALQUILER DE EQUIPOS</h1>
            </div>
            <div id="alquiler-loading" style="text-align:center; color:var(--muted); padding:20px;">Cargando logística de equipos...</div>
            <div id="alquiler-list" style="display:grid; grid-template-columns:1fr; gap:15px;"></div>
            <div style="display: flex; justify-content: center; margin-top: 40px; margin-bottom: 60px;">
                ${getVolverBtn('VOLVER AL PORTAL', 'renderPortal(document.getElementById(\\'current-view\\'))')}
            </div>
        `;
        
        try {
            const res = await apiFetch('/api/rentals');
            document.getElementById('alquiler-loading').style.display = 'none';
            if (res && res.success && res.rentals && res.rentals.length > 0) {
                const list = document.getElementById('alquiler-list');
                list.innerHTML = res.rentals.map(r => {
                    const statusColors = {
                        'planning': 'var(--muted)',
                        'delivering': 'var(--warning)',
                        'delivered': '#3b82f6',
                        'retrieving': '#a855f7',
                        'completed': 'var(--success)'
                    };
                    const statusLabels = {
                        'planning': 'PLANIFICACIÓN',
                        'delivering': 'EN TRÁNSITO (ENTREGA)',
                        'delivered': 'ENTREGADO EN SITIO',
                        'retrieving': 'EN TRÁNSITO (RETIRO)',
                        'completed': 'COMPLETADO'
                    };
                    const color = statusColors[r.status] || 'var(--muted)';
                    const label = statusLabels[r.status] || r.status.toUpperCase();
                    
                    let form = {};
                    try { if(r.form_data) form = JSON.parse(r.form_data); } catch(e){}
                    
                    return \`
                        <div style="background:var(--surface2); border:1px solid var(--border); border-radius:12px; padding:15px;">
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:10px;">
                                <div>
                                    <div style="font-weight:900; font-size:1.1rem; color:#fff;">\${r.evento.toUpperCase()}</div>
                                    <div style="color:var(--muted); font-size:0.8rem; font-weight:700;">\${r.empresa.toUpperCase()} | \${form.atencion || 'N/A'}</div>
                                    <div style="color:var(--accent); font-size:0.75rem; font-weight:900; margin-top:4px;">PRESUPUESTO #\${r.budget_id}</div>
                                </div>
                                <div style="text-align:right;">
                                    <div style="background:rgba(255,255,255,0.05); border:1px solid \${color}; color:\${color}; padding:4px 8px; border-radius:6px; font-size:0.7rem; font-weight:900; margin-bottom:5px;">\${label}</div>
                                    <div style="font-size:0.7rem; color:var(--muted); font-weight:700;">\${r.fecha} \${form.inicio ? '- ' + form.inicio : ''}</div>
                                </div>
                            </div>
                            
                            <div style="font-size:0.8rem; color:#fff; margin-bottom:15px;">
                                <div style="margin-bottom:5px;"><b>DIRECCIÓN:</b> \${form.direccion || 'N/A'}</div>
                                <div><b>LUGAR:</b> \${form.lugar || 'N/A'} - \${form.ciudad || ''}</div>
                            </div>
                            
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                                <select onchange="updateAlquilerStatus('\${r.budget_id}', this.value)" style="width:100%; padding:8px; border-radius:8px; background:var(--background); color:#fff; border:1px solid var(--border); font-weight:bold; font-size:0.8rem;">
                                    <option value="planning" \${r.status==='planning'?'selected':''}>PLANIFICACIÓN</option>
                                    <option value="delivering" \${r.status==='delivering'?'selected':''}>INICIAR ENTREGA</option>
                                    <option value="delivered" \${r.status==='delivered'?'selected':''}>MARCAR ENTREGADO</option>
                                    <option value="retrieving" \${r.status==='retrieving'?'selected':''}>INICIAR RETIRO</option>
                                    <option value="completed" \${r.status==='completed'?'selected':''}>COMPLETADO</option>
                                </select>
                                <button onclick="toast('Funcionalidad de soportes (fotos/firma) en desarrollo', 'info')" style="width:100%; padding:8px; border-radius:8px; background:var(--accent); color:#000; border:none; font-weight:900; font-size:0.8rem; cursor:pointer;">
                                    📸 SOPORTES
                                </button>
                            </div>
                        </div>
                    \`;
                }).join('');
            } else {
                document.getElementById('alquiler-list').innerHTML = '<div style="text-align:center; color:var(--muted); padding:20px;">No hay alquileres activos en este momento.</div>';
            }
        } catch (e) {
            document.getElementById('alquiler-loading').innerText = 'Error al cargar logística de alquileres';
        }
    }
    
    window.updateAlquilerStatus = async function(budgetId, newStatus) {
        const res = await apiFetch('/api/rentals/' + budgetId + '/status', {
            method: 'POST',
            body: JSON.stringify({ status: newStatus, notes: '' })
        });
        if(res && res.success) {
            toast('Estado actualizado a ' + newStatus, 'success');
            renderAlquiler(document.getElementById('current-view'));
        } else {
            toast('Error al actualizar estado', 'error');
        }
    }
