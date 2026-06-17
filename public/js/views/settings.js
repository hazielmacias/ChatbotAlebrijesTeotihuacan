(function() {
  'use strict';

  function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  async function render(container) {
    const user = window.auth.getUser();
    const name = window.auth.getUserDisplayName();
    const email = window.auth.getUserEmail();

    container.innerHTML = `
      <div class="app-view">
        <div class="view-header">
          <div>
            <h1 class="view-header__title">Configuracion</h1>
            <p class="view-header__subtitle">Informacion de tu cuenta</p>
          </div>
        </div>

        <div style="max-width: 640px;">
          <div class="card" style="margin-bottom: var(--space-6);">
            <div class="card__header">
              <div>
                <h2 class="card__title">Perfil</h2>
                <p class="card__subtitle">Datos de tu cuenta en el dashboard</p>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: var(--space-5); margin-bottom: var(--space-6); padding: var(--space-5); background: var(--color-bg-elevated); border-radius: var(--radius-md); border: 1px solid var(--color-border);">
              <div class="wa-avatar wa-avatar--primary" style="width:64px; height:64px; font-size: var(--fs-2xl);">${escapeHtml(window.auth.getUserInitials())}</div>
              <div>
                <div style="font-family: var(--font-display); font-size: var(--fs-xl); font-weight: var(--fw-semibold);">${escapeHtml(name)}</div>
                <div style="font-size: var(--fs-sm); color: var(--color-text-muted); margin-top: var(--space-1);">${escapeHtml(email)}</div>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Nombre mostrado</label>
              <div class="form-input" style="background: var(--color-bg-elevated); cursor: not-allowed;">${escapeHtml(name)}</div>
              <p class="form-help">Para cambiar el nombre mostrado, contacta al administrador del sistema.</p>
            </div>

            <div class="form-group">
              <label class="form-label">Correo electronico</label>
              <div class="form-input" style="background: var(--color-bg-elevated); cursor: not-allowed; font-family: monospace;">${escapeHtml(email)}</div>
              <p class="form-help">El correo electronico es tu identificador unico de inicio de sesion.</p>
            </div>

            <div class="form-group">
              <label class="form-label">ID de usuario</label>
              <div class="form-input" style="background: var(--color-bg-elevated); cursor: not-allowed; font-family: monospace; font-size: var(--fs-xs);">${escapeHtml(user?.id || '-')}</div>
            </div>
          </div>

          <div class="card" style="margin-bottom: var(--space-6);">
            <div class="card__header">
              <div>
                <h2 class="card__title">Sesion</h2>
                <p class="card__subtitle">Cerrar sesion en este dispositivo</p>
              </div>
            </div>
            <p style="color: var(--color-text-muted); font-size: var(--fs-sm); margin-bottom: var(--space-4);">
              Al cerrar sesion, seras redirigido a la pantalla de inicio de sesion. Tus credenciales no se eliminan.
            </p>
            <button class="btn btn--danger" id="btn-logout">
              <svg class="btn__icon" viewBox="0 0 24 24"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>
              Cerrar sesion
            </button>
          </div>

          <div class="card">
            <div class="card__header">
              <div>
                <h2 class="card__title">Sistema</h2>
                <p class="card__subtitle">Informacion tecnica del dashboard</p>
              </div>
            </div>
            <div style="display: grid; gap: var(--space-3);">
              <div style="display: flex; justify-content: space-between; padding: var(--space-3) 0; border-bottom: 1px solid var(--color-border);">
                <span style="color: var(--color-text-muted); font-size: var(--fs-sm);">Version del dashboard</span>
                <span style="font-family: monospace; font-size: var(--fs-sm);">1.0.0</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: var(--space-3) 0; border-bottom: 1px solid var(--color-border);">
                <span style="color: var(--color-text-muted); font-size: var(--fs-sm);">Backend</span>
                <span style="font-family: monospace; font-size: var(--fs-sm);">alebrijes-chatbot.vercel.app</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: var(--space-3) 0; border-bottom: 1px solid var(--color-border);">
                <span style="color: var(--color-text-muted); font-size: var(--fs-sm);">Usuario actual</span>
                <span style="font-family: monospace; font-size: var(--fs-sm);">${escapeHtml(email)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: var(--space-3) 0;">
                <span style="color: var(--color-text-muted); font-size: var(--fs-sm);">Navegador</span>
                <span style="font-family: monospace; font-size: var(--fs-sm);">${escapeHtml((navigator.userAgent || '').split(' ').slice(-1)[0] || '-')}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-logout').addEventListener('click', () => {
      if (confirm('Cerrar sesion en este dispositivo?')) {
        window.auth.logout();
      }
    });
  }

  window.settingsView = { render };
})();
