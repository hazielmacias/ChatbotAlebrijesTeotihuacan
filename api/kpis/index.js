const { requireAuth } = require('../../src/middleware/auth');
const { supabaseAdmin } = require('../../src/lib/supabase');

const MEXICO_OFFSET_HOURS = -6;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function mexicoDateString(date = new Date()) {
  const shifted = new Date(date.getTime() + MEXICO_OFFSET_HOURS * 3600 * 1000);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function mexicoStartOfDayUTC(date = new Date()) {
  const str = mexicoDateString(date);
  return new Date(`${str}T00:00:00-06:00`);
}

function mexicoDateStringNDaysAgo(date, daysAgo) {
  const todayStr = mexicoDateString(date);
  const [y, m, d] = todayStr.split('-').map(Number);
  const past = new Date(Date.UTC(y, m - 1, d - daysAgo));
  const yyyy = past.getUTCFullYear();
  const mm = String(past.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(past.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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
    const todayStr = mexicoDateString(now);
    const todayStartUTC = mexicoStartOfDayUTC(now);
    const sevenDaysAgoUTC = new Date(todayStartUTC.getTime() - 6 * 24 * 3600 * 1000);

    const [
      totalMessagesRes,
      activeConversationsRes,
      totalContactsRes,
      todayMessagesRes,
      inboundMessagesRes,
      outboundMessagesRes,
      conversationsAllRes,
      messagesRecentRes
    ] = await Promise.all([
      supabaseAdmin
        .from('messages')
        .select('id', { count: 'exact', head: true }),
      supabaseAdmin
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active'),
      supabaseAdmin
        .from('contacts')
        .select('id', { count: 'exact', head: true }),
      supabaseAdmin
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayStartUTC.toISOString()),
      supabaseAdmin
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('direction', 'inbound'),
      supabaseAdmin
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('direction', 'outbound'),
      supabaseAdmin
        .from('conversations')
        .select('status'),
      supabaseAdmin
        .from('messages')
        .select('created_at')
        .gte('created_at', sevenDaysAgoUTC.toISOString())
    ]);

    const errors = [
      totalMessagesRes.error,
      activeConversationsRes.error,
      totalContactsRes.error,
      todayMessagesRes.error,
      inboundMessagesRes.error,
      outboundMessagesRes.error,
      conversationsAllRes.error,
      messagesRecentRes.error
    ].filter(Boolean);

    if (errors.length > 0) {
      console.error('[kpis] Errores en queries:', errors);
      return res.status(500).json({ error: 'Error al consultar KPIs.' });
    }

    const conversationsByStatus = (conversationsAllRes.data || []).reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {});

    const messagesByDayMap = new Map();
    (messagesRecentRes.data || []).forEach(m => {
      const dateStr = mexicoDateString(new Date(m.created_at));
      messagesByDayMap.set(dateStr, (messagesByDayMap.get(dateStr) || 0) + 1);
    });

    const messagesLast7Days = [];
    for (let i = 6; i >= 0; i--) {
      const dateStr = mexicoDateStringNDaysAgo(now, i);
      messagesLast7Days.push({
        date: dateStr,
        count: messagesByDayMap.get(dateStr) || 0
      });
    }

    const totalMessages = totalMessagesRes.count || 0;
    const todayMessages = todayMessagesRes.count || 0;

    return res.status(200).json({
      totals: {
        messages: totalMessages,
        active_conversations: activeConversationsRes.count || 0,
        contacts: totalContactsRes.count || 0
      },
      today: {
        messages: todayMessages,
        date: todayStr
      },
      conversations_by_status: conversationsByStatus,
      messages_last_7_days: messagesLast7Days,
      direction_breakdown: {
        inbound: inboundMessagesRes.count || 0,
        outbound: outboundMessagesRes.count || 0
      },
      timezone: 'America/Mexico_City',
      generated_at: now.toISOString()
    });
  } catch (e) {
    console.error('[kpis] Excepcion:', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
