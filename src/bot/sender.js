const metaApi = require('../lib/meta-api');
const { supabaseAdmin } = require('../lib/supabase');

const IMAGE_URLS = {
  pase: process.env.PASE_IMAGE_URL || 'https://alebrijes-chatbot.vercel.app/pase.jpeg',
  filtro: process.env.FILTRO_IMAGE_URL || 'https://alebrijes-chatbot.vercel.app/filtro.jpeg',
  pase_tdp: process.env.PASE_TDP_IMAGE_URL || 'https://alebrijes-chatbot.vercel.app/PaseDeEntrenamientoTDP-FuerzasBasicas.jpeg',
  pase_escuela: process.env.PASE_ESCUELA_IMAGE_URL || 'https://alebrijes-chatbot.vercel.app/InformaciónPaseDeUnaSemana_CentroDeFormacion.jpeg'
};

const DOCUMENT_URLS = {
  escuela_pdf: process.env.ESCUELA_PDF_URL || 'https://alebrijes-chatbot.vercel.app/AlebrijesTeotihuacanEscuela.pdf'
};

const DOCUMENT_FILENAMES = {
  escuela_pdf: 'AlebrijesTeotihuacanEscuela.pdf'
};

const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffFactor: 2
};

const META_ERROR_CODES = {
  100: { category: 'invalid_parameter', retry: false, userMessage: 'Parametro invalido en la solicitud.' },
  131030: { category: 'invalid_phone', retry: false, userMessage: 'Numero de telefono no valido.' },
  131031: { category: 'outside_24h_window', retry: false, userMessage: 'No se puede enviar mensaje fuera de la ventana de 24h sin usar una plantilla aprobada.' },
  131026: { category: 'undeliverable', retry: false, userMessage: 'Mensaje no entregable. El destinatario no tiene una cuenta valida de WhatsApp.' },
  131033: { category: 'blocked', retry: false, userMessage: 'El destinatario ha bloqueado el numero empresarial.' },
  130429: { category: 'rate_limit', retry: true, userMessage: 'Limite de velocidad alcanzado. Reintentando...' },
  80004: { category: 'rate_limit', retry: true, userMessage: 'Limite de velocidad de envio alcanzado.' },
  500: { category: 'meta_server_error', retry: true, userMessage: 'Error interno de Meta. Reintentando...' },
  502: { category: 'meta_server_error', retry: true, userMessage: 'Meta no disponible. Reintentando...' },
  503: { category: 'meta_server_error', retry: true, userMessage: 'Meta no disponible. Reintentando...' },
  504: { category: 'meta_server_error', retry: true, userMessage: 'Meta no disponible. Reintentando...' },
  429: { category: 'rate_limit', retry: true, userMessage: 'Demasiadas solicitudes. Reintentando...' }
};

const METRICS = {
  total: 0,
  success: 0,
  failed: 0,
  retried: 0,
  byCategory: {}
};

function classifyError(errorCode) {
  return META_ERROR_CODES[errorCode] || {
    category: 'unknown',
    retry: false,
    userMessage: 'Error desconocido al enviar mensaje.'
  };
}

function recordMetric(category, success) {
  METRICS.total++;
  if (success) METRICS.success++;
  else METRICS.failed++;
  if (!METRICS.byCategory[category]) {
    METRICS.byCategory[category] = { success: 0, failed: 0 };
  }
  if (success) METRICS.byCategory[category].success++;
  else METRICS.byCategory[category].failed++;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryWithBackoff(fn, context) {
  let lastResult;
  let attempt = 0;

  while (attempt <= RETRY_CONFIG.maxRetries) {
    const result = await fn();

    if (result.ok) {
      if (attempt > 0) {
        console.log(`[sender:${context}] Exito en intento ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}`);
      }
      return { ...result, attempts: attempt + 1 };
    }

    lastResult = result;
    const errorInfo = classifyError(result.code || 0);

    if (!errorInfo.retry) {
      console.log(`[sender:${context}] Error no recuperable: code=${result.code} (${errorInfo.category})`);
      return { ...result, attempts: attempt + 1 };
    }

    if (attempt >= RETRY_CONFIG.maxRetries) {
      console.warn(`[sender:${context}] Max reintentos alcanzados (${RETRY_CONFIG.maxRetries})`);
      return { ...result, attempts: attempt + 1 };
    }

    const delay = Math.min(
      RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffFactor, attempt),
      RETRY_CONFIG.maxDelayMs
    );
    console.log(`[sender:${context}] Reintento ${attempt + 1}/${RETRY_CONFIG.maxRetries} tras ${delay}ms (code=${result.code})`);
    METRICS.retried++;
    await sleep(delay);
    attempt++;
  }

  return { ...lastResult, attempts: attempt };
}

function resolveImageUrl(key) {
  return IMAGE_URLS[key] || key;
}

async function saveOutbound(conversationId, content, type, sentBy, metadata, waId) {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      wa_id: waId || null,
      direction: 'outbound',
      content,
      type: type || 'text',
      sent_by: sentBy || 'bot',
      metadata: metadata || {}
    })
    .select()
    .single();

  if (error) {
    console.error('[sender] Error guardando mensaje en BD:', error);
    return null;
  }
  return data;
}

async function persistFailedMessage(conversationId, content, type, sentBy, errorInfo, metadata) {
  try {
    await saveOutbound(
      conversationId,
      content,
      type,
      sentBy,
      {
        ...metadata,
        send_error: {
          category: errorInfo.category,
          code: errorInfo.code,
          message: errorInfo.userMessage,
          retriable: errorInfo.retry
        }
      },
      null
    );
  } catch (e) {
    console.error('[sender] No se pudo persistir mensaje fallido:', e.message);
  }
}

async function sendAndStore({
  phone,
  conversationId,
  content,
  type = 'text',
  sentBy = 'bot',
  metadata = {}
}) {
  if (!phone || !content || !conversationId) {
    return { ok: false, error: 'Missing required params (phone, content, conversationId)' };
  }

  const startTime = Date.now();

  const sendResult = await retryWithBackoff(async () => {
    if (type === 'image') {
      return await metaApi.sendImageMessage(phone, content, metadata.caption || '');
    } else if (type === 'text') {
      return await metaApi.sendMessage(phone, content);
    } else {
      console.warn(`[sender] Tipo ${type} no soportado, enviando como texto`);
      return await metaApi.sendMessage(phone, content);
    }
  }, `sendAndStore:${type}`);

  if (!sendResult.ok) {
    const errorInfo = classifyError(sendResult.code || 0);
    console.error(`[sender] Meta API fallo: code=${sendResult.code} (${errorInfo.category}) attempts=${sendResult.attempts} - ${sendResult.error}`);
    recordMetric(errorInfo.category, false);
    await persistFailedMessage(conversationId, content, type, sentBy, { ...errorInfo, code: sendResult.code }, metadata);
    return {
      ok: false,
      error: sendResult.error,
      errorCode: sendResult.code,
      errorCategory: errorInfo.category,
      retriable: errorInfo.retry,
      attempts: sendResult.attempts
    };
  }

  const waId = sendResult.data?.messages?.[0]?.id || null;
  const dbRow = await saveOutbound(conversationId, content, type, sentBy, metadata, waId);
  const elapsed = Date.now() - startTime;

  console.log(`[sender] OK: type=${type} wa_id=${waId} db_id=${dbRow?.id} elapsed=${elapsed}ms attempts=${sendResult.attempts}`);
  recordMetric('success', true);

  return {
    ok: true,
    messageId: waId,
    dbId: dbRow?.id,
    attempts: sendResult.attempts,
    elapsedMs: elapsed
  };
}

async function sendImageAndStore({
  phone,
  conversationId,
  imageKey,
  caption = '',
  sentBy = 'bot',
  metadata = {}
}) {
  const imageUrl = resolveImageUrl(imageKey);
  if (!phone || !conversationId || !imageUrl) {
    return { ok: false, error: 'Missing required params' };
  }

  const startTime = Date.now();
  const content = `[imagen: ${imageKey}] ${caption}`;
  const fullMetadata = { ...metadata, image_key: imageKey, image_url: imageUrl };

  const sendResult = await retryWithBackoff(async () => {
    return await metaApi.sendImageMessage(phone, imageUrl, caption);
  }, `sendImageAndStore:${imageKey}`);

  if (!sendResult.ok) {
    const errorInfo = classifyError(sendResult.code || 0);
    console.error(`[sender] Meta API fallo (image): code=${sendResult.code} (${errorInfo.category}) attempts=${sendResult.attempts} - ${sendResult.error}`);
    recordMetric(errorInfo.category, false);
    await persistFailedMessage(conversationId, content, 'image', sentBy, { ...errorInfo, code: sendResult.code }, fullMetadata);
    return {
      ok: false,
      error: sendResult.error,
      errorCode: sendResult.code,
      errorCategory: errorInfo.category,
      retriable: errorInfo.retry,
      attempts: sendResult.attempts
    };
  }

  const waId = sendResult.data?.messages?.[0]?.id || null;
  const dbRow = await saveOutbound(conversationId, content, 'image', sentBy, fullMetadata, waId);
  const elapsed = Date.now() - startTime;

  console.log(`[sender] Imagen OK: key=${imageKey} wa_id=${waId} db_id=${dbRow?.id} elapsed=${elapsed}ms attempts=${sendResult.attempts}`);
  recordMetric('success', true);

  return {
    ok: true,
    messageId: waId,
    dbId: dbRow?.id,
    attempts: sendResult.attempts,
    elapsedMs: elapsed
  };
}

async function sendOnly(phone, content) {
  try {
    return await metaApi.sendMessage(phone, content);
  } catch (err) {
    return { ok: false, error: err.message, code: err.code };
  }
}

function resolveDocumentUrl(documentKey) {
  return DOCUMENT_URLS[documentKey] || null;
}

async function sendDocumentAndStore({
  phone,
  conversationId,
  documentKey,
  caption = '',
  sentBy = 'bot',
  metadata = {}
}) {
  const documentUrl = resolveDocumentUrl(documentKey);
  if (!phone || !conversationId || !documentUrl) {
    return { ok: false, error: 'Missing required params (phone, conversationId, documentKey)' };
  }

  const startTime = Date.now();
  const filename = DOCUMENT_FILENAMES[documentKey] || 'document.pdf';
  const content = `[documento: ${documentKey}] ${caption}`;
  const fullMetadata = { ...metadata, document_key: documentKey, document_url: documentUrl, document_filename: filename };

  const sendResult = await retryWithBackoff(async () => {
    return await metaApi.sendDocumentMessage(phone, documentUrl, filename, caption);
  }, `sendDocumentAndStore:${documentKey}`);

  if (!sendResult.ok) {
    const errorInfo = classifyError(sendResult.code || 0);
    console.error(`[sender] Meta API fallo (document): code=${sendResult.code} (${errorInfo.category}) attempts=${sendResult.attempts} - ${sendResult.error}`);
    recordMetric(errorInfo.category, false);
    await persistFailedMessage(conversationId, content, 'document', sentBy, { ...errorInfo, code: sendResult.code }, fullMetadata);
    return {
      ok: false,
      error: sendResult.error,
      errorCode: sendResult.code,
      errorCategory: errorInfo.category,
      retriable: errorInfo.retry,
      attempts: sendResult.attempts
    };
  }

  const waId = sendResult.data?.messages?.[0]?.id || null;
  const dbRow = await saveOutbound(conversationId, content, 'document', sentBy, fullMetadata, waId);
  const elapsed = Date.now() - startTime;

  console.log(`[sender] Documento OK: key=${documentKey} wa_id=${waId} db_id=${dbRow?.id} elapsed=${elapsed}ms attempts=${sendResult.attempts}`);
  recordMetric('success', true);

  return {
    ok: true,
    messageId: waId,
    dbId: dbRow?.id,
    attempts: sendResult.attempts,
    elapsedMs: elapsed
  };
}

function getMetrics() {
  return { ...METRICS, byCategory: { ...METRICS.byCategory } };
}

function resetMetrics() {
  METRICS.total = 0;
  METRICS.success = 0;
  METRICS.failed = 0;
  METRICS.retried = 0;
  METRICS.byCategory = {};
}

module.exports = {
  sendAndStore,
  sendImageAndStore,
  sendDocumentAndStore,
  sendOnly,
  resolveImageUrl,
  resolveDocumentUrl,
  getMetrics,
  resetMetrics,
  classifyError,
  META_ERROR_CODES
};
