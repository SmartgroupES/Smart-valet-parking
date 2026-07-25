
                    // Aplica layout responsivo al contenido del modal
                    window.applyModalCalendarLayout = function(content, panel) {
                        const isDesktop = window.innerWidth >= 900;
                        if (isDesktop) {
                            panel.style.width = Math.min(window.innerWidth * 0.95, 1180) + 'px';
                            panel.style.maxWidth = '95vw';
                            const wrapper = content.querySelector('#monthly-calendar-wrapper');
                            if (wrapper) { wrapper.style.overflowX = 'auto'; wrapper.style.marginTop = '0'; }
                            const grid = content.querySelector('#monthly-calendar-grid');
                            if (grid) {
                                grid.style.display = 'grid';
                                grid.style.gridTemplateColumns = 'repeat(7, minmax(130px, 1fr))';
                                grid.style.gap = '6px';
                                grid.style.minWidth = '910px';
                            }
                            content.querySelectorAll('#monthly-calendar-grid > div').forEach(col => {
                                col.style.minHeight = '120px';
                                col.style.minWidth = '130px';
                            });
                        } else {
                            panel.style.width = 'min(96vw, 680px)';
                            panel.style.maxWidth = '96vw';
                            const grid = content.querySelector('#monthly-calendar-grid');
                            if (grid) {
                                grid.style.display = 'flex';
                                grid.style.flexDirection = 'column';
                                grid.style.gridTemplateColumns = '';
                                grid.style.minWidth = '';
                            }
                        }
                        // Parchear botones de navegación para que no salgan del modal
                        content.querySelectorAll('button').forEach(btn => {
                            const oc = btn.getAttribute('onclick') || '';
                            if (oc.includes('changeHomeCalendarMonth')) {
                                const newOc = oc.replace(/changeHomeCalendarMonth/g, 'changeModalCalendarMonth');
                                btn.setAttribute('onclick', newOc);
                            }
                        });
                        // Parchear eventos del calendario: cerrar modal ANTES de navegar
                        content.querySelectorAll('[onclick*="showDayDetails"]').forEach(el => {
                            const oc = el.getAttribute('onclick') || '';
                            el.setAttribute('onclick', `closeCalendarModal(); setTimeout(function(){ ${oc} }, 260);`);
                        });
                    };

                    // Navega semanas dentro del modal sin tocar el portal
                    window.changeModalCalendarMonth = function(offset) {
                        const content = document.getElementById('calendar-modal-content');
                        const panel  = document.getElementById('calendar-modal-panel');
                        if (!content || !panel) return;
                        if (offset === 'today') {
                            window.currentHomeMonthDate = new Date();
                        } else {
                            window.currentHomeMonthDate = window.currentHomeMonthDate || new Date();
                            window.currentHomeMonthDate.setDate(window.currentHomeMonthDate.getDate() + (offset * 7));
                        }
                        if (typeof generateMonthlyCalendarHTML === 'function') {
                            content.innerHTML = generateMonthlyCalendarHTML();
                        }
                        window.applyModalCalendarLayout(content, panel);
                    };

                    window.openCalendarModal = function() {
                        const overlay = document.getElementById('calendar-modal-overlay');
                        const panel = document.getElementById('calendar-modal-panel');
                        const content = document.getElementById('calendar-modal-content');
                        if (!overlay || !panel) return;
                        if (typeof generateMonthlyCalendarHTML === 'function') {
                            content.innerHTML = generateMonthlyCalendarHTML();
                        } else {
                            content.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px;">Cargando calendario...</div>';
                        }
                        window.applyModalCalendarLayout(content, panel);
                        overlay.style.display = 'block';
                        panel.style.display = 'block';
                        requestAnimationFrame(() => {
                            panel.style.opacity = '1';
                            panel.style.transform = 'translateX(-50%) translateY(0)';
                        });
                    };
                    window.closeCalendarModal = function() {
                        const overlay = document.getElementById('calendar-modal-overlay');
                        const panel = document.getElementById('calendar-modal-panel');
                        if (!overlay || !panel) return;
                        // Deshabilitar interacción inmediatamente para no bloquear clicks en la página
                        overlay.style.pointerEvents = 'none';
                        panel.style.opacity = '0';
                        panel.style.transform = 'translateX(-50%) translateY(-8px)';
                        setTimeout(() => {
                            overlay.style.display = 'none';
                            panel.style.display = 'none';
                        }, 250);
                    };

                    window.openCalendarModal_enableOverlay = function() {
                        const overlay = document.getElementById('calendar-modal-overlay');
                        if (overlay) overlay.style.pointerEvents = 'auto';
                    };
                