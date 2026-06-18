(function() {
  'use strict';

  let state = {
    templates: [],
    loading: false,
    editing: null
  };

  function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  async function render(container) {
    container.innerHTML = `
      <div class="app-view" id="settings-view">
        <div class="view-header">
          <div>
            <h1 class="view-header__title">Ajustes</h1>
            <p class="view-header__subtitle">Edita las plantillas de mensajes del bot</p>
          </div>
        </div>
      </div>
    `;
    const loader = window.withDelayedLoader(container);

    state.loading = true;
    const result = await window.api.getTemplates();
    state.loading = false;
    loader.hide();

    if (!result.ok) {
      container.innerHTML = `
        <div class="app-view">
          <div class="empty-state">
            <h3 class="empty-state__title">Error al cargar plantillas</h3>
            <p class="empty-state__message">${escapeHtml(result.error || 'desconocido')}</p>
          </div>
        </div>
      `;
      return;
    }

    state.templates = result.data.templates || [];
    paint(container);
  }

  function paint(container) {
    container.innerHTML = `
      <div class="app-view">
        <div class="view-header">
          <div>
            <h1 class="view-header__title">Ajustes</h1>
            <p class="view-header__subtitle">Edita las plantillas de mensajes del bot</p>
          </div>
        </div>

        <div class="settings-grid">
          <aside class="settings-sidebar">
            <h3 class="settings-sidebar__title">Plantillas</h3>
            <ul class="settings-list">
              ${state.templates.map(t => `
                <li class="settings-list__item ${state.editing && state.editing.key === t.key ? 'settings-list__item--active' : ''}" data-key="${escapeHtml(t.key)}">
                  <div class="settings-list__name">${escapeHtml(formatKey(t.key))}</div>
                  <div class="settings-list__desc">${escapeHtml(t.description || '')}</div>
                  ${t.is_default ? '<span class="settings-list__badge">default</span>' : ''}
                </li>
              `).join('')}
            </ul>
          </aside>

          <div class="settings-content" id="settings-content">
            <div class="empty-state" style="padding: var(--space-8);">
              <p class="empty-state__message">Selecciona una plantilla para editar</p>
            </div>
          </div>
        </div>
      </div>
    `;

    container.querySelectorAll('.settings-list__item').forEach(li => {
      li.addEventListener('click', () => {
        const key = li.dataset.key;
        const tpl = state.templates.find(t => t.key === key);
        if (tpl) {
          state.editing = { ...tpl };
          paint(container);
          renderEditor(container);
        }
      });
    });

    if (state.editing) {
      renderEditor(container);
    }
  }

  function renderEditor(container) {
    const content = container.querySelector('#settings-content');
    if (!content || !state.editing) return;

    const t = state.editing;
    const vars = (t.variables || []).map(v => `<code>${escapeHtml(v)}</code>`).join(', ');

    content.innerHTML = `
      <div class="template-editor">
        <div class="template-editor__head">
          <div>
            <h3 class="template-editor__title">${escapeHtml(formatKey(t.key))}</h3>
            <p class="template-editor__desc">${escapeHtml(t.description || '')}</p>
          </div>
          <div class="template-editor__actions">
            <button class="btn btn--secondary btn--sm" id="btn-revert">Revertir</button>
            <button class="btn btn--primary btn--sm" id="btn-save">Guardar cambios</button>
          </div>
        </div>

        <div class="template-editor__vars">
          <strong>Variables:</strong> ${vars || '<em>ninguna</em>'}
        </div>

        <textarea id="template-content" class="template-editor__textarea" rows="14" spellcheck="false">${escapeHtml(t.content)}</textarea>

        <div class="template-editor__preview" id="template-preview">
          <div class="template-editor__preview-label">Vista previa (como lo ve el contacto)</div>
          <div class="template-editor__preview-bubble" id="template-preview-bubble"></div>
        </div>
      </div>
    `;

    const textarea = content.querySelector('#template-content');
    const preview = content.querySelector('#template-preview-bubble');

    function updatePreview() {
      let text = textarea.value;
      // Reemplazar variables con valores de ejemplo
      text = text.replace(/\{\{(\w+)\}\}/g, (m, name) => {
        const samples = {
          name: 'Juan Pérez',
          category: 'escuela',
          phone: '+52 55 1234 5678',
          date: '15 de junio'
        };
        return samples[name] || m;
      });
      preview.innerHTML = text.replace(/\n/g, '<br>').replace(/\*(.*?)\*/g, '<strong>$1</strong>');
    }
    updatePreview();
    textarea.addEventListener('input', updatePreview);

    content.querySelector('#btn-revert').addEventListener('click', () => {
      const original = state.templates.find(t => t.key === t.key);
      if (original) {
        state.editing.content = original.content;
        renderEditor(container);
      }
    });

    content.querySelector('#btn-save').addEventListener('click', async () => {
      const saveBtn = content.querySelector('#btn-save');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando...';

      const result = await window.api.saveTemplate({
        key: t.key,
        description: t.description,
        content: textarea.value,
        variables: t.variables || []
      });

      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar cambios';

      if (!result.ok) {
        window.toast.error('Error: ' + (result.error || 'desconocido'));
        return;
      }

      // Actualizar el template en state
      const idx = state.templates.findIndex(x => x.key === t.key);
      if (idx >= 0) {
        state.templates[idx] = result.data.template;
        state.editing = { ...result.data.template };
      }
      window.toast.success('Plantilla guardada');
      paint(container);
    });
  }

  function formatKey(key) {
    return key.split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' / ');
  }

  window.settingsView = { render };
})();
