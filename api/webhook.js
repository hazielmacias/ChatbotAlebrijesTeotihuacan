const crypto = require('crypto');

// En Vercel, las env vars se cargan automaticamente, pero
// NODEJS_HELPERS=0 puede interferir. Cargamos dotenv como fallback
// (no-op si las vars ya estan definidas).
if (process.env.NODE_ENV !== 'production' || !process.env.META_APP_SECRET) {
  try {
    require('dotenv').config();
  } catch (e) {}
}

const metaApi = require('../src/lib/meta-api');
const { processIncomingMessage } = require('../src/bot/engine');

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
const APP_SECRET = process.env.META_APP_SECRET;

console.log('[webhook:BOOT] v=2026-06-17-fix-1 APP_SECRET present:', !!APP_SECRET, '| length:', APP_SECRET?.length, '| first8:', APP_SECRET?.substring(0, 8));
console.log('[webhook:BOOT] VERIFY_TOKEN present:', !!VERIFY_TOKEN, '| length:', VERIFY_TOKEN?.length);

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    if (req.rawBody) {
      if (Buffer.isBuffer(req.rawBody)) return resolve(req.rawBody.toString('utf8'));
      return resolve(req.rawBody);
    }
    if (typeof req.body === 'string') return resolve(req.body);
    if (req.body && Object.keys(req.body).length > 0) {
      return resolve(JSON.stringify(req.body));
    }
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function verifySignature(rawBody, signatureHeader) {
  if (!APP_SECRET) return { valid: false, reason: 'APP_SECRET not configured' };
  if (!signatureHeader) return { valid: false, reason: 'No signature header' };
  if (!signatureHeader.startsWith('sha256=')) return { valid: false, reason: 'Invalid signature format' };

  const expected = 'sha256=' + crypto
    .createHmac('sha256', APP_SECRET)
    .update(rawBody, 'utf8')
    .digest('hex');

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(signatureHeader);

  console.log('[verify] body length:', rawBody.length, 'expected:', expected, 'provided:', signatureHeader);

  if (expectedBuf.length !== providedBuf.length) {
    return { valid: false, reason: 'Signature length mismatch' };
  }

  const isValid = crypto.timingSafeEqual(expectedBuf, providedBuf);
  return { valid: isValid };
}

module.exports = async function handler(req, res) {
  // ==========================================
  // GET: Verificacion del webhook por Meta
  // ==========================================
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log(`[webhook:GET] mode=${mode} token_match=${token === VERIFY_TOKEN}`);

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[webhook:GET] Verificacion OK');
      return res.status(200).send(challenge);
    }

    console.warn('[webhook:GET] Verificacion rechazada');
    return res.status(403).send('Forbidden');
  }

  // ==========================================
  // POST: Recepcion de mensajes
  // ==========================================
  if (req.method === 'POST') {
    let rawBody;
    try {
      rawBody = await readRawBody(req);
    } catch (e) {
      console.error('[webhook:POST] Error leyendo body:', e.message);
      return res.status(400).json({ error: 'Cannot read body' });
    }

    const signature = req.headers['x-hub-signature-256'];

    // Validar firma HMAC
    const sigCheck = verifySignature(rawBody, signature);
    if (!sigCheck.valid) {
      console.warn('[webhook:POST] Firma invalida:', sigCheck.reason, '| body length:', rawBody.length);
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Parsear JSON
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch (e) {
      console.error('[webhook:POST] JSON invalido:', e.message);
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    // Verificar que sea un evento de WhatsApp Business
    if (payload?.object !== 'whatsapp_business_account') {
      console.log('[webhook:POST] Evento ignorado (no es whatsapp)');
      return res.status(200).json({ status: 'ignored' });
    }

    // Extraer mensaje
    const messageData = metaApi.extractMessageFromWebhook(payload);

    if (!messageData) {
      console.log('[webhook:POST] Sin mensajes en payload (puede ser status update)');
      return res.status(200).json({ status: 'no_messages' });
    }

    // Procesar solo tipos relevantes
    const allowedTypes = ['text', 'interactive'];
    if (!allowedTypes.includes(messageData.type)) {
      console.log(`[webhook:POST] Tipo ignorado: ${messageData.type}`);
      return res.status(200).json({ status: 'skipped', type: messageData.type });
    }

    console.log(`[webhook:POST] Procesando mensaje de ${messageData.from} tipo=${messageData.type}`);

    // Procesar mensaje (la respuesta automatica viene en fase 2.3)
    try {
      const result = await processIncomingMessage(messageData);
      return res.status(200).json({ status: 'ok', ...result });
    } catch (error) {
      console.error('[webhook:POST] Error procesando mensaje:', error);
      return res.status(200).json({ status: 'error', message: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

// Last touched: 2026-06-17T18:45:38.5090755-06:00

