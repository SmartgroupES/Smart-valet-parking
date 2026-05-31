const fs = require('fs');
let html = fs.readFileSync('frontend/index.html', 'utf8');

// 1. Column changes & texts
const oldColumns = `<div class="field"><label>ATENCIÓN A (CONTACTO)</label><input type="text" id="pres-atencion" placeholder="Ej. RAQUEL DAHER" list="lista-contactos" onchange="autoFillContacto()" oninput="this.value = this.value.toUpperCase()"></div>`;
const newColumns = `<div class="field"><label>CONTACTO</label><input type="text" id="pres-atencion" placeholder="Ej. RAQUEL DAHER" list="lista-contactos" onchange="autoFillContacto()" oninput="this.value = this.value.toUpperCase()"></div>`;

if(html.includes(oldColumns)) { html = html.replace(oldColumns, newColumns); console.log("CONTACTO patched"); }

const oldExcelBtn = `<button class="btn" style="flex:1; background:var(--success);" onclick="generarPresupuestoExcel()">GENERAR EXCEL</button>`;
if(html.includes(oldExcelBtn)) { html = html.replace(oldExcelBtn, ''); console.log("Excel btn removed"); }

// 2. Date fix in cargarPresupuestoDesdeHistorial
const oldDateFix = `document.getElementById('pres-inicio').value = f.inicio || '';
    document.getElementById('pres-fecha-fin').value = f.fecha_fin || '';`;
const newDateFix = `document.getElementById('pres-inicio').value = f.inicio || '';
    document.getElementById('pres-fecha').value = f.fecha || d.fecha || '';
    document.getElementById('pres-fecha-fin').value = f.fecha_fin || '';`;

if(html.includes(oldDateFix)) { html = html.replace(oldDateFix, newDateFix); console.log("Date load patched"); }

// 3. Status select color and Historial table headers
const oldSelectHTML = `<select class="table-control" onclick="event.stopPropagation()" onchange="cambiarEstatusPresupuesto(event, '\${d.id}', \${d.timestamp})" style="font-weight:700; color:var(--muted); font-size:0.65rem; padding:6px 4px; border-radius:6px; background:rgba(255,255,255,0.05); border:1px solid var(--border); width:100%; outline:none; cursor:pointer;">
                            <option value="GENERADO" \${status==='GENERADO'?'selected':''}>GENERADO</option>
                            <option value="ENVIADO" \${status==='ENVIADO'?'selected':''}>ENVIADO</option>
                            <option value="MODIFICADO Y ENVIADO" \${status==='MODIFICADO Y ENVIADO'?'selected':''}>MOD Y ENVIADO</option>
                            <option value="APROBADO" \${status==='APROBADO'?'selected':''}>APROBADO</option>
                            <option value="NO APROBADO" \${status==='NO APROBADO'?'selected':''}>NO APROBADO</option>
                        </select>`;
const newSelectHTML = `<select class="table-control" onclick="event.stopPropagation()" onchange="cambiarEstatusPresupuesto(event, '\${d.id}', \${d.timestamp})" style="font-weight:700; color:\${status === 'APROBADO' ? 'var(--success)' : 'var(--muted)'}; font-size:0.65rem; padding:6px 4px; border-radius:6px; background:rgba(255,255,255,0.05); border:1px solid \${status === 'APROBADO' ? 'var(--success)' : 'var(--border)'}; width:100%; outline:none; cursor:pointer;">
                            <option value="GENERADO" \${status==='GENERADO'?'selected':''} style="color:var(--muted)">GENERADO</option>
                            <option value="ENVIADO" \${status==='ENVIADO'?'selected':''} style="color:var(--muted)">ENVIADO</option>
                            <option value="MODIFICADO Y ENVIADO" \${status==='MODIFICADO Y ENVIADO'?'selected':''} style="color:var(--muted)">MOD Y ENVIADO</option>
                            <option value="APROBADO" \${status==='APROBADO'?'selected':''} style="color:var(--success)">APROBADO</option>
                            <option value="NO APROBADO" \${status==='NO APROBADO'?'selected':''} style="color:var(--danger)">NO APROBADO</option>
                        </select>`;

if(html.includes(oldSelectHTML)) { html = html.replace(oldSelectHTML, newSelectHTML); console.log("Select color patched"); }

const oldTableHeader1 = `<div style="display:grid; grid-template-columns: 60px minmax(130px, 1fr) minmax(130px, 1fr) minmax(130px, 1fr) 90px 90px 145px; gap:8px; background:var(--surface2); padding:12px 15px; border-bottom:1px solid var(--border); border-radius:12px 12px 0 0; font-weight:900; color:var(--muted); font-size:0.7rem; letter-spacing:0.5px;">
                <div>ID</div>
                <div>CLIENTE</div>
                <div>TIPO DE EVENTO</div>
                <div>EVENTO</div>
                <div>FECHA</div>
                <div>TOTAL</div>
                <div>ESTATUS</div>
                <div></div>
            </div>`;
const newTableHeader1 = `<div style="display:grid; grid-template-columns: 60px minmax(110px, 1fr) minmax(110px, 1fr) minmax(110px, 1fr) minmax(110px, 1fr) 90px 90px 145px; gap:8px; background:var(--surface2); padding:12px 15px; border-bottom:1px solid var(--border); border-radius:12px 12px 0 0; font-weight:900; color:var(--muted); font-size:0.7rem; letter-spacing:0.5px;">
                <div>ID</div>
                <div>CONTACTO</div>
                <div>EMPRESA</div>
                <div>TIPO DE EVENTO</div>
                <div>EVENTO</div>
                <div>FECHA</div>
                <div>TOTAL</div>
                <div>ESTATUS</div>
            </div>`;

if(html.includes(oldTableHeader1)) { html = html.replace(oldTableHeader1, newTableHeader1); console.log("Table header patched"); }

const oldTableRow1 = `<div style="display:grid; grid-template-columns: 60px minmax(130px, 1fr) minmax(130px, 1fr) minmax(130px, 1fr) 90px 90px 145px; gap:8px; padding:12px 15px; border-bottom:\${isLast ? 'none' : '1px solid var(--border)'}; align-items:center; transition:background 0.2s; font-size:0.75rem;" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='transparent'">
                    <div style="cursor:pointer;" onclick="cargarPresupuestoDesdeHistorial('\${d.id}', \${d.timestamp})">
                        <span style="font-weight:900; color:var(--brand-white); border-bottom:1px dashed var(--accent);">#\${d.id}</span>
                    </div>
                    <div style="font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="\${d.empresa}">\${d.empresa}</div>
                    <div style="color:var(--warning); font-size:0.65rem; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="\${tipo}">\${tipo}</div>
                    <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--muted);" title="\${d.evento}">\${d.evento}</div>
                    <div style="color:var(--muted); font-weight:700; white-space:nowrap;">\${displayFecha}</div>
                    <div style="font-weight:900; color:var(--success); white-space:nowrap;">\${d.monto}</div>
                    <div>
                        <select class="table-control" onclick="event.stopPropagation()" onchange="cambiarEstatusPresupuesto(event, '\${d.id}', \${d.timestamp})" style="font-weight:700; color:\${status === 'APROBADO' ? 'var(--success)' : 'var(--muted)'}; font-size:0.65rem; padding:6px 4px; border-radius:6px; background:rgba(255,255,255,0.05); border:1px solid \${status === 'APROBADO' ? 'var(--success)' : 'var(--border)'}; width:100%; outline:none; cursor:pointer;">
                            <option value="GENERADO" \${status==='GENERADO'?'selected':''} style="color:var(--muted)">GENERADO</option>
                            <option value="ENVIADO" \${status==='ENVIADO'?'selected':''} style="color:var(--muted)">ENVIADO</option>
                            <option value="MODIFICADO Y ENVIADO" \${status==='MODIFICADO Y ENVIADO'?'selected':''} style="color:var(--muted)">MOD Y ENVIADO</option>
                            <option value="APROBADO" \${status==='APROBADO'?'selected':''} style="color:var(--success)">APROBADO</option>
                            <option value="NO APROBADO" \${status==='NO APROBADO'?'selected':''} style="color:var(--danger)">NO APROBADO</option>
                        </select>
                    </div>
                    <div style="text-align:right;">
                        <button class="btn btn-sm" onclick="event.stopPropagation(); cargarPresupuestoDesdeHistorial('\${d.id}', \${d.timestamp})" style="font-size:0.65rem; padding:5px 8px; background:var(--accent);">EDITAR</button>
                    </div>
                </div>`;
const newTableRow1 = `<div style="display:grid; grid-template-columns: 60px minmax(110px, 1fr) minmax(110px, 1fr) minmax(110px, 1fr) minmax(110px, 1fr) 90px 90px 145px; gap:8px; padding:12px 15px; border-bottom:\${isLast ? 'none' : '1px solid var(--border)'}; align-items:center; transition:background 0.2s; font-size:0.75rem;" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='transparent'">
                    <div style="cursor:pointer;" onclick="cargarPresupuestoDesdeHistorial('\${d.id}', \${d.timestamp})">
                        <span style="font-weight:900; color:var(--brand-white); border-bottom:1px dashed var(--accent);">#\${d.id}</span>
                    </div>
                    <div style="font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="\${(d.form && d.form.atencion) ? d.form.atencion : 'N/A'}">\${(d.form && d.form.atencion) ? d.form.atencion : 'N/A'}</div>
                    <div style="font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--muted);" title="\${d.empresa}">\${d.empresa}</div>
                    <div style="color:var(--warning); font-size:0.65rem; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="\${tipo}">\${tipo}</div>
                    <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--muted);" title="\${d.evento}">\${d.evento}</div>
                    <div style="color:var(--muted); font-weight:700; white-space:nowrap;">\${displayFecha}</div>
                    <div style="font-weight:900; color:var(--success); white-space:nowrap;">\${d.monto}</div>
                    <div>
                        <select class="table-control" onclick="event.stopPropagation()" onchange="cambiarEstatusPresupuesto(event, '\${d.id}', \${d.timestamp})" style="font-weight:700; color:\${status === 'APROBADO' ? 'var(--success)' : 'var(--muted)'}; font-size:0.65rem; padding:6px 4px; border-radius:6px; background:rgba(255,255,255,0.05); border:1px solid \${status === 'APROBADO' ? 'var(--success)' : 'var(--border)'}; width:100%; outline:none; cursor:pointer;">
                            <option value="GENERADO" \${status==='GENERADO'?'selected':''} style="color:var(--muted)">GENERADO</option>
                            <option value="ENVIADO" \${status==='ENVIADO'?'selected':''} style="color:var(--muted)">ENVIADO</option>
                            <option value="MODIFICADO Y ENVIADO" \${status==='MODIFICADO Y ENVIADO'?'selected':''} style="color:var(--muted)">MOD Y ENVIADO</option>
                            <option value="APROBADO" \${status==='APROBADO'?'selected':''} style="color:var(--success)">APROBADO</option>
                            <option value="NO APROBADO" \${status==='NO APROBADO'?'selected':''} style="color:var(--danger)">NO APROBADO</option>
                        </select>
                    </div>
                </div>`;

if(html.includes(oldTableRow1)) { html = html.replace(oldTableRow1, newTableRow1); console.log("Table row patched"); }

fs.writeFileSync('frontend/index.html', html);
