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

  function trendDelta(arr) {
    if (!arr || arr.length < 6) return null;
    const recent = arr.slice(-3).reduce((a, b) => a + b, 0);
    const previous = arr.slice(-6, -3).reduce((a, b) => a + b, 0);
    if (previous === 0) return recent > 0 ? 100 : null;
    return Math.round(((recent - previous) / previous) * 100);
  }

  function renderTrend(delta, label) {
    if (delta == null) return '';
    const arrow = delta > 0
      ? { dir: 'up', path: 'M7 14l5-5 5 5' }
      : delta < 0
        ? { dir: 'down', path: 'M7 10l5 5 5-5' }
        : { dir: 'flat', path: 'M4 12h16' };
    const sign = delta > 0 ? '+' : '';
    return `
      <span class="kpi-card__delta kpi-card__delta--${arrow.dir}">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="${arrow.path}"/></svg>
        <span>${sign}${delta}%</span>
        <span class="kpi-card__delta-label">${label}</span>
      </span>
    `;
  }

  function renderSparkline(data, variant) {
    if (!data || data.length < 2) return '';
    const width = 120;
    const height = 36;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const stepX = width / (data.length - 1);
    const points = data.map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * (height - 6) - 3;
      return [x, y];
    });
    const pathLine = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const pathArea = `${pathLine} L${width},${height} L0,${height} Z`;
    const lastPoint = points[points.length - 1];
    return `
      <svg class="kpi-card__sparkline kpi-card__sparkline--${variant}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
        <path class="kpi-card__sparkline-area" d="${pathArea}"/>
        <path class="kpi-card__sparkline-line" d="${pathLine}"/>
        <circle class="kpi-card__sparkline-dot" cx="${lastPoint[0].toFixed(1)}" cy="${lastPoint[1].toFixed(1)}" r="2.5"/>
      </svg>
    `;
  }

  async function render(container) {
    container.innerHTML = '<div class="dashboard-view" id="dashboard-view"></div>';
    const loader = window.withDelayedLoader(container);

    state.loading = true;
    const result = await window.api.getDashboardStats();
    state.loading = false;
    loader.hide();

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

    const maxConv = Math.max(1, ...convByDay.map(d => d.count));
    const maxHour = Math.max(1, ...hour);

    const convSpark = convByDay.map(d => d.count || 0);
    const msgSpark = msgByDay.length === 7 ? msgByDay.map(d => d.count || 0) : convSpark;
    const hourSpark = hour.map(c => c || 0);

    const convTrend = trendDelta(convSpark);
    const msgTrend = trendDelta(msgSpark);

    container.innerHTML = `
      <div class="dashboard-view">
        <div class="dashboard-header">
          <div class="view-header__main">
            <div class="view-header__icon">
              <svg viewBox="0 0 24 24"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7zm-4 6h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/></svg>
            </div>
            <div class="view-header__title-block">
              <h1 class="dashboard-header__title">Dashboard</h1>
              <p class="dashboard-header__subtitle">${formatFullDate()}</p>
            </div>
          </div>
        </div>

        <!-- KPI cards: minimalist -->
        <div class="dashboard-stats">
          <div class="kpi-card">
            <div class="kpi-card__label">Conversaciones</div>
            <div class="kpi-card__value">${formatNumber(t.conversations)}</div>
            <div class="kpi-card__row">
              <span class="kpi-card__suffix">${formatNumber(t.active_conversations || 0)} activas</span>
              ${renderTrend(convTrend, 'vs 3 días')}
            </div>
            ${renderSparkline(convSpark, 'primary')}
          </div>

          <div class="kpi-card">
            <div class="kpi-card__label">Mensajes</div>
            <div class="kpi-card__value">${formatNumber(t.messages)}</div>
            <div class="kpi-card__row">
              <span class="kpi-card__suffix">${formatNumber(t.messages_today || 0)} hoy</span>
              ${renderTrend(msgTrend, 'vs 3 días')}
            </div>
            ${renderSparkline(msgSpark, 'info')}
          </div>

          <div class="kpi-card">
            <div class="kpi-card__label">Escalados</div>
            <div class="kpi-card__value">${formatNumber(t.passes)}</div>
            <div class="kpi-card__row">
              <span class="kpi-card__suffix">Conversaciones escaladas</span>
            </div>
            ${renderSparkline(convSpark, 'danger')}
          </div>

          <div class="kpi-card">
            <div class="kpi-card__label">Palabras Frecuentes</div>
            ${kw.length > 0
              ? `<div class="kpi-card__value">${escapeHtml(kw[0].word)}</div>
                <div class="keywords-row">
                  ${kw.slice(1, 4).map(k => `
                    <span class="keyword-pill">
                      ${escapeHtml(k.word)}
                      <span class="keyword-pill__count">${k.count}</span>
                    </span>
                  `).join('')}
                </div>
                ${renderSparkline(msgSpark, 'muted')}`
              : `<div class="kpi-card__value" style="font-size: 18px; color: var(--color-text-muted);">Sin datos</div>
                ${renderSparkline(msgSpark, 'muted')}`}
          </div>
        </div>

        <!-- Charts -->
        <div class="dashboard-charts">
          <div class="chart-card">
            <div class="chart-card__head">
              <div class="chart-card__title-group">
                <h3 class="chart-card__title">Conversaciones por día</h3>
                <p class="chart-card__subtitle">Últimos 7 días</p>
              </div>
              <div class="chart-card__total">${formatNumber(convByDay.reduce((a, b) => a + b.count, 0))}</div>
            </div>
            <div class="chart-bars">
              ${convByDay.map(d => {
                const h = Math.max(2, (d.count / maxConv) * 100);
                return `
                  <div class="chart-bar">
                    <div class="chart-bar__value">${d.count}</div>
                    <div class="chart-bar__fill" style="height: ${h}%"></div>
                    <div class="chart-bar__label">${formatDateShort(d.date)}</div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <div class="chart-card">
            <div class="chart-card__head">
              <div class="chart-card__title-group">
                <h3 class="chart-card__title">Enviados vs Recibidos</h3>
                <p class="chart-card__subtitle">Total mensajes</p>
              </div>
            </div>
            <div class="donut">
              <div class="donut__chart">
                ${renderDonut(sentPct, 100 - sentPct)}
                <div class="donut__center">
                  <div class="donut__total">${formatNumber(totalSvr)}</div>
                  <div class="donut__label">Mensajes</div>
                </div>
              </div>
              <div class="donut__legend">
                <div class="donut__legend-item">
                  <span class="donut__legend-dot donut__legend-dot--sent"></span>
                  <span>Enviados</span>
                  <span class="donut__legend-value">${formatNumber(svr.outbound)}</span>
                  <span class="donut__legend-pct">${sentPct}%</span>
                </div>
                <div class="donut__legend-item">
                  <span class="donut__legend-dot donut__legend-dot--received"></span>
                  <span>Recibidos</span>
                  <span class="donut__legend-value">${formatNumber(svr.inbound)}</span>
                  <span class="donut__legend-pct">${100 - sentPct}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="chart-card" style="margin-bottom: var(--space-6);">
          <div class="chart-card__head">
            <div class="chart-card__title-group">
              <h3 class="chart-card__title">Actividad por hora</h3>
              <p class="chart-card__subtitle">Últimas 24 horas</p>
            </div>
            <div class="chart-card__total">${formatNumber(hour.reduce((a, b) => a + b, 0))}</div>
          </div>
          <div class="hour-chart">
            ${hour.map((count, h) => {
              const hH = count > 0 ? Math.max(2, (count / maxHour) * 100) : 2;
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

        <div class="dashboard-recent">
          <div class="dashboard-recent__head">
            <h3 class="dashboard-recent__title">Últimos mensajes</h3>
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

    bindRecentClicks();
  }

  function renderDonut(sentPct, recvPct) {
    const r = 70;
    const c = 2 * Math.PI * r;
    const sentLen = c * (sentPct / 100);
    const recvLen = c * (recvPct / 100);
    return `
      <svg class="donut__svg" viewBox="0 0 180 180">
        <circle class="donut__track" cx="90" cy="90" r="${r}"/>
        <circle class="donut__segment donut__segment--sent" cx="90" cy="90" r="${r}"
          stroke-dasharray="${sentLen} ${c - sentLen}"
          stroke-dashoffset="0"/>
        <circle class="donut__segment donut__segment--received" cx="90" cy="90" r="${r}"
          stroke-dasharray="${recvLen} ${c - recvLen}"
          stroke-dashoffset="${-sentLen}"/>
      </svg>
    `;
  }

  function bindRecentClicks() {
    const container = document.getElementById('dashboard-view');
    if (!container) return;
    container.querySelectorAll('.recent-item').forEach(el => {
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

  window.dashboardView = { render };
})();
