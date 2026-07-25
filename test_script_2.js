
        window.onerror = function(message, source, lineno, colno, error) {
            console.error("Global JS Error Captured:", message, "at line", lineno);
            setTimeout(() => {
                const currentView = document.getElementById('current-view');
                if (currentView && (!currentView.innerHTML || currentView.innerHTML.trim() === '' || (currentView.querySelector('#portal-view') && currentView.querySelector('#portal-view').innerHTML.trim() === ''))) {
                    currentView.innerHTML = `
                        <div style="padding:40px 20px; text-align:center; max-width:500px; margin:40px auto; background:rgba(239, 68, 68, 0.05); border:1px solid var(--danger); border-radius:20px; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
                            <i style="font-size:3rem; display:block; margin-bottom:15px;">⚠️</i>
                            <h2 style="color:#fff; font-size:1.1rem; font-weight:900; margin-bottom:10px;">ERROR DE CARGA DE SEGURIDAD</h2>
                            <p style="color:var(--muted); font-size:0.75rem; line-height:1.5; margin-bottom:20px;">
                                Se produjo un error al inicializar el portal. Puedes intentar recargar la página o cerrar la sesión actual del empleado INVITADO para ingresar con tus credenciales.
                            </p>
                            <div style="display:flex; justify-content:center; gap:10px;">
                                <button class="btn btn-secondary btn-sm" onclick="location.reload()" style="padding:8px 15px; border-radius:8px; font-weight:bold;">RECARGAR</button>
                                <button class="btn btn-danger btn-sm" onclick="logout()" style="padding:8px 15px; border-radius:8px; font-weight:bold;">CERRAR SESIÓN 🚪</button>
                            </div>
                        </div>
                    `;
                }
            }, 1000);
        };
    