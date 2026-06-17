require('dotenv').config();

const { supabaseAdmin } = require('../src/lib/supabase');

const loginHandler = require('../api/auth/login');
const kpisHandler = require('../api/kpis/index');

const MEXICO_OFFSET_HOURS = -6;

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

function mexicoDateString(date = new Date()) {
  const shifted = new Date(date.getTime() + MEXICO_OFFSET_HOURS * 3600 * 1000);
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function mexicoDateNDaysAgo(daysAgo) {
  const todayStr = mexicoDateString(new Date());
  const [y, m, d] = todayStr.split('-').map(Number);
  const past = new Date(Date.UTC(y, m - 1, d - daysAgo));
  return `${past.getUTCFullYear()}-${String(past.getUTCMonth() + 1).padStart(2, '0')}-${String(past.getUTCDate()).padStart(2, '0')}`;
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

async function fetchKpis(token) {
  const { req, res } = mockReqRes('GET', null, {}, token ? { authorization: `Bearer ${token}` } : {});
  await kpisHandler(req, res);
  return res;
}

async function testNoAuth() {
  console.log('\n--- Test 1: Sin token ---');
  const res = await fetchKpis(null);
  console.log(`Status: ${res.statusCode}`);
  return res.statusCode === 401;
}

async function testMethodNotAllowed(token) {
  console.log('\n--- Test 2: POST no permitido ---');
  const { req, res } = mockReqRes('POST', {}, {}, { authorization: `Bearer ${token}` });
  await kpisHandler(req, res);
  console.log(`Status: ${res.statusCode}`);
  return res.statusCode === 405;
}

async function testCors() {
  console.log('\n--- Test 3: OPTIONS preflight ---');
  const { req, res } = mockReqRes('OPTIONS');
  await kpisHandler(req, res);
  console.log(`Status: ${res.statusCode} | CORS: ${res.headers['Access-Control-Allow-Origin']}`);
  return res.statusCode === 204 && res.headers['Access-Control-Allow-Origin'] === '*';
}

async function testBasicResponse(token) {
  console.log('\n--- Test 4: Respuesta básica válida ---');
  const res = await fetchKpis(token);
  console.log(`Status: ${res.statusCode}`);
  if (res.statusCode === 200) {
    console.log(`  totals.messages: ${res.body.totals?.messages}`);
    console.log(`  totals.active_conversations: ${res.body.totals?.active_conversations}`);
    console.log(`  totals.contacts: ${res.body.totals?.contacts}`);
    console.log(`  today.messages: ${res.body.today?.messages} (${res.body.today?.date})`);
    console.log(`  conversations_by_status: ${JSON.stringify(res.body.conversations_by_status)}`);
    console.log(`  messages_last_7_days length: ${res.body.messages_last_7_days?.length}`);
  }
  return res.statusCode === 200;
}

async function testResponseStructure(token) {
  console.log('\n--- Test 5: Estructura completa ---');
  const res = await fetchKpis(token);
  const b = res.body;
  const ok =
    typeof b.totals === 'object' &&
    typeof b.totals.messages === 'number' &&
    typeof b.totals.active_conversations === 'number' &&
    typeof b.totals.contacts === 'number' &&
    typeof b.today === 'object' &&
    typeof b.today.messages === 'number' &&
    typeof b.today.date === 'string' &&
    typeof b.conversations_by_status === 'object' &&
    Array.isArray(b.messages_last_7_days) &&
    typeof b.direction_breakdown === 'object' &&
    typeof b.direction_breakdown.inbound === 'number' &&
    typeof b.direction_breakdown.outbound === 'number' &&
    b.timezone === 'America/Mexico_City' &&
    typeof b.generated_at === 'string';
  console.log(`  Estructura valida: ${ok}`);
  return ok;
}

async function testCountsNonNegative(token) {
  console.log('\n--- Test 6: Counts no negativos ---');
  const res = await fetchKpis(token);
  const b = res.body;
  const ok =
    b.totals.messages >= 0 &&
    b.totals.active_conversations >= 0 &&
    b.totals.contacts >= 0 &&
    b.today.messages >= 0 &&
    b.direction_breakdown.inbound >= 0 &&
    b.direction_breakdown.outbound >= 0;
  console.log(`  Todos >= 0: ${ok}`);
  return ok;
}

async function testSevenDayArrayLength(token) {
  console.log('\n--- Test 7: Array 7 días (length=7) ---');
  const res = await fetchKpis(token);
  const arr = res.body.messages_last_7_days || [];
  const ok = arr.length === 7;
  console.log(`  Length: ${arr.length} | Esperado: 7`);
  return ok;
}

async function testSevenDaySequence(token) {
  console.log('\n--- Test 8: Secuencia de fechas correcta ---');
  const res = await fetchKpis(token);
  const arr = res.body.messages_last_7_days || [];
  const expected = [];
  for (let i = 6; i >= 0; i--) {
    expected.push(mexicoDateNDaysAgo(i));
  }
  const actual = arr.map(d => d.date);
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  Esperado: ${expected.join(', ')}`);
  console.log(`  Actual:   ${actual.join(', ')}`);
  console.log(`  Match: ${ok}`);
  return ok;
}

async function testDateFormat(token) {
  console.log('\n--- Test 9: Formato de fechas YYYY-MM-DD ---');
  const res = await fetchKpis(token);
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const allValid =
    re.test(res.body.today.date) &&
    res.body.messages_last_7_days.every(d => re.test(d.date) && typeof d.count === 'number');
  console.log(`  today.date: ${res.body.today.date}`);
  console.log(`  Todos los entries con formato valido: ${allValid}`);
  return allValid;
}

async function testConversationStatusObject(token) {
  console.log('\n--- Test 10: conversations_by_status es objeto ---');
  const res = await fetchKpis(token);
  const obj = res.body.conversations_by_status;
  const isObj = obj && typeof obj === 'object' && !Array.isArray(obj);
  const allValuesAreNumbers = isObj && Object.values(obj).every(v => typeof v === 'number' && v >= 0);
  console.log(`  Keys: ${Object.keys(obj || {}).join(', ')}`);
  console.log(`  Es objeto con valores numericos: ${isObj && allValuesAreNumbers}`);
  return isObj && allValuesAreNumbers;
}

async function testDelta(token) {
  console.log('\n--- Test 11: Delta al insertar datos ---');
  const phone = '+525555' + String(Date.now()).slice(-7);
  await cleanupTestData(phone);

  const before = await fetchKpis(token);
  const b = before.body;
  const startTotal = b.totals.messages;
  const startActive = b.totals.active_conversations;
  const startContacts = b.totals.contacts;
  const startToday = b.today.messages;
  const startInbound = b.direction_breakdown.inbound;
  const startOutbound = b.direction_breakdown.outbound;

  const { data: contact } = await supabaseAdmin
    .from('contacts')
    .insert({ phone, name: 'KPI Delta Test' })
    .select()
    .single();

  const { data: conv } = await supabaseAdmin
    .from('conversations')
    .insert({
      contact_id: contact.id,
      phone,
      status: 'active',
      bot_active: true,
      current_flow: 'menu',
      current_step: 'start'
    })
    .select()
    .single();

  await supabaseAdmin.from('messages').insert([
    { conversation_id: conv.id, direction: 'inbound', content: 'in1', type: 'text', sent_by: 'contact' },
    { conversation_id: conv.id, direction: 'outbound', content: 'out1', type: 'text', sent_by: 'bot' },
    { conversation_id: conv.id, direction: 'outbound', content: 'out2', type: 'text', sent_by: 'bot' }
  ]);

  const after = await fetchKpis(token);
  const a = after.body;
  const messagesDelta = a.totals.messages - startTotal;
  const activeDelta = a.totals.active_conversations - startActive;
  const contactsDelta = a.totals.contacts - startContacts;
  const todayDelta = a.today.messages - startToday;
  const inboundDelta = a.direction_breakdown.inbound - startInbound;
  const outboundDelta = a.direction_breakdown.outbound - startOutbound;

  console.log(`  messages: ${startTotal} -> ${a.totals.messages} (delta=${messagesDelta}, esperado=3)`);
  console.log(`  active: ${startActive} -> ${a.totals.active_conversations} (delta=${activeDelta}, esperado=1)`);
  console.log(`  contacts: ${startContacts} -> ${a.totals.contacts} (delta=${contactsDelta}, esperado=1)`);
  console.log(`  today: ${startToday} -> ${a.today.messages} (delta=${todayDelta}, esperado=3)`);
  console.log(`  inbound: ${startInbound} -> ${a.direction_breakdown.inbound} (delta=${inboundDelta}, esperado=1)`);
  console.log(`  outbound: ${startOutbound} -> ${a.direction_breakdown.outbound} (delta=${outboundDelta}, esperado=2)`);

  const todayIn = a.messages_last_7_days.find(d => d.date === a.today.date);
  console.log(`  today entry en 7-day: count=${todayIn?.count}`);

  await cleanupTestData(phone);

  const after2 = await fetchKpis(token);
  const a2 = after2.body;
  const reverted = (
    a2.totals.messages === startTotal &&
    a2.totals.active_conversations === startActive &&
    a2.totals.contacts === startContacts &&
    a2.direction_breakdown.inbound === startInbound &&
    a2.direction_breakdown.outbound === startOutbound
  );
  console.log(`  Revertido correctamente: ${reverted}`);

  return (
    messagesDelta === 3 &&
    activeDelta === 1 &&
    contactsDelta === 1 &&
    todayDelta === 3 &&
    inboundDelta === 1 &&
    outboundDelta === 2 &&
    reverted
  );
}

async function cleanupTestData(phone) {
  const { data: convs } = await supabaseAdmin
    .from('conversations')
    .select('id')
    .eq('phone', phone);
  if (convs && convs.length > 0) {
    const ids = convs.map(c => c.id);
    await supabaseAdmin.from('messages').delete().in('conversation_id', ids);
    await supabaseAdmin.from('conversations').delete().in('id', ids);
  }
  await supabaseAdmin.from('contacts').delete().eq('phone', phone);
}

async function main() {
  console.log('=== Tests de KPIs ===');
  try {
    const token = await login();
    console.log('Login OK');

    const tests = [
      { name: 'Sin auth', fn: testNoAuth },
      { name: 'POST no permitido', fn: () => testMethodNotAllowed(token) },
      { name: 'CORS preflight', fn: testCors },
      { name: 'Respuesta basica', fn: () => testBasicResponse(token) },
      { name: 'Estructura completa', fn: () => testResponseStructure(token) },
      { name: 'Counts no negativos', fn: () => testCountsNonNegative(token) },
      { name: '7 dias length', fn: () => testSevenDayArrayLength(token) },
      { name: 'Secuencia fechas', fn: () => testSevenDaySequence(token) },
      { name: 'Formato fechas', fn: () => testDateFormat(token) },
      { name: 'Status object', fn: () => testConversationStatusObject(token) },
      { name: 'Delta al insertar', fn: () => testDelta(token) }
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
    results.forEach(r => console.log(`${r.pass ? 'OK  ' : 'FAIL'} ${r.name}`));
    const passed = results.filter(r => r.pass).length;
    console.log(`\n${passed}/${results.length} tests pasaron`);

    if (passed < results.length) process.exit(1);
  } catch (e) {
    console.error('Error fatal:', e);
    process.exit(1);
  }
}

main();
