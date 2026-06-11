(function() {

  const style = document.createElement('style');
  style.innerHTML = `
    #internal-chat-fab {
      position: fixed; bottom: 20px; right: 20px; width: 60px; height: 60px;
      background: #0ea5e9; color: white; border-radius: 50%;
      display: flex; justify-content: center; align-items: center;
      font-size: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      cursor: pointer; z-index: 9998; transition: transform 0.2s;
    }
    #internal-chat-fab:hover { transform: scale(1.1); }
    #internal-chat-fab .fab-badge {
      position: absolute; top: -5px; right: -5px; background: #ef4444; color: white;
      border-radius: 50%; padding: 4px 8px; font-size: 12px; font-weight: bold;
      display: none; box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    
    #internal-chat-widget {
      position: fixed; bottom: 90px; right: 20px; width: 90vw; max-width: 500px; height: 600px; max-height: 80vh;
      background: #1e293b; color: #f8fafc; border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5); display: flex; flex-direction: row;
      z-index: 9999; overflow: hidden; font-family: 'Inter', sans-serif;
      transition: all 0.3s ease; opacity: 0; pointer-events: none; transform: translateY(20px);
    }
    #internal-chat-widget.open { opacity: 1; pointer-events: auto; transform: translateY(0); }
    
    .chat-sidebar { width: 150px; background: #0f172a; border-right: 1px solid #334155; display: flex; flex-direction: column; }
    .chat-main { flex: 1; display: flex; flex-direction: column; background: #020617; }
    
    .chat-sidebar-header { padding: 10px; background: #0088cc; color: white; font-size: 11px; font-weight: bold; text-align: center; text-transform: uppercase; }
    .chat-list { flex: 1; overflow-y: auto; padding: 5px; }
    .chat-item { padding: 8px 6px; border-radius: 6px; cursor: pointer; font-size: 10px; margin-bottom: 5px; background: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-left: 3px solid transparent; }
    .chat-item:hover { background: #334155; }
    .chat-item.active { background: #334155; border-left-color: #0ea5e9; }
    
    .chat-actions { padding: 10px; display: flex; flex-direction: column; gap: 5px; }
    .chat-btn { background: #0ea5e9; color: white; border: none; padding: 6px; border-radius: 4px; font-size: 11px; cursor: pointer; }
    .chat-btn:hover { background: #0284c7; }
    
    .chat-main-header { padding: 10px; background: #1e293b; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center; }
    .chat-body { flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 10px; }
    .chat-footer { padding: 10px; background: #1e293b; border-top: 1px solid #334155; display: flex; gap: 5px; }
    
    .chat-input { flex: 1; background: #334155; color: #e2e8f0; border: none; padding: 8px; border-radius: 4px; font-size: 13px; outline: none; }
    
    .tc-msg { max-width: 85%; padding: 8px 12px; border-radius: 12px; font-size: 13px; position: relative; word-wrap: break-word; }
    .tc-msg-incoming { background: #334155; align-self: flex-start; border-bottom-left-radius: 2px; }
    .tc-msg-outgoing { background: #0ea5e9; color: #fff; align-self: flex-end; border-bottom-right-radius: 2px; }
    .tc-sender { font-weight: bold; font-size: 11px; margin-bottom: 4px; color: #94a3b8; }
    
    #chat-group-modal { position: absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:none; flex-direction:column; justify-content:center; align-items:center; z-index: 10000; }
    .modal-content { background: #1e293b; padding: 20px; border-radius: 8px; width: 80%; display: flex; flex-direction: column; gap: 10px; }
    
    .online-dot { display: inline-block; width: 6px; height: 6px; background-color: #22c55e; border-radius: 50%; margin-right: 5px; animation: blink 2s infinite; vertical-align: middle; }
    .unread-badge { background: #ef4444; color: white; border-radius: 50%; padding: 2px 5px; font-size: 9px; font-weight: bold; margin-left: 5px; vertical-align: middle; }
    @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }

    /* ─── PANEL UBICACIÓN EN VIVO ─── */
    .loc-pinned-item {
      padding: 8px 6px; border-radius: 6px; cursor: pointer;
      font-size: 10px; margin-bottom: 5px;
      background: linear-gradient(135deg, #052e16, #166534);
      color: #86efac; font-weight: bold;
      border-left: 3px solid #22c55e;
      display: flex; align-items: center; gap: 5px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      transition: background 0.2s;
    }
    .loc-pinned-item:hover { background: linear-gradient(135deg, #166534, #15803d); }
    .loc-pinned-badge {
      background: #22c55e; color: #000; border-radius: 4px;
      padding: 1px 5px; font-size: 8px; font-weight: 900;
      margin-left: auto; flex-shrink: 0; display: none;
    }
    #loc-panel {
      position: absolute; inset: 0;
      background: #020617; z-index: 10002;
      display: none; flex-direction: column;
    }
    #loc-panel.open { display: flex; }
    .loc-panel-header {
      padding: 10px 12px; background: #0f172a;
      border-bottom: 1px solid #1e3a5f;
      display: flex; align-items: center; gap: 8px;
    }
    .loc-panel-body {
      flex: 1; padding: 14px 12px;
      display: flex; flex-direction: column; gap: 10px;
      overflow-y: auto;
    }
    .loc-panel-desc {
      background: #0f172a; border: 1px solid #1e3a5f;
      border-radius: 8px; padding: 10px 12px;
      font-size: 11px; color: #94a3b8; line-height: 1.5;
    }
    .loc-panel-desc strong { color: #e2e8f0; }
    .loc-action-btn {
      width: 100%; padding: 12px; border: none; border-radius: 8px;
      font-size: 12px; font-weight: 800; cursor: pointer;
      display: flex; align-items: center; gap: 8px;
      transition: transform 0.15s; color: #fff;
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .loc-action-btn:active { transform: scale(0.97); }
    .loc-btn-current { background: linear-gradient(135deg, #0369a1, #0ea5e9); box-shadow: 0 3px 10px rgba(14,165,233,0.3); }
    .loc-btn-live    { background: linear-gradient(135deg, #166534, #22c55e); box-shadow: 0 3px 10px rgba(34,197,94,0.3); }
    .loc-btn-stop    { background: linear-gradient(135deg, #7f1d1d, #ef4444); box-shadow: 0 3px 10px rgba(239,68,68,0.3); }
    .loc-status {
      background: #0f172a; border: 1px solid #1e3a5f;
      border-radius: 6px; padding: 8px 12px;
      font-size: 11px; color: #64748b;
      display: none;
    }
    .loc-status.visible { display: block; }
    .loc-pulse {
      display: inline-block; width: 7px; height: 7px;
      background: #22c55e; border-radius: 50%;
      animation: locPulse 1.2s infinite; margin-right: 5px;
    }
    @keyframes locPulse {
      0%,100% { opacity:1; transform:scale(1); }
      50% { opacity:0.3; transform:scale(0.6); }
    }

    .chat-attach-menu {
      position: absolute; bottom: 50px; left: 10px; background: #1e293b; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      display: none; flex-direction: column; padding: 5px 0; z-index: 10001; min-width: 180px;
    }
    .chat-attach-menu.show { display: flex; }
    .attach-item {
      padding: 10px 15px; color: white; cursor: pointer; display: flex; align-items: center; gap: 10px; font-size: 13px;
    }
    .attach-item:hover { background: #334155; }
    .attach-icon { font-size: 16px; }
  `;
  document.head.appendChild(style);

  const html = `
    <div id="internal-chat-fab">💬<div class="fab-badge">0</div></div>
    <div id="internal-chat-widget">
      <div class="chat-sidebar">
        <div class="chat-sidebar-header">Conversaciones</div>
        <div class="chat-list" id="chat-list">
          <!-- Ítem fijo: Ubicación en Vivo -->
          <div class="loc-pinned-item" id="loc-pinned-btn">
            📍 Ubicación en Vivo
            <span class="loc-pinned-badge" id="loc-pinned-badge">EN VIVO</span>
          </div>
        </div>
        <div class="chat-actions">
          <button class="chat-btn" id="btn-new-chat">Nueva Conversación</button>
          <button class="chat-btn" id="btn-new-group" style="display:none; background:#a855f7;">Crear Grupo</button>
        </div>
      </div>
      <div class="chat-main" style="position:relative;">
        <!-- PANEL UBICACIÓN EN VIVO -->
        <div id="loc-panel">
          <div class="loc-panel-header">
            <button id="loc-panel-back" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:16px;">&#8249;</button>
            <span style="font-size:16px;">📍</span>
            <div style="flex:1">
              <div style="font-weight:800;font-size:12px;color:#22c55e;">UBICACIÓN EN VIVO</div>
              <div style="font-size:10px;color:#475569;">Solo visible para supervisores</div>
            </div>
            <button id="loc-panel-close" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:14px;">&#10005;</button>
          </div>
          <div class="loc-panel-body">
            <button class="loc-action-btn loc-btn-current" id="loc-btn-current">
              <span style="font-size:16px;">🔵</span>
              <div>
                <div>Enviar ubicación actual</div>
                <div style="font-size:10px;font-weight:400;opacity:0.8;">Una sola vez · Exacta a 10m</div>
              </div>
            </button>
            <button class="loc-action-btn loc-btn-live" id="loc-btn-live">
              <span style="font-size:16px;">🟢</span>
              <div>
                <div>Compartir en tiempo real</div>
                <div style="font-size:10px;font-weight:400;opacity:0.8;">Actualiza cada 15s · Hasta que la desactives</div>
              </div>
            </button>
            <button class="loc-action-btn loc-btn-stop" id="loc-btn-stop" style="display:none;">
              <span style="font-size:16px;">🔴</span>
              <div>
                <div>Detener ubicación en vivo</div>
                <div style="font-size:10px;font-weight:400;opacity:0.8;">Toca aquí para dejar de compartir</div>
              </div>
            </button>
            <div class="loc-status" id="loc-status"></div>
          </div>
        </div>
        <!-- FIN PANEL UBICACIÓN EN VIVO -->
        <div class="chat-main-header">
          <strong id="chat-title">Selecciona un chat</strong>
          <div>
            <button id="btn-delete-chat" style="background:transparent; border:none; color:#ef4444; cursor:pointer; font-size:14px; margin-right:10px; display:none;" title="Borrar historial">🗑️</button>
            <button id="btn-close-chat" style="display:none; background:transparent; border:none; color:white; cursor:pointer;">✖</button>
          </div>
        </div>
        <div class="chat-body" id="chat-body"></div>
        <div class="chat-footer" style="position:relative;">
          <button id="btn-attach-img" style="background:transparent; border:none; cursor:pointer; font-size:16px;" title="Adjuntar">📎</button>
          
          <div id="attach-menu" class="chat-attach-menu">
            <div class="attach-item" id="attach-gallery"><span class="attach-icon">📷</span> Galería</div>
            <div class="attach-item" id="attach-location"><span class="attach-icon">📍</span> Ubicación actual</div>
            <div class="attach-item" id="attach-live-location"><span class="attach-icon">📡</span> Ubicación en tiempo real</div>
          </div>

          <input type="text" id="chat-input" class="chat-input" placeholder="Escribe un mensaje..." disabled />
          <button id="btn-voice-note" style="display:none; background:transparent; border:none; cursor:pointer; font-size:16px;" title="Mantener presionado para Grabar" disabled>🎤</button>
          <button id="btn-send" class="chat-btn" disabled>Enviar</button>
        </div>
        <input type="file" id="chat-file-input" accept="image/*" style="display:none;" />
      </div>
      <div id="chat-group-modal">
        <div class="modal-content">
          <h3 style="margin:0; font-size:14px;">Nuevo Grupo</h3>
          <div style="display:flex; gap:5px; margin-top:5px; margin-bottom:5px;">
            <button id="btn-quick-global" class="chat-btn" style="flex:1; font-size:10px; background:#10b981;">Global Staff</button>
            <button id="btn-quick-leaders" class="chat-btn" style="flex:1; font-size:10px; background:#f59e0b;">Líderes (O, P, B)</button>
          </div>
          <input type="text" id="group-name" class="chat-input" placeholder="Nombre del grupo..." />
          <div style="max-height:150px; overflow-y:auto; background:#0f172a; padding:5px; border-radius:4px;" id="group-members">
          </div>
          <div style="display:flex; gap:5px; margin-top:10px;">
            <button id="btn-save-group" class="chat-btn" style="flex:1;">Guardar</button>
            <button id="btn-cancel-group" class="chat-btn" style="background:#ef4444; flex:1;">Cancelar</button>
          </div>
        </div>
      </div>
      <div id="new-chat-modal" style="position: absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); display:none; flex-direction:column; justify-content:center; align-items:center; z-index: 10000;">
        <div class="modal-content">
          <h3 style="margin:0; font-size:14px;">Nueva Conversación</h3>
          <input type="text" id="new-chat-search" class="chat-input" placeholder="Buscar empleado..." />
          <div style="max-height:150px; overflow-y:auto; background:#0f172a; padding:5px; border-radius:4px;" id="new-chat-list">
          </div>
          <div style="display:flex; gap:5px; margin-top:10px;">
            <button id="btn-cancel-new-chat" class="chat-btn" style="background:#ef4444; flex:1;">Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  `;
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  let activeChat = null; // { type: 'user'|'group', id: X }
  let lastPollInterval = null;
  let allUsers = [];

  window.getOnlineChatUsersCount = function() {
    const cu = getCurrentUser();
    return allUsers.filter(u => u.is_online && (!cu || u.id !== cu.id)).length;
  };

  window.getOnlineChatUsers = function() {
    return allUsers.filter(u => u.is_online);
  };

  const fab = document.getElementById('internal-chat-fab');
  const widget = document.getElementById('internal-chat-widget');
  const closeBtn = document.getElementById('btn-close-chat');
  const chatList = document.getElementById('chat-list');
  const chatBody = document.getElementById('chat-body');
  const chatTitle = document.getElementById('chat-title');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('btn-send');
  
  const newChatBtn = document.getElementById('btn-new-chat');
  const newGroupBtn = document.getElementById('btn-new-group');
  const btnDeleteChat = document.getElementById('btn-delete-chat');
  const btnAttachImg = document.getElementById('btn-attach-img');
  const btnVoiceNote = document.getElementById('btn-voice-note');
  const fileInput = document.getElementById('chat-file-input');

  const groupModal = document.getElementById('chat-group-modal');
  const groupMembersContainer = document.getElementById('group-members');
  const newChatModal = document.getElementById('new-chat-modal');
  const newChatSearch = document.getElementById('new-chat-search');
  const newChatList = document.getElementById('new-chat-list');

  // ─── PANEL UBICACIÓN EN VIVO ───
  const locPanel       = document.getElementById('loc-panel');
  const locPinnedBtn   = document.getElementById('loc-pinned-btn');
  const locPinnedBadge = document.getElementById('loc-pinned-badge');
  const locPanelBack   = document.getElementById('loc-panel-back');
  const locPanelClose  = document.getElementById('loc-panel-close');
  const locBtnCurrent  = document.getElementById('loc-btn-current');
  const locBtnLive     = document.getElementById('loc-btn-live');
  const locBtnStop     = document.getElementById('loc-btn-stop');
  const locStatus      = document.getElementById('loc-status');
  let _liveLocInterval = null;

  function setLocStatus(msg, pulse) {
    locStatus.classList.add('visible');
    locStatus.innerHTML = pulse ? `<span class="loc-pulse"></span>${msg}` : msg;
  }
  function setLiveUI(isLive) {
    locBtnLive.style.display = isLive ? 'none' : 'flex';
    locBtnStop.style.display = isLive ? 'flex' : 'none';
    locPinnedBadge.style.display = isLive ? 'inline-block' : 'none';
  }

  locPinnedBtn.onclick = () => locPanel.classList.add('open');
  locPanelBack.onclick = () => locPanel.classList.remove('open');
  locPanelClose.onclick = () => locPanel.classList.remove('open');

  locBtnCurrent.onclick = () => {
    if (!navigator.geolocation) return setLocStatus('❌ Geolocalización no disponible', false);
    setLocStatus('Obteniendo posición...', true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lon, accuracy } = pos.coords;
      try {
        const cu = getCurrentUser();
        const res = await fetch('/api/location/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
          body: JSON.stringify({ lat, lon, accuracy, entity_id: cu?.id, entity_type: 'staff' })
        });
        setLocStatus(res.ok ? '✅ Ubicación enviada a Geolocalización' : '❌ Error al enviar', false);
      } catch(e) { setLocStatus('❌ Falló la petición', false); }
    }, (err) => setLocStatus('❌ ' + err.message, false), { enableHighAccuracy: true, timeout: 10000 });
  };

  locBtnLive.onclick = () => {
    if (!navigator.geolocation) return setLocStatus('❌ Geolocalización no disponible', false);
    setLocStatus('Iniciando ubicación en tiempo real...', true);
    const token = getToken();
    async function sendLive(pos) {
      try {
        await fetch('/api/location/live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy })
        });
        setLocStatus('🟢 Compartiendo en tiempo real... (cada 15s)', true);
      } catch(e) {}
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      sendLive(pos);
      setLiveUI(true);
      _liveLocInterval = setInterval(() => {
        navigator.geolocation.getCurrentPosition(sendLive, ()=>{}, { enableHighAccuracy: true, timeout: 8000 });
      }, 15000);
    }, (err) => setLocStatus('❌ ' + err.message, false), { enableHighAccuracy: true, timeout: 10000 });
  };

  locBtnStop.onclick = async () => {
    clearInterval(_liveLocInterval); _liveLocInterval = null;
    try { await fetch('/api/location/live', { method: 'DELETE', headers: { 'Authorization': `Bearer ${getToken()}` } }); } catch(e) {}
    setLiveUI(false);
    setLocStatus('⏹ Ubicación en vivo detenida', false);
  };

  function getToken() { return localStorage.getItem('token'); }
  function getCurrentUser() { 
    const u = localStorage.getItem('user'); 
    return u ? JSON.parse(u) : null; 
  }

  const initUser = getCurrentUser();
  if (initUser && initUser.eye_id && initUser.eye_id.toUpperCase() === 'ORO') {
    newGroupBtn.style.display = 'block';
  }

  fab.onclick = () => { widget.classList.add('open'); fab.style.display = 'none'; loadConversations(); };
  closeBtn.onclick = () => { widget.classList.remove('open'); fab.style.display = 'flex'; stopPolling(); };

  newGroupBtn.onclick = () => {
    groupModal.style.display = 'flex';
    document.getElementById('group-name').value = '';
    groupMembersContainer.innerHTML = '';
    allUsers.forEach(u => {
      const cu = getCurrentUser();
      if (cu && u.id == cu.id) return;
      const lbl = document.createElement('label');
      lbl.style.display = 'flex'; lbl.style.gap = '5px'; lbl.style.fontSize = '12px'; lbl.style.marginBottom = '4px';
      lbl.innerHTML = `<input type="checkbox" value="${u.id}" data-eye="${u.eye_id || ''}"> ${u.name}`;
      groupMembersContainer.appendChild(lbl);
    });
  };

  document.getElementById('btn-quick-global').onclick = () => {
    document.getElementById('group-name').value = 'Global Eye Staff';
    groupMembersContainer.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = true);
  };
  
  document.getElementById('btn-quick-leaders').onclick = () => {
    document.getElementById('group-name').value = 'ORO, PLATA Y BRONCE';
    groupMembersContainer.querySelectorAll('input[type="checkbox"]').forEach(c => {
      const eye = c.getAttribute('data-eye').toUpperCase();
      c.checked = ['ORO', 'PLATA', 'BRONCE'].includes(eye);
    });
  };

  document.getElementById('btn-cancel-group').onclick = () => groupModal.style.display = 'none';
  document.getElementById('btn-save-group').onclick = async () => {
    const name = document.getElementById('group-name').value.trim();
    if (!name) return alert('Nombre requerido');
    const checkboxes = groupMembersContainer.querySelectorAll('input:checked');
    const members = Array.from(checkboxes).map(c => parseInt(c.value));
    if (members.length === 0) return alert('Selecciona al menos 1 miembro');

    try {
      const res = await fetch('/api/chat/groups', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, members })
      });
      const data = await res.json();
      if (data.success) {
        groupModal.style.display = 'none';
        loadConversations();
      } else alert('Error: ' + data.error);
    } catch(e) { alert('Error de red'); }
  };

  document.getElementById('btn-cancel-new-chat').onclick = () => newChatModal.style.display = 'none';

  function normalizeText(text) {
    if (!text) return '';
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function playTelegramSendSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if(!ctx) return;
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.1);
    } catch(e){}
  }

  function playTelegramReceiveSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if(!ctx) return;
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.1);
      
      const osc2 = ctx.createOscillator(); const gain2 = ctx.createGain();
      osc2.connect(gain2); gain2.connect(ctx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(900, ctx.currentTime + 0.1);
      gain2.gain.setValueAtTime(0, ctx.currentTime + 0.1);
      gain2.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc2.start(ctx.currentTime + 0.1); osc2.stop(ctx.currentTime + 0.2);
    } catch(e){}
  }

  function getColorForEyeId(eyeId) {
    if (eyeId === 'ORO') return '#fbbf24';
    if (eyeId === 'PLATA') return '#a855f7';
    if (eyeId === 'BRONCE') return '#d97706';
    if (eyeId === 'LOGÍSTICA' || eyeId === 'LOGISTICA') return '#f8fafc';
    return '#f8fafc';
  }

  function renderNewChatList(query = '') {
    newChatList.innerHTML = '';
    const q = normalizeText(query);
    const cu = getCurrentUser();
    const filtered = allUsers.filter(u => u.id != cu?.id && normalizeText(u.name).includes(q));
    
    if (filtered.length === 0) {
      newChatList.innerHTML = `<div style="font-size:12px; color:#94a3b8; text-align:center; padding:10px;">NO ENCONTRADO (Total: ${allUsers.length})</div>`;
      return;
    }

    filtered.forEach(u => {
      const div = document.createElement('div');
      div.className = 'chat-item';
      div.innerHTML = (u.is_online ? '<span class="online-dot"></span>' : '') + u.name;
      div.style.color = getColorForEyeId(u.eye_id);
      div.onclick = () => {
        newChatModal.style.display = 'none';
        openChat({ type: 'user', id: u.id, name: u.name });
      };
      newChatList.appendChild(div);
    });
  }

  newChatSearch.oninput = (e) => renderNewChatList(e.target.value);

  newChatBtn.onclick = () => {
    newChatSearch.value = '';
    renderNewChatList('');
    newChatModal.style.display = 'flex';
    setTimeout(() => newChatSearch.focus(), 100);
  };

  let globalUnreadCount = 0;

  async function loadConversations() {
    try {
      const res = await fetch('/api/chat/conversations', { headers: { 'Authorization': 'Bearer ' + getToken() }});
      const data = await res.json();
      allUsers = data.allUsers || data.users || [];
      renderConversations(data.groups || [], data.users || []);
      
      let currentUnread = 0;
      (data.users || []).forEach(u => currentUnread += (u.unread_count || 0));
      
      const fabBadge = document.querySelector('.fab-badge');
      if (fabBadge) {
        if (currentUnread > 0) {
          fabBadge.innerText = currentUnread;
          fabBadge.style.display = 'block';
        } else {
          fabBadge.style.display = 'none';
        }
      }

      if (currentUnread > globalUnreadCount) {
        playTelegramReceiveSound();
      }
      globalUnreadCount = currentUnread;
      
    } catch(e) { console.error(e); }
  }

  function renderConversations(groups, users) {
    // Limpiar solo los items dinámicos, preservando el ítem fijo de ubicación
    Array.from(chatList.children).forEach(el => {
      if (el.id !== 'loc-pinned-btn') el.remove();
    });
    groups.forEach(g => {
      const div = document.createElement('div');
      div.className = 'chat-item'; 
      div.innerText = g.name;
      
      const gName = g.name.toUpperCase();
      if (gName === 'GLOBAL EYE STAFF') {
        div.style.background = '#a855f7';
        div.style.color = '#fff';
        div.style.fontWeight = 'bold';
      } else if (gName === 'ORO, PLATA Y BRONCE') {
        div.style.background = '#f59e0b';
        div.style.color = '#fff';
        div.style.fontWeight = 'bold';
      }
      
      div.onclick = () => openChat({ type: 'group', id: g.id, name: g.name });
      if (activeChat && activeChat.type === 'group' && activeChat.id === g.id) div.classList.add('active');
      chatList.appendChild(div);
    });
    // For 1-on-1, ideally we show history, but here we show all users for simplicity (can search).
    const cu = getCurrentUser();
    users.forEach(u => {
      if (cu && u.id == cu.id) return;
      const div = document.createElement('div');
      div.className = 'chat-item'; 
      const badge = u.unread_count ? `<span class="unread-badge">${u.unread_count}</span>` : '';
      div.innerHTML = (u.is_online ? '<span class="online-dot"></span>' : '') + u.name + badge;
      div.style.color = getColorForEyeId(u.eye_id);
      div.onclick = () => openChat({ type: 'user', id: u.id, name: u.name });
      if (activeChat && activeChat.type === 'user' && activeChat.id === u.id) div.classList.add('active');
      chatList.appendChild(div);
    });
  }

  function openChat(chatData) {
    // Cerrar panel de ubicación si está abierto
    if (locPanel) locPanel.classList.remove('open');
    activeChat = chatData;
    chatTitle.innerText = chatData.name;
    chatInput.disabled = false; sendBtn.disabled = false; btnVoiceNote.disabled = false;
    btnDeleteChat.style.display = chatData.type === 'user' ? 'inline-block' : 'none';
    chatInput.focus();
    Array.from(chatList.children).forEach(c => c.classList.remove('active'));
    lastMessageCount = 0;
    loadMessages();
    startPolling();
  }

  function stopPolling() {
    if (lastPollInterval) clearInterval(lastPollInterval);
  }

  function startPolling() {
    stopPolling();
    lastPollInterval = setInterval(loadMessages, 3000);
  }

  async function loadMessages() {
    if (!activeChat) return;
    const url = '/api/chat/messages?' + (activeChat.type === 'group' ? 'group_id=' : 'user_id=') + activeChat.id;
    try {
      const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + getToken() }});
      const data = await res.json();
      renderMessages(data.messages || []);
    } catch(e) {}
  }

  let lastMessageCount = 0;

  setInterval(loadConversations, 10000); // Polling for unread badges every 10s

  function renderMessages(msgs) {
    const isAtBottom = chatBody.scrollHeight - chatBody.scrollTop <= chatBody.clientHeight + 20;
    chatBody.innerHTML = '';
    const cu = getCurrentUser();
    msgs.forEach(m => {
      const isMe = cu && m.sender_id === cu.id;
      const div = document.createElement('div');
      div.className = `tc-msg ${isMe ? 'tc-msg-outgoing' : 'tc-msg-incoming'}`;
      let inner = '';
      if (!isMe && activeChat.type === 'group') {
        inner += `<div class="tc-sender">${m.sender_name}</div>`;
      }
      
      if (m.attachment_url) {
        if (m.attachment_type === 'image') {
          const imgUrl = m.attachment_url.replace('https://fotos.eye-staff.app/', '/api/photos/');
          inner += `<div style="margin-bottom:5px;"><img src="${imgUrl}" style="max-width:100%; max-height:200px; border-radius:8px; cursor:pointer; display:block; object-fit:cover;" onclick="(function(u){var ov=document.createElement('div');ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:99999;display:flex;align-items:center;justify-content:center;cursor:pointer;';ov.onclick=function(){ov.remove();};var img=document.createElement('img');img.src=u;img.style.cssText='max-width:95vw;max-height:95vh;border-radius:8px;';ov.appendChild(img);document.body.appendChild(ov);}('${imgUrl}'))"/></div>`;
        } else if (m.attachment_type === 'audio') {
          inner += `<div style="margin-bottom:5px;"><audio controls src="${m.attachment_url}" style="max-width:100%; height:30px;"></audio></div>`;
        }
      }
      
      if (m.message) {
        inner += `<div>${m.message}</div>`;
      }
      div.innerHTML = inner;
      chatBody.appendChild(div);
    });
    if (isAtBottom) chatBody.scrollTop = chatBody.scrollHeight;
    
    if (msgs.length > lastMessageCount) {
       const newestMsg = msgs[msgs.length - 1];
       const isMe = cu && newestMsg.sender_id === cu.id;
       if (!isMe && lastMessageCount > 0) {
          playTelegramReceiveSound();
       }
       lastMessageCount = msgs.length;
    }
  }

  sendBtn.onclick = sendMessage;
  chatInput.onkeydown = (e) => { if (e.key === 'Enter') sendMessage(); };

  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || !activeChat) return;
    chatInput.value = '';
    const payload = { message: text };
    if (activeChat.type === 'group') payload.group_id = activeChat.id;
    else payload.recipient_id = activeChat.id;

    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert('Error al enviar: ' + (data.error || 'Desconocido'));
      } else {
        playTelegramSendSound();
        loadMessages();
      }
    } catch(e) { alert('Error de red al enviar'); }
  }

  btnDeleteChat.onclick = async () => {
    if (!activeChat || activeChat.type !== 'user') return;
    if (!confirm(`¿Estás seguro de que deseas borrar todo el historial con ${activeChat.name}? Esta acción no se puede deshacer.`)) return;
    
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: activeChat.id })
      });
      if (res.ok) {
        chatBody.innerHTML = '';
        activeChat = null;
        chatTitle.innerText = 'Selecciona un chat';
        chatInput.disabled = true; sendBtn.disabled = true; btnVoiceNote.disabled = true;
        btnDeleteChat.style.display = 'none';
        loadConversations();
      } else {
        alert('Error al borrar chat.');
      }
    } catch(e) {}
  };

  const attachMenu = document.getElementById('attach-menu');
  btnAttachImg.onclick = (e) => {
    e.stopPropagation();
    if (!activeChat) return;
    attachMenu.classList.toggle('show');
  };

  document.getElementById('attach-gallery').onclick = () => {
    attachMenu.classList.remove('show');
    fileInput.click();
  };

  document.getElementById('attach-location').onclick = () => {
    attachMenu.classList.remove('show');
    if (!activeChat) return;
    if (!navigator.geolocation) return alert('Geolocalización no soportada por tu navegador');

    chatInput.placeholder = 'Obteniendo ubicación...';
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;
        const mapsLink = `https://www.google.com/maps?q=${lat},${lon}`;

        // Registrar en Geolocalización (sección admin)
        try {
          const token = getToken();
          const cu = getCurrentUser();
          await fetch('/api/location/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ lat, lon, accuracy, entity_id: cu?.id, entity_type: 'staff' })
          });
        } catch(e) {}

        // Enviar enlace por chat
        chatInput.placeholder = 'Escribe un mensaje...';
        chatInput.value = `📍 Mi ubicación actual:\n${mapsLink}`;
        sendMessage();
      },
      (err) => {
        alert('Error al obtener la ubicación. Verifica los permisos.');
        chatInput.placeholder = 'Escribe un mensaje...';
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  document.getElementById('attach-live-location').onclick = () => {
    attachMenu.classList.remove('show');
    if (!activeChat) return;
    if (!navigator.geolocation) return alert('Geolocalización no soportada');

    const token = getToken();

    async function sendLivePos(pos) {
      const { latitude: lat, longitude: lon, accuracy } = pos.coords;
      try {
        await fetch('/api/location/live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ lat, lon, accuracy })
        });
      } catch(e) {}
    }

    // Si ya está activo, detenerlo
    if (_liveLocInterval) {
      clearInterval(_liveLocInterval);
      _liveLocInterval = null;
      fetch('/api/location/live', { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }).catch(()=>{});
      chatInput.value = '⏹ He detenido la ubicación en tiempo real.';
      sendMessage();
      document.getElementById('attach-live-location').innerHTML = '<span class="attach-icon">📡</span> Ubicación en tiempo real';
      return;
    }

    navigator.geolocation.getCurrentPosition((pos) => {
      sendLivePos(pos);
      const mapsLink = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`;
      chatInput.value = `📡 Estoy compartiendo mi ubicación en tiempo real.\nAbre la sección Geolocalización para verla en el mapa.\nPosición actual: ${mapsLink}`;
      sendMessage();
      document.getElementById('attach-live-location').innerHTML = '<span class="attach-icon">🔴</span> Detener ubicación en vivo';

      _liveLocInterval = setInterval(() => {
        navigator.geolocation.getCurrentPosition(sendLivePos, ()=>{}, { enableHighAccuracy: true, timeout: 8000 });
      }, 15000);
    }, (err) => {
      alert('No se pudo obtener la ubicación: ' + err.message);
    }, { enableHighAccuracy: true, timeout: 10000 });
  };

  fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    fileInput.value = ''; // reset
    await uploadAndSend(file, 'image');
  };

  let mediaRecorder;
  let audioChunks = [];

  btnVoiceNote.onmousedown = async () => {
    if (!activeChat) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const file = new File([audioBlob], 'voice_note.webm', { type: 'audio/webm' });
        await uploadAndSend(file, 'audio');
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start();
      btnVoiceNote.style.color = '#ef4444'; // Red to indicate recording
    } catch(e) { alert('No se pudo acceder al micrófono. Por favor revisa los permisos.'); }
  };

  btnVoiceNote.onmouseup = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      btnVoiceNote.style.color = '';
    }
  };
  
  // Para móviles
  btnVoiceNote.ontouchstart = (e) => { e.preventDefault(); btnVoiceNote.onmousedown(); };
  btnVoiceNote.ontouchend = (e) => { e.preventDefault(); btnVoiceNote.onmouseup(); };

  async function uploadAndSend(file, type) {
    if (!activeChat) return;
    chatInput.placeholder = 'Subiendo...';
    chatInput.disabled = true;
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch('/api/chat/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + getToken() },
        body: formData
      });
      const uploadData = await uploadRes.json();
      
      if (!uploadRes.ok || !uploadData.url) throw new Error(uploadData.error || 'Upload failed');
      
      const payload = { message: '', attachment_url: uploadData.url, attachment_type: type };
      if (activeChat.type === 'group') payload.group_id = activeChat.id;
      else payload.recipient_id = activeChat.id;

      await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      playTelegramSendSound();
      loadMessages();
    } catch(e) {
      alert('Error al enviar el archivo.');
    } finally {
      chatInput.placeholder = 'Escribe un mensaje...';
      chatInput.disabled = false;
    }
  }

  // Close chat when clicking on empty areas (non-interactive elements)
  widget.addEventListener('click', (e) => {
    // Si hace click fuera del attach-menu, lo ocultamos
    if (!e.target.closest('#btn-attach-img') && !e.target.closest('.chat-attach-menu')) {
      attachMenu.classList.remove('show');
    }

    const isInteractive = e.target.closest('button, input, .chat-item, .tc-msg, label, audio, img, .attach-item');
    if (!isInteractive) {
      // Prevent closing if clicking on scrollbars
      if (e.target.clientWidth && e.offsetX > e.target.clientWidth) return;
      if (e.target.clientHeight && e.offsetY > e.target.clientHeight) return;
      closeBtn.click();
    }
  });

})();
