const { requireAuth } = require('../../src/middleware/auth');
const { supabaseAdmin } = require('../../src/lib/supabase');

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function parseBool(value) {
  if (value === true || value === 'true' || value === '1' || value === 1) return true;
  if (value === false || value === 'false' || value === '0' || value === 0) return false;
  return null;
}

function parseIntSafe(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
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
    const { status, search, page, limit, archived } = req.query;

    const pageNum = Math.min(parseIntSafe(page, DEFAULT_PAGE), 10000);
    const limitNum = Math.min(parseIntSafe(limit, DEFAULT_LIMIT), MAX_LIMIT);
    const offset = (pageNum - 1) * limitNum;

    const archivedFilter = parseBool(archived);
    const showArchived = archivedFilter === true;

    const baseSelect = `
        id,
        contact_id,
        phone,
        status,
        bot_active,
        current_flow,
        current_step,
        archived_at,
        created_at,
        updated_at,
        contacts ( id, phone, name, created_at )
      `;

    let query = supabaseAdmin
      .from('conversations')
      .select(baseSelect, { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (status && ['active', 'closed'].includes(status)) {
      query = query.eq('status', status);
    }

    let hasArchivedColumn = true;
    if (showArchived) {
      query = query.not('archived_at', 'is', null);
    } else {
      query = query.is('archived_at', null);
    }

    let result = await query;
    let { data: conversations, error, count } = result;

    if (error && /archived_at|column.*does not exist/i.test(error.message || '')) {
      hasArchivedColumn = false;
      console.warn('[conversations:list] archived_at no existe, fallback sin filtro. Ejecutar scripts/setup-archive-column.sql');
      const fallback = supabaseAdmin
        .from('conversations')
        .select(`
          id,
          contact_id,
          phone,
          status,
          bot_active,
          current_flow,
          current_step,
          created_at,
          updated_at,
          contacts ( id, phone, name, created_at )
        `, { count: 'exact' })
        .order('updated_at', { ascending: false })
        .range(offset, offset + limitNum - 1);

      if (status && ['active', 'closed'].includes(status)) {
        fallback.eq('status', status);
      }
      const fb = await fallback;
      conversations = fb.data;
      error = fb.error;
      count = fb.count;
    }

    if (error) {
      console.error('[conversations:list] Error:', error);
      return res.status(500).json({ error: 'Error al consultar conversaciones.' });
    }

    if (!conversations || conversations.length === 0) {
      return res.status(200).json({
        conversations: [],
        pagination: { page: pageNum, limit: limitNum, total: count || 0, total_pages: 0 }
      });
    }

    const convIds = conversations.map(c => c.id);

    const { data: lastMessages, error: msgError } = await supabaseAdmin
      .from('messages')
      .select('conversation_id, content, direction, type, sent_by, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false });

    if (msgError) {
      console.warn('[conversations:list] Error cargando mensajes:', msgError);
    }

    const lastMessageByConv = {};
    const unreadCountByConv = {};
    const messageCountByConv = {};

    for (const m of (lastMessages || [])) {
      const cid = m.conversation_id;
      if (!lastMessageByConv[cid]) {
        lastMessageByConv[cid] = m;
      }
      messageCountByConv[cid] = (messageCountByConv[cid] || 0) + 1;
      if (m.direction === 'inbound' && m.sent_by === 'contact') {
        unreadCountByConv[cid] = (unreadCountByConv[cid] || 0) + 1;
      }
    }

    let enriched = conversations.map(c => {
      const last = lastMessageByConv[c.id];
      return {
        id: c.id,
        contact_id: c.contact_id,
        phone: c.phone,
        status: c.status,
        bot_active: c.bot_active,
        current_flow: c.current_flow,
        current_step: c.current_step,
        archived_at: c.archived_at || null,
        created_at: c.created_at,
        updated_at: c.updated_at,
        contact: c.contacts ? {
          id: c.contacts.id,
          phone: c.contacts.phone,
          name: c.contacts.name,
          created_at: c.contacts.created_at
        } : null,
        last_message: last ? {
          content: last.content,
          direction: last.direction,
          type: last.type,
          sent_by: last.sent_by,
          created_at: last.created_at,
          preview: (last.content || '').substring(0, 80).replace(/\n/g, ' ')
        } : null,
        message_count: messageCountByConv[c.id] || 0,
        unread_count: unreadCountByConv[c.id] || 0
      };
    });

    if (search && typeof search === 'string' && search.trim().length > 0) {
      const term = search.trim().toLowerCase();
      enriched = enriched.filter(c => {
        if (c.phone && c.phone.toLowerCase().includes(term)) return true;
        if (c.contact?.name && c.contact.name.toLowerCase().includes(term)) return true;
        if (c.last_message?.content && c.last_message.content.toLowerCase().includes(term)) return true;
        return false;
      });
    }

    const totalPages = count ? Math.ceil(count / limitNum) : 0;

    return res.status(200).json({
      conversations: enriched,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        total_pages: totalPages,
        returned: enriched.length
      },
      filters: {
        status: status || 'all',
        search: search || null,
        archived: showArchived
      },
      _meta: {
        archived_column_available: hasArchivedColumn,
        hint: hasArchivedColumn ? null : 'Ejecuta scripts/setup-archive-column.sql en Supabase para activar archivados'
      }
    });
  } catch (e) {
    console.error('[conversations:list] Excepcion:', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
