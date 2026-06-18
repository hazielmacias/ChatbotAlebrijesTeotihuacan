const { requireAuth } = require('../../src/middleware/auth');
const { supabaseAdmin } = require('../../src/lib/supabase');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    const { conversation_id } = req.body || {};

    if (!conversation_id || typeof conversation_id !== 'string') {
      return res.status(400).json({ error: 'conversation_id es requerido' });
    }

    const { data: existing, error: findError } = await supabaseAdmin
      .from('conversations')
      .select('id, phone, archived_at')
      .eq('id', conversation_id)
      .single();

    if (findError || !existing) {
      return res.status(404).json({ error: 'Conversacion no encontrada' });
    }

    const { error: deleteError } = await supabaseAdmin
      .from('conversations')
      .delete()
      .eq('id', conversation_id);

    if (deleteError) {
      console.error('[conversations:delete] Error eliminando:', deleteError);
      return res.status(500).json({ error: 'Error al eliminar la conversacion' });
    }

    console.log('[conversations:delete] PERMANENTE', {
      user: auth.user.email,
      conversation_id,
      phone: existing.phone
    });

    return res.status(200).json({
      ok: true,
      conversation_id,
      action: 'deleted'
    });
  } catch (e) {
    console.error('[conversations:delete] Excepcion:', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
