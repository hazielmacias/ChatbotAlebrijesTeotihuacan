(function() {
  'use strict';

  const AVATAR_COLORS = [
    'wa-avatar--tiliche-rosa',
    'wa-avatar--tiliche-verde',
    'wa-avatar--tiliche-azul',
    'wa-avatar--tiliche-amarillo',
    'wa-avatar--tiliche-morado',
    'wa-avatar--primary',
    'wa-avatar--info',
    'wa-avatar--success',
    'wa-avatar--warning',
    'wa-avatar--danger'
  ];

  let state = {
    conversations: [],
    filteredConversations: [],
    activeId: null,
    activeConv: null,
    messages: [],
    loading: false,
    filter: 'all',
    search: '',
    messagesLoading: false,
    sendingMessage: false,
    sendingTyping: false,
    typingTimer: null,
    pollingInterval: null,
    realtimeChannel: null,
    lastMessageTime: null
  };

  function hashColor(str) {
    if (!str) return AVATAR_COLORS[0];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  function initialsFromName(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function formatPhone(phone) {
    if (!phone) return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 12 && cleaned.startsWith('52')) {
      return '+52 ' + cleaned.substring(2, 5) + ' ' + cleaned.substring(5, 8) + ' ' + cleaned.substring(8);
    }
    if (cleaned.length === 10) {
      return cleaned.substring(0, 2) + ' ' + cleaned.substring(2, 6) + ' ' + cleaned.substring(6);
    }
    return phone;
  }

  function timeShort(date) {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) {
      return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    if (diffDays === 1) {
      return 'ayer';
    }
    if (diffDays < 7) {
      return d.toLocaleDateString('es-MX', { weekday: 'short' });
    }
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  function timeFull(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function renderShell(container) {
    container.innerHTML = `
      <div class="wa-app" id="wa-app">
        <div class="wa-conversations-panel" id="wa-conv-panel">
          <div class="wa-conv-header">
            <div class="wa-conv-header__user">
              <span class="wa-avatar wa-avatar--sm wa-avatar--primary">A</span>
              <span>${escapeHtml(window.auth.getUserDisplayName())}</span>
            </div>
            <div class="wa-conv-header__actions">
              <button class="wa-icon-btn" id="btn-refresh-conv" title="Actualizar" aria-label="Actualizar conversaciones">
                <svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
              </button>
            </div>
          </div>
          <div class="wa-search">
            <div class="wa-search__input-wrap">
              <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
              <input type="text" class="wa-search__input" id="conv-search" placeholder="Buscar contacto o mensaje" autocomplete="off">
            </div>
          </div>
          <div class="wa-conv-filters" id="conv-filters">
            <button class="wa-conv-filter wa-conv-filter--active" data-filter="all">Todos</button>
            <button class="wa-conv-filter" data-filter="active">Activos</button>
            <button class="wa-conv-filter" data-filter="closed">Cerrados</button>
            <button class="wa-conv-filter" data-filter="bot">Bot</button>
            <button class="wa-conv-filter" data-filter="human">Humano</button>
          </div>
          <div class="wa-conv-list" id="conv-list">
            <div class="loading-overlay"><div class="spinner spinner--lg"></div></div>
          </div>
        </div>

        <div class="wa-chat-panel" id="wa-chat-panel">
          <div class="wa-chat-empty" id="wa-chat-empty">
            <svg class="wa-chat-empty__icon" viewBox="0 0 303 172" fill="none">
              <path d="M229.6 96.4c0 14.4-2.8 28.4-8.2 41.3-5 12-12 22.6-20.7 31.5-8.2 8.4-18 15-29 19.5-11.6 4.8-24 7.2-36.9 7.2-12.7 0-24.8-2.3-36.1-6.9-10.7-4.3-20.4-10.4-28.9-18.2-8.4-7.8-15.1-17-19.9-27.3-5-10.7-7.6-22.3-7.6-34.4 0-13.2 2.7-26 7.9-37.8 4.9-11.3 12-21.3 20.9-29.7 8.7-8.2 18.9-14.5 30.1-18.9 11.5-4.5 23.7-6.8 36.3-6.8 12.9 0 25.3 2.4 36.9 7.2 11 4.5 20.8 11.1 29 19.5 8.7 8.9 15.7 19.5 20.7 31.5 5.4 12.9 8.2 27 8.2 41.3z" fill="#daecdc"/>
              <path d="M134.4 27.6c-50.4 0-91.3 33.5-91.3 74.8 0 41.3 40.9 74.8 91.3 74.8 50.4 0 91.3-33.5 91.3-74.8 0-41.3-40.9-74.8-91.3-74.8z" fill="#daecdc"/>
              <path d="M5 25.4c-2.7 0-4.9 2.2-4.9 4.9v94.6c0 2.7 2.2 4.9 4.9 4.9s4.9-2.2 4.9-4.9V30.3c0-2.7-2.2-4.9-4.9-4.9z" fill="#009688"/>
              <path d="M297.1 70.9L274.5 48.3c-2-2-5.1-2-7.1 0-2 2-2 5.1 0 7.1l17.7 17.7-17.7 17.7c-2 2-2 5.1 0 7.1 1 1 2.3 1.5 3.5 1.5s2.6-.5 3.5-1.5l22.6-22.6c2-2 2-5.1.1-7.1l-.1-.1z" fill="#009688"/>
            </svg>
            <h2 class="wa-chat-empty__title">Selecciona una conversacion</h2>
            <p class="wa-chat-empty__message">Elige una conversacion de la lista para ver los mensajes, responder como humano o desactivar el bot.</p>
          </div>
        </div>
      </div>
    `;

    bindEvents();
    loadConversations();
    setupRealtimeGlobal();
  }

  function bindEvents() {
    document.getElementById('btn-refresh-conv').addEventListener('click', loadConversations);
    document.getElementById('conv-search').addEventListener('input', (e) => {
      state.search = e.target.value;
      applyFilters();
    });

    document.getElementById('conv-filters').addEventListener('click', (e) => {
      const btn = e.target.closest('.wa-conv-filter');
      if (!btn) return;
      document.querySelectorAll('.wa-conv-filter').forEach(f => f.classList.remove('wa-conv-filter--active'));
      btn.classList.add('wa-conv-filter--active');
      state.filter = btn.dataset.filter;
      applyFilters();
    });
  }

  async function loadConversations() {
    state.loading = true;
    const listEl = document.getElementById('conv-list');
    if (listEl) {
      listEl.innerHTML = '<div class="loading-overlay"><div class="spinner"></div></div>';
    }

    const result = await window.api.listConversations({ limit: 100 });
    if (!result.ok) {
      if (listEl) {
        listEl.innerHTML = '<div class="empty-state"><p class="empty-state__message">Error al cargar conversaciones</p></div>';
      }
      state.loading = false;
      return;
    }

    state.conversations = result.data.conversations || [];
    state.loading = false;
    applyFilters();
  }

  function applyFilters() {
    let list = [...state.conversations];

    if (state.filter === 'active') list = list.filter(c => c.status === 'active');
    else if (state.filter === 'closed') list = list.filter(c => c.status === 'closed');
    else if (state.filter === 'bot') list = list.filter(c => c.bot_active);
    else if (state.filter === 'human') list = list.filter(c => !c.bot_active);

    if (state.search) {
      const term = state.search.toLowerCase();
      list = list.filter(c => {
        const name = c.contact?.name || c.phone || '';
        const preview = c.last_message?.preview || '';
        return name.toLowerCase().includes(term) || preview.toLowerCase().includes(term);
      });
    }

    list.sort((a, b) => {
      const ta = new Date(a.last_message?.created_at || a.updated_at || a.created_at).getTime();
      const tb = new Date(b.last_message?.created_at || b.updated_at || b.created_at).getTime();
      return tb - ta;
    });

    state.filteredConversations = list;
    renderConvList();
  }

  function renderConvList() {
    const listEl = document.getElementById('conv-list');
    if (!listEl) return;

    if (state.filteredConversations.length === 0) {
      listEl.innerHTML = `
        <div class="wa-conv-empty">
          <svg class="wa-conv-empty__icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
          </svg>
          <h3 class="wa-conv-empty__title">Sin conversaciones</h3>
          <p class="wa-conv-empty__message">No se encontraron conversaciones con los filtros actuales.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = state.filteredConversations.map(conv => {
      const name = conv.contact?.name || formatPhone(conv.phone) || 'Sin nombre';
      const preview = conv.last_message?.preview || 'Sin mensajes aun';
      const direction = conv.last_message?.direction;
      const sentBy = conv.last_message?.sent_by;
      const time = timeShort(conv.last_message?.created_at || conv.updated_at);
      const initials = initialsFromName(name);
      const color = hashColor(conv.phone);
      const isActive = state.activeId === conv.id;
      const isBot = conv.bot_active;
      const isUnread = conv.unread_count > 0;

      let prefix = '';
      if (direction === 'outbound') {
        if (sentBy === 'human') prefix = '<span class="wa-conv-item__preview-prefix">Tu: </span>';
        else prefix = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>';
      }

      return `
        <div class="wa-conv-item ${isActive ? 'wa-conv-item--active' : ''}" data-id="${conv.id}">
          <div class="wa-avatar ${color}">${escapeHtml(initials)}</div>
          <div class="wa-conv-item__content">
            <div class="wa-conv-item__top">
              <span class="wa-conv-item__name">${escapeHtml(name)}</span>
              <span class="wa-conv-item__time ${isUnread ? 'wa-conv-item__time--unread' : ''}">${escapeHtml(time)}</span>
            </div>
            <div class="wa-conv-item__bottom">
              <div class="wa-conv-item__preview">${prefix}<span>${escapeHtml(preview)}</span></div>
              <div class="wa-conv-item__badges">
                ${isBot
                  ? '<span class="wa-conv-item__badge-bot">Bot</span>'
                  : '<span class="wa-conv-item__badge-human">Humano</span>'}
                ${isUnread ? `<span class="wa-conv-item__unread">${conv.unread_count}</span>` : ''}
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.wa-conv-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        selectConversation(id);
      });
    });
  }

  async function selectConversation(id) {
    state.activeId = id;
    state.activeConv = state.conversations.find(c => c.id === id) || null;
    state.messages = [];

    document.querySelectorAll('.wa-conv-item').forEach(el => {
      el.classList.toggle('wa-conv-item--active', el.dataset.id === id);
    });

    document.getElementById('wa-app').classList.add('wa-app--mobile-chat-open');

    renderChatPanel();
    await loadMessages(id);
  }

  function renderChatPanel() {
    const panel = document.getElementById('wa-chat-panel');
    if (!panel || !state.activeConv) return;

    const conv = state.activeConv;
    const name = conv.contact?.name || formatPhone(conv.phone) || 'Sin nombre';
    const phone = formatPhone(conv.phone);
    const isBot = conv.bot_active;

    panel.innerHTML = `
      <header class="wa-chat-header">
        <button class="wa-chat-header__back" id="btn-back-conv" title="Volver" aria-label="Volver a conversaciones">
          <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <div class="wa-avatar ${hashColor(conv.phone)}">${escapeHtml(initialsFromName(name))}</div>
        <div class="wa-chat-header__info">
          <div class="wa-chat-header__name">${escapeHtml(name)}</div>
          <div class="wa-chat-header__status">${escapeHtml(phone)}</div>
        </div>
        <div class="wa-chat-header__actions">
          <button class="wa-chat-bot-toggle ${isBot ? 'wa-chat-bot-toggle--on' : 'wa-chat-bot-toggle--off'}" id="btn-toggle-bot" data-id="${conv.id}">
            <span class="wa-chat-bot-toggle__dot"></span>
            ${isBot ? 'Bot activo' : 'Tomado por humano'}
          </button>
        </div>
      </header>

      ${!isBot ? `
        <div class="wa-chat-banner">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
          Conversacion tomada por un agente humano. El bot no respondera hasta que se reactive.
        </div>
      ` : ''}

      <div class="wa-chat-body" id="wa-chat-body">
        <div class="loading-overlay"><div class="spinner"></div></div>
      </div>

      <div class="wa-chat-input ${!isBot ? 'wa-chat-input--disabled' : ''}" id="wa-chat-input">
        <form class="wa-chat-input__form" id="msg-form">
          <textarea
            class="wa-chat-input__field"
            id="msg-input"
            placeholder="${!isBot ? 'Activa el bot para enviar mensajes' : 'Escribe un mensaje'}"
            rows="1"
            ${!isBot ? 'disabled' : ''}
          ></textarea>
        </form>
        <button class="wa-chat-input__send" id="msg-send" type="button" ${!isBot ? 'disabled' : ''} aria-label="Enviar mensaje">
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    `;

    document.getElementById('btn-back-conv').addEventListener('click', () => {
      state.activeId = null;
      state.activeConv = null;
      document.getElementById('wa-app').classList.remove('wa-app--mobile-chat-open');
      renderChatPanel();
    });

    const toggleBtn = document.getElementById('btn-toggle-bot');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => toggleBot(conv.id));
    }

    const sendBtn = document.getElementById('msg-send');
    const inputField = document.getElementById('msg-input');
    const form = document.getElementById('msg-form');

    if (isBot && sendBtn && inputField) {
      sendBtn.addEventListener('click', sendMessage);
      inputField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
      inputField.addEventListener('input', autoResize);
    }
  }

  function autoResize(e) {
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  async function loadMessages(id) {
    state.messagesLoading = true;
    const result = await window.api.listMessages(id, { limit: 200 });
    state.messagesLoading = false;

    if (!result.ok) {
      window.toast.error('Error al cargar mensajes');
      return;
    }

    state.messages = result.data.messages || [];
    renderMessages();
  }

  function renderMessages() {
    const body = document.getElementById('wa-chat-body');
    if (!body) return;

    if (state.messages.length === 0) {
      body.innerHTML = '<div class="empty-state" style="margin-top:80px"><h3 class="empty-state__title">Sin mensajes</h3><p class="empty-state__message">Aun no hay mensajes en esta conversacion.</p></div>';
      return;
    }

    const html = [];
    let currentDay = '';
    let currentGroup = null;
    let currentAuthor = null;

    for (const msg of state.messages) {
      const msgDate = new Date(msg.created_at);
      const day = msgDate.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
      if (day !== currentDay) {
        if (currentGroup) {
          html.push('</div>');
          currentGroup = null;
        }
        html.push(`<div class="wa-msg-day-separator"><span class="wa-msg-day-separator__pill">${escapeHtml(day)}</span></div>`);
        currentDay = day;
        currentAuthor = null;
      }

      const isOut = msg.direction === 'outbound';
      const author = isOut ? (msg.sent_by === 'human' ? 'Tu' : 'Bot') : (msg.contact?.name || 'Contacto');
      const startNewGroup = author !== currentAuthor;
      if (startNewGroup) {
        if (currentGroup) html.push('</div>');
        html.push('<div class="wa-msg-group">');
        currentGroup = author;
      }

      const time = msgDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
      const isError = msg.is_error || msg.metadata?.send_error;

      let content = '';
      if (msg.type === 'image' && msg.metadata?.image_url) {
        content = `<div class="wa-msg__text wa-msg__text--image"><img class="wa-msg__image" src="${escapeHtml(msg.metadata.image_url)}" alt="Imagen" data-image="${escapeHtml(msg.metadata.image_url)}"></div>`;
      } else {
        content = `<div class="wa-msg__text">${escapeHtml(msg.content || '')}</div>`;
      }

      const statusIcon = isOut
        ? '<svg class="wa-msg__status--read" viewBox="0 0 18 18"><path d="M17.4 4.2L7.6 14L4.2 10.6L5.2 9.6L7.6 12L16.4 3.2L17.4 4.2Z"/><path d="M13.4 4.2L7.6 10L6.6 9L12.4 3.2L13.4 4.2Z"/></svg>'
        : '';

      html.push(`
        <div class="wa-msg wa-msg--${isOut ? 'out' : 'in'} ${isError ? 'wa-msg--error' : ''}" data-id="${msg.id}">
          <div class="wa-msg__bubble">
            <span class="wa-msg__author">${escapeHtml(author)}</span>
            ${content}
            <div class="wa-msg__meta">
              ${isError ? '<span class="wa-msg__error-badge">No enviado</span>' : ''}
              <span>${time}</span>
              ${statusIcon}
            </div>
          </div>
        </div>
      `);

      currentAuthor = author;
    }

    if (currentGroup) html.push('</div>');

    body.innerHTML = html.join('');

    body.querySelectorAll('.wa-msg__image').forEach(img => {
      img.addEventListener('click', () => {
        const url = img.dataset.image;
        const modal = document.createElement('div');
        modal.className = 'wa-chat-image-modal';
        modal.innerHTML = `<img src="${escapeHtml(url)}" alt="Imagen">`;
        modal.addEventListener('click', () => modal.remove());
        document.body.appendChild(modal);
      });
    });

    body.scrollTop = body.scrollHeight;
  }

  async function sendMessage() {
    const inputField = document.getElementById('msg-input');
    const sendBtn = document.getElementById('msg-send');
    if (!inputField || state.sendingMessage) return;

    const text = inputField.value.trim();
    if (!text) return;
    if (!state.activeConv || state.activeConv.bot_active) {
      window.toast.warning('Desactiva el bot para enviar mensajes como humano');
      return;
    }

    state.sendingMessage = true;
    sendBtn.disabled = true;
    inputField.disabled = true;

    const tempId = 'tmp-' + Date.now();
    const optimisticMsg = {
      id: tempId,
      conversation_id: state.activeConv.id,
      direction: 'outbound',
      content: text,
      type: 'text',
      sent_by: 'human',
      created_at: new Date().toISOString(),
      is_pending: true
    };
    state.messages.push(optimisticMsg);
    renderMessages();
    inputField.value = '';
    inputField.style.height = 'auto';

    const result = await window.api.sendMessage(state.activeConv.id, text);

    state.sendingMessage = false;
    sendBtn.disabled = false;
    inputField.disabled = false;

    if (!result.ok) {
      const idx = state.messages.findIndex(m => m.id === tempId);
      if (idx >= 0) {
        state.messages[idx].is_error = true;
        state.messages[idx].error_msg = result.error;
      }
      renderMessages();
      window.toast.error('Error al enviar: ' + (result.error || 'desconocido'));
      return;
    }

    const idx = state.messages.findIndex(m => m.id === tempId);
    if (idx >= 0) {
      state.messages[idx] = {
        ...result.data.message,
        sent_by: 'human',
        direction: 'outbound'
      };
    }
    renderMessages();
    await loadConversations();
  }

  async function toggleBot(conversationId) {
    const conv = state.conversations.find(c => c.id === conversationId);
    if (!conv) return;

    const newVal = !conv.bot_active;
    const result = await window.api.toggleBot(conversationId, newVal);

    if (!result.ok) {
      window.toast.error('Error al cambiar el bot: ' + (result.error || 'desconocido'));
      return;
    }

    conv.bot_active = newVal;
    if (result.data.conversation) {
      Object.assign(conv, result.data.conversation);
    }
    window.toast.success(newVal ? 'Bot reactivado' : 'Bot desactivado - ahora tu respondes');
    renderChatPanel();
    applyFilters();
  }

  // Realtime via polling (lightweight, no Supabase key needed client-side)
  let pollingInterval = null;
  function setupRealtimeGlobal() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(async () => {
      if (state.activeId && state.activeConv) {
        const result = await window.api.listMessages(state.activeId, { limit: 200 });
        if (result.ok) {
          const newMsgs = result.data.messages || [];
          // Detect new messages
          const lastKnown = state.messages[state.messages.length - 1];
          if (!lastKnown || new Date(newMsgs[newMsgs.length - 1]?.created_at) > new Date(lastKnown.created_at)) {
            state.messages = newMsgs;
            renderMessages();
          }
        }
      }
      // Refresh conversation list to update last_message
      const convResult = await window.api.listConversations({ limit: 100 });
      if (convResult.ok) {
        state.conversations = convResult.data.conversations || [];
        applyFilters();
      }
    }, 5000);
  }

  function cleanup() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
    state.activeId = null;
    state.activeConv = null;
    state.messages = [];
  }

  window.conversationsView = {
    render: renderShell,
    cleanup
  };
})();
