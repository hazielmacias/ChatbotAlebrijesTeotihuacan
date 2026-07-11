const https = require('https');
const { supabaseAdmin } = require('./supabase');
const knowledge = require('./knowledge');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_HOST = 'api.groq.com';
const MODEL = 'llama-3.1-8b-instant';
const HISTORY_LIMIT = 12;
const TIMEOUT_MS = 5000;
const MAX_TOKENS = 350;

const SYSTEM_PROMPT = `Eres el asistente virtual de Alebrijes Teotihuacan, una academia de futbol profesional en Mexico ubicada en el Centro Recreativo Pascual Boing, Teotihuacan, Estado de Mexico. Tu rol unico es responder preguntas en espanol sobre la academia.

INFORMACION AUTORIZADA DE LA ACADEMIA (fuente unica de verdad):
${JSON.stringify(knowledge, null, 2)}

MENU PRINCIPAL QUE VE EL USUARIO EN PANTALLA:
1. Escuela de Futbol - Centro de Iniciacion Deportiva
2. Fuerzas Basicas - TDP
3. Equipo Piloto - Liga de Expansion MX (2002-2004)
4. Curso de Verano
5. Preguntas Frecuentes

REGLAS ESTRICTAS (no las rompas bajo ninguna circunstancia):
1. SOLO respondes con informacion de la academia listada arriba. NO inventes precios, fechas, horarios ni datos que no esten en la base de conocimiento.
2. NO puedes inscribir a nadie ni guardar datos. Para inscribirse, el usuario debe responder con el numero del menu (1, 2, 3 o 4). Tu solo sugieres y orientas.
3. Si no sabes la respuesta o la pregunta no es de la academia, sugiere responder 5 en el menu para hablar con una persona (Prof. Haziel Alejandro al 55 2529 5501).
4. Tono: profesional al dar informacion, cercano y motivacional en los llamados a la accion. Usa emojis deportivos (⚽, 💪, 🔥) con moderacion, maximo 2-3 por mensaje.
5. Respuestas BREVES: maximo 4-5 lineas o 1-2 bloques cortos con emojis. Evita parrafos largos.
6. Si el usuario pregunta algo fuera de la academia (clima, politica, chistes, etc.), responde amablemente que solo puedes ayudar con temas de Alebrijes Teotihuacan.
7. USA la memoria de la conversacion: si el usuario ya pregunto algo antes en este chat, no repitas la misma info, profundiza o sugiere el siguiente paso natural.
8. FORMATO WHATSAPP: usa *negrita* con asteriscos, _cursiva_ con guion bajo, NO uses markdown estandar (#, -, etc.). Cada opcion del menu la presentas como: 1️⃣ *Nombre* — descripcion corta.
9. Cuando el usuario quiera inscribirse, NO le pidas sus datos tu. Solo dile que responda con el numero del menu correspondiente.`;

async function getConversationHistory(conversationId) {
  if (!conversationId) return [];

  try {
    const { data, error } = await supabaseAdmin
      .from('messages')
      .select('content, direction, type')
      .eq('conversation_id', conversationId)
      .eq('type', 'text')
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT);

    if (error) {
      console.warn('[ai] Error fetching history:', error.message);
      return [];
    }

    return (data || [])
      .filter(m => m.content && m.content.trim().length > 0 && m.content !== '(sin contenido)')
      .reverse()
      .map(m => ({
        role: m.direction === 'inbound' ? 'user' : 'assistant',
        content: m.content
      }));
  } catch (e) {
    console.warn('[ai] History fetch exception:', e.message);
    return [];
  }
}

function callGroq(messages) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: MAX_TOKENS,
      temperature: 0.3
    });

    const req = https.request({
      hostname: GROQ_HOST,
      port: 443,
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: TIMEOUT_MS
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.warn('[ai] Groq non-200:', res.statusCode, buf.substring(0, 200));
          return resolve(null);
        }
        try {
          const data = JSON.parse(buf);
          const reply = data.choices?.[0]?.message?.content?.trim();
          if (!reply) {
            console.warn('[ai] Groq empty reply, body:', JSON.stringify(data).substring(0, 300));
            return resolve(null);
          }
          resolve(reply);
        } catch (e) {
          console.warn('[ai] Groq parse error:', e.message);
          resolve(null);
        }
      });
    });

    req.on('error', (e) => {
      console.warn('[ai] Groq request error:', e.message);
      resolve(null);
    });
    req.on('timeout', () => {
      console.warn('[ai] Groq timeout');
      req.destroy();
      resolve(null);
    });

    req.write(body);
    req.end();
  });
}

async function callAI(conversationId, userMessage, context = {}) {
  if (!GROQ_API_KEY) return null;

  try {
    const history = await getConversationHistory(conversationId);

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history
    ];

    console.log(`[ai] Groq call: history=${history.length} context=${JSON.stringify(context)}`);

    const reply = await callGroq(messages);

    if (reply) {
      console.log(`[ai] Reply (${reply.length} chars): ${reply.substring(0, 100).replace(/\n/g, ' ')}`);
    }

    return reply;
  } catch (e) {
    console.warn('[ai] callAI exception:', e.message);
    return null;
  }
}

module.exports = { callAI, getConversationHistory, SYSTEM_PROMPT, isAIEnabled: () => !!GROQ_API_KEY };
