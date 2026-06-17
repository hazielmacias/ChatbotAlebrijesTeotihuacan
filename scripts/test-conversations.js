require('dotenv').config();

const { supabaseAdmin } = require('../src/lib/supabase');
const { processIncomingMessage } = require('../src/bot/engine');

const loginHandler = require('../api/auth/login');
const conversationsHandler = require('../api/conversations/index');
const toggleBotHandler = require('../api/conversations/toggle-bot');

function mockReqRes(method, body, query = {}, headers = {}) {
  const req = { method, body, query, headers };
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
    send(data) { this.body = data; return this; },
    end() { return this; }
  };
  return { req, res };
}

async function login() {
  const { req, res } = mockReqRes('POST', {
    email: 'admin@alebrijesteotihuacan.com',
    password: 'Alebrijes2026!'
  });
  await loginHandler(req, res);
  if (res.statusCode !== 200) throw new Error('Login fallo: ' + JSON.stringify(res.body));
  return res.body.token;
}

async function seedTestData(token) {
  console.log('\n[seed] Creando conversaciones de prueba...');
  const phones = [
    { phone: '+525555100001', name: 'Juan Perez', flow: 'menu', step: 'start' },
    { phone: '+525555100002', name: 'Maria Lopez', flow: 'escuela', step: 'collect_data' },
    { phone: '+525555100003', name: 'Carlos Ruiz', flow: 'tdp', step: 'info' },
    { phone: '+525555100004', name: null, flow: 'piloto', step: 'info' },
    { phone: '+525555100005', name: 'Ana Martinez', flow: 'menu', step: 'human_takeover' }
  ];

  const created = [];
  for (const p of phones) {
    await supabaseAdmin.from('contacts').delete().eq('phone', p.phone);

    const { data: contact } = await supabaseAdmin
      .from('contacts')
      .insert({ phone: p.phone, name: p.name })
      .select()
      .single();

    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .insert({
        contact_id: contact.id,
        phone: p.phone,
        status: 'active',
        bot_active: p.step !== 'human_takeover',
        current_flow: p.flow,
        current_step: p.step
      })
      .select()
      .single();

    await supabaseAdmin.from('messages').insert([
      { conversation_id: conv.id, direction: 'inbound', content: 'Hola', sent_by: 'contact', type: 'text' },
      { conversation_id: conv.id, direction: 'outbound', content: 'Bienvenido', sent_by: 'bot', type: 'text' },
      { conversation_id: conv.id, direction: 'inbound', content: 'menu', sent_by: 'contact', type: 'text' }
    ]);

    created.push(conv);
  }

  console.log(`[seed] Creadas ${created.length} conversaciones con mensajes`);
  return created;
}

async function cleanup(phones) {
  for (const phone of phones) {
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('phone', phone);
    if (conv && conv.length > 0) {
      const ids = conv.map(c => c.id);
      await supabaseAdmin.from('messages').delete().in('conversation_id', ids);
      await supabaseAdmin.from('conversations').delete().in('id', ids);
    }
    await supabaseAdmin.from('contacts').delete().eq('phone', phone);
  }
}

async function testListBasic(token) {
  console.log('\n--- Test 1: Listar conversaciones (basico) ---');
  const { req, res } = mockReqRes('GET', null, {}, { authorization: `Bearer ${token}` });
  await conversationsHandler(req, res);
  console.log(`Status: ${res.statusCode}`);
  if (res.statusCode === 200) {
    console.log(`Total: ${res.body.pagination.total}`);
    console.log(`Retornadas: ${res.body.pagination.returned}`);
    console.log(`Page: ${res.body.pagination.page}, Limit: ${res.body.pagination.limit}`);
    if (res.body.conversations[0]) {
      const c = res.body.conversations[0];
      console.log(`Primera conv: phone=${c.phone} name=${c.contact?.name} last_msg="${c.last_message?.preview}"`);
    }
  } else {
    console.log(`Error: ${JSON.stringify(res.body)}`);
  }
  return res.statusCode === 200 && res.body.conversations.length > 0;
}

async function testListWithSearch(token) {
  console.log('\n--- Test 2: Buscar por nombre ---');
  const { req, res } = mockReqRes('GET', null, { search: 'Maria' }, { authorization: `Bearer ${token}` });
  await conversationsHandler(req, res);
  console.log(`Status: ${res.statusCode} | Matched: ${res.body.conversations.length}`);
  if (res.body.conversations.length > 0) {
    console.log(`Primer match: ${res.body.conversations[0].contact?.name} (${res.body.conversations[0].phone})`);
  }
  return res.statusCode === 200 && res.body.conversations.some(c => c.contact?.name?.includes('Maria'));
}

async function testListByStatus(token) {
  console.log('\n--- Test 3: Filtrar por status=active ---');
  const { req, res } = mockReqRes('GET', null, { status: 'active' }, { authorization: `Bearer ${token}` });
  await conversationsHandler(req, res);
  const allActive = res.body.conversations.every(c => c.status === 'active');
  console.log(`Status: ${res.statusCode} | Total: ${res.body.pagination.total} | Todas activas: ${allActive}`);
  return res.statusCode === 200 && allActive;
}

async function testListPagination(token) {
  console.log('\n--- Test 4: Paginacion (limit=2) ---');
  const { req, res } = mockReqRes('GET', null, { limit: '2', page: '1' }, { authorization: `Bearer ${token}` });
  await conversationsHandler(req, res);
  console.log(`Status: ${res.statusCode} | Returned: ${res.body.pagination.returned} | Total: ${res.body.pagination.total}`);
  return res.statusCode === 200 && res.body.conversations.length <= 2;
}

async function testListNoAuth() {
  console.log('\n--- Test 5: Listar sin token ---');
  const { req, res } = mockReqRes('GET', null, {});
  await conversationsHandler(req, res);
  console.log(`Status: ${res.statusCode} body: ${JSON.stringify(res.body)}`);
  return res.statusCode === 401;
}

async function testListMethodNotAllowed(token) {
  console.log('\n--- Test 6: POST en /api/conversations ---');
  const { req, res } = mockReqRes('POST', { x: 1 }, {}, { authorization: `Bearer ${token}` });
  await conversationsHandler(req, res);
  console.log(`Status: ${res.statusCode}`);
  return res.statusCode === 405;
}

async function testToggleBotActivate(token, convId) {
  console.log('\n--- Test 7: Reactivar bot (false -> true) ---');
  const { req, res } = mockReqRes('POST', { bot_active: true, conversation_id: convId }, {}, { authorization: `Bearer ${token}` });
  await toggleBotHandler(req, res);
  console.log(`Status: ${res.statusCode}`);
  if (res.statusCode === 200) {
    console.log(`Changed: ${res.body.changed}`);
    console.log(`Previous: ${res.body.previous_bot_active} | New: ${res.body.new_bot_active}`);
    console.log(`Reactivation sent: ${res.body.reactivation_sent}`);
    if (res.body.reactivation_error) console.log(`Reactivation error: ${res.body.reactivation_error}`);
  } else {
    console.log(`Error: ${JSON.stringify(res.body)}`);
  }
  return res.statusCode === 200 && res.body.changed && res.body.new_bot_active === true;
}

async function testToggleBotDeactivate(token, convId) {
  console.log('\n--- Test 8: Desactivar bot (true -> false) ---');
  const { req, res } = mockReqRes('POST', { bot_active: false, conversation_id: convId }, {}, { authorization: `Bearer ${token}` });
  await toggleBotHandler(req, res);
  console.log(`Status: ${res.statusCode} | Reactivation: ${res.body.reactivation_sent}`);
  return res.statusCode === 200 && res.body.changed && res.body.new_bot_active === false && !res.body.reactivation_sent;
}

async function testToggleBotNoChange(token, convId) {
  console.log('\n--- Test 9: Toggle sin cambio (mismo valor) ---');
  const { data: current } = await supabaseAdmin
    .from('conversations')
    .select('bot_active')
    .eq('id', convId)
    .single();
  const currentValue = current?.bot_active;
  console.log(`  Estado actual: ${currentValue}, intentando setear el mismo valor`);

  const { req, res } = mockReqRes('POST', { bot_active: currentValue, conversation_id: convId }, {}, { authorization: `Bearer ${token}` });
  await toggleBotHandler(req, res);
  console.log(`Status: ${res.statusCode} | Changed: ${res.body.changed}`);
  return res.statusCode === 200 && !res.body.changed;
}

async function testToggleBotNotFound(token) {
  console.log('\n--- Test 10: Conversacion inexistente ---');
  const fakeId = '00000000-0000-0000-0000-000000000000';
  const { req, res } = mockReqRes('POST', { bot_active: true, conversation_id: fakeId }, {}, { authorization: `Bearer ${token}` });
  await toggleBotHandler(req, res);
  console.log(`Status: ${res.statusCode}`);
  return res.statusCode === 404;
}

async function testToggleBotInvalidBody(token, convId) {
  console.log('\n--- Test 11: Body invalido (no boolean) ---');
  const { req, res } = mockReqRes('POST', { bot_active: 'yes', conversation_id: convId }, {}, { authorization: `Bearer ${token}` });
  await toggleBotHandler(req, res);
  console.log(`Status: ${res.statusCode}`);
  return res.statusCode === 400;
}

async function testToggleBotNoAuth() {
  console.log('\n--- Test 12: Toggle sin token ---');
  const { req, res } = mockReqRes('POST', { bot_active: false, conversation_id: '00000000-0000-0000-0000-000000000000' }, {});
  await toggleBotHandler(req, res);
  console.log(`Status: ${res.statusCode}`);
  return res.statusCode === 401;
}

async function main() {
  const seededPhones = ['+525555100001', '+525555100002', '+525555100003', '+525555100004', '+525555100005'];

  try {
    await cleanup(seededPhones);
    const token = await login();
    const convs = await seedTestData(token);

    const humanConv = convs.find(c => c.current_step === 'human_takeover');
    const activeConv = convs.find(c => c.bot_active);

    const tests = [
      { name: 'Listar basico', fn: () => testListBasic(token) },
      { name: 'Buscar por nombre', fn: () => testListWithSearch(token) },
      { name: 'Filtrar por status', fn: () => testListByStatus(token) },
      { name: 'Paginacion', fn: () => testListPagination(token) },
      { name: 'Listar sin auth', fn: () => testListNoAuth() },
      { name: 'POST en listado', fn: () => testListMethodNotAllowed(token) },
      { name: 'Reactivar bot', fn: () => testToggleBotActivate(token, humanConv.id) },
      { name: 'Desactivar bot', fn: () => testToggleBotDeactivate(token, humanConv.id) },
      { name: 'Toggle sin cambio', fn: () => testToggleBotNoChange(token, humanConv.id) },
      { name: 'Reactivar bot (2da vez)', fn: () => testToggleBotActivate(token, humanConv.id) },
      { name: 'Conv no encontrada', fn: () => testToggleBotNotFound(token) },
      { name: 'Body invalido', fn: () => testToggleBotInvalidBody(token, activeConv.id) },
      { name: 'Toggle sin auth', fn: () => testToggleBotNoAuth() }
    ];

    const results = [];
    for (const t of tests) {
      try {
        const ok = await t.fn();
        results.push({ name: t.name, pass: ok });
        console.log(`  ${ok ? 'OK' : 'FAIL'}`);
      } catch (e) {
        results.push({ name: t.name, pass: false, error: e.message });
        console.log(`  FAIL: ${e.message}`);
      }
    }

    console.log('\n=== Resumen ===');
    results.forEach(r => console.log(`${r.pass ? 'OK  ' : 'FAIL'} ${r.name}${r.error ? ' - ' + r.error : ''}`));
    const passed = results.filter(r => r.pass).length;
    console.log(`\n${passed}/${results.length} tests pasaron`);

    await cleanup(seededPhones);
  } catch (e) {
    console.error('Error fatal:', e);
    await cleanup(seededPhones);
    process.exit(1);
  }
}

main();

