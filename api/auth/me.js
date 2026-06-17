const { requireAuth } = require('../../src/middleware/auth');
const { supabaseAdmin } = require('../../src/lib/supabase');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    const { data: dashboardUser, error: duError } = await supabaseAdmin
      .from('dashboard_users')
      .select('id, display_name, created_at')
      .eq('auth_user_id', auth.user.id)
      .maybeSingle();

    if (duError && duError.code !== 'PGRST116') {
      console.warn('[auth:me] Error consultando dashboard_users:', duError.message);
    }

    return res.status(200).json({
      user: {
        id: auth.user.id,
        email: auth.user.email,
        role: auth.user.role || 'authenticated',
        created_at: auth.user.created_at,
        last_sign_in_at: auth.user.last_sign_in_at
      },
      profile: dashboardUser ? {
        id: dashboardUser.id,
        display_name: dashboardUser.display_name,
        created_at: dashboardUser.created_at
      } : null
    });
  } catch (e) {
    console.error('[auth:me] Excepcion:', e.message);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
