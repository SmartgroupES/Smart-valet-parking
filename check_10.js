
    window.toggleReportFav = function(cardId) {
        const currentUser = JSON.parse(localStorage.getItem('user'));
        const canModify = currentUser && (currentUser.profile_admin === 'ADMIN' || currentUser.profile_admin === 'RRHH' || currentUser.role === 'director');
        if (!canModify) {
            alert('No tienes autorización para modificar los reportes favoritos. Solo el perfil de RRHH y ADMIN pueden hacerlo.');
            return;
        }

        let favsStr = window.settings && window.settings.valet_report_favs ? window.settings.valet_report_favs : '[]';
        let favs = [];
        try { favs = JSON.parse(favsStr); } catch(e) {}
        
        if (favs.includes(cardId)) {
            favs = favs.filter(id => id !== cardId);
        } else {
            favs.push(cardId);
        }
        
        if (!window.settings) window.settings = {};
        window.settings.valet_report_favs = JSON.stringify(favs);
        if (window.applyReportFavs) window.applyReportFavs();
        
        try {
            apiFetch('/api/settings', {
                method: 'PATCH',
                body: JSON.stringify({ valet_report_favs: JSON.stringify(favs) })
            });
        } catch(e) {
            console.error('Error saving favs', e);
        }
    };

    window.applyReportFavs = function() {
        let favsStr = window.settings && window.settings.valet_report_favs ? window.settings.valet_report_favs : '[]';
        let favs = [];
        try { favs = JSON.parse(favsStr); } catch(e) {}
        const container = document.getElementById('report-cards-grid');
        if (!container) return;
        
        const cards = Array.from(container.children);
        cards.forEach((card, index) => {
            const id = card.getAttribute('data-card-id');
            if (!id) return;
            
            const favIndex = favs.indexOf(id);
            if (favIndex !== -1) {
                card.style.order = favIndex - favs.length; 
                const icon = card.querySelector('.report-fav-btn');
                if (icon) icon.textContent = '❤️';
            } else {
                card.style.order = index; 
                const icon = card.querySelector('.report-fav-btn');
                if (icon) icon.textContent = '🤍';
            }
        });
    };
