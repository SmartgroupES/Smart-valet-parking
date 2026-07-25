
    window.previewDoc = function(input, previewId) {
        const preview = document.getElementById(previewId);
        if (input.files && input.files[0]) {
            const file = input.files[0];
            const iconEl = preview.nextElementSibling; // the icon div
            if (file.type === 'application/pdf') {
                preview.style.display = 'none';
                if (iconEl && iconEl.id && iconEl.id.includes('icon')) {
                    iconEl.innerHTML = '<span style="font-size:1.5rem; margin-bottom:5px;">📑</span><span style="font-size:0.55rem; font-weight:bold;">PDF LISTO</span>';
                }
            } else {
                const reader = new FileReader();
                reader.onload = function(e) {
                    preview.src = e.target.result;
                    preview.style.display = 'block';
                    if (iconEl && iconEl.id && iconEl.id.includes('icon')) {
                        iconEl.style.display = 'none';
                    }
                };
                reader.readAsDataURL(file);
            }
        }
    };

    window.handleDocClick = function(inputId) {
        const linkId = inputId === 'edit-staff-carnet' ? null : inputId + '-link';
        const imgId = inputId === 'edit-staff-carnet' ? 'edit-carnet-img' : inputId + '-preview';
        
        let hasDoc = false;
        let docUrl = '';

        if (inputId === 'edit-staff-carnet') {
            const img = document.getElementById(imgId);
            if (img && img.src && !img.src.includes('logo-eye-staff.jpeg') && !img.src.startsWith('data:')) {
                hasDoc = true;
                docUrl = img.src;
            }
        } else {
            const link = document.getElementById(linkId);
            if (link && link.href && !link.href.endsWith('#')) {
                hasDoc = true;
                docUrl = link.href;
            }
        }

        if (hasDoc) {
            const html = `
                <div style="text-align:center; padding:20px;">
                    <div style="font-size:3rem; margin-bottom:15px;">📄</div>
                    <h3 style="color:var(--accent); font-weight:900; margin-bottom:10px;">DOCUMENTO EXISTENTE</h3>
                    <p style="color:var(--muted); font-size:0.95rem; margin-bottom:25px;">Este empleado ya tiene un documento cargado. ¿Qué deseas hacer?</p>
                    <div style="display:flex; flex-direction:column; gap:15px;">
                        <button onclick="closeModal(); document.getElementById('${inputId}').click();" class="btn" style="padding:15px; font-weight:900; font-size:1.1rem; background:#3b82f6; color:white; border:none; border-radius:12px; cursor:pointer;">🔄 REEMPLAZAR</button>
                        <button onclick="closeModal(); window.open('${docUrl}', '_blank');" class="btn" style="padding:15px; font-weight:900; font-size:1.1rem; background:#10b981; color:white; border:none; border-radius:12px; cursor:pointer;">⬇️ DESCARGAR / VER</button>
                        <button onclick="closeModal()" class="btn" style="padding:10px; background:transparent; color:var(--muted); border:none; text-decoration:underline; cursor:pointer; margin-top:5px;">Cancelar</button>
                    </div>
                </div>
            `;
            showModal(html);
        } else {
            document.getElementById(inputId).click();
        }
    };

