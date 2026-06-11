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

    #tc-fab .fab-badge {
      position: absolute; top: -5px; right: -5px; background: #ef4444; color: white;
      border-radius: 50%; padding: 4px 8px; font-size: 12px; font-weight: bold;
      display: none; box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    .unread-badge { background: #ef4444; color: white; border-radius: 50%; padding: 2px 5px; font-size: 9px; font-weight: bold; margin-left: 5px; vertical-align: middle; }

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
    
    @keyframes tcBlinkGreen {
      0% { box-shadow: 0 0 0px #22c55e, inset 0 0 0px #22c55e; border: 2px solid transparent; }
      50% { box-shadow: 0 0 8px #22c55e, inset 0 0 4px #22c55e; border: 2px solid #22c55e; }
      100% { box-shadow: 0 0 0px #22c55e, inset 0 0 0px #22c55e; border: 2px solid transparent; }
    }
    .tc-online-avatar {
      animation: tcBlinkGreen 2s infinite;
    }

    /* ─── VISTA UBICACIÓN EN VIVO ─── */
    #tc-view-location { display: none; flex-direction: column; height: 100%; }
    #telegram-chat-widget.in-location #tc-view-list { display: none; }
    #telegram-chat-widget.in-location #tc-view-location { display: flex; }

    .tc-loc-body {
      flex: 1; overflow-y: auto; padding: 20px 16px;
      background: #020617;
      display: flex; flex-direction: column; gap: 14px;
    }
    .tc-loc-desc {
      background: #0f172a; border: 1px solid #1e3a5f;
      border-radius: 12px; padding: 14px 16px;
      font-size: 12.5px; color: #94a3b8; line-height: 1.6;
    }
    .tc-loc-desc strong { color: #e2e8f0; }
    .tc-loc-btn {
      width: 100%; padding: 14px 16px;
      border: none; border-radius: 12px;
      font-size: 14px; font-weight: 700;
      cursor: pointer; display: flex; align-items: center; gap: 10px;
      transition: transform 0.15s, box-shadow 0.15s;
      letter-spacing: 0.3px;
    }
    .tc-loc-btn:hover { transform: scale(1.02); }
    .tc-loc-btn:active { transform: scale(0.98); }
    .tc-loc-btn-current {
      background: linear-gradient(135deg, #0369a1, #0ea5e9);
      color: #fff;
      box-shadow: 0 4px 14px rgba(14,165,233,0.4);
    }
    .tc-loc-btn-live {
      background: linear-gradient(135deg, #166534, #22c55e);
      color: #fff;
      box-shadow: 0 4px 14px rgba(34,197,94,0.4);
    }
    .tc-loc-btn-stop {
      background: linear-gradient(135deg, #7f1d1d, #ef4444);
      color: #fff;
      box-shadow: 0 4px 14px rgba(239,68,68,0.4);
    }
    .tc-loc-status {
      background: #0f172a; border: 1px solid #1e3a5f;
      border-radius: 10px; padding: 10px 14px;
      font-size: 12px; color: #64748b;
      display: none;
    }
    .tc-loc-status.visible { display: block; }
    .tc-loc-pulse {
      display: inline-block; width: 8px; height: 8px;
      background: #22c55e; border-radius: 50%;
      animation: tcLocPulse 1.2s infinite;
      margin-right: 6px; vertical-align: middle;
    }
    @keyframes tcLocPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.7); }
    }
    .tc-loc-pinned {
      display: flex; align-items: center; gap: 12px;
      padding: 11px 14px; background: #0a1628;
      border-bottom: 2px solid #1e3a5f;
      cursor: pointer; transition: background 0.15s;
      position: relative;
    }
    .tc-loc-pinned:hover { background: #0f1f35; }
    .tc-loc-pinned-avatar {
      width: 44px; height: 44px; border-radius: 50%;
      background: linear-gradient(135deg, #166534, #22c55e);
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; flex-shrink: 0;
    }
    .tc-loc-pinned-label {
      flex: 1;
    }
    .tc-loc-pinned-label .tc-conv-name { color: #22c55e; }
    .tc-loc-pinned-label .tc-conv-preview { font-size: 11px; color: #475569; margin-top: 2px; }
    .tc-loc-pinned-badge {
      background: #22c55e; color: #000; border-radius: 8px;
      padding: 3px 8px; font-size: 10px; font-weight: 800;
      letter-spacing: 0.5px; flex-shrink: 0;
    }
  `;
  document.head.appendChild(style);

  // ─── HTML ─────────────────────────────────────────────────────────────────
  const widgetHtml = `
    <div id="tc-fab">💬<div class="fab-badge">0</div></div>
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
          <!-- Ítem fijo: Ubicación en Vivo -->
          <div class="tc-loc-pinned" id="tc-loc-pinned-item">
            <div class="tc-loc-pinned-avatar">📍</div>
            <div class="tc-loc-pinned-label">
              <div class="tc-conv-name">Ubicación en Vivo</div>
              <div class="tc-conv-preview" id="tc-loc-pinned-preview">Comparte tu ubicación con los supervisores</div>
            </div>
            <div class="tc-loc-pinned-badge" id="tc-loc-pinned-badge" style="display:none;">EN VIVO</div>
          </div>
          <div class="tc-empty">Cargando conversaciones...</div>
        </div>
      </div>

      <!-- VISTA: UBICACIÓN EN VIVO -->
      <div id="tc-view-location">
        <div class="tc-header">
          <button class="tc-icon-btn" id="tc-loc-back-btn" title="Volver">‹</button>
          <div style="font-size:22px; flex-shrink:0;">📍</div>
          <div style="flex:1">
            <div class="tc-header-name" style="color:#22c55e;">Ubicación en Vivo</div>
            <div class="tc-header-sub">Solo visible para supervisores</div>
          </div>
          <button class="tc-icon-btn" id="tc-loc-close-btn" title="Cerrar">✕</button>
        </div>
        <div class="tc-loc-body">
          <div class="tc-loc-desc">
            <strong>¿Cómo funciona?</strong><br>
            Tu ubicación se enviará directamente a la sección de <strong>Geolocalización</strong>.
            Solo los supervisores y directores con acceso a esa sección podrán verla.
            Los demás empleados <strong>no pueden</strong> ver tu ubicación.
          </div>

          <button class="tc-loc-btn tc-loc-btn-current" id="tc-send-current-loc">
            <span style="font-size:20px;">🔵</span>
            <div>
              <div>Enviar ubicación actual</div>
              <div style="font-size:11px; font-weight:400; opacity:0.8;">Exacta a 10 metros · Una sola vez</div>
            </div>
          </button>

          <button class="tc-loc-btn tc-loc-btn-live" id="tc-start-live-loc">
            <span style="font-size:20px;">🟢</span>
            <div>
              <div>Compartir en tiempo real</div>
              <div style="font-size:11px; font-weight:400; opacity:0.8;">Actualización continua mientras te mueves</div>
            </div>
          </button>

          <button class="tc-loc-btn tc-loc-btn-stop" id="tc-stop-live-loc" style="display:none;">
            <span style="font-size:20px;">🔴</span>
            <div>
              <div>Detener ubicación en vivo</div>
              <div style="font-size:11px; font-weight:400; opacity:0.8;">Dejar de compartir posición</div>
            </div>
          </button>

          <div class="tc-loc-status" id="tc-loc-status"></div>
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
          <button class="tc-icon-btn" id="tc-delete-chat-btn" title="Borrar chat" style="color:#ef4444; display:none; margin-right:20px;">🗑️</button>
          <button class="tc-icon-btn" id="tc-close-chat-btn" title="Cerrar">✕</button>
        </div>
        <div id="tc-messages">
          <div class="tc-empty">Selecciona un empleado para chatear</div>
        </div>
        <div id="tc-footer">
          <button id="tc-attach-img-btn" class="tc-icon-btn" style="font-size:18px;" title="Adjuntar imagen">📎</button>
          <input id="tc-msg-input" type="text" placeholder="Escribe un mensaje..." />
          <button id="tc-voice-note-btn" class="tc-icon-btn" style="font-size:18px;" title="Mantener presionado para grabar">🎤</button>
          <button id="tc-send-btn">➤</button>
        </div>
        <input type="file" id="tc-file-input" accept="image/*" style="display:none;" />
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
  let conversations = []; // { userId, name, lastMsg, lastTime, unreadCount }
  let currentRecipientId = null;
  let currentRecipientName = null;
  let lastMsgId = 0;
  let pollInterval = null;
  let globalUnreadCount = 0;
  let liveLocInterval = null;  // interval para ubicación en tiempo real

  // ─── ELEMENTOS ────────────────────────────────────────────────────────────
  const fab              = document.getElementById('tc-fab');
  const widget           = document.getElementById('telegram-chat-widget');
  const closeListBtn     = document.getElementById('tc-close-list-btn');
  const closeChatBtn     = document.getElementById('tc-close-chat-btn');
  const backBtn          = document.getElementById('tc-back-btn');
  const newConvBtn       = document.getElementById('tc-new-conv-btn');
  const convList         = document.getElementById('tc-conv-list');
  const searchInput      = document.getElementById('tc-search');
  const messagesDiv      = document.getElementById('tc-messages');
  const msgInput         = document.getElementById('tc-msg-input');
  const sendBtn          = document.getElementById('tc-send-btn');
  const chatName         = document.getElementById('tc-chat-name');
  const chatAvatar       = document.getElementById('tc-chat-avatar');
  const modal            = document.getElementById('tc-new-conv-modal');
  const modalClose       = document.getElementById('tc-modal-close-btn');
  const modalSearch      = document.getElementById('tc-modal-search');
  const userListModal    = document.getElementById('tc-user-list-modal');
  const deleteBtn        = document.getElementById('tc-delete-chat-btn');
  const attachImgBtn     = document.getElementById('tc-attach-img-btn');
  const voiceNoteBtn     = document.getElementById('tc-voice-note-btn');
  const fileInput        = document.getElementById('tc-file-input');
  // Ubicación en Vivo
  const locPinnedItem    = document.getElementById('tc-loc-pinned-item');
  const locPinnedPreview = document.getElementById('tc-loc-pinned-preview');
  const locPinnedBadge   = document.getElementById('tc-loc-pinned-badge');
  const locBackBtn       = document.getElementById('tc-loc-back-btn');
  const locCloseBtn      = document.getElementById('tc-loc-close-btn');
  const sendCurrentLocBtn= document.getElementById('tc-send-current-loc');
  const startLiveLocBtn  = document.getElementById('tc-start-live-loc');
  const stopLiveLocBtn   = document.getElementById('tc-stop-live-loc');
  const locStatus        = document.getElementById('tc-loc-status');

  function initials(name) {
    return name.split(' ').slice(0,2).map(p => p[0]).join('').toUpperCase();
  }

  function timeStr(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
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

  // ─── ABRIR / CERRAR ───────────────────────────────────────────────────────
  fab.onclick = () => {
    widget.classList.add('open');
    fab.style.display = 'none';
    loadUsers();
    renderConvList();
  };

  function closeWidget() {
    widget.classList.remove('open', 'in-chat', 'in-location');
    clearInterval(pollInterval);
    if (typeof inactivityTimer !== 'undefined' && inactivityTimer) clearTimeout(inactivityTimer);
    setTimeout(() => fab.style.display = 'flex', 300);
  }

  closeListBtn.onclick = closeWidget;
  closeChatBtn.onclick = closeWidget;

  backBtn.onclick = () => {
    widget.classList.remove('in-chat');
    clearInterval(pollInterval);
  };

  // ─── PANEL UBICACIÓN EN VIVO ──────────────────────────────────────────────
  function openLocationPanel() {
    widget.classList.add('in-location');
  }
  function closeLocationPanel() {
    widget.classList.remove('in-location');
  }
  locPinnedItem.onclick = openLocationPanel;
  locBackBtn.onclick    = closeLocationPanel;
  locCloseBtn.onclick   = closeWidget;

  function setLocStatus(msg, pulse) {
    locStatus.classList.add('visible');
    locStatus.innerHTML = pulse
      ? `<span class="tc-loc-pulse"></span>${msg}`
      : msg;
  }

  function setLiveUIState(isLive) {
    startLiveLocBtn.style.display = isLive ? 'none' : 'flex';
    stopLiveLocBtn.style.display  = isLive ? 'flex' : 'none';
    locPinnedBadge.style.display  = isLive ? 'inline-block' : 'none';
    locPinnedPreview.textContent  = isLive
      ? '🟢 Compartiendo en tiempo real...'
      : 'Comparte tu ubicación con los supervisores';
  }

  // Enviar ubicación actual (una sola vez)
  sendCurrentLocBtn.onclick = () => {
    if (!navigator.geolocation) {
      return setLocStatus('❌ Geolocalización no disponible en este dispositivo', false);
    }
    setLocStatus('Obteniendo posición...', true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lon, accuracy } = pos.coords;
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/location/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            lat, lon, accuracy,
            entity_id: (JSON.parse(atob(token.split('.')[1])) || {}).id,
            entity_type: 'staff'
          })
        });
        if (res.ok) {
          setLocStatus('✅ Ubicación enviada correctamente', false);
        } else {
          setLocStatus('❌ Error al enviar ubicación', false);
        }
      } catch(e) {
        setLocStatus('❌ Falló la petición', false);
      }
    }, (err) => {
      setLocStatus('❌ No se pudo obtener tu ubicación: ' + err.message, false);
    }, { enableHighAccuracy: true, timeout: 10000 });
  };

  // Compartir en tiempo real
  startLiveLocBtn.onclick = () => {
    if (!navigator.geolocation) {
      return setLocStatus('❌ Geolocalización no disponible', false);
    }
    setLocStatus('Iniciando ubicación en tiempo real...', true);
    const token = localStorage.getItem('token');

    async function sendLive(pos) {
      const { latitude: lat, longitude: lon, accuracy } = pos.coords;
      try {
        await fetch('/api/location/live', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ lat, lon, accuracy })
        });
        setLocStatus('🟢 Compartiendo ubicación en vivo... (actualiza cada 15s)', true);
      } catch(e) {}
    }

    navigator.geolocation.getCurrentPosition((pos) => {
      sendLive(pos);
      setLiveUIState(true);
      // Actualizar cada 15 segundos
      liveLocInterval = setInterval(() => {
        navigator.geolocation.getCurrentPosition(sendLive, ()=>{}, { enableHighAccuracy: true, timeout: 8000 });
      }, 15000);
    }, (err) => {
      setLocStatus('❌ No se pudo obtener tu ubicación: ' + err.message, false);
    }, { enableHighAccuracy: true, timeout: 10000 });
  };

  // Detener ubicación en vivo
  stopLiveLocBtn.onclick = async () => {
    clearInterval(liveLocInterval);
    liveLocInterval = null;
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/location/live', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch(e) {}
    setLiveUIState(false);
    setLocStatus('⏹ Ubicación en vivo detenida', false);
  };

  // ─── CARGAR USUARIOS ──────────────────────────────────────────────────────
  function loadUsers() {
    const token = localStorage.getItem('token');
    fetch('/api/chat/users', {
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    })
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
        const badgeHtml = c.unreadCount ? `<span class="unread-badge">${c.unreadCount}</span>` : '';
        const userObj = allUsers.find(u => u.id == c.userId);
        const onlineClass = (userObj && userObj.is_online) ? ' tc-online-avatar' : '';
        item.innerHTML = `
          <div class="tc-conv-avatar${onlineClass}" style="background:${getColorForEyeId(c.eyeId)}">${initials(c.name)}</div>
          <div class="tc-conv-info">
            <div class="tc-conv-name" style="color:${getColorForEyeId(c.eyeId)}">${c.name} ${badgeHtml}</div>
            <div class="tc-conv-preview">${c.lastMsg || 'Toca para chatear'}</div>
          </div>
          <div class="tc-conv-time">${c.lastTime || ''}</div>
        `;
        item.onclick = () => openChat(c.userId, c.name);
        convList.appendChild(item);
      });
    }
  }

  function getColorForEyeId(eyeId) {
    if (eyeId === 'ORO') return '#fbbf24';
    if (eyeId === 'PLATA') return '#a855f7';
    if (eyeId === 'BRONCE') return '#d97706';
    if (eyeId === 'LOGÍSTICA' || eyeId === 'LOGISTICA') return '#f8fafc';
    return '#1e40af';
  }

  function addOrUpdateConversation(userId, name, lastMsg, lastTime, eyeId, unreadCount = 0) {
    const existing = conversations.find(c => c.userId === userId);
    if (existing) {
      if (lastMsg) existing.lastMsg = lastMsg;
      if (lastTime) existing.lastTime = lastTime;
      if (eyeId) existing.eyeId = eyeId;
      existing.unreadCount = unreadCount;
    } else {
      conversations.push({ userId, name, lastMsg, lastTime, eyeId, unreadCount });
    }
  }

  searchInput.oninput = () => renderConvList();

  // ─── ABRIR CHAT ───────────────────────────────────────────────────────────
  function openChat(userId, name) {
    currentRecipientId = userId;
    currentRecipientName = name;
    chatName.textContent = name;
    chatAvatar.textContent = initials(name);
    
    const u = allUsers.find(x => x.id == userId);
    if (u) {
      chatName.style.color = getColorForEyeId(u.eye_id);
      if (u.is_online) chatAvatar.classList.add('tc-online-avatar');
      else chatAvatar.classList.remove('tc-online-avatar');
    } else {
      chatName.style.color = '#f1f5f9';
      chatAvatar.classList.remove('tc-online-avatar');
    }

    messagesDiv.innerHTML = '<div class="tc-empty">Cargando...</div>';
    widget.classList.add('in-chat');
    deleteBtn.style.display = 'block';
    
    const existing = conversations.find(c => c.userId === userId);
    if (existing) {
      existing.unreadCount = 0;
      renderConvList();
    }
    
    loadMessages();
    clearInterval(pollInterval);
    pollInterval = setInterval(loadMessages, 4000);
    msgInput.focus();
  }

  // ─── MENSAJES ─────────────────────────────────────────────────────────────
  function loadMessages() {
    if (!currentRecipientId) return;
    const token = localStorage.getItem('token');
    fetch(`/api/chat/messages?user_id=${currentRecipientId}`, {
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
    const isOut = msg.is_incoming === 0;
    const div = document.createElement('div');
    div.className = `tc-msg ${isOut ? 'tc-msg-out' : 'tc-msg-in'}`;
    const t = msg.created_at ? timeStr(msg.created_at) : '';
    
    let inner = '';
    if (msg.attachment_url) {
      if (msg.attachment_type === 'image') {
        inner += `<div style="margin-bottom:5px;"><img src="${msg.attachment_url}" style="max-width:100%; border-radius:8px; cursor:pointer;" onclick="window.open('${msg.attachment_url}')"/></div>`;
      } else if (msg.attachment_type === 'audio') {
        inner += `<div style="margin-bottom:5px;"><audio controls src="${msg.attachment_url}" style="max-width:100%; height:30px;"></audio></div>`;
      }
    }
    
    if (msg.message || msg.text) {
      inner += `<div>${msg.message || msg.text}</div>`;
    }
    if (t) {
      inner += `<div class="tc-msg-time">${t}</div>`;
    }
    
    div.innerHTML = inner;
    messagesDiv.appendChild(div);
  }

  // ─── ENVIAR ───────────────────────────────────────────────────────────────
  async function sendMessage() {
    const text = msgInput.value.trim();
    if (!text || !currentRecipientId) return;
    msgInput.value = '';

    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ recipient_id: Number(currentRecipientId), message: text })
      });
      const result = await res.json();
      if (result.success) {
        playTelegramSendSound();
        // Mostrar mensaje localmente
        if (messagesDiv.querySelector('.tc-empty')) messagesDiv.innerHTML = '';
        renderMessage({ message: text, is_incoming: 0, created_at: new Date().toISOString() });
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
      const onlineClass = u.is_online ? ' tc-online-avatar' : '';
      item.innerHTML = `
        <div class="tc-user-item-avatar${onlineClass}" style="background:${getColorForEyeId(u.eye_id)}">${initials(u.name)}</div>
        <div class="tc-user-item-name" style="color:${getColorForEyeId(u.eye_id)}">${u.name}</div>
      `;
      item.onclick = () => {
        modal.classList.remove('visible');
        addOrUpdateConversation(u.id, u.name, null, null, u.eye_id);
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
    const token = localStorage.getItem('token');
    const sse = new EventSource(`/api/chat/stream?last_id=${lastMsgId}&token=${token || ''}`);
    sse.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id > lastMsgId) {
          lastMsgId = msg.id;
          if (msg.is_incoming === 1) {
            const u = allUsers.find(x => x.id == msg.sender_id);
            const isChatOpen = currentRecipientId && String(msg.sender_id) === String(currentRecipientId);
            
            // Increment unread count if chat is not open
            let newUnreadCount = 1;
            const existing = conversations.find(c => c.userId === msg.sender_id);
            if (existing && !isChatOpen) {
              newUnreadCount = (existing.unreadCount || 0) + 1;
            } else if (isChatOpen) {
              newUnreadCount = 0;
            }
            
            addOrUpdateConversation(msg.sender_id, msg.sender_name, msg.message || 'Adjunto', timeStr(msg.created_at || new Date().toISOString()), u ? u.eye_id : null, newUnreadCount);
            renderConvList();
            
            if (!isChatOpen) {
              playTelegramReceiveSound();
              pollGlobalUnread(); // Trigger a poll to update global FAB badge
            }

            // Si la conversación está abierta, añadir el mensaje
            if (isChatOpen) {
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
  
  async function pollGlobalUnread() {
    try {
      const res = await fetch('/api/chat/conversations', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }});
      const data = await res.json();
      allUsers = data.allUsers || data.users || [];
      
      let currentUnread = 0;
      (data.users || []).forEach(u => {
        currentUnread += (u.unread_count || 0);
        if (u.unread_count > 0) {
            addOrUpdateConversation(u.id, u.name, null, null, u.eye_id, u.unread_count);
        }
      });
      
      const fabBadges = document.querySelectorAll('.fab-badge');
      fabBadges.forEach(fabBadge => {
        if (currentUnread > 0) {
          fabBadge.innerText = currentUnread;
          fabBadge.style.display = 'block';
        } else {
          fabBadge.style.display = 'none';
        }
      });
      
      if (currentUnread > globalUnreadCount) {
        if (!widget.classList.contains('open')) {
          playTelegramReceiveSound();
        }
      }
      globalUnreadCount = currentUnread;
      renderConvList();
      
    } catch(e) {}
  }

  pollGlobalUnread();
  setInterval(pollGlobalUnread, 10000);

  // ─── ACCIONES EXTRAS ─────────────────────────────────────────────────────────

  deleteBtn.onclick = async () => {
    if (!currentRecipientId) return;
    if (!confirm(`¿Estás seguro de borrar el historial con ${currentRecipientName}?`)) return;
    
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token'), 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient_id: Number(currentRecipientId) })
      });
      if (res.ok) {
        messagesDiv.innerHTML = '<div class="tc-empty">Historial borrado.</div>';
        conversations = conversations.filter(c => c.userId !== currentRecipientId);
        renderConvList();
      }
    } catch(e) {}
  };

  attachImgBtn.onclick = () => fileInput.click();
  fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    fileInput.value = '';
    await uploadAndSend(file, 'image');
  };

  let mediaRecorder;
  let audioChunks = [];

  voiceNoteBtn.onmousedown = async () => {
    if (!currentRecipientId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const file = new File([audioBlob], 'voice.webm', { type: 'audio/webm' });
        await uploadAndSend(file, 'audio');
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRecorder.start();
      voiceNoteBtn.style.color = '#ef4444'; 
    } catch(e) {}
  };

  voiceNoteBtn.onmouseup = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      voiceNoteBtn.style.color = '';
    }
  };
  voiceNoteBtn.ontouchstart = (e) => { e.preventDefault(); voiceNoteBtn.onmousedown(); };
  voiceNoteBtn.ontouchend = (e) => { e.preventDefault(); voiceNoteBtn.onmouseup(); };

  async function uploadAndSend(file, type) {
    if (!currentRecipientId) return;
    msgInput.placeholder = 'Subiendo...';
    msgInput.disabled = true;
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/chat/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') },
        body: formData
      });
      const data = await res.json();
      
      if (res.ok && data.url) {
        const payload = { message: '', attachment_url: data.url, attachment_type: type, recipient_id: Number(currentRecipientId) };
        await fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token'), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (messagesDiv.querySelector('.tc-empty')) messagesDiv.innerHTML = '';
        playTelegramSendSound();
        renderMessage({ message: '', attachment_url: data.url, attachment_type: type, is_incoming: 0, created_at: new Date().toISOString() });
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }
    } catch(e) {} finally {
      msgInput.placeholder = 'Escribe un mensaje...';
      msgInput.disabled = false;
    }
  }

  // Close chat when clicking on empty areas (non-interactive elements)
  widget.addEventListener('click', (e) => {
    const isInteractive = e.target.closest('button, input, .tc-conv-item, .tc-user-item, .tc-msg, label, audio, img');
    if (!isInteractive) {
      // Prevent closing if clicking on scrollbars
      if (e.target.clientWidth && e.offsetX > e.target.clientWidth) return;
      if (e.target.clientHeight && e.offsetY > e.target.clientHeight) return;
      closeWidget();
    }
  });



})();
