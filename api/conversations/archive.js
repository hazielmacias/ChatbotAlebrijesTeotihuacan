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
    const { conversation_id, archived } = req.body || {};

    if (!conversation_id || typeof conversation_id !== 'string') {
      return res.status(400).json({ error: 'conversation_id es requerido' });
    }
    if (typeof archived !== 'boolean') {
      return res.status(400).json({ error: 'archived debe ser boolean' });
    }

    const { data: existing, error: findError } = await supabaseAdmin
      .from('conversations')
      .select('id, archived_at, status, bot_active')
      .eq('id', conversation_id)
      .single();

    if (findError || !existing) {
      return res.status(404).json({ error: 'Conversacion no encontrada' });
    }

    const newArchivedAt = archived ? new Date().toISOString() : null;

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('conversations')
      .update({
        archived_at: newArchivedAt,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversation_id)
      .select('id, status, bot_active, archived_at, updated_at')
      .single();

    if (updateError) {
      console.error('[conversations:archive] Error actualizando:', updateError);
      return res.status(500).json({ error: 'Error al archivar la conversacion' });
    }

    console.log('[conversations:archive]', {
      user: auth.user.email,
      conversation_id,
      archived,
      previous_archived_at: existing.archived_at
    });

    return res.status(200).json({
      ok: true,
      conversation: updated,
      action: archived ? 'archived' : 'restored',
      previous_archived_at: existing.archived_at
    });
  } catch (e) {
    console.error('[conversations:archive] Excepcion:', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
