const { requireAuth } = require('../../../src/middleware/auth');
const { supabaseAdmin } = require('../../../src/lib/supabase');
const { sendAndStore } = require('../../../src/bot/sender');

const REACTIVATION_MESSAGE = '🤖 *El bot ha sido reactivado en esta conversacion.*\n\nA partir de este momento retomare el control. Escribe *menu* o *0* para ver las opciones disponibles.';

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

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'ID de conversacion requerido.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) {}
  }
  if (!body || typeof body !== 'object') body = {};

  if (typeof body.bot_active !== 'boolean') {
    return res.status(400).json({ error: 'El campo bot_active debe ser boolean.' });
  }

  try {
    const { data: conv, error: fetchErr } = await supabaseAdmin
      .from('conversations')
      .select('id, contact_id, phone, status, bot_active')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) {
      console.error('[toggle-bot] Error cargando conv:', fetchErr);
      return res.status(500).json({ error: 'Error al cargar la conversacion.' });
    }
    if (!conv) {
      return res.status(404).json({ error: 'Conversacion no encontrada.' });
    }

    const previousBotActive = conv.bot_active;
    const newBotActive = body.bot_active;

    if (previousBotActive === newBotActive) {
      return res.status(200).json({
        conversation: conv,
        changed: false,
        message: 'El valor de bot_active ya era el solicitado.',
        reactivation_sent: false
      });
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('conversations')
      .update({
        bot_active: newBotActive,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('id, contact_id, phone, status, bot_active, current_flow, current_step, updated_at')
      .single();

    if (updateErr) {
      console.error('[toggle-bot] Error actualizando:', updateErr);
      return res.status(500).json({ error: 'Error al actualizar bot_active.' });
    }

    let reactivationSent = false;
    let reactivationError = null;

    if (!previousBotActive && newBotActive) {
      console.log(`[toggle-bot] Reactivando bot para conv ${id} (${conv.phone})`);
      try {
        const result = await sendAndStore({
          phone: conv.phone,
          conversationId: id,
          content: REACTIVATION_MESSAGE,
          type: 'text',
          sentBy: 'bot',
          metadata: {
            event: 'bot_reactivated',
            triggered_by: auth.user.id,
            previous_bot_active: previousBotActive
          }
        });
        reactivationSent = result.ok;
        if (!result.ok) {
          reactivationError = result.error;
          console.warn(`[toggle-bot] Mensaje de reactivacion fallo: ${result.error}`);
        }
      } catch (e) {
        reactivationError = e.message;
        console.error('[toggle-bot] Excepcion enviando reactivacion:', e.message);
      }
    }

    return res.status(200).json({
      conversation: updated,
      changed: true,
      previous_bot_active: previousBotActive,
      new_bot_active: newBotActive,
      reactivation_sent: reactivationSent,
      reactivation_error: reactivationError
    });
  } catch (e) {
    console.error('[toggle-bot] Excepcion:', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
