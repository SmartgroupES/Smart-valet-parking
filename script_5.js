
const PRESUPUESTO_CATALOGO = [
    { desc: "Personal de Guardia Nocturna", precio: 2000 },
    { desc: "Coordinador de Area", precio: 4500 },
    { desc: "Personal de Logística, Prevención y Control", precio: 2300 },
    { desc: "Supervisor", precio: 5500 },
    { desc: "Servicio de Alquiler de Radios de Comunicación UHF", precio: 1200 },
    { desc: "Desayunos", precio: 550 },
    { desc: "Almuerzos", precio: 600 },
    { desc: "Cenas", precio: 600 },
    { desc: "Viáticos para Comida e Hidratación", precio: 0 },
    { desc: "Personal de Protocolo y Logística", precio: 0 },
    { desc: "Personal de Montaje y Desmontaje", precio: 0 },
    { desc: "Custodia de Artistas y Personalidades", precio: 0 },
    { desc: "Personal de Vallet Parking", precio: 0 },
    { desc: "Equipos de Vialidad", precio: 0 },
    { desc: "Postes Separadores de Colas", precio: 0 },
    { desc: "Toldos", precio: 0 },
    { desc: "Baños Portátiles", precio: 0 },
    { desc: "Alquiler de Extintores", precio: 0 },
    { desc: "Sistema de Monitoreo Móvil hasta 8 cámaras", precio: 0 }
];

let itemsPresupuesto = [];

function renderPresupuestos(el) {
    itemsPresupuesto = []; // reset
    el.innerHTML = `
        <div style="margin-bottom:15px; display:flex; justify-content:flex-start;">
            ${getVolverBtn('VOLVER A DIRECCIÓN EYE STAFF', 'renderVipEyeStaff(document.getElementById(\'current-view\'))')}
        </div>
        
        <div style="display:flex; justify-content:center; margin-bottom:20px;">
            <div style="display:flex; background:rgba(0,0,0,0.2); border-radius:12px; padding:5px;">
                <button id="btn-tab-historial" onclick="switchPresupuestoTab('historial')" style="padding:10px 20px; font-weight:bold; border-radius:8px; border:none; background:var(--accent); color:white; cursor:pointer; font-size:1rem; transition:0.3s;">HISTORIAL <span id="historial-tab-count" style="background:#ef4444; color:white; border-radius:10px; padding:2px 8px; font-size:0.7rem; vertical-align:middle; margin-left:5px;">0</span></button>
                <button id="btn-tab-generador" onclick="switchPresupuestoTab('generador')" style="padding:10px 20px; font-weight:bold; border-radius:8px; border:none; background:transparent; color:var(--muted); cursor:pointer; font-size:1rem; transition:0.3s;">PRESUPUESTO</button>
            </div>
        </div>
        
        <div id="tab-generador-content" style="display:none;">
        <div class="card" style="max-width:900px; margin:0 auto; background:var(--surface); border:1px solid var(--border); padding:30px; border-radius:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px;">
                <h3 id="generador-title" style="color:#a855f7; margin:0; font-weight:900;">NUEVO PRESUPUESTO</h3>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:20px;">
                <div class="field" style="grid-column: 1 / -1; display:flex; gap:15px; margin-bottom:5px;">
                    <div style="flex:1;">
                        <label>Nº PRESUPUESTO</label>
                        <input type="text" id="pres-correlativo" readonly style="width:100%; height:42px; background:rgba(0,0,0,0.2); border:1px solid var(--border); color:var(--muted); border-radius:8px; padding:0 10px; font-weight:900;">
                    </div>
                    <div style="flex:2;">
                        <label>Presupuestado por:</label>
                        <select id="pres-empresa-emisora" style="width:100%; height:42px; background:var(--surface2); border:1px solid var(--border); color:#fff; border-radius:8px; padding:0 10px;" onchange="window.fetchNextBudgetId()">
                            <option value="EYE STAFF">EYE STAFF</option>
                            <option value="RENTAEQUIPOS">RENTAEQUIPOS</option>
                        </select>
                    </div>
                </div>
                <div class="field"><label>NOMBRE DE CLIENTE</label><input type="text" id="pres-atencion" placeholder="Ej. RAQUEL DAHER"></div>
                <div class="field"><label>EMPRESA</label><input type="text" id="pres-empresa" placeholder="Ej. EMPORIO GROUP" list="lista-empresas" onchange="autoFillEmpresa()" onblur="autoFillEmpresa()">
                    <datalist id="lista-empresas"></datalist>
                </div>
                <div class="field"><label>TELÉFONO</label><input type="text" id="pres-telefonos" placeholder="Teléfono"></div>
                <div class="field"><label>E-MAIL</label><input type="email" id="pres-email" placeholder="Correo"></div>
                
                <div class="field" style="grid-column: 1 / -1; display:grid; grid-template-columns:1fr 1fr 1fr; gap:15px;">
                    <div><label>NOMBRE DEL EVENTO</label><input type="text" id="pres-evento" placeholder="Ej. MIS DULCE 15"></div>
                    <div><label>TIPO DE EVENTO</label>
                        <select id="pres-tipo-evento" style="width:100%; height:42px; background:var(--surface2); border:1px solid var(--border); color:#fff; border-radius:8px; padding:0 10px;">
                            <option value="VALET PARKING">VALET PARKING</option>
                            <option value="CONTROL DE ACCESOS">CONTROL DE ACCESOS</option>
                            <option value="ALQUILER DE EQUIPOS">ALQUILER DE EQUIPOS</option>
                            <option value="TRASLADOS">TRASLADOS</option>
                            <option value="GUARDIA DIURNA/NOCTURNA">GUARDIA DIURNA/NOCTURNA</option>
                            <option value="CUSTODIA">CUSTODIA</option>
                        </select>
                    </div>
                    <div><label>Nº DE ASISTENTES</label><input type="text" id="pres-personas" placeholder="Aforo"></div>
                </div>

                <div class="field" style="grid-column: 1 / -1;">
                    <label>DIRECCIÓN DEL EVENTO</label>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <input type="text" id="pres-direccion" placeholder="Ej. Quinta La Esmeralda, Campo Alegre" style="flex:1;" oninput="updatePresupuestoMap()">
                    </div>
                    <div style="margin-top:10px; height:200px; border-radius:12px; overflow:hidden; border:1px solid var(--border);">
                        <iframe id="pres-map-iframe" width="100%" height="100%" frameborder="0" style="border:0; filter: grayscale(0.5) contrast(1.2) opacity(0.8);" src="https://www.google.com/maps?q=Caracas&output=embed" allowfullscreen></iframe>
                    </div>
                </div>

                <div class="field"><label>LUGAR DEL EVENTO</label><input type="text" id="pres-lugar" placeholder="Ej. CCCT"></div>
                <div class="field"><label>CIUDAD</label><input type="text" id="pres-ciudad" placeholder="Ej. CARACAS"></div>

                <div class="field" style="grid-column: 1 / -1;">
                    <div style="display:flex; gap:10px; align-items:center;">
                        <div style="flex:1"><label>FECHA DEL EVENTO</label><input type="date" id="pres-fecha" onchange="syncFechaFinYCalc()" style="background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:0 10px; color:#fff; width:100%; height:42px;"></div>
                        <div style="flex:1"><label>HORA DE INICIO</label><input type="text" id="pres-inicio" placeholder="HH:MM" maxlength="5" oninput="if(this.value.length === 2 && !this.value.includes(':')) this.value += ':'" style="background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:0 10px; color:#fff; width:100%; height:42px; text-align:center;"></div>
                    </div>
                </div>
                
                <div class="field" style="grid-column: 1 / -1;">
                    <div style="display:flex; gap:10px; align-items:center;">
                        <div style="flex:1"><label>FECHA TENTATIVA CULMINACIÓN</label><input type="date" id="pres-fecha-fin" onchange="calcPresupuestoDias()" style="background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:0 10px; color:#fff; width:100%; height:42px;"></div>
                        <div style="flex:1"><label>HORA CULMINACIÓN</label><input type="text" id="pres-fin-hora" placeholder="HH:MM" maxlength="5" oninput="if(this.value.length === 2 && !this.value.includes(':')) this.value += ':'" style="background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:0 10px; color:#fff; width:100%; height:42px; text-align:center;"></div>
                    </div>
                </div>

                <div class="field"><label>CANTIDAD DE DÍAS (AUTOCALCULADO)</label><input type="number" id="pres-dias" value="1" readonly style="background:rgba(255,255,255,0.05); cursor:not-allowed;"></div>
                <div class="field"><label>% IVA</label><input type="number" id="pres-iva" value="12" onchange="calcularTotales()"></div>
            </div>

            <h3 style="color:#a855f7; margin-bottom:15px; font-weight:900; margin-top:30px; display:flex; justify-content:space-between; align-items:center;">
                LÍNEAS DE SERVICIO
                <button type="button" class="btn" onclick="addPresupuestoItem()" style="font-size:0.8rem; padding:8px 15px; background:var(--success); color:white;">+ AGREGAR SERVICIO</button>
            </h3>
            
            <div style="overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse; font-size:0.85rem; text-align:left; color:#fff;">
                    <thead>
                        <tr style="border-bottom:2px solid var(--border); color:var(--muted);">
                            <th style="padding:10px;">CANT.</th>
                            <th style="padding:10px; width:40%;">DESCRIPCIÓN</th>
                            <th style="padding:10px;">PRECIO U.</th>
                            <th style="padding:10px;">DÍAS</th>
                            <th style="padding:10px;">TOTAL</th>
                            <th style="padding:10px;"></th>
                        </tr>
                    </thead>
                    <tbody id="pres-items-body">
                    </tbody>
                    <tfoot>
                        <tr style="border-top:2px solid var(--border); font-weight:900;">
                            <td colspan="4" style="text-align:right; padding:15px 10px;">SUBTOTAL:</td>
                            <td id="pres-subtotal" style="padding:15px 10px;">0.00</td>
                            <td></td>
                        </tr>
                        <tr style="font-weight:900;">
                            <td colspan="4" style="text-align:right; padding:5px 10px;">IVA:</td>
                            <td id="pres-total-iva" style="padding:5px 10px;">0.00</td>
                            <td></td>
                        </tr>
                        <tr style="font-weight:900; font-size:1.1rem; color:var(--success);">
                            <td colspan="4" style="text-align:right; padding:15px 10px;">TOTAL A PAGAR:</td>
                            <td id="pres-gran-total" style="padding:15px 10px;">0.00</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <div style="margin-top:30px;">
                <div style="display:flex; gap:10px; margin-bottom:10px;">
                    <button class="btn" onclick="abrirModalGuardar()" style="flex:1; height:60px; font-size:1.2rem; font-weight:900; background:var(--surface2); border:1px solid var(--accent); color:white; border-radius:12px;">💾 GUARDAR PRESUPUESTO</button>
                    <button id="btn-iniciar-presupuesto" class="btn" onclick="if(window.currentEditingPresupuestoId) window.location.href='/?view=listas&action=create_session_from_budget&budget_id='+window.currentEditingPresupuestoId" style="display:none; flex:1; height:60px; font-size:1.2rem; font-weight:900; background:#22c55e; border:none; color:white; border-radius:12px; box-shadow:0 0 15px rgba(34,197,94,0.4);">▶ INICIAR EVENTO</button>
                </div>

            </div>
            </div>
        </div>
        </div>

        <div id="tab-historial-content" style="display:block;">
        <div class="card" style="width:100%; max-width:1200px; margin:0 auto; background:var(--surface); border:1px solid var(--border); padding:20px 30px; border-radius:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="color:#a855f7; margin:0; font-weight:900;">HISTORIAL DE PRESUPUESTOS <span id="historial-count" style="background:#ef4444; color:white; border-radius:10px; padding:2px 8px; font-size:0.8rem; vertical-align:middle; margin-left:10px;">0</span></h3>
            </div>
            
            <div id="historial-container" style="display:block; margin-top:20px;">
                <input type="text" id="historial-search" oninput="renderHistorialPresupuestos()" placeholder="Buscar por fecha, cliente, evento o número correlativo..." style="width:100%; padding:12px; background:var(--surface2); border:1px solid var(--border); color:#fff; border-radius:8px; margin-bottom:15px;">
                <div id="historial-list" style="max-height:600px; overflow-y:auto; display:flex; flex-direction:column; gap:10px;">
                </div>
            </div>
        </div>
    `;
    
    setTimeout(() => {
        if(window.loadEmpresasToDatalist) window.loadEmpresasToDatalist();
        if(window.renderHistorialPresupuestos) window.renderHistorialPresupuestos();
    }, 100);

    window.currentEditingPresupuestoId = null;
    window.currentEditingPresupuestoTimestamp = null;

    // Auto-add an empty row
    addPresupuestoItem();
    if (window.fetchNextBudgetId) window.fetchNextBudgetId();
}

window.toggleReportSubscription = async function(checkboxElement, userId, reportId) {
    checkboxElement.disabled = true; // Disable during request
    const originalState = checkboxElement.checked;
    
    try {
        let fieldMap = {
            'convocatoria': 'convocatoria',
            'cumpleanos': 'cumpleanos',
            'dossier': 'dossier_pdf',
            'excel': 'bbdd_excel',
            'nominas': 'nominas',
            'permisos': 'permisos',
            'plantilla': 'plantilla_rrhh',
            'actualizacion_datos': 'actualizacion_datos'
        };
        const res = await apiFetch('/api/admin/report-subscriptions', {
            method: 'POST',
            body: JSON.stringify({
                user_id: userId,
                field: fieldMap[reportId] || reportId,
                value: originalState
            })
        });
        
        if (res && res.success) {
            toast('Suscripción actualizada', 'success');
        } else {
            throw new Error(res?.error || 'Error al actualizar');
        }
    } catch (e) {
        console.error('Error toggle subscription:', e);
        toast('❌ ' + e.message, 'error');
        checkboxElement.checked = !originalState; // Revert visually
    } finally {
        checkboxElement.disabled = false;
    }
};

window.switchPresupuestoTab = function(tab) {
    const btnGen = document.getElementById('btn-tab-generador');
    const btnHist = document.getElementById('btn-tab-historial');
    const contentGen = document.getElementById('tab-generador-content');
    const contentHist = document.getElementById('tab-historial-content');
    
    if (tab === 'generador') {
        btnGen.style.background = 'var(--accent)';
        btnGen.style.color = 'white';
        btnHist.style.background = 'transparent';
        btnHist.style.color = 'var(--muted)';
        contentGen.style.display = 'block';
        contentHist.style.display = 'none';
    } else {
        btnHist.style.background = 'var(--accent)';
        btnHist.style.color = 'white';
        btnGen.style.background = 'transparent';
        btnGen.style.color = 'var(--muted)';
        contentHist.style.display = 'block';
        contentGen.style.display = 'none';
        if(window.renderHistorialPresupuestos) window.renderHistorialPresupuestos();
    }
}

window._globalBudgets = [];

window.eliminarPresupuestoFront = async function(e, id) {
    e.stopPropagation();
    if (!confirm(`¿Estás seguro de que deseas eliminar el presupuesto #${id}? No se mostrará más aquí.`)) return;

    try {
        const res = await apiFetch(`/api/presupuestos/${id}`, {
            method: 'DELETE'
        });
        if (res && res.success) {
            toast('Presupuesto eliminado de la vista', 'success');
            if (window.renderHistorialPresupuestos) window.renderHistorialPresupuestos();
        } else {
            toast(res?.error || 'Error al eliminar', 'error');
        }
    } catch (err) {
        toast('Error de conexión', 'error');
    }
};

window.renderHistorialPresupuestos = async function() {
    const listEl = document.getElementById('historial-list');
    const countEl = document.getElementById('historial-count');
    const tabCountEl = document.getElementById('historial-tab-count');
    const searchVal = (document.getElementById('historial-search') ? document.getElementById('historial-search').value.toLowerCase() : '');
    
    if(!listEl || !countEl) return;
    
    try {
        const res = await apiFetch('/api/presupuestos');
        if (!res.success) throw new Error(res.error || 'Error fetching');
        
        let data = res.budgets || [];
        data = data.map(d => ({
            ...d,
            form: typeof d.form_data === 'string' ? JSON.parse(d.form_data) : d.form_data,
            items: typeof d.items_data === 'string' ? JSON.parse(d.items_data) : d.items_data
        }));
        
        window._globalBudgets = data;
        const totalPendientes = data.filter(d => (d.estatus || 'GENERADO') !== 'APROBADO').length;
        countEl.textContent = totalPendientes;
        if(tabCountEl) tabCountEl.textContent = totalPendientes;
    
    if(searchVal) {
        data = data.filter(d => 
            (d.id && d.id.toLowerCase().includes(searchVal)) || 
            (d.empresa && d.empresa.toLowerCase().includes(searchVal)) ||
            (d.evento && d.evento.toLowerCase().includes(searchVal)) ||
            (d.fecha && d.fecha.toLowerCase().includes(searchVal))
        );
    }
    
    // Sort all budgets by correlativo desc (de mayor a menor)
    data.sort((a, b) => parseInt(String(b.id || '').replace(/\\D/g, '') || 0) - parseInt(String(a.id || '').replace(/\\D/g, '') || 0));
    
    let html = '';
    
    const renderTable = (tableData, title, titleColor) => {
        if(tableData.length === 0) return '';
        let tHtml = `<h4 style="color:${titleColor}; margin-top:25px; margin-bottom:10px; font-weight:900; padding-left:5px; font-size: 0.9rem; text-transform: uppercase;">${title} (${tableData.length})</h4>`;
        tHtml += `<div style="border-radius:12px; border:1px solid var(--border); background:rgba(0,0,0,0.1); margin-bottom:20px; overflow-x:auto;">
            <div style="display:grid; grid-template-columns: 45px minmax(90px, 1.5fr) minmax(70px, 1fr) minmax(70px, 1fr) minmax(80px, 1fr) 70px 70px 95px; gap:6px; background:var(--surface2); padding:10px; border-bottom:1px solid var(--border); border-radius:12px 12px 0 0; font-weight:900; color:var(--muted); font-size:0.6rem; letter-spacing:0px; width:100%;">
                <div>ID</div>
                <div>CONTACTO</div>
                <div>EMPRESA</div>
                <div style="text-align:center;">TIPO DE EVENTO</div>
                <div>EVENTO</div>
                <div>FECHA</div>
                <div>TOTAL</div>
                <div>ESTATUS</div>
            </div>`;
        
        tHtml += `<div style="height: 250px; overflow-y: auto; overflow-x: hidden;">`;
        
        tHtml += tableData.map((d, index) => {
            const status = d.estatus || 'GENERADO';
            const isLast = index === tableData.length - 1;
            const tipo = (d.form && d.form.tipoEvento) ? d.form.tipoEvento : 'VALET PARKING';
            
            let displayFecha = d.fecha;
            if (!displayFecha || displayFecha === 'N/A') {
                displayFecha = (d.form && d.form.fecha) ? d.form.fecha : 'N/A';
            }
            
            return `
                <div style="display:grid; grid-template-columns: 45px minmax(90px, 1.5fr) minmax(70px, 1fr) minmax(70px, 1fr) minmax(80px, 1fr) 70px 70px 95px; gap:6px; padding:10px; border-bottom:${isLast ? 'none' : '1px solid var(--border)'}; align-items:center; transition:background 0.2s; font-size:0.65rem; width:100%;" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='transparent'">
                    <div style="cursor:pointer;" onclick="cargarPresupuestoDesdeHistorial('${d.id}', ${d.timestamp})">
                        <span style="font-weight:900; color:var(--brand-white); border-bottom:1px dashed var(--accent);">#${d.id}</span>
                    </div>
                    <div style="font-weight:bold; white-space:normal; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; line-height:1.2;" title="${(d.form && d.form.atencion) ? d.form.atencion : 'N/A'}">${(d.form && d.form.atencion) ? d.form.atencion : 'N/A'}</div>
                    <div style="font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--muted);" title="${d.empresa}">${d.empresa}</div>
                    <div style="color:var(--warning); font-size:0.55rem; font-weight:800; text-align:center; display:flex; align-items:center; justify-content:center; white-space:normal; line-height:1.2; height:100%;" title="${tipo}">${tipo}</div>
                    <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--muted);" title="${d.evento}">${d.evento}</div>
                    <div style="color:var(--muted); font-weight:700; white-space:nowrap;">${displayFecha}</div>
                    <div style="font-weight:900; color:var(--success); white-space:nowrap;">${d.monto}</div>
                    <div>
                        <select class="table-control" onclick="event.stopPropagation()" onchange="cambiarEstatusPresupuesto(event, '${d.id}', ${d.timestamp})" style="font-weight:700; color:${status === 'APROBADO' ? 'var(--success)' : 'var(--muted)'}; font-size:0.65rem; padding:6px 4px; border-radius:6px; background:rgba(255,255,255,0.05); border:1px solid ${status === 'APROBADO' ? 'var(--success)' : 'var(--border)'}; width:100%; outline:none; cursor:pointer;">
                            <option value="ENVIADO" ${status==='ENVIADO'?'selected':''} style="color:var(--muted)">ENVIADO</option>
                            <option value="MODIFICADO Y ENVIADO" ${status==='MODIFICADO Y ENVIADO'?'selected':''} style="color:var(--muted)">MOD Y ENVIADO</option>
                            <option value="APROBADO" ${status==='APROBADO'?'selected':''} style="color:var(--success)">APROBADO</option>
                            <option value="NO APROBADO" ${status==='NO APROBADO'?'selected':''} style="color:var(--danger)">NO APROBADO</option>
                        </select>
                    </div>
                </div>
            `;
        }).join('');
        tHtml += `</div></div>`;
        return tHtml;
    };

    if (data.length > 0) {
        const pendientes = data.filter(d => (d.estatus || 'GENERADO') !== 'APROBADO');
        const aprobados = data.filter(d => (d.estatus || 'GENERADO') === 'APROBADO');
        
        html += renderTable(pendientes, 'En Proceso / Pendientes', 'var(--warning)');
        html += renderTable(aprobados, 'Presupuestos Aprobados (Archivo)', 'var(--success)');
    } else {
        html = '<div style="color:var(--muted); text-align:center; padding:20px;">No se encontraron presupuestos.</div>';
    }
    
    listEl.innerHTML = html;
    
    } catch(e) {
        console.error('Error fetching budgets:', e);
        listEl.innerHTML = '<div style="color:var(--danger); text-align:center;">Error cargando historial de presupuestos.</div>';
    }
}

window.cambiarEstatusPresupuesto = async function(e, id, timestamp) {
    e.stopPropagation();
    const d = window._globalBudgets.find(x => x.id === id);
    if (!d) return;

    const nuevoEstatus = e.target.value;
    const estatusAnterior = d.estatus;
    
    // Revertir visualmente mientras se valida
    e.target.value = estatusAnterior;

    // Mostrar modal de PIN
    window._pendingStatusChange = { selectEl: e.target, budgetObj: d, nuevoEstatus, estatusAnterior };
    document.getElementById('modal-pin-estatus').style.display = 'flex';
    document.getElementById('pin-estatus-input').value = '';
    document.getElementById('pin-estatus-input').focus();
    document.getElementById('pin-estatus-label').textContent = `Confirmar cambio a "${nuevoEstatus}"`;
};

window.confirmarCambioEstatusConPin = async function() {
    const pin = document.getElementById('pin-estatus-input').value.trim();
    if (!pin) return toast('Debe ingresar su clave', 'error');

    const { selectEl, budgetObj, nuevoEstatus, estatusAnterior } = window._pendingStatusChange || {};
    if (!budgetObj) return;

    // Verificar PIN contra el servidor
    const resPin = await apiFetch('/api/verify-pin', { method: 'POST', body: JSON.stringify({ pin }) });
    if (!resPin || !resPin.success) {
        toast('Clave incorrecta. Cambio de estatus cancelado.', 'error');
        document.getElementById('modal-pin-estatus').style.display = 'none';
        return;
    }

    // PIN correcto: aplicar cambio
    document.getElementById('modal-pin-estatus').style.display = 'none';
    budgetObj.estatus = nuevoEstatus;
    selectEl.value = nuevoEstatus;

    if (nuevoEstatus === 'APROBADO') {
        selectEl.style.color = 'var(--success)';
        selectEl.style.borderColor = 'var(--success)';
    } else {
        selectEl.style.color = 'var(--muted)';
        selectEl.style.borderColor = 'var(--border)';
    }

    const res = await apiFetch('/api/presupuestos/' + budgetObj.id, {
        method: 'PUT',
        body: JSON.stringify(budgetObj)
    });
    if (res.success) {
        toast('Estatus actualizado a ' + nuevoEstatus, 'success');
    } else {
        budgetObj.estatus = estatusAnterior;
        selectEl.value = estatusAnterior;
        toast('Error al actualizar estatus: ' + res.error, 'error');
        if (window.renderHistorialPresupuestos) window.renderHistorialPresupuestos();
    }
};

window.cancelarCambioEstatus = function() {
    document.getElementById('modal-pin-estatus').style.display = 'none';
    const { selectEl, estatusAnterior } = window._pendingStatusChange || {};
    if (selectEl) selectEl.value = estatusAnterior;
};


window.generarDesdeHistorial = async function(e, id, tipo) {
    e.stopPropagation();
    const d = window._globalBudgets.find(x => x.id === id);
    if (!d) return;
    
    await cargarPresupuestoDesdeHistorial(id, d.timestamp);
    await accionPresupuesto(tipo);
    switchPresupuestoTab('historial');
    if (window.renderPresupuestos) window.renderPresupuestos(document.getElementById('current-view'));
}

window.cargarPresupuestoDesdeHistorial = function(id, timestamp) {
    const data = window._globalBudgets || [];
    const d = data.find(x => x.id === id);
    if(!d) return toast('Error al cargar presupuesto', 'error');

    const f = d.form || {};
    
    document.getElementById('pres-empresa-emisora').value = f.empresaEmisora || 'EYE STAFF';
    if(document.getElementById('pres-correlativo')) document.getElementById('pres-correlativo').value = id;
    document.getElementById('pres-empresa').value = f.emp || d.empresa || '';
    document.getElementById('pres-atencion').value = f.atencion || '';
    document.getElementById('pres-telefonos').value = f.telefonos || '';
    document.getElementById('pres-email').value = f.email || '';
    document.getElementById('pres-tipo-evento').value = f.tipoEvento || 'PRESUPUESTO';
    document.getElementById('pres-evento').value = f.evento || d.evento || '';
    document.getElementById('pres-personas').value = f.personas || '';
    document.getElementById('pres-direccion').value = f.direccion || '';
    document.getElementById('pres-lugar').value = f.lugar || '';
    document.getElementById('pres-ciudad').value = f.ciudad || '';
    
    // Si la versión antigua tenía convocatoria, ignorarla o mostrarla en consola
    
    document.getElementById('pres-inicio').value = f.inicio || '';
    document.getElementById('pres-fecha').value = f.fecha || d.fecha || '';
    document.getElementById('pres-fecha-fin').value = f.fecha_fin || '';
    document.getElementById('pres-fin-hora').value = f.fin_hora || '';
    
    // Cargar items
    itemsPresupuesto = d.items || [];
    renderPresupuestoItems();
    
    window.currentEditingPresupuestoId = d.id;
    window.currentEditingPresupuestoTimestamp = d.timestamp;
    document.getElementById('generador-title').innerHTML = `MODIFICANDO PRESUPUESTO #${d.id}`;
    
    // Si está aprobado y no es sesión, mostrar botón INICIAR EVENTO
    const isApproved = d.estatus === 'APROBADO';
    const isAlreadySession = (window.allSessions || []).some(sess => sess.budget_id == d.id);
    if (document.getElementById('btn-iniciar-presupuesto')) {
        document.getElementById('btn-iniciar-presupuesto').style.display = (isApproved && !isAlreadySession) ? 'block' : 'none';
    }
    
    // Cambiar a la pestaña de generador para ver el presupuesto
    switchPresupuestoTab('generador');
    
    // Auto-scroll hacia arriba
    document.getElementById('current-view').scrollIntoView({ behavior: 'smooth' });
    toast('Presupuesto cargado exitosamente', 'success');
}

window.fetchNextBudgetId = async function() {
    if (window.currentEditingPresupuestoId) return;
    const empresa = document.getElementById('pres-empresa-emisora').value;
    try {
        const res = await apiFetch(`/api/presupuestos/next-id?empresa=${encodeURIComponent(empresa)}`);
        if (res && res.success && document.getElementById('pres-correlativo')) {
            document.getElementById('pres-correlativo').value = res.nextId;
        }
    } catch(e) {
        console.error('Error fetching next ID:', e);
    }
};

window.nuevoPresupuesto = function() {
    window.currentEditingPresupuestoId = null;
    window.currentEditingPresupuestoTimestamp = null;
    document.getElementById('generador-title').innerHTML = 'NUEVO PRESUPUESTO';
    if (document.getElementById('btn-iniciar-presupuesto')) document.getElementById('btn-iniciar-presupuesto').style.display = 'none';
    
    const fields = ['pres-empresa', 'pres-atencion', 'pres-telefonos', 'pres-email', 'pres-evento', 'pres-personas', 'pres-direccion', 'pres-lugar', 'pres-ciudad', 'pres-fecha', 'pres-inicio', 'pres-fecha-fin', 'pres-fin-hora'];
    fields.forEach(id => {
        if(document.getElementById(id)) document.getElementById(id).value = '';
    });
    
    itemsPresupuesto = [];
    renderPresupuestoItems();
    addPresupuestoItem();
    window.fetchNextBudgetId();
    toast('Formulario limpiado para nuevo presupuesto', 'info');
}

window.loadEmpresasToDatalist = function() {
    const data = JSON.parse(localStorage.getItem('saved_empresas') || '{}');
    const dl = document.getElementById('lista-empresas');
    if(dl) {
        dl.innerHTML = Object.keys(data).map(k => `<option value="${k}">`).join('');
    }
}
window.autoFillEmpresa = function() {
    const val = document.getElementById('pres-empresa').value.trim().toUpperCase();
    const data = JSON.parse(localStorage.getItem('saved_empresas') || '{}');
    if (data[val]) {
        document.getElementById('pres-atencion').value = data[val].atencion || '';
        document.getElementById('pres-telefonos').value = data[val].telefonos || '';
        document.getElementById('pres-email').value = data[val].email || '';
    }
}
window.saveEmpresaData = function() {
    const val = document.getElementById('pres-empresa').value.trim().toUpperCase();
    if(val) {
        const data = JSON.parse(localStorage.getItem('saved_empresas') || '{}');
        data[val] = {
            atencion: document.getElementById('pres-atencion').value,
            telefonos: document.getElementById('pres-telefonos').value,
            email: document.getElementById('pres-email').value
        };
        localStorage.setItem('saved_empresas', JSON.stringify(data));
    }
}
window.calcPresupuestoDias = function() {
    const f1 = document.getElementById('pres-fecha').value;
    const f2 = document.getElementById('pres-fecha-fin').value;
    if (f1 && f2) {
        const d1 = new Date(f1);
        const d2 = new Date(f2);
        let diffTime = d2.getTime() - d1.getTime();
        let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Inclusive days
        if (diffDays <= 0) diffDays = 1;
        document.getElementById('pres-dias').value = diffDays;
        
        itemsPresupuesto.forEach(item => {
            item.dias = diffDays;
            item.total = Number(item.cant) * Number(item.precio) * Number(item.dias);
        });
        renderPresupuestoItems();
    }
}

function addPresupuestoItem() {
    const id = Date.now().toString() + Math.floor(Math.random()*1000);
    itemsPresupuesto.push({
        id, cant: 1, desc: '', precio: 0, dias: document.getElementById('pres-dias').value || 1, total: 0
    });
    renderPresupuestoItems();
}

function removePresupuestoItem(id) {
    itemsPresupuesto = itemsPresupuesto.filter(i => i.id !== id);
    renderPresupuestoItems();
}

function updatePresupuestoItem(id, field, value) {
    const item = itemsPresupuesto.find(i => i.id === id);
    if (!item) return;
    
    if (field === 'desc_select') {
        const cat = PRESUPUESTO_CATALOGO.find(c => c.desc === value);
        item.desc = value;
        if (cat && cat.precio > 0) item.precio = cat.precio;
    } else {
        item[field] = value;
    }
    
    item.total = Number(item.cant) * Number(item.precio) * Number(item.dias);
    renderPresupuestoItems();
}

function renderPresupuestoItems() {
    const tbody = document.getElementById('pres-items-body');
    if (!tbody) return;
    
    let optionsHtml = '<option value="">-- Catálogo / Escribir Manual --</option>';
    PRESUPUESTO_CATALOGO.forEach(c => {
        optionsHtml += `<option value="${c.desc}">${c.desc} ${c.precio > 0 ? '($'+c.precio+')' : ''}</option>`;
    });

    tbody.innerHTML = itemsPresupuesto.map(item => `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
            <td style="padding:10px;"><input type="number" value="${item.cant}" onchange="updatePresupuestoItem('${item.id}', 'cant', this.value)" style="width:60px; padding:8px; background:var(--surface2); border:1px solid var(--border); color:#fff; border-radius:6px;"></td>
            <td style="padding:10px; display:flex; flex-direction:column; gap:5px;">
                <select onchange="updatePresupuestoItem('${item.id}', 'desc_select', this.value)" style="padding:8px; background:var(--surface2); border:1px solid var(--border); color:#fff; border-radius:6px;">
                    ${optionsHtml.replace(`value="${item.desc}"`, `value="${item.desc}" selected`)}
                </select>
                <input type="text" value="${item.desc}" placeholder="Escribir descripción manual..." onchange="updatePresupuestoItem('${item.id}', 'desc', this.value)" style="padding:8px; background:var(--surface2); border:1px solid var(--border); color:#fff; border-radius:6px;">
            </td>
            <td style="padding:10px;"><input type="number" value="${item.precio}" onchange="updatePresupuestoItem('${item.id}', 'precio', this.value)" style="width:80px; padding:8px; background:var(--surface2); border:1px solid var(--border); color:#fff; border-radius:6px;"></td>
            <td style="padding:10px;"><input type="number" value="${item.dias}" onchange="updatePresupuestoItem('${item.id}', 'dias', this.value)" style="width:60px; padding:8px; background:var(--surface2); border:1px solid var(--border); color:#fff; border-radius:6px;"></td>
            <td style="padding:10px; font-weight:900;">${item.total.toFixed(2)}</td>
            <td style="padding:10px;">
                <button class="btn" onclick="removePresupuestoItem('${item.id}')" style="background:var(--danger); color:white; padding:5px 10px; border-radius:6px;">X</button>
            </td>
        </tr>
    `).join('');

    calcularTotales();
}

function calcularTotales() {
    const ivaPerc = Number(document.getElementById('pres-iva').value || 12);
    let subtotal = 0;
    itemsPresupuesto.forEach(i => subtotal += Number(i.total));
    const iva = subtotal * (ivaPerc / 100);
    const total = subtotal + iva;

    document.getElementById('pres-subtotal').textContent = subtotal.toFixed(2);
    document.getElementById('pres-total-iva').textContent = iva.toFixed(2);
    document.getElementById('pres-gran-total').textContent = total.toFixed(2);
}

async function guardarDatosPresupuesto(actionName) {
    if(window.saveEmpresaData) window.saveEmpresaData();
    
    const emp = document.getElementById('pres-empresa').value || 'N/A';
    const tel = document.getElementById('pres-telefonos').value || '';
    const email = document.getElementById('pres-email').value || '';
    const tipoEvento = document.getElementById('pres-tipo-evento').value || 'PRESUPUESTO';
    const evento = document.getElementById('pres-evento').value || 'N/A';
    const fInicio = document.getElementById('pres-fecha').value || 'N/A';
    const total = document.getElementById('pres-gran-total').textContent;

    let isEditing = window.currentEditingPresupuestoId ? true : false;
    let newStatus = actionName === 'guardar' ? 'GENERADO' : (isEditing ? 'MODIFICADO Y ENVIADO' : 'ENVIADO');
    
    if (isEditing && actionName === 'guardar') {
        const oldEntry = (window._globalBudgets || []).find(x => x.id === window.currentEditingPresupuestoId);
        if (oldEntry) newStatus = oldEntry.estatus || 'MODIFICADO';
    }

    const payload = {
        empresa: emp,
        evento: evento,
        fecha: fInicio,
        monto: total,
        timestamp: window.currentEditingPresupuestoTimestamp || new Date().getTime(),
        action: actionName,
        estatus: newStatus,
        form: {
            empresaEmisora: document.getElementById('pres-empresa-emisora').value,
            emp,
            atencion: document.getElementById('pres-atencion').value,
            telefonos: tel,
            email: email,
            tipoEvento: tipoEvento,
            evento: evento,
            personas: document.getElementById('pres-personas').value,
            direccion: document.getElementById('pres-direccion').value,
            lugar: document.getElementById('pres-lugar').value,
            ciudad: document.getElementById('pres-ciudad').value,
            fecha: fInicio,
            inicio: document.getElementById('pres-inicio').value,
            fecha_fin: document.getElementById('pres-fecha-fin').value,
            fin_hora: document.getElementById('pres-fin-hora').value
        },
        items: JSON.parse(JSON.stringify(itemsPresupuesto))
    };
    
    let correlativo = window.currentEditingPresupuestoId;
    
    if (isEditing) {
        await apiFetch('/api/presupuestos/' + correlativo, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
    } else {
        const res = await apiFetch('/api/presupuestos', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        if (res.success && res.id) {
            correlativo = res.id;
            window.currentEditingPresupuestoId = correlativo;
            window.currentEditingPresupuestoTimestamp = payload.timestamp;
            document.getElementById('generador-title').innerHTML = `MODIFICANDO PRESUPUESTO #${correlativo}`;
        }
    }
    
    if(window.renderHistorialPresupuestos) window.renderHistorialPresupuestos();
    
    // Guardar en BBDD de Clientes del Sistema
    if (emp && emp !== 'N/A') {
        apiFetch('/api/presupuestos/client', {
            method: 'POST',
            body: JSON.stringify({ name: emp, phone: tel, email: email, event_type: tipoEvento })
        }).catch(e => console.warn('Error saving client to db', e));
    }

    return { correlativo, emp, evento, fInicio, empresaEmisora: document.getElementById('pres-empresa-emisora').value };
}

function obtenerNombresSeguros(evento, fInicio) {
    let safeEvento = (evento && evento !== 'N/A') ? evento.toUpperCase() : 'EVENTO';
    let safeFecha = (fInicio && fInicio !== 'N/A') ? fInicio.toUpperCase() : 'FECHA';
    safeEvento = safeEvento.replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    safeFecha = safeFecha.replace(/[^A-Z0-9-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    return { safeEvento, safeFecha };
}

window.limpiarGeneradorPresupuesto = function() {
    if(confirm('¿Está seguro de eliminar los datos y limpiar todo el formulario del presupuesto?')) {
        renderPresupuestos(document.getElementById('current-view'));
    }
}

async function accionPresupuesto(tipo) {
    if (itemsPresupuesto.length === 0) return toast('Debe agregar al menos un servicio', 'error');
    
    const requiredFields = [
        { id: 'pres-atencion', name: 'NOMBRE DE CLIENTE' },
        { id: 'pres-telefonos', name: 'TELÉFONO' },
        { id: 'pres-email', name: 'E-MAIL' },
        { id: 'pres-tipo-evento', name: 'TIPO DE EVENTO' },
        { id: 'pres-direccion', name: 'DIRECCIÓN DEL EVENTO' },
        { id: 'pres-fecha', name: 'FECHA DEL EVENTO' },
        { id: 'pres-inicio', name: 'HORA DE INICIO' },
        { id: 'pres-fecha-fin', name: 'FECHA TENTATIVA CULMINACIÓN' },
        { id: 'pres-fin-hora', name: 'HORA CULMINACIÓN' }
    ];

    for (const field of requiredFields) {
        const el = document.getElementById(field.id);
        if (!el || !el.value || el.value.trim() === '') {
            return toast(`El campo "${field.name}" es obligatorio`, 'error');
        }
    }
    
    const datos = await guardarDatosPresupuesto(tipo);
    const { correlativo, evento, fInicio, empresaEmisora } = datos;
    const { safeEvento, safeFecha } = obtenerNombresSeguros(evento, fInicio);
    const nombreArchivo = `PRESUPUESTO_${correlativo}_${safeEvento}_${safeFecha}`;

    if (tipo === 'pdf') {
        await generarPDFPresupuesto(nombreArchivo);
    } else if (tipo === 'excel') {
        generarExcelPresupuesto(nombreArchivo);
    } else if (tipo === 'email') {
        await enviarEmailPresupuesto(nombreArchivo, evento, empresaEmisora);
    } else if (tipo === 'guardar') {
        toast('Presupuesto guardado en el historial', 'success');
    }
    
    switchPresupuestoTab('historial');
}

function generarExcelPresupuesto(nombreArchivo) {
    toast('Generando Excel...', 'info');
    let csv = "CANT.;DESCRIPCION;PRECIO U.;DIAS;TOTAL\\n";
    itemsPresupuesto.forEach(i => {
        csv += `${i.cant};${i.desc};${i.precio};${i.dias};${i.total.toFixed(2)}\\n`;
    });
    
    // Totales
    const subtotal = document.getElementById('pres-subtotal').textContent;
    const iva = document.getElementById('pres-total-iva').textContent;
    const total = document.getElementById('pres-gran-total').textContent;
    csv += `\\n;;SUBTOTAL;;${subtotal}\\n`;
    csv += `;;IVA;;${iva}\\n`;
    csv += `;;TOTAL A PAGAR;;${total}\\n`;

    const blob = new Blob(["\\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", nombreArchivo + ".csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast('Excel descargado', 'success');
}

async function enviarEmailPresupuesto(nombreArchivo, evento, empresaEmisora) {
    const email = document.getElementById('pres-email').value;
    if(!email) return toast('Debe colocar el E-Mail del cliente para enviar', 'error');
    
    toast('Generando PDF y preparando envío...', 'info');
    try {
        const base64Data = await generarPDFPresupuesto(nombreArchivo, 'base64');
        if (!base64Data) throw new Error('Falló la conversión del PDF a Base64');

        const res = await apiFetch('/api/presupuestos/send-email', {
            method: 'POST',
            body: JSON.stringify({
                to: email,
                subject: `Presupuesto de Servicios - ${evento}`,
                pdfData: base64Data,
                filename: `${nombreArchivo}.pdf`,
                senderName: empresaEmisora === 'RENTAEQUIPOS' ? 'RENTAEQUIPOS' : 'EYE STAFF'
            })
        });
        
        if (!res) return; // Error ya notificado en apiFetch

        if (res.success) {
            toast('Email enviado exitosamente', 'success');
        } else {
            const errMsg = res.error?.message || (typeof res.error === 'string' ? res.error : JSON.stringify(res.error));
            toast('Error al enviar email: ' + errMsg, 'error');
        }
    } catch(e) {
        console.error(e);
        toast('Error crítico: ' + e.message, 'error');
    }
}

async function generarPDFPresupuesto(nombreArchivo, action = 'download') {
    toast('Generando PDF...', 'info');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Configuración
    const primaryColor = [40, 40, 40];
    const secondaryColor = [100, 100, 100];
    
    try {
        const emisora = document.getElementById('pres-empresa-emisora') ? document.getElementById('pres-empresa-emisora').value : 'EYE STAFF';
        const img = new Image();
        if (emisora === 'RENTAEQUIPOS') {
            img.src = '/rentaequipos.jpeg';
        } else {
            img.src = '/eyestaff.jpeg';
        }
        await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve; 
        });
        const ratio = img.width && img.height ? img.width / img.height : (40/15);
        const newWidth = 15 * ratio;
        doc.addImage(img, 'JPEG', 14, 10, newWidth, 15);
    } catch(e) {}

    // Título / Cabecera
    doc.setFontSize(22);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    const emisoraTexto = (document.getElementById('pres-empresa-emisora') ? document.getElementById('pres-empresa-emisora').value : 'EYE STAFF');
    doc.text("PRESUPUESTO DE SERVICIOS", 60, 20); // Movido a la derecha por el logo
    
    doc.setFontSize(10);
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text("Generado por: " + (emisoraTexto === 'RENTAEQUIPOS' ? 'Rentaequipos' : 'Eye Staff'), 60, 28);
    doc.text("Fecha: " + new Date().toLocaleDateString(), 60, 34);

    // Datos del Cliente y Evento
    const emp = document.getElementById('pres-empresa').value || 'N/A';
    const aten = document.getElementById('pres-atencion').value || 'N/A';
    const tel = document.getElementById('pres-telefonos').value || 'N/A';
    const email = document.getElementById('pres-email').value || 'N/A';
    
    const evento = document.getElementById('pres-evento').value || 'N/A';
    const personas = document.getElementById('pres-personas').value || 'N/A';
    const direccion = document.getElementById('pres-direccion').value || 'N/A';
    const lugar = document.getElementById('pres-lugar').value || 'N/A';
    const ciudad = document.getElementById('pres-ciudad').value || 'N/A';
    
    const fInicio = document.getElementById('pres-fecha').value || 'N/A';
    const convEl = document.getElementById('pres-convocatoria');
    const hConv = convEl ? (convEl.value || 'N/A') : 'N/A';
    const hIni = document.getElementById('pres-inicio').value || 'N/A';
    
    const fFin = document.getElementById('pres-fecha-fin').value || 'N/A';
    const hFin = document.getElementById('pres-fin-hora').value || 'N/A';

    if(window.saveEmpresaData) window.saveEmpresaData(); // Guardar datos para proxima vez

    doc.autoTable({
        startY: 45,
        theme: 'grid',
        headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
        body: [
            ['Empresa:', emp, 'Evento:', evento],
            ['Atención a:', aten, 'Aforo:', personas + ' pax'],
            ['Teléfono:', tel, 'Dirección:', direccion],
            ['E-Mail:', email, 'Lugar/Ciudad:', lugar + ' / ' + ciudad],
            ['Fecha Inicio:', fInicio + ' (Conv: ' + hConv + ' | Ini: ' + hIni + ')', 'Fecha Fin:', fFin + ' (Culm: ' + hFin + ')']
        ]
    });

    // Líneas de Detalles
    const tableData = itemsPresupuesto.map(i => [
        i.cant, 
        i.desc, 
        Number(i.precio).toFixed(2), 
        i.dias, 
        Number(i.total).toFixed(2)
    ]);

    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 15,
        head: [['Cant.', 'Descripción', 'Precio U.', 'Días', 'Total']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: {
            0: { halign: 'center', cellWidth: 20 },
            1: { cellWidth: 80 },
            2: { halign: 'right', cellWidth: 30 },
            3: { halign: 'center', cellWidth: 20 },
            4: { halign: 'right', cellWidth: 30 }
        }
    });

    // Totales
    const ivaPerc = Number(document.getElementById('pres-iva').value || 12);
    const subtotal = document.getElementById('pres-subtotal').textContent;
    const iva = document.getElementById('pres-total-iva').textContent;
    const total = document.getElementById('pres-gran-total').textContent;

    const finalY = doc.lastAutoTable.finalY + 10;
    
    doc.autoTable({
        startY: finalY,
        theme: 'plain',
        body: [
            ['', '', 'SUBTOTAL:', subtotal],
            ['', '', `IVA (${ivaPerc}%):`, iva],
            ['', '', 'TOTAL A PAGAR:', total]
        ],
        columnStyles: {
            0: { cellWidth: 80 },
            1: { cellWidth: 30 },
            2: { halign: 'right', fontStyle: 'bold', cellWidth: 40 },
            3: { halign: 'right', fontStyle: 'bold', cellWidth: 30 }
        }
    });

    // Pie de página
    doc.setFontSize(9);
    doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
    doc.text("Este presupuesto es válido por 15 días.", 14, doc.lastAutoTable.finalY + 20);
    
    // Guardar o retornar PDF
    if (action === 'download') {
        doc.save(`${nombreArchivo}.pdf`);
        toast('PDF Descargado exitosamente', 'success');
    } else if (action === 'base64') {
        try {
            const dataUri = doc.output('datauristring');
            if (dataUri && dataUri.includes('base64,')) {
                return dataUri.split('base64,')[1];
            } else if (dataUri && dataUri.includes(',')) {
                return dataUri.split(',')[1];
            }
            return btoa(doc.output());
        } catch(err) {
            console.error('Error doc.output:', err);
            return btoa(doc.output());
        }
    }
}

window.migrarPresupuestosLocales = async function() {
    let data = JSON.parse(localStorage.getItem('historial_presupuestos') || '[]');
    if (data && data.length > 0) {
        console.log('Migrando ' + data.length + ' presupuestos a la nube...');
        try {
            const res = await apiFetch('/api/presupuestos', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            if (res.success) {
                localStorage.removeItem('historial_presupuestos');
                console.log('Migración exitosa');
                if(window.renderHistorialPresupuestos) window.renderHistorialPresupuestos();
            }
        } catch(e) {
            console.error('Migración fallida', e);
        }
    }
};

setTimeout(() => {
    window.migrarPresupuestosLocales();
}, 2000);

window.cargarPresupuestoEnLista = function(budgetId) {
    const b = (window._globalBudgets || []).find(x => x.id == budgetId);
    if (!b) return toast('Presupuesto no encontrado', 'error');

    const form = b.form || {};

    const calcConvocatoria = (horaInicio) => {
        if (!horaInicio) return '';
        const [h, m] = horaInicio.split(':').map(Number);
        const total = h * 60 + m - 120;
        const hh = Math.floor(((total % 1440) + 1440) % 1440 / 60);
        const mm = ((total % 1440) + 1440) % 1440 % 60;
        return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
    };

    const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined && val !== null && val !== '') el.value = val; };

    setVal('lista-presupuesto', b.id);
    setVal('lista-nombre', b.evento);
    setVal('lista-fecha', b.fecha);
    setVal('lista-contacto', form.atencion);
    setVal('lista-telefono', form.telefonos);
    setVal('lista-direccion', form.direccion);
    setVal('lista-hora-inicio', form.inicio);
    setVal('lista-hora-fin', form.fin_hora);
    setVal('lista-fecha-fin', form.fecha_fin || b.fecha);
    const convCalc = calcConvocatoria(form.inicio);
    setVal('lista-hora-convocatoria', convCalc || form.convocatoria);

    const typeSelect = document.getElementById('lista-tipo');
    const tVal = (form.tipoEvento || '').toLowerCase();
    if (typeSelect && tVal) {
        for(let opt of typeSelect.options) {
            if (opt.value.toLowerCase() === tVal) { typeSelect.value = opt.value; break; }
        }
    }

    // Expandir el panel de datos del evento
    const content = document.getElementById('datos-evento-content');
    if (content) {
        content.style.display = 'block';
        const icon = document.getElementById('datos-evento-icon');
        if (icon) icon.innerText = '▼';
    }

    document.getElementById('current-view')?.scrollIntoView({ behavior: 'smooth' });
    toast('✅ DATOS CARGADOS — Revise, complete y asigne el personal', 'success');
};

window.abrirModalGuardar = function() {

    document.getElementById('modal-guardar-presupuesto').style.display = 'flex';
};

window.cerrarModalGuardar = function() {
    document.getElementById('modal-guardar-presupuesto').style.display = 'none';
};

window.confirmarGuardarPresupuesto = async function(tipo) {
    cerrarModalGuardar();
    if(tipo === 'guardar') {
        toast('Guardando presupuesto...', 'info');
    }
    await accionPresupuesto(tipo);
};

