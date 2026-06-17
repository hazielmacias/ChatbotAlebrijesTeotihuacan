(function() {
  'use strict';

  const API_BASE = window.location.origin;

  // La gestion de tokens/usuarios la maneja auth.js (window.auth)
  // Aqui solo hacemos las llamadas HTTP usando el token actual

  function getAuthToken() {
    if (window.auth && window.auth.getToken) {
      return window.auth.getToken();
    }
    try { return localStorage.getItem('alebrijes_token'); } catch (e) { return null; }
  }

  function clearAuth() {
    if (window.auth && window.auth.clearSession) {
      window.auth.clearSession();
    } else {
      try { localStorage.removeItem('alebrijes_token'); } catch (e) {}
    }
  }

  async function request(method, path, body) {
    const url = API_BASE + path;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const token = getAuthToken();
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }

    const options = {
      method,
      headers,
      credentials: 'same-origin'
    };

    if (body !== undefined && body !== null) {
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(url, options);
    } catch (e) {
      return { ok: false, error: 'Error de conexion', status: 0 };
    }

    let data = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try { data = await response.json(); } catch (e) { data = null; }
    } else {
      try { data = await response.text(); } catch (e) { data = null; }
    }

    if (response.status === 401) {
      clearAuth();
      const onLogin = window.location.pathname === '/login.html' || window.location.pathname === '/' || window.location.pathname === '/index.html';
      if (!onLogin && !path.includes('/api/auth/')) {
        window.location.href = '/login.html';
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
      error: data && data.error ? data.error : null
    };
  }

  const api = {
    // Auth (usado solo internamente; el frontend debe usar window.auth.signIn)
    async login(email, password) {
      const r = await request('POST', '/api/auth/login', { email, password });
      if (r.ok) return { ok: true, data: r.data };
      return { ok: false, error: r.error || 'Error al iniciar sesion' };
    },

    async me() {
      const r = await request('GET', '/api/auth/me');
      if (r.ok) {
        // Notificar a auth para que actualice el dashboard user
        if (window.auth && window.auth.setDashboardUser) {
          window.auth.setDashboardUser(r.data.user);
        }
        return { ok: true, data: r.data };
      }
      return { ok: false, error: r.error };
    },

    // Conversations
    async listConversations(params = {}) {
      const query = new URLSearchParams();
      if (params.page) query.set('page', params.page);
      if (params.limit) query.set('limit', params.limit);
      if (params.status && params.status !== 'all') query.set('status', params.status);
      if (params.search) query.set('search', params.search);
      const qs = query.toString();
      return request('GET', '/api/conversations' + (qs ? '?' + qs : ''));
    },

    async getConversation(id) {
      return request('GET', '/api/conversations/' + encodeURIComponent(id));
    },

    async toggleBot(conversationId, botActive) {
      return request('POST', '/api/conversations/' + encodeURIComponent(conversationId) + '/toggle-bot', {
        bot_active: botActive
      });
    },

    // Messages
    async listMessages(conversationId, params = {}) {
      const query = new URLSearchParams();
      query.set('conversation_id', conversationId);
      if (params.limit) query.set('limit', params.limit);
      if (params.before) query.set('before', params.before);
      return request('GET', '/api/messages?' + query.toString());
    },

    async sendMessage(conversationId, content) {
      return request('POST', '/api/messages/send', {
        conversation_id: conversationId,
        content
      });
    },

    // KPIs
    async getKpis() {
      return request('GET', '/api/kpis');
    },

    // Catalog
    async listCatalog(params = {}) {
      const query = new URLSearchParams();
      if (params.category) query.set('category', params.category);
      if (params.search) query.set('search', params.search);
      if (params.include_inactive) query.set('include_inactive', 'true');
      const qs = query.toString();
      return request('GET', '/api/catalog' + (qs ? '?' + qs : ''));
    },

    async getCatalogItem(id) {
      return request('GET', '/api/catalog/' + encodeURIComponent(id));
    },

    async createCatalogItem(data) {
      return request('POST', '/api/catalog', data);
    },

    async updateCatalogItem(id, data) {
      return request('PATCH', '/api/catalog/' + encodeURIComponent(id), data);
    },

    async deleteCatalogItem(id) {
      return request('DELETE', '/api/catalog/' + encodeURIComponent(id));
    }
  };

  window.api = api;
})();
