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

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) {}
  }
  if (!body || typeof body !== 'object') body = {};

  const conversationId = body.conversation_id || body.id;
  const newBotActive = body.bot_active;

  if (!conversationId || typeof conversationId !== 'string') {
    return res.status(400).json({ error: 'conversation_id requerido.' });
  }
  if (typeof newBotActive !== 'boolean') {
    return res.status(400).json({ error: 'El campo bot_active debe ser boolean.' });
  }

  try {
    const { data: conv, error: fetchErr } = await supabaseAdmin
      .from('conversations')
      .select('id, contact_id, phone, status, bot_active')
      .eq('id', conversationId)
      .maybeSingle();

    if (fetchErr) {
      console.error('[toggle-bot] Error cargando conv:', fetchErr);
      return res.status(500).json({ error: 'Error al cargar la conversacion.' });
    }
    if (!conv) {
      return res.status(404).json({ error: 'Conversacion no encontrada.' });
    }

    const previousBotActive = conv.bot_active;

    if (previousBotActive === newBotActive) {
      return res.status(200).json({
        conversation: conv,
        changed: false,
        message: 'El valor de bot_active ya era el solicitado.'
      });
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('conversations')
      .update({
        bot_active: newBotActive,
        updated_at: new Date().toISOString()
      })
      .eq('id', conversationId)
      .select('id, contact_id, phone, status, bot_active, current_flow, current_step, updated_at')
      .single();

    if (updateErr) {
      console.error('[toggle-bot] Error actualizando:', updateErr);
      return res.status(500).json({ error: 'Error al actualizar bot_active.' });
    }

    return res.status(200).json({
      conversation: updated,
      changed: true,
      previous_bot_active: previousBotActive,
      new_bot_active: newBotActive
    });
  } catch (e) {
    console.error('[toggle-bot] Excepcion:', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
