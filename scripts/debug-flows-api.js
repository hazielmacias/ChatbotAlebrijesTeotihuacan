const http = require('https');
function req(method, path, body, token) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const options = { hostname: 'alebrijes-chatbot.vercel.app', port: 443, path, method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }};
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);
    if (token) options.headers['Authorization'] = 'Bearer ' + token;
    const r = http.request(options, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); }
        catch (e) { resolve({ raw: buf, error: e.message }); }
      });
    });
    r.on('error', e => resolve({ error: e.message }));
    if (data) r.write(data);
    r.end();
  });
}
(async () => {
  const login = await req('POST', '/api/auth/login', { email: 'areli@alebrijesteotihuacan.com', password: 'areli123' });
  console.log('Login OK:', !!login.token);
  const result = await req('GET', '/api/debug/flows', null, login.token);
  console.log('Flows debug:', JSON.stringify(result, null, 2));
})();
