const https = require('https');
const { supabaseAdmin } = require('./supabase');
const knowledge = require('./knowledge');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_HOST = 'api.groq.com';
const MODEL = 'llama-3.1-8b-instant';
const HISTORY_LIMIT = 12;
const TIMEOUT_MS = 5000;
const MAX_TOKENS = 280;

const SYSTEM_PROMPT = `Eres el asistente virtual de Alebrijes Teotihuacan, academia de futbol profesional en Teotihuacan, Mexico. Responde en espanol, breve y directo. NO saludes, responde la pregunta del usuario.

=== INFORMACION DE LA ACADEMIA ===

Academia: Alebrijes Teotihuacan
Sede: Centro Recreativo Pascual Boing, Teotihuacan, Estado de Mexico
Ubicacion: https://maps.app.goo.gl/nXnXtADvzofWVusk9
Contacto: Prof. Haziel Alejandro, tel 55 2529 5501

=== ESCUELA DE FUTBOL (Centro de Iniciacion Deportiva) ===
Publico: ninos de 6 a 11 anos
Inscripcion: $0 MXN (gratis)
Mensualidad: $550 MXN
Horarios: solo turno matutino L-V 08:00-10:30 hrs

=== FUERZAS BASICAS / TDP (Tercera Division Profesional) ===
Publico: jovenes de 12 a 18 anos (nacidos 2002-2012)
Proceso: semana de pruebas sin costo (1 semana)
Incluye: seguro contra accidentes (opcional), hidratacion, fisios en cancha, canchas empastadas, partidos vs equipos TDP/Fuerzas Basicas, evaluacion por visores

=== EQUIPO PILOTO (Liga de Expansion MX) ===
Publico: jovenes nacidos entre 2002 y 2004
Proceso: semana de pruebas sin costo (mismo que TDP pero para Liga de Expansion)

=== CURSO DE VERANO ===
Publico: abierto a todas las edades
Inscripcion: $850 MXN (pago unico, sin mensualidades)
Horario: L-V 08:30-10:30 hrs, Sabados de juego
Incluye: seguro, hidratacion, uniforme, fisio, canchas empastadas, partidos amistosos, entrenadores certificados

=== FAQ ===
- Requisitos pase: imagen del pase, ropa blanca, zapatos de futbol, hidratacion propia
- Requisitos formales: acta de nacimiento, CURP jugador y tutor, comprobante domicilio, certificado medico
- Que traer: ropa comoda (blanca), zapatos futbol, hidratacion. Club da balones, petos, staff

=== MENU PRINCIPAL ===
1. Escuela de Futbol - Centro de Iniciacion Deportiva
2. Fuerzas Basicas - TDP
3. Equipo Piloto - Liga de Expansion MX (2002-2004)
4. Curso de Verano
5. Preguntas Frecuentes

=== REGLAS ===
- Responde SOLO con la info de arriba. NO inventes precios, fechas, ni horarios.
- Para inscribirse el usuario responde con el numero del menu (1, 2, 3 o 4). Tu no inscribes.
- Si no sabes la respuesta: sugiere responder 5 en el menu para hablar con el Prof. Haziel al 55 2529 5501.
- Si preguntan algo fuera de la academia: responde amablemente que solo ayudas con temas de Alebrijes.
- Tono: profesional al dar info, cercano/motivacional en CTAs. Emojis ⚽💪🔥 max 2 por mensaje.
- USA la memoria de la conversacion: si el usuario ya pregunto algo antes, no repitas la misma info.
- FORMATO WHATSAPP: *negrita* con UN asterisco (NUNCA **doble**), _cursiva_ con guion bajo, NUNCA uses #.`;

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
      ...history,
      { role: 'user', content: userMessage }
    ];

    console.log(`[ai] Groq call: history=${history.length} user="${userMessage.substring(0, 60)}" context=${JSON.stringify(context)}`);

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
