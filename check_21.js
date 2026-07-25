
    async function renderInventarios(el) {
        setTimeout(() => window.scrollTo(0, 0), 100);
        showLoading('Cargando inventario...');
        try {
            const res = await apiFetch('/api/inventory');
            hideLoading();
            let items = res && res.items ? res.items : [];
            
            // Guardar globalmente para poder exportar a excel
            window.currentInventoryItems = items;

            let html = `
                <div class="view-header">
                    <h1 class="view-title" style="color:#8b5cf6;">📦 MANEJO DE INVENTARIOS</h1>
                </div>

                <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px; margin-top:20px; align-items:center;">
                    ${items.length === 0 ? `<button class="btn" style="background:var(--success); color:white; font-weight:900; border:none; padding:8px 14px; border-radius:10px; cursor:pointer; font-size:0.78rem;" onclick="inicializarInventarioBase()">🚀 INICIALIZAR</button>` : ''}
                    <button class="btn" style="background:var(--accent); color:white; font-weight:900; border:none; padding:8px 14px; border-radius:10px; cursor:pointer; font-size:0.78rem;" onclick="openEditInventoryItem(null)">➕ NUEVO ÍTEM</button>
                    <button class="btn" style="background:var(--success); color:white; font-weight:900; border:none; padding:8px 14px; border-radius:10px; cursor:pointer; font-size:0.78rem;" onclick="exportarInventarioExcel()">📊 EXPORTAR EXCEL</button>
                    <button class="btn" style="background:#6366f1; color:white; font-weight:900; border:none; padding:8px 14px; border-radius:10px; cursor:pointer; font-size:0.78rem;" onclick="imprimirInventario()">🖨️ IMPRIMIR FORMATO</button>
                    <button class="btn" style="background:#10b981; color:white; font-weight:900; border:none; padding:8px 14px; border-radius:10px; cursor:pointer; font-size:0.78rem;" onclick="showInventoryChannelModal()">📧 ENVIAR REPORTE</button>
                </div>


            `;

            if (items.length > 0) {
                // Sort items by type
                items.sort((a, b) => {
                    const tA = a.type || 'OTROS';
                    const tB = b.type || 'OTROS';
                    if (tA !== tB) return tA.localeCompare(tB);
                    return (a.name || '').localeCompare(b.name || '');
                });

                html += `
                    <div style="background:var(--surface); border:1px solid var(--border); border-radius:16px; overflow:hidden;">
                        <div style="overflow-x:auto; max-height:65vh; overflow-y:auto;">
                        <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.8rem;">
                            <thead style="position:sticky; top:0; z-index:10;">
                                <tr style="background:#1a1f35; border-bottom:2px solid rgba(99,102,241,0.4); font-size:0.7rem;">
                                    <th style="padding:10px 6px; color:white; font-weight:900;">ÍTEM</th>
                                    <th style="padding:10px 6px; color:#a5b4fc; text-align:center; font-weight:900; line-height:1.2;">SERIALES</th>
                                    <th style="padding:10px 6px; color:#10b981; text-align:center; font-weight:900; line-height:1.2;">CANT.<br>DISP.</th>
                                    <th style="padding:10px 6px; color:#f59e0b; text-align:center; font-weight:900; line-height:1.2;">EN<br>EVENTOS</th>
                                    <th style="padding:10px 6px; color:var(--muted); line-height:1.2;">UBICACIÓN</th>
                                </tr>
                            </thead>
                            <tbody>
                `;

                const typeColors = {
                    'EQUIPO': 'rgba(139, 92, 246, 0.1)',
                    'INSUMO': 'rgba(16, 185, 129, 0.1)',
                    'MATERIAL': 'rgba(59, 130, 246, 0.1)',
                    'UNIFORME': 'rgba(245, 158, 11, 0.1)'
                };
                const typeTextColors = {
                    'EQUIPO': '#a78bfa',
                    'INSUMO': '#34d399',
                    'MATERIAL': '#60a5fa',
                    'UNIFORME': '#fbbf24'
                };
                let currentType = '';

                items.forEach((i, idx) => {
                    const itemTypeStr = (i.type||'OTROS').toUpperCase();
                    const textColor = typeTextColors[itemTypeStr] || '#8b5cf6';
                    
                    if (itemTypeStr !== currentType) {
                        currentType = itemTypeStr;
                        html += `
                            <tr style="background:#111424;">
                                <td colspan="4" style="padding:15px; color:${textColor}; font-weight:900; font-size:0.9rem; text-transform:uppercase; letter-spacing:1px; border-bottom:2px solid ${textColor};">
                                    📂 SECCIÓN: ${currentType}
                                </td>
                            </tr>
                        `;
                    }
                    const baseRowColor = typeColors[itemTypeStr] || 'transparent';

                    const bgHover = "this.style.background='rgba(255,255,255,0.05)'";
                    const bgOut = `this.style.background='${baseRowColor}'`;
                    const serialsArr = i.serial_number ? i.serial_number.split(',').map(s => s.trim()).filter(s => s) : [];
                    const hasSerials = i.has_serial && serialsArr.length > 0;
                    const rowId = `inv-row-${i.id}`;
                    
                    html += `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.05); background:${baseRowColor}; transition:background 0.2s; cursor:pointer;" onmouseover="${bgHover}" onmouseout="${bgOut}" onclick='toggleMovements("${rowId}", ${i.id}, ${JSON.stringify(i).replace(/'/g, "&#39;")})'>
                            <td style="padding:10px 6px; color:white; font-weight:900; font-size:0.75rem; word-break:break-word;">
                                ${i.name.toUpperCase()}
                                ${i.size ? `<span style="background:var(--warning); color:black; padding:2px 4px; border-radius:4px; font-size:0.55rem; font-weight:900; margin-left:3px;">${i.size}</span>` : ''}
                            </td>
                            <td style="padding:10px 6px; text-align:center; vertical-align:middle;">
                                ${hasSerials ? `<span id="${rowId}-toggle" style="background:rgba(99,102,241,0.2); color:#a5b4fc; padding:4px 6px; border-radius:6px; font-size:0.65rem; font-weight:900; cursor:pointer; display:inline-block; transition:transform 0.2s;" onclick="event.stopPropagation(); toggleSerialRows('${rowId}')">▶ 🔢 ${serialsArr.length}</span>` : '<span style="color:var(--muted); font-size:0.65rem;">-</span>'}
                            </td>
                            <td style="padding:10px 6px; color:#10b981; font-weight:900; font-size:0.9rem; text-align:center;">
                                ${i.quantity}
                            </td>
                            <td style="padding:10px 6px; color:#f59e0b; font-weight:900; font-size:0.9rem; text-align:center;">
                                ${i.assigned || 0}
                            </td>
                            <td style="padding:10px 6px; color:var(--muted); font-size:0.65rem; word-break:break-word; position:relative; padding-right:40px;">
                                ${(() => {
                                    const loc = (i.location || '').toUpperCase();
                                    return loc === 'ALMACÉN PRINCIPAL' ? 'FLANDES' : (loc || '-- Sin ubicación --');
                                })()}
                                <button onclick="event.stopPropagation(); deleteInventoryItem(${i.id}, null)" class="btn" style="position:absolute; right:5px; top:50%; transform:translateY(-50%); background:rgba(239, 68, 68, 0.1); border:1px solid rgba(239, 68, 68, 0.3); color:#ef4444; border-radius:6px; padding:4px 8px; font-size:0.7rem; cursor:pointer;" title="Eliminar Ítem">🗑️</button>
                            </td>
                        </tr>
                    `;

                    if (hasSerials) {
                        const eventsQueue = [];
                        (i.active_events || []).forEach(ev => {
                            for(let k=0; k<ev.count; k++) {
                                eventsQueue.push(ev.session_name);
                            }
                        });

                        serialsArr.forEach((sn, snIdx) => {
                            let snBrand = '';
                            let snValue = sn;
                            if (sn.includes(':')) {
                                const parts = sn.split(':');
                                snBrand = parts[0].trim();
                                snValue = parts.slice(1).join(':').trim();
                            }

                            const eventName = eventsQueue[snIdx];
                            const isAssigned = !!eventName;
                            const evCountText = isAssigned ? '<span style="color:#f59e0b; font-weight:900;">1</span>' : '<span style="color:var(--muted); font-weight:900;">0</span>';
                            const locText = isAssigned ? `<span style="color:#3b82f6; font-weight:900;">📍 ${eventName.toUpperCase()}</span>` : (() => {
                                const loc = (i.location || '').toUpperCase();
                                return loc === 'ALMACÉN PRINCIPAL' ? 'FLANDES' : (loc || '-- Sin ubicación --');
                            })();

                            html += `
                                <tr id="${rowId}-sn-${snIdx}" style="display:none; background:rgba(99,102,241,0.05); border-bottom:1px solid rgba(99,102,241,0.1);">
                                    <td style="padding:6px 10px;">
                                        <span style="color:#a5b4fc; font-size:0.65rem; font-weight:900;">↳ ${i.name.toUpperCase()}</span>
                                    </td>
                                    <td style="padding:6px 10px; color:#6366f1; font-size:0.8rem; font-family:monospace; font-weight:900; text-align:center;">
                                        ${snValue} ${snBrand ? `<br><span style="font-size:0.55rem; color:var(--muted);">🏷️ ${snBrand}</span>` : ''}
                                    </td>
                                    <td style="padding:6px 10px; color:#10b981; font-size:0.8rem; font-weight:900; text-align:center;">
                                        1
                                    </td>
                                    <td style="padding:6px 10px; text-align:center; font-size:0.8rem;">
                                        ${evCountText}
                                    </td>
                                    <td style="padding:6px 10px; font-size:0.65rem; color:var(--muted);">
                                        ${locText}
                                    </td>
                                </tr>
                            `;
                        });
                    }

                });

                html += `
                            </tbody>
                        </table>
                        </div>
                    </div>
                `;

            } else {
                html += `
                    <div style="background:rgba(255,255,255,0.02); border:1px dashed rgba(255,255,255,0.1); border-radius:20px; padding:50px 20px; text-align:center;">
                        <span style="font-size:3rem; opacity:0.5; display:block; margin-bottom:20px;">📦</span>
                        <h3 style="color:white; margin:0 0 10px 0; ">INVENTARIO VACÍO</h3>
                        <p style="color:var(--muted); font-size:0.85rem; margin:0 auto; max-width:400px;">Aún no se ha inicializado el inventario de insumos, materiales y equipos. Haz clic en "INICIALIZAR INVENTARIO BASE" para comenzar.</p>
                    </div>
                `;
            }

            html += `
                <div style="display:flex; justify-content:center; margin-top: 40px; margin-bottom: 60px;">
                    ${getVolverBtn('VOLVER A ADMINISTRACIÓN', "renderAdmin(document.getElementById('current-view'))")}
                </div>
            `;
            
            el.innerHTML = html;

            // Inicializar tracking de cambios
            window._invDirty = {};
        } catch(e) {
            hideLoading();
            console.error('Error cargando inventario:', e);
            toast('Error cargando inventario', 'error');
            el.innerHTML = '<div class="view-header"><h1 class="view-title">ERROR AL CARGAR</h1></div>' + getVolverBtn('VOLVER', "renderAdmin(document.getElementById('current-view'))");
        }
    }



    window.inicializarInventarioBase = async function() {
        if(!confirm('¿Desea inicializar la base de datos de inventario con los requerimientos logísticos por defecto?')) return;
        showLoading('Inicializando...');
        const res = await apiFetch('/api/inventory/init', { method: 'POST' });
        hideLoading();
        if(res && res.success) {
            toast('Inventario base creado con éxito', 'success');
            renderInventarios(document.getElementById("current-view"));
        } else {
            toast(res?.error || 'Error al inicializar', 'error');
        }
    };

    window.handleInventoryNameChange = function(selectEl) {
        const nameInput = document.getElementById('inv-name');
        const typeSelect = document.getElementById('inv-type');
        if (selectEl.value === 'OTRO') {
            nameInput.style.display = 'block';
            nameInput.focus();
            nameInput.value = '';
        } else {
            nameInput.style.display = 'none';
            nameInput.value = selectEl.value;
            nameInput.dispatchEvent(new Event('input'));
            
            if (window.currentInventoryItems) {
                const found = window.currentInventoryItems.find(i => (i.name||'').toUpperCase() === selectEl.value);
                if (found && found.type) {
                    const t = found.type;
                    const tCap = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
                    if (Array.from(typeSelect.options).some(o => o.value === tCap)) {
                        typeSelect.value = tCap;
                    }
                }
            }
        }
    };

    window.openEditInventoryItem = function(itemRaw) {
        const isNew = !itemRaw;
        const item = itemRaw || { id: null, name: '', type: 'Material', size: '', quantity: 1, location: 'FLANDES', serial_number: '', notes: '', has_serial: 0 };
        
        let uniqueNames = [];
        if (window.currentInventoryItems && window.currentInventoryItems.length > 0) {
            uniqueNames = [...new Set(window.currentInventoryItems.map(i => (i.name || '').toUpperCase().trim()))].filter(Boolean).sort();
        }
        
        const isNameCustom = item.name && !uniqueNames.includes(item.name.toUpperCase());
        const showCustomInput = isNew || isNameCustom;

        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        
        // Función interna para renderizar las cajas de seriales
        const renderSerialInputs = (qty, existingSerials, itemName = '') => {
            let html = '';
            const serials = existingSerials ? existingSerials.split(',').map(s => s.trim()) : [];
            const isRadioOrBattery = itemName.toLowerCase().includes('radio') || itemName.toLowerCase().includes('batería') || itemName.toLowerCase().includes('bateria');
            
            for (let i = 0; i < qty; i++) {
                let snBrand = '';
                let snVal = serials[i] || '';
                if (snVal.includes(':')) {
                    const parts = snVal.split(':');
                    snBrand = parts[0].trim();
                    snVal = parts.slice(1).join(':').trim();
                }
                
                html += `<div style="display:flex; flex-direction:column; gap:5px; margin-bottom:10px;">
                    <div style="display:flex; gap:10px;">`;
                if (isRadioOrBattery) {
                    html += `
                        <select id="serial-brand-select-${i}" class="input-field serial-brand-select" style="width:140px; border-radius:10px; padding:10px;">
                            <option value="" ${!snBrand ? 'selected' : ''}>Sin marca</option>
                            <option value="Motorola" ${snBrand === 'Motorola' ? 'selected' : ''}>Motorola</option>
                            <option value="Kirisun" ${snBrand === 'Kirisun' ? 'selected' : ''}>Kirisun</option>
                            <option value="Motorola EP450" ${snBrand === 'Motorola EP450' ? 'selected' : ''}>Motorola EP450</option>
                            <option value="Batería Motorola" ${snBrand === 'Batería Motorola' ? 'selected' : ''}>Batería Motorola</option>
                            <option value="Batería Kirisun" ${snBrand === 'Batería Kirisun' ? 'selected' : ''}>Batería Kirisun</option>
                            <option value="Batería Motorola EP450" ${snBrand === 'Batería Motorola EP450' ? 'selected' : ''}>Batería Motorola EP450</option>
                        </select>
                    `;
                }
                html += `<input type="text" id="serial-input-${i}" class="input-field serial-input-box" value="${snVal}" placeholder="Serial ${i+1}" style="flex:1; border-radius:10px; padding:10px;">
                    </div>
                    <div style="display:flex; gap:5px; justify-content:flex-end;">
                        <input type="file" id="ai-file-${i}" accept="image/*" style="display:none;" onchange="handleAiPhotoUpload(this, 'serial-input-${i}', 'serial-brand-select-${i}')">
                        <button type="button" class="btn" style="background:#8b5cf6; color:white; border:none; border-radius:10px; padding:6px 10px; font-size:0.8rem; cursor:pointer;" onclick="document.getElementById('ai-file-${i}').click()" title="Tomar Foto AI">📷 Foto AI</button>
                        <button type="button" class="btn" style="background:#3b82f6; color:white; border:none; border-radius:10px; padding:6px 10px; font-size:0.8rem; cursor:pointer;" onclick="openScanner('serial-input-${i}')" title="Escanear Código">🔍 Escanear</button>
                        <button type="button" class="btn" style="background:#10b981; color:white; border:none; border-radius:10px; padding:6px 10px; font-size:0.8rem; cursor:pointer;" onclick="printLabel('serial-input-${i}')" title="Imprimir Etiqueta">🖨️ Imprimir</button>
                    </div>
                </div>`;
            }
            return html;
        };

        modal.innerHTML = `
            <div class="modal-content" style="max-width:500px; padding:30px; border-radius:20px; background:var(--surface); border:1px solid var(--border); max-height:90vh; overflow-y:auto;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:15px; margin-bottom:20px;">
                    <h2 style="color:white; margin:0; font-size:1.2rem; font-weight:900;">${isNew ? '➕ NUEVO ÍTEM' : '✏️ ACTUALIZAR ÍTEM'}</h2>
                    <span style="color:var(--muted); font-weight:900;">${isNew ? 'NUEVO' : '#' + item.id}</span>
                </div>
                
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:15px;">
                    <div>
                        <label style="color:var(--muted); font-size:0.7rem; font-weight:900; display:block; margin-bottom:5px;">NOMBRE</label>
                        <select id="inv-name-select" class="input-field" style="width:100%; border-radius:10px; padding:12px; font-weight:bold; margin-bottom: 5px; height: 45px;" onchange="window.handleInventoryNameChange(this)">
                            ${!item.name && !isNew ? '<option value="" selected>-- Selecciona un ítem --</option>' : ''}
                            ${uniqueNames.map(name => `<option value="${name}" ${item.name.toUpperCase() === name ? 'selected' : ''}>${name}</option>`).join('')}
                            <option value="OTRO" ${showCustomInput ? 'selected' : ''}>➕ OTRO (Escribir nuevo)...</option>
                        </select>
                        <input type="text" id="inv-name" class="input-field" value="${item.name}" style="width:100%; border-radius:10px; padding:12px; font-weight:bold; display: ${showCustomInput ? 'block' : 'none'};" autocomplete="off" placeholder="Escribe el nombre del nuevo ítem...">
                    </div>
                    <div>
                        <label style="color:var(--muted); font-size:0.7rem; font-weight:900; display:block; margin-bottom:5px;">CATEGORÍA</label>
                        <select id="inv-type" class="input-field" style="width:100%; border-radius:10px; padding:12px; height:45px;">
                            <option value="Equipo" ${item.type === 'Equipo' ? 'selected' : ''}>Equipo</option>
                            <option value="Insumo" ${item.type === 'Insumo' ? 'selected' : ''}>Insumo</option>
                            <option value="Material" ${item.type === 'Material' ? 'selected' : ''}>Material</option>
                            <option value="Uniforme" ${item.type === 'Uniforme' ? 'selected' : ''}>Uniforme</option>
                            <option value="Otros" ${!['Equipo','Insumo','Material','Uniforme'].includes(item.type) ? 'selected' : ''}>Otros</option>
                        </select>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:15px;">
                    <div>
                        <label style="color:var(--muted); font-size:0.7rem; font-weight:900; display:block; margin-bottom:5px;">TALLA (Opcional)</label>
                        <input type="text" id="inv-size" class="input-field" value="${item.size || ''}" placeholder="Ej: S, M, L..." style="width:100%; border-radius:10px; padding:12px;">
                    </div>
                    <div>
                        <label style="color:var(--muted); font-size:0.7rem; font-weight:900; display:block; margin-bottom:5px; color:#10b981;">CANTIDAD FÍSICA</label>
                        <input type="number" id="inv-qty" class="input-field" value="${item.quantity || 0}" style="width:100%; border-radius:10px; padding:12px; font-size:1.2rem; font-weight:900; color:#10b981; background:rgba(16, 185, 129, 0.05); border-color:rgba(16, 185, 129, 0.3);">
                    </div>
                </div>
                
                <div style="margin-bottom:15px;">
                    <label style="color:var(--muted); font-size:0.7rem; font-weight:900; display:block; margin-bottom:5px;">UBICACIÓN / DEPÓSITO</label>
                    <select id="inv-location" class="input-field" style="width:100%; border-radius:10px; padding:12px; appearance:none; background-color:var(--surface); color:white;">
                        <option value="">-- Seleccionar Ubicación --</option>
                        <option value="FLANDES" ${(item.location?.toUpperCase() === 'FLANDES' || item.location?.toUpperCase() === 'ALMACÉN PRINCIPAL') ? 'selected' : ''}>FLANDES</option>
                        <option value="FIGUEROA" ${item.location?.toUpperCase() === 'FIGUEROA' ? 'selected' : ''}>FIGUEROA</option>
                        <option value="EYE KIDS" ${item.location?.toUpperCase() === 'EYE KIDS' ? 'selected' : ''}>EYE KIDS</option>
                    </select>
                </div>

                <div style="margin-bottom:15px; padding:15px; border-radius:10px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05);">
                    <label style="color:white; font-size:0.85rem; font-weight:900; display:flex; align-items:center; cursor:pointer;">
                        <input type="checkbox" id="inv-has-serial" style="transform: scale(1.2); margin-right:10px;" ${item.has_serial ? 'checked' : ''}>
                        ESTE ÍTEM REQUIERE NÚMEROS DE SERIE
                    </label>
                    
                    <div id="serial-container" style="margin-top:15px; display:${item.has_serial ? 'block' : 'none'};">
                        <label style="color:var(--muted); font-size:0.7rem; font-weight:900; display:block; margin-bottom:5px;">INGRESA LOS SERIALES PARA CADA UNIDAD</label>
                        <div id="serial-inputs-wrapper">
                            ${item.has_serial ? renderSerialInputs(item.quantity || 0, item.serial_number, item.name) : ''}
                        </div>
                    </div>
                </div>

                <div style="margin-bottom:25px;">
                    <label style="color:var(--muted); font-size:0.7rem; font-weight:900; display:block; margin-bottom:5px;">NOTAS ADICIONALES</label>
                    <textarea id="inv-notes" class="input-field" rows="2" style="width:100%; border-radius:10px; padding:12px; resize:none;">${item.notes || ''}</textarea>
                </div>
                
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    ${!isNew ? `<button class="btn" style="background:#ef4444; color:white; border:none; border-radius:10px; padding:12px 18px; font-weight:900; font-size:0.82rem;" onclick="deleteInventoryItem(${item.id}, this.closest('.modal-backdrop'))">🗑️ ELIMINAR</button>` : ''}
                    <button class="btn" style="flex:1; background:rgba(255,255,255,0.05); color:white; border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:12px; font-weight:900;" onclick="this.closest('.modal-backdrop').remove()">CANCELAR</button>
                    <button class="btn" style="flex:1; background:#8b5cf6; color:white; border:none; border-radius:10px; padding:12px; font-weight:900;" onclick="saveInventoryItem(${item.id || 'null'}, this.closest('.modal-backdrop'))">GUARDAR</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Lógica interactiva para seriales
        const qtyInput = document.getElementById('inv-qty');
        const hasSerialCheckbox = document.getElementById('inv-has-serial');
        const serialContainer = document.getElementById('serial-container');
        const serialWrapper = document.getElementById('serial-inputs-wrapper');

        const updateSerials = () => {
            if (hasSerialCheckbox.checked) {
                serialContainer.style.display = 'block';
                // Guardar los valores actuales para no perderlos al redibujar
                const currentInputs = Array.from(serialWrapper.querySelectorAll('.serial-input-box')).map((inp, idx) => {
                    const brandSel = serialWrapper.querySelectorAll('.serial-brand-select')[idx];
                    let brand = brandSel ? brandSel.value : '';
                    return brand && inp.value.trim() ? `${brand}: ${inp.value.trim()}` : inp.value.trim();
                });
                serialWrapper.innerHTML = renderSerialInputs(parseInt(qtyInput.value) || 0, currentInputs.join(','), document.getElementById('inv-name').value);
            } else {
                serialContainer.style.display = 'none';
            }
        };

        qtyInput.addEventListener('input', updateSerials);
        hasSerialCheckbox.addEventListener('change', updateSerials);
        document.getElementById('inv-name').addEventListener('input', updateSerials);
    };

    window.saveInventoryItem = async function(id, modalElement) {
        const isNew = id === null;
        
        const hasSerial = document.getElementById('inv-has-serial').checked;
        let serials = '';
        if (hasSerial) {
            const inputBoxes = document.querySelectorAll('.serial-input-box');
            const brandSelects = document.querySelectorAll('.serial-brand-select');
            
            const arr = [];
            inputBoxes.forEach((inp, idx) => {
                const val = inp.value.trim();
                if (val) {
                    const brand = brandSelects[idx] ? brandSelects[idx].value : '';
                    arr.push(brand ? `${brand}: ${val}` : val);
                }
            });
            serials = arr.join(', ');
        }

        // Para items serializados, la cantidad = número de seriales registrados
        const serialsArr = serials ? serials.split(',').map(s => s.trim()).filter(s => s) : [];
        const qty = hasSerial && serialsArr.length > 0 ? serialsArr.length : (parseInt(document.getElementById('inv-qty').value) || 0);

        const data = {
            name: document.getElementById('inv-name').value,
            type: document.getElementById('inv-type').value,
            size: document.getElementById('inv-size').value,
            quantity: qty,
            location: document.getElementById('inv-location').value,
            has_serial: hasSerial,
            serial_number: serials,
            notes: document.getElementById('inv-notes').value
        };
        
        if (!data.name) {
            return toast('El nombre es requerido', 'warning');
        }

        const btn = modalElement.querySelector('button:last-child');
        btn.innerText = 'GUARDANDO...';
        btn.disabled = true;

        const url = isNew ? '/api/inventory/item' : '/api/inventory/' + id;
        const method = isNew ? 'POST' : 'PUT';

        const res = await apiFetch(url, {
            method: method,
            body: JSON.stringify(data)
        });

        if (res && res.success) {
            toast(isNew ? 'Ítem agregado correctamente' : 'Ítem actualizado correctamente', 'success');
            modalElement.remove();
            renderInventarios(document.getElementById("current-view"));
        } else {
            toast(res?.error || 'Error al guardar', 'error');
            btn.innerText = 'GUARDAR CAMBIOS';
            btn.disabled = false;
        }
    };
    window.handleAiPhotoUpload = async function(fileInput, inputId, selectId) {
        if (!fileInput.files || fileInput.files.length === 0) return;
        const file = fileInput.files[0];
        
        // Mostrar estado de carga
        showLoading('Analizando imagen con IA...');
        try {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async function () {
                const base64Data = reader.result.split(',')[1];
                
                const res = await apiFetch('/api/ai/recognize-radio', {
                    method: 'POST',
                    body: JSON.stringify({ image: base64Data })
                });

                hideLoading();
                
                if (res && res.success) {
                    toast('Análisis completado', 'success');
                    if (res.serial_number && res.serial_number !== 'NO ENCONTRADO') {
                        document.getElementById(inputId).value = res.serial_number;
                        document.getElementById(inputId).dispatchEvent(new Event('input', { bubbles: true }));
                    } else {
                        toast('No se detectó el número de serie de forma legible.', 'warning');
                    }

                    if (res.brand && res.brand !== 'NO ENCONTRADO') {
                        const selectEl = document.getElementById(selectId);
                        if (selectEl) {
                            selectEl.value = res.brand;
                            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }
                } else {
                    toast(res?.error || 'Error al procesar la imagen con IA', 'error');
                }
                
                // Limpiar el input file
                fileInput.value = '';
            };
            reader.onerror = function (error) {
                hideLoading();
                toast('Error leyendo archivo', 'error');
                fileInput.value = '';
            };
        } catch(e) {
            hideLoading();
            toast('Error procesando foto', 'error');
            fileInput.value = '';
        }
    };

    window.printLabel = function(inputId) {
        const serial = document.getElementById(inputId).value.trim();
        if (!serial) {
            return toast('Ingresa o escanea un serial primero', 'warning');
        }

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
            <head>
                <title>Etiqueta ${serial}</title>
                <style>
                    body { margin: 0; padding: 0; font-family: sans-serif; }
                    .print-container {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        gap: 20px;
                        padding: 20px;
                    }
                    .label-box {
                        border: 1px dashed #ccc;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        page-break-inside: avoid;
                    }
                    /* 2x2 cm QR Code */
                    .qr-label {
                        width: 2cm;
                        height: 2cm;
                        padding: 2px;
                        box-sizing: border-box;
                        position: relative;
                    }
                    /* 2x4 cm Barcode */
                    .barcode-label {
                        width: 4cm;
                        height: 2cm;
                        padding: 2px;
                        box-sizing: border-box;
                    }
                    .brand-text {
                        font-size: 6pt;
                        font-weight: bold;
                        text-align: center;
                        margin-bottom: 2px;
                    }
                    .serial-text {
                        font-size: 5pt;
                        text-align: center;
                        margin-top: 2px;
                    }
                    svg, canvas {
                        max-width: 100%;
                        max-height: 100%;
                    }
                    @media print {
                        .no-print { display: none; }
                    }
                </style>
                <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
                <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"><\/script>
            </head>
            <body>
                <div class="no-print" style="text-align:center; padding:10px;">
                    <button onclick="window.print()" style="padding:10px 20px; font-size:16px; cursor:pointer;">Imprimir</button>
                </div>
                <div class="print-container">
                    <div class="label-box qr-label">
                        <div class="brand-text">Eye Staff</div>
                        <div id="qrcode" style="display:flex; justify-content:center; width: 1.5cm; height: 1.5cm; margin:auto;"></div>
                    </div>
                    <div class="label-box barcode-label">
                        <div class="brand-text">Eye Staff</div>
                        <svg id="barcode"></svg>
                    </div>
                </div>
                <script>
                    window.onload = function() {
                        new QRCode(document.getElementById("qrcode"), {
                            text: "${serial}",
                            width: 56,
                            height: 56,
                            colorDark : "#000000",
                            colorLight : "#ffffff",
                            correctLevel : QRCode.CorrectLevel.M
                        });
                        JsBarcode("#barcode", "${serial}", {
                            format: "CODE128",
                            width: 1,
                            height: 30,
                            displayValue: true,
                            fontSize: 10,
                            margin: 0
                        });
                    };
                <\/script>
            \n
window.deleteFormat = async function(id) {
    if (!confirm('¿Seguro que desea eliminar TODO el formato de pago y sus eventos?')) return;
    
    try {
        showLoading('ELIMINANDO...');
        const res = await apiFetch('/api/admin/payment-formats/' + id, { method: 'DELETE' });
        if (res && res.success) {
            paymentFormats = paymentFormats.filter(f => f.id !== id);
            renderPaymentFormatsMatrix();
            toast('Formato eliminado', 'success');
        } else {
            toast('Error al eliminar: ' + (res ? res.error : 'Desconocido'), 'error');
        }
    } catch (e) {
        toast('Error de red: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
};
\n</body>
            </html>
        `);
        printWindow.document.close();
    };
    window.html5QrcodeScannerInstance = null;
    window.openScanner = function(inputId) {
        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:400px; padding:20px; text-align:center;">
                <h3 style="color:white; margin-bottom:15px;">📷 ESCANEAR CÓDIGO</h3>
                <div id="reader" style="width: 100%; border-radius: 10px; overflow:hidden;"></div>
                <button class="btn" style="margin-top:20px; background:#ef4444; width:100%;" onclick="closeScanner(this.closest('.modal-backdrop'))">CANCELAR</button>
            </div>
        `;
        document.body.appendChild(modal);

        window.html5QrcodeScannerInstance = new Html5QrcodeScanner(
            "reader",
            { fps: 10, qrbox: {width: 250, height: 250}, aspectRatio: 1.0 },
            /* verbose= */ false
        );
        window.html5QrcodeScannerInstance.render((decodedText) => {
            document.getElementById(inputId).value = decodedText;
            document.getElementById(inputId).dispatchEvent(new Event('input', { bubbles: true }));
            closeScanner(modal);
        }, (errorMessage) => {
            // Ignorar errores de lectura constantes
        });
    };

    window.closeScanner = function(modalElement) {
        if (window.html5QrcodeScannerInstance) {
            window.html5QrcodeScannerInstance.clear().catch(error => {
                console.error("Failed to clear html5QrcodeScanner. ", error);
            });
            window.html5QrcodeScannerInstance = null;
        }
        if (modalElement) modalElement.remove();
    };

    window.deleteInventoryItem = async function(id, modalElement) {
        if (!confirm('¿Seguro que deseas ELIMINAR este ítem del inventario? Esta acción no se puede deshacer.')) return;
        showLoading('Eliminando...');
        const res = await apiFetch('/api/inventory/' + id, { method: 'DELETE' });
        hideLoading();
        if (res && res.success) {
            toast('Ítem eliminado correctamente', 'success');
            if (modalElement) modalElement.remove();
            renderInventarios(document.getElementById('current-view'));
        } else {
            toast(res?.error || 'Error al eliminar', 'error');
        }
    };

    window.toggleSerialRows = function(rowId) {
        const toggleBtn = document.getElementById(rowId + '-toggle');
        let idx = 0;
        let expanded = false;
        while (true) {
            const row = document.getElementById(rowId + '-sn-' + idx);
            if (!row) break;
            if (row.style.display === 'none') {
                row.style.display = '';
                expanded = true;
            } else {
                row.style.display = 'none';
            }
            idx++;
        }
        if (toggleBtn) {
            toggleBtn.style.transform = expanded ? 'rotate(90deg)' : 'rotate(0deg)';
        }
    };

    window.inlineDeleteSerial = async function(itemStr, serialToRemove) {
        const item = JSON.parse(decodeURIComponent(itemStr));
        if (!confirm(`¿Seguro que deseas eliminar el serial "${serialToRemove}"?\n\nLa cantidad física del artículo disminuirá en 1.`)) return;
        
        let serials = item.serial_number ? item.serial_number.split(',').map(s => s.trim()).filter(s => s) : [];
        serials = serials.filter(s => s !== serialToRemove);
        const newQty = serials.length;
        
        const payload = {
            name: item.name,
            type: item.type,
            size: item.size,
            quantity: newQty,
            location: item.location,
            has_serial: item.has_serial,
            serial_number: serials.join(', '),
            notes: item.notes
        };
        
        showLoading('Eliminando serial...');
        const res = await apiFetch('/api/inventory/' + item.id, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        hideLoading();
        if (res && res.success) {
            toast('Serial eliminado', 'success');
            renderInventarios(document.getElementById('current-view'));
        } else {
            toast('Error al eliminar', 'error');
        }
    };

    window.inlineEditSerial = async function(itemStr, oldSerial) {
        const item = JSON.parse(decodeURIComponent(itemStr));
        const newSerial = prompt(`Modificar serial:`, oldSerial);
        if (!newSerial || newSerial.trim() === '' || newSerial.trim() === oldSerial) return;
        
        let serials = item.serial_number ? item.serial_number.split(',').map(s => s.trim()).filter(s => s) : [];
        const idx = serials.indexOf(oldSerial);
        if (idx !== -1) {
            serials[idx] = newSerial.trim();
        }
        
        const payload = {
            name: item.name,
            type: item.type,
            size: item.size,
            quantity: item.quantity,
            location: item.location,
            has_serial: item.has_serial,
            serial_number: serials.join(', '),
            notes: item.notes
        };
        
        showLoading('Actualizando serial...');
        const res = await apiFetch('/api/inventory/' + item.id, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        hideLoading();
        if (res && res.success) {
            toast('Serial actualizado', 'success');
            renderInventarios(document.getElementById('current-view'));
        } else {
            toast('Error al actualizar', 'error');
        }
    };

    window.toggleMovements = async function(rowId, itemId, itemObj) {
        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:700px; width:95%; padding:30px; border-radius:20px; background:var(--surface); border:1px solid var(--border); max-height:90vh; overflow-y:auto; position:relative;">
                <button onclick="this.closest('.modal-backdrop').remove()" style="position:absolute; right:20px; top:20px; background:none; border:none; color:white; font-size:1.5rem; cursor:pointer; z-index:10;">✕</button>
                <div id="mov-modal-content" style="text-align:center; margin-top:20px;">⏳ Cargando detalles...</div>
            </div>
        `;
        document.body.appendChild(modal);
        const content = modal.querySelector('#mov-modal-content');

        try {
            const res = await apiFetch('/api/inventory/' + itemId + '/movements');
            
            let serialsHtml = '';
            if (itemObj && itemObj.has_serial && itemObj.serial_number) {
                const serialsList = itemObj.serial_number.split(',').map(s => s.trim()).filter(s => s);
                if (serialsList.length > 0) {
                    serialsHtml = `
                        <div style="margin-bottom:15px; padding:10px; background:rgba(0,0,0,0.2); border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
                            <h5 style="margin:0 0 10px 0; color:var(--muted); font-size:0.75rem;">📋 LISTADO DE SERIALES REGISTRADOS (${serialsList.length})</h5>
                            <div style="display:flex; flex-wrap:wrap; gap:6px;">
                                ${serialsList.map(sn => {
                                    const safeItemObj = encodeURIComponent(JSON.stringify(itemObj));
                                    const safeSn = sn.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                                    return `<span style="background:rgba(255,255,255,0.05); padding:4px 8px; border-radius:6px; font-size:0.75rem; color:white; border:1px solid rgba(255,255,255,0.1); display:inline-flex; align-items:center; gap:6px;">
                                        ${sn}
                                        <i onclick="window.inlineEditSerial('${safeItemObj}', '${safeSn}')" title="Modificar" style="cursor:pointer; font-style:normal;">✏️</i>
                                        <i onclick="window.inlineDeleteSerial('${safeItemObj}', '${safeSn}')" title="Eliminar" style="cursor:pointer; font-style:normal;">❌</i>
                                    </span>`;
                                }).join('')}
                            </div>
                        </div>
                    `;
                }
            }

            let html = `
                <div style="text-align:left;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                        <h4 style="margin:0; color:#fff; display:flex; align-items:center; gap:8px;">
                            <span>📦 Detalles y Movimientos</span>
                        </h4>
                        ${itemObj ? `<button onclick='openEditInventoryItem(${JSON.stringify(itemObj)})' style="background:var(--brand-green); border:none; padding:6px 15px; border-radius:6px; color:white; font-weight:bold; font-size:0.75rem; cursor:pointer;">✏️ EDITAR ARTÍCULO</button>` : ''}
                    </div>
                    ${serialsHtml}
            `;

            if (res && res.movements && res.movements.length > 0) {
                const groups = {};
                const manualMovements = [];
                
                res.movements.forEach(m => {
                    if (m.session_id) {
                        if (!groups[m.session_id]) {
                            groups[m.session_id] = { session_name: m.session_name, out: 0, in: 0, last_date: m.timestamp };
                        }
                        if (m.quantity_change < 0) groups[m.session_id].out += Math.abs(m.quantity_change);
                        else groups[m.session_id].in += m.quantity_change;
                        if (m.timestamp > groups[m.session_id].last_date) groups[m.session_id].last_date = m.timestamp;
                    } else {
                        manualMovements.push(m);
                    }
                });
                
                const sortedGroups = Object.keys(groups).map(k => ({ session_id: k, ...groups[k] })).sort((a, b) => new Date(b.last_date) - new Date(a.last_date));
                
                if (sortedGroups.length > 0) {
                    html += '<h5 style="margin:0 0 10px 0; color:var(--accent); font-size:0.8rem; text-transform:uppercase;">Asignaciones a Eventos</h5>';
                    html += '<table style="width:100%; border-collapse:collapse; font-size:0.75rem; margin-bottom:15px;">';
                    html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.1);"><th style="padding:8px; text-align:left;">EVENTO</th><th style="padding:8px; text-align:left;">FECHA ÚLTIMO M.</th><th style="padding:8px; text-align:center;">SALIDA</th><th style="padding:8px; text-align:center;">ENTRADA</th><th style="padding:8px; text-align:center;">PENDIENTE</th><th style="padding:8px; text-align:right;"></th></tr>';
                    
                    sortedGroups.forEach(g => {
                        const dateStr = new Date(g.last_date).toLocaleString();
                        const pending = g.out - g.in;
                        const pendingColor = pending > 0 ? '#ef4444' : '#10b981';
                        const pendingIcon = pending > 0 ? '⚠️' : '✅';
                        
                        html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05); background:rgba(0,0,0,0.2);">
                            <td style="padding:8px; color:white; font-weight:bold;">${g.session_name || 'Evento #' + g.session_id}</td>
                            <td style="padding:8px; color:var(--muted);">${dateStr}</td>
                            <td style="padding:8px; text-align:center; color:#ef4444; font-weight:bold;">-${g.out}</td>
                            <td style="padding:8px; text-align:center; color:#10b981; font-weight:bold;">+${g.in}</td>
                            <td style="padding:8px; text-align:center; color:${pendingColor}; font-weight:bold;">${pendingIcon} ${pending}</td>
                            <td style="padding:8px; text-align:right;">
                                ${pending > 0 ? `<button onclick="showReturnInventoryModal(${itemId}, '${itemObj ? itemObj.name.replace(/'/g, "\\'") : ''}', ${g.session_id}, '${(g.session_name || '').replace(/'/g, "\\'")}', ${pending})" style="background:rgba(239,68,68,0.2); border:1px solid #ef4444; color:#ef4444; padding:4px 10px; border-radius:4px; font-size:0.7rem; cursor:pointer; font-weight:bold;">DEVOLVER</button>` : ''}
                            </td>
                        </tr>`;
                    });
                    html += '</table>';
                }
                    
                    if (manualMovements.length > 0) {
                        html += '<h5 style="margin:10px 0 10px 0; color:var(--muted); font-size:0.8rem; text-transform:uppercase;">Ajustes Manuales / Otros</h5>';
                        html += '<table style="width:100%; border-collapse:collapse; font-size:0.75rem;">';
                        html += '<tr style="border-bottom:1px solid rgba(255,255,255,0.1);"><th style="padding:6px; text-align:left;">FECHA</th><th style="padding:6px; text-align:left;">MOTIVO</th><th style="padding:6px; text-align:center;">CANTIDAD</th><th style="padding:6px; text-align:left;">USUARIO</th></tr>';
                        manualMovements.forEach(m => {
                            const dateStr = new Date(m.timestamp).toLocaleString();
                            const qtyColor = m.quantity_change > 0 ? '#10b981' : '#ef4444';
                            const qtyPrefix = m.quantity_change > 0 ? '+' : '';
                            html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                                <td style="padding:6px; color:var(--muted);">${dateStr}</td>
                                <td style="padding:6px; color:white;">${m.notes || 'Ajuste manual'}</td>
                                <td style="padding:6px; text-align:center; color:${qtyColor}; font-weight:bold;">${qtyPrefix}${m.quantity_change}</td>
                                <td style="padding:6px; color:var(--muted);">${m.user_name || '-'}</td>
                            </tr>`;
                        });
                        html += '</table>';
                    }
                } else {
                    html += '<div style="padding:20px; text-align:center; color:var(--muted);">No hay movimientos registrados para este artículo.</div>';
                }
                html += '</div>';
                content.innerHTML = html;
            } catch(e) {
                console.error(e);
                content.innerHTML = '<div style="padding:10px; text-align:center; color:#ef4444;">Error al cargar movimientos.</div>';
            }
    };


    window.showInventoryChannelModal = async function() {
        showLoading('Consultando suscriptores...');
        const subsRes = await apiFetch('/api/inventory/subscribers');
        hideLoading();

        if (!subsRes || !subsRes.success || !subsRes.subscribers || subsRes.subscribers.length === 0) {
            toast('No hay usuarios suscritos a INVENTARIOS en la matriz.', 'warning');
            return;
        }

        const names = subsRes.subscribers.map(s => s.name).join(', ');

        // Eliminar modal previo si existe
        const prevModal = document.getElementById('inv-channel-modal');
        if (prevModal) prevModal.remove();

        const modal = document.createElement('div');
        modal.id = 'inv-channel-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);z-index:9999;display:flex;justify-content:center;align-items:center;padding:20px;';
        modal.innerHTML = `
            <div style="background:var(--surface);border:1px solid var(--border);border-radius:20px;max-width:420px;width:100%;padding:28px;position:relative;">
                <button onclick="document.getElementById('inv-channel-modal').remove()" style="position:absolute;right:15px;top:15px;background:none;border:none;color:var(--muted);font-size:1.4rem;cursor:pointer;">✕</button>
                <h3 style="color:white;margin:0 0 6px;font-size:1.1rem;font-weight:900;">📧 ENVIAR REPORTE DIGITAL</h3>
                <p style="color:var(--muted);font-size:0.75rem;margin:0 0 20px;">Suscriptores: <b style="color:white;">${names}</b></p>
                <p style="color:var(--muted);font-size:0.78rem;margin:0 0 20px;">El reporte completo se adjuntará en <b style="color:white;">formato PDF</b>. Selecciona el canal de envío:</p>
                <div style="display:grid;grid-template-columns:1fr;gap:12px;">
                    <button onclick="notificarInventario('email'); document.getElementById('inv-channel-modal').remove();" style="background:#6366f1;color:white;border:none;padding:14px 20px;border-radius:12px;font-weight:900;font-size:0.9rem;cursor:pointer;">📧 SOLO EMAIL</button>
                    <button onclick="notificarInventario('whatsapp'); document.getElementById('inv-channel-modal').remove();" style="background:#25d366;color:white;border:none;padding:14px 20px;border-radius:12px;font-weight:900;font-size:0.9rem;cursor:pointer;">💬 SOLO WHATSAPP</button>
                    <button onclick="notificarInventario('ambos'); document.getElementById('inv-channel-modal').remove();" style="background:#10b981;color:white;border:none;padding:14px 20px;border-radius:12px;font-weight:900;font-size:0.9rem;cursor:pointer;">📤 EMAIL + WHATSAPP</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    };

    window.notificarInventario = async function(channel) {
        showLoading('Enviando reporte digital...');
        const res = await apiFetch('/api/inventory/notify', {
            method: 'POST',
            body: JSON.stringify({ channel: channel || 'ambos' })
        });
        hideLoading();
        if(res && res.success) {
            toast(res.message || 'Reporte enviado con éxito', 'success');
        } else {
            toast(res?.error || 'Error al enviar reporte', 'error');
        }
    };

    window.exportarInventarioExcel = function() {
        if (!window.currentInventoryItems || window.currentInventoryItems.length === 0) {
            toast('No hay ítems en el inventario para exportar.', 'warning');
            return;
        }

        // Formatear datos para Excel
        const data = window.currentInventoryItems.map(i => ({
            "ID": i.id,
            "TIPO": (i.type || 'OTROS').toUpperCase(),
            "ÍTEM": (i.name + (i.size ? ` (${i.size})` : '')).toUpperCase(),
            "CANTIDAD": i.quantity,
            "UBICACIÓN": (i.location || 'N/A').toUpperCase(),
            "NÚMERO DE SERIE": (i.serial_number || 'N/A').toUpperCase(),
            "ÚLTIMA REVISIÓN": (i.last_updated_at ? new Date(i.last_updated_at).toLocaleString('es-ES') : 'NUNCA').toUpperCase(),
            "REVISADO POR": (i.last_updated_by_name || 'N/A').toUpperCase()
        }));

        // Crear libro y hoja
        const ws = XLSX.utils.json_to_sheet(data);
        
        if (data.length > 0) {
            const colWidths = Object.keys(data[0]).map(key => {
                let max = key.length;
                data.forEach(row => {
                    const val = row[key];
                    const len = val !== null && val !== undefined ? String(val).length : 0;
                    if (len > max) max = len;
                });
                return { wch: Math.min(max + 2, 50) };
            });
            ws['!cols'] = colWidths;
        }

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Inventario");

        // Ajustar ancho de columnas
        const colWidths = [
            { wch: 8 },  // ID
            { wch: 15 }, // TIPO
            { wch: 40 }, // ÍTEM
            { wch: 12 }, // CANTIDAD
            { wch: 25 }, // UBICACIÓN
            { wch: 20 }, // NÚMERO DE SERIE
            { wch: 25 }, // ÚLTIMA REVISIÓN
            { wch: 25 }  // REVISADO POR
        ];
        ws['!cols'] = colWidths;

        // Generar archivo
        const dateStr = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `Inventario_EyeStaff_${dateStr}.xlsx`);
    };

    window.handleInventoryScan = async function(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Resetear input para poder cargar la misma foto de nuevo si hay error
        event.target.value = '';

        try {
            // Convertir a Base64
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64Image = reader.result.split(',')[1];
                const mimeType = file.type;

                showLoading('Analizando imagen con IA (Vision)...<br><small style="font-size:0.7rem; color:#aaa;">Esto puede tardar unos segundos</small>');
                
                const res = await apiFetch('/api/inventory/scan-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageBase64: base64Image, mimeType })
                });
                
                hideLoading();

                if (res && res.success && res.parsedData && res.parsedData.length > 0) {
                    mostrarModalResultadosScan(res.parsedData);
                } else {
                    toast(res?.error || 'No se pudieron detectar ítems en la imagen.', 'error');
                }
            };
        } catch (error) {
            hideLoading();
            console.error("Error al procesar la imagen:", error);
            toast('Error procesando la imagen', 'error');
        }
    };

    function mostrarModalResultadosScan(itemsEscaneados) {
        const modal = document.createElement('div');
        modal.className = 'modal-backdrop';
        
        let filasHtml = itemsEscaneados.map((item, index) => `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:10px; color:white;">${item.item_name}</td>
                <td style="padding:10px;">
                    <input type="number" id="scan-qty-${index}" value="${item.quantity}" style="width:60px; padding:5px; text-align:center; border-radius:5px; border:1px solid var(--border); background:rgba(0,0,0,0.3); color:white; font-weight:bold;">
                </td>
                <td style="padding:10px; text-align:center;">
                    <input type="checkbox" id="scan-apply-${index}" checked style="transform: scale(1.2);">
                </td>
            </tr>
        `).join('');

        modal.innerHTML = `
            <div class="modal-content" style="max-width:600px; padding:30px; border-radius:20px; background:var(--surface); border:1px solid var(--border);">
                <h2 style="color:white; margin:0 0 20px 0; font-size:1.2rem; font-weight:900;">📸 RESULTADOS DEL ESCANEO</h2>
                <p style="color:var(--muted); font-size:0.85rem; margin-bottom:20px;">Se han detectado los siguientes ítems y cantidades. Por favor verifica y ajusta las cantidades antes de aplicar los cambios.</p>
                
                <div style="max-height:400px; overflow-y:auto; border:1px solid var(--border); border-radius:10px; background:rgba(0,0,0,0.2); margin-bottom:20px;">
                    <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.85rem;">
                        <thead style="background:var(--surface2); position:sticky; top:0;">
                            <tr>
                                <th style="padding:10px; color:var(--muted);">ÍTEM DETECTADO</th>
                                <th style="padding:10px; color:var(--muted);">CANTIDAD</th>
                                <th style="padding:10px; color:var(--muted); text-align:center;">APLICAR</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filasHtml}
                        </tbody>
                    </table>
                </div>

                <div style="display:flex; justify-content:flex-end; gap:10px;">
                    <button class="btn" style="background:var(--surface2); color:white; border:none; padding:10px 20px; border-radius:10px; font-weight:bold; cursor:pointer;" onclick="this.closest('.modal-backdrop').remove()">CANCELAR</button>
                    <button class="btn" style="background:var(--success); color:white; border:none; padding:10px 20px; border-radius:10px; font-weight:bold; cursor:pointer;" id="btn-aplicar-scan">APLICAR CAMBIOS</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('btn-aplicar-scan').addEventListener('click', async () => {
            const updates = [];
            itemsEscaneados.forEach((item, index) => {
                const applyCheckbox = document.getElementById(`scan-apply-${index}`);
                const qtyInput = document.getElementById(`scan-qty-${index}`);
                if (applyCheckbox && applyCheckbox.checked) {
                    updates.push({
                        item_name: item.item_name,
                        quantity: parseInt(qtyInput.value) || 0
                    });
                }
            });

            if (updates.length === 0) {
                toast('No se seleccionó ningún ítem para actualizar', 'warning');
                return;
            }

            modal.remove();
            showLoading('Actualizando inventario...');
            
            try {
                const res = await apiFetch('/api/inventory/batch-update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ updates })
                });
                
                hideLoading();
                if (res && res.success) {
                    toast(`Se actualizaron ${res.updatedCount} ítems con éxito`, 'success');
                    renderInventarios(document.getElementById("current-view"));
                } else {
                    toast(res?.error || 'Error al actualizar inventario', 'error');
                }
            } catch (error) {
                hideLoading();
                toast('Error de conexión', 'error');
            }
        });
    }



    window.imprimirInventario = async function() {
        const printWin = window.open('', '_blank');
        if (printWin) {
            printWin.document.write('<div style="font-family:sans-serif; padding:20px; text-align:center;">Generando formato, por favor espere...</div>');
        } else {
            toast('Por favor permite las ventanas emergentes en tu navegador para imprimir.', 'error');
            return;
        }

        showLoading('Generando formato...');
        try {
            const res = await apiFetch('/api/inventory');
            hideLoading();
            const items = res.items || [];
            // Ordenar los items igual que en la vista de la UI
            items.sort((a, b) => {
                const tA = a.type || 'OTROS';
                const tB = b.type || 'OTROS';
                if (tA !== tB) return tA.localeCompare(tB);
                return (a.name || '').localeCompare(b.name || '');
            });

            printWin.document.open();
            let dStr = new Date().toLocaleString('es-VE', {timeZone: 'America/Caracas'});
            const user = JSON.parse(localStorage.getItem('user') || '{}');

            let html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Formato de Validación de Inventario - EYE STAFF</title>
                    <style>
                        body { font-family: Arial, sans-serif; padding: 30px; font-size: 12px; color: #000; }
                        .header-container { display: flex; align-items: center; margin-bottom: 5px; border-bottom: 2px solid #000; padding-bottom: 10px; }
                        .header-container img { height: 50px; margin-right: 20px; }
                        h1 { color: #000; font-size: 20px; text-align: center; flex-grow: 1; margin: 0; text-transform: uppercase; }
                        .header-info { display: flex; justify-content: space-between; margin-bottom: 20px; font-weight: bold; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                        th, td { border: 1px solid #000; padding: 8px; text-align: left; }
                        th { background: #eee; font-weight: bold; text-transform: uppercase; font-size: 11px; }
                        .signatures { display: flex; justify-content: space-around; margin-top: 50px; }
                        .sig-box { text-align: center; width: 250px; }
                        .sig-line { border-top: 1px solid #000; padding-top: 5px; font-weight: bold; margin-top: 60px; }
                        @media print {
                            @page { margin: 1cm; }
                            button { display: none; }
                        }
                    </style>
                </head>
                <body>
                    <div class="header-container">
                        <img src="${window.location.origin}/favicon_old.png" alt="EYE STAFF">
                        <h1>FORMATO DE TOMA DE INVENTARIO FÍSICO</h1>
                    </div>
                    <div class="header-info">
                        <div>EMPRESA: EYE STAFF</div>
                        <div>FECHA: ${dStr}</div>
                        <div>REALIZADO POR: ${user.name.toUpperCase()}</div>
                    </div>
                    
                    <table>
                        <thead>
                            <tr>
                                <th style="width:15%;">CATEGORÍA</th>
                                <th style="width:25%;">ÍTEM / DESCRIPCIÓN</th>
                                <th style="width:15%;">SERIALES</th>
                                <th style="width:15%;">UBICACIÓN</th>
                                <th style="width:10%; text-align:center;">CANT.<br>DISP.</th>
                                <th style="width:10%; text-align:center;">FÍSICO</th>
                                <th style="width:10%; text-align:center;">OBS.</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            items.forEach(i => {
                const serials = i.serial_number ? i.serial_number.toUpperCase().split(',').map(s=>s.trim()).filter(s=>s) : [];
                if (serials.length > 0) {
                    html += `
                        <tr>
                            <td>${(i.type||'').toUpperCase()}</td>
                            <td><b>${i.name.toUpperCase()}</b> ${i.size ? '('+i.size.toUpperCase()+')' : ''}</td>
                            <td style="font-size:10px; color:#64748b;">(VER DETALLE)</td>
                            <td>${(i.location || '').toUpperCase()}</td>
                            <td style="text-align:center; font-weight:bold;">${i.quantity}</td>
                            <td></td>
                            <td></td>
                        </tr>
                    `;
                    const eventsQueue = [];
                    (i.active_events || []).forEach(ev => {
                        for(let k=0; k<ev.count; k++) {
                            eventsQueue.push(ev.session_name);
                        }
                    });

                    serials.forEach((sn, idx) => {
                        let snBrand = '';
                        let snValue = sn;
                        if (sn.includes(':')) {
                            const parts = sn.split(':');
                            snBrand = parts[0].trim();
                            snValue = parts.slice(1).join(':').trim();
                        }

                        const eventName = eventsQueue[idx];
                        const isAssigned = !!eventName;
                        const locText = isAssigned ? eventName.toUpperCase() : (() => {
                            const loc = (i.location || '').toUpperCase();
                            return loc === 'ALMACÉN PRINCIPAL' ? 'FLANDES' : (loc || '');
                        })();

                        html += `
                            <tr style="background-color: #f1f5f9;">
                                <td></td>
                                <td style="text-align:right; font-size:11px; font-weight:bold; color:#64748b; padding-right:15px;">↳ ${i.name.toUpperCase()}</td>
                                <td style="font-size:12px; font-weight:bold; text-align:center;">${snValue} ${snBrand ? `<span style="font-size:9px; font-weight:normal; color:#64748b;"><br>(${snBrand})</span>` : ''}</td>
                                <td style="font-size:10px;">${locText}</td>
                                <td style="text-align:center; color:#64748b; font-weight:bold;">1</td>
                                <td style="background-color: #fff;"></td>
                                <td style="background-color: #fff;"></td>
                            </tr>
                        `;
                    });
                } else {
                    html += `
                        <tr>
                            <td>${(i.type||'').toUpperCase()}</td>
                            <td><b>${i.name.toUpperCase()}</b> ${i.size ? '('+i.size.toUpperCase()+')' : ''}</td>
                            <td></td>
                            <td>${(i.location || '').toUpperCase()}</td>
                            <td style="text-align:center;">${i.quantity}</td>
                            <td></td>
                            <td></td>
                        </tr>
                    `;
                }
            });

            html += `
                        </tbody>
                    </table>

                    <div class="signatures">
                        <div class="sig-box">
                            <div class="sig-line">REALIZADO POR (SUPERVISOR/ADMIN)</div>
                            <div style="margin-top:5px; font-size:10px; color:#555;">NOMBRE Y FIRMA</div>
                        </div>
                        <div class="sig-box">
                            <div class="sig-line">VISTO BUENO (DIRECCIÓN EYE STAFF)</div>
                            <div style="margin-top:5px; font-size:10px; color:#555;">NOMBRE Y FIRMA</div>
                        </div>
                    </div>
                    
                    <button onclick="window.print()" style="padding:15px 30px; font-weight:bold; background:#000; color:#fff; border:none; cursor:pointer; display:block; margin: 40px auto 0;">IMPRIMIR FORMATO</button>
                </body>
                </html>
            `;
            
            printWin.document.write(html);
            printWin.document.close();
        } catch (e) {
            hideLoading();
            toast('Error generando formato', 'error');
        }
    };
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
        setTimeout(() => window.scrollTo(0, 0), 100);
    itemsPresupuesto = []; // reset
    el.innerHTML = `
        <div style="margin-bottom:15px; display:flex; justify-content:flex-start;">
            ${getVolverBtn('VOLVER A DIRECCIÓN EYE STAFF', 'renderVipEyeStaff(document.getElementById("current-view"))')}
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
            
            <div style="margin-bottom: 20px; padding: 15px; background: rgba(168, 85, 247, 0.1); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 12px;">
                <label style="color: #c084fc; font-weight: bold; margin-bottom: 5px; display: block;">¿ASOCIAR A UN EVENTO EXISTENTE?</label>
                <p style="font-size: 0.8rem; color: var(--muted); margin-top: 0; margin-bottom: 10px;">Selecciona un evento de Gestión de Listas que aún no tenga presupuesto para autocompletar los datos.</p>
                <select id="pres-asociar-evento" style="width:100%; height:42px; background:var(--surface2); border:1px solid var(--border); color:#fff; border-radius:8px; padding:0 10px;" onchange="autoFillFromEvent()">
                    <option value="">NO ASOCIAR (CREAR PRESUPUESTO EN BLANCO)</option>
                </select>
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
                            <option value="EVENTO LOGISTICO">EVENTO LOGÍSTICO</option>
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
            'actualizacion_datos': 'actualizacion_datos',
            'apertura_evento': 'apertura_evento',
            'cierre_html': 'cierre_html',
            'credenciales': 'credenciales',
            'postulacion_empleo': 'postulacion_empleo',
            'postulacion_empleo': 'postulacion_empleo',
            'backup': 'backup'
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
        const userStr = localStorage.getItem('user');
        const user = userStr ? JSON.parse(userStr) : null;
        const isNelson = user && user.name && user.name.toUpperCase() === 'ADMIN';
        const gridCols = isNelson 
            ? '45px minmax(90px, 1.5fr) minmax(70px, 1fr) minmax(70px, 1fr) minmax(80px, 1fr) 70px 70px 95px 70px'
            : '45px minmax(90px, 1.5fr) minmax(70px, 1fr) minmax(70px, 1fr) minmax(80px, 1fr) 70px 70px 95px';
        const minW = isNelson ? '780px' : '700px';
            
        let tHtml = `<h4 style="color:${titleColor}; margin-top:25px; margin-bottom:10px; font-weight:900; padding-left:5px; font-size: 0.9rem; text-transform: uppercase;">${title} (${tableData.length})</h4>`;
        tHtml += `<div style="border-radius:12px; border:1px solid var(--border); background:rgba(0,0,0,0.1); margin-bottom:20px; overflow-x:auto;">
            <div style="display:grid; grid-template-columns: ${gridCols}; gap:6px; background:var(--surface2); padding:10px; border-bottom:1px solid var(--border); border-radius:12px 12px 0 0; font-weight:900; color:var(--muted); font-size:0.6rem; letter-spacing:0px; min-width:${minW};">
                <div>ID</div>
                <div>CONTACTO</div>
                <div>EMPRESA</div>
                <div style="text-align:center;">TIPO DE EVENTO</div>
                <div>EVENTO</div>
                <div>FECHA</div>
                <div>TOTAL</div>
                <div>ESTATUS</div>
                ${isNelson ? '<div></div>' : ''}
            </div>`;
        
        tHtml += `<div style="height: 250px; overflow-y: auto; overflow-x: auto;">
        <div style="min-width:${minW};">`;
        
        tHtml += tableData.map((d, index) => {
            const status = d.estatus || 'GENERADO';
            const isLast = index === tableData.length - 1;
            const tipo = (d.form && d.form.tipoEvento) ? d.form.tipoEvento : 'VALET PARKING';
            
            let displayFecha = d.fecha;
            if (!displayFecha || displayFecha === 'N/A') {
                displayFecha = (d.form && d.form.fecha) ? d.form.fecha : 'N/A';
            }
            
            let htmlRow = `
                <div style="display:grid; grid-template-columns: ${gridCols}; gap:6px; padding:10px; border-bottom:${isLast ? 'none' : '1px solid var(--border)'}; align-items:center; transition:background 0.2s; font-size:0.65rem; width:100%;" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background='transparent'">
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
            if (isNelson) {
                // Add the delete button column
                let deleteHtml = `
                    <div style="display:flex; justify-content:center; align-items:center;">
                        <button onclick="event.stopPropagation(); deletePresupuesto('${d.id}')" class="btn btn-danger btn-sm" style="padding:6px 12px; font-size:0.65rem; font-weight:bold; border-radius:6px; background:var(--danger); color:white; border:none; cursor:pointer;">
                            🗑️ BORRAR
                        </button>
                    </div>
                </div>
            `;
                // Replace the closing </div> of the grid row with the delete button and a new closing </div>
                return htmlRow.replace(/<\/div>\s*$/, deleteHtml);
            }
            return htmlRow;
        }).join('');
        tHtml += `</div></div></div>`;
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

window.deletePresupuesto = async function(id) {
    if (!confirm(`¿Está seguro que desea eliminar permanentemente el presupuesto ${id}? Esta acción no se puede deshacer.`)) return;
    showLoading('ELIMINANDO PRESUPUESTO...');
    try {
        const res = await apiFetch(`/api/presupuestos/${id}`, { method: 'DELETE' });
        if (res && res.success) {
            toast('✅ PRESUPUESTO ELIMINADO', 'success');
            // Refresh historial
            document.getElementById('btn-historial-presupuestos').click();
        } else {
            alert('Error al eliminar presupuesto: ' + (res.error || 'Desconocido'));
        }
    } catch (e) {
        alert('Error de conexión.');
    } finally {
        hideLoading();
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
    if (window.renderPresupuestos) window.renderPresupuestos(document.getElementById("current-view"));
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
    document.getElementById("current-view").scrollIntoView({ behavior: 'smooth' });
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

window.abrirGeneradorNuevo = function() {
    window.currentEditingPresupuestoId = null;
    window.currentEditingPresupuestoTimestamp = null;
    document.getElementById('generador-title').innerHTML = 'NUEVO PRESUPUESTO';
    limpiarFormularioPresupuesto();
    document.getElementById('pres-empresa-emisora').value = 'EYE STAFF';
    window.fetchNextBudgetId();
    loadEventosSinPresupuesto();
    switchPresupuestoTab('generador');
};

window.loadEventosSinPresupuesto = async function() {
    const el = document.getElementById('pres-asociar-evento');
    if (!el) return;
    try {
        const res = await apiFetch('/api/sessions/without-budget');
        if (res && res.data) {
            el.innerHTML = '<option value="">-- No asociar (Evento nuevo) --</option>' + 
                res.data.map(s => `<option value="${s.id}">${s.nombre} (${s.fecha})</option>`).join('');
        }
    } catch(e) { console.error(e); }
};

window.autoFillFromEvent = async function() {
    const id = document.getElementById('pres-asociar-evento').value;
    if (!id) return;
    try {
        const res = await apiFetch(`/api/sessions/${id}`);
        if (res && res.data) {
            const s = res.data;
            document.getElementById('pres-evento').value = s.client_name || '';
            document.getElementById('pres-fecha').value = s.started_at || '';
            document.getElementById('pres-fecha-fin').value = s.started_at || '';
            document.getElementById('pres-inicio').value = s.convocation_time || '';
            document.getElementById('pres-fin-hora').value = '';
            if (document.getElementById('pres-direccion')) {
                document.getElementById('pres-direccion').value = s.location || '';
                updatePresupuestoMap();
            }
        }
    } catch(e) { console.error(e); }
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
        items: JSON.parse(JSON.stringify(itemsPresupuesto)),
        sessionId: document.getElementById('pres-asociar-evento') ? document.getElementById('pres-asociar-evento').value : null
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
        renderPresupuestos(document.getElementById("current-view"));
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

window.enviarBackup = async function(channel) {
    const backupCheckboxes = document.querySelectorAll('input.report-matrix-checkbox[data-report="backup"]:checked');
    const backupUsers = Array.from(backupCheckboxes).map(cb => {
        const row = cb.closest('tr');
        return row ? (row.getAttribute('data-name') || '').toUpperCase() : '';
    }).filter(n => n);
    
    let msg = "¿Está seguro que desea generar y enviar el backup completo del sistema? Esto recopilará la base de datos entera.";
    if (backupUsers.length > 0) {
        msg += `\n\nEl reporte será enviado a: ${backupUsers.join(', ')}`;
    } else {
        msg += `\n\n(Aviso: No hay usuarios suscritos al backup en la matriz)`;
    }
    
    if (!confirm(msg)) return;
    showLoading('GENERANDO Y ENVIANDO BACKUP DE SEGURIDAD...');
    try {
        const res = await apiFetch('/api/admin/send-backup', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel })
        });
        if (res && res.success) {
            toast(`Backup enviado. Emails: ${res.emails_sent}, WhatsApps: ${res.wa_sent}`, 'success');
        }
    } catch(e) {
        console.error(e);
        toast('Error crítico: ' + e.message, 'error');
    } finally {
        hideLoading();
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
            ['EMPRESA:', emp.toUpperCase(), 'EVENTO:', evento.toUpperCase()],
            ['ATENCIÓN A:', aten.toUpperCase(), 'AFORO:', (personas + ' pax').toUpperCase()],
            ['TELÉFONO:', tel.toUpperCase(), 'DIRECCIÓN:', direccion.toUpperCase()],
            ['E-MAIL:', email.toUpperCase(), 'LUGAR/CIUDAD:', (lugar + ' / ' + ciudad).toUpperCase()],
            ['FECHA INICIO:', (fInicio + ' (Conv: ' + hConv + ' | Ini: ' + hIni + ')').toUpperCase(), 'FECHA FIN:', (fFin + ' (Culm: ' + hFin + ')').toUpperCase()]
        ]
    });

    // Líneas de Detalles
    const tableData = itemsPresupuesto.map(i => [
        i.cant, 
        (i.desc || '').toUpperCase(), 
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
        doc.save(`${nombreArchivo.toUpperCase()}.pdf`);
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

    document.getElementById("current-view")?.scrollIntoView({ behavior: 'smooth' });
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

