require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const SUPABASE = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

(async () => {
  const PHONE = '521970882936';

  const { data: conv } = await SUPABASE
    .from('conversations')
    .select('id, phone, bot_active, current_flow, current_step, created_at, updated_at')
    .eq('phone', PHONE)
    .maybeSingle();

  if (!conv) { console.log('No se encontro la conversacion de prueba'); return; }

  console.log('Conversacion:', conv.phone);
  console.log('bot_active:', conv.bot_active, '| current_flow:', conv.current_flow);

  const { data: msgs } = await SUPABASE
    .from('messages')
    .select('direction, sent_by, type, content, created_at')
    .eq('conversation_id', conv.id)
    .order('created_at', { ascending: true });

  console.log('\nTotal mensajes:', msgs.length);
  console.log('\nTodos los mensajes:');
  msgs.forEach((m, i) => {
    const time = new Date(m.created_at).toLocaleTimeString('es-MX');
    const dir = m.direction === 'inbound' ? 'IN ' : 'OUT';
    const author = m.sent_by || (m.direction === 'inbound' ? 'contact' : 'bot');
    console.log('  ' + (i + 1) + '. [' + time + '] ' + dir + '/' + author + ': ' + (m.content || '').substring(0, 60).replace(/\n/g, ' '));
  });

  // Buscar especificamente la respuesta del bot despues de "otra pregunta"
  const lastInbound = [...msgs].reverse().find(m => m.direction === 'inbound' && m.content === 'otra pregunta');
  if (lastInbound) {
    const lastInboundTime = new Date(lastInbound.created_at).getTime();
    const botResponseAfter = msgs.find(m =>
      m.direction === 'outbound' && m.sent_by === 'bot' && new Date(m.created_at).getTime() > lastInboundTime
    );
    if (botResponseAfter) {
      console.log('\nFAIL: Bot respondio despues de "otra pregunta": ' + botResponseAfter.content.substring(0, 60));
    } else {
      console.log('\nOK: Bot NO respondio despues de "otra pregunta" - solo se guardo el inbound');
    }
  } else {
    console.log('\nNo se encontro el mensaje "otra pregunta"');
  }
})();
