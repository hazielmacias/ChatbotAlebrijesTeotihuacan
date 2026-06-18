const { requireAuth } = require('../../src/middleware/auth');
const { supabaseAdmin } = require('../../src/lib/supabase');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'u', 'a', 'de', 'del', 'al',
  'en', 'por', 'para', 'con', 'sin', 'que', 'se', 'es', 'me', 'te', 'le', 'lo', 'si', 'no',
  'mi', 'tu', 'su', 'mi', 'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas',
  'el', 'pero', 'porque', 'como', 'cuando', 'donde', 'cual', 'quien', 'muy', 'mas', 'menos',
  'ya', 'aqui', 'alli', 'hoy', 'ayer', 'manana', 'siempre', 'nunca', 'todo', 'todos', 'nada',
  'algo', 'alguien', 'nadie', 'si', 'no', 'tambien', 'solo', 'entre', 'sobre', 'hasta',
  'desde', 'para', 'tras', 'ante', 'bajo', 'entre', 'hacia', 'segun', 'sin', 'contra'
]);

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    // Total conversaciones
    const { count: totalConversations } = await supabaseAdmin
      .from('conversations')
      .select('id', { count: 'exact', head: true });

    const { count: activeConversations } = await supabaseAdmin
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');

    // Total mensajes
    const { count: totalMessages } = await supabaseAdmin
      .from('messages')
      .select('id', { count: 'exact', head: true });

    // Mensajes hoy (Mexico timezone)
    const mexicoDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
    const todayStart = new Date(mexicoDate.getFullYear(), mexicoDate.getMonth(), mexicoDate.getDate(), 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const { count: messagesToday } = await supabaseAdmin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayISO);

    // Pases de entrenamiento (conversaciones que llegaron a cierre)
    const { count: passesCount } = await supabaseAdmin
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .or('current_flow.eq.cierre,current_step.eq.success');

    // Direcciones
    const { count: inboundCount } = await supabaseAdmin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'inbound');

    const { count: outboundCount } = await supabaseAdmin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'outbound');

    // Conversaciones por dia (ultimos 7 dias)
    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const { data: msgsByDay } = await supabaseAdmin
      .from('messages')
      .select('created_at')
      .gte('created_at', sevenDaysAgo.toISOString());

    const conversationsByDay = {};
    const messagesByDay = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      conversationsByDay[key] = 0;
      messagesByDay[key] = 0;
    }
    (msgsByDay || []).forEach(m => {
      const d = new Date(m.created_at);
      const key = d.toISOString().slice(0, 10);
      if (messagesByDay[key] !== undefined) messagesByDay[key]++;
    });

    // Mensajes por hora (ultimas 24h, agrupados por hora)
    const { data: msgsByHour } = await supabaseAdmin
      .from('messages')
      .select('created_at')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const messagesByHour = new Array(24).fill(0);
    (msgsByHour || []).forEach(m => {
      const d = new Date(m.created_at);
      const mexicoHour = parseInt(
        new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Mexico_City' }).format(d),
        10
      ) % 24;
      messagesByHour[mexicoHour]++;
    });

    // Palabras clave frecuentes (top 5)
    const { data: allMessages } = await supabaseAdmin
      .from('messages')
      .select('content')
      .eq('direction', 'inbound')
      .not('content', 'is', null)
      .limit(2000);

    const wordCount = {};
    (allMessages || []).forEach(m => {
      if (!m.content) return;
      const words = m.content.toLowerCase()
        .replace(/[^\wáéíóúñü\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
      words.forEach(w => { wordCount[w] = (wordCount[w] || 0) + 1; });
    });

    const topKeywords = Object.entries(wordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word, count]) => ({ word, count }));

    // Mensajes enviados vs recibidos (pie chart)
    const sentVsReceived = {
      inbound: inboundCount || 0,
      outbound: outboundCount || 0
    };

    // Conversaciones unicas por dia (no solo mensajes)
    // Necesitamos hacer un query separado
    const { data: convsByDay } = await supabaseAdmin
      .from('conversations')
      .select('created_at')
      .gte('created_at', sevenDaysAgo.toISOString());

    (convsByDay || []).forEach(c => {
      const d = new Date(c.created_at);
      const key = d.toISOString().slice(0, 10);
      if (conversationsByDay[key] !== undefined) conversationsByDay[key]++;
    });

    const conversationsByDayArray = [];
    const messagesByDayArray = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sevenDaysAgo);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      conversationsByDayArray.push({ date: key, count: conversationsByDay[key] });
      messagesByDayArray.push({ date: key, count: messagesByDay[key] });
    }

    // Ultimos mensajes (5 mas recientes)
    const { data: recentMsgs } = await supabaseAdmin
      .from('messages')
      .select('id, conversation_id, direction, content, sent_by, type, created_at, conversations(phone, contacts(name))')
      .order('created_at', { ascending: false })
      .limit(5);

    return res.status(200).json({
      totals: {
        conversations: totalConversations || 0,
        active_conversations: activeConversations || 0,
        messages: totalMessages || 0,
        messages_today: messagesToday || 0,
        passes: passesCount || 0,
        inbound: inboundCount || 0,
        outbound: outboundCount || 0
      },
      top_keywords: topKeywords,
      conversations_by_day: conversationsByDayArray,
      messages_by_day: messagesByDayArray,
      messages_by_hour: messagesByHour,
      sent_vs_received: sentVsReceived,
      recent_messages: (recentMsgs || []).map(m => ({
        id: m.id,
        conversation_id: m.conversation_id,
        direction: m.direction,
        content: m.content,
        sent_by: m.sent_by,
        type: m.type,
        created_at: m.created_at,
        phone: m.conversations?.phone,
        contact_name: m.conversations?.contacts?.name
      })),
      generated_at: new Date().toISOString()
    });
  } catch (e) {
    console.error('[stats:dashboard] Excepcion:', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
