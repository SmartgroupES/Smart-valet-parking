const fs = require('fs');
let html = fs.readFileSync('frontend/index.html', 'utf8');

// 1. Add lista-presupuesto input to Gestión de Listas
const inputTarget = `                            <div style="grid-column: span 1;">
                                <label style="font-size:0.7rem; color:var(--muted); font-weight:700;">NOMBRE DE CLIENTE</label>`;
const inputReplacement = `                            <div style="grid-column: span 1;">
                                <label style="font-size:0.7rem; color:var(--muted); font-weight:700;">Nº PRESUPUESTO</label>
                                <input type="text" id="lista-presupuesto" class="input-field" placeholder="Opcional" readonly style="width:100%; margin-top:5px; border-radius:12px; padding:12px; box-sizing:border-box; background:rgba(0,0,0,0.2); opacity:0.8;">
                            </div>
                            <div style="grid-column: span 1;">
                                <label style="font-size:0.7rem; color:var(--muted); font-weight:700;">NOMBRE DE CLIENTE</label>`;
html = html.replace(inputTarget, inputReplacement);

// 2. Add budget_id to POST /api/sessions/plan and POST /api/sessions/update
// In guardarLista():
const payloadTarget = `                    event_end_time: document.getElementById('lista-hora-fin')?.value || '',
                    event_end_date: document.getElementById('lista-fecha-fin')?.value || ''
                })
            });`;
const payloadReplacement = `                    event_end_time: document.getElementById('lista-hora-fin')?.value || '',
                    event_end_date: document.getElementById('lista-fecha-fin')?.value || '',
                    budget_id: document.getElementById('lista-presupuesto')?.value || null
                })
            });`;
html = html.replace(payloadTarget, payloadReplacement);

// 3. Trigger notify-hr in cambiarEstatusPresupuesto
const statusTarget = `        const res = await apiFetch('/api/presupuestos/' + id, {
            method: 'PUT',
            body: JSON.stringify(d)
        });
        if(res.success) {
            toast('Estatus actualizado a ' + d.estatus, 'success');
        } else {`;
const statusReplacement = `        const res = await apiFetch('/api/presupuestos/' + id, {
            method: 'PUT',
            body: JSON.stringify(d)
        });
        if(res.success) {
            toast('Estatus actualizado a ' + d.estatus, 'success');
            if (d.estatus === 'APROBADO') {
                showLoading('NOTIFICANDO A RRHH...');
                try {
                    await apiFetch('/api/presupuestos/notify-hr', {
                        method: 'POST',
                        body: JSON.stringify(d)
                    });
                    toast('Notificación enviada a RRHH', 'success');
                } catch(e) {
                    console.error(e);
                    toast('Error al notificar a RRHH', 'error');
                } finally {
                    hideLoading();
                }
            }
        } else {`;
html = html.replace(statusTarget, statusReplacement);

// 4. URL parsing
const urlTarget = `        // Handle QR scanning and redirect
        const urlParams = new URLSearchParams(window.location.search);`;
const urlReplacement = `        // Handle QR scanning and redirect
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('action') === 'create_session_from_budget' && urlParams.get('budget_id')) {
            const budgetId = urlParams.get('budget_id');
            // Wait for app to initialize slightly, then load budget data
            setTimeout(async () => {
                showLoading('CARGANDO DATOS DEL PRESUPUESTO...');
                try {
                    const res = await apiFetch('/api/presupuestos');
                    if (res.success && res.budgets) {
                        const b = res.budgets.find(x => x.id == budgetId);
                        if (b) {
                            const bform = typeof b.form_data === 'string' ? JSON.parse(b.form_data) : (b.form_data || {});
                            // Prepare fields
                            document.getElementById('lista-nombre').value = b.evento || '';
                            document.getElementById('lista-tipo').value = bform.tipoEvento || 'VALET PARKING';
                            document.getElementById('lista-direccion').value = bform.direccion || '';
                            document.getElementById('lista-contacto').value = bform.atencion || '';
                            document.getElementById('lista-telefono').value = bform.telefonos || '';
                            if (document.getElementById('lista-presupuesto')) {
                                document.getElementById('lista-presupuesto').value = b.id;
                            }
                            
                            // Fechas y horas
                            const bdate = (b.fecha && b.fecha !== 'N/A') ? b.fecha : (bform.fecha || '');
                            document.getElementById('lista-fecha-fin').value = bdate; // It's type text? No, it's a date input in modern browsers, format yyyy-mm-dd
                            
                            document.getElementById('lista-hora-inicio').value = bform.inicio || '';
                            document.getElementById('lista-hora-fin').value = bform.fin || '';
                            
                            if (document.getElementById('lista-observaciones')) {
                                document.getElementById('lista-observaciones').value = bform.notas || '';
                            }
                            
                            // Open modal
                            window.editingSessionId = null;
                            document.getElementById('lista-modal-title').textContent = 'NUEVO EVENTO';
                            document.getElementById('modal-lista').style.display = 'flex';
                            
                            toast('Datos precargados desde presupuesto', 'success');
                        } else {
                            toast('Presupuesto no encontrado', 'error');
                        }
                    }
                } catch(e) {
                    console.error(e);
                    toast('Error cargando presupuesto', 'error');
                } finally {
                    hideLoading();
                }
            }, 1000);
            
            // Cleanup URL
            window.history.replaceState({}, document.title, "/");
        }
        `;
html = html.replace(urlTarget, urlReplacement);

// 5. Update EVENTOS PROGRAMADOS logic to filter out mapped budgets
// The earlier logic added futureBudgets from window._globalBudgets
const filterTarget = `                                                    const futureBudgets = window._globalBudgets.filter(b => {
                                                        if (b.estatus !== 'APROBADO') return false;`;
const filterReplacement = `                                                    const futureBudgets = window._globalBudgets.filter(b => {
                                                        if (b.estatus !== 'APROBADO') return false;
                                                        // Filter out if a session exists with this budget_id
                                                        if ((window.allSessions || []).some(sess => sess.budget_id == b.id)) return false;`;
html = html.replace(filterTarget, filterReplacement);

// Also need to pre-fill budget_id when editing a session
const editSessionTarget = `        document.getElementById('lista-direccion').value = s.address || '';
        document.getElementById('lista-contacto').value = s.contact_name || '';`;
const editSessionReplacement = `        document.getElementById('lista-direccion').value = s.address || '';
        document.getElementById('lista-contacto').value = s.contact_name || '';
        if(document.getElementById('lista-presupuesto')) document.getElementById('lista-presupuesto').value = s.budget_id || '';`;
html = html.replace(editSessionTarget, editSessionReplacement);

// And clear it in clearListaForm()
const clearFormTarget = `        document.getElementById('lista-direccion').value = '';
        document.getElementById('lista-contacto').value = '';`;
const clearFormReplacement = `        document.getElementById('lista-direccion').value = '';
        document.getElementById('lista-contacto').value = '';
        if(document.getElementById('lista-presupuesto')) document.getElementById('lista-presupuesto').value = '';`;
html = html.replace(clearFormTarget, clearFormReplacement);


fs.writeFileSync('frontend/index.html', html);
console.log("Done");
