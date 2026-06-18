const axios = require('axios');
const crypto = require('crypto');

const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const APP_SECRET = process.env.META_APP_SECRET;
const API_VERSION = 'v18.0';

const BASE_URL = `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}`;

const headers = {
  'Authorization': `Bearer ${ACCESS_TOKEN}`,
  'Content-Type': 'application/json'
};

async function sendMessage(phone, text) {
  try {
    const response = await axios.post(
      `${BASE_URL}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'text',
        text: { preview_url: false, body: text }
      },
      { headers, timeout: 10000 }
    );
    return { ok: true, data: response.data };
  } catch (error) {
    return handleError('sendMessage', error);
  }
}

async function sendInteractiveButtons(phone, bodyText, buttons, headerText) {
  if (!buttons || buttons.length === 0 || buttons.length > 3) {
    return { ok: false, error: 'Buttons must be 1-3 items' };
  }

  try {
    const interactive = {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.map((b, i) => ({
          type: 'reply',
          reply: { id: b.id || `btn_${i}`, title: b.title.substring(0, 20) }
        }))
      }
    };

    if (headerText) {
      interactive.header = { type: 'text', text: headerText };
    }

    const response = await axios.post(
      `${BASE_URL}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'interactive',
        interactive
      },
      { headers, timeout: 10000 }
    );
    return { ok: true, data: response.data };
  } catch (error) {
    return handleError('sendInteractiveButtons', error);
  }
}

async function sendInteractiveList(phone, bodyText, buttonLabel, sections, headerText, footerText) {
  if (!sections || sections.length === 0) {
    return { ok: false, error: 'List must have at least one section' };
  }

  try {
    const interactive = {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonLabel || 'Ver opciones',
        sections
      }
    };

    if (headerText) interactive.header = { type: 'text', text: headerText };
    if (footerText) interactive.footer = { text: footerText };

    const response = await axios.post(
      `${BASE_URL}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'interactive',
        interactive
      },
      { headers, timeout: 10000 }
    );
    return { ok: true, data: response.data };
  } catch (error) {
    return handleError('sendInteractiveList', error);
  }
}

async function sendImageMessage(phone, imageUrl, caption) {
  try {
    const image = { link: imageUrl };
    if (caption) image.caption = caption;

    const response = await axios.post(
      `${BASE_URL}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'image',
        image
      },
      { headers, timeout: 15000 }
    );
    return { ok: true, data: response.data };
  } catch (error) {
    return handleError('sendImageMessage', error);
  }
}

async function sendDocumentMessage(phone, documentUrl, filename, caption) {
  try {
    const document = { link: documentUrl };
    if (filename) document.filename = filename;
    if (caption) document.caption = caption;

    const response = await axios.post(
      `${BASE_URL}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'document',
        document
      },
      { headers, timeout: 30000 }
    );
    return { ok: true, data: response.data };
  } catch (error) {
    return handleError('sendDocumentMessage', error);
  }
}

function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!APP_SECRET) {
    return { valid: false, reason: 'APP_SECRET not configured' };
  }
  if (!signatureHeader) {
    return { valid: false, reason: 'No signature header' };
  }
  if (!signatureHeader.startsWith('sha256=')) {
    return { valid: false, reason: 'Invalid signature format' };
  }

  const expected = 'sha256=' + crypto
    .createHmac('sha256', APP_SECRET)
    .update(rawBody, 'utf8')
    .digest('hex');

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(signatureHeader);

  if (expectedBuf.length !== providedBuf.length) {
    return { valid: false, reason: 'Signature length mismatch' };
  }

  const isValid = crypto.timingSafeEqual(expectedBuf, providedBuf);
  return { valid: isValid };
}

function handleError(functionName, error) {
  if (error.response) {
    console.error(`[meta-api:${functionName}] API error:`, error.response.status, error.response.data);
    return {
      ok: false,
      error: error.response.data?.error?.message || 'Meta API error',
      code: error.response.data?.error?.code,
      details: error.response.data
    };
  }
  console.error(`[meta-api:${functionName}] Network error:`, error.message);
  return { ok: false, error: error.message };
}

function extractMessageFromWebhook(body) {
  try {
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) return null;

    return {
      from: message.from,
      messageId: message.id,
      timestamp: message.timestamp,
      type: message.type,
      text: message.text?.body || null,
      buttonId: message.interactive?.button_reply?.id || null,
      buttonTitle: message.interactive?.button_reply?.title || null,
      listId: message.interactive?.list_reply?.id || null,
      listTitle: message.interactive?.list_reply?.title || null,
      contactName: value.contacts?.[0]?.profile?.name || null
    };
  } catch (e) {
    console.error('[meta-api] Error parsing webhook:', e);
    return null;
  }
}

module.exports = {
  sendMessage,
  sendInteractiveButtons,
  sendInteractiveList,
  sendImageMessage,
  sendDocumentMessage,
  verifyWebhookSignature,
  extractMessageFromWebhook
};
