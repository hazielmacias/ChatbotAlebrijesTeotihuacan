(function() {
  'use strict';

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

  async function render(container) {
    container.innerHTML = `
      <div class="app-view">
        <div class="view-header">
          <div>
            <h1 class="view-header__title">Indicadores</h1>
            <p class="view-header__subtitle">Resumen de actividad del chatbot</p>
          </div>
        </div>
        <div class="loading-overlay"><div class="spinner spinner--lg"></div></div>
      </div>
    `;

    const result = await window.api.getKpis();
    if (!result.ok) {
      container.innerHTML = `
        <div class="app-view">
          <div class="empty-state">
            <h2 class="empty-state__title">Error al cargar</h2>
            <p class="empty-state__message">${escapeHtml(result.error || 'No se pudieron obtener los indicadores')}</p>
          </div>
        </div>
      `;
      return;
    }

    const k = result.data;
    const t = k.totals || {};
    const today = k.today || {};
    const dirBreakdown = k.direction_breakdown || {};
    const last7 = k.messages_last_7_days || [];
    const byStatus = k.conversations_by_status || {};
    const max = maxValue(last7);
    const totalWeek = last7.reduce((acc, d) => acc + (d.count || 0), 0);

    container.innerHTML = `
      <div class="app-view">
        <div class="view-header">
          <div>
            <h1 class="view-header__title">Indicadores</h1>
            <p class="view-header__subtitle">Resumen de actividad · ${escapeHtml(today.date || '')}</p>
          </div>
          <div class="view-header__actions">
            <span class="badge badge--active">En vivo</span>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-card stat-card--success">
            <div class="stat-card__label">Conversaciones activas</div>
            <div class="stat-card__value">${formatNumber(t.active_conversations)}</div>
            <div class="stat-card__delta">${formatNumber(byStatus.closed || 0)} cerradas</div>
          </div>

          <div class="stat-card stat-card--info">
            <div class="stat-card__label">Contactos unicos</div>
            <div class="stat-card__value">${formatNumber(t.contacts)}</div>
            <div class="stat-card__delta">Registrados en la base</div>
          </div>

          <div class="stat-card stat-card--warning">
            <div class="stat-card__label">Mensajes hoy</div>
            <div class="stat-card__value">${formatNumber(today.messages)}</div>
            <div class="stat-card__delta">${escapeHtml(today.date || '')}</div>
          </div>

          <div class="stat-card">
            <div class="stat-card__label">Total mensajes</div>
            <div class="stat-card__value">${formatNumber(t.messages)}</div>
            <div class="stat-card__delta">Historico completo</div>
          </div>

          <div class="stat-card">
            <div class="stat-card__label">Mensajes entrantes</div>
            <div class="stat-card__value">${formatNumber(dirBreakdown.inbound)}</div>
            <div class="stat-card__delta">De contactos</div>
          </div>

          <div class="stat-card stat-card--success">
            <div class="stat-card__label">Mensajes salientes</div>
            <div class="stat-card__value">${formatNumber(dirBreakdown.outbound)}</div>
            <div class="stat-card__delta">Del bot y humanos</div>
          </div>
        </div>

        <div class="card" style="margin-bottom: var(--space-6);">
          <div class="card__header">
            <div>
              <h2 class="card__title">Mensajes ultimos 7 dias</h2>
              <p class="card__subtitle">Total: ${formatNumber(totalWeek)} mensajes</p>
            </div>
          </div>
          <div class="chart-bars" id="chart-bars">
            ${last7.map(d => {
              const height = max > 0 ? Math.max(4, (d.count / max) * 100) : 0;
              return `
                <div class="chart-bar">
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
          Ultima actualizacion: ${escapeHtml(new Date(k.generated_at).toLocaleString('es-MX'))}
        </div>
      </div>
    `;
  }

  window.kpisView = { render };
})();
