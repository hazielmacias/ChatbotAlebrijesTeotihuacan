const { supabaseAdmin } = require('../lib/supabase');
const { sendAndStore, sendImageAndStore, sendDocumentAndStore } = require('./sender');

const menuFlow = require('./flows/menu.json');
const escuelaFlow = require('./flows/escuela.json');
const tdpFlow = require('./flows/tdp.json');
const pilotoFlow = require('./flows/piloto.json');
const cierreFlow = require('./flows/cierre.json');
const faqFlow = require('./flows/faq.json');

const FLOWS = {
  menu: menuFlow,
  escuela: escuelaFlow,
  tdp: tdpFlow,
  piloto: pilotoFlow,
  cierre: cierreFlow,
  faq: faqFlow
};

const RESET_TRIGGERS = ['0', 'menu', 'menú', 'inicio', 'empezar', 'cancelar', 'salir', 'cancel'];

const CONTACT_INFO = {
  escuela: '👉 *Prof. Haziel Alejandro:* 55 2529 5501\n📌 *WhatsApp Business*',
  tdp: '👉 *Prof. Haziel Alejandro:* 55 2529 5501\n📌 *WhatsApp Business*',
  piloto: '👉 *Prof. Haziel Alejandro:* 55 2529 5501\n📌 *WhatsApp Business*'
};

const TDP_WARNING_TEXT = '*⚠️ ANTES DE CONTINUAR*\n\n' +
  'Solicita una semana de pruebas para entrenar y jugar durante este periodo con el equipo de tercera división profesional. Solamente cubres tu seguro contra accidentes y lesiones deportivas. Sin este no podras tener actividad deportiva.';

const POST_REGISTRATION_MESSAGES = {
  escuela: '🚨 *REQUISITOS OBLIGATORIOS PARA TU PRIMER DÍA:*\nPara que te hagamos válido este pase, el día de tu entrenamiento debes presentarte puntualmente en el Centro Recreativo Pascual Boing con:\n\n1️⃣ Esta imagen de tu pase de prueba (en tu celular o impresa).\n2️⃣ Ropa completamente blanca.\n3️⃣ Zapatos de fútbol (tacos).\n4️⃣ Tu propia hidratación.\n\n📲 *SIGUIENTE PASO (MUY IMPORTANTE):*\nPara confirmar tu asistencia, resolver cualquier duda final y recibir las instrucciones exactas de acceso a la cancha, comunícate ahora mismo con nuestra coordinadora enviándole un mensaje de WhatsApp:\n\n👉 *Prof. Haziel Alejandro:* 55 2529 5501\n📌 *WhatsApp Business*\n\n¡Te esperamos en la cancha para demostrar tu talento! ⚽',
  tdp: '📲 *SIGUIENTE PASO (MUY IMPORTANTE):*\nPara confirmar tu asistencia, resolver cualquier duda final y recibir las instrucciones exactas de acceso a la cancha, comunícate ahora mismo con nuestra coordinadora enviándole un mensaje de WhatsApp:\n\n👉 *Prof. Haziel Alejandro:* 55 2529 5501\n📌 *WhatsApp Business*\n\n¡Te esperamos en la cancha para demostrar tu talento! ⚽',
  piloto: '📲 *SIGUIENTE PASO (MUY IMPORTANTE):*\nPara confirmar tu asistencia, resolver cualquier duda final y recibir las instrucciones exactas de acceso a la cancha, comunícate ahora mismo con nuestra coordinadora enviándole un mensaje de WhatsApp:\n\n👉 *Prof. Haziel Alejandro:* 55 2529 5501\n📌 *WhatsApp Business*\n\n¡Te esperamos en la cancha para demostrar tu talento! ⚽'
};

async function getOrCreateContact(phone, name) {
  const { data, error } = await supabaseAdmin
    .from('contacts')
    .upsert(
      { phone, ...(name && { name }) },
      { onConflict: 'phone' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getOrCreateConversation(contactId, phone) {
  const { data: existing } = await supabaseAdmin
    .from('conversations')
    .select('*')
    .eq('contact_id', contactId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabaseAdmin
    .from('conversations')
    .insert({
      contact_id: contactId,
      phone,
      status: 'active',
      bot_active: true
    })
    .select()
    .single();

  if (error) throw error;
  return created;
}

async function saveMessage(conversationId, direction, content, type, sentBy, metadata, waId) {
  const { data, error } = await supabaseAdmin
    .from('messages')
    .insert({
      conversation_id: conversationId,
      wa_id: waId || null,
      direction,
      content,
      type: type || 'text',
      sent_by: sentBy || (direction === 'inbound' ? 'contact' : 'bot'),
      metadata: metadata || {}
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateConversationState(conversationId, updates) {
  const { error } = await supabaseAdmin
    .from('conversations')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  if (error) throw error;
}

function compileMessage(template, variables) {
  if (typeof template !== 'string') return template;
  if (!variables) return template;

  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });
}

async function applySideEffects(effects, conversationId, conversation) {
  if (!effects) return conversation;

  const updates = {};

  if (effects.set_bot_active !== undefined) {
    updates.bot_active = effects.set_bot_active;
  }

  if (Object.keys(updates).length > 0) {
    await updateConversationState(conversationId, updates);
    return { ...conversation, ...updates };
  }

  return conversation;
}

async function resolveDynamicContent(flowKey, stepKey, flowData) {
  const step = FLOWS[flowKey]?.steps[stepKey];
  if (!step || !step.dynamic) return null;

  if (step.dynamic === 'contact_info') {
    const category = flowData?.category || 'escuela';
    return { contact_info: CONTACT_INFO[category] || CONTACT_INFO.escuela };
  }

  if (step.dynamic === 'post_registration') {
    const category = flowData?.category || 'escuela';
    const message = POST_REGISTRATION_MESSAGES[category] || POST_REGISTRATION_MESSAGES.escuela;
    return { message };
  }

  if (step.dynamic === 'tdp_warning') {
    const category = flowData?.category;
    const warning = category === 'tdp' ? TDP_WARNING_TEXT : '';
    return { warning };
  }

  return null;
}

function buildHelpMessage(currentFlow, currentStep) {
  return `🤔 No entendi tu respuesta.\n\nPor favor responde con una de las opciones validas.\n\n_Escribe *menu* o *0* para volver al inicio._`;
}

function extractAgeFromText(text) {
  const m = text.match(/(\d{1,2})\s*(anos|año|a)/i);
  if (m) return parseInt(m[1], 10);

  const numbers = text.match(/\b(\d{1,2})\b/g);
  if (numbers) {
    for (const n of numbers) {
      const v = parseInt(n, 10);
      if (v >= 1 && v <= 99) return v;
    }
  }
  return null;
}

function extractBirthYearFromText(text) {
  const m = text.match(/\b(19\d{2}|20\d{2})\b/);
  if (m) return parseInt(m[1], 10);
  return null;
}

function extractNameFromText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(/(?:nombre\s*(?:completo)?\s*[:\-]?\s*)(.+)/i);
    if (m) return m[1].trim().substring(0, 200);
  }
  return lines[0] || text;
}

function extractField(text, fieldLabels) {
  const labels = Array.isArray(fieldLabels) ? fieldLabels : [fieldLabels];
  const lines = text.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const label of labels) {
      const labelNorm = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (lower.includes(labelNorm)) {
        const value = line.split(/[:\-]/).slice(1).join(':').trim();
        if (value) return value;
      }
    }
  }
  return null;
}

function normalizePositionValue(value) {
  if (!value) return value;
  const norm = value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const map = {
    'portero': 'Portero', 'guardameta': 'Portero', 'arquero': 'Portero',
    'defensa': 'Defensa', 'defensor': 'Defensa',
    'mediocampista': 'Mediocampista', 'medio': 'Mediocampista', 'medio centro': 'Mediocampista', 'centrocampista': 'Mediocampista', 'volante': 'Mediocampista',
    'delantero': 'Delantero', 'atacante': 'Delantero', 'extremo': 'Delantero'
  };
  return map[norm] || value.trim();
}

function extractPosition(text) {
  const explicit = extractField(text, ['posicion principal', 'posicion', 'posici\u00f3n principal', 'posici\u00f3n']);
  if (explicit) return normalizePositionValue(explicit);

  if (!extractBirthYearFromText(text)) return null;

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const yearRe = /^(19|20)\d{2}$/;
  const nameLine = (extractNameFromText(text) || '').split('\n')[0].trim();
  for (const line of lines) {
    if (yearRe.test(line)) continue;
    if (line === nameLine) continue;
    const labelRe = /(?:nombre|posici[o\u00f3]n|edad|a[ñn]o|tutor|responsable|perfil|diestro|zurdo|diestra|zurda)\s*[:\-]/i;
    if (labelRe.test(line)) continue;
    if (/^\d{1,3}$/.test(line)) continue;
    return normalizePositionValue(line);
  }
  return null;
}

function extractTutor(text) {
  return extractField(text, ['tutor', 'responsable']);
}

function extractProfile(text) {
  const m = text.match(/\b(diestro|zurdo|diestra|zurda)\b/i);
  if (m) return m[1];
  return null;
}

function parseFreeTextData(text, category) {
  const data = { raw: text };
  data.name = extractNameFromText(text);
  data.position = extractPosition(text);

  if (category === 'escuela') {
    data.age = extractAgeFromText(text);
    data.tutor = extractTutor(text);
  } else {
    data.birth_year = extractBirthYearFromText(text);
    if (category === 'piloto') {
      data.profile = extractProfile(text);
    }
  }
  return data;
}

async function saveRegistration(conversationId, contactPhone, category, parsedData) {
  const row = {
    conversation_id: conversationId,
    contact_phone: contactPhone,
    category,
    player_name: parsedData.name || null,
    birth_year: parsedData.birth_year || null,
    age: parsedData.age || null,
    position: parsedData.position || null,
    profile: parsedData.profile || null,
    schedule: null,
    tutor_name: parsedData.tutor || null,
    raw_data: parsedData.raw || null
  };

  const { data, error } = await supabaseAdmin
    .from('registrations')
    .insert(row)
    .select()
    .single();

  if (error) {
    console.error('[engine] Error guardando registration:', error);
    return null;
  }
  console.log(`[engine] Registration guardada: id=${data.id} category=${category}`);
  return data;
}

function validateFreeText(parsed, validation) {
  if (!validation) return { valid: true, value: null };

  const { type, min, max } = validation;

  if (type === 'age_range') {
    const age = parsed.age;
    if (age === null) {
      return { valid: false, reason: 'no_age_found', value: null };
    }
    if (age < min || age > max) {
      return { valid: false, reason: 'out_of_range', value: age };
    }
    return { valid: true, value: age };
  }

  if (type === 'birth_year_range') {
    const year = parsed.birth_year;
    if (year === null) {
      return { valid: false, reason: 'no_year_found', value: null };
    }
    if (year < min || year > max) {
      return { valid: false, reason: 'out_of_range', value: year };
    }
    return { valid: true, value: year };
  }

  return { valid: true, value: null };
}

function resolveImageKeys(step, flowData) {
  if (!step) return [];
  if (Array.isArray(step.send_images)) return step.send_images.filter(Boolean);
  if (Array.isArray(step.send_image)) return step.send_image.filter(Boolean);
  if (step.send_image && typeof step.send_image === 'object') {
    const category = (flowData && flowData.category) || 'escuela';
    const value = step.send_image[category];
    if (value) return [value];
    const firstKey = Object.keys(step.send_image)[0];
    return firstKey ? [step.send_image[firstKey]] : [];
  }
  if (typeof step.send_image === 'string') return [step.send_image];
  return [];
}

async function executeStep(conversation, contact, flowKey, stepKey, flowData) {
  const flow = FLOWS[flowKey];
  if (!flow) {
    console.error(`[engine] Flujo no encontrado: ${flowKey}`);
    return { handled: false, reason: 'flow_not_found' };
  }

  const step = flow.steps[stepKey];
  if (!step) {
    console.error(`[engine] Paso no encontrado: ${flowKey}/${stepKey}`);
    return { handled: false, reason: 'step_not_found' };
  }

  let variables = null;
  let messageTemplate = step.message;

  if (step.dynamic) {
    const resolved = await resolveDynamicContent(flowKey, stepKey, flowData);
    if (typeof resolved === 'object' && resolved !== null) {
      variables = resolved;
    }
  }

  const finalMessage = compileMessage(messageTemplate, variables);

  const updatedConv = await applySideEffects(step.side_effects, conversation.id, conversation);

  await updateConversationState(conversation.id, {
    current_flow: flowKey,
    current_step: stepKey,
    flow_data: flowData,
    bot_active: updatedConv.bot_active !== undefined ? updatedConv.bot_active : conversation.bot_active
  });

  const sent = await sendAndStore({
    phone: contact.phone,
    conversationId: conversation.id,
    content: finalMessage,
    type: 'text',
    sentBy: 'bot',
    metadata: { flow: flowKey, step: stepKey }
  });

  const imageKeys = resolveImageKeys(step, flowData);
  for (const imageKey of imageKeys) {
    await sendImageAndStore({
      phone: contact.phone,
      conversationId: conversation.id,
      imageKey,
      caption: '',
      sentBy: 'bot',
      metadata: { flow: flowKey, step: stepKey, image_key: imageKey }
    });
  }

  if (step.send_document) {
    await sendDocumentAndStore({
      phone: contact.phone,
      conversationId: conversation.id,
      documentKey: step.send_document,
      caption: '',
      sentBy: 'bot',
      metadata: { flow: flowKey, step: stepKey, document_key: step.send_document }
    });
  }

  console.log(`[bot-engine] Respuesta enviada: flow=${flowKey} step=${stepKey} sent_ok=${sent.ok} image=${resolveImageKeys(step, flowData).join(',') || 'none'} document=${step.send_document || 'none'} auto_advance=${!!step.auto_advance}`);

  if (step.auto_advance && step.next_flow && step.next_step) {
    return await executeStep(
      { ...conversation, current_flow: flowKey, current_step: stepKey, flow_data: flowData },
      contact,
      step.next_flow,
      step.next_step,
      flowData
    );
  }

  return {
    handled: true,
    bot_active: updatedConv.bot_active !== undefined ? updatedConv.bot_active : conversation.bot_active,
    response_flow: flowKey,
    response_step: stepKey,
    sent_ok: sent.ok,
    conversation_id: conversation.id,
    message_id: sent.dbId
  };
}

async function processIncomingMessage(messageData) {
  const { from, messageId, text, buttonId, listId, contactName } = messageData;

  if (!from) {
    console.warn('[bot-engine] Mensaje sin telefono, ignorando');
    return { handled: false, reason: 'no_phone' };
  }

  const contact = await getOrCreateContact(from, contactName);
  const conversation = await getOrCreateConversation(contact.id, from);

  let userInput = (text || '').trim();
  if (buttonId) userInput = buttonId.trim();
  else if (listId) userInput = listId.trim();
  const userInputLower = userInput.toLowerCase();

  const messageType = text ? 'text' : (buttonId || listId ? 'interactive' : 'text');
  const inboundMessage = await saveMessage(
    conversation.id,
    'inbound',
    userInput || '(sin contenido)',
    messageType,
    'contact',
    {
      button_id: buttonId || null,
      button_title: messageData.buttonTitle || null,
      list_id: listId || null,
      list_title: messageData.listTitle || null
    },
    messageId
  );

  await updateConversationState(conversation.id, {});

  if (!conversation.bot_active) {
    console.log(`[bot-engine] Bot apagado para ${from}, no se responde`);
    return {
      handled: true,
      bot_active: false,
      conversation_id: conversation.id,
      message_id: inboundMessage.id
    };
  }

  if (RESET_TRIGGERS.includes(userInputLower)) {
    console.log(`[bot-engine] Reset a menu principal para ${from}`);
    await updateConversationState(conversation.id, {
      current_flow: 'menu',
      current_step: 'start',
      flow_data: {}
    });
    return await executeStep(conversation, contact, 'menu', 'start', {});
  }

  let currentFlowKey = conversation.current_flow;
  let currentStepKey = conversation.current_step;
  const flowData = conversation.flow_data || {};

  if (!currentFlowKey || !FLOWS[currentFlowKey]) {
    console.log(`[bot-engine] Usuario nuevo o sin flujo, mostrando menu principal`);
    await updateConversationState(conversation.id, {
      current_flow: 'menu',
      current_step: 'start',
      flow_data: {}
    });
    return await executeStep(conversation, contact, 'menu', 'start', {});
  }

  const flow = FLOWS[currentFlowKey];
  const step = flow.steps[currentStepKey];

  if (!step) {
    console.warn(`[bot-engine] Paso invalido: ${currentFlowKey}/${currentStepKey}, reiniciando`);
    currentFlowKey = 'menu';
    currentStepKey = 'start';
  }

  const currentStep = FLOWS[currentFlowKey].steps[currentStepKey];

  if (currentStep.input_type === 'free_text') {
    console.log(`[bot-engine] free_text en ${currentFlowKey}/${currentStepKey}: "${userInput}"`);

    const category = flowData.category || currentFlowKey;
    const parsed = parseFreeTextData(userInput, category);
    const validation = currentStep.validation;

    const validationResult = validateFreeText(parsed, validation);

    if (!validationResult.valid) {
      console.log(`[bot-engine] Validacion fallo: reason=${validationResult.reason} value=${validationResult.value}`);

      const keepOnSameStep = validationResult.reason === 'no_year_found' && validation?.type === 'birth_year_range';
      const noAgeFound = validationResult.reason === 'no_age_found' && validation?.type === 'age_range';

      let helpMessage;
      if (keepOnSameStep) {
        helpMessage = '🤔 No detecte un *año de nacimiento* valido en tu mensaje (debe tener 4 digitos, ej. 2009).\n\n' +
          'Para generar tu *Pase de Semana de Prueba sin costo*, mándame en un solo mensaje:\n\n' +
          '📋 *Nombre completo:*\n📋 *Año de nacimiento (4 dígitos):*\n📋 *Posición principal:*\n\n' +
          '_Ejemplo:_\nJuan Pérez García\n2009\nMediocampista';
      } else if (noAgeFound) {
        helpMessage = '🤔 No detecte la *edad* en tu mensaje.\n\n' +
          'Para generar tu *Pase de Semana de Prueba sin costo*, mándame en un solo mensaje:\n\n' +
          '📋 *Nombre completo del jugador:*\n📋 *Edad (6 a 11 años):*\n📋 *Posición en la que juega:*\n📋 *Nombre del tutor o responsable:*\n\n' +
          '_Ejemplo:_\nJuan Pérez García\n9\nMediocampista\nMaría Pérez';
      } else {
        helpMessage = validation?.fail_message || '⚠️ Los datos proporcionados no son validos.';
      }

      const failFlow = (keepOnSameStep || noAgeFound) ? currentFlowKey : (validation?.fail_flow || 'menu');
      const failStep = (keepOnSameStep || noAgeFound) ? currentStepKey : (validation?.fail_step || 'start');

      await updateConversationState(conversation.id, {
        current_flow: failFlow,
        current_step: failStep,
        flow_data: { ...flowData, last_validation_error: validationResult.reason }
      });

      const sent = await sendAndStore({
        phone: from,
        conversationId: conversation.id,
        content: helpMessage,
        type: 'text',
        sentBy: 'bot',
        metadata: {
          flow: currentFlowKey,
          step: currentStepKey,
          validation_failed: true,
          help_retry: keepOnSameStep || noAgeFound
        }
      });

      if (failFlow && failStep && !keepOnSameStep && !noAgeFound) {
        return await executeStep(conversation, contact, failFlow, failStep, { ...flowData, last_validation_error: validationResult.reason });
      }

      return {
        handled: true,
        bot_active: true,
        validation_failed: true,
        help_retry: keepOnSameStep || noAgeFound,
        sent_ok: sent.ok,
        conversation_id: conversation.id
      };
    }

    console.log(`[bot-engine] Validacion OK: ${JSON.stringify(parsed)}`);

    let sideEffectUpdates = flowData;
    if (currentStep.side_effects?.flow_data_update) {
      sideEffectUpdates = { ...flowData, ...currentStep.side_effects.flow_data_update };
    }

    if (currentStep.side_effects?.save_registration) {
      try {
        await saveRegistration(conversation.id, from, category, parsed);
        console.log(`[bot-engine] Registration OK cat=${category} conv=${conversation.id}`);
      } catch (regErr) {
        console.error('[bot-engine] Error guardando registration (no bloqueante):', regErr);
      }
    }

    const nextFlow = currentStep.next_flow;
    const nextStep = currentStep.next_step;
    const nextFlowData = { ...sideEffectUpdates, collected_data: parsed };

    try {
      await updateConversationState(conversation.id, {
        current_flow: nextFlow,
        current_step: nextStep,
        flow_data: nextFlowData
      });
    } catch (stateErr) {
      console.error('[bot-engine] Error actualizando estado (no bloqueante):', stateErr);
    }

    console.log(`[bot-engine] free_text completado: ${currentFlowKey}/${currentStepKey} -> ${nextFlow}/${nextStep}`);

    return await executeStep(conversation, contact, nextFlow, nextStep, nextFlowData);
  }

  const options = currentStep.options || {};
  const selectedOption = options[userInput] || options[userInputLower];

  if (!selectedOption) {
    console.log(`[bot-engine] Input no valido: "${userInput}" en ${currentFlowKey}/${currentStepKey}`, Object.keys(options));
    const helpMessage = buildHelpMessage(currentFlowKey, currentStepKey);
    const sent = await sendAndStore({
      phone: from,
      conversationId: conversation.id,
      content: helpMessage,
      type: 'text',
      sentBy: 'bot',
      metadata: { flow: currentFlowKey, step: currentStepKey, help: true }
    });
    return {
      handled: true,
      bot_active: true,
      response: 'help',
      sent_ok: sent.ok,
      conversation_id: conversation.id
    };
  }

  if (selectedOption) {
    let nextFlowData = flowData;
    if (selectedOption.flow_data_update) {
      nextFlowData = { ...flowData, ...selectedOption.flow_data_update };
    }

    if (selectedOption.next_flow && selectedOption.next_step) {
      await updateConversationState(conversation.id, {
        current_flow: selectedOption.next_flow,
        current_step: selectedOption.next_step,
        flow_data: nextFlowData
      });
      return await executeStep(conversation, contact, selectedOption.next_flow, selectedOption.next_step, nextFlowData);
    }
  }

  console.log(`[bot-engine] Input no valido: "${userInput}" en ${currentFlowKey}/${currentStepKey}`);
  const helpMessage = buildHelpMessage(currentFlowKey, currentStepKey);
  const sent = await sendAndStore({
    phone: from,
    conversationId: conversation.id,
    content: helpMessage,
    type: 'text',
    sentBy: 'bot',
    metadata: { flow: currentFlowKey, step: currentStepKey, help: true }
  });

  return {
    handled: true,
    bot_active: true,
    response: 'help',
    sent_ok: sent.ok,
    conversation_id: conversation.id
  };
}

module.exports = { processIncomingMessage, FLOWS, CONTACT_INFO };
