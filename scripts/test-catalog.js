require('dotenv').config();

const { supabaseAdmin } = require('../src/lib/supabase');

const loginHandler = require('../api/auth/login');
const catalogListHandler = require('../api/catalog/index');
const catalogItemHandler = require('../api/catalog/[id]');

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

function getToken(req, res) {
  return req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '') : null;
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

const TEST_TAG = 'TEST_CATALOG_' + Date.now();

async function testNoAuth() {
  console.log('\n--- Test 1: GET /api/catalog sin auth ---');
  const { req, res } = mockReqRes('GET');
  await catalogListHandler(req, res);
  console.log(`Status: ${res.statusCode}`);
  return res.statusCode === 401;
}

async function testMethodNotAllowedList(token) {
  console.log('\n--- Test 2: DELETE en /api/catalog (no permitido) ---');
  const { req, res } = mockReqRes('DELETE', null, {}, { authorization: `Bearer ${token}` });
  await catalogListHandler(req, res);
  console.log(`Status: ${res.statusCode}`);
  return res.statusCode === 405;
}

async function testCors() {
  console.log('\n--- Test 3: OPTIONS preflight ---');
  const { req, res } = mockReqRes('OPTIONS');
  await catalogListHandler(req, res);
  console.log(`Status: ${res.statusCode} | Allow-Methods: ${res.headers['Access-Control-Allow-Methods']}`);
  return res.statusCode === 204 && res.headers['Access-Control-Allow-Origin'] === '*';
}

async function testListEmpty(token) {
  console.log('\n--- Test 4: GET listar activos (base) ---');
  const { req, res } = mockReqRes('GET', null, {}, { authorization: `Bearer ${token}` });
  await catalogListHandler(req, res);
  console.log(`Status: ${res.statusCode} | count: ${res.body.count}`);
  return res.statusCode === 200 && Array.isArray(res.body.plans);
}

async function testCreateSuccess(token) {
  console.log('\n--- Test 5: POST crear plan valido ---');
  const { req, res } = mockReqRes('POST', {
    name: `${TEST_TAG}_PLAN_1`,
    description: 'Plan de prueba',
    price: 1500.00,
    category: 'escuela',
    image_url: 'https://example.com/img.png'
  }, {}, { authorization: `Bearer ${token}` });
  await catalogListHandler(req, res);
  console.log(`Status: ${res.statusCode} | id: ${res.body.plan?.id}`);
  if (res.body.plan) {
    console.log(`  name: ${res.body.plan.name} price: ${res.body.plan.price} is_active: ${res.body.plan.is_active}`);
  }
  return res.statusCode === 201 && res.body.plan?.id;
}

async function testCreateMissingName(token) {
  console.log('\n--- Test 6: POST sin name ---');
  const { req, res } = mockReqRes('POST', {
    price: 100,
    category: 'escuela'
  }, {}, { authorization: `Bearer ${token}` });
  await catalogListHandler(req, res);
  console.log(`Status: ${res.statusCode} | error: ${res.body.error}`);
  return res.statusCode === 400;
}

async function testCreateInvalidPrice(token) {
  console.log('\n--- Test 7: POST con price invalido ---');
  const { req, res } = mockReqRes('POST', {
    name: `${TEST_TAG}_INVALID`,
    price: -50
  }, {}, { authorization: `Bearer ${token}` });
  await catalogListHandler(req, res);
  console.log(`Status: ${res.statusCode} | details: ${JSON.stringify(res.body.details)}`);
  return res.statusCode === 400;
}

async function testCreateInvalidUrl(token) {
  console.log('\n--- Test 8: POST con image_url invalida ---');
  const { req, res } = mockReqRes('POST', {
    name: `${TEST_TAG}_BADURL`,
    image_url: 'not-a-url'
  }, {}, { authorization: `Bearer ${token}` });
  await catalogListHandler(req, res);
  console.log(`Status: ${res.statusCode}`);
  return res.statusCode === 400;
}

async function testListIncludesCreated(token, planId) {
  console.log('\n--- Test 9: GET incluye plan recien creado ---');
  const { req, res } = mockReqRes('GET', null, { search: TEST_TAG }, { authorization: `Bearer ${token}` });
  await catalogListHandler(req, res);
  const found = (res.body.plans || []).find(p => p.id === planId);
  console.log(`Status: ${res.statusCode} | encontrado: ${!!found} | count: ${res.body.count}`);
  return res.statusCode === 200 && !!found;
}

async function testListFilterByCategory(token, planId) {
  console.log('\n--- Test 10: GET filtrar por category=escuela ---');
  const { req, res } = mockReqRes('GET', null, { category: 'escuela' }, { authorization: `Bearer ${token}` });
  await catalogListHandler(req, res);
  const allEscuela = (res.body.plans || []).every(p => p.category === 'escuela');
  const found = (res.body.plans || []).find(p => p.id === planId);
  console.log(`Status: ${res.statusCode} | todos escuela: ${allEscuela} | incluye test: ${!!found}`);
  return res.statusCode === 200 && allEscuela && !!found;
}

async function testUpdatePartial(token, planId) {
  console.log('\n--- Test 11: PATCH actualizar campos parciales ---');
  const { req, res } = mockReqRes('PATCH', {
    price: 2000.50,
    description: 'Plan actualizado'
  }, { id: planId }, { authorization: `Bearer ${token}` });
  await catalogItemHandler(req, res);
  console.log(`Status: ${res.statusCode} | updated_fields: ${res.body.updated_fields?.join(', ')}`);
  if (res.body.plan) {
    console.log(`  price: ${res.body.plan.price} description: ${res.body.plan.description}`);
  }
  return res.statusCode === 200 &&
    res.body.plan?.price === 2000.50 &&
    res.body.plan?.description === 'Plan actualizado' &&
    res.body.plan?.name?.startsWith(TEST_TAG);
}

async function testUpdateEmpty(token, planId) {
  console.log('\n--- Test 12: PATCH sin campos ---');
  const { req, res } = mockReqRes('PATCH', {}, { id: planId }, { authorization: `Bearer ${token}` });
  await catalogItemHandler(req, res);
  console.log(`Status: ${res.statusCode}`);
  return res.statusCode === 400;
}

async function testUpdateNotFound(token) {
  console.log('\n--- Test 13: PATCH plan inexistente ---');
  const fakeId = '00000000-0000-0000-0000-000000000000';
  const { req, res } = mockReqRes('PATCH', { price: 100 }, { id: fakeId }, { authorization: `Bearer ${token}` });
  await catalogItemHandler(req, res);
  console.log(`Status: ${res.statusCode}`);
  return res.statusCode === 404;
}

async function testGetById(token, planId) {
  console.log('\n--- Test 14: GET /api/catalog/:id ---');
  const { req, res } = mockReqRes('GET', null, { id: planId }, { authorization: `Bearer ${token}` });
  await catalogItemHandler(req, res);
  console.log(`Status: ${res.statusCode} | name: ${res.body.plan?.name}`);
  return res.statusCode === 200 && res.body.plan?.id === planId;
}

async function testGetByIdNotFound(token) {
  console.log('\n--- Test 15: GET /api/catalog/:id inexistente ---');
  const fakeId = '00000000-0000-0000-0000-000000000000';
  const { req, res } = mockReqRes('GET', null, { id: fakeId }, { authorization: `Bearer ${token}` });
  await catalogItemHandler(req, res);
  console.log(`Status: ${res.statusCode}`);
  return res.statusCode === 404;
}

async function testGetByIdNoAuth(planId) {
  console.log('\n--- Test 16: GET /api/catalog/:id sin auth ---');
  const { req, res } = mockReqRes('GET', null, { id: planId });
  await catalogItemHandler(req, res);
  console.log(`Status: ${res.statusCode}`);
  return res.statusCode === 401;
}

async function testDeleteNoAuth(planId) {
  console.log('\n--- Test 17: DELETE sin auth ---');
  const { req, res } = mockReqRes('DELETE', null, { id: planId });
  await catalogItemHandler(req, res);
  console.log(`Status: ${res.statusCode}`);
  return res.statusCode === 401;
}

async function testDeleteSuccess(token, planId) {
  console.log('\n--- Test 18: DELETE soft delete ---');
  const { req, res } = mockReqRes('DELETE', null, { id: planId }, { authorization: `Bearer ${token}` });
  await catalogItemHandler(req, res);
  console.log(`Status: ${res.statusCode} | deleted: ${res.body.deleted} | is_active: ${res.body.plan?.is_active}`);
  return res.statusCode === 200 && res.body.deleted === true && res.body.plan?.is_active === false;
}

async function testDeletedNotInList(token, planId) {
  console.log('\n--- Test 19: Plan desactivado NO aparece en GET activos ---');
  const { req, res } = mockReqRes('GET', null, { search: TEST_TAG }, { authorization: `Bearer ${token}` });
  await catalogListHandler(req, res);
  const found = (res.body.plans || []).find(p => p.id === planId);
  console.log(`Status: ${res.statusCode} | aparece en activos: ${!!found}`);
  return res.statusCode === 200 && !found;
}

async function testDeletedInListWithFlag(token, planId) {
  console.log('\n--- Test 20: Plan desactivado SI aparece con include_inactive=true ---');
  const { req, res } = mockReqRes('GET', null, { search: TEST_TAG, include_inactive: 'true' }, { authorization: `Bearer ${token}` });
  await catalogListHandler(req, res);
  const found = (res.body.plans || []).find(p => p.id === planId);
  console.log(`Status: ${res.statusCode} | aparece con flag: ${!!found} | is_active: ${found?.is_active}`);
  return res.statusCode === 200 && !!found && found.is_active === false;
}

async function testDoubleDelete(token, planId) {
  console.log('\n--- Test 21: DELETE dos veces (idempotente) ---');
  const { req, res } = mockReqRes('DELETE', null, { id: planId }, { authorization: `Bearer ${token}` });
  await catalogItemHandler(req, res);
  console.log(`Status: ${res.statusCode} | deleted: ${res.body.deleted}`);
  return res.statusCode === 200 && res.body.deleted === false;
}

async function testDeleteNotFound(token) {
  console.log('\n--- Test 22: DELETE plan inexistente ---');
  const fakeId = '00000000-0000-0000-0000-000000000000';
  const { req, res } = mockReqRes('DELETE', null, { id: fakeId }, { authorization: `Bearer ${token}` });
  await catalogItemHandler(req, res);
  console.log(`Status: ${res.statusCode}`);
  return res.statusCode === 404;
}

async function testPatchWithoutId(token) {
  console.log('\n--- Test 23: PATCH sin id ---');
  const { req, res } = mockReqRes('PATCH', { price: 100 }, {}, { authorization: `Bearer ${token}` });
  await catalogItemHandler(req, res);
  console.log(`Status: ${res.statusCode}`);
  return res.statusCode === 400;
}

async function testCreateNoAuth() {
  console.log('\n--- Test 24: POST sin auth ---');
  const { req, res } = mockReqRes('POST', { name: 'no-auth' });
  await catalogListHandler(req, res);
  console.log(`Status: ${res.statusCode}`);
  return res.statusCode === 401;
}

async function cleanup() {
  console.log('\n--- Limpiando datos de test ---');
  const { data } = await supabaseAdmin
    .from('catalog_plans')
    .select('id')
    .ilike('name', `${TEST_TAG}%`);
  if (data && data.length > 0) {
    const ids = data.map(p => p.id);
    const { error } = await supabaseAdmin
      .from('catalog_plans')
      .delete()
      .in('id', ids);
    console.log(`  Eliminados ${data.length} planes de test (${error ? 'error: ' + error.message : 'OK'})`);
  } else {
    console.log('  Nada que limpiar');
  }
}

async function main() {
  console.log('=== Tests de Catalog CRUD ===');
  console.log(`Tag de test: ${TEST_TAG}`);
  let planId = null;

  try {
    const token = await login();
    console.log('Login OK');

    const tests = [
      { name: 'GET sin auth', fn: testNoAuth },
      { name: 'Method not allowed', fn: () => testMethodNotAllowedList(token) },
      { name: 'CORS preflight', fn: testCors },
      { name: 'Listar activos', fn: () => testListEmpty(token) },
      { name: 'POST sin auth', fn: testCreateNoAuth },
      { name: 'Crear plan valido', fn: async () => { planId = await testCreateSuccess(token); return !!planId; } },
      { name: 'POST sin name', fn: () => testCreateMissingName(token) },
      { name: 'POST price invalido', fn: () => testCreateInvalidPrice(token) },
      { name: 'POST URL invalida', fn: () => testCreateInvalidUrl(token) },
      { name: 'GET incluye creado', fn: () => testListIncludesCreated(token, planId) },
      { name: 'GET filter categoria', fn: () => testListFilterByCategory(token, planId) },
      { name: 'PATCH parcial', fn: () => testUpdatePartial(token, planId) },
      { name: 'PATCH sin campos', fn: () => testUpdateEmpty(token, planId) },
      { name: 'PATCH no encontrado', fn: () => testUpdateNotFound(token) },
      { name: 'GET by id', fn: () => testGetById(token, planId) },
      { name: 'GET by id 404', fn: () => testGetByIdNotFound(token) },
      { name: 'GET by id sin auth', fn: () => testGetByIdNoAuth(planId) },
      { name: 'DELETE sin auth', fn: () => testDeleteNoAuth(planId) },
      { name: 'DELETE soft', fn: () => testDeleteSuccess(token, planId) },
      { name: 'No aparece en activos', fn: () => testDeletedNotInList(token, planId) },
      { name: 'Aparece con flag', fn: () => testDeletedInListWithFlag(token, planId) },
      { name: 'DELETE idempotente', fn: () => testDoubleDelete(token, planId) },
      { name: 'DELETE 404', fn: () => testDeleteNotFound(token) },
      { name: 'PATCH sin id', fn: () => testPatchWithoutId(token) }
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

    await cleanup();

    console.log('\n=== Resumen ===');
    results.forEach(r => console.log(`${r.pass ? 'OK  ' : 'FAIL'} ${r.name}`));
    const passed = results.filter(r => r.pass).length;
    console.log(`\n${passed}/${results.length} tests pasaron`);

    if (passed < results.length) process.exit(1);
  } catch (e) {
    console.error('Error fatal:', e);
    await cleanup();
    process.exit(1);
  }
}

main();
