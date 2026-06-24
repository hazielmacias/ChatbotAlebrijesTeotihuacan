require('dotenv').config();
const fs = require('fs');
const { Readable } = require('stream');

const code = fs.readFileSync('./api/webhook.js', 'utf8');
const start = code.indexOf('function readRawBody');
const end = code.indexOf('function verifySignature');
const slice = code.substring(start, end);
eval(slice);

async function test(name, req, expectedHex) {
  const body = await readRawBody(req);
  const hex = Buffer.from(body || '', 'utf8').toString('hex');
  const ok = hex.includes(expectedHex);
  console.log((ok ? '[OK]   ' : '[FAIL] ') + name);
  console.log('       body:', JSON.stringify(body));
  console.log('       body len:', (body || '').length);
  console.log('       hex :', hex);
  console.log('       expectedHex:', expectedHex);
  return ok;
}

function makeStreamFromString(s) {
  const { Readable } = require('stream');
  const buf = Buffer.from(s, 'utf8');
  const stream = new Readable();
  stream._read = () => {};
  setImmediate(() => {
    stream.push(buf);
    stream.push(null);
  });
  return stream;
}

(async () => {
  let pass = 0, fail = 0;
  const t1 = await test('Buffer.rawBody UTF-8 con tildes', { rawBody: Buffer.from('{"name":"Haziel Macías"}', 'utf8') }, '4d6163c3ad6173');
  t1 ? pass++ : fail++;

  const s2 = makeStreamFromString('{"name":"Niño Año"}');
  const t2 = await test('Stream con tildes (Niño=c3b1, Año=c3b1)', { rawBody: null, on: s2.on.bind(s2), body: null }, 'c3b1');
  t2 ? pass++ : fail++;

  const s3 = makeStreamFromString('{"name":"Macías 2009 Medio Centro"}');
  const t3 = await test('Stream con tildes y numeros', { rawBody: null, on: s3.on.bind(s3), body: null }, '4d6163c3ad6173');
  t3 ? pass++ : fail++;

  console.log('\n=== ' + pass + ' OK, ' + fail + ' FAIL ===');
  process.exit(fail > 0 ? 1 : 0);
})();
