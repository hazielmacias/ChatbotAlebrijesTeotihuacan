module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const path = require('path');
  const fs = require('fs');
  const FLOWS_DIR = path.join(process.cwd(), 'src', 'bot', 'flows');
  let info = { cwd: process.cwd(), flowsDir: FLOWS_DIR, error: null, menu: null };
  try {
    const files = fs.readdirSync(FLOWS_DIR);
    info.files = files;
    const menuPath = path.join(FLOWS_DIR, 'menu.json');
    const menuContent = JSON.parse(fs.readFileSync(menuPath, 'utf8'));
    info.menu = {
      steps: Object.keys(menuContent.steps || {}),
      start_options: Object.keys(menuContent.steps?.start?.options || {}),
      start_message_has_5: (menuContent.steps?.start?.message || '').includes('5️⃣'),
      show_planes_exists: !!menuContent.steps?.show_planes
    };
  } catch (e) {
    info.error = e.message;
  }
  return res.status(200).json(info);
};
