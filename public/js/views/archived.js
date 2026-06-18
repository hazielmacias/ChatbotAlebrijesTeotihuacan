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
    loading: false,
    search: '',
    channel: null
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
    if (diffDays === 1) return 'ayer';
    if (diffDays < 7) {
      return d.toLocaleDateString('es-MX', { weekday: 'short' });
    }
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  function timeFull(date) {
    if (!date) return '';
    return new Date(date).toLocaleString('es-MX', {
      hour: '2-digit', minute: '2-digit', hour12: false,
      day: '2-digit', month: 'short', year: 'numeric'
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
      <div class="archived-view">
        <header class="archived-view__header">
          <div class="archived-view__title-wrap">
            <h1 class="archived-view__title">
              <svg class="archived-view__icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/>
              </svg>
              Archivados
            </h1>
            <p class="archived-view__subtitle">Conversaciones que no necesitas ver todos los dias. Puedes restaurarlas cuando quieras.</p>
          </div>

          <div class="archived-view__actions">
            <div class="wa-search archived-view__search">
              <div class="wa-search__input-wrap">
                <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                <input type="text" class="wa-search__input" id="archived-search" placeholder="Buscar en archivados" autocomplete="off">
              </div>
            </div>
            <button class="btn btn--secondary" id="btn-refresh-archived" type="button">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
              Actualizar
            </button>
          </div>
        </header>

        <div class="archived-view__list" id="archived-list"></div>
      </div>
    `;

    bindEvents();
    loadArchived();
    setupRealtime();
  }

  function bindEvents() {
    document.getElementById('archived-search').addEventListener('input', (e) => {
      state.search = e.target.value;
      renderList();
    });
    document.getElementById('btn-refresh-archived').addEventListener('click', loadArchived);
  }

  async function loadArchived() {
    state.loading = true;
    const listEl = document.getElementById('archived-list');
    let loader = null;
    if (listEl) {
      const existingLoader = listEl.querySelector('.loading-overlay');
      if (existingLoader) existingLoader.remove();
      const hasItems = listEl.querySelector('.archived-item');
      if (!hasItems) {
        loader = window.withDelayedLoader(listEl);
      }
    }

    const result = await window.api.listArchivedConversations({ limit: 100 });
    if (loader) loader.hide();
    if (!result.ok) {
      if (listEl) {
        listEl.innerHTML = '<div class="empty-state"><p class="empty-state__message">Error al cargar archivados</p></div>';
      }
      state.loading = false;
      return;
    }

    state.conversations = result.data.conversations || [];
    state.loading = false;

    if (result.data._meta && result.data._meta.archived_column_available === false) {
      listEl.innerHTML = `
        <div class="empty-state">
          <svg class="empty-state__icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
          </svg>
          <h3 class="empty-state__title">Falta configurar Archivados</h3>
          <p class="empty-state__message">${result.data._meta.hint || 'Ejecuta el script SQL en Supabase.'}</p>
        </div>
      `;
      return;
    }

    renderList();
  }

  function renderList() {
    const listEl = document.getElementById('archived-list');
    if (!listEl) return;

    let list = [...state.conversations];
    if (state.search) {
      const term = state.search.toLowerCase();
      list = list.filter(c => {
        const name = c.contact?.name || c.phone || '';
        const preview = c.last_message?.content || '';
        return name.toLowerCase().includes(term) || preview.toLowerCase().includes(term);
      });
    }
    list.sort((a, b) => {
      const ta = new Date(a.archived_at || a.updated_at).getTime();
      const tb = new Date(b.archived_at || b.updated_at).getTime();
      return tb - ta;
    });

    if (list.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <svg class="empty-state__icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/>
          </svg>
          <h3 class="empty-state__title">Sin conversaciones archivadas</h3>
          <p class="empty-state__message">${state.search ? 'No se encontraron coincidencias.' : 'Cuando archives una conversacion aparecera aqui. Puedes restaurarla en cualquier momento.'}</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = list.map(conv => {
      const name = conv.contact?.name || formatPhone(conv.phone) || 'Sin nombre';
      const phone = formatPhone(conv.phone);
      const preview = conv.last_message?.preview || 'Sin mensajes';
      const time = timeShort(conv.last_message?.created_at || conv.updated_at);
      const archivedAt = timeFull(conv.archived_at);
      const initials = initialsFromName(name);
      const color = hashColor(conv.phone);

      return `
        <article class="archived-item" data-id="${conv.id}">
          <div class="wa-avatar ${color}">${escapeHtml(initials)}</div>
          <div class="archived-item__body">
            <div class="archived-item__top">
              <h3 class="archived-item__name">${escapeHtml(name)}</h3>
              <span class="archived-item__time">${escapeHtml(time)}</span>
            </div>
            <div class="archived-item__phone">${escapeHtml(phone)}</div>
            <p class="archived-item__preview">${escapeHtml(preview)}</p>
            <div class="archived-item__meta">
              <span class="archived-item__meta-item">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z"/></svg>
                Archivado: ${escapeHtml(archivedAt)}
              </span>
              ${conv.message_count
                ? `<span class="archived-item__meta-item">${conv.message_count} mensaje${conv.message_count === 1 ? '' : 's'}</span>`
                : ''}
            </div>
          </div>
          <div class="archived-item__actions">
            <button class="btn btn--secondary btn--sm" data-action="view" data-id="${conv.id}" type="button">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
              Ver
            </button>
            <button class="btn btn--primary btn--sm" data-action="restore" data-id="${conv.id}" type="button">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
              Restaurar
            </button>
          </div>
        </article>
      `;
    }).join('');

    listEl.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        if (action === 'view') {
          viewConversation(id);
        } else if (action === 'restore') {
          restoreConversation(id);
        }
      });
    });
  }

  function viewConversation(id) {
    window.location.hash = '#conversations?select=' + encodeURIComponent(id);
  }

  async function restoreConversation(id) {
    const conv = state.conversations.find(c => c.id === id);
    const name = conv?.contact?.name || formatPhone(conv?.phone) || 'esta conversacion';
    if (!confirm('Restaurar la conversacion con ' + name + '?')) return;

    const result = await window.api.archiveConversation(id, false);
    if (!result.ok) {
      window.toast.error('Error al restaurar: ' + (result.error || 'desconocido'));
      return;
    }

    window.toast.success('Conversacion restaurada');
    state.conversations = state.conversations.filter(c => c.id !== id);
    renderList();
  }

  function setupRealtime() {
    if (!window.supabaseClient || !window.supabaseClient.isReady()) return;

    try {
      state.channel = window.supabaseClient.subscribeToConversations((payload) => {
        if (!payload || !payload.new) return;
        const conv = payload.new;
        const wasArchived = state.conversations.find(c => c.id === conv.id);
        const isArchived = !!conv.archived_at;

        if (isArchived && !wasArchived) {
          loadArchived();
        } else if (!isArchived && wasArchived) {
          state.conversations = state.conversations.filter(c => c.id !== conv.id);
          renderList();
        } else if (isArchived && wasArchived) {
          Object.assign(wasArchived, {
            archived_at: conv.archived_at,
            updated_at: conv.updated_at
          });
          renderList();
        }
      });
    } catch (e) {
      console.warn('[archived] No se pudo subscribir a realtime:', e);
    }
  }

  function cleanup() {
    if (state.channel && window.supabaseClient) {
      window.supabaseClient.unsubscribe(state.channel);
      state.channel = null;
    }
    state.conversations = [];
    state.search = '';
  }

  window.archivedView = { render: renderShell, cleanup };
})();
