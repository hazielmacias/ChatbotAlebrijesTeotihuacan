(function() {
  'use strict';

  let state = {
    plans: [],
    includeInactive: false,
    search: '',
    editingPlan: null,
    modalOpen: false,
    confirmCallback: null
  };

  function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function formatPrice(n) {
    if (n == null) return '-';
    return '$' + new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  async function render(container) {
    container.innerHTML = `
      <div class="app-view">
        <div class="view-header">
          <div>
            <h1 class="view-header__title">Catalogo de planes</h1>
            <p class="view-header__subtitle">Administra los planes visibles para el bot y el dashboard</p>
          </div>
          <div class="view-header__actions">
            <label style="display: flex; align-items: center; gap: var(--space-2); font-size: var(--fs-sm); color: var(--color-text-muted); cursor: pointer;">
              <input type="checkbox" id="include-inactive" ${state.includeInactive ? 'checked' : ''} style="accent-color: var(--color-primary);">
              Mostrar inactivos
            </label>
            <button class="btn btn--primary" id="btn-new-plan">
              <svg class="btn__icon" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              Nuevo plan
            </button>
          </div>
        </div>

        <div class="toolbar" style="display: flex; gap: var(--space-3); margin-bottom: var(--space-4);">
          <div class="wa-search" style="flex: 1; max-width: 400px; padding: 0; background: transparent; border: 0;">
            <div class="wa-search__input-wrap">
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
              <input type="text" class="wa-search__input" id="plan-search" placeholder="Buscar por nombre, categoria o descripcion" value="${escapeHtml(state.search)}" autocomplete="off">
            </div>
          </div>
        </div>

        <div class="loading-overlay"><div class="spinner spinner--lg"></div></div>
      </div>
    `;

    document.getElementById('btn-new-plan').addEventListener('click', () => openModal(null));
    document.getElementById('include-inactive').addEventListener('change', async (e) => {
      state.includeInactive = e.target.checked;
      await loadPlans();
    });

    const searchInput = document.getElementById('plan-search');
    let searchTimer = null;
    searchInput.addEventListener('input', (e) => {
      const value = e.target.value;
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        state.search = value.trim();
        await loadPlans();
      }, 300);
    });

    await loadPlans();
  }

  async function loadPlans() {
    const params = {};
    if (state.includeInactive) params.include_inactive = true;
    if (state.search) params.search = state.search;

    const result = await window.api.listCatalog(params);
    if (!result.ok) {
      const main = document.querySelector('.app-view');
      if (main) {
        const oldErr = main.querySelector('.empty-state');
        if (oldErr) oldErr.remove();
        main.appendChild(buildError(result.error || 'desconocido'));
      }
      return;
    }

    state.plans = result.data.plans || [];
    renderTable();
  }

  function buildError(msg) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <h3 class="empty-state__title">Error al cargar</h3>
      <p class="empty-state__message">${escapeHtml(msg)}</p>
    `;
    return empty;
  }

  function renderTable() {
    const main = document.querySelector('.app-view');
    if (!main) return;
    const existingTable = main.querySelector('.table-wrap');
    if (existingTable) existingTable.remove();
    const existingEmpty = main.querySelector('.empty-state');
    if (existingEmpty) existingEmpty.remove();
    const loading = main.querySelector('.loading-overlay');
    if (loading) loading.remove();

    if (state.plans.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = state.search
        ? '<h3 class="empty-state__title">Sin resultados</h3><p class="empty-state__message">No se encontraron planes con "' + escapeHtml(state.search) + '".</p>'
        : '<h3 class="empty-state__title">Sin planes</h3><p class="empty-state__message">Crea el primer plan para que aparezca en el catalogo.</p>';
      main.appendChild(empty);
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    wrap.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Categoria</th>
            <th>Precio</th>
            <th>Estado</th>
            <th>Creado</th>
            <th style="text-align: right;">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${state.plans.map(p => {
            const rowStyle = p.is_active ? '' : 'style="opacity: 0.55;"';
            const statusBadge = p.is_active
              ? '<span class="badge badge--active">Activo</span>'
              : '<span class="badge badge--inactive">Inactivo</span>';
            const toggleLabel = p.is_active ? 'Desactivar' : 'Activar';
            const toggleClass = p.is_active ? 'btn--danger-soft' : 'btn--success-soft';
            return `
              <tr data-id="${p.id}" ${rowStyle}>
                <td>
                  <div style="font-weight: var(--fw-medium); color: var(--color-text);">${escapeHtml(p.name)}</div>
                  ${p.description ? `<div style="font-size: var(--fs-xs); color: var(--color-text-muted); margin-top: 2px; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(p.description)}</div>` : ''}
                </td>
                <td>${p.category ? `<span class="badge badge--bot">${escapeHtml(p.category)}</span>` : '<span style="color: var(--color-text-dim);">-</span>'}</td>
                <td style="font-weight: var(--fw-semibold);">${formatPrice(p.price)}</td>
                <td>${statusBadge}</td>
                <td style="color: var(--color-text-muted); font-size: var(--fs-sm);">${formatDate(p.created_at)}</td>
                <td>
                  <div class="table__actions">
                    <button class="btn btn--ghost btn--sm" data-action="edit" data-id="${p.id}">Editar</button>
                    <button class="btn btn--ghost btn--sm ${toggleClass}" data-action="toggle" data-id="${p.id}" style="font-weight: var(--fw-semibold);">${toggleLabel}</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
    main.appendChild(wrap);

    wrap.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const plan = state.plans.find(p => p.id === id);
        if (plan) openModal(plan);
      });
    });
    wrap.querySelectorAll('[data-action="toggle"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const plan = state.plans.find(p => p.id === id);
        if (plan) confirmToggle(plan);
      });
    });
  }

  function openModal(plan) {
    state.editingPlan = plan;
    state.modalOpen = true;

    const isEdit = !!plan;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop modal-backdrop--open';
    backdrop.id = 'catalog-modal';
    backdrop.innerHTML = `
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal__header">
          <h3 class="modal__title">${isEdit ? 'Editar plan' : 'Nuevo plan'}</h3>
          <button class="modal__close" id="modal-close" aria-label="Cerrar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
        <form id="plan-form">
          <div class="modal__body">
            <div class="form-group">
              <label class="form-label" for="plan-name">Nombre<span class="form-label__required">*</span></label>
              <input type="text" id="plan-name" class="form-input" value="${escapeHtml(plan?.name || '')}" maxlength="100" required>
            </div>
            <div class="form-group">
              <label class="form-label" for="plan-category">Categoria</label>
              <input type="text" id="plan-category" class="form-input" value="${escapeHtml(plan?.category || '')}" maxlength="50" placeholder="ej. escuela, tdp, piloto">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label class="form-label" for="plan-price">Precio (MXN)</label>
                <input type="number" id="plan-price" class="form-input" value="${plan?.price ?? ''}" min="0" step="0.01" placeholder="0.00">
              </div>
              <div class="form-group">
                <label class="form-label" for="plan-active">Estado</label>
                <select id="plan-active" class="form-select" ${!isEdit ? 'disabled' : ''}>
                  <option value="true" ${plan?.is_active !== false ? 'selected' : ''}>Activo</option>
                  <option value="false" ${plan?.is_active === false ? 'selected' : ''}>Inactivo</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label" for="plan-image">URL de imagen</label>
              <input type="url" id="plan-image" class="form-input" value="${escapeHtml(plan?.image_url || '')}" placeholder="https://...">
            </div>
            <div class="form-group">
              <label class="form-label" for="plan-description">Descripcion</label>
              <textarea id="plan-description" class="form-textarea" maxlength="5000" rows="3">${escapeHtml(plan?.description || '')}</textarea>
            </div>
          </div>
          <div class="modal__footer">
            <button type="button" class="btn btn--secondary" id="modal-cancel">Cancelar</button>
            <button type="submit" class="btn btn--primary" id="modal-save">${isEdit ? 'Guardar cambios' : 'Crear plan'}</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(backdrop);

    const close = () => {
      backdrop.remove();
      state.editingPlan = null;
      state.modalOpen = false;
    };

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
    document.getElementById('modal-close').addEventListener('click', close);
    document.getElementById('modal-cancel').addEventListener('click', close);
    document.getElementById('plan-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await savePlan(close);
    });

    setTimeout(() => document.getElementById('plan-name').focus(), 50);
  }

  async function savePlan(close) {
    const name = document.getElementById('plan-name').value.trim();
    const category = document.getElementById('plan-category').value.trim();
    const priceVal = document.getElementById('plan-price').value;
    const activeVal = document.getElementById('plan-active').value;
    const imageUrl = document.getElementById('plan-image').value.trim();
    const description = document.getElementById('plan-description').value.trim();
    const saveBtn = document.getElementById('modal-save');

    if (!name) {
      window.toast.error('El nombre es obligatorio');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';

    const payload = {
      name,
      description: description || null,
      category: category || null,
      image_url: imageUrl || null
    };
    if (priceVal !== '' && priceVal !== null) {
      const n = Number(priceVal);
      if (!Number.isFinite(n) || n < 0) {
        window.toast.error('Precio invalido');
        saveBtn.disabled = false;
        saveBtn.textContent = state.editingPlan ? 'Guardar cambios' : 'Crear plan';
        return;
      }
      payload.price = n;
    } else {
      payload.price = null;
    }
    if (state.editingPlan) {
      payload.is_active = activeVal === 'true';
    }

    let result;
    if (state.editingPlan) {
      result = await window.api.updateCatalogItem(state.editingPlan.id, payload);
    } else {
      result = await window.api.createCatalogItem(payload);
    }

    saveBtn.disabled = false;
    saveBtn.textContent = state.editingPlan ? 'Guardar cambios' : 'Crear plan';

    if (!result.ok) {
      window.toast.error('Error: ' + (result.error || 'desconocido'));
      return;
    }

    window.toast.success(state.editingPlan ? 'Plan actualizado' : 'Plan creado');
    close();
    await loadPlans();
  }

  function confirmToggle(plan) {
    const isActive = !!plan.is_active;
    const action = isActive ? 'desactivar' : 'activar';
    const actionCap = isActive ? 'Desactivar' : 'Activar';
    openConfirm({
      title: actionCap + ' plan',
      message: isActive
        ? 'El plan "' + plan.name + '" dejara de ser visible para el bot y el dashboard. Los datos no se eliminan.'
        : 'El plan "' + plan.name + '" sera visible nuevamente para el bot y el dashboard.',
      confirmText: actionCap,
      confirmVariant: isActive ? 'danger' : 'primary',
      onConfirm: async () => {
        if (isActive) {
          const result = await window.api.deleteCatalogItem(plan.id);
          if (!result.ok) {
            window.toast.error('Error: ' + (result.error || 'desconocido'));
            return;
          }
          window.toast.success('Plan desactivado');
        } else {
          const result = await window.api.updateCatalogItem(plan.id, { is_active: true });
          if (!result.ok) {
            window.toast.error('Error: ' + (result.error || 'desconocido'));
            return;
          }
          window.toast.success('Plan activado');
        }
        await loadPlans();
      }
    });
  }

  function openConfirm(opts) {
    closeConfirm();
    state.confirmCallback = opts.onConfirm;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop modal-backdrop--open';
    backdrop.id = 'confirm-modal';
    const variant = opts.confirmVariant || 'primary';
    const confirmBtnClass = variant === 'danger' ? 'btn--danger' : 'btn--primary';
    backdrop.innerHTML = `
      <div class="modal" style="max-width: 420px;" onclick="event.stopPropagation()">
        <div class="modal__header">
          <h3 class="modal__title">${escapeHtml(opts.title || 'Confirmar')}</h3>
        </div>
        <div class="modal__body">
          <p style="color: var(--color-text-muted); line-height: 1.5; margin: 0;">${escapeHtml(opts.message || '')}</p>
        </div>
        <div class="modal__footer">
          <button type="button" class="btn btn--secondary" id="confirm-cancel">Cancelar</button>
          <button type="button" class="btn ${confirmBtnClass}" id="confirm-ok">${escapeHtml(opts.confirmText || 'Confirmar')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);

    const close = () => closeConfirm();
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
    document.getElementById('confirm-cancel').addEventListener('click', close);
    document.getElementById('confirm-ok').addEventListener('click', async () => {
      const cb = state.confirmCallback;
      close();
      if (typeof cb === 'function') await cb();
    });
  }

  function closeConfirm() {
    const m = document.getElementById('confirm-modal');
    if (m) m.remove();
    state.confirmCallback = null;
  }

  window.catalogView = { render };
})();
