const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
}

let supabaseClient = null;
function getSupabase() {
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return supabaseClient;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) {}
  }
  if (!body || typeof body !== 'object') body = {};

  const { email, password } = body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y password son requeridos.' });
  }

  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email y password deben ser strings.' });
  }

  const emailTrim = email.trim().toLowerCase();
  if (!emailTrim.includes('@')) {
    return res.status(400).json({ error: 'Email invalido.' });
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailTrim,
      password
    });

    if (error) {
      console.warn('[auth:login] Fallo:', error.message);
      const msg = error.message.toLowerCase();
      if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
        return res.status(401).json({ error: 'Credenciales invalidas.' });
      }
      if (msg.includes('email not confirmed')) {
        return res.status(403).json({ error: 'Email no confirmado. Revisa tu bandeja.' });
      }
      return res.status(401).json({ error: 'No se pudo iniciar sesion.' });
    }

    if (!data?.session || !data?.user) {
      return res.status(401).json({ error: 'Respuesta invalida de Supabase Auth.' });
    }

    console.log(`[auth:login] OK user=${data.user.id} email=${data.user.email}`);

    return res.status(200).json({
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      expires_at: data.session.expires_at,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: data.user.role || 'authenticated',
        created_at: data.user.created_at,
        last_sign_in_at: data.user.last_sign_in_at
      }
    });
  } catch (e) {
    console.error('[auth:login] Excepcion:', e.message);
    return res.status(500).json({ error: 'Error interno al iniciar sesion.' });
  }
};
