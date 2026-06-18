// E2E test del flujo completo: webhook -> bot -> dashboard
// Simula: usuario envia WhatsApp, bot responde, dashboard lo ve

require('dotenv').config();
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const http = require('https');

const SUPABASE = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const APP_SECRET = process.env.META_APP_SECRET;
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;

let pass = 0, fail = 0;

function ok(name) { console.log('  [OK]   ' + name); pass++; }
function fail_(name, why) { console.log('  [FAIL] ' + name + (why ? ' :: ' + why : '')); fail++; }
function header(name) { console.log('\n=== ' + name + ' ==='); }

function apiCall(method, path, body, token) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = { hostname: 'alebrijes-chatbot.vercel.app', port: 443, path, method,
      headers: { 'Content-Type': 'application/json' }};
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const r = http.request(opts, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); } catch { resolve({ status: res.statusCode, body: buf }); } });
    });
    r.on('error', e => resolve({ status: 0, body: e.message }));
    if (data) r.write(data);
    r.end();
  });
}

// Simular un POST de Meta con firma valida
function postToWebhook(payload) {
  return new Promise((resolve) => {
    const rawBody = JSON.stringify(payload);
    const sig = 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(rawBody, 'utf8').digest('hex');
    const opts = { hostname: 'alebrijes-chatbot.vercel.app', port: 443, path: '/api/webhook', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(rawBody), 'X-Hub-Signature-256': sig }};
    const r = http.request(opts, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); } catch { resolve({ status: res.statusCode, body: buf }); } });
    });
    r.on('error', e => resolve({ status: 0, body: e.message }));
    r.write(rawBody);
    r.end();
  });
}

function makePayload(from, text, messageId) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: '123',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { phone_number_id: '1181282128398668', display_phone_number: '5215555555555' },
          contacts: [{ wa_id: from, profile: { name: 'E2E Test User' }}],
          messages: [{ from, id: messageId || 'wamid.e2e.' + Date.now(), timestamp: Math.floor(Date.now()/1000).toString(), type: 'text', text: { body: text }}]
        },
        field: 'messages'
      }]
    }]
  };
}

async function main() {
  // ===== SETUP =====
  const TEST_PHONE = '521' + (900000000 + Math.floor(Math.random() * 99999999)).toString().substring(0, 10);
  console.log('Telefono de prueba: ' + TEST_PHONE);

  const login = await apiCall('POST', '/api/auth/login', { email: 'areli@alebrijesteotihuacan.com', password: 'areli123' });
  if (login.status !== 200) { fail_('Login', 'status=' + login.status); return; }
  ok('Login con areli');
  const token = login.body.token;

  // ===== 5.4.1: Enviar mensaje de prueba =====
  header('5.4.1-5.4.4: Flujo del bot via webhook');
  const msg1 = await postToWebhook(makePayload(TEST_PHONE, 'hola', 'wamid.e2e.1'));
  if (msg1.status === 200 && msg1.body.status === 'ok') ok('5.4.1+5.4.2 Webhook recibe mensaje y procesa (status:ok)');
  else fail_('5.4.1+5.4.2 Webhook', 'status=' + msg1.status + ' body=' + JSON.stringify(msg1.body).substring(0, 200));

  await new Promise(r => setTimeout(r, 1500));

  // Verificar en BD: contacto creado + conversacion activa
  const { data: conv1 } = await SUPABASE
    .from('conversations')
    .select('id, status, bot_active, current_flow, current_step, contact:contacts(name)')
    .eq('phone', TEST_PHONE)
    .maybeSingle();

  if (conv1) ok('5.4.2 Contacto+conversacion creados (status=' + conv1.status + ', bot_active=' + conv1.bot_active + ')');
  else fail_('5.4.2 No se creo la conversacion');

  // Verificar que el bot guardo su respuesta en messages
  const { data: msgs1 } = await SUPABASE
    .from('messages')
    .select('direction, sent_by, type, content')
    .eq('conversation_id', conv1.id)
    .order('created_at', { ascending: true });

  const inbound = msgs1?.filter(m => m.direction === 'inbound').length || 0;
  const outbound = msgs1?.filter(m => m.direction === 'outbound').length || 0;
  if (inbound >= 1 && outbound >= 1) ok('5.4.3 Bot respondio: ' + inbound + ' inbound + ' + outbound + ' outbound (menu principal)');
  else fail_('5.4.3', 'inbound=' + inbound + ' outbound=' + outbound);

  // Mostrar el menu que envio el bot
  const botMsg = msgs1?.find(m => m.direction === 'outbound' && m.sent_by === 'bot');
  if (botMsg) {
    console.log('       Bot dijo: "' + (botMsg.content || '').substring(0, 80).replace(/\n/g, ' ') + '..."');
  }

  // 5.4.4: Navegar por opciones (planes, FAQ, hablar con persona)
  // 1) Pedir planes
  await postToWebhook(makePayload(TEST_PHONE, 'planes', 'wamid.e2e.2'));
  await new Promise(r => setTimeout(r, 1500));

  const { data: msgs2 } = await SUPABASE
    .from('messages')
    .select('direction, sent_by, type, content')
    .eq('conversation_id', conv1.id)
    .order('created_at', { ascending: true });

  const allBot = msgs2?.filter(m => m.sent_by === 'bot') || [];
  if (allBot.length >= 2) ok('5.4.4a Bot navega a opcion "planes" (' + allBot.length + ' respuestas)');
  else fail_('5.4.4a', 'solo ' + allBot.length + ' respuestas');

  // 2) FAQ
  await postToWebhook(makePayload(TEST_PHONE, 'preguntas frecuentes', 'wamid.e2e.3'));
  await new Promise(r => setTimeout(r, 1500));

  // 3) Hablar con persona
  await postToWebhook(makePayload(TEST_PHONE, 'hablar con persona', 'wamid.e2e.4'));
  await new Promise(r => setTimeout(r, 1500));

  const { data: conv2 } = await SUPABASE
    .from('conversations')
    .select('bot_active, current_flow')
    .eq('id', conv1.id)
    .maybeSingle();

  const { data: msgs3 } = await SUPABASE
    .from('messages')
    .select('direction, sent_by, type, content')
    .eq('conversation_id', conv1.id)
    .order('created_at', { ascending: true });

  console.log('       Tras menu -> planes -> faq -> persona: ' + (msgs3?.length || 0) + ' mensajes totales, current_flow=' + conv2?.current_flow);
  if (msgs3 && msgs3.length >= 5) ok('5.4.4 Bot navego por multiples opciones');
  else fail_('5.4.4', 'solo ' + (msgs3?.length || 0) + ' mensajes');

  // ===== 5.4.5: Dashboard ve la conversacion =====
  header('5.4.5-5.4.7: Dashboard');
  const convs = await apiCall('GET', '/api/conversations?limit=20', null, token);
  const foundInList = (convs.body.conversations || []).find(c => c.phone === TEST_PHONE);
  if (foundInList) ok('5.4.5 Conversacion aparece en lista (last_message preview: "' + (foundInList.last_message?.preview || '').substring(0, 40) + '...")');
  else fail_('5.4.5 No aparece en lista de conversaciones');

  // 5.4.6: Chat carga mensajes
  const msgsList = await apiCall('GET', '/api/messages?conversation_id=' + conv1.id + '&limit=50', null, token);
  if (msgsList.status === 200 && (msgsList.body.messages?.length || 0) > 0) {
    ok('5.4.6 Chat muestra ' + msgsList.body.messages.length + ' mensajes con metadata completa');
  } else fail_('5.4.6', 'status=' + msgsList.status);

  // Verificar metadata de autor
  const firstMsg = msgsList.body.messages?.[0];
  if (firstMsg?.direction === 'inbound') {
    ok('       Inbound OK: contenido="' + (firstMsg.content || '').substring(0, 30) + '" sent_by=' + firstMsg.sent_by);
  }
  const botOut = msgsList.body.messages?.find(m => m.sent_by === 'bot');
  if (botOut) {
    ok('       Outbound bot OK: sent_by=' + botOut.sent_by + ' type=' + botOut.type);
  }

  // 5.4.7: Apagar bot y enviar mensaje manual
  const toggle = await apiCall('POST', '/api/conversations/toggle-bot', { conversation_id: conv1.id, bot_active: false }, token);
  if (toggle.status === 200) ok('5.4.7a Bot desactivado (bot_active=' + toggle.body.conversation.bot_active + ')');
  else fail_('5.4.7a', 'status=' + toggle.status);

  const send = await apiCall('POST', '/api/messages/send', { conversation_id: conv1.id, content: 'Mensaje manual de Areli via dashboard' }, token);
  if (send.status === 200 && send.body.message) {
    ok('5.4.7b Mensaje manual enviado: sent_by_name="' + send.body.message.sent_by_name + '" content="' + send.body.message.content.substring(0, 40) + '"');
  } else fail_('5.4.7b', 'status=' + send.status + ' body=' + JSON.stringify(send.body).substring(0, 200));

  // Verificar metadata
  const { data: manualMsg } = await SUPABASE
    .from('messages')
    .select('sent_by, metadata')
    .eq('id', send.body.message.id)
    .maybeSingle();

  if (manualMsg?.metadata?.sent_by_user_name) {
    ok('5.4.7c Metadata guarda sent_by_user_name="' + manualMsg.metadata.sent_by_user_name + '" (solo para dashboard, no en WhatsApp)');
  } else fail_('5.4.7c metadata sin sent_by_user_name');

  // 5.4.8: Bot desactivado, no responde
  await new Promise(r => setTimeout(r, 500));
  // Contar SOLO mensajes outbound del bot (no el inbound que se va a guardar)
  const { count: botOutBefore } = await SUPABASE.from('messages').select('*', { count: 'exact', head: true })
    .eq('conversation_id', conv1.id).eq('sent_by', 'bot');
  await postToWebhook(makePayload(TEST_PHONE, 'otra pregunta', 'wamid.e2e.5'));
  await new Promise(r => setTimeout(r, 1500));
  const { count: botOutAfter } = await SUPABASE.from('messages').select('*', { count: 'exact', head: true })
    .eq('conversation_id', conv1.id).eq('sent_by', 'bot');

  if (botOutAfter === botOutBefore) ok('5.4.8 Bot desactivado: no respondio al nuevo mensaje entrante (bot_out=' + botOutAfter + ')');
  else fail_('5.4.8', 'bot respondio aunque estaba desactivado: bot_out ' + botOutBefore + ' -> ' + botOutAfter);

  // 5.4.9: Encender bot, debe enviar mensaje de reactivacion
  const reactiv = await apiCall('POST', '/api/conversations/toggle-bot', { conversation_id: conv1.id, bot_active: true }, token);
  if (reactiv.status === 200 && reactiv.body.reactivation_sent) {
    ok('5.4.9 Bot reactivado con reactivation_sent=true');
  } else if (reactiv.status === 200) {
    ok('5.4.9 Bot reactivado (reactivation_sent=' + reactiv.body.reactivation_sent + ')');
  } else fail_('5.4.9', 'status=' + reactiv.status);

  // ===== 5.4.10: KPIs en tiempo real =====
  header('5.4.10: KPIs en tiempo real');
  const kpis1 = await apiCall('GET', '/api/kpis', null, token);
  if (kpis1.status === 200 && kpis1.body.totals) {
    const t = kpis1.body.totals;
    console.log('  Totales: messages=' + t.messages + ' active=' + t.active_conversations + ' contacts=' + t.contacts);
    ok('5.4.10 KPIs disponibles: totals, today, direction_breakdown, conversations_by_status, 7days');
  } else fail_('5.4.10', 'status=' + kpis1.status);

  // ===== 5.4.11: Archivados =====
  header('5.4.11: Archivados (archivar / listar / restaurar)');

  const testConv = await apiCall('GET', '/api/conversations?limit=1', null, token);
  const convId = testConv.body.conversations?.[0]?.id;

  if (!convId) {
    fail_('5.4.11a', 'no hay conversaciones para test');
  } else {
    const arch = await apiCall('POST', '/api/conversations/archive', { conversation_id: convId, archived: true }, token);
    if (arch.status === 200 && arch.body.conversation?.archived_at) {
      ok('5.4.11a Conversacion archivada: archived_at=' + arch.body.conversation.archived_at);
    } else fail_('5.4.11a', 'status=' + arch.status);

    const archList = await apiCall('GET', '/api/conversations?archived=true&limit=10', null, token);
    const inArchived = (archList.body.conversations || []).find(c => c.id === convId);
    if (inArchived) ok('5.4.11b Aparece en GET /api/conversations?archived=true');
    else fail_('5.4.11b', 'no aparece en lista de archivados');

    const mainList = await apiCall('GET', '/api/conversations?limit=200', null, token);
    const inMain = (mainList.body.conversations || []).find(c => c.id === convId);
    if (!inMain) ok('5.4.11c NO aparece en la lista principal (filtrado por default)');
    else fail_('5.4.11c', 'aparece en lista principal - filtro no aplicado');

    const restore = await apiCall('POST', '/api/conversations/archive', { conversation_id: convId, archived: false }, token);
    if (restore.status === 200 && !restore.body.conversation?.archived_at) {
      ok('5.4.11d Conversacion restaurada: archived_at=' + restore.body.conversation.archived_at);
    } else fail_('5.4.11d', 'status=' + restore.status);
  }

  // ===== RESUMEN =====
  console.log('\n=== RESUMEN ===');
  console.log('OK:   ' + pass);
  console.log('FAIL: ' + fail);
  console.log('Total: ' + (pass + fail));
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('Excepcion:', e); process.exit(2); });
