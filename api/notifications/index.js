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

  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Alta interaccion: top 5 conversaciones con mas mensajes en las ultimas 24h
    const { data: highInteraction } = await supabaseAdmin
      .from('messages')
      .select('conversation_id')
      .gte('created_at', twentyFourHoursAgo);

    const convMsgCount = {};
    (highInteraction || []).forEach(m => {
      convMsgCount[m.conversation_id] = (convMsgCount[m.conversation_id] || 0) + 1;
    });

    const topConvIds = Object.entries(convMsgCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id]) => id);

    let highInteractionConvs = [];
    if (topConvIds.length > 0) {
      const { data: convs } = await supabaseAdmin
        .from('conversations')
        .select('id, phone, current_flow, current_step, bot_active, updated_at, contacts(name)')
        .in('id', topConvIds);
      const convMap = {};
      (convs || []).forEach(c => { convMap[c.id] = c; });
      highInteractionConvs = topConvIds.map(id => ({
        conversation_id: id,
        phone: convMap[id]?.phone,
        contact_name: convMap[id]?.contacts?.name,
        current_flow: convMap[id]?.current_flow,
        bot_active: convMap[id]?.bot_active,
        updated_at: convMap[id]?.updated_at,
        message_count_24h: convMsgCount[id] || 0
      }));
    }

    // 2. Nuevas conversaciones: creadas en las ultimas 24h
    const { data: newConvs } = await supabaseAdmin
      .from('conversations')
      .select('id, phone, current_flow, bot_active, created_at, contacts(name)')
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false })
      .limit(10);

    const newConversations = (newConvs || []).map(c => ({
      conversation_id: c.id,
      phone: c.phone,
      contact_name: c.contacts?.name,
      current_flow: c.current_flow,
      bot_active: c.bot_active,
      created_at: c.created_at
    }));

    // 3. Chats escalados (pases de entrada): conversaciones en flujo cierre
    const { data: escalatedConvs } = await supabaseAdmin
      .from('conversations')
      .select('id, phone, current_flow, current_step, bot_active, updated_at, contacts(name)')
      .or('current_flow.eq.cierre,current_step.eq.success,current_step.eq.requirements')
      .order('updated_at', { ascending: false })
      .limit(10);

    const escalated = (escalatedConvs || []).map(c => ({
      conversation_id: c.id,
      phone: c.phone,
      contact_name: c.contacts?.name,
      current_flow: c.current_flow,
      current_step: c.current_step,
      bot_active: c.bot_active,
      updated_at: c.updated_at
    }));

    // Conteos para badges
    const counts = {
      high_interaction: highInteractionConvs.length,
      new_conversations: newConversations.length,
      escalated: escalated.length
    };

    return res.status(200).json({
      high_interaction: highInteractionConvs,
      new_conversations: newConversations,
      escalated: escalated,
      counts: counts,
      generated_at: new Date().toISOString()
    });
  } catch (e) {
    console.error('[notifications] Excepcion:', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
