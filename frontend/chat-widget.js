(function() {
  const isDev = window.location.hostname.includes('staging') || window.location.hostname.includes('smart-group') || window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');
  if (!isDev) return;

  const style = document.createElement('style');
  style.innerHTML = `
    #tc-fab { display: none !important; }
    #internal-chat-fab {
      position: fixed; bottom: 20px; right: 20px; width: 60px; height: 60px;
      background: #0088cc; border-radius: 50%; display: flex; justify-content: center;
      align-items: center; color: white; font-size: 28px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      cursor: pointer; z-index: 9998; transition: transform 0.2s;
    }
    #internal-chat-fab:hover { transform: scale(1.1); }
    
    #internal-chat-widget {
      position: fixed; bottom: 90px; right: 20px; width: 400px; height: 600px;
      background: #1e293b; color: #f8fafc; border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5); display: flex; flex-direction: row;
      z-index: 9999; overflow: hidden; font-family: 'Inter', sans-serif;
      transition: all 0.3s ease; opacity: 0; pointer-events: none; transform: translateY(20px);
    }
    #internal-chat-widget.open { opacity: 1; pointer-events: auto; transform: translateY(0); }
    
    .chat-sidebar { width: 140px; background: #0f172a; border-right: 1px solid #334155; display: flex; flex-direction: column; }
    .chat-main { flex: 1; display: flex; flex-direction: column; background: #020617; }
    
    .chat-sidebar-header { padding: 10px; background: #0088cc; color: white; font-size: 12px; font-weight: bold; text-align: center; }
    .chat-list { flex: 1; overflow-y: auto; padding: 5px; }
    .chat-item { padding: 8px; border-radius: 6px; cursor: pointer; font-size: 12px; margin-bottom: 5px; background: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-left: 3px solid transparent; }
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
  `;
  document.head.appendChild(style);

  const html = `
    <div id="internal-chat-fab">💬</div>
    <div id="internal-chat-widget">
      <div class="chat-sidebar">
        <div class="chat-sidebar-header">Conversaciones</div>
        <div class="chat-list" id="chat-list"></div>
        <div class="chat-actions">
          <button class="chat-btn" id="btn-new-chat">Nueva Conversación</button>
          <button class="chat-btn" id="btn-new-group" style="display:none; background:#a855f7;">Crear Grupo</button>
        </div>
      </div>
      <div class="chat-main">
        <div class="chat-main-header">
          <strong id="chat-title">Selecciona un chat</strong>
          <button id="btn-close-chat" style="background:transparent; border:none; color:white; cursor:pointer;">✖</button>
        </div>
        <div class="chat-body" id="chat-body"></div>
        <div class="chat-footer">
          <input type="text" id="chat-input" class="chat-input" placeholder="Escribe un mensaje..." disabled />
          <button id="btn-send" class="chat-btn" disabled>Enviar</button>
        </div>
      </div>
      <div id="chat-group-modal">
        <div class="modal-content">
          <h3 style="margin:0; font-size:14px;">Nuevo Grupo</h3>
          <input type="text" id="group-name" class="chat-input" placeholder="Nombre del grupo..." />
          <div style="max-height:150px; overflow-y:auto; background:#0f172a; padding:5px; border-radius:4px;" id="group-members">
          </div>
          <div style="display:flex; gap:5px; margin-top:10px;">
            <button id="btn-save-group" class="chat-btn" style="flex:1;">Guardar</button>
            <button id="btn-cancel-group" class="chat-btn" style="background:#ef4444; flex:1;">Cancelar</button>
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
  const groupModal = document.getElementById('chat-group-modal');
  const groupMembersContainer = document.getElementById('group-members');

  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  const currentUser = userStr ? JSON.parse(userStr) : null;

  if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'director')) {
    newGroupBtn.style.display = 'block';
  }

  fab.onclick = () => { widget.classList.add('open'); fab.style.display = 'none'; loadConversations(); };
  closeBtn.onclick = () => { widget.classList.remove('open'); fab.style.display = 'flex'; stopPolling(); };

  newGroupBtn.onclick = () => {
    groupModal.style.display = 'flex';
    document.getElementById('group-name').value = '';
    groupMembersContainer.innerHTML = '';
    allUsers.forEach(u => {
      if (u.id == currentUser.id) return;
      const lbl = document.createElement('label');
      lbl.style.display = 'flex'; lbl.style.gap = '5px'; lbl.style.fontSize = '12px'; lbl.style.marginBottom = '4px';
      lbl.innerHTML = \`<input type="checkbox" value="\${u.id}"> \${u.name}\`;
      groupMembersContainer.appendChild(lbl);
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
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, members })
      });
      const data = await res.json();
      if (data.success) {
        groupModal.style.display = 'none';
        loadConversations();
      } else alert('Error: ' + data.error);
    } catch(e) { alert('Error de red'); }
  };

  newChatBtn.onclick = () => {
    const name = prompt('Escribe el nombre del empleado a buscar:');
    if (!name) return;
    const found = allUsers.find(u => u.name.toLowerCase().includes(name.toLowerCase()));
    if (found) {
      openChat({ type: 'user', id: found.id, name: found.name });
    } else alert('No encontrado');
  };

  async function loadConversations() {
    try {
      const res = await fetch('/api/chat/conversations', { headers: { 'Authorization': 'Bearer ' + token }});
      const data = await res.json();
      allUsers = data.users || [];
      renderConversations(data.groups || [], data.users || []);
    } catch(e) { console.error(e); }
  }

  function renderConversations(groups, users) {
    chatList.innerHTML = '';
    groups.forEach(g => {
      const div = document.createElement('div');
      div.className = 'chat-item'; div.innerText = '👥 ' + g.name;
      div.onclick = () => openChat({ type: 'group', id: g.id, name: g.name });
      if (activeChat && activeChat.type === 'group' && activeChat.id === g.id) div.classList.add('active');
      chatList.appendChild(div);
    });
    // For 1-on-1, ideally we show history, but here we show all users for simplicity (can search).
    users.forEach(u => {
      if (u.id == currentUser.id) return;
      const div = document.createElement('div');
      div.className = 'chat-item'; div.innerText = '👤 ' + u.name;
      div.onclick = () => openChat({ type: 'user', id: u.id, name: u.name });
      if (activeChat && activeChat.type === 'user' && activeChat.id === u.id) div.classList.add('active');
      chatList.appendChild(div);
    });
  }

  function openChat(chatData) {
    activeChat = chatData;
    chatTitle.innerText = chatData.name;
    chatInput.disabled = false; sendBtn.disabled = false;
    chatInput.focus();
    Array.from(chatList.children).forEach(c => c.classList.remove('active'));
    // active state will be set in renderConversations, but we can do it manually or just reload
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
      const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token }});
      const data = await res.json();
      renderMessages(data.messages || []);
    } catch(e) {}
  }

  function renderMessages(msgs) {
    const isAtBottom = chatBody.scrollHeight - chatBody.scrollTop <= chatBody.clientHeight + 20;
    chatBody.innerHTML = '';
    msgs.forEach(m => {
      const isMe = m.sender_id === currentUser.id;
      const div = document.createElement('div');
      div.className = \`tc-msg \${isMe ? 'tc-msg-outgoing' : 'tc-msg-incoming'}\`;
      let inner = '';
      if (!isMe && activeChat.type === 'group') {
        inner += \`<div class="tc-sender">\${m.sender_name}</div>\`;
      }
      inner += \`<div>\${m.message}</div>\`;
      div.innerHTML = inner;
      chatBody.appendChild(div);
    });
    if (isAtBottom) chatBody.scrollTop = chatBody.scrollHeight;
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
      await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      loadMessages();
    } catch(e) { alert('Error al enviar'); }
  }

})();
