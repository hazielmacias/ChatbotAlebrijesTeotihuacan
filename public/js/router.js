(function() {
  'use strict';

  const router = {
    routes: {},
    currentRoute: null,
    _beforeHooks: [],

    register(name, handler) {
      this.routes[name] = handler;
    },

    onBeforeNavigate(hook) {
      if (typeof hook === 'function') {
        this._beforeHooks.push(hook);
      }
    },

    _runBeforeHooks() {
      this._beforeHooks.forEach((hook) => {
        try { hook(); }
        catch (e) { console.warn('[router] beforeNavigate hook error:', e); }
      });
    },

    async navigate(name) {
      if (location.hash !== '#' + name) {
        location.hash = name;
        return; // hashchange will trigger navigate again
      }
      await this._execute(name);
    },

    async _execute(name) {
      const handler = this.routes[name];
      const mainEl = document.getElementById('view-container');

      if (!handler) {
        if (mainEl) {
          mainEl.innerHTML = '<div class="empty-state"><h2 class="empty-state__title">404</h2><p class="empty-state__message">Vista no encontrada</p></div>';
        }
        return;
      }

      this._runBeforeHooks();

      this.currentRoute = name;

      // Update nav active state
      document.querySelectorAll('.app-nav__link').forEach(link => {
        const route = link.getAttribute('data-route');
        if (route === name) {
          link.classList.add('app-nav__link--active');
        } else {
          link.classList.remove('app-nav__link--active');
        }
      });

      // Cleanup realtime channel if conversation view
      if (window.conversationsView && window.conversationsView.cleanup) {
        if (name !== 'conversations') {
          window.conversationsView.cleanup();
        }
      }

      try {
        await handler(mainEl);
      } catch (e) {
        console.error('Router error for', name, e);
        if (mainEl) {
          mainEl.innerHTML = '<div class="empty-state"><h2 class="empty-state__title">Error</h2><p class="empty-state__message">' + (e.message || 'Error desconocido') + '</p></div>';
        }
      }
    },

    init(defaultRoute) {
      const handleHash = () => {
        const hash = location.hash.replace(/^#/, '') || defaultRoute;
        this._execute(hash);
      };

      window.addEventListener('hashchange', handleHash);

      // Click handlers for nav links
      document.querySelectorAll('.app-nav__link[data-route]').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const route = link.getAttribute('data-route');
          this.navigate(route);
        });
      });

      handleHash();
    }
  };

  window.router = router;

  // Delayed loader: appends a loading overlay inside parent if the operation takes longer than delayMs.
  // Use this in views so fast menu navigation does not flash a loading screen.
  window.withDelayedLoader = function(parent, delayMs) {
    delayMs = delayMs || 300;
    let shown = false;
    let timeoutId = null;
    let loaderEl = null;

    const show = function() {
      shown = true;
      if (parent) {
        loaderEl = document.createElement('div');
        loaderEl.className = 'loading-overlay';
        loaderEl.setAttribute('role', 'status');
        loaderEl.setAttribute('aria-label', 'Cargando');
        loaderEl.innerHTML = '<div class="brand-loader"><img class="brand-loader__logo" src="/logo-alebrijes.png" alt=""></div>';
        parent.appendChild(loaderEl);
      }
    };

    timeoutId = setTimeout(show, delayMs);

    return {
      hide: function() {
        clearTimeout(timeoutId);
        if (loaderEl && loaderEl.parentNode) {
          loaderEl.remove();
        }
        shown = false;
      },
      shown: function() { return shown; }
    };
  };

  // Iconos SVG inline por tipo de notificacion
  const TOAST_ICONS = {
    success: '<svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>',
    error: '<svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    warning: '<svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>',
    info: '<svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>'
  };

  const MODAL_ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>'
  };

  // Toast helper
  const toast = {
    container: null,

    init() {
      if (this.container) return;
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    },

    show(message, type = 'info', duration) {
      this.init();
      const el = document.createElement('div');
      el.className = 'toast toast--' + type;
      el.setAttribute('role', type === 'error' ? 'alert' : 'status');
      const dur = (duration != null) ? duration : (type === 'error' ? 6000 : 4000);
      el.innerHTML = (TOAST_ICONS[type] || TOAST_ICONS.info) + '<span class="toast__message"></span>';
      el.querySelector('.toast__message').textContent = String(message);
      this.container.appendChild(el);
      setTimeout(() => {
        el.classList.add('toast--leaving');
        setTimeout(() => { if (el.parentNode) el.remove(); }, 220);
      }, dur);
    },

    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error'); },
    warning(msg) { this.show(msg, 'warning'); },
    info(msg) { this.show(msg, 'info'); },

    // Errores graves que merecen un modal en vez de un toast efimero.
    alert(message, opts) {
      const o = opts || {};
      return modal.alert({
        title: o.title || 'Atencion',
        message: message,
        type: o.type || 'error',
        buttonText: o.buttonText || 'Aceptar'
      });
    }
  };

  window.toast = toast;

  // Modal helper (alerta y confirmacion con diseno del dashboard)
  const modal = {
    open(opts) {
      const type = opts.type || 'info';
      const iconHtml = MODAL_ICONS[type] || MODAL_ICONS.info;

      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop';

      const m = document.createElement('div');
      m.className = 'modal';
      m.setAttribute('role', 'dialog');
      m.setAttribute('aria-modal', 'true');
      m.innerHTML =
        '<div class="modal__header">' +
          '<div class="modal__heading">' +
            '<span class="modal__icon modal__icon--' + type + '">' + iconHtml + '</span>' +
            '<h2 class="modal__title"></h2>' +
          '</div>' +
          '<button type="button" class="modal__close" aria-label="Cerrar">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="modal__body"></div>' +
        '<div class="modal__footer"></div>';

      m.querySelector('.modal__title').textContent = opts.title || '';
      m.querySelector('.modal__body').textContent = opts.message || '';

      const footer = m.querySelector('.modal__footer');
      const buttons = [];
      const close = (result) => {
        backdrop.classList.remove('modal-backdrop--open');
        setTimeout(() => { if (backdrop.parentNode) backdrop.remove(); }, 220);
        document.removeEventListener('keydown', onKey);
        buttons.forEach(b => b._resolve(result));
      };
      const onKey = (e) => { if (e.key === 'Escape') close(false); };

      m.querySelector('.modal__close').addEventListener('click', () => close(false));

      (opts.buttons || []).forEach(btn => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn ' + (btn.variant === 'primary' ? 'btn--primary' : 'btn--secondary');
        b.textContent = btn.text || 'OK';
        b.addEventListener('click', () => close(btn.value !== undefined ? btn.value : true));
        footer.appendChild(b);
        buttons.push(b);
      });

      backdrop.appendChild(m);
      document.body.appendChild(backdrop);
      requestAnimationFrame(() => backdrop.classList.add('modal-backdrop--open'));
      document.addEventListener('keydown', onKey);

      // Foco al primer boton
      setTimeout(() => {
        const first = buttons[0];
        if (first) first.focus();
      }, 50);

      // Click fuera del modal cierra como cancelacion
      backdrop.addEventListener('mousedown', (e) => {
        if (e.target === backdrop) close(false);
      });

      return { close, buttons };
    },

    alert(opts) {
      const o = (typeof opts === 'string') ? { message: opts } : (opts || {});
      const promise = new Promise((resolve) => {
        const handle = this.open({
          title: o.title || 'Aviso',
          message: o.message || '',
          type: o.type || 'info',
          buttons: [{ text: o.buttonText || 'Aceptar', variant: 'primary', value: true }]
        });
        handle.buttons[0]._resolve = resolve;
      });
      return promise;
    },

    confirm(opts) {
      const o = (typeof opts === 'string') ? { message: opts } : (opts || {});
      return new Promise((resolve) => {
        const handle = this.open({
          title: o.title || 'Confirmar',
          message: o.message || '',
          type: o.type || 'warning',
          buttons: [
            { text: o.cancelText || 'Cancelar', variant: 'secondary', value: false },
            { text: o.confirmText || 'Confirmar', variant: 'primary', value: true }
          ]
        });
        handle.buttons[0]._resolve = resolve;
        handle.buttons[1]._resolve = resolve;
      });
    }
  };

  window.modal = modal;
})();
