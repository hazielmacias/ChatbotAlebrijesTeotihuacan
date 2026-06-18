(function() {
  'use strict';

  let state = {
    data: null,
    loading: false,
    activeTab: 'all'
  };

  function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function formatTimeAgo(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60) return 'ahora';
    if (diff < 3600) return Math.floor(diff / 60) + 'm';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h';
    if (diff < 604800) return Math.floor(diff / 86400) + 'd';
    return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  }

  async function render(container) {
    container.innerHTML = `
      <div class="app-view">
        <div class="view-header">
          <div>
            <h1 class="view-header__title">Notificaciones</h1>
            <p class="view-header__subtitle">Chats con alta actividad, nuevos y escalados</p>
          </div>
        </div>
        <div class="loading-overlay" role="status" aria-label="Cargando"><div class="brand-loader"><div class="brand-loader__wrap"><div class="brand-loader__halo" aria-hidden="true"></div><img class="brand-loader__logo" src="/logo-alebrijes.png" alt=""></div><p class="brand-loader__label" aria-hidden="true">Cargando<span class="brand-loader__dots"></span></p></div></div>
      </div>
    `;

    state.loading = true;
    const result = await window.api.getNotifications();
    state.loading = false;

    if (!result.ok) {
      container.innerHTML = `
        <div class="app-view">
          <div class="empty-state">
            <h3 class="empty-state__title">Error al cargar</h3>
            <p class="empty-state__message">${escapeHtml(result.error || 'desconocido')}</p>
          </div>
        </div>
      `;
      return;
    }

    state.data = result.data;
    paint(container);
  }

  function paint(container) {
    const d = state.data;
    if (!d) return;
    const counts = d.counts || {};
    const total = (counts.high_interaction || 0) + (counts.new_conversations || 0) + (counts.escalated || 0);

    container.innerHTML = `
      <div class="app-view">
        <div class="view-header">
          <div>
            <h1 class="view-header__title">Notificaciones</h1>
            <p class="view-header__subtitle">${total} alertas activas</p>
          </div>
        </div>

        <div class="notifications-tabs" id="notif-tabs">
          <button class="notif-tab ${state.activeTab === 'all' ? 'notif-tab--active' : ''}" data-tab="all">
            Todas
            ${total > 0 ? `<span class="notif-tab__count">${total}</span>` : ''}
          </button>
          <button class="notif-tab ${state.activeTab === 'high' ? 'notif-tab--active' : ''}" data-tab="high">
            Alta interaccion
            ${counts.high_interaction > 0 ? `<span class="notif-tab__count">${counts.high_interaction}</span>` : ''}
          </button>
          <button class="notif-tab ${state.activeTab === 'new' ? 'notif-tab--active' : ''}" data-tab="new">
            Nuevas
            ${counts.new_conversations > 0 ? `<span class="notif-tab__count">${counts.new_conversations}</span>` : ''}
          </button>
          <button class="notif-tab ${state.activeTab === 'escalated' ? 'notif-tab--active' : ''}" data-tab="escalated">
            Pases de entrada
            ${counts.escalated > 0 ? `<span class="notif-tab__count">${counts.escalated}</span>` : ''}
          </button>
        </div>

        <div id="notif-list"></div>
      </div>
    `;

    // Tabs
    container.querySelectorAll('.notif-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        state.activeTab = btn.dataset.tab;
        paint(container);
      });
    });

    // Lista
    renderList(container);
  }

  function renderList(container) {
    const list = container.querySelector('#notif-list');
    if (!list) return;

    const d = state.data;
    const sections = [];

    if (state.activeTab === 'all' || state.activeTab === 'high') {
      sections.push({
        title: 'Alta interaccion (24h)',
        icon: 'fire',
        items: d.high_interaction || [],
        emptyText: 'Sin chats con alta interaccion'
      });
    }
    if (state.activeTab === 'all' || state.activeTab === 'new') {
      sections.push({
        title: 'Nuevas conversaciones (24h)',
        icon: 'plus',
        items: d.new_conversations || [],
        emptyText: 'Sin conversaciones nuevas'
      });
    }
    if (state.activeTab === 'all' || state.activeTab === 'escalated') {
      sections.push({
        title: 'Pases de entrada (escalados)',
        icon: 'check',
        items: d.escalated || [],
        emptyText: 'Sin pases de entrada generados'
      });
    }

    if (sections.length === 0 || sections.every(s => s.items.length === 0)) {
      list.innerHTML = `<div class="empty-state"><p class="empty-state__message">No hay notificaciones</p></div>`;
      return;
    }

    list.innerHTML = sections.map(s => `
      <div class="notif-section">
        <div class="notif-section__head">
          <span class="notif-section__icon notif-section__icon--${s.icon}">
            ${s.icon === 'fire' ? '🔥' : s.icon === 'plus' ? '✨' : '✓'}
          </span>
          <h3 class="notif-section__title">${s.title}</h3>
          <span class="notif-section__count">${s.items.length}</span>
        </div>
        ${s.items.length === 0 ? `
          <div class="notif-section__empty">${s.emptyText}</div>
        ` : `
          <div class="notif-section__list">
            ${s.items.map(item => renderItem(item, s.icon)).join('')}
          </div>
        `}
      </div>
    `).join('');

    // Click -> ir a la conversacion
    list.querySelectorAll('.notif-item').forEach(el => {
      el.addEventListener('click', () => {
        const convId = el.dataset.id;
        if (convId) {
          window.location.hash = '#conversations';
          setTimeout(() => {
            if (window.conversationsView && window.conversationsView.selectById) {
              window.conversationsView.selectById(convId);
            }
          }, 300);
        }
      });
    });
  }

  function renderItem(item, type) {
    const name = item.contact_name || item.phone || 'Sin nombre';
    const time = formatTimeAgo(item.created_at || item.updated_at);

    let badge = '';
    if (type === 'fire') {
      badge = `<span class="notif-item__badge notif-item__badge--fire">${item.message_count_24h} mensajes</span>`;
    } else if (type === 'plus') {
      badge = `<span class="notif-item__badge notif-item__badge--new">${item.current_flow || 'inicio'}</span>`;
    } else {
      badge = `<span class="notif-item__badge notif-item__badge--escalated">${item.current_step || item.current_flow}</span>`;
    }

    return `
      <div class="notif-item" data-id="${item.conversation_id}">
        <div class="notif-item__avatar">${escapeHtml((name[0] || '?').toUpperCase())}</div>
        <div class="notif-item__body">
          <div class="notif-item__name">${escapeHtml(name)}</div>
          <div class="notif-item__phone">${escapeHtml(item.phone || '')}</div>
        </div>
        ${badge}
        <span class="notif-item__time">${time}</span>
        <svg class="notif-item__chevron" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
        </svg>
      </div>
    `;
  }

  window.notificationsView = { render };
})();
