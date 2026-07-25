
                    function linkTelegram() {
                        const user = JSON.parse(localStorage.getItem('user') || '{}');
                        if (!user.id) {
                            alert("⚠️ Inicia sesión primero para vincular tu cuenta.");
                            return;
                        }
                        if (user.id === 1 || user.id === 999) {
                            alert("⚠️ Estás usando una cuenta de acceso especial (bypass). Para vincular tu Telegram, debes cerrar sesión e iniciar usando tu PIN personal.");
                            return;
                        }
                        
                        // REEMPLAZAR 'TU_BOT_USERNAME' CON EL USERNAME DEL BOT (sin el @)
                        const isStaging = window.location.hostname.includes('staging') || window.location.hostname.includes('smart-group.workers.dev');
                        const botUsername = isStaging ? 'eye_staff_dev_bot' : 'eye_staff_bot';
                        
                        const telegramUrl = `https://t.me/${botUsername}?start=link_${user.id}`;
                        window.open(telegramUrl, '_blank');
                    }
                