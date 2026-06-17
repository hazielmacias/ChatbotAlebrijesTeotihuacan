const { requireAuth } = require('../../src/middleware/auth');
const { supabaseAdmin } = require('../../src/lib/supabase');
const { sendAndStore } = require('../../src/bot/sender');

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

  const { conversation_id, content } = body;

  if (!conversation_id || typeof conversation_id !== 'string') {
    return res.status(400).json({ error: 'conversation_id requerido.' });
  }
  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'content requerido y no puede estar vacio.' });
  }

  const trimmed = content.trim();
  if (trimmed.length > 4096) {
    return res.status(400).json({ error: 'content excede el limite de 4096 caracteres.' });
  }

  try {
    const { data: conv, error: convErr } = await supabaseAdmin
      .from('conversations')
      .select('id, contact_id, phone, status, bot_active')
      .eq('id', conversation_id)
      .maybeSingle();

    if (convErr) {
      console.error('[messages:send] Error cargando conv:', convErr);
      return res.status(500).json({ error: 'Error al cargar la conversacion.' });
    }
    if (!conv) {
      return res.status(404).json({ error: 'Conversacion no encontrada.' });
    }
    if (conv.status === 'closed') {
      return res.status(409).json({ error: 'La conversacion esta cerrada.' });
    }

    let responderName = null;
    try {
      const { data: dashUser } = await supabaseAdmin
        .from('dashboard_users')
        .select('display_name')
        .eq('auth_user_id', auth.user.id)
        .maybeSingle();
      if (dashUser && dashUser.display_name) {
        responderName = String(dashUser.display_name).trim().split(/\s+/)[0];
      } else if (auth.user.user_metadata && auth.user.user_metadata.display_name) {
        responderName = String(auth.user.user_metadata.display_name).trim().split(/\s+/)[0];
      }
    } catch (e) {
      // No bloquear el envio si falla la consulta
    }

    const sendResult = await sendAndStore({
      phone: conv.phone,
      conversationId: conv.id,
      content: trimmed,
      type: 'text',
      sentBy: 'human',
      metadata: {
        sent_by_user_id: auth.user.id,
        sent_by_user_email: auth.user.email,
        sent_by_user_name: responderName,
        source: 'dashboard'
      }
    });

    if (!sendResult.ok) {
      return res.status(502).json({
        error: 'No se pudo enviar el mensaje a Meta.',
        meta_error: sendResult.error,
        error_code: sendResult.errorCode,
        error_category: sendResult.errorCategory
      });
    }

    return res.status(200).json({
      sent: true,
      message: {
        id: sendResult.dbId,
        wa_id: sendResult.messageId,
        conversation_id: conv.id,
        phone: conv.phone,
        content: trimmed,
        direction: 'outbound',
        sent_by: 'human',
        sent_by_name: responderName,
        metadata: {
          sent_by_user_id: auth.user.id,
          sent_by_user_email: auth.user.email,
          sent_by_user_name: responderName,
          source: 'dashboard'
        },
        created_at: new Date().toISOString()
      },
      attempts: sendResult.attempts,
      elapsed_ms: sendResult.elapsedMs
    });
  } catch (e) {
    console.error('[messages:send] Excepcion:', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
