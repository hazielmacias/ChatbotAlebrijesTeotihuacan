(function() {
  'use strict';

  const auth = {
    isAuthenticated() {
      return !!window.api.getToken();
    },

    setSession(token, user) {
      window.api.setToken(token);
      window.api.setUser(user);
    },

    getUser() {
      return window.api.getUser();
    },

    async requireAuth() {
      if (!this.isAuthenticated()) {
        window.location.href = '/';
        return false;
      }

      // Validar token contra el servidor
      const result = await window.api.me();
      if (!result.ok) {
        window.api.clearSession();
        window.location.href = '/';
        return false;
      }
      return true;
    },

    logout() {
      window.api.clearSession();
      window.location.href = '/';
    },

    getUserDisplayName() {
      const user = this.getUser();
      if (!user) return '';
      // dashboard_users record has display_name; auth user has email
      return user.display_name || user.email || 'Usuario';
    },

    getUserEmail() {
      const user = this.getUser();
      if (!user) return '';
      return user.email || '';
    },

    getUserInitials() {
      const name = this.getUserDisplayName();
      if (!name) return 'U';
      const parts = name.split(/[\s@.]+/).filter(Boolean);
      if (parts.length === 0) return 'U';
      if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
  };

  window.auth = auth;
})();
