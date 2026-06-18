// Test: enviar '5' (la nueva opcion del menu) en vez de 'planes'
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
          contacts: [{ wa_id: from, profile: { name: 'Debug 5' }}],
          messages: [{ from, id: messageId || 'wamid.d5.' + Date.now(), timestamp: Math.floor(Date.now()/1000).toString(), type: 'text', text: { body: text }}]
        },
        field: 'messages'
      }]
    }]
  };
}

(async () => {
  // Crear un plan primero via API
  const login = await new Promise((resolve) => {
    const opts = { hostname: 'alebrijes-chatbot.vercel.app', port: 443, path: '/api/auth/login', method: 'POST',
      headers: { 'Content-Type': 'application/json' }};
    const r = http.request(opts, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve({}); } });
    });
    r.write(JSON.stringify({ email: 'areli@alebrijesteotihuacan.com', password: 'areli123' }));
    r.end();
  });
  const token = login.token;

  const planName = 'TEST 5 OPTION ' + Date.now();
  const create = await new Promise((resolve) => {
    const opts = { hostname: 'alebrijes-chatbot.vercel.app', port: 443, path: '/api/catalog', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }};
    const r = http.request(opts, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve({}); } });
    });
    r.write(JSON.stringify({ name: planName, price: 999, category: 'escuela' }));
    r.end();
  });
  console.log('Plan creado:', create.plan?.id?.substring(0, 8), '|', create.plan?.name);

  const PHONE = '521' + (900000000 + Math.floor(Math.random() * 99999999)).toString().substring(0, 10);
  console.log('\nTelefono:', PHONE);

  console.log('\n--- Paso 1: hola ---');
  await postToWebhook(makePayload(PHONE, 'hola', 'wamid.dh.' + Date.now()));
  await new Promise(r => setTimeout(r, 1500));

  console.log('\n--- Paso 2: opcion 5 (planes) ---');
  const r2 = await postToWebhook(makePayload(PHONE, '5', 'wamid.d5b.' + Date.now()));
  console.log('Response:', r2.body.response_flow, r2.body.response_step, '|', r2.body.response || '');
  await new Promise(r => setTimeout(r, 2000));

  const { data: conv } = await SUPABASE.from('conversations').select('id, current_flow, current_step').eq('phone', PHONE).maybeSingle();
  console.log('Conversation:', conv);

  if (conv) {
    const { data: msgs } = await SUPABASE.from('messages').select('direction, sent_by, content').eq('conversation_id', conv.id).order('created_at', { ascending: true });
    msgs.forEach((m, i) => {
      console.log('  ' + (i + 1) + '. ' + m.direction + '/' + m.sent_by + ': ' + (m.content || '').substring(0, 150).replace(/\n/g, ' \\n '));
    });
    const lastBot = [...msgs].reverse().find(m => m.sent_by === 'bot');
    if (lastBot && lastBot.content.includes(planName)) {
      console.log('\n[OK] El plan creado aparece en la respuesta del bot');
    } else if (lastBot) {
      console.log('\n[FAIL] El plan NO aparece en la respuesta del bot. Ultimo bot:', lastBot.content.substring(0, 200));
    }
  }

  // Limpiar
  if (create.plan?.id) {
    await new Promise((resolve) => {
      const opts = { hostname: 'alebrijes-chatbot.vercel.app', port: 443, path: '/api/catalog/delete', method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }};
      const r = http.request(opts, (res) => { res.on('data', () => {}); res.on('end', resolve); });
      r.write(JSON.stringify({ id: create.plan.id }));
      r.end();
    });
  }
})();
