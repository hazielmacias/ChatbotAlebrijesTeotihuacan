require('dotenv').config();

const { processIncomingMessage } = require('../src/bot/engine');
const { supabaseAdmin } = require('../src/lib/supabase');

let pass = 0;
let fail = 0;

function assert(cond, name, detail) {
  if (cond) {
    console.log('  [OK]   ' + name);
    pass++;
  } else {
    console.log('  [FAIL] ' + name + (detail ? ' :: ' + detail : ''));
    fail++;
  }
}

async function runScenario(name, steps, options = {}) {
  console.log(`\n=== ${name} ===\n`);
  const phone = '+5255550' + Math.floor(Math.random() * 100000).toString().padStart(6, '0');
  console.log(`Usuario: ${phone}\n`);

  const results = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    console.log(`[STEP ${i + 1}] Usuario envia: ${JSON.stringify(step.input)}`);
    const result = await processIncomingMessage({
      from: phone,
      text: step.input,
      messageId: `test_${Date.now()}_${i}`,
      contactName: 'Test User'
    });
    console.log(`  handled=${result.handled} | sent_ok=${result.sent_ok} | flow=${result.response_flow || '-'} | step=${result.response_step || '-'} | bot_active=${result.bot_active}`);
    if (result.sent_ok === false) {
      console.log('  WARN: send error (esperado en test local: Meta API falla)');
    }
    if (step.expect) {
      for (const [key, expected] of Object.entries(step.expect)) {
        const actual = result[key];
        assert(actual === expected, key + '=' + JSON.stringify(expected), 'got=' + JSON.stringify(actual));
      }
    }
    results.push(result);
  }

  if (options.verifyRegistration) {
    const { data: reg } = await supabaseAdmin
      .from('registrations')
      .select('category, player_name, birth_year, position')
      .eq('contact_phone', phone)
      .maybeSingle();
    if (options.verifyRegistration === true) {
      assert(reg !== null, 'registration existe');
    } else {
      for (const [key, expected] of Object.entries(options.verifyRegistration)) {
        const actual = reg ? reg[key] : null;
        assert(actual === expected, 'reg.' + key + '=' + JSON.stringify(expected), 'got=' + JSON.stringify(actual));
      }
    }
  }

  if (options.verifyState) {
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('current_flow, current_step, flow_data')
      .eq('phone', phone)
      .maybeSingle();
    for (const [key, expected] of Object.entries(options.verifyState)) {
      const actual = conv ? conv[key] : null;
      assert(actual === expected, 'state.' + key + '=' + JSON.stringify(expected), 'got=' + JSON.stringify(actual));
    }
  }

  if (options.verifyMessage) {
    const { data: conv } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();
    const { data: msgs } = await supabaseAdmin
      .from('messages')
      .select('content, sent_by, type')
      .eq('conversation_id', conv.id)
      .eq('direction', 'outbound')
      .eq('sent_by', 'bot')
      .order('created_at', { ascending: true });
    const allText = (msgs || []).map(m => m.content || '').join('\n--SEPARATOR--\n');
    for (const [assertion, expected] of Object.entries(options.verifyMessage)) {
      if (assertion === 'contains') {
        assert(allText.includes(expected), 'mensaje contiene ' + JSON.stringify(expected));
      } else if (assertion === 'notContains') {
        assert(!allText.includes(expected), 'mensaje NO contiene ' + JSON.stringify(expected));
      }
    }
  }

  // Limpiar
  const { data: convs } = await supabaseAdmin.from('conversations').select('id').eq('phone', phone);
  if (convs) {
    for (const c of convs) {
      await supabaseAdmin.from('messages').delete().eq('conversation_id', c.id);
    }
    await supabaseAdmin.from('conversations').delete().eq('phone', phone);
  }
  await supabaseAdmin.from('contacts').delete().eq('phone', phone);
  await supabaseAdmin.from('registrations').delete().eq('contact_phone', phone);
  console.log(`\nLimpieza OK para ${phone}`);

  return results;
}

(async () => {
  try {
    await runScenario('1) Usuario nuevo ve menu principal', [
      { input: 'hola', expect: { response_flow: 'menu', response_step: 'start' } }
    ]);

    await runScenario('2) Menu invalido genera ayuda', [
      { input: 'menu', expect: { response_flow: 'menu', response_step: 'start' } },
      { input: '99', expect: { response: 'help' } }
    ]);

    await runScenario('3) Reset con 0 desde cualquier paso', [
      { input: 'menu', expect: { response_flow: 'menu' } },
      { input: '2', expect: { response_flow: 'tdp' } },
      { input: '0', expect: { response_flow: 'menu' } }
    ]);

    // ====== ESCENARIO REGRESION BUG #1: TDP free_text happy path ======
    await runScenario('4) BUG: TDP free_text con datos correctos -> cierre (REGRESION)', [
      { input: 'menu', expect: { response_flow: 'menu' } },
      { input: '2', expect: { response_flow: 'tdp', response_step: 'info' } },
      {
        input: 'Haziel Alejandro Mercado Macías\n2009\nMedio Centro',
        expect: { response_flow: 'cierre', response_step: 'farewell' }
      }
    ], {
      verifyRegistration: { category: 'tdp', player_name: 'Haziel Alejandro Mercado Macías', birth_year: 2009, position: 'Mediocampista' }
    });

    // ====== ESCENARIO REGRESION BUG #2: posicion sin etiqueta ======
    await runScenario('5) BUG: posicion sin etiqueta debe capturarse (REGRESION)', [
      { input: 'menu' },
      { input: '2' },
      {
        input: 'Juan Pérez\n2008\nDefensa',
        expect: { response_flow: 'cierre', response_step: 'farewell' }
      }
    ], {
      verifyRegistration: { category: 'tdp', position: 'Defensa' }
    });

    // ====== ESCENARIO REGRESION BUG #3: usuario manda "Continua" luego la data, debe seguir en TDP ======
    await runScenario('6) BUG: enviar "Continua" primero, luego data, no debe resetear (REGRESION)', [
      { input: 'menu' },
      { input: '2', expect: { response_flow: 'tdp', response_step: 'info' } },
      { input: 'Continua', expect: { validation_failed: true, help_retry: true } },
      {
        input: 'Pedro López\n2010\nDelantero',
        expect: { response_flow: 'cierre', response_step: 'farewell' }
      }
    ], {
      verifyRegistration: { category: 'tdp', player_name: 'Pedro López', birth_year: 2010, position: 'Delantero' }
    });

    // ====== ESCENARIO: TDP out_of_range SI resetea al menu (no se guarda registration) ======
    await runScenario('7) TDP año fuera de rango (2001) -> reset a menu', [
      { input: 'menu' },
      { input: '2' },
      {
        input: 'Test User\n2001\nDefensa',
        expect: { response_flow: 'menu', response_step: 'start' }
      }
    ], {
      verifyState: { current_flow: 'menu', current_step: 'start' }
    });

    // ====== ESCENARIO: TDP con texto ambiguo SIN enviar data despues, sigue en TDP ======
    await runScenario('8) TDP con texto ambiguo aislado -> ayuda, sigue en TDP', [
      { input: 'menu' },
      { input: '2', expect: { response_flow: 'tdp', response_step: 'info' } },
      { input: 'Quiero mas informacion', expect: { validation_failed: true, help_retry: true } }
    ], {
      verifyState: { current_flow: 'tdp', current_step: 'info' }
    });

    await runScenario('9) FAQ: navegar y volver al menu', [
      { input: 'menu' },
      { input: '4', expect: { response_flow: 'faq' } },
      { input: '1', expect: { response_flow: 'faq', response_step: 'horarios' } },
      { input: '0', expect: { response_flow: 'menu' } }
    ]);

    await runScenario('10) Escuela: happy path con tutor y posicion etiquetada', [
      { input: 'menu' },
      { input: '1', expect: { response_flow: 'escuela' } },
      { input: 'A', expect: { response_flow: 'escuela', response_step: 'collect_data' } },
      {
        input: 'Ana Torres\n9\nPosición: Delantero\nMamá',
        expect: { response_flow: 'cierre', response_step: 'farewell' }
      }
    ], {
      verifyRegistration: { category: 'escuela', position: 'Delantero' }
    });

    // ====== ESCENARIO REGRESION WARNING TDP: solo visible en opcion 2 ======
    await runScenario('11) WARNING TDP: opcion 2 (TDP) muestra el bloque ⚠️ ANTES DE CONTINUAR (REGRESION)', [
      { input: 'menu' },
      { input: '2', expect: { response_flow: 'tdp', response_step: 'info' } }
    ], {
      verifyMessage: {
        contains: '*⚠️ ANTES DE CONTINUAR*',
        contains: 'Solamente cubres tu seguro contra accidentes y lesiones deportivas',
        notContains: 'Todo lo relacionado a costos y así tienes que consultarlo con la asesora. Athziri'
      }
    });

    await runScenario('12) WARNING TDP: opcion 3 (Piloto) NO muestra el bloque (REGRESION)', [
      { input: 'menu' },
      { input: '3', expect: { response_flow: 'tdp', response_step: 'info' } }
    ], {
      verifyMessage: {
        notContains: '*⚠️ ANTES DE CONTINUAR*',
        notContains: 'Solamente cubres tu seguro',
        contains: 'FUERZAS BÁSICAS Y TERCERA DIVISIÓN PROFESIONAL'
      }
    });

    console.log('\n=== RESUMEN ===');
    console.log('OK:   ' + pass);
    console.log('FAIL: ' + fail);
    console.log('Total: ' + (pass + fail));
    process.exit(fail > 0 ? 1 : 0);
  } catch (e) {
    console.error('ERROR FATAL:', e);
    process.exit(2);
  }
})();

