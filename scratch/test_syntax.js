<script>
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
            ${getVolverBtn('VOLVER VIP EYE', 'renderVipEyeStaff(document.getElementById(\'current-view\'))')}
        </div>
        
        <div style="display:flex; justify-content:center; margin-bottom:20px;">
            <div style="display:flex; background:rgba(0,0,0,0.2); border-radius:12px; padding:5px;">
                <button id="btn-tab-historial" onclick="switchPresupuestoTab('historial')" style="padding:10px 20px; font-weight:bold; border-radius:8px; border:none; background:var(--accent); color:white; cursor:pointer; font-size:1rem; transition:0.3s;">HISTORIAL <span id="historial-tab-count" style="background:#ef4444; color:white; border-radius:10px; padding:2px 8px; font-size:0.7rem; vertical-align:middle; margin-left:5px;">0</span></button>
                <button id="btn-tab-generador" onclick="switchPresupuestoTab('generador')" style="padding:10px 20px; font-weight:bold; border-radius:8px; border:none; background:transparent; color:var(--muted); cursor:pointer; font-size:1rem; transition:0.3s;">GENERADOR</button>
            </div>
        </div>
        
        <div id="tab-generador-content" style="display:none;">
        <div class="card" style="max-width:900px; margin:0 auto; background:var(--surface); border:1px solid var(--border); padding:30px; border-radius:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px;">
                <h3 id="generador-title" style="color:#a855f7; margin:0; font-weight:900;">NUEVO PRESUPUESTO</h3>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:20px;">
                <div class="field" style="grid-column: 1 / -1; margin-bottom:5px;">
                    <label>EMPRESA EMISORA (LOGOTIPO)</label>
                    <select id="pres-empresa-emisora" style="width:100%; height:42px; background:var(--surface2); border:1px solid var(--border); color:#fff; border-radius:8px; padding:0 10px;">
                        <option value="EYE STAFF">EYE STAFF</option>
                        <option value="RENTAEQUIPOS">RENTAEQUIPOS</option>
                    </select>
                </div>
                <div class="field"><label>CONTACTO</label><input type="text" id="pres-atencion" placeholder="Ej. RAQUEL DAHER" list="lista-contactos" onchange="autoFillContacto()" onblur="autoFillContacto()">
                    <datalist id="lista-contactos"></datalist>
                </div>
                <div class="field"><label>EMPRESA</label><input type="text" id="pres-empresa" placeholder="Ej. EMPORIO GROUP"></div>
                <div class="field"><label>TELÉFONOS</label><input type="text" id="pres-telefonos" placeholder="Teléfonos"></div>
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
                    <div><label>Nº DE PERSONAS</label><input type="text" id="pres-personas" placeholder="Aforo"></div>
                </div>

                <div class="field" style="grid-column: 1 / -1;">
                    <label>DIRECCIÓN DEL EVENTO</label>
                    <input type="text" id="pres-direccion" placeholder="Ej. Quinta La Esmeralda, Campo Alegre" style="width:100%; margin-top:5px; border-radius:12px; padding:12px; box-sizing:border-box; background:var(--surface2); color:#fff; border:1px solid var(--border);" oninput="handlePresupuestoAddressChange(this.value)">
                </div>

                <div class="field" style="grid-column: 1 / -1;">
                    <div onclick="showExpandedPresupuestoMap()" style="margin-top:10px; margin-bottom:15px; border-radius:16px; overflow:hidden; border:1px solid var(--border); height:160px; background:rgba(0,0,0,0.2); position:relative; cursor:zoom-in;">
                        <div id="pres-map-label" style="position:absolute; top:10px; left:10px; z-index:10; background:rgba(15,23,42,0.8); padding:4px 8px; border-radius:6px; font-size:0.5rem; color:var(--accent); font-weight:900; border:1px solid var(--border); backdrop-filter:blur(4px);">📍 OFICINA EYE STAFF</div>
                        <iframe 
                            id="pres-map-iframe"
                            width="100%" 
                            height="100%" 
                            frameborder="0" 
                            style="border:0; filter: grayscale(0.5) contrast(1.2) opacity(0.8);" 
                            src="https://www.google.com/maps?q=F4PG%2BF97%2C%20Calle%20Garcilazo%2C%20Caracas%201080%2C%20Miranda%2C%20Venezuela&output=embed" 
                            allowfullscreen>
                        </iframe>
                        <div style="position:absolute; top:0; left:0; width:100%; height:100%; z-index:5;"></div>
                    </div>
                </div>

                <div class="field"><label>LUGAR DEL EVENTO</label><input type="text" id="pres-lugar" placeholder="Ej. CCCT"></div>
                <div class="field"><label>CIUDAD</label><input type="text" id="pres-ciudad" placeholder="Ej. CARACAS"></div>

                <div class="field" style="grid-column: 1 / -1;">
                    <div style="display:flex; gap:10px; align-items:center;">
                        <div style="flex:1"><label>FECHA DEL EVENTO</label><input type="date" id="pres-fecha" onchange="syncFechaFinYCalc()" style="background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:0 10px; color:#fff; width:100%; height:42px;"></div>
                        <div style="flex:1"><label>HORA DE INICIO</label><input type="text" id="pres-inicio" maxlength="5" placeholder="HH:MM" oninput="this.value=this.value.replace(/[^0-9:]/g,''); if(this.value.length === 2 && !this.value.includes(':')) this.value+=':';" style="background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:0 10px; color:#fff; width:100%; height:42px; text-align:center;"></div>
                    </div>
                </div>
                
                <div class="field" style="grid-column: 1 / -1;">
                    <div style="display:flex; gap:10px; align-items:center;">
                        <div style="flex:1"><label>FECHA TENTATIVA CULMINACIÓN</label><input type="date" id="pres-fecha-fin" onchange="calcPresupuestoDias()" style="background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:0 10px; color:#fff; width:100%; height:42px;"></div>
                        <div style="flex:1"><label>HORA CULMINACIÓN</label><input type="text" id="pres-fin-hora" maxlength="5" placeholder="HH:MM" oninput="this.value=this.value.replace(/[^0-9:]/g,''); if(this.value.length === 2 && !this.value.includes(':')) this.value+=':';" style="background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:0 10px; color:#fff; width:100%; height:42px; text-align:center;"></div>
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
                <button class="btn" onclick="accionPresupuesto('guardar')" style="width:100%; height:60px; font-size:1.2rem; font-weight:900; background:var(--surface2); border:1px solid var(--accent); color:white; margin-bottom:10px;">💾 GUARDAR PRESUPUESTO</button>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <button class="btn" onclick="accionPresupuesto('pdf')" style="flex:1; height:45px; font-size:0.9rem; font-weight:900; background:#a855f7; color:white;">📄 GENERAR PDF</button>
                    <button class="btn" onclick="accionPresupuesto('email')" style="flex:1; height:45px; font-size:0.9rem; font-weight:900; background:#3b82f6; color:white;">📧 ENVIAR EMAIL</button>
                </div>
            </div>
            </div>
        </div>
        </div>

        <div id="tab-historial-content" style="display:block;">
        <div class="card" style="max-width:900px; margin:0 auto; background:var(--surface); border:1px solid var(--border); padding:20px 30px; border-radius:24px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="color:#a855f7; margin:0; font-weight:900;">HISTORIAL DE PRESUPUESTOS <span id="historial-count" style="background:#ef4444; color:white; border-radius:10px; padding:2px 8px; font-size:0.8rem; vertical-align:middle; margin-left:10px;">0</span></h3>
            </div>
            
            <div id="historial-container" style="display:block; margin-top:20px;">
                <input type="text" id="historial-search" oninput="renderHistorialPresupuestos()" placeholder="Buscar por fecha, cliente, evento o número correlativo..." style="width:100%; padding:12px; background:var(--surface2); border:1px solid var(--border); color:#fff; border-radius:8px; margin-bottom:15px;">
                <div id="historial-list" style="max-height:350px; overflow-y:auto; display:flex; flex-direction:column; gap:10px;">
                </div>
            </div>
        </div>
    `;
    
    setTimeout(() => {
        if(window.renderHistorialPresupuestos) window.renderHistorialPresupuestos();
    }, 100);

    window.currentEditingPresupuestoId = null;
    window.currentEditingPresupuestoTimestamp = null;

    // Auto-add an empty row
    addPresupuestoItem();
}

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
        if (window.loadContactosToDatalist) window.loadContactosToDatalist();
        countEl.textContent = data.length;
        if(tabCountEl) tabCountEl.textContent = data.length;
    
    if(searchVal) {
        data = data.filter(d => 
            (d.id && d.id.toLowerCase().includes(searchVal)) || 
            (d.empresa && d.empresa.toLowerCase().includes(searchVal)) ||
            (d.evento && d.evento.toLowerCase().includes(searchVal)) ||
            (d.fecha && d.fecha.toLowerCase().includes(searchVal))
        );
    }
    
    // Sort all budgets by correlativo desc (de mayor a menor)
    data.sort((a, b) => parseInt(b.id) - parseInt(a.id));
    
    let html = '';
    if (data.length > 0) {
        html += `<div style="border-radius:12px; border:1px solid var(--border); background:rgba(0,0,0,0.1); margin-bottom:20px; margin-top:15px;">
            <div style="display:grid; grid-template-columns: 60px minmax(110px, 1fr) minmax(110px, 1fr) minmax(110px, 1fr) minmax(110px, 1fr) 90px 90px 145px; gap:8px; background:var(--surface2); padding:12px 15px; border-bottom:1px solid var(--border); border-radius:12px 12px 0 0; font-weight:900; color:var(--muted); font-size:0.7rem; letter-spacing:0.5px;">
                <div>ID</div>
                <div>CONTACTO</div>
                <div>EMPRESA</div>
                <div>TIPO DE EVENTO</div>
                <div>EVENTO</div>
                <div>FECHA</div>
                <div>TOTAL</div>
                <div>ESTATUS</div>
            </div>`;
        
        html += data.map((d, index) => {
            const status = d.estatus || 'GENERADO';
            const isLast = index === data.length - 1;
            const tipo = (d.form && d.form.tipoEvento) ? d.form.tipoEvento : 'VALET PARKING';
            
            // Extract the start date as requested
            let displayFecha = d.fecha;
            if (!displayFecha || displayFecha === 'N/A') {
                displayFecha = (d.form && d.form.fecha) ? d.form.fecha : 'N/A';
            }
            
            return `
                <div style="display:grid; grid-template-columns: 60px minmax(110px, 1fr) minmax(110px, 1fr) minmax(110px, 1fr) minmax(110px, 1fr) 90px 90px 145px; gap:8px; padding:12px 15px; border-bottom:${isLast ? 'none' : '1px solid var(--border)'}; align-items:center; transition:background 0.2s; font-size:0.75rem;" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='transparent'">
                    <div style="cursor:pointer;" onclick="cargarPresupuestoDesdeHistorial('${d.id}', ${d.timestamp})">
                        <span style="font-weight:900; color:var(--brand-white); border-bottom:1px dashed var(--accent);">#${d.id}</span>
                    </div>
                    <div style="font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${(d.form && d.form.atencion) ? d.form.atencion : 'N/A'}">${(d.form && d.form.atencion) ? d.form.atencion : 'N/A'}</div>
                    <div style="font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--muted);" title="${d.empresa}">${d.empresa}</div>
                    <div style="color:var(--warning); font-size:0.65rem; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${tipo}">${tipo}</div>
                    <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--muted);" title="${d.evento}">${d.evento}</div>
                    <div style="color:var(--muted); font-weight:700; white-space:nowrap;">${displayFecha}</div>
                    <div style="font-weight:900; color:var(--success); white-space:nowrap;">${d.monto}</div>
                    <div>
                        <select class="table-control" onclick="event.stopPropagation()" onchange="cambiarEstatusPresupuesto(event, '${d.id}', ${d.timestamp})" style="font-weight:700; color:${status === 'APROBADO' ? 'var(--success)' : 'var(--muted)'}; font-size:0.65rem; padding:6px 4px; border-radius:6px; background:rgba(255,255,255,0.05); border:1px solid ${status === 'APROBADO' ? 'var(--success)' : 'var(--border)'}; width:100%; outline:none; cursor:pointer;">
                            <option value="GENERADO" ${status==='GENERADO'?'selected':''} style="color:var(--muted)">GENERADO</option>
                            <option value="ENVIADO" ${status==='ENVIADO'?'selected':''} style="color:var(--muted)">ENVIADO</option>
                            <option value="MODIFICADO Y ENVIADO" ${status==='MODIFICADO Y ENVIADO'?'selected':''} style="color:var(--muted)">MOD Y ENVIADO</option>
                            <option value="APROBADO" ${status==='APROBADO'?'selected':''} style="color:var(--success)">APROBADO</option>
                            <option value="NO APROBADO" ${status==='NO APROBADO'?'selected':''} style="color:var(--danger)">NO APROBADO</option>
                        </select>
                    </div>
                </div>
            `;
        }).join('');
        html += `</div>`;
    }
    listEl.innerHTML = html;
    if(data.length === 0) listEl.innerHTML = '<div style="color:var(--muted); text-align:center;">No se encontraron presupuestos.</div>';
    
    } catch(e) {
        console.error('Error fetching budgets:', e);
        listEl.innerHTML = '<div style="color:var(--danger); text-align:center;">Error cargando historial de presupuestos.</div>';
    }
}

window.cambiarEstatusPresupuesto = async function(e, id, timestamp) {
    e.stopPropagation();
    const d = window._globalBudgets.find(x => x.id === id);
    if(d) {
        // Prevent accidental changes from APROBADO
        if (d.estatus === 'APROBADO') {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const pin = prompt('SEGURIDAD: Para cambiar un presupuesto APROBADO, introduzca su contraseña/PIN de empleado:');
            if (!pin || pin.trim().toUpperCase() !== user.pin_hash) {
                toast('Contraseña incorrecta o cancelada', 'error');
                e.target.value = d.estatus; // Revert selection
                return;
            }
        }
        
        d.estatus = e.target.value;
        
        // Actualizar el color del select visualmente de inmediato
        if (d.estatus === 'APROBADO') {
            e.target.style.color = 'var(--success)';
            e.target.style.borderColor = 'var(--success)';
        } else {
            e.target.style.color = 'var(--muted)';
            e.target.style.borderColor = 'var(--border)';
        }

        const res = await apiFetch('/api/presupuestos/' + id, {
            method: 'PUT',
            body: JSON.stringify(d)
        });
        if(res.success) {
            toast('Estatus actualizado a ' + d.estatus, 'success');
        } else {
            toast('Error al actualizar estatus: ' + res.error, 'error');
            if(window.renderHistorialPresupuestos) window.renderHistorialPresupuestos();
        }
    }
}

window.eliminarPresupuestoHistorial = async function(e, id, timestamp) {
    e.stopPropagation();
    if(confirm('¿Está seguro de eliminar este presupuesto de la base de datos central?')) {
        const res = await apiFetch('/api/presupuestos/' + id, { method: 'DELETE' });
        if(res.success) {
            if(window.renderHistorialPresupuestos) window.renderHistorialPresupuestos();
            toast('Presupuesto eliminado exitosamente', 'success');
            
            if (window.currentEditingPresupuestoId === id) {
                nuevoPresupuesto();
            }
        } else {
            toast('Error al eliminar presupuesto: ' + res.error, 'error');
        }
    }
}

window.cargarPresupuestoDesdeHistorial = function(id, timestamp) {
    const data = window._globalBudgets || [];
    const d = data.find(x => x.id === id);
    if(!d) return toast('Error al cargar presupuesto', 'error');

    const f = d.form || {};
    
    document.getElementById('pres-empresa-emisora').value = f.empresaEmisora || 'EYE STAFF';
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
    
    // Cambiar a la pestaña de generador para ver el presupuesto
    switchPresupuestoTab('generador');
    
    // Auto-scroll hacia arriba
    document.getElementById('current-view').scrollIntoView({ behavior: 'smooth' });
    toast('Presupuesto cargado exitosamente', 'success');
}

window.nuevoPresupuesto = function() {
    window.currentEditingPresupuestoId = null;
    window.currentEditingPresupuestoTimestamp = null;
    document.getElementById('generador-title').innerHTML = 'NUEVO PRESUPUESTO';
    
    const fields = ['pres-empresa', 'pres-atencion', 'pres-telefonos', 'pres-email', 'pres-evento', 'pres-personas', 'pres-direccion', 'pres-lugar', 'pres-ciudad', 'pres-fecha', 'pres-inicio', 'pres-fecha-fin', 'pres-fin-hora'];
    fields.forEach(id => {
        if(document.getElementById(id)) document.getElementById(id).value = '';
    });
    
    itemsPresupuesto = [];
    renderPresupuestoItems();
    addPresupuestoItem();
    toast('Formulario limpiado para nuevo presupuesto', 'info');
}

window.loadContactosToDatalist = function() {
    if (!window._globalBudgets) return;
    const uniqueContactos = new Set();
    window._globalBudgets.forEach(b => {
        if (b.form && b.form.atencion && b.form.atencion.trim()) {
            uniqueContactos.add(b.form.atencion.trim().toUpperCase());
        }
    });
    const dl = document.getElementById('lista-contactos');
    if(dl) {
        dl.innerHTML = Array.from(uniqueContactos).sort().map(k => `<option value="${k}">`).join('');
    }
}
window.autoFillContacto = function() {
    const val = document.getElementById('pres-atencion').value.trim().toUpperCase();
    if (!val || !window._globalBudgets) return;
    
    const sorted = [...window._globalBudgets].sort((a,b) => parseInt(b.id) - parseInt(a.id));
    const latest = sorted.find(b => b.form && b.form.atencion && b.form.atencion.trim().toUpperCase() === val);
    
    if (latest) {
        document.getElementById('pres-empresa').value = latest.form.empresa || latest.empresa || '';
        document.getElementById('pres-telefonos').value = latest.form.telefonos || '';
        document.getElementById('pres-email').value = latest.form.email || '';
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

    return { correlativo, emp, evento, fInicio };
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
    
    const datos = await guardarDatosPresupuesto(tipo);
    const { correlativo, evento, fInicio } = datos;
    const { safeEvento, safeFecha } = obtenerNombresSeguros(evento, fInicio);
    const nombreArchivo = `PRESUPUESTO_${correlativo}_${safeEvento}_${safeFecha}`;

    if (tipo === 'pdf') {
        await generarPDFPresupuesto(nombreArchivo);
    } else if (tipo === 'excel') {
        generarExcelPresupuesto(nombreArchivo);
    } else if (tipo === 'email') {
        await enviarEmailPresupuesto(nombreArchivo, evento);
    } else if (tipo === 'guardar') {
        toast('Presupuesto guardado en el historial', 'success');
    }
    
    switchPresupuestoTab('historial');
    nuevoPresupuesto();
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

async function enviarEmailPresupuesto(nombreArchivo, evento) {
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
                filename: `${nombreArchivo}.pdf`
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
    try {
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
            doc.addImage(img, 'JPEG', 14, 10, 40, 15);
        } catch(e) {}

        // Título / Cabecera
        doc.setFontSize(22);
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        const emisoraTexto = (document.getElementById('pres-empresa-emisora') ? document.getElementById('pres-empresa-emisora').value : 'EYE STAFF');
        doc.text("PRESUPUESTO DE SERVICIOS", 60, 20); // Movido a la derecha por el logo
        
        doc.setFontSize(10);
        doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
        doc.text("Generado por: " + (emisoraTexto === 'RENTAEQUIPOS' ? 'Rentaequipos' : 'Eye Staff / Valet Eye'), 60, 28);
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
        const hConv = document.getElementById('pres-convocatoria').value || 'N/A';
        const hIni = document.getElementById('pres-inicio').value || 'N/A';
        
        const fFin = document.getElementById('pres-fecha-fin').value || 'N/A';
        const hFin = document.getElementById('pres-fin-hora').value || 'N/A';

        doc.autoTable({
            startY: 45,
            theme: 'grid',
            headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
            body: [
                ['Empresa:', emp, 'Evento:', evento],
                ['Atención a:', aten, 'Aforo:', personas + ' pax'],
                ['Teléfonos:', tel, 'Dirección:', direccion],
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
    } catch(err) {
        console.error('Error al generar PDF:', err);
        toast('Error al generar PDF: ' + err.message, 'error');
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

</script>
