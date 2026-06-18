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

  function syncActiveConv() {
    if (!state.activeId) return;
    const fresh = state.conversations.find(c => c.id === state.activeId);
    if (fresh) state.activeConv = fresh;
  }

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

  function showBotTyping() {
    const body = document.getElementById('wa-chat-body');
    if (!body) return;
    if (document.getElementById('wa-typing-indicator')) return;
    const el = document.createElement('div');
    el.id = 'wa-typing-indicator';
    el.className = 'wa-typing';
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
      <span class="wa-typing__label">Bot esta escribiendo</span>
      <div class="wa-typing__dots">
        <span class="wa-typing__dot"></span>
        <span class="wa-typing__dot"></span>
        <span class="wa-typing__dot"></span>
      </div>
    `;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
  }

  function hideBotTyping() {
    const el = document.getElementById('wa-typing-indicator');
    if (el) el.remove();
  }

  function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function formatWhatsAppText(text) {
    if (text == null) return '';
    let s = escapeHtml(String(text));

    const stash = [];
    const placeholder = (i) => `\u0001WAFMT${i}\u0001`;

    // Bloques de codigo (```...```) — pueden cruzar lineas
    s = s.replace(/```([\s\S]+?)```/g, (m, code) => {
      const clean = code.replace(/^\n+|\n+$/g, '');
      stash.push(`<pre class="wa-msg__code-block"><code>${clean}</code></pre>`);
      return placeholder(stash.length - 1);
    });

    // Codigo en linea (`...`) — una sola linea
    s = s.replace(/`([^`\n]+)`/g, (m, code) => {
      stash.push(`<code class="wa-msg__code">${code}</code>`);
      return placeholder(stash.length - 1);
    });

    // Cursiva (_..._) — antes que bold/strike para anidamiento.
    // (?<!_)/(?!_) evitan __hola__. La regla de "sin espacios" de
    // WhatsApp aplica solo DENTRO de los marcadores (?=\S)(?<=\S),
    // no afuera (un * puede ir precedido/seguido de espacio).
    s = s.replace(/(?<!_)_(?=\S)([^_\n]+?)(?<=\S)_(?!_)/g, '<em>$1</em>');

    // Negrita (*...*)
    s = s.replace(/(?<!\*)\*(?=\S)([^*\n]+?)(?<=\S)\*(?!\*)/g, '<strong>$1</strong>');

    // Tachado (~...~)
    s = s.replace(/(?<!~)~(?=\S)([^~\n]+?)(?<=\S)~(?!~)/g, '<del>$1</del>');

    // Restaurar placeholders de codigo
    s = s.replace(/\u0001WAFMT(\d+)\u0001/g, (m, i) => stash[Number(i)]);

    return s;
  }

  function renderShell(container) {
    container.innerHTML = `
      <div class="wa-app" id="wa-app">
        <div class="wa-conversations-panel" id="wa-conv-panel">
          <div class="wa-conv-header">
            <div class="wa-conv-header__user">
              <span class="wa-avatar wa-avatar--sm wa-avatar--header" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v2h20v-2c0-3.33-6.67-5-10-5z"/></svg>
              </span>
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
            <button class="wa-conv-filter" data-filter="bot" type="button">
              <span class="wa-conv-filter__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 2h-11A4.5 4.5 0 0 0 2 6.5v11A4.5 4.5 0 0 0 6.5 22h11a4.5 4.5 0 0 0 4.5-4.5v-11A4.5 4.5 0 0 0 17.5 2zM7 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm10 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm-5 7c-2.5 0-4.71-1.28-6-3.22.16-.1.33-.18.5-.25.6-.25 1.27-.4 2-.4h7c.73 0 1.4.15 2 .4.17.07.34.15.5.25C16.71 17.72 14.5 19 12 19z"/></svg>
              </span>
              <span class="wa-conv-filter__label">Bot</span>
            </button>
            <button class="wa-conv-filter" data-filter="human" type="button">
              <span class="wa-conv-filter__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v2h20v-2c0-3.33-6.67-5-10-5z"/></svg>
              </span>
              <span class="wa-conv-filter__label">Humano</span>
            </button>
          </div>
          <div class="wa-conv-list" id="conv-list"></div>
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
    updateNavUnreadBadge();
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
      const value = btn.dataset.filter;
      if (state.filter === value) {
        state.filter = 'all';
        btn.classList.remove('wa-conv-filter--active');
      } else {
        document.querySelectorAll('.wa-conv-filter').forEach(f => f.classList.remove('wa-conv-filter--active'));
        btn.classList.add('wa-conv-filter--active');
        state.filter = value;
      }
      applyFilters();
    });
  }

  async function loadConversations() {
    state.loading = true;
    const listEl = document.getElementById('conv-list');
    let loader = null;
    if (listEl) {
      const existingLoader = listEl.querySelector('.loading-overlay');
      if (existingLoader) existingLoader.remove();
      const hasItems = listEl.querySelector('.wa-conv-item');
      if (!hasItems) {
        loader = window.withDelayedLoader(listEl);
      }
    }

    const result = await window.api.listConversations({ limit: 100 });
    if (loader) loader.hide();
    if (!result.ok) {
      if (listEl) {
        listEl.innerHTML = '<div class="empty-state"><p class="empty-state__message">Error al cargar conversaciones</p></div>';
      }
      state.loading = false;
      return;
    }

    state.conversations = result.data.conversations || [];
    syncActiveConv();
    state.loading = false;
    applyFilters();
  }

  function applyFilters() {
    let list = [...state.conversations];

    if (state.filter === 'bot') list = list.filter(c => c.bot_active);
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

    const waApp = document.getElementById('wa-app');
    if (waApp) waApp.classList.add('wa-app--mobile-chat-open');

    markConvAsRead(id);
    renderChatPanel();
    await loadMessages(id);
    subscribeToActiveConversation();
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
          <button class="wa-icon-btn wa-chat-header__archive" id="btn-archive-conv" title="Archivar conversacion" aria-label="Archivar conversacion">
            <svg viewBox="0 0 24 24"><path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/></svg>
          </button>
          <label class="wa-chat-bot-control ${isBot ? 'wa-chat-bot-control--on' : 'wa-chat-bot-control--off'}" id="bot-control-wrap" title="Click para ${isBot ? 'desactivar el bot y responder manualmente' : 'reactivar el bot'}">
            <span class="wa-switch">
              <input type="checkbox" class="wa-switch__input" id="btn-toggle-bot" data-id="${conv.id}" ${isBot ? 'checked' : ''} aria-label="${isBot ? 'Desactivar bot' : 'Activar bot'}">
              <span class="wa-switch__slider"></span>
            </span>
          </label>
        </div>
      </header>

      ${!isBot ? `
        <div class="wa-chat-banner">
          <span class="wa-chat-banner__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </span>
          <span class="wa-chat-banner__text">El Bot no respondera hasta que se reactive.</span>
        </div>
      ` : ''}

      <div class="wa-chat-body" id="wa-chat-body">
        <div class="loading-overlay" role="status" aria-label="Cargando"><div class="brand-loader"><img class="brand-loader__logo" src="/logo-alebrijes.png" alt=""></div></div>
      </div>

      <div class="wa-chat-input ${isBot ? 'wa-chat-input--disabled' : ''}" id="wa-chat-input">
        <form class="wa-chat-input__form" id="msg-form">
          <textarea
            class="wa-chat-input__field"
            id="msg-input"
            placeholder="${isBot ? 'Activa el bot para enviar mensajes' : 'Escribe un mensaje'}"
            rows="1"
            ${isBot ? 'disabled' : ''}
          ></textarea>
        </form>
        <button class="wa-chat-input__send" id="msg-send" type="button" ${isBot ? 'disabled' : ''} aria-label="Enviar mensaje">
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
      toggleBtn.addEventListener('change', () => toggleBot(conv.id));
    }

    const archiveBtn = document.getElementById('btn-archive-conv');
    if (archiveBtn) {
      archiveBtn.addEventListener('click', () => archiveCurrentConversation());
    }

    const sendBtn = document.getElementById('msg-send');
    const inputField = document.getElementById('msg-input');
    const form = document.getElementById('msg-form');

    if (sendBtn && inputField) {
      sendBtn.addEventListener('click', sendMessage);
      inputField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
      inputField.addEventListener('input', autoResize);

      let userTypingTimer = null;
      const userTypingEl = document.createElement('div');
      userTypingEl.className = 'wa-typing wa-typing--self';
      userTypingEl.style.display = 'none';
      userTypingEl.innerHTML = `
        <div class="wa-typing__dots">
          <span class="wa-typing__dot"></span>
          <span class="wa-typing__dot"></span>
          <span class="wa-typing__dot"></span>
        </div>
        <span class="wa-typing__label">Escribiendo...</span>
      `;
      const header = panel.querySelector('.wa-chat-header__status');
      if (header) header.appendChild(userTypingEl);

      inputField.addEventListener('input', () => {
        if (inputField.value.trim().length > 0) {
          userTypingEl.style.display = 'inline-flex';
        } else {
          userTypingEl.style.display = 'none';
        }
        if (userTypingTimer) clearTimeout(userTypingTimer);
        userTypingTimer = setTimeout(() => {
          userTypingEl.style.display = 'none';
        }, 2000);
      });
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
      let author;
      if (isOut) {
        if (msg.sent_by === 'human') {
          author = msg.sent_by_name || msg.metadata?.sent_by_user_name || window.auth.getUserDisplayName() || 'Tu';
        } else {
          author = 'Bot';
        }
      } else {
        author = (msg.contact && msg.contact.name) || 'Contacto';
      }
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
        content = `<div class="wa-msg__text">${formatWhatsAppText(msg.content || '')}</div>`;
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
    const currentUserName = window.auth.getUserDisplayName();
    const optimisticMsg = {
      id: tempId,
      conversation_id: state.activeConv.id,
      direction: 'outbound',
      content: text,
      type: 'text',
      sent_by: 'human',
      sent_by_name: currentUserName,
      metadata: {
        sent_by_user_name: currentUserName,
        source: 'dashboard'
      },
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

    const previousVal = conv.bot_active;
    const newVal = !previousVal;

    updateToggleVisuals(conversationId, newVal);
    updateChatInputForBot(newVal);
    updateManualBanner(newVal);
    conv.bot_active = newVal;
    if (state.activeConv && state.activeConv.id === conversationId) {
      state.activeConv.bot_active = newVal;
    }

    const result = await window.api.toggleBot(conversationId, newVal);

    if (!result.ok) {
      updateToggleVisuals(conversationId, previousVal);
      updateChatInputForBot(previousVal);
      updateManualBanner(previousVal);
      conv.bot_active = previousVal;
      if (state.activeConv && state.activeConv.id === conversationId) {
        state.activeConv.bot_active = previousVal;
      }
      window.toast.error('Error al cambiar el bot: ' + (result.error || 'desconocido'));
      return;
    }

    if (result.data.conversation) {
      Object.assign(conv, result.data.conversation);
    }

    applyFilters();
  }

  function updateToggleVisuals(conversationId, isBot) {
    const wrap = document.getElementById('bot-control-wrap');
    const checkbox = document.getElementById('btn-toggle-bot');
    if (wrap) {
      wrap.classList.toggle('wa-chat-bot-control--on', isBot);
      wrap.classList.toggle('wa-chat-bot-control--off', !isBot);
      wrap.title = isBot
        ? 'Click para desactivar el bot y responder manualmente'
        : 'Click para reactivar el bot';
    }
    if (checkbox) {
      checkbox.checked = isBot;
      checkbox.setAttribute('aria-label', isBot ? 'Desactivar bot' : 'Activar bot');
    }
  }

  function updateChatInputForBot(isBot) {
    const inputWrap = document.getElementById('wa-chat-input');
    const inputField = document.getElementById('msg-input');
    const sendBtn = document.getElementById('msg-send');
    if (inputWrap) {
      inputWrap.classList.toggle('wa-chat-input--disabled', isBot);
    }
    if (inputField) {
      inputField.disabled = isBot;
      inputField.placeholder = isBot ? 'Activa el bot para enviar mensajes' : 'Escribe un mensaje';
    }
    if (sendBtn) {
      sendBtn.disabled = isBot;
    }
  }

  function updateManualBanner(isBot) {
    const panel = document.getElementById('wa-chat-panel');
    if (!panel) return;
    const existing = panel.querySelector('.wa-chat-banner');
    if (isBot) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;
    const header = panel.querySelector('.wa-chat-header');
    if (!header) return;
    const banner = document.createElement('div');
    banner.className = 'wa-chat-banner';
    banner.innerHTML = `
      <span class="wa-chat-banner__icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </span>
      <span class="wa-chat-banner__text">El Bot no respondera hasta que se.reactive.</span>
    `;
    header.insertAdjacentElement('afterend', banner);
  }

  async function archiveCurrentConversation() {
    if (!state.activeConv) return;
    const conv = state.activeConv;
    const name = conv.contact?.name || formatPhone(conv.phone) || 'este contacto';
    const ok = await window.modal.confirm({
      title: 'Archivar conversacion',
      message: 'Archivar la conversacion con ' + name + '.\nDejara de aparecer en Conversaciones y podras restaurarla desde Archivados.',
      type: 'warning',
      confirmText: 'Archivar'
    });
    if (!ok) return;

    const result = await window.api.archiveConversation(conv.id, true);
    if (!result.ok) {
      window.toast.error('Error al archivar: ' + (result.error || 'desconocido'));
      return;
    }

    window.toast.success('Conversacion archivada');
    state.conversations = state.conversations.filter(c => c.id !== conv.id);
    state.activeId = null;
    state.activeConv = null;
    state.messages = [];
    const waApp = document.getElementById('wa-app');
    if (waApp) waApp.classList.remove('wa-app--mobile-chat-open');
    applyFilters();
    renderChatPanel();
  }

  // Realtime via Supabase (mejor que polling: <500ms latency)
  let conversationsChannel = null;
  let messagesChannel = null;
  let messagesListChannel = null;
  let fallbackPolling = null;

  function markConvAsRead(convId) {
    const conv = state.conversations.find(c => c.id === convId);
    if (conv && conv.unread_count > 0) {
      conv.unread_count = 0;
      applyFilters();
      updateNavUnreadBadge();
    }
  }

  function getTotalUnread() {
    return state.conversations.reduce((acc, c) => acc + (c.unread_count || 0), 0);
  }

  function updateNavUnreadBadge() {
    const link = document.querySelector('.app-nav__link[data-route="conversations"]');
    if (!link) return;
    let badge = link.querySelector('.app-nav__badge');
    const total = getTotalUnread();
    if (total > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'app-nav__badge';
        const label = link.querySelector('span:not(.app-nav__badge)');
        link.appendChild(badge);
      }
      badge.textContent = total > 99 ? '99+' : String(total);
    } else if (badge) {
      badge.remove();
    }
  }

  function applyIncrementalConvUpdate(convId, patch) {
    const idx = state.conversations.findIndex(c => c.id === convId);
    if (idx < 0) return false;
    Object.assign(state.conversations[idx], patch);
    return true;
  }

  function applyNewMessageToConvList(newMsg) {
    if (!newMsg || !newMsg.conversation_id) return;

    const idx = state.conversations.findIndex(c => c.id === newMsg.conversation_id);
    const preview = (newMsg.content || '').substring(0, 80).replace(/\n/g, ' ');

    const lastMsgPatch = {
      last_message: {
        content: newMsg.content,
        direction: newMsg.direction,
        type: newMsg.type,
        sent_by: newMsg.sent_by,
        created_at: newMsg.created_at,
        preview: preview
      },
      updated_at: newMsg.created_at
    };

    if (idx >= 0) {
      const conv = state.conversations[idx];
      const isActive = state.activeId === newMsg.conversation_id;
      const isInbound = newMsg.direction === 'inbound';
      const fromContact = isInbound && newMsg.sent_by === 'contact';

      Object.assign(conv, lastMsgPatch);

      if (fromContact && !isActive) {
        conv.unread_count = (conv.unread_count || 0) + 1;
      }

      applyFilters();
      updateNavUnreadBadge();
    } else {
      loadConversations();
    }
  }

  function setupRealtimeGlobal() {
    if (!window.supabaseClient) return;

    if (!window.supabaseClient.isReady()) {
      console.warn('[conversations] Supabase no disponible, usando polling');
      setupPollingFallback();
      return;
    }

    if (fallbackPolling) {
      clearInterval(fallbackPolling);
      fallbackPolling = null;
    }

    try {
      conversationsChannel = window.supabaseClient.subscribeToConversations((payload) => {
        if (!payload || !payload.new) return;
        if (payload.eventType === 'UPDATE') {
          const u = payload.new;
          if (u.archived_at) {
            const idx = state.conversations.findIndex(c => c.id === u.id);
            if (idx >= 0) {
              state.conversations.splice(idx, 1);
              if (state.activeId === u.id) {
                state.activeId = null;
                state.activeConv = null;
                state.messages = [];
                const waApp = document.getElementById('wa-app');
                if (waApp) waApp.classList.remove('wa-app--mobile-chat-open');
                renderChatPanel();
              }
              applyFilters();
              updateNavUnreadBadge();
            }
            return;
          }
          const updated = applyIncrementalConvUpdate(u.id, {
            status: u.status,
            bot_active: u.bot_active,
            current_flow: u.current_flow,
            current_step: u.current_step,
            updated_at: u.updated_at
          });
          if (!updated) {
            loadConversations();
          } else {
            applyFilters();
          }
        } else if (payload.eventType === 'INSERT') {
          loadConversations();
        }
      });
    } catch (e) {
      console.error('[conversations] Error subscribiendo a conversations:', e);
      setupPollingFallback();
    }

    if (typeof window.supabaseClient.subscribeToAllMessages === 'function') {
      try {
        messagesListChannel = window.supabaseClient.subscribeToAllMessages((newMsg) => {
          applyNewMessageToConvList(newMsg);
        });
      } catch (e) {
        console.error('[conversations] Error subscribiendo a all-messages:', e);
      }
    }
  }

  function setupPollingFallback() {
    if (fallbackPolling) return;
    fallbackPolling = setInterval(async () => {
      if (state.activeId) {
        const result = await window.api.listMessages(state.activeId, { limit: 200 });
        if (result.ok) {
          const newMsgs = result.data.messages || [];
          const lastKnown = state.messages[state.messages.length - 1];
          if (!lastKnown || new Date(newMsgs[newMsgs.length - 1]?.created_at) > new Date(lastKnown.created_at)) {
            state.messages = newMsgs;
            renderMessages();
          }
        }
      }
      const convResult = await window.api.listConversations({ limit: 100 });
      if (convResult.ok) {
        state.conversations = convResult.data.conversations || [];
        syncActiveConv();
        applyFilters();
      }
    }, 5000);
  }

  function subscribeToActiveConversation() {
    if (!state.activeId || !window.supabaseClient) return;

    // Limpiar suscripcion anterior
    if (messagesChannel) {
      window.supabaseClient.unsubscribe(messagesChannel);
      messagesChannel = null;
    }

    if (!window.supabaseClient.isReady()) return;

    try {
      messagesChannel = window.supabaseClient.subscribeToMessages(state.activeId, (newMsg) => {
        const exists = state.messages.find(m => m.id === newMsg.id);
        if (exists) return;

        if (newMsg.direction === 'inbound' && state.activeConv && state.activeConv.bot_active) {
          showBotTyping();
        }

        state.messages.push(newMsg);
        renderMessages();
        const body = document.getElementById('wa-chat-body');
        if (body) body.scrollTop = body.scrollHeight;

        if (newMsg.direction === 'outbound' && newMsg.sent_by === 'bot') {
          hideBotTyping();
        }
      });

      // Safety: si el bot no responde en 30s, ocultar el typing
      setTimeout(() => {
        if (!document.getElementById('wa-typing-indicator')) return;
        const lastMsg = state.messages[state.messages.length - 1];
        if (lastMsg && lastMsg.direction === 'inbound') {
          hideBotTyping();
        }
      }, 30000);
    } catch (e) {
      console.error('[conversations] Error subscribiendo a messages:', e);
    }
  }

  function cleanup() {
    if (conversationsChannel && window.supabaseClient) {
      window.supabaseClient.unsubscribe(conversationsChannel);
      conversationsChannel = null;
    }
    if (messagesChannel && window.supabaseClient) {
      window.supabaseClient.unsubscribe(messagesChannel);
      messagesChannel = null;
    }
    if (messagesListChannel && window.supabaseClient) {
      window.supabaseClient.unsubscribe(messagesListChannel);
      messagesListChannel = null;
    }
    if (fallbackPolling) {
      clearInterval(fallbackPolling);
      fallbackPolling = null;
    }
    state.activeId = null;
    state.activeConv = null;
    state.messages = [];
  }

  function selectById(id) {
    if (!id) return;
    const conv = state.conversations.find(c => c.id === id);
    if (!conv) {
      // Si no esta en cache, cargar y luego seleccionar
      window.api.listConversations({ limit: 100 }).then(r => {
        if (r.ok) {
          state.conversations = r.data.conversations || [];
          applyFilters();
          doSelect(id);
        }
      });
    } else {
      doSelect(id);
    }
  }

  function doSelect(id) {
    // Si la vista aun no esta renderizada, esperar
    if (!document.getElementById('wa-app')) {
      const checkInterval = setInterval(() => {
        if (document.getElementById('wa-app')) {
          clearInterval(checkInterval);
          doSelect(id);
        }
      }, 100);
      setTimeout(() => clearInterval(checkInterval), 3000);
      return;
    }
    selectConversation(id);
  }

  window.conversationsView = {
    render: renderShell,
    cleanup,
    selectById
  };
})();
