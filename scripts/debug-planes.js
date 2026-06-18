// Debug: enviar 'planes' y ver la respuesta
require('dotenv').config();
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const http = require('https');

const SUPABASE = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const APP_SECRET = process.env.META_APP_SECRET;

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
          metadata: { phone_number_id: '1181282128398668' },
          contacts: [{ wa_id: from, profile: { name: 'Debug User' }}],
          messages: [{ from, id: messageId || 'wamid.debug.' + Date.now(), timestamp: Math.floor(Date.now()/1000).toString(), type: 'text', text: { body: text }}]
        },
        field: 'messages'
      }]
    }]
  };
}

(async () => {
  const PHONE = '521' + (900000000 + Math.floor(Math.random() * 99999999)).toString().substring(0, 10);
  console.log('Telefono:', PHONE);

  console.log('\n--- Paso 1: hola ---');
  const r1 = await postToWebhook(makePayload(PHONE, 'hola', 'wamid.d1'));
  console.log('Status:', r1.status, '|', JSON.stringify(r1.body).substring(0, 200));
  await new Promise(r => setTimeout(r, 1500));

  console.log('\n--- Paso 2: planes ---');
  const r2 = await postToWebhook(makePayload(PHONE, 'planes', 'wamid.d2'));
  console.log('Status:', r2.status, '|', JSON.stringify(r2.body).substring(0, 200));
  await new Promise(r => setTimeout(r, 1500));

  const { data: conv } = await SUPABASE
    .from('conversations')
    .select('id, current_flow, current_step')
    .eq('phone', PHONE)
    .maybeSingle();

  console.log('\nConversation:', conv);

  if (conv) {
    const { data: msgs } = await SUPABASE
      .from('messages')
      .select('direction, sent_by, content, metadata')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true });

    console.log('\nTodos los mensajes:');
    msgs.forEach((m, i) => {
      console.log('  ' + (i + 1) + '. ' + m.direction + '/' + m.sent_by + ': ' + (m.content || '').substring(0, 100).replace(/\n/g, ' \\n '));
      if (m.metadata && Object.keys(m.metadata).length) {
        console.log('       metadata:', JSON.stringify(m.metadata).substring(0, 100));
      }
    });
  }
})();
