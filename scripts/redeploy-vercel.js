#!/usr/bin/env node
// Trigger Vercel redeploy via API (no necesita GitHub integration)
// Uso: VERCEL_TOKEN=xxx node scripts/redeploy-vercel.js

const https = require('https');

const TOKEN = process.env.VERCEL_TOKEN;
const PROJECT_ID = 'prj_PkmUQqlOFmGhEWZ71iJWuXmGUSH5';
const TEAM_ID = 'team_YVtaR2CxzSbFeT4DYg2tMySX';
const PROJECT_NAME = 'alebrijes-chatbot';

if (!TOKEN) {
  console.error('ERROR: VERCEL_TOKEN no esta definida.');
  console.error('Para obtenerla:');
  console.error('  1. Vercel Dashboard > Settings > Tokens > Create Token');
  console.error('  2. Scope: Full Account (o solo el proyecto)');
  console.error('  3. Ejecuta: $env:VERCEL_TOKEN="xxx"; node scripts/redeploy-vercel.js');
  process.exit(1);
}

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.vercel.com',
      port: 443,
      path,
      method,
      headers: {
        'Authorization': 'Bearer ' + TOKEN,
        'Content-Type': 'application/json'
      }
    };
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);
    const r = https.request(options, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch (e) { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function main() {
  console.log('=== Trigger redeploy via Vercel API ===\n');

  console.log('1. Listando deployments recientes...');
  const list = await apiCall('GET', `/v6/deployments?projectId=${PROJECT_ID}&teamId=${TEAM_ID}&limit=3`);
  if (list.status !== 200) {
    console.error('ERROR listando:', list.status, JSON.stringify(list.body).substring(0, 300));
    process.exit(1);
  }
  const deploys = list.body.deployments || [];
  console.log('   Deployments recientes:');
  for (const d of deploys.slice(0, 3)) {
    console.log('   -', d.uid, '|', d.state, '|', d.createdAt, '| target:', d.target);
  }

  const latest = deploys[0];
  if (!latest) {
    console.error('No hay deployments previos');
    process.exit(1);
  }

  if (latest.state === 'BUILDING' || latest.state === 'INITIALIZING' || latest.state === 'QUEUED') {
    console.log('\nYa hay un deploy en curso. Espera a que termine.');
    return;
  }

  console.log('\n2. Creando redeploy del deployment', latest.uid, '...');
  const redeploy = await apiCall('POST', `/v13/deployments?teamId=${TEAM_ID}`, {
    deploymentId: latest.uid,
    name: PROJECT_NAME,
    target: latest.target || 'production'
  });

  console.log('   Status:', redeploy.status);
  if (redeploy.status === 200 || redeploy.status === 201) {
    console.log('   Redeploy creado:', redeploy.body.id);
    console.log('   URL:', redeploy.body.url);
    console.log('   Inspector:', redeploy.body.inspectorUrl);
    console.log('\nEspera 1-2 minutos a que termine el build.');
    console.log('Verifica en: https://vercel.com/hazielmacias-projects/alebrijes-chatbot/deployments');
  } else {
    console.error('   Error:', JSON.stringify(redeploy.body).substring(0, 500));
  }
}

main().catch(e => { console.error('Excepcion:', e); process.exit(1); });
