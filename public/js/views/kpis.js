(function() {
  'use strict';

  const REFRESH_INTERVAL_MS = 30000;
  const REALTIME_DEBOUNCE_MS = 1500;

  let activeChannel = null;
  let activeInterval = null;
  let activeContainer = null;
  let refreshTimer = null;
  let inFlight = false;

  function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function formatNumber(n) {
    if (n == null) return '0';
    return new Intl.NumberFormat('es-MX').format(n);
  }

  function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit' });
  }

  function maxValue(arr) {
    return arr.reduce((m, v) => Math.max(m, v.count || 0), 0);
  }

  function teardown() {
    if (activeInterval) {
      clearInterval(activeInterval);
      activeInterval = null;
    }
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    if (activeChannel && window.supabaseClient) {
      try { window.supabaseClient.unsubscribe(activeChannel); }
      catch (e) { console.warn('[kpis] unsubscribe error', e); }
    }
    activeChannel = null;
    activeContainer = null;
    inFlight = false;
  }

  function buildView(k) {
    const t = k.totals || {};
    const today = k.today || {};
    const dirBreakdown = k.direction_breakdown || {};
    const last7 = k.messages_last_7_days || [];
    const byStatus = k.conversations_by_status || {};
    const max = maxValue(last7);
    const totalWeek = last7.reduce((acc, d) => acc + (d.count || 0), 0);
    const generated = k.generated_at
      ? new Date(k.generated_at).toLocaleString('es-MX')
      : new Date().toLocaleString('es-MX');

    return `
      <div class="stats-grid">
        <div class="stat-card stat-card--success">
          <div class="stat-card__label">Conversaciones activas</div>
          <div class="stat-card__value" data-kpi="active_conversations">${formatNumber(t.active_conversations)}</div>
          <div class="stat-card__delta">${formatNumber(byStatus.closed || 0)} cerradas</div>
        </div>

        <div class="stat-card stat-card--info">
          <div class="stat-card__label">Contactos unicos</div>
          <div class="stat-card__value" data-kpi="contacts">${formatNumber(t.contacts)}</div>
          <div class="stat-card__delta">Registrados en la base</div>
        </div>

        <div class="stat-card stat-card--warning">
          <div class="stat-card__label">Mensajes hoy</div>
          <div class="stat-card__value" data-kpi="messages_today">${formatNumber(today.messages)}</div>
          <div class="stat-card__delta" data-kpi="today_date">${escapeHtml(today.date || '')}</div>
        </div>

        <div class="stat-card">
          <div class="stat-card__label">Total mensajes</div>
          <div class="stat-card__value" data-kpi="messages_total">${formatNumber(t.messages)}</div>
          <div class="stat-card__delta">Historico completo</div>
        </div>

        <div class="stat-card">
          <div class="stat-card__label">Mensajes entrantes</div>
          <div class="stat-card__value" data-kpi="messages_inbound">${formatNumber(dirBreakdown.inbound)}</div>
          <div class="stat-card__delta">De contactos</div>
        </div>

        <div class="stat-card stat-card--success">
          <div class="stat-card__label">Mensajes salientes</div>
          <div class="stat-card__value" data-kpi="messages_outbound">${formatNumber(dirBreakdown.outbound)}</div>
          <div class="stat-card__delta">Del bot y humanos</div>
        </div>
      </div>

      <div class="card" style="margin-bottom: var(--space-6);">
        <div class="card__header">
          <div>
            <h2 class="card__title">Mensajes ultimos 7 dias</h2>
            <p class="card__subtitle">Total: <span data-kpi="week_total">${formatNumber(totalWeek)}</span> mensajes</p>
          </div>
        </div>
        <div class="chart-bars" id="chart-bars" data-kpi="chart">
          ${last7.map(d => {
            const height = max > 0 ? Math.max(4, (d.count / max) * 100) : 0;
            return `
              <div class="chart-bar" data-date="${escapeHtml(d.date)}">
                <div class="chart-bar__value">${formatNumber(d.count)}</div>
                <div class="chart-bar__fill" style="height: ${height}%" title="${formatNumber(d.count)} mensajes"></div>
                <div class="chart-bar__label">${escapeHtml(formatDateShort(d.date))}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card__header">
          <div>
            <h2 class="card__title">Conversaciones por estado</h2>
            <p class="card__subtitle">Distribucion de todas las conversaciones</p>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-4);">
          ${Object.keys(byStatus).length === 0 ? `
            <div class="empty-state" style="grid-column: 1 / -1; padding: var(--space-8);">
              <p class="empty-state__message">Sin conversaciones registradas</p>
            </div>
          ` : Object.entries(byStatus).map(([status, count]) => {
            const badgeClass = status === 'active' ? 'badge--active' : status === 'closed' ? 'badge--closed' : 'badge--inactive';
            const label = status === 'active' ? 'Activas' : status === 'closed' ? 'Cerradas' : status.charAt(0).toUpperCase() + status.slice(1);
            return `
              <div style="padding: var(--space-4); background: var(--color-bg-elevated); border-radius: var(--radius-md); border: 1px solid var(--color-border);">
                <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-3);">
                  <span class="badge ${badgeClass}">${escapeHtml(label)}</span>
                </div>
                <div style="font-family: var(--font-display); font-size: var(--fs-2xl); font-weight: var(--fw-semibold);">${formatNumber(count)}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div style="margin-top: var(--space-6); text-align: right; font-size: var(--fs-xs); color: var(--color-text-dim);">
        Ultima actualizacion: <span data-kpi="generated_at">${escapeHtml(generated)}</span>
      </div>
    `;
  }

  function updateViewInPlace(container, k) {
    if (!container) return;
    if (activeContainer && activeContainer !== container) {
      return;
    }

    const t = k.totals || {};
    const today = k.today || {};
    const dirBreakdown = k.direction_breakdown || {};
    const last7 = k.messages_last_7_days || [];
    const byStatus = k.conversations_by_status || {};
    const max = maxValue(last7);
    const totalWeek = last7.reduce((acc, d) => acc + (d.count || 0), 0);
    const generated = k.generated_at
      ? new Date(k.generated_at).toLocaleString('es-MX')
      : new Date().toLocaleString('es-MX');

    const set = (key, html) => {
      const el = container.querySelector('[data-kpi="' + key + '"]');
      if (el) el.innerHTML = html;
    };

    set('active_conversations', formatNumber(t.active_conversations));
    set('contacts', formatNumber(t.contacts));
    set('messages_today', formatNumber(today.messages));
    set('today_date', escapeHtml(today.date || ''));
    set('messages_total', formatNumber(t.messages));
    set('messages_inbound', formatNumber(dirBreakdown.inbound));
    set('messages_outbound', formatNumber(dirBreakdown.outbound));
    set('week_total', formatNumber(totalWeek));
    set('generated_at', escapeHtml(generated));

    const chartEl = container.querySelector('[data-kpi="chart"]');
    if (chartEl) {
      chartEl.innerHTML = last7.map(d => {
        const height = max > 0 ? Math.max(4, (d.count / max) * 100) : 0;
        return `
          <div class="chart-bar" data-date="${escapeHtml(d.date)}">
            <div class="chart-bar__value">${formatNumber(d.count)}</div>
            <div class="chart-bar__fill" style="height: ${height}%" title="${formatNumber(d.count)} mensajes"></div>
            <div class="chart-bar__label">${escapeHtml(formatDateShort(d.date))}</div>
          </div>
        `;
      }).join('');
    }
  }

  async function refresh(silent) {
    if (!activeContainer) return;
    if (inFlight) return;
    inFlight = true;
    try {
      const result = await window.api.getKpis();
      if (!result.ok) {
        console.warn('[kpis] refresh error:', result.error);
        return;
      }
      if (silent) {
        updateViewInPlace(activeContainer, result.data);
      } else {
        const bodyEl = activeContainer.querySelector('[data-kpis-body]');
        if (bodyEl) {
          bodyEl.innerHTML = buildView(result.data);
        } else {
          const headerEl = activeContainer.querySelector('.view-header');
          if (headerEl) {
            headerEl.insertAdjacentHTML('afterend', '<div data-kpis-body>' + buildView(result.data) + '</div>');
          }
        }
      }
    } finally {
      inFlight = false;
    }
  }

  function scheduleRealtimeRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      refresh(true);
    }, REALTIME_DEBOUNCE_MS);
  }

  async function render(container) {
    teardown();
    activeContainer = container;

    container.innerHTML = `
      <div class="app-view" id="kpis-view">
        <div class="view-header">
          <div class="view-header__main">
            <div class="view-header__icon">
              <svg viewBox="0 0 24 24"><path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/></svg>
            </div>
            <div class="view-header__title-block">
              <h1 class="view-header__title">Indicadores</h1>
              <p class="view-header__subtitle">Resumen de actividad del chatbot</p>
            </div>
          </div>
          <div class="view-header__actions">
            <span class="badge badge--active" data-kpi-live-indicator>En vivo</span>
          </div>
        </div>
      </div>
    `;
    const loader = window.withDelayedLoader(container);

    const result = await window.api.getKpis();
    loader.hide();
    if (!result.ok) {
      container.innerHTML = `
        <div class="app-view">
          <div class="view-header">
            <div class="view-header__main">
              <div class="view-header__icon">
                <svg viewBox="0 0 24 24"><path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/></svg>
              </div>
              <div class="view-header__title-block">
                <h1 class="view-header__title">Indicadores</h1>
                <p class="view-header__subtitle">Resumen de actividad del chatbot</p>
              </div>
            </div>
          </div>
          <div class="empty-state">
            <h2 class="empty-state__title">Error al cargar</h2>
            <p class="empty-state__message">${escapeHtml(result.error || 'No se pudieron obtener los indicadores')}</p>
          </div>
        </div>
      `;
      return;
    }

    const k = result.data;
    container.innerHTML = `
      <div class="app-view">
        <div class="view-header">
          <div class="view-header__main">
            <div class="view-header__icon">
              <svg viewBox="0 0 24 24"><path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/></svg>
            </div>
            <div class="view-header__title-block">
              <h1 class="view-header__title">Indicadores</h1>
              <p class="view-header__subtitle">Resumen de actividad &middot; <span data-kpi-header-date>${escapeHtml(k.today?.date || '')}</span></p>
            </div>
          </div>
          <div class="view-header__actions">
            <span class="badge badge--active" data-kpi-live-indicator>En vivo</span>
          </div>
        </div>
        <div data-kpis-body>${buildView(k)}</div>
      </div>
    `;

    if (window.supabaseClient && typeof window.supabaseClient.subscribeToAllMessages === 'function') {
      activeChannel = window.supabaseClient.subscribeToAllMessages(() => {
        scheduleRealtimeRefresh();
      });
    }

    activeInterval = setInterval(() => {
      refresh(true);
    }, REFRESH_INTERVAL_MS);
  }

  function init() {
    if (window.router && typeof window.router.onBeforeNavigate === 'function') {
      window.router.onBeforeNavigate(teardown);
    }
  }

  window.kpisView = { render, refresh, teardown, init };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
