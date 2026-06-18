const { requireAuth } = require('../../src/middleware/auth');
const { supabaseAdmin } = require('../../src/lib/supabase');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) {}
  }
  if (!body || typeof body !== 'object') body = {};

  const { id } = body;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'ID de plan requerido en el body.' });
  }

  try {
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('catalog_plans')
      .select('id, is_active, name')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) {
      console.error('[catalog:delete] Error verificando:', fetchErr);
      return res.status(500).json({ error: 'Error al verificar el plan.' });
    }
    if (!existing) {
      return res.status(404).json({ error: 'Plan no encontrado.' });
    }
    if (!existing.is_active) {
      return res.status(200).json({
        plan: existing,
        deleted: false,
        message: 'El plan ya estaba inactivo.'
      });
    }

    const { data: plan, error } = await supabaseAdmin
      .from('catalog_plans')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('id, name, description, price, category, image_url, is_active, created_at, updated_at')
      .single();

    if (error) {
      console.error('[catalog:delete] Error:', error);
      return res.status(500).json({ error: 'Error al desactivar el plan.' });
    }

    return res.status(200).json({
      plan,
      deleted: true,
      soft_delete: true,
      message: 'Plan desactivado (soft delete).'
    });
  } catch (e) {
    console.error('[catalog:delete] Excepcion:', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
