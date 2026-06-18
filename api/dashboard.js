const { requireAuth } = require('../src/middleware/auth');
const { supabaseAdmin } = require('../src/lib/supabase');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'u', 'a', 'de', 'del', 'al',
  'en', 'por', 'para', 'con', 'sin', 'que', 'se', 'es', 'me', 'te', 'le', 'lo', 'si', 'no',
  'mi', 'tu', 'su', 'mi', 'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas',
  'el', 'pero', 'porque', 'como', 'cuando', 'donde', 'cual', 'quien', 'muy', 'mas', 'menos',
  'ya', 'aqui', 'alli', 'hoy', 'ayer', 'manana', 'siempre', 'nunca', 'todo', 'todos', 'nada',
  'algo', 'alguien', 'nadie', 'si', 'no', 'tambien', 'solo', 'entre', 'sobre', 'hasta',
  'desde', 'para', 'tras', 'ante', 'bajo', 'entre', 'hacia', 'segun', 'sin', 'contra',
  'mas', 'puede', 'puedo', 'puedes', 'hacer', 'tengo', 'tienes', 'aqui', 'hola', 'gracias',
  'buenos', 'buenas', 'dias', 'tardes', 'noches', 'favor', 'informacion'
]);

const DEFAULT_TEMPLATES = {
  'menu.welcome': {
    description: 'Mensaje principal del menu que se envia cuando un contacto nuevo escribe "hola"',
    content: '¡Hola! Gracias por tu interes en *Alebrijes Teotihuacan* ⚽🔥. El inicio de tu carrera profesional comienza aqui.\n\nPara brindarte la informacion correcta y generar tu *Pase de Prueba de 1 Semana SIN COSTO*, por favor selecciona la categoria que te interesa escribiendo el numero:\n\n1️⃣ Centro de Iniciacion Deportiva (Escuela) - Ninos de 6 a 11 anos\n2️⃣ Tercera Division Profesional (Liga TDP) - Jovenes nacidos entre 2005 y 2012\n3️⃣ Equipo Piloto Liga de Expansion MX - Jovenes nacidos entre 2002 y 2004\n4️⃣ Preguntas frecuentes\n\n_Responde con el numero de la opcion._',
    variables: []
  },
  'escuela.info': {
    description: 'Informacion del plan Escuela (6-11 anos) con precios y horarios',
    content: '¡Excelente eleccion! Nuestra Escuela es el lugar ideal para los fundamentos y la pasion por el futbol.\n\nTenemos una *Inversion Transparente*:\n✅ Costo de Inscripcion: *$0*\n✅ Mensualidad fija: *$550 MXN* (Sin letras chiquitas)\n\nContamos con dos horarios de entrenamiento, ¿cual prefieres? (Escribe *A* o *B*)\n\n*A. Turno Matutino (Alto Rendimiento):* Lunes a Viernes de 08:00 a 10:30 hrs.\n*B. Turno Vespertino (Iniciacion y Desarrollo):* Martes, Miercoles y Jueves de 16:00 a 18:30 hrs.',
    variables: []
  },
  'help.invalid': {
    description: 'Mensaje que se envia cuando el usuario ingresa una opcion no valida',
    content: '🤔 No entendi tu respuesta.\n\nPor favor responde con una de las opciones validas.\n\n_Escribe *menu* o *0* para volver al inicio._',
    variables: []
  },
  'cierre.success': {
    description: 'Mensaje final cuando el contacto completa su registro de pase de prueba',
    content: '¡Excelente! Hemos recibido tus datos correctamente.\n\n📲 En breve un miembro de nuestro equipo te contactara para confirmar tu *Pase de Prueba de 1 Semana SIN COSTO*.\n\n¡Te esperamos en la cancha! ⚽',
    variables: ['{{name}}', '{{category}}']
  }
};

async function handleStats(res) {
  const { count: totalConversations } = await supabaseAdmin
    .from('conversations').select('id', { count: 'exact', head: true });
  const { count: activeConversations } = await supabaseAdmin
    .from('conversations').select('id', { count: 'exact', head: true }).eq('status', 'active');
  const { count: totalMessages } = await supabaseAdmin
    .from('messages').select('id', { count: 'exact', head: true });
  const { count: inboundCount } = await supabaseAdmin
    .from('messages').select('id', { count: 'exact', head: true }).eq('direction', 'inbound');
  const { count: outboundCount } = await supabaseAdmin
    .from('messages').select('id', { count: 'exact', head: true }).eq('direction', 'outbound');

  const mexicoDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
  const todayStart = new Date(mexicoDate.getFullYear(), mexicoDate.getMonth(), mexicoDate.getDate(), 0, 0, 0);
  const { count: messagesToday } = await supabaseAdmin
    .from('messages').select('id', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString());

  const { count: passesCount } = await supabaseAdmin
    .from('conversations').select('id', { count: 'exact', head: true })
    .or('current_flow.eq.cierre,current_step.eq.success');

  // Conversaciones y mensajes por dia (ultimos 7)
  const sevenDaysAgo = new Date(todayStart);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const sevenDaysISO = sevenDaysAgo.toISOString();

  const { data: msgsByDay } = await supabaseAdmin
    .from('messages').select('created_at').gte('created_at', sevenDaysISO);
  const { data: convsByDay } = await supabaseAdmin
    .from('conversations').select('created_at').gte('created_at', sevenDaysISO);

  const conversationsByDayMap = {};
  const messagesByDayMap = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(sevenDaysAgo);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    conversationsByDayMap[key] = 0;
    messagesByDayMap[key] = 0;
  }
  (msgsByDay || []).forEach(m => {
    const k = new Date(m.created_at).toISOString().slice(0, 10);
    if (messagesByDayMap[k] !== undefined) messagesByDayMap[k]++;
  });
  (convsByDay || []).forEach(c => {
    const k = new Date(c.created_at).toISOString().slice(0, 10);
    if (conversationsByDayMap[k] !== undefined) conversationsByDayMap[k]++;
  });

  const conversationsByDay = [];
  const messagesByDay = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sevenDaysAgo);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    conversationsByDay.push({ date: key, count: conversationsByDayMap[key] });
    messagesByDay.push({ date: key, count: messagesByDayMap[key] });
  }

  // Mensajes por hora (ultimas 24h, hora Mexico)
  const { data: msgsByHour } = await supabaseAdmin
    .from('messages').select('created_at')
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

  // Top keywords
  const { data: allMessages } = await supabaseAdmin
    .from('messages').select('content')
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

  // Ultimos mensajes
  const { data: recentMsgs } = await supabaseAdmin
    .from('messages')
    .select('id, conversation_id, direction, content, sent_by, type, created_at, conversations(phone, contacts(name))')
    .order('created_at', { ascending: false })
    .limit(5);

  return {
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
    conversations_by_day: conversationsByDay,
    messages_by_day: messagesByDay,
    messages_by_hour: messagesByHour,
    sent_vs_received: { inbound: inboundCount || 0, outbound: outboundCount || 0 },
    recent_messages: (recentMsgs || []).map(m => ({
      id: m.id, conversation_id: m.conversation_id, direction: m.direction,
      content: m.content, sent_by: m.sent_by, type: m.type, created_at: m.created_at,
      phone: m.conversations?.phone, contact_name: m.conversations?.contacts?.name
    })),
    generated_at: new Date().toISOString()
  };
}

async function handleNotifications() {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Alta interaccion
  const { data: highInteraction } = await supabaseAdmin
    .from('messages').select('conversation_id').gte('created_at', twentyFourHoursAgo);

  const convMsgCount = {};
  (highInteraction || []).forEach(m => {
    convMsgCount[m.conversation_id] = (convMsgCount[m.conversation_id] || 0) + 1;
  });

  const topConvIds = Object.entries(convMsgCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);

  let highInteractionConvs = [];
  if (topConvIds.length > 0) {
    const { data: convs } = await supabaseAdmin
      .from('conversations')
      .select('id, phone, current_flow, current_step, bot_active, updated_at, contacts(name)')
      .in('id', topConvIds);
    const convMap = {};
    (convs || []).forEach(c => { convMap[c.id] = c; });
    highInteractionConvs = topConvIds.map(id => ({
      conversation_id: id, phone: convMap[id]?.phone,
      contact_name: convMap[id]?.contacts?.name, current_flow: convMap[id]?.current_flow,
      bot_active: convMap[id]?.bot_active, updated_at: convMap[id]?.updated_at,
      message_count_24h: convMsgCount[id] || 0
    }));
  }

  // Nuevas
  const { data: newConvs } = await supabaseAdmin
    .from('conversations')
    .select('id, phone, current_flow, bot_active, created_at, contacts(name)')
    .gte('created_at', twentyFourHoursAgo)
    .order('created_at', { ascending: false }).limit(10);

  const newConversations = (newConvs || []).map(c => ({
    conversation_id: c.id, phone: c.phone, contact_name: c.contacts?.name,
    current_flow: c.current_flow, bot_active: c.bot_active, created_at: c.created_at
  }));

  // Escalados (pases de entrada)
  const { data: escalatedConvs } = await supabaseAdmin
    .from('conversations')
    .select('id, phone, current_flow, current_step, bot_active, updated_at, contacts(name)')
    .or('current_flow.eq.cierre,current_step.eq.success,current_step.eq.requirements')
    .order('updated_at', { ascending: false }).limit(10);

  const escalated = (escalatedConvs || []).map(c => ({
    conversation_id: c.id, phone: c.phone, contact_name: c.contacts?.name,
    current_flow: c.current_flow, current_step: c.current_step,
    bot_active: c.bot_active, updated_at: c.updated_at
  }));

  return {
    high_interaction: highInteractionConvs,
    new_conversations: newConversations,
    escalated: escalated,
    counts: {
      high_interaction: highInteractionConvs.length,
      new_conversations: newConversations.length,
      escalated: escalated.length
    },
    generated_at: new Date().toISOString()
  };
}

async function handleTemplatesList() {
  try {
    const { data: customTemplates, error } = await supabaseAdmin
      .from('bot_templates')
      .select('key, description, content, variables, updated_at, updated_by');

    if (error || !customTemplates) {
      const merged = Object.entries(DEFAULT_TEMPLATES).map(([key, t]) => ({
        key, description: t.description, content: t.content, variables: t.variables, is_default: true
      }));
      return { templates: merged, is_default: true };
    }

    const customKeys = new Set(customTemplates.map(t => t.key));
    const merged = [
      ...customTemplates,
      ...Object.entries(DEFAULT_TEMPLATES)
        .filter(([key]) => !customKeys.has(key))
        .map(([key, t]) => ({
          key, description: t.description, content: t.content, variables: t.variables, is_default: true
        }))
    ];
    return { templates: merged };
  } catch (e) {
    const merged = Object.entries(DEFAULT_TEMPLATES).map(([key, t]) => ({
      key, description: t.description, content: t.content, variables: t.variables, is_default: true
    }));
    return { templates: merged, is_default: true };
  }
}

async function handleTemplatesSave(body, userId) {
  if (!body.key || !body.content) {
    return { status: 400, data: { error: 'key y content requeridos.' } };
  }
  try {
    const { data, error } = await supabaseAdmin
      .from('bot_templates')
      .upsert({
        key: body.key,
        description: body.description || null,
        content: body.content,
        variables: body.variables || [],
        updated_at: new Date().toISOString(),
        updated_by: userId
      }, { onConflict: 'key' })
      .select().single();
    if (error) return { status: 500, data: { error: 'Error al guardar plantilla.' } };
    return { status: 200, data: { template: data } };
  } catch (e) {
    return { status: 200, data: {
      template: {
        key: body.key, description: body.description,
        content: body.content, variables: body.variables || [],
        is_default: false
      },
      persisted: false,
      message: 'Tabla bot_templates no existe. Ejecuta scripts/setup-templates-table.sql en Supabase.'
    }};
  }
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    // GET /api/dashboard?type=stats|notifications|templates
    // POST /api/dashboard  (body: { type: 'templates', key, content, ... })
    const type = (req.query && req.query.type) || (req.body && req.body.type) || 'stats';

    if (req.method === 'GET') {
      if (type === 'stats') {
        return res.status(200).json(await handleStats());
      }
      if (type === 'notifications') {
        return res.status(200).json(await handleNotifications());
      }
      if (type === 'templates') {
        return res.status(200).json(await handleTemplatesList());
      }
      return res.status(400).json({ error: 'type invalido. Usa: stats, notifications, templates.' });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) {}
      }
      if (!body || typeof body !== 'object') body = {};

      if (type === 'templates' || body.type === 'templates') {
        const result = await handleTemplatesSave(body, auth.user.id);
        return res.status(result.status).json(result.data);
      }

      return res.status(400).json({ error: 'type invalido en POST.' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[dashboard] Excepcion:', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
