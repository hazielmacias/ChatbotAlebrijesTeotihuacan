// Get deployment details with v13 API
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
  console.log('=== v13 deployment', DEPLOY_ID, '===\n');
  const d = await apiCall('GET', `/v13/deployments/${DEPLOY_ID}?teamId=${TEAM_ID}`);
  console.log('Status:', d.status);
  if (d.status === 200) {
    console.log(JSON.stringify(d.body, null, 2).substring(0, 3000));
  } else {
    console.log(JSON.stringify(d.body).substring(0, 500));
  }
}

main().catch(console.error);
