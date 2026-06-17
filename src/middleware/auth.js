const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function requireAuth(req, res) {
  const authHeader = req.headers.authorization || req.headers.Authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No autorizado. Token requerido.' });
    return null;
  }

  const token = authHeader.substring(7).trim();

  if (!token) {
    res.status(401).json({ error: 'Token vacio.' });
    return null;
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      res.status(401).json({ error: 'Token invalido o expirado.' });
      return null;
    }

    return { user: data.user, token };
  } catch (e) {
    console.error('[auth] Error validating token:', e.message);
    res.status(401).json({ error: 'Error de autenticacion.' });
    return null;
  }
}

module.exports = { requireAuth };
