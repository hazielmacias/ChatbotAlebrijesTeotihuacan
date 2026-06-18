const http = require('https');

function req(method, path, body) {
  return new Promise((resolve) => {
    const data = body || null;
    const options = {
      hostname: 'alebrijes-chatbot.vercel.app',
      port: 443,
      path,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(options, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    r.on('error', e => resolve({ status: 0, body: e.message }));
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  const TOKEN = 'AlebrijesTeotihuacan2026';
  const CHALLENGE = 'test_challenge_12345';

  console.log('=== 5.3.3 Verificacion de Meta (GET webhook) ===\n');

  const r1 = await req('GET', '/api/webhook?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=' + CHALLENGE);
  console.log('1. Token incorrecto:  ' + r1.status + ' (esperado 403)');

  const r2 = await req('GET', '/api/webhook?hub.verify_token=' + TOKEN + '&hub.challenge=' + CHALLENGE);
  console.log('2. Sin mode:          ' + r2.status + ' (esperado 403)');

  const r3 = await req('GET', '/api/webhook?hub.mode=subscribe&hub.verify_token=' + TOKEN + '&hub.challenge=' + CHALLENGE);
  console.log('3. Token correcto:    ' + r3.status + ' body=' + JSON.stringify(r3.body) + ' (esperado 200 + challenge)');

  const r4 = await req('POST', '/api/webhook', '{}');
  console.log('4. POST sin firma:    ' + r4.status + ' (esperado 401)');

  console.log('\n=== Resumen ===');
  const ok1 = r1.status === 403;
  const ok2 = r2.status === 403;
  const ok3 = r3.status === 200 && r3.body === CHALLENGE;
  const ok4 = r4.status === 401;
  console.log('GET con token incorrecto  -> 403:', ok1 ? 'OK' : 'FAIL');
  console.log('GET sin mode              -> 403:', ok2 ? 'OK' : 'FAIL');
  console.log('GET con token correcto    -> 200:', ok3 ? 'OK' : 'FAIL');
  console.log('POST sin firma            -> 401:', ok4 ? 'OK' : 'FAIL');
  if (ok1 && ok2 && ok3 && ok4) {
    console.log('\nOK: Webhook listo para configurar en Meta Developer Console');
  } else {
    console.log('\nFAIL');
  }
})();
