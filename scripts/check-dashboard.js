// Verificar el dashboard en produccion
const https = require('https');

function get(path) {
  return new Promise((resolve) => {
    https.get('https://alebrijes-chatbot.vercel.app' + path, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => resolve({ status: res.statusCode, body: buf, length: buf.length }));
    }).on('error', e => resolve({ error: e.message }));
  });
}

(async () => {
  console.log('=== 1. Dashboard HTML ===');
  const dash = await get('/dashboard.html');
  const checks = {
    'CDN supabase-js': dash.body.includes('supabase-js'),
    'config.js': dash.body.includes('config.js'),
    'api.js': dash.body.includes('api.js'),
    'auth.js': dash.body.includes('auth.js'),
    'supabase-client.js': dash.body.includes('supabase-client.js'),
    'router.js': dash.body.includes('router.js'),
    'views/conversations.js': dash.body.includes('views/conversations.js')
  };
  for (const [k, v] of Object.entries(checks)) {
    console.log(' ', v ? 'OK  ' : 'FAIL', k);
  }

  console.log('\n=== 2. supabase-client.js (tamano y exports) ===');
  const sc = await get('/js/supabase-client.js');
  console.log('  Length:', sc.length, 'bytes');
  console.log('  window.supabase.createClient:', sc.body.includes('window.supabase.createClient'));
  console.log('  createClient function:', sc.body.includes('function createClient'));
  console.log('  getClient public:', sc.body.includes('getClient'));

  console.log('\n=== 3. config.js (anon key) ===');
  const cfg = await get('/js/config.js');
  console.log(cfg.body.substring(0, 300));

  console.log('\n=== 4. CDN de Supabase (debe ser alcanzable) ===');
  const cdn = await get('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.7/dist/umd/supabase.min.js');
  console.log('  Status:', cdn.status, '| Length:', cdn.length, 'bytes');
  console.log('  Contiene createClient:', cdn.body.includes('createClient'));
})();
