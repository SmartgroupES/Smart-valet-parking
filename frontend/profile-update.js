// profile-update.js

function openProfileUpdateModal() {
    showLoading('Cargando perfil...');
    
    apiFetch('/api/staff/profile/me')
        .then(res => {
            hideLoading();
            if(res && res.user) {
                renderProfileUpdateModal(res.user, res.pendingRequest);
            } else {
                toast('Error cargando perfil', 'error');
            }
        })
        .catch(err => {
            hideLoading();
            toast('Error de red', 'error');
        });
}

function renderProfileUpdateModal(user, pendingRequest) {
    const isPending = !!pendingRequest;
    
    let currentData = user;
    if (isPending && pendingRequest.proposed_data) {
        try {
            const proposed = JSON.parse(pendingRequest.proposed_data);
            currentData = { ...user, ...proposed };
        } catch(e){}
    }

    const resolvePhotoUrl = (url) => {
        if (!url) return '';
        if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http') || url.startsWith('/')) return url;
        return '/api/photos/' + url;
    };

    const modalHtml = `
        <style>
            /* Override parent constraints when this modal is injected */
            #modal-body:has(.pu-modal-wrapper) {
                max-width: 800px !important;
                width: 95vw !important;
                padding: 0 !important;
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
            }
            .pu-modal-wrapper {
                max-width: 800px;
                padding: 15px;
                border-radius: 20px;
                background: var(--surface);
                border: 1px solid var(--border);
                max-height: 90vh;
                overflow-y: auto;
                position: relative;
                margin: 0 auto;
                width: 100%;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.8);
            }
            .pu-grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: 15px;
            }
            @media (min-width: 600px) {
                .pu-modal-wrapper {
                    padding: 30px;
                }
                .pu-grid {
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                }
                .pu-full-width {
                    grid-column: 1 / -1;
                }
            }
            .pu-section-title {
                color: var(--brand-blue);
                font-size: 1rem;
                border-bottom: 1px solid var(--border);
                padding-bottom: 5px;
                margin-top: 20px;
            }
        </style>
        <div class="pu-modal-wrapper">
            <button type="button" onclick="document.getElementById('modal-container').style.display='none'; document.getElementById('modal-body').innerHTML=''; document.getElementById('modal-body').style.cssText='';" style="position:absolute; top:15px; right:15px; background:#ef4444; border:none; color:white; font-size:0.8rem; font-weight:bold; cursor:pointer; z-index: 10; padding:6px 12px; border-radius:6px; box-shadow:0 2px 4px rgba(239, 68, 68, 0.3);">CERRAR</button>
            <h2 style="margin-top:0; color:white; font-size:1.5rem; text-align:center; padding-left: 80px; padding-right: 80px;">ACTUALIZAR DATOS</h2>
            
            ${isPending ? `
                <div style="background:rgba(245, 158, 11, 0.2); border:1px solid #f59e0b; color:#fcd34d; padding:10px; border-radius:10px; text-align:center; margin-bottom:20px; font-size:0.85rem;">
                    ⏳ Tienes una actualización pendiente de aprobación por Recursos Humanos. Puedes modificarla si lo deseas.
                </div>
            ` : `
                <div style="background:rgba(40, 168, 233, 0.1); border:1px solid var(--border); color:var(--muted); padding:10px; border-radius:10px; text-align:center; margin-bottom:20px; font-size:0.8rem;">
                    Por favor, completa o actualiza tu información. Los campos resaltados en amarillo requieren tu atención.
                </div>
            `}

            <form id="profile-update-form" onsubmit="submitProfileUpdate(event); return false;">
                
                <h3 class="pu-section-title" style="margin-top:0;">Datos No Modificables</h3>
                <div class="pu-grid">
                    <div class="form-group">
                        <label style="color:var(--muted); font-size:0.8rem; display:block; margin-bottom:5px;">Nombre Completo</label>
                        <input type="text" value="${user.name || ''}" readonly style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:rgba(255,255,255,0.05); color:var(--muted);">
                    </div>
                    <div class="form-group">
                        <label style="color:var(--muted); font-size:0.8rem; display:block; margin-bottom:5px;">Cédula de Identidad</label>
                        <input type="text" value="${user.cedula || ''}" readonly style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:rgba(255,255,255,0.05); color:var(--muted);">
                    </div>
                    <div class="form-group">
                        <label style="color:var(--muted); font-size:0.8rem; display:block; margin-bottom:5px;">Teléfono Celular</label>
                        <input type="text" value="${user.phone || ''}" readonly style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:rgba(255,255,255,0.05); color:var(--muted);">
                    </div>
                </div>
                <div style="font-size:0.7rem; color:var(--muted); margin-top:5px; margin-bottom:20px; text-align:right;">
                    * Para modificar estos datos contacte a RRHH.
                </div>

                <h3 class="pu-section-title">Datos Personales</h3>
                
                <div style="display:flex; justify-content:center; margin-bottom:15px;" class="pu-full-width">
                    <div style="position:relative; width:100px; height:100px; cursor:pointer;" onclick="document.getElementById('pu_photo_upload').click()">
                        <img id="pu_photo_preview" src="${resolvePhotoUrl(currentData.photo_url) || '/user_icon.png'}" style="width:100px; height:100px; border-radius:50%; object-fit:cover; border:2px solid var(--brand-blue);">
                        <div style="position:absolute; bottom:0; right:0; background:var(--brand-blue); border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 5px rgba(0,0,0,0.5);">📷</div>
                    </div>
                    <input type="file" id="pu_photo_upload" accept="image/*" style="display:none;" onchange="handleImageCompress(event, 'pu_photo')">
                </div>

                <div class="pu-grid">
                    <div class="form-group">
                        <label style="color:white; font-size:0.85rem; display:block; margin-bottom:5px;">Correo Electrónico</label>
                        <input type="email" id="pu_email" class="${!currentData.email ? 'empty-field-warning' : ''}" value="${currentData.email || ''}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:white;" oninput="this.classList.remove('empty-field-warning')">
                    </div>
                    <div class="form-group">
                        <label style="color:white; font-size:0.85rem; display:block; margin-bottom:5px;">Fecha de Nacimiento</label>
                        <input type="date" id="pu_birth_date" class="${!currentData.birth_date ? 'empty-field-warning' : ''}" value="${currentData.birth_date || ''}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:white;" oninput="this.classList.remove('empty-field-warning')">
                    </div>
                    <div class="form-group pu-full-width">
                        <label style="color:white; font-size:0.85rem; display:block; margin-bottom:5px;">Dirección de Habitación</label>
                        <input type="text" id="pu_address" class="${!currentData.address ? 'empty-field-warning' : ''}" value="${currentData.address || ''}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:white;" oninput="this.classList.remove('empty-field-warning')">
                    </div>
                    <div class="form-group">
                        <label style="color:white; font-size:0.85rem; display:block; margin-bottom:5px;">Sector / Zona</label>
                        <input type="text" id="pu_sector" class="${!currentData.sector ? 'empty-field-warning' : ''}" value="${currentData.sector || ''}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:white;" oninput="this.classList.remove('empty-field-warning')">
                    </div>
                    <div class="form-group">
                        <label style="color:white; font-size:0.85rem; display:block; margin-bottom:5px;">Alergias o condiciones médicas</label>
                        <input type="text" id="pu_allergies" class="${!currentData.is_allergic ? 'empty-field-warning' : ''}" value="${currentData.is_allergic || ''}" placeholder="Ninguna" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:white;" oninput="this.classList.remove('empty-field-warning')">
                    </div>
                </div>

                <h3 class="pu-section-title">Contacto de Emergencia</h3>
                <div class="pu-grid">
                    <div class="form-group">
                        <label style="color:white; font-size:0.85rem; display:block; margin-bottom:5px;">Nombre del Familiar</label>
                        <input type="text" id="pu_family_contact" class="${!currentData.emergency_contact ? 'empty-field-warning' : ''}" value="${currentData.emergency_contact || ''}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:white;" oninput="this.classList.remove('empty-field-warning')">
                    </div>
                    <div class="form-group">
                        <label style="color:white; font-size:0.85rem; display:block; margin-bottom:5px;">Teléfono del Familiar</label>
                        <input type="text" id="pu_family_phone" class="${!currentData.emergency_phone ? 'empty-field-warning' : ''}" value="${currentData.emergency_phone || ''}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:white;" oninput="this.classList.remove('empty-field-warning')">
                    </div>
                </div>

                <h3 class="pu-section-title">Datos Financieros</h3>
                <div class="pu-grid">
                    <div class="form-group">
                        <label style="color:white; font-size:0.85rem; display:block; margin-bottom:5px;">Entidad Bancaria</label>
                        <select id="pu_bank_name" class="${!currentData.bank_name && !currentData.pago_movil ? 'empty-field-warning' : ''}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:white;" onchange="this.classList.remove('empty-field-warning')">
                            <option value="">Seleccione un banco...</option>
                            <option value="BANCO DE VENEZUELA" ${currentData.bank_name === 'BANCO DE VENEZUELA' ? 'selected' : ''}>Banco de Venezuela</option>
                            <option value="BANCO DIGITAL DE LOS TRABAJADORES" ${currentData.bank_name === 'BANCO DIGITAL DE LOS TRABAJADORES' ? 'selected' : ''}>Banco Digital de los Trabajadores (antes Bicentenario)</option>
                            <option value="BANCO DEL TESORO" ${currentData.bank_name === 'BANCO DEL TESORO' ? 'selected' : ''}>Banco del Tesoro</option>
                            <option value="BANFANB" ${currentData.bank_name === 'BANFANB' ? 'selected' : ''}>BANFANB</option>
                            <option value="BANCO AGRÍCOLA DE VENEZUELA" ${currentData.bank_name === 'BANCO AGRÍCOLA DE VENEZUELA' ? 'selected' : ''}>Banco Agrícola de Venezuela</option>
                            <option value="BANESCO" ${currentData.bank_name === 'BANESCO' ? 'selected' : ''}>Banesco</option>
                            <option value="MERCANTIL" ${currentData.bank_name === 'MERCANTIL' ? 'selected' : ''}>Mercantil</option>
                            <option value="BBVA PROVINCIAL" ${currentData.bank_name === 'BBVA PROVINCIAL' ? 'selected' : ''}>BBVA Provincial</option>
                            <option value="BANCO NACIONAL DE CRÉDITO (BNC)" ${currentData.bank_name === 'BANCO NACIONAL DE CRÉDITO (BNC)' ? 'selected' : ''}>Banco Nacional de Crédito (BNC)</option>
                            <option value="BANCARIBE" ${currentData.bank_name === 'BANCARIBE' ? 'selected' : ''}>Bancaribe</option>
                            <option value="BANCO EXTERIOR" ${currentData.bank_name === 'BANCO EXTERIOR' ? 'selected' : ''}>Banco Exterior</option>
                            <option value="BANCAMIGA" ${currentData.bank_name === 'BANCAMIGA' ? 'selected' : ''}>Bancamiga</option>
                            <option value="BANPLUS" ${currentData.bank_name === 'BANPLUS' ? 'selected' : ''}>Banplus</option>
                            <option value="BFC BANCO FONDO COMÚN" ${currentData.bank_name === 'BFC BANCO FONDO COMÚN' ? 'selected' : ''}>BFC Banco Fondo Común</option>
                            <option value="BANCO PLAZA" ${currentData.bank_name === 'BANCO PLAZA' ? 'selected' : ''}>Banco Plaza</option>
                            <option value="100% BANCO" ${currentData.bank_name === '100% BANCO' ? 'selected' : ''}>100% Banco</option>
                            <option value="VENEZOLANO DE CRÉDITO" ${currentData.bank_name === 'VENEZOLANO DE CRÉDITO' ? 'selected' : ''}>Venezolano de Crédito</option>
                            <option value="BANCO ACTIVO" ${currentData.bank_name === 'BANCO ACTIVO' ? 'selected' : ''}>Banco Activo</option>
                            <option value="BANCO CARONÍ" ${currentData.bank_name === 'BANCO CARONÍ' ? 'selected' : ''}>Banco Caroní</option>
                            <option value="DELSUR" ${currentData.bank_name === 'DELSUR' ? 'selected' : ''}>Delsur</option>
                            <option value="BANCO SOFITASA" ${currentData.bank_name === 'BANCO SOFITASA' ? 'selected' : ''}>Banco Sofitasa</option>
                            <option value="N58 BANCO DIGITAL" ${currentData.bank_name === 'N58 BANCO DIGITAL' ? 'selected' : ''}>N58 Banco Digital</option>
                            <option value="BANCRECER" ${currentData.bank_name === 'BANCRECER' ? 'selected' : ''}>Bancrecer</option>
                            <option value="BANGENTE" ${currentData.bank_name === 'BANGENTE' ? 'selected' : ''}>Bangente</option>
                            <option value="MI BANCO" ${currentData.bank_name === 'MI BANCO' ? 'selected' : ''}>Mi Banco</option>
                            <option value="BANCO INTERNACIONAL DE DESARROLLO" ${currentData.bank_name === 'BANCO INTERNACIONAL DE DESARROLLO' ? 'selected' : ''}>Banco Internacional de Desarrollo</option>
                            <option value="INSTITUTO MUNICIPAL DE CRÉDITO POPULAR" ${currentData.bank_name === 'INSTITUTO MUNICIPAL DE CRÉDITO POPULAR' ? 'selected' : ''}>Instituto Municipal de Crédito Popular</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label style="color:white; font-size:0.85rem; display:block; margin-bottom:5px;">Número de Cuenta (20 dígitos)</label>
                        <input type="text" id="pu_bank_account" class="${!currentData.bank_account && !currentData.pago_movil ? 'empty-field-warning' : ''}" value="${currentData.bank_account || ''}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:white;" oninput="this.classList.remove('empty-field-warning')">
                    </div>
                </div>
                
                <div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:10px; margin-top:15px; margin-bottom:15px;" class="pu-full-width">
                    <label style="display:flex; align-items:center; gap:10px; cursor:pointer; margin-bottom:10px;">
                        <input type="checkbox" id="pu_pago_movil_check" ${currentData.pago_movil ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--brand-blue);" onchange="
                            const bn = document.getElementById('pu_bank_name');
                            const ba = document.getElementById('pu_bank_account');
                            if (this.checked) {
                                bn.classList.remove('empty-field-warning');
                                ba.classList.remove('empty-field-warning');
                            } else {
                                if (!bn.value) bn.classList.add('empty-field-warning');
                                if (!ba.value) ba.classList.add('empty-field-warning');
                            }
                        ">
                        <span style="color:white; font-size:0.9rem;">Deseo recibir mis pagos vía Pago Móvil</span>
                    </label>
                    <div class="form-group">
                        <label style="color:white; font-size:0.85rem; display:block; margin-bottom:5px;">Teléfono Pago Móvil</label>
                        <input type="text" id="pu_pago_movil_phone" class="${!currentData.pago_movil_phone ? 'empty-field-warning' : ''}" value="${currentData.pago_movil_phone || ''}" placeholder="Ej: 04141234567" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:white;" oninput="this.classList.remove('empty-field-warning')">
                    </div>
                </div>

                <h3 class="pu-section-title">Documentos Personales</h3>
                <div style="font-size:0.75rem; color:var(--muted); margin-bottom:15px;">Carga una foto legible de tus documentos. Se optimizarán automáticamente para no gastar tus datos.</div>
                
                <div class="pu-grid">
                    ${renderDocUpload('Cédula de Identidad', 'doc_cedula', resolvePhotoUrl(currentData.cedula_photo_url))}
                    ${renderDocUpload('Licencia de 2da', 'doc_licencia2', resolvePhotoUrl(currentData.licencia_photo_url))}
                    ${renderDocUpload('Certificado Médico de 2da', 'doc_certificado2', resolvePhotoUrl(currentData.certificado_medico_url))}
                    ${renderDocUpload('Licencia de 3ra', 'doc_licencia3', resolvePhotoUrl(currentData.licencia_3ra_photo_url))}
                    ${renderDocUpload('Certificado Médico de 3ra', 'doc_certificado3', resolvePhotoUrl(currentData.certificado_medico_3ra_url))}
                </div>

                <div style="margin-top:25px;" class="pu-full-width">
                    <button type="submit" class="btn btn-primary" style="width:100%; padding:15px; font-size:1.1rem; border-radius:12px; font-weight:800; background:linear-gradient(135deg, #28A8E9, #1a7ab0); color:white; border:none; cursor:pointer; box-shadow:0 5px 15px rgba(40,168,233,0.3);">
                        ENVIAR PARA APROBACIÓN
                    </button>
                </div>
            </form>
        </div>
    `;

    document.getElementById('modal-body').style.cssText = 'max-width: 800px !important; width: 95vw !important; padding: 0 !important; background: transparent !important; border: none !important; box-shadow: none !important;';
    document.getElementById('modal-body').innerHTML = modalHtml;
    document.getElementById('modal-container').style.display = 'flex';
}

function renderDocUpload(label, idPrefix, existingUrl) {
    const hasDoc = !!existingUrl;
    return `
        <div style="margin-bottom:15px; background:rgba(255,255,255,0.02); padding:10px; border-radius:8px; border:1px solid var(--border); display:flex; align-items:center; justify-content:space-between;">
            <div style="flex:1;">
                <label style="color:white; font-size:0.85rem; display:block; margin-bottom:2px;">${label}</label>
                <span style="font-size:0.7rem; color:${hasDoc ? '#10b981' : '#f59e0b'};">${hasDoc ? 'Documento cargado' : 'Sin documento'}</span>
            </div>
            <div style="display:flex; gap:10px; align-items:center;">
                <img id="${idPrefix}_preview" src="${existingUrl || ''}" style="display:${hasDoc ? 'block' : 'none'}; width:40px; height:40px; object-fit:cover; border-radius:4px; border:1px solid var(--border);">
                <button type="button" onclick="document.getElementById('${idPrefix}_upload').click()" style="background:var(--surface); border:1px solid var(--brand-blue); color:var(--brand-blue); border-radius:6px; padding:6px 12px; font-size:0.75rem; cursor:pointer;">
                    CARGAR
                </button>
                <input type="file" id="${idPrefix}_upload" accept="image/*" style="display:none;" onchange="handleImageCompress(event, '${idPrefix}')">
            </div>
        </div>
    `;
}

window.profileUploads = {};

function handleImageCompress(event, elementId) {
    const file = event.target.files[0];
    if (!file) return;

    showLoading('Optimizando imagen...');

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = function(e) {
        const img = new Image();
        img.src = e.target.result;
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1200;
            const MAX_HEIGHT = 1200;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            
            window.profileUploads[elementId] = dataUrl;

            const previewEl = document.getElementById(elementId + '_preview');
            if (previewEl) {
                previewEl.src = dataUrl;
                previewEl.style.display = 'block';
            }
            
            hideLoading();
            toast('Imagen optimizada', 'success');
        };
        img.onerror = function() {
            hideLoading();
            toast('Error al leer imagen', 'error');
        };
    };
}

async function submitProfileUpdate(event) {
    event.preventDefault();
    
    const proposedData = {
        email: document.getElementById('pu_email').value,
        birth_date: document.getElementById('pu_birth_date').value,
        address: document.getElementById('pu_address').value,
        sector: document.getElementById('pu_sector').value,
        bank_name: document.getElementById('pu_bank_name').value,
        bank_account: document.getElementById('pu_bank_account').value,
        pago_movil: document.getElementById('pu_pago_movil_check').checked,
        pago_movil_phone: document.getElementById('pu_pago_movil_phone').value,
        emergency_contact: document.getElementById('pu_family_contact').value,
        emergency_phone: document.getElementById('pu_family_phone').value,
        is_allergic: document.getElementById('pu_allergies').value,
        doc_cedula_base64: window.profileUploads['doc_cedula'] || null,
        doc_licencia2_base64: window.profileUploads['doc_licencia2'] || null,
        doc_certificado2_base64: window.profileUploads['doc_certificado2'] || null,
        doc_licencia3_base64: window.profileUploads['doc_licencia3'] || null,
        doc_certificado3_base64: window.profileUploads['doc_certificado3'] || null,
    };

    const payload = {
        proposed_data: proposedData,
        photo_base64: window.profileUploads['pu_photo'] || null
    };

    showLoading('Enviando datos...');
    try {
        const res = await apiFetch('/api/staff/submit-data-update', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        hideLoading();
        if (res && res.success) {
            document.getElementById('modal-container').style.display='none';
            document.getElementById('modal-body').innerHTML='';
            document.getElementById('modal-body').style.cssText='';
            window.profileUploads = {}; 
            Swal.fire({
                title: 'Enviado',
                text: 'Tus datos han sido enviados a Recursos Humanos para su aprobación.',
                icon: 'success',
                confirmButtonColor: '#28A8E9',
                background: '#0b0f19',
                color: 'white'
            });
        } else {
            toast(res.error || 'Error al enviar datos', 'error');
        }
    } catch(e) {
        hideLoading();
        toast('Error de red', 'error');
    }
}

const style = document.createElement('style');
style.innerHTML = `
    .empty-field-warning {
        animation: blinkYellowBorder 1s infinite alternate;
    }
    @keyframes blinkYellowBorder {
        0% { border-color: rgba(234, 179, 8, 0.2); box-shadow: 0 0 0 transparent; }
        100% { border-color: rgba(234, 179, 8, 1); box-shadow: 0 0 8px rgba(234, 179, 8, 0.8); }
    }
`;
document.head.appendChild(style);
