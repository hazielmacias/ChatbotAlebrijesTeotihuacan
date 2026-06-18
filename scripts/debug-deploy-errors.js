// Investigar por que los deploys estan en ERROR
const https = require('https');

const TOKEN = process.env.VERCEL_TOKEN;
const PROJECT_ID = 'prj_PkmUQqlOFmGhEWZ71iJWuXmGUSH5';
const TEAM_ID = 'team_YVtaR2CxzSbFeT4DYg2tMySX';

if (!TOKEN) { console.error('VERCEL_TOKEN required'); process.exit(1); }

function apiCall(method, path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.vercel.com',
      port: 443,
      path,
      method,
      headers: { 'Authorization': 'Bearer ' + TOKEN }
    };
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
  console.log('=== Investigar deployments en ERROR ===\n');

  // Listar deployments
  const list = await apiCall('GET', `/v6/deployments?projectId=${PROJECT_ID}&teamId=${TEAM_ID}&limit=5`);
  if (list.status !== 200) {
    console.error('Error listando:', list.status, JSON.stringify(list.body).substring(0, 300));
    return;
  }

  for (const d of (list.body.deployments || []).slice(0, 5)) {
    console.log('---');
    console.log('ID:', d.uid);
    console.log('State:', d.state);
    console.log('Target:', d.target);
    console.log('Created:', new Date(d.createdAt).toISOString());
    console.log('Git:', d.gitMetadata?.commitMessage?.substring(0, 60));
    console.log('Git ref:', d.gitMetadata?.ref);

    // Obtener eventos del deployment
    const events = await apiCall('GET', `/v3/deployments/${d.uid}/events?teamId=${TEAM_ID}&limit=20`);
    if (events.status === 200 && events.body.events) {
      console.log('Eventos:');
      for (const e of events.body.events.slice(0, 10)) {
        if (e.text && (e.text.includes('Error') || e.text.includes('error') || e.text.includes('failed') || e.text.includes('Build') || e.text.includes('Command'))) {
          console.log('  [' + e.type + ']', e.text.substring(0, 200));
        }
      }
    }
  }
}

main().catch(console.error);
