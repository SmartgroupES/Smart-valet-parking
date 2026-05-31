(function() {

  // ─── CSS ───────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.innerHTML = `
    #tc-fab {
      position: fixed; bottom: 20px; right: 20px;
      width: 60px; height: 60px;
      background: linear-gradient(135deg, #0088cc, #0ea5e9);
      border-radius: 50%; display: flex; justify-content: center; align-items: center;
      color: white; font-size: 26px;
      box-shadow: 0 4px 20px rgba(0,136,204,0.5);
      cursor: pointer; z-index: 9998; transition: transform 0.2s, box-shadow 0.2s;
    }
    #tc-fab:hover { transform: scale(1.12); box-shadow: 0 6px 28px rgba(0,136,204,0.7); }

    #telegram-chat-widget {
      position: fixed; bottom: 20px; right: 20px;
      width: 360px; height: 560px;
      background: #0f172a;
      color: #f1f5f9;
      border-radius: 16px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.7);
      display: flex; flex-direction: column;
      z-index: 9999; overflow: hidden;
      font-family: 'Inter', 'Segoe UI', sans-serif;
      transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s;
      transform: translateY(120%) scale(0.95);
      opacity: 0;
    }
    #telegram-chat-widget.open {
      transform: translateY(0) scale(1);
      opacity: 1;
    }

    /* ─── VISTAS ─── */
    #tc-view-list, #tc-view-chat { display: flex; flex-direction: column; height: 100%; }
    #tc-view-chat { display: none; }
    #telegram-chat-widget.in-chat #tc-view-list { display: none; }
    #telegram-chat-widget.in-chat #tc-view-chat { display: flex; }

    /* ─── HEADER COMPARTIDO ─── */
    .tc-header {
      background: linear-gradient(135deg, #020617, #0f172a);
      border-bottom: 1px solid #1e3a5f;
      padding: 14px 16px;
      display: flex; align-items: center; gap: 10px;
      flex-shrink: 0;
    }
    .tc-header-logo {
      font-weight: 900; font-size: 17px; flex: 1;
    }
    .tc-header-logo span.eye { color: #ffffff; }
    .tc-header-logo span.staff { color: #ef4444; }
    .tc-header-avatar {
      width: 36px; height: 36px; border-radius: 50%;
      background: linear-gradient(135deg, #0ea5e9, #3b82f6);
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; font-weight: 700; color: white;
      flex-shrink: 0;
    }
    .tc-header-name {
      flex: 1; font-weight: 600; font-size: 15px; color: #f1f5f9;
    }
    .tc-header-sub {
      font-size: 11px; color: #64748b; margin-top: 1px;
    }
    .tc-icon-btn {
      background: none; border: none; color: #94a3b8;
      font-size: 18px; cursor: pointer; padding: 4px 6px;
      border-radius: 8px; transition: background 0.2s, color 0.2s;
      line-height: 1;
    }
    .tc-icon-btn:hover { background: #1e293b; color: #f1f5f9; }

    /* ─── BUSCADOR ─── */
    #tc-search-wrap {
      padding: 10px 12px;
      background: #0a1628;
      border-bottom: 1px solid #1e3a5f;
      flex-shrink: 0;
    }
    #tc-search {
      width: 100%; box-sizing: border-box;
      background: #1e293b; border: 1px solid #334155;
      color: #f1f5f9; border-radius: 20px;
      padding: 7px 14px; font-size: 13px; outline: none;
      transition: border-color 0.2s;
    }
    #tc-search:focus { border-color: #0ea5e9; }
    #tc-search::placeholder { color: #475569; }

    /* ─── LISTA DE CONVERSACIONES ─── */
    #tc-conv-list {
      flex: 1; overflow-y: auto; background: #0a1628;
      scrollbar-width: thin; scrollbar-color: #1e3a5f transparent;
    }
    .tc-conv-item {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 14px; cursor: pointer;
      border-bottom: 1px solid #0f1f35;
      transition: background 0.15s;
    }
    .tc-conv-item:hover { background: #1e293b; }
    .tc-conv-avatar {
      width: 44px; height: 44px; border-radius: 50%;
      background: linear-gradient(135deg, #1e40af, #0ea5e9);
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 16px; color: white;
      flex-shrink: 0; text-transform: uppercase;
    }
    .tc-conv-info { flex: 1; overflow: hidden; }
    .tc-conv-name {
      font-weight: 600; font-size: 14px; color: #f1f5f9;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .tc-conv-preview {
      font-size: 12px; color: #64748b; margin-top: 2px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .tc-conv-time { font-size: 11px; color: #475569; flex-shrink: 0; }
    .tc-conv-new-btn {
      width: 100%; padding: 12px; border: none;
      background: #0ea5e900; color: #0ea5e9; font-size: 13px;
      font-weight: 600; cursor: pointer; transition: background 0.2s;
      border-top: 1px solid #1e3a5f;
    }
    .tc-conv-new-btn:hover { background: #0ea5e915; }

    /* ─── MENSAJES ─── */
    #tc-messages {
      flex: 1; overflow-y: auto; padding: 14px;
      background: #020617;
      display: flex; flex-direction: column; gap: 8px;
      scrollbar-width: thin; scrollbar-color: #1e3a5f transparent;
    }
    .tc-msg {
      max-width: 78%; padding: 9px 13px; border-radius: 16px;
      font-size: 13.5px; word-wrap: break-word; color: #e2e8f0;
      position: relative;
    }
    .tc-msg-out {
      background: linear-gradient(135deg, #0369a1, #0ea5e9);
      color: #fff; align-self: flex-end;
      border-bottom-right-radius: 4px;
    }
    .tc-msg-in {
      background: #1e293b; border: 1px solid #334155;
      align-self: flex-start;
      border-bottom-left-radius: 4px;
    }
    .tc-msg-time {
      font-size: 10px; color: rgba(255,255,255,0.5);
      text-align: right; margin-top: 4px;
    }
    .tc-msg-in .tc-msg-time { color: #475569; }
    .tc-empty {
      text-align: center; color: #334155; font-size: 13px;
      margin: auto; padding: 20px;
    }

    /* ─── FOOTER INPUT ─── */
    #tc-footer {
      padding: 10px 12px; background: #0a1628;
      border-top: 1px solid #1e3a5f;
      display: flex; gap: 8px; align-items: center;
      flex-shrink: 0;
    }
    #tc-msg-input {
      flex: 1; background: #1e293b; border: 1px solid #334155;
      color: #f1f5f9; border-radius: 20px;
      padding: 9px 14px; font-size: 13px; outline: none;
      transition: border-color 0.2s;
    }
    #tc-msg-input:focus { border-color: #0ea5e9; }
    #tc-msg-input::placeholder { color: #475569; }
    #tc-send-btn {
      width: 38px; height: 38px; border-radius: 50%; border: none;
      background: linear-gradient(135deg, #0369a1, #0ea5e9);
      color: white; font-size: 16px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
      flex-shrink: 0;
    }
    #tc-send-btn:hover { transform: scale(1.1); box-shadow: 0 4px 12px rgba(14,165,233,0.5); }

    /* ─── MODAL NUEVA CONVERSACIÓN ─── */
    #tc-new-conv-modal {
      position: absolute; inset: 0;
      background: rgba(0,0,0,0.85); backdrop-filter: blur(4px);
      z-index: 100; display: none;
      flex-direction: column; align-items: center; justify-content: center;
      padding: 20px;
    }
    #tc-new-conv-modal.visible { display: flex; }
    #tc-modal-box {
      background: #1e293b; border-radius: 16px; width: 100%;
      max-height: 80%; overflow: hidden; display: flex; flex-direction: column;
      border: 1px solid #334155;
    }
    #tc-modal-title {
      padding: 14px 16px; font-weight: 700; font-size: 15px;
      border-bottom: 1px solid #334155; color: #f1f5f9;
      display: flex; align-items: center; justify-content: space-between;
    }
    #tc-modal-search {
      margin: 10px 12px; padding: 8px 14px;
      background: #0f172a; border: 1px solid #334155;
      color: #f1f5f9; border-radius: 20px; font-size: 13px; outline: none;
    }
    #tc-modal-search::placeholder { color: #475569; }
    #tc-user-list-modal {
      overflow-y: auto; max-height: 280px;
      scrollbar-width: thin; scrollbar-color: #334155 transparent;
    }
    .tc-user-item {
      display: flex; align-items: center; gap: 12px;
      padding: 11px 14px; cursor: pointer;
      border-bottom: 1px solid #0f172a;
      transition: background 0.15s;
    }
    .tc-user-item:hover { background: #0f172a; }
    .tc-user-item-avatar {
      width: 38px; height: 38px; border-radius: 50%;
      background: linear-gradient(135deg, #1e40af, #0ea5e9);
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; color: white; font-size: 14px;
      flex-shrink: 0; text-transform: uppercase;
    }
    .tc-user-item-name { font-size: 13.5px; color: #f1f5f9; font-weight: 500; }
  `;
  document.head.appendChild(style);

  // ─── HTML ─────────────────────────────────────────────────────────────────
  const widgetHtml = `
    <div id="tc-fab">💬</div>
    <div id="telegram-chat-widget" class="theme-eyestaff">

      <!-- VISTA: LISTA DE CONVERSACIONES -->
      <div id="tc-view-list">
        <div class="tc-header">
          <div class="tc-header-logo">
            <span class="eye">EYE</span> <span class="staff">STAFF</span>
          </div>
          <button class="tc-icon-btn" id="tc-new-conv-btn" title="Nueva conversación">✏️</button>
          <button class="tc-icon-btn" id="tc-close-list-btn" title="Cerrar">✕</button>
        </div>
        <div id="tc-search-wrap">
          <input id="tc-search" type="text" placeholder="🔍  Buscar conversación..." />
        </div>
        <div id="tc-conv-list">
          <div class="tc-empty">Cargando conversaciones...</div>
        </div>
      </div>

      <!-- VISTA: CONVERSACIÓN ABIERTA -->
      <div id="tc-view-chat">
        <div class="tc-header">
          <button class="tc-icon-btn" id="tc-back-btn" title="Volver">‹</button>
          <div id="tc-chat-avatar" class="tc-header-avatar">?</div>
          <div style="flex:1">
            <div class="tc-header-name" id="tc-chat-name">—</div>
            <div class="tc-header-sub">vía Telegram · EYE STAFF</div>
          </div>
          <button class="tc-icon-btn" id="tc-close-chat-btn" title="Cerrar">✕</button>
        </div>
        <div id="tc-messages">
          <div class="tc-empty">Selecciona un empleado para chatear</div>
        </div>
        <div id="tc-footer">
          <input id="tc-msg-input" type="text" placeholder="Escribe un mensaje..." />
          <button id="tc-send-btn">➤</button>
        </div>
      </div>

      <!-- MODAL: NUEVA CONVERSACIÓN -->
      <div id="tc-new-conv-modal">
        <div id="tc-modal-box">
          <div id="tc-modal-title">
            <span>Nueva conversación</span>
            <button class="tc-icon-btn" id="tc-modal-close-btn">✕</button>
          </div>
          <input id="tc-modal-search" type="text" placeholder="🔍  Buscar empleado..." />
          <div id="tc-user-list-modal"></div>
        </div>
      </div>

    </div>
  `;
  const container = document.createElement('div');
  container.innerHTML = widgetHtml;
  document.body.appendChild(container);

  // ─── ESTADO ───────────────────────────────────────────────────────────────
  let allUsers = [];
  let conversations = []; // { userId, name, lastMsg, lastTime }
  let currentRecipientId = null;
  let currentRecipientName = null;
  let lastMsgId = 0;
  let pollInterval = null;

  // ─── ELEMENTOS ────────────────────────────────────────────────────────────
  const fab           = document.getElementById('tc-fab');
  const widget        = document.getElementById('telegram-chat-widget');
  const closeListBtn  = document.getElementById('tc-close-list-btn');
  const closeChatBtn  = document.getElementById('tc-close-chat-btn');
  const backBtn       = document.getElementById('tc-back-btn');
  const newConvBtn    = document.getElementById('tc-new-conv-btn');
  const convList      = document.getElementById('tc-conv-list');
  const searchInput   = document.getElementById('tc-search');
  const messagesDiv   = document.getElementById('tc-messages');
  const msgInput      = document.getElementById('tc-msg-input');
  const sendBtn       = document.getElementById('tc-send-btn');
  const chatName      = document.getElementById('tc-chat-name');
  const chatAvatar    = document.getElementById('tc-chat-avatar');
  const modal         = document.getElementById('tc-new-conv-modal');
  const modalClose    = document.getElementById('tc-modal-close-btn');
  const modalSearch   = document.getElementById('tc-modal-search');
  const userListModal = document.getElementById('tc-user-list-modal');

  function initials(name) {
    return name.split(' ').slice(0,2).map(p => p[0]).join('').toUpperCase();
  }

  function timeStr(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  // ─── ABRIR / CERRAR ───────────────────────────────────────────────────────
  fab.onclick = () => {
    widget.classList.add('open');
    fab.style.display = 'none';
    loadUsers();
    renderConvList();
  };

  function closeWidget() {
    widget.classList.remove('open', 'in-chat');
    clearInterval(pollInterval);
    setTimeout(() => fab.style.display = 'flex', 300);
  }

  closeListBtn.onclick = closeWidget;
  closeChatBtn.onclick = closeWidget;

  backBtn.onclick = () => {
    widget.classList.remove('in-chat');
    clearInterval(pollInterval);
  };

  // ─── CARGAR USUARIOS ──────────────────────────────────────────────────────
  function loadUsers() {
    fetch('/api/telegram/users')
      .then(r => r.json())
      .then(data => {
        if (data && data.users) {
          allUsers = data.users.sort((a, b) => a.name.localeCompare(b.name));
          window.tcUsersList = allUsers;
          renderModalList('');
        }
      })
      .catch(console.error);
  }

  // ─── LISTA DE CONVERSACIONES ──────────────────────────────────────────────
  function renderConvList(filter) {
    const q = (filter || searchInput.value || '').toLowerCase();
    const list = conversations.filter(c => c.name.toLowerCase().includes(q));

    if (list.length === 0) {
      convList.innerHTML = '<div class="tc-empty">Sin conversaciones. Toca ✏️ para iniciar.</div>';
    } else {
      convList.innerHTML = '';
      list.forEach(c => {
        const item = document.createElement('div');
        item.className = 'tc-conv-item';
        item.innerHTML = `
          <div class="tc-conv-avatar">${initials(c.name)}</div>
          <div class="tc-conv-info">
            <div class="tc-conv-name">${c.name}</div>
            <div class="tc-conv-preview">${c.lastMsg || 'Toca para chatear'}</div>
          </div>
          <div class="tc-conv-time">${c.lastTime || ''}</div>
        `;
        item.onclick = () => openChat(c.userId, c.name);
        convList.appendChild(item);
      });
    }
  }

  function addOrUpdateConversation(userId, name, lastMsg, lastTime) {
    const existing = conversations.find(c => c.userId === userId);
    if (existing) {
      existing.lastMsg = lastMsg;
      existing.lastTime = lastTime;
    } else {
      conversations.push({ userId, name, lastMsg, lastTime });
    }
  }

  searchInput.oninput = () => renderConvList();

  // ─── ABRIR CHAT ───────────────────────────────────────────────────────────
  function openChat(userId, name) {
    currentRecipientId = userId;
    currentRecipientName = name;
    chatName.textContent = name;
    chatAvatar.textContent = initials(name);
    messagesDiv.innerHTML = '<div class="tc-empty">Cargando...</div>';
    widget.classList.add('in-chat');
    loadMessages();
    clearInterval(pollInterval);
    pollInterval = setInterval(loadMessages, 4000);
    msgInput.focus();
  }

  // ─── MENSAJES ─────────────────────────────────────────────────────────────
  function loadMessages() {
    if (!currentRecipientId) return;
    const token = localStorage.getItem('token');
    fetch(`/api/telegram/messages?userId=${currentRecipientId}`, {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    })
      .then(r => r.json())
      .then(data => {
        if (data.messages && data.messages.length > 0) {
          messagesDiv.innerHTML = '';
          data.messages.forEach(m => renderMessage(m));
          messagesDiv.scrollTop = messagesDiv.scrollHeight;
        } else if (messagesDiv.querySelector('.tc-empty')) {
          messagesDiv.innerHTML = '<div class="tc-empty">Sin mensajes aún. ¡Sé el primero en escribir! 👋</div>';
        }
      })
      .catch(console.error);
  }

  function renderMessage(msg) {
    const isOut = !msg.is_incoming;
    const div = document.createElement('div');
    div.className = `tc-msg ${isOut ? 'tc-msg-out' : 'tc-msg-in'}`;
    const t = msg.sent_at ? timeStr(msg.sent_at) : '';
    div.innerHTML = `<div>${msg.text || ''}</div>${t ? `<div class="tc-msg-time">${t}</div>` : ''}`;
    messagesDiv.appendChild(div);
  }

  // ─── ENVIAR ───────────────────────────────────────────────────────────────
  async function sendMessage() {
    const text = msgInput.value.trim();
    if (!text || !currentRecipientId) return;
    msgInput.value = '';

    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/telegram/send-direct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ targetUserId: Number(currentRecipientId), message: text })
      });
      const result = await res.json();
      if (result.success) {
        // Mostrar mensaje localmente
        if (messagesDiv.querySelector('.tc-empty')) messagesDiv.innerHTML = '';
        renderMessage({ text, is_incoming: false, sent_at: new Date().toISOString() });
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        addOrUpdateConversation(currentRecipientId, currentRecipientName, text, timeStr(new Date().toISOString()));
        renderConvList();
      } else {
        alert('Error: ' + (result.error || 'desconocido'));
      }
    } catch(e) {
      alert('Falló la petición');
    }
  }

  sendBtn.onclick = sendMessage;
  msgInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

  // ─── MODAL NUEVA CONVERSACIÓN ─────────────────────────────────────────────
  newConvBtn.onclick = () => {
    modalSearch.value = '';
    renderModalList('');
    modal.classList.add('visible');
  };
  modalClose.onclick = () => modal.classList.remove('visible');

  function renderModalList(q) {
    const filtered = allUsers.filter(u => u.name.toLowerCase().includes(q.toLowerCase()));
    userListModal.innerHTML = '';
    filtered.forEach(u => {
      const item = document.createElement('div');
      item.className = 'tc-user-item';
      item.innerHTML = `
        <div class="tc-user-item-avatar">${initials(u.name)}</div>
        <div class="tc-user-item-name">${u.name}</div>
      `;
      item.onclick = () => {
        modal.classList.remove('visible');
        addOrUpdateConversation(u.id, u.name, null, null);
        renderConvList();
        openChat(u.id, u.name);
      };
      userListModal.appendChild(item);
    });
    if (filtered.length === 0) {
      userListModal.innerHTML = '<div class="tc-empty">Sin resultados</div>';
    }
  }

  modalSearch.oninput = () => renderModalList(modalSearch.value);

  // Cargar historial de mensajes para poblar conversaciones desde el SSE
  function connectSSE() {
    const sse = new EventSource(`/api/telegram/stream?last_id=${lastMsgId}`);
    sse.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id > lastMsgId) {
          lastMsgId = msg.id;
          if (msg.is_incoming) {
            addOrUpdateConversation(msg.sender_id, msg.sender_name, msg.text, timeStr(new Date().toISOString()));
            renderConvList();
            // Si la conversación está abierta, añadir el mensaje
            if (currentRecipientId && String(msg.sender_id) === String(currentRecipientId)) {
              if (messagesDiv.querySelector('.tc-empty')) messagesDiv.innerHTML = '';
              renderMessage(msg);
              messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }
          }
        }
      } catch(e) {}
    };
    sse.onerror = () => { sse.close(); setTimeout(connectSSE, 5000); };
  }
  connectSSE();

})();
