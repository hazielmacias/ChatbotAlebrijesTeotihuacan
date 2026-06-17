(function() {
  'use strict';

  const TOKEN_KEY = 'alebrijes_token';
  const USER_KEY = 'alebrijes_user';
  const DASH_USER_KEY = 'alebrijes_dash_user';

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }

  function setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }

  function getSupabaseUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function setSupabaseUser(user) {
    try {
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
      else localStorage.removeItem(USER_KEY);
    } catch (e) {}
  }

  function getDashboardUser() {
    try {
      const raw = localStorage.getItem(DASH_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function setDashboardUser(user) {
    try {
      if (user) localStorage.setItem(DASH_USER_KEY, JSON.stringify(user));
      else localStorage.removeItem(DASH_USER_KEY);
    } catch (e) {}
  }

  function clearSession() {
    setToken(null);
    setSupabaseUser(null);
    setDashboardUser(null);
  }

  async function signIn(email, password) {
    if (!window.supabaseClient) {
      return { ok: false, error: 'Supabase no esta inicializado. Recarga la pagina.' };
    }
    const result = await window.supabaseClient.signIn(email, password);
    if (!result.ok) {
      return { ok: false, error: result.error };
    }
    setToken(result.accessToken);
    setSupabaseUser(result.user);
    // Cargar datos de dashboard_users
    const dashData = await fetchDashboardUser();
    if (dashData) setDashboardUser(dashData);
    return { ok: true, user: result.user, dashboardUser: dashData };
  }

  async function signOut() {
    if (window.supabaseClient) {
      await window.supabaseClient.signOut();
    }
    clearSession();
    return { ok: true };
  }

  async function fetchDashboardUser() {
    // Pedir al backend el perfil del dashboard user actual
    try {
      const r = await fetch('/api/auth/me', {
        headers: {
          'Authorization': 'Bearer ' + getToken(),
          'Accept': 'application/json'
        }
      });
      if (!r.ok) return null;
      const data = await r.json();
      // El endpoint devuelve { user: {auth user}, profile: {display_name} }
      // Combinamos para tener un objeto unificado
      if (data.profile) {
        return {
          id: data.profile.id,
          display_name: data.profile.display_name,
          email: data.user?.email,
          auth_user_id: data.user?.id,
          created_at: data.profile.created_at
        };
      }
      return data.user || null;
    } catch (e) {
      return null;
    }
  }

  async function getSession() {
    if (!window.supabaseClient) return { ok: false, error: 'Supabase no inicializado' };
    return await window.supabaseClient.getSession();
  }

  function onAuthStateChange(callback) {
    if (!window.supabaseClient) return null;
    return window.supabaseClient.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        clearSession();
      } else if (event === 'SIGNED_IN' && session) {
        setToken(session.access_token);
        setSupabaseUser(session.user);
      }
      callback(event, session);
    });
  }

  async function requireAuth() {
    // Primero verificar token local
    if (!getToken()) {
      window.location.href = '/login.html';
      return false;
    }
    // Validar contra el backend
    const dashData = await fetchDashboardUser();
    if (!dashData) {
      clearSession();
      window.location.href = '/login.html';
      return false;
    }
    setDashboardUser(dashData);
    return true;
  }

  function logout() {
    signOut().then(() => {
      window.location.href = '/login.html';
    });
  }

  function getUser() {
    const supa = getSupabaseUser();
    const dash = getDashboardUser();
    return {
      ...(supa || {}),
      ...(dash || {}),
      email: supa?.email || dash?.email,
      id: supa?.id || dash?.id
    };
  }

  function getUserDisplayName() {
    let raw = null;
    const dash = getDashboardUser();
    if (dash && dash.display_name) raw = dash.display_name;
    if (!raw) {
      const supa = getSupabaseUser();
      if (supa) {
        const meta = supa.user_metadata || {};
        if (meta.display_name) raw = meta.display_name;
      }
    }
    if (!raw) {
      const user = getUser();
      if (user && user.email) {
        raw = user.email.split('@')[0];
      }
    }
    if (!raw) return 'Usuario';
    return raw.trim().split(/\s+/)[0];
  }

  function getUserEmail() {
    const supa = getSupabaseUser();
    if (supa && supa.email) return supa.email;
    const user = getUser();
    return user?.email || '';
  }

  function getUserInitials() {
    const name = getUserDisplayName();
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // Exponer API publica
  window.auth = {
    signIn,
    signOut,
    logout,
    getSession,
    onAuthStateChange,
    requireAuth,
    isAuthenticated() { return !!getToken(); },
    getUser,
    getUserDisplayName,
    getUserEmail,
    getUserInitials,
    getToken,
    setToken,
    setDashboardUser,
    getDashboardUser,
    clearSession
  };
})();
