(function() {
  'use strict';

  const router = {
    routes: {},
    currentRoute: null,

    register(name, handler) {
      this.routes[name] = handler;
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

      // Show loading
      if (mainEl) {
        mainEl.innerHTML = '<div class="loading-overlay"><div class="spinner spinner--lg"></div></div>';
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

  // Toast helper
  const toast = {
    container: null,

    init() {
      if (this.container) return;
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    },

    show(message, type = 'info', duration = 4000) {
      this.init();
      const el = document.createElement('div');
      el.className = 'toast toast--' + type;
      el.textContent = message;
      this.container.appendChild(el);
      setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(20px)';
        el.style.transition = 'all 200ms ease';
        setTimeout(() => el.remove(), 200);
      }, duration);
    },

    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error'); },
    warning(msg) { this.show(msg, 'warning'); },
    info(msg) { this.show(msg, 'info'); }
  };

  window.toast = toast;
})();
