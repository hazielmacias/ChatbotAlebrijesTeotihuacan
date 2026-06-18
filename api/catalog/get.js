const { requireAuth } = require('../../src/middleware/auth');
const { supabaseAdmin } = require('../../src/lib/supabase');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'ID de plan requerido.' });
  }

  try {
    const { data: plan, error } = await supabaseAdmin
      .from('catalog_plans')
      .select('id, name, description, price, category, image_url, is_active, created_at, updated_at')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[catalog:get] Error:', error);
      return res.status(500).json({ error: 'Error al consultar el plan.' });
    }
    if (!plan) {
      return res.status(404).json({ error: 'Plan no encontrado.' });
    }

    return res.status(200).json({ plan });
  } catch (e) {
    console.error('[catalog:get] Excepcion:', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
