const { requireAuth } = require('../../src/middleware/auth');
const { processIncomingMessage } = require('../../src/bot/engine');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const path = require('path');
  const fs = require('fs');
  const FLOWS_DIR = path.join(process.cwd(), 'src', 'bot', 'flows');
  let flowsDir = FLOWS_DIR;
  let flows = {};
  try {
    const files = fs.readdirSync(FLOWS_DIR);
    for (const f of files) {
      if (f.endsWith('.json')) {
        flows[f] = JSON.parse(fs.readFileSync(path.join(FLOWS_DIR, f), 'utf8'));
      }
    }
  } catch (e) {
    return res.status(500).json({ error: 'Cannot read flows dir: ' + e.message, cwd: process.cwd(), flowsDir });
  }

  return res.status(200).json({
    cwd: process.cwd(),
    flowsDir,
    menu: {
      steps: Object.keys(flows['menu.json']?.steps || {}),
      start_options: Object.keys(flows['menu.json']?.steps?.start?.options || {}),
      show_planes: !!flows['menu.json']?.steps?.show_planes,
      has_catalog_dynamic: flows['menu.json']?.steps?.show_planes?.dynamic === 'catalog_planes'
    }
  });
};
