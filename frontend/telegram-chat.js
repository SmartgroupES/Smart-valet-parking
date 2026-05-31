(function() {
  // Inject CSS
  const style = document.createElement('style');
  style.innerHTML = `
    /* General Chat Container */
    #telegram-chat-widget {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 350px;
      height: 500px;
      background: #1e293b; /* Dark Mode Background */
      color: #f8fafc; /* Light Text */
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      display: flex;
      flex-direction: column;
      z-index: 9999;
      overflow: hidden;
      font-family: 'Inter', sans-serif;
      transition: all 0.3s ease;
      transform: translateY(120%);
    }
    #telegram-chat-widget.open {
      transform: translateY(0);
    }
    /* Header */
    #tc-header {
      background: #0088cc; /* Telegram Blue */
      color: white;
      padding: 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: bold;
    }
    #tc-header .toggle-btn {
      background: rgba(255,255,255,0.2);
      border: none;
      color: white;
      padding: 5px 10px;
      border-radius: 15px;
      cursor: pointer;
      font-size: 12px;
    }
    /* Body */
    #tc-body {
      flex: 1;
      padding: 15px;
      overflow-y: auto;
      background: #0f172a; /* Darker background for body */
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    /* Messages */
    .tc-msg {
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 15px;
      font-size: 14px;
      position: relative;
      word-wrap: break-word;
      color: #e2e8f0;
    }
    .tc-msg-incoming {
      background: #334155;
      align-self: flex-start;
      border-bottom-left-radius: 0;
    }
    .tc-msg-outgoing {
      background: #0ea5e9;
      color: #ffffff;
      align-self: flex-end;
      border-bottom-right-radius: 0;
    }
    
    /* EYESTAFF OPTIMIZED AESTHETIC */
    .theme-eyestaff #tc-header {
      background: linear-gradient(135deg, #0f172a, #000000);
      border-bottom: 2px solid #38bdf8;
    }
    .theme-eyestaff #tc-body {
      background: #020617; /* Very dark */
    }
    .theme-eyestaff .tc-msg {
      border-radius: 20px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
      transition: transform 0.2s;
    }
    .theme-eyestaff .tc-msg:hover {
      transform: scale(1.02);
    }
    .theme-eyestaff .tc-msg-incoming {
      background: linear-gradient(to right, #1e293b, #334155);
      border: 1px solid #475569;
      border-bottom-left-radius: 4px;
    }
    /* Service Color Codes in EYESTAFF */
    .theme-eyestaff .role-valet { border-left: 4px solid #3b82f6; }
    .theme-eyestaff .role-renta { border-left: 4px solid #10b981; }
    .theme-eyestaff .role-xpress { border-left: 4px solid #f59e0b; }
    
    /* Map Container */
    .tc-map-embed {
      width: 100%;
      height: 150px;
      border-radius: 8px;
      margin-top: 5px;
      border: none;
    }
    .tc-sender {
      font-weight: bold;
      font-size: 12px;
      margin-bottom: 4px;
      color: #38bdf8;
    }
    .theme-eyestaff .tc-sender {
      color: #94a3b8;
    }

    /* Floating Button */
    #tc-fab {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 60px;
      height: 60px;
      background: #0088cc;
      border-radius: 50%;
      display: flex;
      justify-content: center;
      align-items: center;
      color: white;
      font-size: 28px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      cursor: pointer;
      z-index: 9998;
      transition: transform 0.2s;
    }
    #tc-fab:hover {
      transform: scale(1.1);
    }
  `;
  document.head.appendChild(style);

  // Inject HTML
  const widgetHtml = `
    <div id="tc-fab">💬</div>
    <div id="telegram-chat-widget">
      <div id="tc-header">
        <span>Telegram Centro</span>
        <div>
          <button class="toggle-btn" id="tc-theme-btn">EYESTAFF Style</button>
          <button class="toggle-btn" id="tc-close-btn">X</button>
        </div>
      </div>
      <div id="tc-body"></div>
      <div id="tc-footer" style="padding:10px;display:flex;gap:5px;align-items:center;">
        <input id="tc-recipient-input" list="tc-recipient-list" placeholder="Selecciona empleado" style="flex:1;background:#334155;color:#e2e8f0;border:none;padding:5px;border-radius:4px;" />
        <datalist id="tc-recipient-list"></datalist>
        <input id="tc-message-input" type="text" placeholder="Escribe mensaje..." style="flex:2;background:#334155;color:#e2e8f0;border:none;padding:5px;border-radius:4px;" />
        <button id="tc-send-btn" style="background:#0ea5e9;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;">Enviar</button>
      </div>
    </div>
  `;
  const container = document.createElement('div');
  container.innerHTML = widgetHtml;
  document.body.appendChild(container);

  // Elements
  const fab = document.getElementById('tc-fab');
  const widget = document.getElementById('telegram-chat-widget');
  const closeBtn = document.getElementById('tc-close-btn');
  const themeBtn = document.getElementById('tc-theme-btn');
  const body = document.getElementById('tc-body');

  // Logic
  let isEyestaffTheme = false;
  let lastId = 0;

// Fetch users for datalist (searchable input)
fetch('/api/telegram/users')
  .then(res => res.json())
  .then(data => {
    const list = document.getElementById('tc-recipient-list');
    if (data && data.users) {
      data.users.forEach(u => {
        const opt = document.createElement('option');
        // Store id|display for later parsing
        opt.value = `${u.id}|${u.name} (${u.role})`;
        list.appendChild(opt);
      });
    }
  })
  .catch(console.error);

  const sendBtn = document.getElementById('tc-send-btn');
  const recipientInput = document.getElementById('tc-recipient-input');
  sendBtn.onclick = async () => {
    const input = document.getElementById('tc-message-input');
    const rawValue = recipientInput.value.trim();
    const message = input.value.trim();
    if (!rawValue) { alert('Selecciona un destinatario'); return; }
    if (!message) { alert('Escribe un mensaje'); return; }
    // Expected format id|display
    const parts = rawValue.split('|');
    const targetUserId = parts[0];
    if (!targetUserId) { alert('Seleccione un empleado válido'); return; }
    try {
      const res = await fetch('/api/telegram/send-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: Number(targetUserId), message })
      });
      const result = await res.json();
      if (result.success) {
        // Show the outgoing message in the chat UI
        appendMessage({ text: message, is_incoming: false, sender_name: 'Yo' });
        input.value = '';
        recipientInput.value = '';
      } else {
        alert('Error enviando mensaje: ' + (result.error || 'desconocido'));
      }
    } catch (e) {
      console.error(e);
      alert('Falló la petición');
    }
  };

  fab.onclick = () => {
    widget.classList.add('open');
    fab.style.display = 'none';
  };

  closeBtn.onclick = () => {
    widget.classList.remove('open');
    setTimeout(() => fab.style.display = 'flex', 300);
  };

  themeBtn.onclick = () => {
    isEyestaffTheme = !isEyestaffTheme;
    if (isEyestaffTheme) {
      widget.classList.add('theme-eyestaff');
      themeBtn.innerText = 'Telegram Style';
    } else {
      widget.classList.remove('theme-eyestaff');
      themeBtn.innerText = 'EYESTAFF Style';
    }
  };

  function appendMessage(msg) {
    const div = document.createElement('div');
    div.className = `tc-msg ${msg.is_incoming ? 'tc-msg-incoming' : 'tc-msg-outgoing'}`;
    
    // Eyestaff specific service color styling
    if (isEyestaffTheme && msg.is_incoming) {
      if (msg.role === 'driver') div.classList.add('role-valet');
      else if (msg.role === 'logistics') div.classList.add('role-renta');
      else div.classList.add('role-xpress');
    }

    let inner = '';
    if (msg.is_incoming && msg.sender_name) {
      inner += `<div class="tc-sender">${msg.sender_name} (${msg.role || 'user'})</div>`;
    }

    if (msg.text) {
      inner += `<div>${msg.text}</div>`;
    }

    // Map embedding for live locations
    if (msg.latitude && msg.longitude) {
      const gmapUrl = `https://maps.google.com/maps?q=${msg.latitude},${msg.longitude}&z=15&output=embed`;
      inner += `<iframe class="tc-map-embed" src="${gmapUrl}"></iframe>`;
    }

    div.innerHTML = inner;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  // SSE Stream Connection
  function connectSSE() {
    const sse = new EventSource(`/api/telegram/stream?last_id=${lastId}`);
    
    sse.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id > lastId) {
          lastId = msg.id;
          appendMessage(msg);
        }
      } catch(e) {}
    };

    sse.onerror = (err) => {
      console.error("SSE Error, reconnecting...");
      sse.close();
      setTimeout(connectSSE, 5000); // Reconnect logic
    };
  }

  // Initial load
  fetch('/api/telegram/messages')
    .then(r => r.json())
    .then(data => {
      if(data.messages) {
        data.messages.forEach(m => {
          if (m.id > lastId) lastId = m.id;
          appendMessage(m);
        });
      }
      connectSSE();
    })
    .catch(() => connectSSE());

})();
