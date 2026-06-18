// Ver eventos raw de un deployment
const https = require('https');

const TOKEN = process.env.VERCEL_TOKEN;
const DEPLOY_ID = process.argv[2] || 'dpl_3Cqw87fm2n5Frq6njtN28rP67Nna';
const TEAM_ID = 'team_YVtaR2CxzSbFeT4DYg2tMySX';

if (!TOKEN) { console.error('VERCEL_TOKEN required'); process.exit(1); }

function apiCall(method, path) {
  return new Promise((resolve, reject) => {
    const options = { hostname: 'api.vercel.com', port: 443, path, method, headers: { 'Authorization': 'Bearer ' + TOKEN } };
    const r = https.request(options, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch (e) { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    r.on('error', reject);
    r.end();
  });
}

async function main() {
  console.log('=== Events del deployment', DEPLOY_ID, '===\n');

  const ev = await apiCall('GET', `/v2/deployments/${DEPLOY_ID}/events?teamId=${TEAM_ID}&limit=50`);
  console.log('Status:', ev.status);
  if (ev.status === 200) {
    const events = ev.body || [];
    console.log('Total events:', events.length);
    for (const e of events) {
      console.log('  [' + e.type + ']', JSON.stringify(e).substring(0, 400));
    }
  } else {
    console.log('Body:', JSON.stringify(ev.body).substring(0, 500));
  }
}

main().catch(console.error);
