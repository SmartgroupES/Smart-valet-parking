
    let bulkEmployees = [];

    async function openBulkReportsPanel() {
        document.getElementById('bulk-reports-modal').style.display = 'flex';
        document.getElementById('bulk-grid').innerHTML = '<div style="text-align:center; grid-column: 1/-1; padding: 20px;">Cargando personal...</div>';
        try {
            const res = await apiFetch('/api/staff');
            if (res && res.staff) {
                bulkEmployees = res.staff;
                renderBulkGrid(bulkEmployees);
            }
        } catch (e) {
            console.error(e);
            document.getElementById('bulk-grid').innerHTML = 'Error cargando empleados';
        }
    }

    function renderBulkGrid(data) {
        const grid = document.getElementById('bulk-grid');
        grid.innerHTML = '';
        data.forEach(emp => {
            if (emp.status === 'inactivo' || !emp.email) return;
            const card = document.createElement('div');
            card.style.cssText = 'background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; display: flex; align-items: center; gap: 10px; cursor: pointer;';
            card.innerHTML = `
                <input type="checkbox" class="bulk-checkbox" value="${emp.id}">
                <div>
                    <div style="font-weight: bold; font-size: 0.85rem;">${emp.name}</div>
                    <div style="font-size: 0.65rem; color: #9ca3af;">${emp.email || 'Sin correo'}</div>
                </div>
            `;
            card.addEventListener('click', (e) => {
                if(e.target.tagName !== 'INPUT') {
                    const cb = card.querySelector('input');
                    cb.checked = !cb.checked;
                    updateBulkCounter();
                }
            });
            card.querySelector('input').addEventListener('change', updateBulkCounter);
            grid.appendChild(card);
        });
        updateBulkCounter();
    }

    function updateBulkCounter() {
        const selected = document.querySelectorAll('.bulk-checkbox:checked').length;
        document.getElementById('bulk-counter').innerText = selected + ' seleccionados';
        document.getElementById('bulk-submit-btn').disabled = selected === 0;
        document.getElementById('bulk-submit-btn').style.opacity = selected === 0 ? '0.5' : '1';
    }

    document.getElementById('bulk-search').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        renderBulkGrid(bulkEmployees.filter(emp => (emp.name && emp.name.toLowerCase().includes(term))));
    });

    document.getElementById('bulk-select-all').addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('.bulk-checkbox');
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        checkboxes.forEach(cb => cb.checked = !allChecked);
        updateBulkCounter();
    });

    document.getElementById('bulk-submit-btn').addEventListener('click', async () => {
        const checkboxes = document.querySelectorAll('.bulk-checkbox:checked');
        const selectedIds = Array.from(checkboxes).map(cb => cb.value);
        if(selectedIds.length === 0) return;
        
        const btn = document.getElementById('bulk-submit-btn');
        const logs = document.getElementById('bulk-logs');
        btn.disabled = true;
        btn.innerText = 'Enviando...';
        logs.style.display = 'block';
        logs.innerText = 'Iniciando envío...\n';

        try {
            const res = await apiFetch('/api/send-bulk-reports', {
                method: 'POST',
                body: JSON.stringify({ employeeIds: selectedIds, reportType: document.getElementById('bulk-report-type').value })
            });
            
            if(res && res.success) {
                logs.innerText += 'Completado.\\nÉxitos: ' + res.successCount + '\\nFallos: ' + res.failureCount + '\\n';
                if(res.failures && res.failures.length > 0) logs.innerText += JSON.stringify(res.failures, null, 2);
                toast('Envío masivo completado', 'success');
            }
        } catch(err) {
            logs.innerText += 'Error crítico: ' + err.message;
        } finally {
            btn.disabled = false;
            btn.innerText = 'Enviar Reportes';
        }
    });

    // ==========================================
    // FORMULARIO PÚBLICO: ACTUALIZACIÓN DE DATOS
    // ==========================================
    window.renderDataUpdateForm = async function(token) {
        document.body.innerHTML = '<div style="display:flex; justify-content:center; align-items:center; height:100vh; color:white; background:#0b0f19;"><h2>Cargando...</h2></div>';
        try {
            const res = await fetch('/api/public/update-data/' + token);
            const data = await res.json();
            if (!res.ok || !data.success) {
                document.body.innerHTML = `
                    <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; color:white; background:#0b0f19; font-family:'Outfit', sans-serif;">
                        <h1 style="font-size:3rem;">❌</h1>
                        <h2 style="margin-top:10px;">${data.error || 'Error al cargar'}</h2>
                        <p style="color:var(--muted); margin-top:10px;">Este enlace puede ser inválido o ya fue utilizado.</p>
                    </div>
                `;
                return;
            }

            const user = data.user;
            const formatDate = (d) => d ? d.split('T')[0] : '';

            document.body.innerHTML = `
                <div style="background:#0b0f19; min-height:100vh; font-family:'Outfit', sans-serif; color:white; padding:20px;">
                    <div style="max-width:600px; margin:0 auto; background:var(--surface); border-radius:20px; padding:30px; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
                        <div style="text-align:center; margin-bottom:30px;">
                            <img src="logo-eye-staff.jpeg" style="height:50px; margin-bottom:15px;">
                            <h2>Actualización de Datos</h2>
                            <p style="color:var(--muted); font-size:0.9rem;">Por favor revisa y actualiza tu información personal.</p>
                        </div>
                        
                        <form id="update-data-form" style="display:flex; flex-direction:column; gap:15px;">
                            <div>
                                <label style="display:block; font-size:0.8rem; color:var(--muted); margin-bottom:5px;">FOTO DE PERFIL</label>
                                <input type="file" id="upd-photo" accept="image/*" style="width:100%; padding:10px; border-radius:10px; border:1px solid var(--border); background:rgba(255,255,255,0.05); color:white;">
                                <div style="margin-top:10px;"><img src="${user.photo_url ? '/api/photos/' + user.photo_url : 'logo-eye-staff.jpeg'}" style="width:80px; height:80px; border-radius:50%; object-fit:cover; border:2px solid var(--brand-blue);"></div>
                            </div>


                            <div>
                                <label style="display:block; font-size:0.8rem; color:var(--muted); margin-bottom:5px;">TELÉFONO</label>
                                <input type="text" id="upd-phone" value="${user.phone || ''}" placeholder="+346..." required style="width:100%; padding:12px; border-radius:10px; border:1px solid var(--border); background:rgba(255,255,255,0.05); color:white;">
                            </div>

                            <div>
                                <label style="display:block; font-size:0.8rem; color:var(--muted); margin-bottom:5px;">DIRECCIÓN (Código Postal, Calle, Ciudad)</label>
                                <textarea id="upd-address" rows="2" required style="width:100%; padding:12px; border-radius:10px; border:1px solid var(--border); background:rgba(255,255,255,0.05); color:white;">${user.address || ''}</textarea>
                            </div>

                            <div>
                                <label style="display:block; font-size:0.8rem; color:var(--muted); margin-bottom:5px;">SECTOR</label>
                                <input type="text" id="upd-sector" value="${user.sector || ''}" required style="width:100%; padding:12px; border-radius:10px; border:1px solid var(--border); background:rgba(255,255,255,0.05); color:white;">
                            </div>

                            <div>
                                <label style="display:block; font-size:0.8rem; color:var(--muted); margin-bottom:5px;">ENTIDAD BANCARIA</label>
                                <select id="upd-bank" required style="width:100%; padding:12px; border-radius:10px; border:1px solid var(--border); background:#0f111a; color:white;">
                                    <option value="">Seleccione un banco...</option>
                                    <option value="BANCO DE VENEZUELA" ${user.bank_name === 'BANCO DE VENEZUELA' ? 'selected' : ''}>Banco de Venezuela</option>
                                    <option value="BANCO DIGITAL DE LOS TRABAJADORES" ${user.bank_name === 'BANCO DIGITAL DE LOS TRABAJADORES' ? 'selected' : ''}>Banco Digital de los Trabajadores (antes Bicentenario)</option>
                                    <option value="BANCO DEL TESORO" ${user.bank_name === 'BANCO DEL TESORO' ? 'selected' : ''}>Banco del Tesoro</option>
                                    <option value="BANFANB" ${user.bank_name === 'BANFANB' ? 'selected' : ''}>BANFANB</option>
                                    <option value="BANCO AGRÍCOLA DE VENEZUELA" ${user.bank_name === 'BANCO AGRÍCOLA DE VENEZUELA' ? 'selected' : ''}>Banco Agrícola de Venezuela</option>
                                    <option value="BANESCO" ${user.bank_name === 'BANESCO' ? 'selected' : ''}>Banesco</option>
                                    <option value="MERCANTIL" ${user.bank_name === 'MERCANTIL' ? 'selected' : ''}>Mercantil</option>
                                    <option value="BBVA PROVINCIAL" ${user.bank_name === 'BBVA PROVINCIAL' ? 'selected' : ''}>BBVA Provincial</option>
                                    <option value="BANCO NACIONAL DE CRÉDITO (BNC)" ${user.bank_name === 'BANCO NACIONAL DE CRÉDITO (BNC)' ? 'selected' : ''}>Banco Nacional de Crédito (BNC)</option>
                                    <option value="BANCARIBE" ${user.bank_name === 'BANCARIBE' ? 'selected' : ''}>Bancaribe</option>
                                    <option value="BANCO EXTERIOR" ${user.bank_name === 'BANCO EXTERIOR' ? 'selected' : ''}>Banco Exterior</option>
                                    <option value="BANCAMIGA" ${user.bank_name === 'BANCAMIGA' ? 'selected' : ''}>Bancamiga</option>
                                    <option value="BANPLUS" ${user.bank_name === 'BANPLUS' ? 'selected' : ''}>Banplus</option>
                                    <option value="BFC BANCO FONDO COMÚN" ${user.bank_name === 'BFC BANCO FONDO COMÚN' ? 'selected' : ''}>BFC Banco Fondo Común</option>
                                    <option value="BANCO PLAZA" ${user.bank_name === 'BANCO PLAZA' ? 'selected' : ''}>Banco Plaza</option>
                                    <option value="100% BANCO" ${user.bank_name === '100% BANCO' ? 'selected' : ''}>100% Banco</option>
                                    <option value="VENEZOLANO DE CRÉDITO" ${user.bank_name === 'VENEZOLANO DE CRÉDITO' ? 'selected' : ''}>Venezolano de Crédito</option>
                                    <option value="BANCO ACTIVO" ${user.bank_name === 'BANCO ACTIVO' ? 'selected' : ''}>Banco Activo</option>
                                    <option value="BANCO CARONÍ" ${user.bank_name === 'BANCO CARONÍ' ? 'selected' : ''}>Banco Caroní</option>
                                    <option value="DELSUR" ${user.bank_name === 'DELSUR' ? 'selected' : ''}>Delsur</option>
                                    <option value="BANCO SOFITASA" ${user.bank_name === 'BANCO SOFITASA' ? 'selected' : ''}>Banco Sofitasa</option>
                                    <option value="N58 BANCO DIGITAL" ${user.bank_name === 'N58 BANCO DIGITAL' ? 'selected' : ''}>N58 Banco Digital</option>
                                    <option value="BANCRECER" ${user.bank_name === 'BANCRECER' ? 'selected' : ''}>Bancrecer</option>
                                    <option value="BANGENTE" ${user.bank_name === 'BANGENTE' ? 'selected' : ''}>Bangente</option>
                                    <option value="MI BANCO" ${user.bank_name === 'MI BANCO' ? 'selected' : ''}>Mi Banco</option>
                                    <option value="BANCO INTERNACIONAL DE DESARROLLO" ${user.bank_name === 'BANCO INTERNACIONAL DE DESARROLLO' ? 'selected' : ''}>Banco Internacional de Desarrollo</option>
                                    <option value="INSTITUTO MUNICIPAL DE CRÉDITO POPULAR" ${user.bank_name === 'INSTITUTO MUNICIPAL DE CRÉDITO POPULAR' ? 'selected' : ''}>Instituto Municipal de Crédito Popular</option>
                                </select>
                            </div>

                            <div>
                                <label style="display:block; font-size:0.8rem; color:var(--muted); margin-bottom:5px;">NÚMERO DE CUENTA</label>
                                <input type="text" id="upd-account" value="${user.bank_account || ''}" placeholder="0000 0000 0000 0000 0000" required style="width:100%; padding:12px; border-radius:10px; border:1px solid var(--border); background:rgba(255,255,255,0.05); color:white;">
                            </div>
                            
                            <div>
                                <label style="display:block; font-size:0.8rem; color:var(--muted); margin-bottom:5px;">TELÉFONO PAGO MÓVIL</label>
                                <input type="text" id="upd-pago-movil-phone" value="${user.pago_movil_phone || ''}" placeholder="EJ: 0414..." style="width:100%; padding:12px; border-radius:10px; border:1px solid var(--border); background:rgba(255,255,255,0.05); color:white;">
                            </div>

                            <div style="margin-top: 15px; display: flex; align-items: center;">
                                <input type="checkbox" id="upd-pago-movil" ${user.pago_movil ? 'checked' : ''} style="width:20px; height:20px; cursor:pointer;" onchange="document.getElementById('upd-bank').disabled = this.checked; document.getElementById('upd-account').disabled = this.checked; if(this.checked) { document.getElementById('upd-bank').value = ''; document.getElementById('upd-account').value = ''; document.getElementById('upd-bank').removeAttribute('required'); document.getElementById('upd-account').removeAttribute('required'); } else { document.getElementById('upd-bank').setAttribute('required', 'true'); document.getElementById('upd-account').setAttribute('required', 'true'); }">
                                <label for="upd-pago-movil" style="margin-left:10px; cursor:pointer; font-weight:bold; color: white;">QUIERO MI PAGO EN PAGO MÓVIL</label>
                            </div>
                            <div id="upd-pago-movil-init" data-checked="${user.pago_movil ? '1' : '0'}" style="display:none;"></div>

                            <div>
                                <label style="display:block; font-size:0.8rem; color:var(--muted); margin-bottom:5px;">CONTACTO DE EMERGENCIA (Nombre y Parentesco)</label>
                                <input type="text" id="upd-emer-name" value="${user.emergency_contact || ''}" required style="width:100%; padding:12px; border-radius:10px; border:1px solid var(--border); background:rgba(255,255,255,0.05); color:white;">
                            </div>

                            <div>
                                <label style="display:block; font-size:0.8rem; color:var(--muted); margin-bottom:5px;">TELÉFONO DE EMERGENCIA</label>
                                <input type="text" id="upd-emer-phone" value="${user.emergency_phone || ''}" required style="width:100%; padding:12px; border-radius:10px; border:1px solid var(--border); background:rgba(255,255,255,0.05); color:white;">
                            </div>

                            <div>
                                <label style="display:block; font-size:0.8rem; color:var(--muted); margin-bottom:5px;">ALERGIAS O CONDICIONES MÉDICAS (Escribir "Ninguna" si no aplica)</label>
                                <input type="text" id="upd-allergies" value="${user.is_allergic || ''}" required style="width:100%; padding:12px; border-radius:10px; border:1px solid var(--border); background:rgba(255,255,255,0.05); color:white;">
                            </div>

                            <!-- DOCUMENTACIÓN LEGAL -->
                            <div style="background:rgba(255,255,255,0.03); padding:15px; border-radius:12px; border:1px solid var(--border);">
                                <label style="display:block; font-weight:bold; color:#6366f1; margin-bottom:12px; font-size:0.85rem; letter-spacing:1px;">📎 DOCUMENTACIÓN LEGAL (Opcional)</label>
                                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(100px, 1fr)); gap:10px;">

                                    <!-- Cédula -->
                                    <div style="text-align:center;">
                                        <div onclick="document.getElementById('upd-doc-cedula').click()" style="height:90px; background:rgba(255,255,255,0.05); border:2px dashed rgba(255,255,255,0.2); border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; position:relative; overflow:hidden;">
                                            <img id="upd-doc-cedula-preview" style="width:100%; height:100%; object-fit:cover; display:none; position:absolute; top:0; left:0;">
                                            <span style="font-size:1.4rem;">📄</span>
                                            <span style="font-size:0.5rem; font-weight:bold; color:var(--muted); margin-top:4px;">CÉDULA</span>
                                        </div>
                                        <input type="file" id="upd-doc-cedula" accept="image/*,application/pdf" style="display:none;" onchange="previewDoc(this,'upd-doc-cedula-preview')">
                                    </div>

                                    <!-- Licencia 2da -->
                                    <div style="text-align:center;">
                                        <div onclick="document.getElementById('upd-doc-lic2').click()" style="height:90px; background:rgba(255,255,255,0.05); border:2px dashed rgba(255,255,255,0.2); border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; position:relative; overflow:hidden;">
                                            <img id="upd-doc-lic2-preview" style="width:100%; height:100%; object-fit:cover; display:none; position:absolute; top:0; left:0;">
                                            <span style="font-size:1.4rem;">🚗</span>
                                            <span style="font-size:0.5rem; font-weight:bold; color:var(--muted); margin-top:4px;">LIC. 2DA</span>
                                        </div>
                                        <input type="file" id="upd-doc-lic2" accept="image/*,application/pdf" style="display:none;" onchange="previewDoc(this,'upd-doc-lic2-preview')">
                                    </div>

                                    <!-- Certificado 2da -->
                                    <div style="text-align:center;">
                                        <div onclick="document.getElementById('upd-doc-cert2').click()" style="height:90px; background:rgba(255,255,255,0.05); border:2px dashed rgba(255,255,255,0.2); border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; position:relative; overflow:hidden;">
                                            <img id="upd-doc-cert2-preview" style="width:100%; height:100%; object-fit:cover; display:none; position:absolute; top:0; left:0;">
                                            <span style="font-size:1.4rem;">⚕️</span>
                                            <span style="font-size:0.5rem; font-weight:bold; color:var(--muted); margin-top:4px;">CERT 2DA</span>
                                        </div>
                                        <input type="file" id="upd-doc-cert2" accept="image/*,application/pdf" style="display:none;" onchange="previewDoc(this,'upd-doc-cert2-preview')">
                                    </div>

                                    <!-- Licencia 3ra -->
                                    <div style="text-align:center;">
                                        <div onclick="document.getElementById('upd-doc-lic3').click()" style="height:90px; background:rgba(255,255,255,0.05); border:2px dashed rgba(255,255,255,0.2); border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; position:relative; overflow:hidden;">
                                            <img id="upd-doc-lic3-preview" style="width:100%; height:100%; object-fit:cover; display:none; position:absolute; top:0; left:0;">
                                            <span style="font-size:1.4rem;">🚚</span>
                                            <span style="font-size:0.5rem; font-weight:bold; color:var(--muted); margin-top:4px;">LIC. 3RA</span>
                                        </div>
                                        <input type="file" id="upd-doc-lic3" accept="image/*,application/pdf" style="display:none;" onchange="previewDoc(this,'upd-doc-lic3-preview')">
                                    </div>

                                    <!-- Certificado 3ra -->
                                    <div style="text-align:center;">
                                        <div onclick="document.getElementById('upd-doc-cert3').click()" style="height:90px; background:rgba(255,255,255,0.05); border:2px dashed rgba(255,255,255,0.2); border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer; position:relative; overflow:hidden;">
                                            <img id="upd-doc-cert3-preview" style="width:100%; height:100%; object-fit:cover; display:none; position:absolute; top:0; left:0;">
                                            <span style="font-size:1.4rem;">⚕️</span>
                                            <span style="font-size:0.5rem; font-weight:bold; color:var(--muted); margin-top:4px;">CERT 3RA</span>
                                        </div>
                                        <input type="file" id="upd-doc-cert3" accept="image/*,application/pdf" style="display:none;" onchange="previewDoc(this,'upd-doc-cert3-preview')">
                                    </div>

                                </div>
                            </div>

                            <button type="submit" id="upd-submit" style="margin-top:20px; width:100%; padding:15px; border-radius:10px; background:#3b82f6; color:white; font-size:1rem; font-weight:bold; border:none; cursor:pointer;">ENVIAR ACTUALIZACIÓN</button>
                        </form>
                    </div>
                </div>
            `;

            // Inicializar estado del checkbox pago_movil
            const initEl = document.getElementById('upd-pago-movil-init');
            if (initEl && initEl.dataset.checked === '1') {
                document.getElementById('upd-bank').disabled = true;
                document.getElementById('upd-account').disabled = true;
                document.getElementById('upd-bank').removeAttribute('required');
                document.getElementById('upd-account').removeAttribute('required');
            }

            document.getElementById('update-data-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const btn = document.getElementById('upd-submit');
                btn.disabled = true;
                btn.innerText = 'PROCESANDO...';

                const payload = {

                    phone: document.getElementById('upd-phone').value,
                    address: document.getElementById('upd-address').value,
                    sector: document.getElementById('upd-sector').value,
                    bank_name: document.getElementById('upd-bank').value,
                    bank_account: document.getElementById('upd-account').value,
                    pago_movil: document.getElementById('upd-pago-movil').checked ? 1 : 0,
                    pago_movil_phone: document.getElementById('upd-pago-movil-phone')?.value || '',
                    emergency_contact: document.getElementById('upd-emer-name').value,
                    emergency_phone: document.getElementById('upd-emer-phone').value,
                    is_allergic: document.getElementById('upd-allergies').value
                };

                // Collect document files
                const docFiles = [
                    { inputId: 'upd-doc-cedula',  docType: 'cedula_photo_url' },
                    { inputId: 'upd-doc-lic2',    docType: 'licencia_photo_url' },
                    { inputId: 'upd-doc-cert2',   docType: 'certificado_medico_url' },
                    { inputId: 'upd-doc-lic3',    docType: 'licencia_3ra_photo_url' },
                    { inputId: 'upd-doc-cert3',   docType: 'certificado_medico_3ra_url' }
                ];
                const docBase64List = [];
                for (const d of docFiles) {
                    const fi = document.getElementById(d.inputId);
                    if (fi && fi.files && fi.files[0]) {
                        const b64 = await new Promise(res => { const r = new FileReader(); r.onload = e => res(e.target.result); r.readAsDataURL(fi.files[0]); });
                        docBase64List.push({ docType: d.docType, base64: b64 });
                    }
                }
                payload._docs = docBase64List;

                const photoInput = document.getElementById('upd-photo');
                if (photoInput.files && photoInput.files[0]) {
                    const file = photoInput.files[0];
                    const reader = new FileReader();
                    reader.onload = function(ev) {
                        const img = new Image();
                        img.onload = async function() {
                            const canvas = document.createElement('canvas');
                            let width = img.width;
                            let height = img.height;
                            const MAX_SIZE = 800;
                            
                            if (width > height && width > MAX_SIZE) {
                                height *= MAX_SIZE / width;
                                width = MAX_SIZE;
                            } else if (height > MAX_SIZE) {
                                width *= MAX_SIZE / height;
                                height = MAX_SIZE;
                            }
                            
                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, width, height);
                            
                            payload.photo_base64 = canvas.toDataURL('image/jpeg', 0.8);
                            await submitUpdateForm(token, payload);
                        };
                        img.src = ev.target.result;
                    };
                    reader.readAsDataURL(file);
                } else {
                    await submitUpdateForm(token, payload);
                }
            });

        } catch(e) {
            document.body.innerHTML = `<div style="color:white; text-align:center; margin-top:50px;">Error de conexión</div>`;
        }
    };

    async function submitUpdateForm(token, payload) {
        try {
            const res = await fetch('/api/public/update-data/' + token, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok && data.success) {
                document.body.innerHTML = `
                    <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:100vh; color:white; background:#0b0f19; font-family:'Outfit', sans-serif;">
                        <h1 style="font-size:4rem; margin:0; color:#10b981;">✅</h1>
                        <h2 style="margin-top:20px;">¡Datos Enviados!</h2>
                        <p style="color:var(--muted); margin-top:10px; max-width:400px; text-align:center;">
                            Tus datos han sido enviados exitosamente a Recursos Humanos para su verificación.
                            Puedes cerrar esta ventana.
                        </p>
                    </div>
                `;
            } else {
                alert('Error al enviar: ' + (data.error || 'Error desconocido'));
                document.getElementById('upd-submit').disabled = false;
                document.getElementById('upd-submit').innerText = 'ENVIAR ACTUALIZACIÓN';
            }
        } catch(e) {
            alert('Error de conexión');
            document.getElementById('upd-submit').disabled = false;
            document.getElementById('upd-submit').innerText = 'ENVIAR ACTUALIZACIÓN';
        }
    }
    function copyFormatLink() {
        const link = window.location.origin + '/formato-pago';
        navigator.clipboard.writeText(link).then(() => {
            alert('¡Enlace copiado al portapapeles! (' + link + ')');
        }).catch(err => {
            alert('Error al copiar: ' + link);
        });
    }

    function exportPaymentFormatsExcel() {
        if (!window.currentPaymentFormats || window.currentPaymentFormats.length === 0) {
            alert('No hay datos para exportar.');
            return;
        }

        const data = [];
        window.currentPaymentFormats.forEach(f => {
            if (f.events && f.events.length > 0) {
                f.events.forEach(ev => {
                    const f1 = new Date(ev.fecha);
                    const f2 = ev.fecha_fin ? new Date(ev.fecha_fin) : f1;
                    let diffDays = 1;
                    if(!isNaN(f1) && !isNaN(f2)) {
                        const diffTime = Math.abs(f2 - f1);
                        diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                    }
                    data.push({
                        'CORRELATIVO': '#' + String(f.id).padStart(4, '0'),
                        'FECHA ENVÍO': new Date(f.fecha_registro).toLocaleString(),
                        'FECHA REPORTE': f.fecha,
                        'NOMBRE': f.nombre,
                        'CÉDULA': f.cedula,
                        'CELULAR': f.telefono_celular,
                        'FIJO': f.telefono_fijo || '',
                        'OBSERVACIÓN': f.observacion || '',
                        'N° EVENTO': ev.numero,
                        'EVENTO': ev.evento,
                        'F. INICIO': ev.fecha,
                        'F. FIN': ev.fecha_fin || '-',
                        'DÍA(S)': diffDays,
                        'LUGAR': ev.lugar,
                        'ACTIVIDAD': ev.actividad,
                        'ADMINISTRACIÓN': ev.monto || 0
                    });
                });
            } else {
                data.push({
                    'CORRELATIVO': '#' + String(f.id).padStart(4, '0'),
                    'FECHA ENVÍO': new Date(f.fecha_registro).toLocaleString(),
                    'FECHA REPORTE': f.fecha,
                    'NOMBRE': f.nombre,
                    'CÉDULA': f.cedula,
                    'CELULAR': f.telefono_celular,
                    'FIJO': f.telefono_fijo || '',
                    'OBSERVACIÓN': f.observacion || '',
                    'N° EVENTO': '-',
                    'EVENTO': 'SIN EVENTOS',
                    'F. INICIO': '-',
                    'F. FIN': '-',
                    'DÍA(S)': '-',
                    'LUGAR': '-',
                    'ACTIVIDAD': '-',
                    'ADMINISTRACIÓN': 0
                });
            }
        });

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Formatos de Pago");
        XLSX.writeFile(wb, "Formatos_de_Pago_EyeStaff.xlsx");
    }

    window.toggleFormatDetails = function(id) {
        const row = document.getElementById(`pf-details-${id}`);
        if (row) {
            row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
        }
    };

    window.exportConsolidatedExcel = function() {
        if (!window.currentPaymentFormats || window.currentPaymentFormats.length === 0) {
            alert('No hay datos para exportar.');
            return;
        }

        const consolidated = {};

        window.currentPaymentFormats.forEach(f => {
            const ced = f.cedula;
            if (!consolidated[ced]) {
                consolidated[ced] = {
                    'NOMBRE': f.nombre,
                    'CÉDULA': f.cedula,
                    'CONTACTO': f.telefono_celular,
                    'TOTAL EVENTOS': 0,
                    'ADMINISTRACIÓN': ''
                };
            }
            if (f.events && f.events.length > 0) {
                consolidated[ced]['TOTAL EVENTOS'] += f.events.length;
            }
        });

        const data = Object.values(consolidated);

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Pagos Consolidados");
        XLSX.writeFile(wb, "Consolidado_Pagos_EyeStaff.xlsx");
        updateEventMonto = async function(id, monto) {
            try {
                const res = await fetch('/api/admin/payment-formats/events/' + id, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('token') },
                    body: JSON.stringify({ monto: parseFloat(monto) || 0 })
                });
                if (!res.ok) throw new Error('Error al guardar');
                // Reload data quietly
                apiFetch('/api/admin/payment-formats').then(data => {
                    if(data && data.data) {
                        window.currentPaymentFormats = data.data;
                        renderAdmin(document.getElementById('current-view'));
                    }
                });
            } catch(e) {
                alert('No se pudo actualizar el monto.');
            }
        };

    };

