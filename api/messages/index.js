const { requireAuth } = require('../../src/middleware/auth');
const { supabaseAdmin } = require('../../src/lib/supabase');

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function parseIntSafe(value, fallback, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { conversation_id, limit, before } = req.query;

  if (!conversation_id || typeof conversation_id !== 'string') {
    return res.status(400).json({ error: 'Parametro conversation_id requerido.' });
  }

  const limitNum = parseIntSafe(limit, DEFAULT_LIMIT, MAX_LIMIT);

  try {
    const { data: conv, error: convErr } = await supabaseAdmin
      .from('conversations')
      .select('id, contact_id, phone, status, bot_active')
      .eq('id', conversation_id)
      .maybeSingle();

    if (convErr) {
      console.error('[messages:list] Error cargando conv:', convErr);
      return res.status(500).json({ error: 'Error al cargar la conversacion.' });
    }
    if (!conv) {
      return res.status(404).json({ error: 'Conversacion no encontrada.' });
    }

    let query = supabaseAdmin
      .from('messages')
      .select('id, conversation_id, wa_id, direction, content, type, sent_by, metadata, created_at')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: true })
      .limit(limitNum);

    if (before) {
      const beforeDate = new Date(before);
      if (!isNaN(beforeDate.getTime())) {
        query = query.lt('created_at', beforeDate.toISOString());
      }
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error('[messages:list] Error:', error);
      return res.status(500).json({ error: 'Error al consultar mensajes.' });
    }

    const formatted = (messages || []).map(m => ({
      id: m.id,
      conversation_id: m.conversation_id,
      wa_id: m.wa_id,
      direction: m.direction,
      content: m.content,
      type: m.type,
      sent_by: m.sent_by,
      metadata: m.metadata,
      created_at: m.created_at,
      is_error: !!m.metadata?.send_error
    }));

    return res.status(200).json({
      conversation: {
        id: conv.id,
        phone: conv.phone,
        status: conv.status,
        bot_active: conv.bot_active
      },
      messages: formatted,
      pagination: {
        returned: formatted.length,
        limit: limitNum,
        has_more: formatted.length === limitNum
      }
    });
  } catch (e) {
    console.error('[messages:list] Excepcion:', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
