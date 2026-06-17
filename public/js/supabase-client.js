(function() {
  'use strict';

  if (!window.SUPABASE_CONFIG) {
    console.error('[supabase-client] SUPABASE_CONFIG no encontrado. Asegurate de cargar config.js primero.');
    return;
  }

  const SUPABASE_URL = window.SUPABASE_CONFIG.url;
  const SUPABASE_ANON_KEY = window.SUPABASE_CONFIG.anonKey;

  let clientInstance = null;
  let activeChannels = [];
  let initialized = false;

  function isReady() {
    return typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function';
  }

  function getClient() {
    if (clientInstance) return clientInstance;

    if (!isReady()) {
      throw new Error('Supabase JS no esta cargado. Incluir el CDN antes de este script.');
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('SUPABASE_URL o SUPABASE_ANON_KEY faltantes en config.js');
    }

    clientInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storage: window.localStorage,
        storageKey: 'alebrijes-supabase-auth',
        flowType: 'pkce'
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      },
      global: {
        headers: {
          'x-application-name': 'alebrijes-dashboard'
        }
      }
    });

    initialized = true;
    return clientInstance;
  }

  function waitForSupabase(timeout) {
    return new Promise((resolve, reject) => {
      if (isReady()) {
        resolve();
        return;
      }
      const start = Date.now();
      const interval = setInterval(() => {
        if (isReady()) {
          clearInterval(interval);
          resolve();
        } else if (Date.now() - start > (timeout || 10000)) {
          clearInterval(interval);
          reject(new Error('Supabase JS no se cargo en ' + (timeout || 10000) + 'ms'));
        }
      }, 50);
    });
  }

  // ========== Auth ==========

  async function signIn(email, password) {
    try {
      await waitForSupabase();
      const client = getClient();
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) {
        return { ok: false, error: error.message, code: error.code };
      }
      return {
        ok: true,
        user: data.user,
        session: data.session,
        accessToken: data.session?.access_token
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async function signOut() {
    try {
      const client = getClient();
      const { error } = await client.auth.signOut();
      if (error) {
        return { ok: false, error: error.message };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async function getSession() {
    try {
      const client = getClient();
      const { data, error } = await client.auth.getSession();
      if (error) {
        return { ok: false, error: error.message };
      }
      return {
        ok: true,
        session: data.session,
        user: data.session?.user || null,
        accessToken: data.session?.access_token || null
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  function onAuthStateChange(callback) {
    try {
      const client = getClient();
      const { data } = client.auth.onAuthStateChange((event, session) => {
        try {
          callback(event, session);
        } catch (e) {
          console.error('[supabase-client] onAuthStateChange callback error:', e);
        }
      });
      return data?.subscription;
    } catch (e) {
      console.error('[supabase-client] onAuthStateChange error:', e);
      return null;
    }
  }

  // ========== Realtime ==========

  function _trackChannel(name, channel) {
    activeChannels.push({ name, channel });
    return channel;
  }

  function _untrackChannel(channel) {
    const idx = activeChannels.findIndex(c => c.channel === channel);
    if (idx >= 0) activeChannels.splice(idx, 1);
  }

  function subscribeToMessages(conversationId, onMessage) {
    if (!conversationId) return null;
    if (typeof onMessage !== 'function') {
      console.warn('[supabase-client] onMessage debe ser funcion');
      return null;
    }

    try {
      const client = getClient();
      const channelName = 'messages-' + conversationId;
      const channel = client
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: 'conversation_id=eq.' + conversationId
          },
          (payload) => {
            try {
              onMessage(payload.new, payload);
            } catch (e) {
              console.error('[supabase-client] messages callback error:', e);
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('[supabase-client] Suscrito a', channelName);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn('[supabase-client] Estado canal', channelName, ':', status);
          }
        });

      return _trackChannel(channelName, channel);
    } catch (e) {
      console.error('[supabase-client] subscribeToMessages error:', e);
      return null;
    }
  }

  function subscribeToConversations(onChange) {
    if (typeof onChange !== 'function') {
      console.warn('[supabase-client] onChange debe ser funcion');
      return null;
    }

    try {
      const client = getClient();
      const channelName = 'conversations-all';
      const channel = client
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'conversations'
          },
          (payload) => {
            try {
              onChange(payload);
            } catch (e) {
              console.error('[supabase-client] conversations callback error:', e);
            }
          }
        )
        .subscribe();

      return _trackChannel(channelName, channel);
    } catch (e) {
      console.error('[supabase-client] subscribeToConversations error:', e);
      return null;
    }
  }

  function subscribeToAllMessages(onInsert) {
    if (typeof onInsert !== 'function') {
      console.warn('[supabase-client] onInsert debe ser funcion');
      return null;
    }

    try {
      const client = getClient();
      const channelName = 'messages-all';
      const channel = client
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages'
          },
          (payload) => {
            try {
              onInsert(payload.new, payload);
            } catch (e) {
              console.error('[supabase-client] all-messages callback error:', e);
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('[supabase-client] Suscrito a', channelName);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn('[supabase-client] Estado canal', channelName, ':', status);
          }
        });

      return _trackChannel(channelName, channel);
    } catch (e) {
      console.error('[supabase-client] subscribeToAllMessages error:', e);
      return null;
    }
  }

  function unsubscribe(channel) {
    try {
      const client = getClient();
      if (channel) {
        client.removeChannel(channel);
        _untrackChannel(channel);
      }
    } catch (e) {
      console.error('[supabase-client] unsubscribe error:', e);
    }
  }

  function unsubscribeAll() {
    try {
      const client = getClient();
      activeChannels.forEach(({ name, channel }) => {
        try {
          client.removeChannel(channel);
        } catch (e) {}
      });
      const count = activeChannels.length;
      activeChannels = [];
      return count;
    } catch (e) {
      console.error('[supabase-client] unsubscribeAll error:', e);
      return 0;
    }
  }

  function getActiveChannels() {
    return activeChannels.map(c => ({
      name: c.name,
      state: c.channel.state
    }));
  }

  // ========== Public API ==========

  window.supabaseClient = {
    config: {
      url: SUPABASE_URL,
      anonKeyPrefix: SUPABASE_ANON_KEY.substring(0, 30) + '...'
    },
    isReady,
    waitForSupabase,
    getClient,
    isInitialized: () => initialized,
    // Auth
    signIn,
    signOut,
    getSession,
    onAuthStateChange,
    // Realtime
    subscribeToMessages,
    subscribeToConversations,
    subscribeToAllMessages,
    unsubscribe,
    unsubscribeAll,
    getActiveChannels
  };

  console.log('[supabase-client] Modulo cargado. URL:', SUPABASE_URL);
})();
