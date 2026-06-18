const { requireAuth } = require('../../src/middleware/auth');
const { supabaseAdmin } = require('../../src/lib/supabase');
const { sendAndStore } = require('../../src/bot/sender');
const menuFlow = require('../../src/bot/flows/menu.json');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) {}
  }
  if (!body || typeof body !== 'object') body = {};

  const conversationId = body.conversation_id || body.id;
  const newBotActive = body.bot_active;

  if (!conversationId || typeof conversationId !== 'string') {
    return res.status(400).json({ error: 'conversation_id requerido.' });
  }
  if (typeof newBotActive !== 'boolean') {
    return res.status(400).json({ error: 'El campo bot_active debe ser boolean.' });
  }

  try {
    const { data: conv, error: fetchErr } = await supabaseAdmin
      .from('conversations')
      .select('id, contact_id, phone, status, bot_active')
      .eq('id', conversationId)
      .maybeSingle();

    if (fetchErr) {
      console.error('[toggle-bot] Error cargando conv:', fetchErr);
      return res.status(500).json({ error: 'Error al cargar la conversacion.' });
    }
    if (!conv) {
      return res.status(404).json({ error: 'Conversacion no encontrada.' });
    }

    const previousBotActive = conv.bot_active;

    if (previousBotActive === newBotActive) {
      return res.status(200).json({
        conversation: conv,
        changed: false,
        message: 'El valor de bot_active ya era el solicitado.'
      });
    }

    const isReactivation = newBotActive && !previousBotActive;

    const updateData = {
      bot_active: newBotActive,
      updated_at: new Date().toISOString()
    };

    if (isReactivation) {
      updateData.current_flow = 'menu';
      updateData.current_step = 'start';
      updateData.flow_data = {};
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('conversations')
      .update(updateData)
      .eq('id', conversationId)
      .select('id, contact_id, phone, status, bot_active, current_flow, current_step, updated_at')
      .single();

    if (updateErr) {
      console.error('[toggle-bot] Error actualizando:', updateErr);
      return res.status(500).json({ error: 'Error al actualizar bot_active.' });
    }

    let reactivationSent = false;

    if (isReactivation) {
      try {
        const menuMessage = menuFlow?.steps?.start?.message;
        if (menuMessage) {
          const sent = await sendAndStore({
            phone: conv.phone,
            conversationId: conversationId,
            content: menuMessage,
            type: 'text',
            sentBy: 'bot',
            metadata: { flow: 'menu', step: 'start', reactivation: true }
          });
          reactivationSent = sent.ok === true;
          if (!sent.ok) {
            console.error('[toggle-bot] Error enviando menu de reactivacion:', sent.error);
          } else {
            console.log(`[toggle-bot] Menu de reactivacion enviado a ${conv.phone}`);
          }
        } else {
          console.error('[toggle-bot] menuFlow.steps.start.message no encontrado');
        }
      } catch (e) {
        console.error('[toggle-bot] Excepcion enviando menu de reactivacion:', e.message);
      }
    }

    return res.status(200).json({
      conversation: updated,
      changed: true,
      previous_bot_active: previousBotActive,
      new_bot_active: newBotActive,
      reactivation_sent: reactivationSent
    });
  } catch (e) {
    console.error('[toggle-bot] Excepcion:', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
