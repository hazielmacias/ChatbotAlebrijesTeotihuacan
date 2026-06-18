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

  function getFlatItems() {
    const d = state.data;
    if (!d) return [];
    const items = [];
    (d.high_interaction || []).forEach(i => items.push({ ...i, _type: 'high' }));
    (d.new_conversations || []).forEach(i => items.push({ ...i, _type: 'new' }));
    (d.escalated || []).forEach(i => items.push({ ...i, _type: 'escalated' }));
    items.sort((a, b) => {
      const da = new Date(a.created_at || a.updated_at || 0).getTime();
      const db = new Date(b.created_at || b.updated_at || 0).getTime();
      return db - da;
    });
    return items;
  }

  function getFilteredItems() {
    const all = getFlatItems();
    if (state.activeTab === 'all') return all;
    return all.filter(i => i._type === state.activeTab);
  }

  async function render(container) {
    container.innerHTML = `
      <div class="app-view" id="notifications-view">
        <div class="view-header">
          <div class="view-header__main">
            <div class="view-header__icon">
              <svg viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
            </div>
            <div class="view-header__title-block">
              <h1 class="view-header__title">Notificaciones</h1>
              <p class="view-header__subtitle">Chats con alta actividad, nuevos y escalados</p>
            </div>
          </div>
        </div>
      </div>
    `;
    const loader = window.withDelayedLoader(container);

    state.loading = true;
    const result = await window.api.getNotifications();
    state.loading = false;
    loader.hide();

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
          <div class="view-header__main">
            <div class="view-header__icon">
              <svg viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
            </div>
            <div class="view-header__title-block">
              <h1 class="view-header__title">Notificaciones</h1>
              <p class="view-header__subtitle">${total} alertas activas</p>
            </div>
          </div>
        </div>

        <div class="notif-tabs" id="notif-tabs">
          <button class="notif-tab ${state.activeTab === 'all' ? 'notif-tab--active' : ''}" data-tab="all">
            <svg class="notif-tab__icon" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5h18v2H3V5zm0 6h18v2H3v-2zm0 6h18v2H3v-2z"/></svg>
            Todas
            ${total > 0 ? `<span class="notif-tab__count">${total}</span>` : ''}
          </button>
          <button class="notif-tab ${state.activeTab === 'high' ? 'notif-tab--active' : ''}" data-tab="high">
            <svg class="notif-tab__icon" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>
            Alta actividad
            ${counts.high_interaction > 0 ? `<span class="notif-tab__count">${counts.high_interaction}</span>` : ''}
          </button>
          <button class="notif-tab ${state.activeTab === 'new' ? 'notif-tab--active' : ''}" data-tab="new">
            <svg class="notif-tab__icon" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            Nuevas
            ${counts.new_conversations > 0 ? `<span class="notif-tab__count">${counts.new_conversations}</span>` : ''}
          </button>
          <button class="notif-tab ${state.activeTab === 'escalated' ? 'notif-tab--active' : ''}" data-tab="escalated">
            <svg class="notif-tab__icon" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            Escalados
            ${counts.escalated > 0 ? `<span class="notif-tab__count">${counts.escalated}</span>` : ''}
          </button>
        </div>

        <div id="notif-list"></div>
      </div>
    `;

    container.querySelectorAll('.notif-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        state.activeTab = btn.dataset.tab;
        paint(container);
      });
    });

    renderList(container);
  }

  function renderList(container) {
    const list = container.querySelector('#notif-list');
    if (!list) return;

    const items = getFilteredItems();

    if (items.length === 0) {
      list.innerHTML = `<div class="empty-state"><p class="empty-state__message">No hay notificaciones</p></div>`;
      return;
    }

    list.innerHTML = `
      <div class="notif-list">
        ${items.map(item => renderItem(item)).join('')}
      </div>
    `;

    list.querySelectorAll('.notif-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.notif-item__delete')) return;
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

    list.querySelectorAll('.notif-item__delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const name = btn.dataset.name || 'esta conversación';
        await deleteConversation(id, name, container);
      });
    });
  }

  async function deleteConversation(id, name, container) {
    const ok = await window.modal.confirm({
      title: 'Borrar permanentemente',
      message: 'Vas a eliminar la conversación con ' + name + ' de forma permanente.\n\nEsta acción no se puede deshacer y se borrarán también todos los mensajes asociados.',
      type: 'warning',
      confirmText: 'Borrar permanentemente',
      cancelText: 'Cancelar'
    });
    if (!ok) return;

    const result = await window.api.deleteConversation(id);
    if (!result.ok) {
      window.toast.error('Error al eliminar: ' + (result.error || 'desconocido'));
      return;
    }

    window.toast.success('Conversación eliminada permanentemente');

    if (state.data) {
      ['high_interaction', 'new_conversations', 'escalated'].forEach(key => {
        if (state.data[key]) {
          state.data[key] = state.data[key].filter(c => c.conversation_id !== id);
        }
      });
      if (state.data.counts) {
        const c = state.data.counts;
        const totalBefore = (c.high_interaction || 0) + (c.new_conversations || 0) + (c.escalated || 0);
        const totalAfter = (state.data.high_interaction || []).length
                         + (state.data.new_conversations || []).length
                         + (state.data.escalated || []).length;
        const diff = Math.max(0, totalBefore - totalAfter);
        if (diff > 0) {
          c.high_interaction = (state.data.high_interaction || []).length;
          c.new_conversations = (state.data.new_conversations || []).length;
          c.escalated = (state.data.escalated || []).length;
        }
      }
    }
    paint(container);
  }

  function renderItem(item) {
    const name = item.contact_name || item.phone || 'Sin nombre';
    const time = formatTimeAgo(item.created_at || item.updated_at);

    let badge = '';
    if (item._type === 'high') {
      badge = `<span class="notif-item__badge notif-item__badge--fire">${item.message_count_24h} mensajes</span>`;
    } else if (item._type === 'new') {
      badge = `<span class="notif-item__badge notif-item__badge--new">${escapeHtml(item.current_flow || 'inicio')}</span>`;
    } else {
      badge = `<span class="notif-item__badge notif-item__badge--escalated">${escapeHtml(item.current_step || item.current_flow || '')}</span>`;
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
        <button class="notif-item__delete" data-id="${item.conversation_id}" data-name="${escapeHtml(name)}" title="Borrar permanentemente" aria-label="Borrar permanentemente">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
        <svg class="notif-item__chevron" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
        </svg>
      </div>
    `;
  }

  window.notificationsView = { render };
})();
