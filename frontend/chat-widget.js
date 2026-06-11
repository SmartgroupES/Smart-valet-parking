(function() {
  const style = document.createElement('style');
  style.innerHTML = `
    /* loc-fab removed */
    
    #loc-modal {
      position: fixed; bottom: 90px; right: 20px; width: 90vw; max-width: 350px;
      background: #0f172a; color: #f8fafc; border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5); display: flex; flex-direction: column;
      z-index: 9999; overflow: hidden; font-family: 'Inter', sans-serif;
      transition: all 0.3s ease; opacity: 0; pointer-events: none; transform: translateY(20px);
      border: 1px solid #1e3a5f;
    }
    #loc-modal.open { opacity: 1; pointer-events: auto; transform: translateY(0); }
    
    .loc-modal-header {
      padding: 15px; background: #1e293b; border-bottom: 1px solid #334155;
      display: flex; justify-content: space-between; align-items: center;
    }
    .loc-modal-body { padding: 15px; display: flex; flex-direction: column; gap: 10px; }
    
    .loc-action-btn {
      width: 100%; padding: 12px; border: none; border-radius: 8px;
      font-size: 13px; font-weight: 800; cursor: pointer;
      display: flex; align-items: center; gap: 10px;
      transition: transform 0.15s; color: #fff; text-align: left;
    }
    .loc-action-btn:active { transform: scale(0.97); }
    .loc-btn-current { background: linear-gradient(135deg, #0369a1, #0ea5e9); }
    .loc-btn-live    { background: linear-gradient(135deg, #166534, #22c55e); }
    .loc-btn-stop    { background: linear-gradient(135deg, #7f1d1d, #ef4444); }
    
    .loc-status {
      background: #1e293b; border: 1px solid #334155; border-radius: 6px;
      padding: 10px; font-size: 11px; color: #94a3b8; display: none; margin-top: 5px;
    }
    .loc-status.visible { display: block; }
    .loc-pulse {
      display: inline-block; width: 8px; height: 8px; background: #22c55e;
      border-radius: 50%; animation: locPulse 1.2s infinite; margin-right: 6px;
    }
    @keyframes locPulse {
      0%,100% { opacity:1; transform:scale(1); }
      50% { opacity:0.3; transform:scale(0.6); }
    }
  `;
  document.head.appendChild(style);

  const html = `
    <div id="loc-modal">
      <div class="loc-modal-header">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:18px;">📍</span>
          <div>
            <div style="font-weight:900; font-size:14px; color:#38bdf8;">UBICACIÓN</div>
            <div style="font-size:10px; color:#94a3b8;">Compartir con el sistema</div>
          </div>
        </div>
      </div>
      <div class="loc-modal-body">
        <button class="loc-action-btn loc-btn-current" id="loc-btn-current">
          <span style="font-size:20px;">🔵</span>
          <div style="flex:1;">
            <div>Enviar ubicación actual</div>
            <div style="font-size:10px; font-weight:400; opacity:0.8;">Una sola vez · Exacta a 10m</div>
          </div>
        </button>
        <button class="loc-action-btn loc-btn-live" id="loc-btn-live">
          <span style="font-size:20px;">🟢</span>
          <div style="flex:1;">
            <div>Compartir en tiempo real</div>
            <div style="font-size:10px; font-weight:400; opacity:0.8;">Actualiza cada 15s</div>
          </div>
        </button>
        <button class="loc-action-btn loc-btn-stop" id="loc-btn-stop" style="display:none;">
          <span style="font-size:20px;">🔴</span>
          <div style="flex:1;">
            <div>Detener ubicación en vivo</div>
            <div style="font-size:10px; font-weight:400; opacity:0.8;">Dejar de compartir</div>
          </div>
        </button>
        <div class="loc-status" id="loc-status"></div>
      </div>
    </div>
  `;
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  const modal = document.getElementById('loc-modal');
  const btnCurrent = document.getElementById('loc-btn-current');
  const btnLive = document.getElementById('loc-btn-live');
  const btnStop = document.getElementById('loc-btn-stop');
  const statusDiv = document.getElementById('loc-status');
  let _liveLocInterval = null;

  function getToken() { return localStorage.getItem('token'); }
  function getCurrentUser() { 
    const u = localStorage.getItem('user'); 
    return u ? JSON.parse(u) : null; 
  }

  function setStatus(msg, pulse) {
    statusDiv.classList.add('visible');
    statusDiv.innerHTML = pulse ? '<span class="loc-pulse"></span>' + msg : msg;
  }

  function setLiveUI(isLive) {
    btnLive.style.display = isLive ? 'none' : 'flex';
    btnStop.style.display = isLive ? 'flex' : 'none';
    const topBtn = document.getElementById('btn-header-location');
    if (topBtn) {
      if (isLive) topBtn.style.background = 'rgba(34, 197, 94, 0.2)';
      else topBtn.style.background = 'rgba(40,168,233,0.1)';
    }
  }

  window.toggleLocationModal = () => {
    if (modal.classList.contains('open')) modal.classList.remove('open');
    else modal.classList.add('open');
  };

  document.addEventListener('click', (e) => {
    if (modal.classList.contains('open') && !modal.contains(e.target)) {
      const topBtn = document.getElementById('btn-header-location');
      if (topBtn && topBtn.contains(e.target)) return;
      modal.classList.remove('open');
    }
  });

  btnCurrent.onclick = () => {
    if (!navigator.geolocation) return setStatus('❌ Geolocalización no disponible', false);
    setStatus('Obteniendo posición...', true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lon, accuracy } = pos.coords;
      try {
        const cu = getCurrentUser();
        const res = await fetch('/api/location/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
          body: JSON.stringify({ lat, lon, accuracy, entity_id: cu?.id, entity_type: 'staff' })
        });
        setStatus(res.ok ? '✅ Ubicación enviada' : '❌ Error al enviar', false);
      } catch(e) { setStatus('❌ Falló la petición', false); }
    }, (err) => setStatus('❌ ' + err.message, false), { enableHighAccuracy: true, timeout: 10000 });
  };

  btnLive.onclick = () => {
    if (!navigator.geolocation) return setStatus('❌ Geolocalización no disponible', false);
    setStatus('Iniciando ubicación...', true);
    const token = getToken();
    async function sendLive(pos) {
      try {
        await fetch('/api/location/live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
          body: JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy })
        });
        setStatus('🟢 Compartiendo (cada 15s)', true);
      } catch(e) {}
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      sendLive(pos);
      setLiveUI(true);
      _liveLocInterval = setInterval(() => {
        navigator.geolocation.getCurrentPosition(sendLive, ()=>{}, { enableHighAccuracy: true, timeout: 8000 });
      }, 15000);
    }, (err) => setStatus('❌ ' + err.message, false), { enableHighAccuracy: true, timeout: 10000 });
  };

  btnStop.onclick = async () => {
    clearInterval(_liveLocInterval); _liveLocInterval = null;
    try { await fetch('/api/location/live', { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + getToken() } }); } catch(e) {}
    setLiveUI(false);
    setStatus('⏹ Detenida', false);
  };

  let allUsers = [];

  async function loadConversations() {
    try {
      const res = await fetch('/api/chat/conversations', { headers: { 'Authorization': 'Bearer ' + getToken() }});
      const data = await res.json();
      allUsers = data.allUsers || data.users || [];
    } catch(e) {}
  }

  setInterval(loadConversations, 10000);
  setTimeout(loadConversations, 1000);

  window.getOnlineChatUsersCount = function() {
    return allUsers.filter(u => u.is_online).length;
  };

  window.getOnlineChatUsers = function() {
    return allUsers.filter(u => u.is_online);
  };

})();
