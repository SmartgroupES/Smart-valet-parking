
            if (window.location.hostname.includes('staging') || window.location.hostname.includes('smart-group.workers.dev')) {
                const lEye = document.getElementById('logo-eye-staff');
                const lDev = document.getElementById('logo-desarrollo');
                lDev.style.display = 'flex';
                let showDev = false;
                setInterval(() => {
                    showDev = !showDev;
                    if (showDev) {
                        lEye.style.opacity = '0';
                        setTimeout(() => lDev.style.opacity = '1', 600);
                    } else {
                        lDev.style.opacity = '0';
                        setTimeout(() => lEye.style.opacity = '1', 600);
                    }
                }, 3000);
            }
        