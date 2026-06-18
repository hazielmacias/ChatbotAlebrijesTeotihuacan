(function() {
  'use strict';

  let state = {
    data: null,
    loading: false
  };

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

  function formatDateShort(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit' });
  }

  function formatFullDate() {
    return new Date().toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  function buildConicGradient(sentPct, receivedPct) {
    return `conic-gradient(
      var(--color-primary) 0% ${sentPct}%,
      var(--color-info) ${sentPct}% ${sentPct + receivedPct}%
      )`;
  }

  async function render(container) {
    container.innerHTML = `
      <div class="dashboard-view" id="dashboard-view">
        <div class="loading-overlay" role="status" aria-label="Cargando"><div class="brand-loader"><div class="brand-loader__wrap"><div class="brand-loader__halo" aria-hidden="true"></div><img class="brand-loader__logo" src="/logo-alebrijes.png" alt=""></div><p class="brand-loader__label" aria-hidden="true">Cargando<span class="brand-loader__dots"></span></p></div></div>
      </div>
    `;

    state.loading = true;
    const result = await window.api.getDashboardStats();
    state.loading = false;

    if (!result.ok) {
      container.innerHTML = `
        <div class="dashboard-view">
          <div class="empty-state">
            <h3 class="empty-state__title">Error al cargar</h3>
            <p class="empty-state__message">${escapeHtml(result.error || 'desconocido')}</p>
          </div>
        </div>
      `;
      return;
    }

    state.data = result.data;
    paint();
  }

  function paint() {
    const container = document.getElementById('dashboard-view');
    if (!container || !state.data) return;

    const d = state.data;
    const t = d.totals || {};
    const kw = d.top_keywords || [];
    const convByDay = d.conversations_by_day || [];
    const msgByDay = d.messages_by_day || [];
    const hour = d.messages_by_hour || new Array(24).fill(0);
    const svr = d.sent_vs_received || { inbound: 0, outbound: 0 };
    const recent = d.recent_messages || [];

    const totalSvr = (svr.inbound || 0) + (svr.outbound || 0);
    const sentPct = totalSvr > 0 ? Math.round((svr.outbound / totalSvr) * 100) : 50;
    const recvPct = totalSvr > 0 ? 100 - sentPct : 50;

    const maxConv = Math.max(1, ...convByDay.map(d => d.count));
    const maxHour = Math.max(1, ...hour);

    container.innerHTML = `
      <div class="dashboard-view">
        <div class="dashboard-header">
          <div>
            <h1 class="dashboard-header__title">Dashboard</h1>
            <p class="dashboard-header__subtitle">Resumen de actividad del chatbot</p>
          </div>
          <div class="dashboard-header__date">
            <span>${formatFullDate()}</span>
          </div>
        </div>

        <!-- Stat cards -->
        <div class="dashboard-stats">
          <div class="stat-tile stat-tile--primary">
            <div class="stat-tile__head">
              <svg class="stat-tile__icon" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
              Conversaciones
            </div>
            <div class="stat-tile__value">${formatNumber(t.conversations)}</div>
            <div class="stat-tile__delta">
              <strong>${formatNumber(t.active_conversations)}</strong> activas
            </div>
          </div>

          <div class="stat-tile stat-tile--info">
            <div class="stat-tile__head">
              <svg class="stat-tile__icon" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4 0h-2v-2h2v2zm0-3H6V9h12v2z"/></svg>
              Mensajes
            </div>
            <div class="stat-tile__value">${formatNumber(t.messages)}</div>
            <div class="stat-tile__delta">
              <strong>${formatNumber(t.messages_today)}</strong> hoy
            </div>
          </div>

          <div class="stat-tile stat-tile--success">
            <div class="stat-tile__head">
              <svg class="stat-tile__icon" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              Pases de Entrenamiento
            </div>
            <div class="stat-tile__value">${formatNumber(t.passes)}</div>
            <div class="stat-tile__delta">
              Conversaciones escaladas
            </div>
          </div>

          <div class="stat-tile stat-tile--warning">
            <div class="stat-tile__head">
              <svg class="stat-tile__icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
              Top palabras
            </div>
            <div class="keywords-row">
              ${kw.length === 0 ? '<span class="keyword-pill">Sin datos</span>' :
                kw.map((k, i) => `
                  <span class="keyword-pill" style="--tile-color: hsl(${25 + i * 35}, 80%, 55%);">
                    ${escapeHtml(k.word)}
                    <span class="keyword-pill__count">${k.count}</span>
                  </span>
                `).join('')}
            </div>
          </div>
        </div>

        <!-- Charts -->
        <div class="dashboard-charts">
          <!-- Conversations per day (bar) -->
          <div class="chart-card">
            <div class="chart-card__head">
              <div>
                <h3 class="chart-card__title">Conversaciones por dia</h3>
                <p class="chart-card__subtitle">Ultimos 7 dias</p>
              </div>
            </div>
            <div class="chart-bars">
              ${convByDay.map(d => {
                const h = Math.max(4, (d.count / maxConv) * 100);
                return `
                  <div class="chart-bar">
                    <div class="chart-bar__value">${d.count}</div>
                    <div class="chart-bar__fill" style="height: ${h}%" title="${formatDateShort(d.date)}: ${d.count}"></div>
                    <div class="chart-bar__label">${formatDateShort(d.date)}</div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Messages sent vs received (pie) -->
          <div class="chart-card">
            <div class="chart-card__head">
              <div>
                <h3 class="chart-card__title">Enviados vs Recibidos</h3>
                <p class="chart-card__subtitle">Total mensajes</p>
              </div>
            </div>
            <div class="pie-chart" style="background: ${buildConicGradient(sentPct, recvPct)}">
              <div class="pie-chart__center">
                <div class="pie-chart__total">${formatNumber(totalSvr)}</div>
                <div class="pie-chart__label">Mensajes</div>
              </div>
            </div>
            <div class="pie-legend">
              <span class="pie-legend__item">
                <span class="pie-legend__dot pie-legend__dot--sent"></span>
                Enviados: ${formatNumber(svr.outbound)} (${sentPct}%)
              </span>
              <span class="pie-legend__item">
                <span class="pie-legend__dot pie-legend__dot--received"></span>
                Recibidos: ${formatNumber(svr.inbound)} (${recvPct}%)
              </span>
            </div>
          </div>
        </div>

        <!-- Activity by hour (bar) -->
        <div class="chart-card" style="margin-bottom: var(--space-6);">
          <div class="chart-card__head">
            <div>
              <h3 class="chart-card__title">Actividad por hora</h3>
              <p class="chart-card__subtitle">Ultimas 24 horas (hora Mexico)</p>
            </div>
          </div>
          <div class="hour-bars">
            ${hour.map((count, h) => {
              const hH = count > 0 ? Math.max(4, (count / maxHour) * 100) : 2;
              const isEmpty = count === 0;
              return `<div class="hour-bar" ${isEmpty ? 'data-empty="true"' : ''} style="height: ${hH}%" title="${h}:00 - ${count} mensajes"></div>`;
            }).join('')}
          </div>
          <div class="hour-axis">
            <span>00</span>
            <span>06</span>
            <span>12</span>
            <span>18</span>
            <span>23</span>
          </div>
        </div>

        <!-- Recent messages -->
        <div class="dashboard-recent">
          <div class="dashboard-recent__head">
            <h3 class="dashboard-recent__title">Ultimos mensajes</h3>
          </div>
          <div class="recent-list">
            ${recent.length === 0 ? '<div class="empty-state" style="padding: var(--space-8);">Sin mensajes recientes</div>' :
              recent.map(m => {
                const dirClass = m.direction === 'inbound' ? 'in' : 'out';
                const dirLabel = m.direction === 'inbound' ? 'RECIBIDO' : 'ENVIADO';
                const name = m.contact_name || m.phone || 'Sin nombre';
                const preview = (m.content || '').substring(0, 80).replace(/\n/g, ' ');
                return `
                  <div class="recent-item" data-id="${m.conversation_id}">
                    <div class="recent-item__wa">
                      <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    </div>
                    <div class="recent-item__body">
                      <div class="recent-item__name">${escapeHtml(name)}</div>
                      <div class="recent-item__preview">${escapeHtml(preview)}</div>
                    </div>
                    <span class="recent-item__direction recent-item__direction--${dirClass}">${dirLabel}</span>
                    <span class="recent-item__time">${formatTimeAgo(m.created_at)}</span>
                  </div>
                `;
              }).join('')}
          </div>
        </div>
      </div>
    `;

    // Click en recent item -> ir a conversaciones
    container.querySelectorAll('.recent-item').forEach(el => {
      el.addEventListener('click', () => {
        const convId = el.dataset.id;
        if (convId) {
          window.location.hash = '#conversations';
          // Guardar el id para auto-seleccionar
          setTimeout(() => {
            if (window.conversationsView && window.conversationsView.selectById) {
              window.conversationsView.selectById(convId);
            }
          }, 300);
        }
      });
    });
  }

  window.dashboardView = { render };
})();
