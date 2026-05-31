/*12358*/ <script>
/*12359*/ const PRESUPUESTO_CATALOGO = [
/*12360*/     { desc: "Personal de Guardia Nocturna", precio: 2000 },
/*12361*/     { desc: "Coordinador de Area", precio: 4500 },
/*12362*/     { desc: "Personal de Logística, Prevención y Control", precio: 2300 },
/*12363*/     { desc: "Supervisor", precio: 5500 },
/*12364*/     { desc: "Servicio de Alquiler de Radios de Comunicación UHF", precio: 1200 },
/*12365*/     { desc: "Desayunos", precio: 550 },
/*12366*/     { desc: "Almuerzos", precio: 600 },
/*12367*/     { desc: "Cenas", precio: 600 },
/*12368*/     { desc: "Viáticos para Comida e Hidratación", precio: 0 },
/*12369*/     { desc: "Personal de Protocolo y Logística", precio: 0 },
/*12370*/     { desc: "Personal de Montaje y Desmontaje", precio: 0 },
/*12371*/     { desc: "Custodia de Artistas y Personalidades", precio: 0 },
/*12372*/     { desc: "Personal de Vallet Parking", precio: 0 },
/*12373*/     { desc: "Equipos de Vialidad", precio: 0 },
/*12374*/     { desc: "Postes Separadores de Colas", precio: 0 },
/*12375*/     { desc: "Toldos", precio: 0 },
/*12376*/     { desc: "Baños Portátiles", precio: 0 },
/*12377*/     { desc: "Alquiler de Extintores", precio: 0 },
/*12378*/     { desc: "Sistema de Monitoreo Móvil hasta 8 cámaras", precio: 0 }
/*12379*/ ];
/*12380*/ 
/*12381*/ let itemsPresupuesto = [];
/*12382*/ 
/*12383*/ function renderPresupuestos(el) {
/*12384*/     itemsPresupuesto = []; // reset
/*12385*/     el.innerHTML = `
/*12386*/         <div style="margin-bottom:15px; display:flex; justify-content:flex-start;">
/*12387*/             ${getVolverBtn('VOLVER A DIRECCIÓN EYE STAFF', 'renderVipEyeStaff(document.getElementById(\'current-view\'))')}
/*12388*/         </div>
/*12389*/         
/*12390*/         <div style="display:flex; justify-content:center; margin-bottom:20px;">
/*12391*/             <div style="display:flex; background:rgba(0,0,0,0.2); border-radius:12px; padding:5px;">
/*12392*/                 <button id="btn-tab-historial" onclick="switchPresupuestoTab('historial')" style="padding:10px 20px; font-weight:bold; border-radius:8px; border:none; background:var(--accent); color:white; cursor:pointer; font-size:1rem; transition:0.3s;">HISTORIAL <span id="historial-tab-count" style="background:#ef4444; color:white; border-radius:10px; padding:2px 8px; font-size:0.7rem; vertical-align:middle; margin-left:5px;">0</span></button>
/*12393*/                 <button id="btn-tab-generador" onclick="switchPresupuestoTab('generador')" style="padding:10px 20px; font-weight:bold; border-radius:8px; border:none; background:transparent; color:var(--muted); cursor:pointer; font-size:1rem; transition:0.3s;">PRESUPUESTO</button>
/*12394*/             </div>
/*12395*/         </div>
/*12396*/         
/*12397*/         <div id="tab-generador-content" style="display:none;">
/*12398*/         <div class="card" style="max-width:900px; margin:0 auto; background:var(--surface); border:1px solid var(--border); padding:30px; border-radius:24px;">
/*12399*/             <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:10px;">
/*12400*/                 <h3 id="generador-title" style="color:#a855f7; margin:0; font-weight:900;">NUEVO PRESUPUESTO</h3>
/*12401*/             </div>
/*12402*/             <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:20px;">
/*12403*/                 <div class="field" style="grid-column: 1 / -1; display:flex; gap:15px; margin-bottom:5px;">
/*12404*/                     <div style="flex:1;">
/*12405*/                         <label>Nº PRESUPUESTO</label>
/*12406*/                         <input type="text" id="pres-correlativo" readonly style="width:100%; height:42px; background:rgba(0,0,0,0.2); border:1px solid var(--border); color:var(--muted); border-radius:8px; padding:0 10px; font-weight:900;">
/*12407*/                     </div>
/*12408*/                     <div style="flex:2;">
/*12409*/                         <label>Presupuestado por:</label>
/*12410*/                         <select id="pres-empresa-emisora" style="width:100%; height:42px; background:var(--surface2); border:1px solid var(--border); color:#fff; border-radius:8px; padding:0 10px;" onchange="window.fetchNextBudgetId()">
/*12411*/                             <option value="EYE STAFF">EYE STAFF</option>
/*12412*/                             <option value="RENTAEQUIPOS">RENTAEQUIPOS</option>
/*12413*/                         </select>
/*12414*/                     </div>
/*12415*/                 </div>
/*12416*/                 <div class="field"><label>NOMBRE DE CLIENTE</label><input type="text" id="pres-atencion" placeholder="Ej. RAQUEL DAHER"></div>
/*12417*/                 <div class="field"><label>EMPRESA</label><input type="text" id="pres-empresa" placeholder="Ej. EMPORIO GROUP" list="lista-empresas" onchange="autoFillEmpresa()" onblur="autoFillEmpresa()">
/*12418*/                     <datalist id="lista-empresas"></datalist>
/*12419*/                 </div>
/*12420*/                 <div class="field"><label>TELÉFONO</label><input type="text" id="pres-telefonos" placeholder="Teléfono"></div>
/*12421*/                 <div class="field"><label>E-MAIL</label><input type="email" id="pres-email" placeholder="Correo"></div>
/*12422*/                 
/*12423*/                 <div class="field" style="grid-column: 1 / -1; display:grid; grid-template-columns:1fr 1fr 1fr; gap:15px;">
/*12424*/                     <div><label>NOMBRE DEL EVENTO</label><input type="text" id="pres-evento" placeholder="Ej. MIS DULCE 15"></div>
/*12425*/                     <div><label>TIPO DE EVENTO</label>
/*12426*/                         <select id="pres-tipo-evento" style="width:100%; height:42px; background:var(--surface2); border:1px solid var(--border); color:#fff; border-radius:8px; padding:0 10px;">
/*12427*/                             <option value="VALET PARKING">VALET PARKING</option>
/*12428*/                             <option value="CONTROL DE ACCESOS">CONTROL DE ACCESOS</option>
/*12429*/                             <option value="ALQUILER DE EQUIPOS">ALQUILER DE EQUIPOS</option>
/*12430*/                             <option value="TRASLADOS">TRASLADOS</option>
/*12431*/                             <option value="GUARDIA DIURNA/NOCTURNA">GUARDIA DIURNA/NOCTURNA</option>
/*12432*/                             <option value="CUSTODIA">CUSTODIA</option>
/*12433*/                         </select>
/*12434*/                     </div>
/*12435*/                     <div><label>Nº DE ASISTENTES</label><input type="text" id="pres-personas" placeholder="Aforo"></div>
/*12436*/                 </div>
/*12437*/ 
/*12438*/                 <div class="field" style="grid-column: 1 / -1;">
/*12439*/                     <label>DIRECCIÓN DEL EVENTO</label>
/*12440*/                     <div style="display:flex; gap:10px; align-items:center;">
/*12441*/                         <input type="text" id="pres-direccion" placeholder="Ej. Quinta La Esmeralda, Campo Alegre" style="flex:1;" oninput="updatePresupuestoMap()">
/*12442*/                     </div>
/*12443*/                     <div style="margin-top:10px; height:200px; border-radius:12px; overflow:hidden; border:1px solid var(--border);">
/*12444*/                         <iframe id="pres-map-iframe" width="100%" height="100%" frameborder="0" style="border:0; filter: grayscale(0.5) contrast(1.2) opacity(0.8);" src="https://www.google.com/maps?q=Caracas&output=embed" allowfullscreen></iframe>
/*12445*/                     </div>
/*12446*/                 </div>
/*12447*/ 
/*12448*/                 <div class="field"><label>LUGAR DEL EVENTO</label><input type="text" id="pres-lugar" placeholder="Ej. CCCT"></div>
/*12449*/                 <div class="field"><label>CIUDAD</label><input type="text" id="pres-ciudad" placeholder="Ej. CARACAS"></div>
/*12450*/ 
/*12451*/                 <div class="field" style="grid-column: 1 / -1;">
/*12452*/                     <div style="display:flex; gap:10px; align-items:center;">
/*12453*/                         <div style="flex:1"><label>FECHA DEL EVENTO</label><input type="date" id="pres-fecha" onchange="syncFechaFinYCalc()" style="background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:0 10px; color:#fff; width:100%; height:42px;"></div>
/*12454*/                         <div style="flex:1"><label>HORA DE INICIO</label><input type="text" id="pres-inicio" placeholder="HH:MM" maxlength="5" oninput="if(this.value.length === 2 && !this.value.includes(':')) this.value += ':'" style="background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:0 10px; color:#fff; width:100%; height:42px; text-align:center;"></div>
/*12455*/                     </div>
/*12456*/                 </div>
/*12457*/                 
/*12458*/                 <div class="field" style="grid-column: 1 / -1;">
/*12459*/                     <div style="display:flex; gap:10px; align-items:center;">
/*12460*/                         <div style="flex:1"><label>FECHA TENTATIVA CULMINACIÓN</label><input type="date" id="pres-fecha-fin" onchange="calcPresupuestoDias()" style="background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:0 10px; color:#fff; width:100%; height:42px;"></div>
/*12461*/                         <div style="flex:1"><label>HORA CULMINACIÓN</label><input type="text" id="pres-fin-hora" placeholder="HH:MM" maxlength="5" oninput="if(this.value.length === 2 && !this.value.includes(':')) this.value += ':'" style="background:var(--surface2); border:1px solid var(--border); border-radius:8px; padding:0 10px; color:#fff; width:100%; height:42px; text-align:center;"></div>
/*12462*/                     </div>
/*12463*/                 </div>
/*12464*/ 
/*12465*/                 <div class="field"><label>CANTIDAD DE DÍAS (AUTOCALCULADO)</label><input type="number" id="pres-dias" value="1" readonly style="background:rgba(255,255,255,0.05); cursor:not-allowed;"></div>
/*12466*/                 <div class="field"><label>% IVA</label><input type="number" id="pres-iva" value="12" onchange="calcularTotales()"></div>
/*12467*/             </div>
/*12468*/ 
/*12469*/             <h3 style="color:#a855f7; margin-bottom:15px; font-weight:900; margin-top:30px; display:flex; justify-content:space-between; align-items:center;">
/*12470*/                 LÍNEAS DE SERVICIO
/*12471*/                 <button type="button" class="btn" onclick="addPresupuestoItem()" style="font-size:0.8rem; padding:8px 15px; background:var(--success); color:white;">+ AGREGAR SERVICIO</button>
/*12472*/             </h3>
/*12473*/             
/*12474*/             <div style="overflow-x:auto;">
/*12475*/                 <table style="width:100%; border-collapse:collapse; font-size:0.85rem; text-align:left; color:#fff;">
/*12476*/                     <thead>
/*12477*/                         <tr style="border-bottom:2px solid var(--border); color:var(--muted);">
/*12478*/                             <th style="padding:10px;">CANT.</th>
/*12479*/                             <th style="padding:10px; width:40%;">DESCRIPCIÓN</th>
/*12480*/                             <th style="padding:10px;">PRECIO U.</th>
/*12481*/                             <th style="padding:10px;">DÍAS</th>
/*12482*/                             <th style="padding:10px;">TOTAL</th>
/*12483*/                             <th style="padding:10px;"></th>
/*12484*/                         </tr>
/*12485*/                     </thead>
/*12486*/                     <tbody id="pres-items-body">
/*12487*/                     </tbody>
/*12488*/                     <tfoot>
/*12489*/                         <tr style="border-top:2px solid var(--border); font-weight:900;">
/*12490*/                             <td colspan="4" style="text-align:right; padding:15px 10px;">SUBTOTAL:</td>
/*12491*/                             <td id="pres-subtotal" style="padding:15px 10px;">0.00</td>
/*12492*/                             <td></td>
/*12493*/                         </tr>
/*12494*/                         <tr style="font-weight:900;">
/*12495*/                             <td colspan="4" style="text-align:right; padding:5px 10px;">IVA:</td>
/*12496*/                             <td id="pres-total-iva" style="padding:5px 10px;">0.00</td>
/*12497*/                             <td></td>
/*12498*/                         </tr>
/*12499*/                         <tr style="font-weight:900; font-size:1.1rem; color:var(--success);">
/*12500*/                             <td colspan="4" style="text-align:right; padding:15px 10px;">TOTAL A PAGAR:</td>
/*12501*/                             <td id="pres-gran-total" style="padding:15px 10px;">0.00</td>
/*12502*/                             <td></td>
/*12503*/                         </tr>
/*12504*/                     </tfoot>
/*12505*/                 </table>
/*12506*/             </div>
/*12507*/ 
/*12508*/             <div style="margin-top:30px;">
/*12509*/                 <div style="display:flex; gap:10px; margin-bottom:10px;">
/*12510*/                     <button class="btn" onclick="abrirModalGuardar()" style="flex:1; height:60px; font-size:1.2rem; font-weight:900; background:var(--surface2); border:1px solid var(--accent); color:white; border-radius:12px;">💾 GUARDAR PRESUPUESTO</button>
/*12511*/                     <button id="btn-iniciar-presupuesto" class="btn" onclick="if(window.currentEditingPresupuestoId) window.location.href='/?view=listas&action=create_session_from_budget&budget_id='+window.currentEditingPresupuestoId" style="display:none; flex:1; height:60px; font-size:1.2rem; font-weight:900; background:#22c55e; border:none; color:white; border-radius:12px; box-shadow:0 0 15px rgba(34,197,94,0.4);">▶ INICIAR EVENTO</button>
/*12512*/                 </div>
/*12513*/ 
/*12514*/             </div>
/*12515*/             </div>
/*12516*/         </div>
/*12517*/         </div>
/*12518*/ 
/*12519*/         <div id="tab-historial-content" style="display:block;">
/*12520*/         <div class="card" style="width:100%; max-width:1200px; margin:0 auto; background:var(--surface); border:1px solid var(--border); padding:20px 30px; border-radius:24px;">
/*12521*/             <div style="display:flex; justify-content:space-between; align-items:center;">
/*12522*/                 <h3 style="color:#a855f7; margin:0; font-weight:900;">HISTORIAL DE PRESUPUESTOS <span id="historial-count" style="background:#ef4444; color:white; border-radius:10px; padding:2px 8px; font-size:0.8rem; vertical-align:middle; margin-left:10px;">0</span></h3>
/*12523*/             </div>
/*12524*/             
/*12525*/             <div id="historial-container" style="display:block; margin-top:20px;">
/*12526*/                 <input type="text" id="historial-search" oninput="renderHistorialPresupuestos()" placeholder="Buscar por fecha, cliente, evento o número correlativo..." style="width:100%; padding:12px; background:var(--surface2); border:1px solid var(--border); color:#fff; border-radius:8px; margin-bottom:15px;">
/*12527*/                 <div id="historial-list" style="max-height:600px; overflow-y:auto; display:flex; flex-direction:column; gap:10px;">
/*12528*/                 </div>
/*12529*/             </div>
/*12530*/         </div>
/*12531*/     `;
/*12532*/     
/*12533*/     setTimeout(() => {
/*12534*/         if(window.loadEmpresasToDatalist) window.loadEmpresasToDatalist();
/*12535*/         if(window.renderHistorialPresupuestos) window.renderHistorialPresupuestos();
/*12536*/     }, 100);
/*12537*/ 
/*12538*/     window.currentEditingPresupuestoId = null;
/*12539*/     window.currentEditingPresupuestoTimestamp = null;
/*12540*/ 
/*12541*/     // Auto-add an empty row
/*12542*/     addPresupuestoItem();
/*12543*/     if (window.fetchNextBudgetId) window.fetchNextBudgetId();
/*12544*/ }
/*12545*/ 
/*12546*/ window.toggleReportSubscription = async function(checkboxElement, userId, reportId) {
/*12547*/     checkboxElement.disabled = true; // Disable during request
/*12548*/     const originalState = checkboxElement.checked;
/*12549*/     
/*12550*/     try {
/*12551*/         const res = await apiFetch('/api/reports/subscriptions', {
/*12552*/             method: 'POST',
/*12553*/             body: JSON.stringify({
/*12554*/                 user_id: userId,
/*12555*/                 report_id: reportId,
/*12556*/                 active: originalState
/*12557*/             })
/*12558*/         });
/*12559*/         
/*12560*/         if (res && res.success) {
/*12561*/             toast('Suscripción actualizada', 'success');
/*12562*/         } else {
/*12563*/             throw new Error(res?.error || 'Error al actualizar');
/*12564*/         }
/*12565*/     } catch (e) {
/*12566*/         console.error('Error toggle subscription:', e);
/*12567*/         toast('❌ ' + e.message, 'error');
/*12568*/         checkboxElement.checked = !originalState; // Revert visually
/*12569*/     } finally {
/*12570*/         checkboxElement.disabled = false;
/*12571*/     }
/*12572*/ };
/*12573*/ 
/*12574*/ window.switchPresupuestoTab = function(tab) {
/*12575*/     const btnGen = document.getElementById('btn-tab-generador');
/*12576*/     const btnHist = document.getElementById('btn-tab-historial');
/*12577*/     const contentGen = document.getElementById('tab-generador-content');
/*12578*/     const contentHist = document.getElementById('tab-historial-content');
/*12579*/     
/*12580*/     if (tab === 'generador') {
/*12581*/         btnGen.style.background = 'var(--accent)';
/*12582*/         btnGen.style.color = 'white';
/*12583*/         btnHist.style.background = 'transparent';
/*12584*/         btnHist.style.color = 'var(--muted)';
/*12585*/         contentGen.style.display = 'block';
/*12586*/         contentHist.style.display = 'none';
/*12587*/     } else {
/*12588*/         btnHist.style.background = 'var(--accent)';
/*12589*/         btnHist.style.color = 'white';
/*12590*/         btnGen.style.background = 'transparent';
/*12591*/         btnGen.style.color = 'var(--muted)';
/*12592*/         contentHist.style.display = 'block';
/*12593*/         contentGen.style.display = 'none';
/*12594*/         if(window.renderHistorialPresupuestos) window.renderHistorialPresupuestos();
/*12595*/     }
/*12596*/ }
/*12597*/ 
/*12598*/ window._globalBudgets = [];
/*12599*/ 
/*12600*/ window.renderHistorialPresupuestos = async function() {
/*12601*/     const listEl = document.getElementById('historial-list');
/*12602*/     const countEl = document.getElementById('historial-count');
/*12603*/     const tabCountEl = document.getElementById('historial-tab-count');
/*12604*/     const searchVal = (document.getElementById('historial-search') ? document.getElementById('historial-search').value.toLowerCase() : '');
/*12605*/     
/*12606*/     if(!listEl || !countEl) return;
/*12607*/     
/*12608*/     try {
/*12609*/         const res = await apiFetch('/api/presupuestos');
/*12610*/         if (!res.success) throw new Error(res.error || 'Error fetching');
/*12611*/         
/*12612*/         let data = res.budgets || [];
/*12613*/         data = data.map(d => ({
/*12614*/             ...d,
/*12615*/             form: typeof d.form_data === 'string' ? JSON.parse(d.form_data) : d.form_data,
/*12616*/             items: typeof d.items_data === 'string' ? JSON.parse(d.items_data) : d.items_data
/*12617*/         }));
/*12618*/         
/*12619*/         window._globalBudgets = data;
/*12620*/         const totalPendientes = data.filter(d => (d.estatus || 'GENERADO') !== 'APROBADO').length;
/*12621*/         countEl.textContent = totalPendientes;
/*12622*/         if(tabCountEl) tabCountEl.textContent = totalPendientes;
/*12623*/     
/*12624*/     if(searchVal) {
/*12625*/         data = data.filter(d => 
/*12626*/             (d.id && d.id.toLowerCase().includes(searchVal)) || 
/*12627*/             (d.empresa && d.empresa.toLowerCase().includes(searchVal)) ||
/*12628*/             (d.evento && d.evento.toLowerCase().includes(searchVal)) ||
/*12629*/             (d.fecha && d.fecha.toLowerCase().includes(searchVal))
/*12630*/         );
/*12631*/     }
/*12632*/     
/*12633*/     // Sort all budgets by correlativo desc (de mayor a menor)
/*12634*/     data.sort((a, b) => parseInt(b.id) - parseInt(a.id));
/*12635*/     
/*12636*/     let html = '';
/*12637*/     
/*12638*/     const renderTable = (tableData, title, titleColor) => {
/*12639*/         if(tableData.length === 0) return '';
/*12640*/         let tHtml = `<h4 style="color:${titleColor}; margin-top:25px; margin-bottom:10px; font-weight:900; padding-left:5px; font-size: 0.9rem; text-transform: uppercase;">${title} (${tableData.length})</h4>`;
/*12641*/         tHtml += `<div style="border-radius:12px; border:1px solid var(--border); background:rgba(0,0,0,0.1); margin-bottom:20px; overflow-x:auto;">
/*12642*/             <div style="display:grid; grid-template-columns: 55px minmax(90px, 1fr) minmax(90px, 1fr) minmax(90px, 1fr) minmax(90px, 1fr) 75px 80px 115px 95px; gap:8px; background:var(--surface2); padding:12px 15px; border-bottom:1px solid var(--border); border-radius:12px 12px 0 0; font-weight:900; color:var(--muted); font-size:0.7rem; letter-spacing:0.5px; min-width:800px;">
/*12643*/                 <div>ID</div>
/*12644*/                 <div>CONTACTO</div>
/*12645*/                 <div>EMPRESA</div>
/*12646*/                 <div style="text-align:center;">TIPO DE EVENTO</div>
/*12647*/                 <div>EVENTO</div>
/*12648*/                 <div>FECHA</div>
/*12649*/                 <div>TOTAL</div>
/*12650*/                 <div>ESTATUS</div>
/*12651*/                 <div style="text-align:center;">ACCIONES</div>
/*12652*/             </div>`;
/*12653*/         
/*12654*/         tHtml += tableData.map((d, index) => {
/*12655*/             const status = d.estatus || 'GENERADO';
/*12656*/             const isLast = index === tableData.length - 1;
/*12657*/             const tipo = (d.form && d.form.tipoEvento) ? d.form.tipoEvento : 'VALET PARKING';
/*12658*/             
/*12659*/             let displayFecha = d.fecha;
/*12660*/             if (!displayFecha || displayFecha === 'N/A') {
/*12661*/                 displayFecha = (d.form && d.form.fecha) ? d.form.fecha : 'N/A';
/*12662*/             }
/*12663*/             
/*12664*/             return `
/*12665*/                 <div style="display:grid; grid-template-columns: 55px minmax(90px, 1fr) minmax(90px, 1fr) minmax(90px, 1fr) minmax(90px, 1fr) 75px 80px 115px 95px; gap:8px; padding:12px 15px; border-bottom:${isLast ? 'none' : '1px solid var(--border)'}; align-items:center; transition:background 0.2s; font-size:0.75rem; min-width:800px;" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='transparent'">
/*12666*/                     <div style="cursor:pointer;" onclick="cargarPresupuestoDesdeHistorial('${d.id}', ${d.timestamp})">
/*12667*/                         <span style="font-weight:900; color:var(--brand-white); border-bottom:1px dashed var(--accent);">#${d.id}</span>
/*12668*/                     </div>
/*12669*/                     <div style="font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${(d.form && d.form.atencion) ? d.form.atencion : 'N/A'}">${(d.form && d.form.atencion) ? d.form.atencion : 'N/A'}</div>
/*12670*/                     <div style="font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--muted);" title="${d.empresa}">${d.empresa}</div>
/*12671*/                     <div style="color:var(--warning); font-size:0.55rem; font-weight:800; text-align:center; display:flex; align-items:center; justify-content:center; white-space:normal; line-height:1.2; height:100%;" title="${tipo}">${tipo}</div>
/*12672*/                     <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--muted);" title="${d.evento}">${d.evento}</div>
/*12673*/                     <div style="color:var(--muted); font-weight:700; white-space:nowrap;">${displayFecha}</div>
/*12674*/                     <div style="font-weight:900; color:var(--success); white-space:nowrap;">${d.monto}</div>
/*12675*/                     <div>
/*12676*/                         <select class="table-control" onclick="event.stopPropagation()" onchange="cambiarEstatusPresupuesto(event, '${d.id}', ${d.timestamp})" style="font-weight:700; color:${status === 'APROBADO' ? 'var(--success)' : 'var(--muted)'}; font-size:0.65rem; padding:6px 4px; border-radius:6px; background:rgba(255,255,255,0.05); border:1px solid ${status === 'APROBADO' ? 'var(--success)' : 'var(--border)'}; width:100%; outline:none; cursor:pointer;">
/*12677*/                             <option value="ENVIADO" ${status==='ENVIADO'?'selected':''} style="color:var(--muted)">ENVIADO</option>
/*12678*/                             <option value="MODIFICADO Y ENVIADO" ${status==='MODIFICADO Y ENVIADO'?'selected':''} style="color:var(--muted)">MOD Y ENVIADO</option>
/*12679*/                             <option value="APROBADO" ${status==='APROBADO'?'selected':''} style="color:var(--success)">APROBADO</option>
/*12680*/                             <option value="NO APROBADO" ${status==='NO APROBADO'?'selected':''} style="color:var(--danger)">NO APROBADO</option>
/*12681*/                         </select>
/*12682*/                     </div>
/*12683*/                     <div style="text-align:center; display:flex; justify-content:center; gap:8px;">
/*12684*/                         <button onclick="generarDesdeHistorial(event, '${d.id}', 'pdf')" style="background:transparent; border:none; cursor:pointer; font-size:1.1rem; padding:2px; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'" title="Generar PDF">📄</button>
/*12685*/                         <button onclick="generarDesdeHistorial(event, '${d.id}', 'email')" style="background:transparent; border:none; cursor:pointer; font-size:1.1rem; padding:2px; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'" title="Enviar Email">📧</button>
/*12686*/                     </div>
/*12687*/                 </div>
/*12688*/             `;
/*12689*/         }).join('');
/*12690*/         tHtml += `</div>`;
/*12691*/         return tHtml;
/*12692*/     };
/*12693*/ 
/*12694*/     if (data.length > 0) {
/*12695*/         const pendientes = data.filter(d => (d.estatus || 'GENERADO') !== 'APROBADO');
/*12696*/         const aprobados = data.filter(d => (d.estatus || 'GENERADO') === 'APROBADO');
/*12697*/         
/*12698*/         html += renderTable(pendientes, 'En Proceso / Pendientes', 'var(--warning)');
/*12699*/         html += renderTable(aprobados, 'Presupuestos Aprobados (Archivo)', 'var(--success)');
/*12700*/     } else {
/*12701*/         html = '<div style="color:var(--muted); text-align:center; padding:20px;">No se encontraron presupuestos.</div>';
/*12702*/     }
/*12703*/     
/*12704*/     listEl.innerHTML = html;
/*12705*/     
/*12706*/     } catch(e) {
/*12707*/         console.error('Error fetching budgets:', e);
/*12708*/         listEl.innerHTML = '<div style="color:var(--danger); text-align:center;">Error cargando historial de presupuestos.</div>';
/*12709*/     }
/*12710*/ }
/*12711*/ 
/*12712*/ window.cambiarEstatusPresupuesto = async function(e, id, timestamp) {
/*12713*/     e.stopPropagation();
/*12714*/     const d = window._globalBudgets.find(x => x.id === id);
/*12715*/     if (!d) return;
/*12716*/ 
/*12717*/     const nuevoEstatus = e.target.value;
/*12718*/     const estatusAnterior = d.estatus;
/*12719*/     
/*12720*/     // Revertir visualmente mientras se valida
/*12721*/     e.target.value = estatusAnterior;
/*12722*/ 
/*12723*/     // Mostrar modal de PIN
/*12724*/     window._pendingStatusChange = { selectEl: e.target, budgetObj: d, nuevoEstatus, estatusAnterior };
/*12725*/     document.getElementById('modal-pin-estatus').style.display = 'flex';
/*12726*/     document.getElementById('pin-estatus-input').value = '';
/*12727*/     document.getElementById('pin-estatus-input').focus();
/*12728*/     document.getElementById('pin-estatus-label').textContent = `Confirmar cambio a "${nuevoEstatus}"`;
/*12729*/ };
/*12730*/ 
/*12731*/ window.confirmarCambioEstatusConPin = async function() {
/*12732*/     const pin = document.getElementById('pin-estatus-input').value.trim();
/*12733*/     if (!pin) return toast('Debe ingresar su clave', 'error');
/*12734*/ 
/*12735*/     const { selectEl, budgetObj, nuevoEstatus, estatusAnterior } = window._pendingStatusChange || {};
/*12736*/     if (!budgetObj) return;
/*12737*/ 
/*12738*/     // Verificar PIN contra el servidor
/*12739*/     const resPin = await apiFetch('/api/verify-pin', { method: 'POST', body: JSON.stringify({ pin }) });
/*12740*/     if (!resPin || !resPin.success) {
/*12741*/         toast('Clave incorrecta. Cambio de estatus cancelado.', 'error');
/*12742*/         document.getElementById('modal-pin-estatus').style.display = 'none';
/*12743*/         return;
/*12744*/     }
/*12745*/ 
/*12746*/     // PIN correcto: aplicar cambio
/*12747*/     document.getElementById('modal-pin-estatus').style.display = 'none';
/*12748*/     budgetObj.estatus = nuevoEstatus;
/*12749*/     selectEl.value = nuevoEstatus;
/*12750*/ 
/*12751*/     if (nuevoEstatus === 'APROBADO') {
/*12752*/         selectEl.style.color = 'var(--success)';
/*12753*/         selectEl.style.borderColor = 'var(--success)';
/*12754*/     } else {
/*12755*/         selectEl.style.color = 'var(--muted)';
/*12756*/         selectEl.style.borderColor = 'var(--border)';
/*12757*/     }
/*12758*/ 
/*12759*/     const res = await apiFetch('/api/presupuestos/' + budgetObj.id, {
/*12760*/         method: 'PUT',
/*12761*/         body: JSON.stringify(budgetObj)
/*12762*/     });
/*12763*/     if (res.success) {
/*12764*/         toast('Estatus actualizado a ' + nuevoEstatus, 'success');
/*12765*/     } else {
/*12766*/         budgetObj.estatus = estatusAnterior;
/*12767*/         selectEl.value = estatusAnterior;
/*12768*/         toast('Error al actualizar estatus: ' + res.error, 'error');
/*12769*/         if (window.renderHistorialPresupuestos) window.renderHistorialPresupuestos();
/*12770*/     }
/*12771*/ };
/*12772*/ 
/*12773*/ window.cancelarCambioEstatus = function() {
/*12774*/     document.getElementById('modal-pin-estatus').style.display = 'none';
/*12775*/     const { selectEl, estatusAnterior } = window._pendingStatusChange || {};
/*12776*/     if (selectEl) selectEl.value = estatusAnterior;
/*12777*/ };
/*12778*/ 
/*12779*/ 
/*12780*/ window.generarDesdeHistorial = async function(e, id, tipo) {
/*12781*/     e.stopPropagation();
/*12782*/     const d = window._globalBudgets.find(x => x.id === id);
/*12783*/     if (!d) return;
/*12784*/     
/*12785*/     await cargarPresupuestoDesdeHistorial(id, d.timestamp);
/*12786*/     await accionPresupuesto(tipo);
/*12787*/     switchPresupuestoTab('historial');
/*12788*/     if (window.renderPresupuestos) window.renderPresupuestos(document.getElementById('current-view'));
/*12789*/ }
/*12790*/ 
/*12791*/ window.cargarPresupuestoDesdeHistorial = function(id, timestamp) {
/*12792*/     const data = window._globalBudgets || [];
/*12793*/     const d = data.find(x => x.id === id);
/*12794*/     if(!d) return toast('Error al cargar presupuesto', 'error');
/*12795*/ 
/*12796*/     const f = d.form || {};
/*12797*/     
/*12798*/     document.getElementById('pres-empresa-emisora').value = f.empresaEmisora || 'EYE STAFF';
/*12799*/     if(document.getElementById('pres-correlativo')) document.getElementById('pres-correlativo').value = id;
/*12800*/     document.getElementById('pres-empresa').value = f.emp || d.empresa || '';
/*12801*/     document.getElementById('pres-atencion').value = f.atencion || '';
/*12802*/     document.getElementById('pres-telefonos').value = f.telefonos || '';
/*12803*/     document.getElementById('pres-email').value = f.email || '';
/*12804*/     document.getElementById('pres-tipo-evento').value = f.tipoEvento || 'PRESUPUESTO';
/*12805*/     document.getElementById('pres-evento').value = f.evento || d.evento || '';
/*12806*/     document.getElementById('pres-personas').value = f.personas || '';
/*12807*/     document.getElementById('pres-direccion').value = f.direccion || '';
/*12808*/     document.getElementById('pres-lugar').value = f.lugar || '';
/*12809*/     document.getElementById('pres-ciudad').value = f.ciudad || '';
/*12810*/     
/*12811*/     // Si la versión antigua tenía convocatoria, ignorarla o mostrarla en consola
/*12812*/     
/*12813*/     document.getElementById('pres-inicio').value = f.inicio || '';
/*12814*/     document.getElementById('pres-fecha').value = f.fecha || d.fecha || '';
/*12815*/     document.getElementById('pres-fecha-fin').value = f.fecha_fin || '';
/*12816*/     document.getElementById('pres-fin-hora').value = f.fin_hora || '';
/*12817*/     
/*12818*/     // Cargar items
/*12819*/     itemsPresupuesto = d.items || [];
/*12820*/     renderPresupuestoItems();
/*12821*/     
/*12822*/     window.currentEditingPresupuestoId = d.id;
/*12823*/     window.currentEditingPresupuestoTimestamp = d.timestamp;
/*12824*/     document.getElementById('generador-title').innerHTML = `MODIFICANDO PRESUPUESTO #${d.id}`;
/*12825*/     
/*12826*/     // Si está aprobado y no es sesión, mostrar botón INICIAR EVENTO
/*12827*/     const isApproved = d.estatus === 'APROBADO';
/*12828*/     const isAlreadySession = (window.allSessions || []).some(sess => sess.budget_id == d.id);
/*12829*/     if (document.getElementById('btn-iniciar-presupuesto')) {
/*12830*/         document.getElementById('btn-iniciar-presupuesto').style.display = (isApproved && !isAlreadySession) ? 'block' : 'none';
/*12831*/     }
/*12832*/     
/*12833*/     // Cambiar a la pestaña de generador para ver el presupuesto
/*12834*/     switchPresupuestoTab('generador');
/*12835*/     
/*12836*/     // Auto-scroll hacia arriba
/*12837*/     document.getElementById('current-view').scrollIntoView({ behavior: 'smooth' });
/*12838*/     toast('Presupuesto cargado exitosamente', 'success');
/*12839*/ }
/*12840*/ 
/*12841*/ window.fetchNextBudgetId = async function() {
/*12842*/     if (window.currentEditingPresupuestoId) return;
/*12843*/     const empresa = document.getElementById('pres-empresa-emisora').value;
/*12844*/     try {
/*12845*/         const res = await apiFetch(`/api/presupuestos/next-id?empresa=${encodeURIComponent(empresa)}`);
/*12846*/         if (res && res.success && document.getElementById('pres-correlativo')) {
/*12847*/             document.getElementById('pres-correlativo').value = res.nextId;
/*12848*/         }
/*12849*/     } catch(e) {
/*12850*/         console.error('Error fetching next ID:', e);
/*12851*/     }
/*12852*/ };
/*12853*/ 
/*12854*/ window.nuevoPresupuesto = function() {
/*12855*/     window.currentEditingPresupuestoId = null;
/*12856*/     window.currentEditingPresupuestoTimestamp = null;
/*12857*/     document.getElementById('generador-title').innerHTML = 'NUEVO PRESUPUESTO';
/*12858*/     if (document.getElementById('btn-iniciar-presupuesto')) document.getElementById('btn-iniciar-presupuesto').style.display = 'none';
/*12859*/     
/*12860*/     const fields = ['pres-empresa', 'pres-atencion', 'pres-telefonos', 'pres-email', 'pres-evento', 'pres-personas', 'pres-direccion', 'pres-lugar', 'pres-ciudad', 'pres-fecha', 'pres-inicio', 'pres-fecha-fin', 'pres-fin-hora'];
/*12861*/     fields.forEach(id => {
/*12862*/         if(document.getElementById(id)) document.getElementById(id).value = '';
/*12863*/     });
/*12864*/     
/*12865*/     itemsPresupuesto = [];
/*12866*/     renderPresupuestoItems();
/*12867*/     addPresupuestoItem();
/*12868*/     window.fetchNextBudgetId();
/*12869*/     toast('Formulario limpiado para nuevo presupuesto', 'info');
/*12870*/ }
/*12871*/ 
/*12872*/ window.loadEmpresasToDatalist = function() {
/*12873*/     const data = JSON.parse(localStorage.getItem('saved_empresas') || '{}');
/*12874*/     const dl = document.getElementById('lista-empresas');
/*12875*/     if(dl) {
/*12876*/         dl.innerHTML = Object.keys(data).map(k => `<option value="${k}">`).join('');
/*12877*/     }
/*12878*/ }
/*12879*/ window.autoFillEmpresa = function() {
/*12880*/     const val = document.getElementById('pres-empresa').value.trim().toUpperCase();
/*12881*/     const data = JSON.parse(localStorage.getItem('saved_empresas') || '{}');
/*12882*/     if (data[val]) {
/*12883*/         document.getElementById('pres-atencion').value = data[val].atencion || '';
/*12884*/         document.getElementById('pres-telefonos').value = data[val].telefonos || '';
/*12885*/         document.getElementById('pres-email').value = data[val].email || '';
/*12886*/     }
/*12887*/ }
/*12888*/ window.saveEmpresaData = function() {
/*12889*/     const val = document.getElementById('pres-empresa').value.trim().toUpperCase();
/*12890*/     if(val) {
/*12891*/         const data = JSON.parse(localStorage.getItem('saved_empresas') || '{}');
/*12892*/         data[val] = {
/*12893*/             atencion: document.getElementById('pres-atencion').value,
/*12894*/             telefonos: document.getElementById('pres-telefonos').value,
/*12895*/             email: document.getElementById('pres-email').value
/*12896*/         };
/*12897*/         localStorage.setItem('saved_empresas', JSON.stringify(data));
/*12898*/     }
/*12899*/ }
/*12900*/ window.calcPresupuestoDias = function() {
/*12901*/     const f1 = document.getElementById('pres-fecha').value;
/*12902*/     const f2 = document.getElementById('pres-fecha-fin').value;
/*12903*/     if (f1 && f2) {
/*12904*/         const d1 = new Date(f1);
/*12905*/         const d2 = new Date(f2);
/*12906*/         let diffTime = d2.getTime() - d1.getTime();
/*12907*/         let diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Inclusive days
/*12908*/         if (diffDays <= 0) diffDays = 1;
/*12909*/         document.getElementById('pres-dias').value = diffDays;
/*12910*/         
/*12911*/         itemsPresupuesto.forEach(item => {
/*12912*/             item.dias = diffDays;
/*12913*/             item.total = Number(item.cant) * Number(item.precio) * Number(item.dias);
/*12914*/         });
/*12915*/         renderPresupuestoItems();
/*12916*/     }
/*12917*/ }
/*12918*/ 
/*12919*/ function addPresupuestoItem() {
/*12920*/     const id = Date.now().toString() + Math.floor(Math.random()*1000);
/*12921*/     itemsPresupuesto.push({
/*12922*/         id, cant: 1, desc: '', precio: 0, dias: document.getElementById('pres-dias').value || 1, total: 0
/*12923*/     });
/*12924*/     renderPresupuestoItems();
/*12925*/ }
/*12926*/ 
/*12927*/ function removePresupuestoItem(id) {
/*12928*/     itemsPresupuesto = itemsPresupuesto.filter(i => i.id !== id);
/*12929*/     renderPresupuestoItems();
/*12930*/ }
/*12931*/ 
/*12932*/ function updatePresupuestoItem(id, field, value) {
/*12933*/     const item = itemsPresupuesto.find(i => i.id === id);
/*12934*/     if (!item) return;
/*12935*/     
/*12936*/     if (field === 'desc_select') {
/*12937*/         const cat = PRESUPUESTO_CATALOGO.find(c => c.desc === value);
/*12938*/         item.desc = value;
/*12939*/         if (cat && cat.precio > 0) item.precio = cat.precio;
/*12940*/     } else {
/*12941*/         item[field] = value;
/*12942*/     }
/*12943*/     
/*12944*/     item.total = Number(item.cant) * Number(item.precio) * Number(item.dias);
/*12945*/     renderPresupuestoItems();
/*12946*/ }
/*12947*/ 
/*12948*/ function renderPresupuestoItems() {
/*12949*/     const tbody = document.getElementById('pres-items-body');
/*12950*/     if (!tbody) return;
/*12951*/     
/*12952*/     let optionsHtml = '<option value="">-- Catálogo / Escribir Manual --</option>';
/*12953*/     PRESUPUESTO_CATALOGO.forEach(c => {
/*12954*/         optionsHtml += `<option value="${c.desc}">${c.desc} ${c.precio > 0 ? '($'+c.precio+')' : ''}</option>`;
/*12955*/     });
/*12956*/ 
/*12957*/     tbody.innerHTML = itemsPresupuesto.map(item => `
/*12958*/         <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
/*12959*/             <td style="padding:10px;"><input type="number" value="${item.cant}" onchange="updatePresupuestoItem('${item.id}', 'cant', this.value)" style="width:60px; padding:8px; background:var(--surface2); border:1px solid var(--border); color:#fff; border-radius:6px;"></td>
/*12960*/             <td style="padding:10px; display:flex; flex-direction:column; gap:5px;">
/*12961*/                 <select onchange="updatePresupuestoItem('${item.id}', 'desc_select', this.value)" style="padding:8px; background:var(--surface2); border:1px solid var(--border); color:#fff; border-radius:6px;">
/*12962*/                     ${optionsHtml.replace(`value="${item.desc}"`, `value="${item.desc}" selected`)}
/*12963*/                 </select>
/*12964*/                 <input type="text" value="${item.desc}" placeholder="Escribir descripción manual..." onchange="updatePresupuestoItem('${item.id}', 'desc', this.value)" style="padding:8px; background:var(--surface2); border:1px solid var(--border); color:#fff; border-radius:6px;">
/*12965*/             </td>
/*12966*/             <td style="padding:10px;"><input type="number" value="${item.precio}" onchange="updatePresupuestoItem('${item.id}', 'precio', this.value)" style="width:80px; padding:8px; background:var(--surface2); border:1px solid var(--border); color:#fff; border-radius:6px;"></td>
/*12967*/             <td style="padding:10px;"><input type="number" value="${item.dias}" onchange="updatePresupuestoItem('${item.id}', 'dias', this.value)" style="width:60px; padding:8px; background:var(--surface2); border:1px solid var(--border); color:#fff; border-radius:6px;"></td>
/*12968*/             <td style="padding:10px; font-weight:900;">${item.total.toFixed(2)}</td>
/*12969*/             <td style="padding:10px;">
/*12970*/                 <button class="btn" onclick="removePresupuestoItem('${item.id}')" style="background:var(--danger); color:white; padding:5px 10px; border-radius:6px;">X</button>
/*12971*/             </td>
/*12972*/         </tr>
/*12973*/     `).join('');
/*12974*/ 
/*12975*/     calcularTotales();
/*12976*/ }
/*12977*/ 
/*12978*/ function calcularTotales() {
/*12979*/     const ivaPerc = Number(document.getElementById('pres-iva').value || 12);
/*12980*/     let subtotal = 0;
/*12981*/     itemsPresupuesto.forEach(i => subtotal += Number(i.total));
/*12982*/     const iva = subtotal * (ivaPerc / 100);
/*12983*/     const total = subtotal + iva;
/*12984*/ 
/*12985*/     document.getElementById('pres-subtotal').textContent = subtotal.toFixed(2);
/*12986*/     document.getElementById('pres-total-iva').textContent = iva.toFixed(2);
/*12987*/     document.getElementById('pres-gran-total').textContent = total.toFixed(2);
/*12988*/ }
/*12989*/ 
/*12990*/ async function guardarDatosPresupuesto(actionName) {
/*12991*/     if(window.saveEmpresaData) window.saveEmpresaData();
/*12992*/     
/*12993*/     const emp = document.getElementById('pres-empresa').value || 'N/A';
/*12994*/     const tel = document.getElementById('pres-telefonos').value || '';
/*12995*/     const email = document.getElementById('pres-email').value || '';
/*12996*/     const tipoEvento = document.getElementById('pres-tipo-evento').value || 'PRESUPUESTO';
/*12997*/     const evento = document.getElementById('pres-evento').value || 'N/A';
/*12998*/     const fInicio = document.getElementById('pres-fecha').value || 'N/A';
/*12999*/     const total = document.getElementById('pres-gran-total').textContent;
/*13000*/ 
/*13001*/     let isEditing = window.currentEditingPresupuestoId ? true : false;
/*13002*/     let newStatus = actionName === 'guardar' ? 'GENERADO' : (isEditing ? 'MODIFICADO Y ENVIADO' : 'ENVIADO');
/*13003*/     
/*13004*/     if (isEditing && actionName === 'guardar') {
/*13005*/         const oldEntry = (window._globalBudgets || []).find(x => x.id === window.currentEditingPresupuestoId);
/*13006*/         if (oldEntry) newStatus = oldEntry.estatus || 'MODIFICADO';
/*13007*/     }
/*13008*/ 
/*13009*/     const payload = {
/*13010*/         empresa: emp,
/*13011*/         evento: evento,
/*13012*/         fecha: fInicio,
/*13013*/         monto: total,
/*13014*/         timestamp: window.currentEditingPresupuestoTimestamp || new Date().getTime(),
/*13015*/         action: actionName,
/*13016*/         estatus: newStatus,
/*13017*/         form: {
/*13018*/             empresaEmisora: document.getElementById('pres-empresa-emisora').value,
/*13019*/             emp,
/*13020*/             atencion: document.getElementById('pres-atencion').value,
/*13021*/             telefonos: tel,
/*13022*/             email: email,
/*13023*/             tipoEvento: tipoEvento,
/*13024*/             evento: evento,
/*13025*/             personas: document.getElementById('pres-personas').value,
/*13026*/             direccion: document.getElementById('pres-direccion').value,
/*13027*/             lugar: document.getElementById('pres-lugar').value,
/*13028*/             ciudad: document.getElementById('pres-ciudad').value,
/*13029*/             fecha: fInicio,
/*13030*/             inicio: document.getElementById('pres-inicio').value,
/*13031*/             fecha_fin: document.getElementById('pres-fecha-fin').value,
/*13032*/             fin_hora: document.getElementById('pres-fin-hora').value
/*13033*/         },
/*13034*/         items: JSON.parse(JSON.stringify(itemsPresupuesto))
/*13035*/     };
/*13036*/     
/*13037*/     let correlativo = window.currentEditingPresupuestoId;
/*13038*/     
/*13039*/     if (isEditing) {
/*13040*/         await apiFetch('/api/presupuestos/' + correlativo, {
/*13041*/             method: 'PUT',
/*13042*/             body: JSON.stringify(payload)
/*13043*/         });
/*13044*/     } else {
/*13045*/         const res = await apiFetch('/api/presupuestos', {
/*13046*/             method: 'POST',
/*13047*/             body: JSON.stringify(payload)
/*13048*/         });
/*13049*/         if (res.success && res.id) {
/*13050*/             correlativo = res.id;
/*13051*/             window.currentEditingPresupuestoId = correlativo;
/*13052*/             window.currentEditingPresupuestoTimestamp = payload.timestamp;
/*13053*/             document.getElementById('generador-title').innerHTML = `MODIFICANDO PRESUPUESTO #${correlativo}`;
/*13054*/         }
/*13055*/     }
/*13056*/     
/*13057*/     if(window.renderHistorialPresupuestos) window.renderHistorialPresupuestos();
/*13058*/     
/*13059*/     // Guardar en BBDD de Clientes del Sistema
/*13060*/     if (emp && emp !== 'N/A') {
/*13061*/         apiFetch('/api/presupuestos/client', {
/*13062*/             method: 'POST',
/*13063*/             body: JSON.stringify({ name: emp, phone: tel, email: email, event_type: tipoEvento })
/*13064*/         }).catch(e => console.warn('Error saving client to db', e));
/*13065*/     }
/*13066*/ 
/*13067*/     return { correlativo, emp, evento, fInicio, empresaEmisora: document.getElementById('pres-empresa-emisora').value };
/*13068*/ }
/*13069*/ 
/*13070*/ function obtenerNombresSeguros(evento, fInicio) {
/*13071*/     let safeEvento = (evento && evento !== 'N/A') ? evento.toUpperCase() : 'EVENTO';
/*13072*/     let safeFecha = (fInicio && fInicio !== 'N/A') ? fInicio.toUpperCase() : 'FECHA';
/*13073*/     safeEvento = safeEvento.replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
/*13074*/     safeFecha = safeFecha.replace(/[^A-Z0-9-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
/*13075*/     return { safeEvento, safeFecha };
/*13076*/ }
/*13077*/ 
/*13078*/ window.limpiarGeneradorPresupuesto = function() {
/*13079*/     if(confirm('¿Está seguro de eliminar los datos y limpiar todo el formulario del presupuesto?')) {
/*13080*/         renderPresupuestos(document.getElementById('current-view'));
/*13081*/     }
/*13082*/ }
/*13083*/ 
/*13084*/ async function accionPresupuesto(tipo) {
/*13085*/     if (itemsPresupuesto.length === 0) return toast('Debe agregar al menos un servicio', 'error');
/*13086*/     
/*13087*/     const requiredFields = [
/*13088*/         { id: 'pres-atencion', name: 'NOMBRE DE CLIENTE' },
/*13089*/         { id: 'pres-telefonos', name: 'TELÉFONO' },
/*13090*/         { id: 'pres-email', name: 'E-MAIL' },
/*13091*/         { id: 'pres-tipo-evento', name: 'TIPO DE EVENTO' },
/*13092*/         { id: 'pres-direccion', name: 'DIRECCIÓN DEL EVENTO' },
/*13093*/         { id: 'pres-fecha', name: 'FECHA DEL EVENTO' },
/*13094*/         { id: 'pres-inicio', name: 'HORA DE INICIO' },
/*13095*/         { id: 'pres-fecha-fin', name: 'FECHA TENTATIVA CULMINACIÓN' },
/*13096*/         { id: 'pres-fin-hora', name: 'HORA CULMINACIÓN' }
/*13097*/     ];
/*13098*/ 
/*13099*/     for (const field of requiredFields) {
/*13100*/         const el = document.getElementById(field.id);
/*13101*/         if (!el || !el.value || el.value.trim() === '') {
/*13102*/             return toast(`El campo "${field.name}" es obligatorio`, 'error');
/*13103*/         }
/*13104*/     }
/*13105*/     
/*13106*/     const datos = await guardarDatosPresupuesto(tipo);
/*13107*/     const { correlativo, evento, fInicio, empresaEmisora } = datos;
/*13108*/     const { safeEvento, safeFecha } = obtenerNombresSeguros(evento, fInicio);
/*13109*/     const nombreArchivo = `PRESUPUESTO_${correlativo}_${safeEvento}_${safeFecha}`;
/*13110*/ 
/*13111*/     if (tipo === 'pdf') {
/*13112*/         await generarPDFPresupuesto(nombreArchivo);
/*13113*/     } else if (tipo === 'excel') {
/*13114*/         generarExcelPresupuesto(nombreArchivo);
/*13115*/     } else if (tipo === 'email') {
/*13116*/         await enviarEmailPresupuesto(nombreArchivo, evento, empresaEmisora);
/*13117*/     } else if (tipo === 'guardar') {
/*13118*/         toast('Presupuesto guardado en el historial', 'success');
/*13119*/     }
/*13120*/     
/*13121*/     switchPresupuestoTab('historial');
/*13122*/ }
/*13123*/ 
/*13124*/ function generarExcelPresupuesto(nombreArchivo) {
/*13125*/     toast('Generando Excel...', 'info');
/*13126*/     let csv = "CANT.;DESCRIPCION;PRECIO U.;DIAS;TOTAL\\n";
/*13127*/     itemsPresupuesto.forEach(i => {
/*13128*/         csv += `${i.cant};${i.desc};${i.precio};${i.dias};${i.total.toFixed(2)}\\n`;
/*13129*/     });
/*13130*/     
/*13131*/     // Totales
/*13132*/     const subtotal = document.getElementById('pres-subtotal').textContent;
/*13133*/     const iva = document.getElementById('pres-total-iva').textContent;
/*13134*/     const total = document.getElementById('pres-gran-total').textContent;
/*13135*/     csv += `\\n;;SUBTOTAL;;${subtotal}\\n`;
/*13136*/     csv += `;;IVA;;${iva}\\n`;
/*13137*/     csv += `;;TOTAL A PAGAR;;${total}\\n`;
/*13138*/ 
/*13139*/     const blob = new Blob(["\\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
/*13140*/     const link = document.createElement("a");
/*13141*/     const url = URL.createObjectURL(blob);
/*13142*/     link.setAttribute("href", url);
/*13143*/     link.setAttribute("download", nombreArchivo + ".csv");
/*13144*/     link.style.visibility = 'hidden';
/*13145*/     document.body.appendChild(link);
/*13146*/     link.click();
/*13147*/     document.body.removeChild(link);
/*13148*/     toast('Excel descargado', 'success');
/*13149*/ }
/*13150*/ 
/*13151*/ async function enviarEmailPresupuesto(nombreArchivo, evento, empresaEmisora) {
/*13152*/     const email = document.getElementById('pres-email').value;
/*13153*/     if(!email) return toast('Debe colocar el E-Mail del cliente para enviar', 'error');
/*13154*/     
/*13155*/     toast('Generando PDF y preparando envío...', 'info');
/*13156*/     try {
/*13157*/         const base64Data = await generarPDFPresupuesto(nombreArchivo, 'base64');
/*13158*/         if (!base64Data) throw new Error('Falló la conversión del PDF a Base64');
/*13159*/ 
/*13160*/         const res = await apiFetch('/api/presupuestos/send-email', {
/*13161*/             method: 'POST',
/*13162*/             body: JSON.stringify({
/*13163*/                 to: email,
/*13164*/                 subject: `Presupuesto de Servicios - ${evento}`,
/*13165*/                 pdfData: base64Data,
/*13166*/                 filename: `${nombreArchivo}.pdf`,
/*13167*/                 senderName: empresaEmisora === 'RENTAEQUIPOS' ? 'RENTAEQUIPOS' : 'EYE STAFF'
/*13168*/             })
/*13169*/         });
/*13170*/         
/*13171*/         if (!res) return; // Error ya notificado en apiFetch
/*13172*/ 
/*13173*/         if (res.success) {
/*13174*/             toast('Email enviado exitosamente', 'success');
/*13175*/         } else {
/*13176*/             const errMsg = res.error?.message || (typeof res.error === 'string' ? res.error : JSON.stringify(res.error));
/*13177*/             toast('Error al enviar email: ' + errMsg, 'error');
/*13178*/         }
/*13179*/     } catch(e) {
/*13180*/         console.error(e);
/*13181*/         toast('Error crítico: ' + e.message, 'error');
/*13182*/     }
/*13183*/ }
/*13184*/ 
/*13185*/ async function generarPDFPresupuesto(nombreArchivo, action = 'download') {
/*13186*/     toast('Generando PDF...', 'info');
/*13187*/     const { jsPDF } = window.jspdf;
/*13188*/     const doc = new jsPDF();
/*13189*/     
/*13190*/     // Configuración
/*13191*/     const primaryColor = [40, 40, 40];
/*13192*/     const secondaryColor = [100, 100, 100];
/*13193*/     
/*13194*/     try {
/*13195*/         const emisora = document.getElementById('pres-empresa-emisora') ? document.getElementById('pres-empresa-emisora').value : 'EYE STAFF';
/*13196*/         const img = new Image();
/*13197*/         if (emisora === 'RENTAEQUIPOS') {
/*13198*/             img.src = '/rentaequipos.jpeg';
/*13199*/         } else {
/*13200*/             img.src = '/eyestaff.jpeg';
/*13201*/         }
/*13202*/         await new Promise((resolve) => {
/*13203*/             img.onload = resolve;
/*13204*/             img.onerror = resolve; 
/*13205*/         });
/*13206*/         const ratio = img.width && img.height ? img.width / img.height : (40/15);
/*13207*/         const newWidth = 15 * ratio;
/*13208*/         doc.addImage(img, 'JPEG', 14, 10, newWidth, 15);
/*13209*/     } catch(e) {}
/*13210*/ 
/*13211*/     // Título / Cabecera
/*13212*/     doc.setFontSize(22);
/*13213*/     doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
/*13214*/     const emisoraTexto = (document.getElementById('pres-empresa-emisora') ? document.getElementById('pres-empresa-emisora').value : 'EYE STAFF');
/*13215*/     doc.text("PRESUPUESTO DE SERVICIOS", 60, 20); // Movido a la derecha por el logo
/*13216*/     
/*13217*/     doc.setFontSize(10);
/*13218*/     doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
/*13219*/     doc.text("Generado por: " + (emisoraTexto === 'RENTAEQUIPOS' ? 'Rentaequipos' : 'Eye Staff'), 60, 28);
/*13220*/     doc.text("Fecha: " + new Date().toLocaleDateString(), 60, 34);
/*13221*/ 
/*13222*/     // Datos del Cliente y Evento
/*13223*/     const emp = document.getElementById('pres-empresa').value || 'N/A';
/*13224*/     const aten = document.getElementById('pres-atencion').value || 'N/A';
/*13225*/     const tel = document.getElementById('pres-telefonos').value || 'N/A';
/*13226*/     const email = document.getElementById('pres-email').value || 'N/A';
/*13227*/     
/*13228*/     const evento = document.getElementById('pres-evento').value || 'N/A';
/*13229*/     const personas = document.getElementById('pres-personas').value || 'N/A';
/*13230*/     const direccion = document.getElementById('pres-direccion').value || 'N/A';
/*13231*/     const lugar = document.getElementById('pres-lugar').value || 'N/A';
/*13232*/     const ciudad = document.getElementById('pres-ciudad').value || 'N/A';
/*13233*/     
/*13234*/     const fInicio = document.getElementById('pres-fecha').value || 'N/A';
/*13235*/     const convEl = document.getElementById('pres-convocatoria');
/*13236*/     const hConv = convEl ? (convEl.value || 'N/A') : 'N/A';
/*13237*/     const hIni = document.getElementById('pres-inicio').value || 'N/A';
/*13238*/     
/*13239*/     const fFin = document.getElementById('pres-fecha-fin').value || 'N/A';
/*13240*/     const hFin = document.getElementById('pres-fin-hora').value || 'N/A';
/*13241*/ 
/*13242*/     if(window.saveEmpresaData) window.saveEmpresaData(); // Guardar datos para proxima vez
/*13243*/ 
/*13244*/     doc.autoTable({
/*13245*/         startY: 45,
/*13246*/         theme: 'grid',
/*13247*/         headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
/*13248*/         body: [
/*13249*/             ['Empresa:', emp, 'Evento:', evento],
/*13250*/             ['Atención a:', aten, 'Aforo:', personas + ' pax'],
/*13251*/             ['Teléfono:', tel, 'Dirección:', direccion],
/*13252*/             ['E-Mail:', email, 'Lugar/Ciudad:', lugar + ' / ' + ciudad],
/*13253*/             ['Fecha Inicio:', fInicio + ' (Conv: ' + hConv + ' | Ini: ' + hIni + ')', 'Fecha Fin:', fFin + ' (Culm: ' + hFin + ')']
/*13254*/         ]
/*13255*/     });
/*13256*/ 
/*13257*/     // Líneas de Detalles
/*13258*/     const tableData = itemsPresupuesto.map(i => [
/*13259*/         i.cant, 
/*13260*/         i.desc, 
/*13261*/         Number(i.precio).toFixed(2), 
/*13262*/         i.dias, 
/*13263*/         Number(i.total).toFixed(2)
/*13264*/     ]);
/*13265*/ 
/*13266*/     doc.autoTable({
/*13267*/         startY: doc.lastAutoTable.finalY + 15,
/*13268*/         head: [['Cant.', 'Descripción', 'Precio U.', 'Días', 'Total']],
/*13269*/         body: tableData,
/*13270*/         theme: 'striped',
/*13271*/         headStyles: { fillColor: [40, 40, 40], textColor: [255, 255, 255], fontStyle: 'bold' },
/*13272*/         columnStyles: {
/*13273*/             0: { halign: 'center', cellWidth: 20 },
/*13274*/             1: { cellWidth: 80 },
/*13275*/             2: { halign: 'right', cellWidth: 30 },
/*13276*/             3: { halign: 'center', cellWidth: 20 },
/*13277*/             4: { halign: 'right', cellWidth: 30 }
/*13278*/         }
/*13279*/     });
/*13280*/ 
/*13281*/     // Totales
/*13282*/     const ivaPerc = Number(document.getElementById('pres-iva').value || 12);
/*13283*/     const subtotal = document.getElementById('pres-subtotal').textContent;
/*13284*/     const iva = document.getElementById('pres-total-iva').textContent;
/*13285*/     const total = document.getElementById('pres-gran-total').textContent;
/*13286*/ 
/*13287*/     const finalY = doc.lastAutoTable.finalY + 10;
/*13288*/     
/*13289*/     doc.autoTable({
/*13290*/         startY: finalY,
/*13291*/         theme: 'plain',
/*13292*/         body: [
/*13293*/             ['', '', 'SUBTOTAL:', subtotal],
/*13294*/             ['', '', `IVA (${ivaPerc}%):`, iva],
/*13295*/             ['', '', 'TOTAL A PAGAR:', total]
/*13296*/         ],
/*13297*/         columnStyles: {
/*13298*/             0: { cellWidth: 80 },
/*13299*/             1: { cellWidth: 30 },
/*13300*/             2: { halign: 'right', fontStyle: 'bold', cellWidth: 40 },
/*13301*/             3: { halign: 'right', fontStyle: 'bold', cellWidth: 30 }
/*13302*/         }
/*13303*/     });
/*13304*/ 
/*13305*/     // Pie de página
/*13306*/     doc.setFontSize(9);
/*13307*/     doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
/*13308*/     doc.text("Este presupuesto es válido por 15 días.", 14, doc.lastAutoTable.finalY + 20);
/*13309*/     
/*13310*/     // Guardar o retornar PDF
/*13311*/     if (action === 'download') {
/*13312*/         doc.save(`${nombreArchivo}.pdf`);
/*13313*/         toast('PDF Descargado exitosamente', 'success');
/*13314*/     } else if (action === 'base64') {
/*13315*/         try {
/*13316*/             const dataUri = doc.output('datauristring');
/*13317*/             if (dataUri && dataUri.includes('base64,')) {
/*13318*/                 return dataUri.split('base64,')[1];
/*13319*/             } else if (dataUri && dataUri.includes(',')) {
/*13320*/                 return dataUri.split(',')[1];
/*13321*/             }
/*13322*/             return btoa(doc.output());
/*13323*/         } catch(err) {
/*13324*/             console.error('Error doc.output:', err);
/*13325*/             return btoa(doc.output());
/*13326*/         }
/*13327*/     }
/*13328*/ }
/*13329*/ 
/*13330*/ window.migrarPresupuestosLocales = async function() {
/*13331*/     let data = JSON.parse(localStorage.getItem('historial_presupuestos') || '[]');
/*13332*/     if (data && data.length > 0) {
/*13333*/         console.log('Migrando ' + data.length + ' presupuestos a la nube...');
/*13334*/         try {
/*13335*/             const res = await apiFetch('/api/presupuestos', {
/*13336*/                 method: 'POST',
/*13337*/                 body: JSON.stringify(data)
/*13338*/             });
/*13339*/             if (res.success) {
/*13340*/                 localStorage.removeItem('historial_presupuestos');
/*13341*/                 console.log('Migración exitosa');
/*13342*/                 if(window.renderHistorialPresupuestos) window.renderHistorialPresupuestos();
/*13343*/             }
/*13344*/         } catch(e) {
/*13345*/             console.error('Migración fallida', e);
/*13346*/         }
/*13347*/     }
/*13348*/ };
/*13349*/ 
/*13350*/ setTimeout(() => {
/*13351*/     window.migrarPresupuestosLocales();
/*13352*/ }, 2000);
/*13353*/ 
/*13354*/ window.cargarPresupuestoEnLista = function(budgetId) {
/*13355*/     const b = (window._globalBudgets || []).find(x => x.id == budgetId);
/*13356*/     if (!b) return toast('Presupuesto no encontrado', 'error');
/*13357*/ 
/*13358*/     const form = b.form || {};
/*13359*/ 
/*13360*/     const calcConvocatoria = (horaInicio) => {
/*13361*/         if (!horaInicio) return '';
/*13362*/         const [h, m] = horaInicio.split(':').map(Number);
/*13363*/         const total = h * 60 + m - 120;
/*13364*/         const hh = Math.floor(((total % 1440) + 1440) % 1440 / 60);
/*13365*/         const mm = ((total % 1440) + 1440) % 1440 % 60;
/*13366*/         return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
/*13367*/     };
/*13368*/ 
/*13369*/     const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined && val !== null && val !== '') el.value = val; };
/*13370*/ 
/*13371*/     setVal('lista-presupuesto', b.id);
/*13372*/     setVal('lista-nombre', b.evento);
/*13373*/     setVal('lista-fecha', b.fecha);
/*13374*/     setVal('lista-contacto', form.atencion);
/*13375*/     setVal('lista-telefono', form.telefonos);
/*13376*/     setVal('lista-direccion', form.direccion);
/*13377*/     setVal('lista-hora-inicio', form.inicio);
/*13378*/     setVal('lista-hora-fin', form.fin_hora);
/*13379*/     setVal('lista-fecha-fin', form.fecha_fin || b.fecha);
/*13380*/     const convCalc = calcConvocatoria(form.inicio);
/*13381*/     setVal('lista-hora-convocatoria', convCalc || form.convocatoria);
/*13382*/ 
/*13383*/     const typeSelect = document.getElementById('lista-tipo');
/*13384*/     const tVal = (form.tipoEvento || '').toLowerCase();
/*13385*/     if (typeSelect && tVal) {
/*13386*/         for(let opt of typeSelect.options) {
/*13387*/             if (opt.value.toLowerCase() === tVal) { typeSelect.value = opt.value; break; }
/*13388*/         }
/*13389*/     }
/*13390*/ 
/*13391*/     // Expandir el panel de datos del evento
/*13392*/     const content = document.getElementById('datos-evento-content');
/*13393*/     if (content) {
/*13394*/         content.style.display = 'block';
/*13395*/         const icon = document.getElementById('datos-evento-icon');
/*13396*/         if (icon) icon.innerText = '▼';
/*13397*/     }
/*13398*/ 
/*13399*/     document.getElementById('current-view')?.scrollIntoView({ behavior: 'smooth' });
/*13400*/     toast('✅ DATOS CARGADOS — Revise, complete y asigne el personal', 'success');
/*13401*/ };
/*13402*/ 
/*13403*/ window.abrirModalGuardar = function() {
/*13404*/ 
/*13405*/     document.getElementById('modal-guardar-presupuesto').style.display = 'flex';
/*13406*/ };
/*13407*/ 
/*13408*/ window.cerrarModalGuardar = function() {
/*13409*/     document.getElementById('modal-guardar-presupuesto').style.display = 'none';
/*13410*/ };
/*13411*/ 
/*13412*/ window.confirmarGuardarPresupuesto = async function(tipo) {
/*13413*/     cerrarModalGuardar();
/*13414*/     if(tipo === 'guardar') {
/*13415*/         toast('Guardando presupuesto...', 'info');
/*13416*/     }
/*13417*/     await accionPresupuesto(tipo);
/*13418*/ };
/*13419*/ 
/*13420*/ </script>