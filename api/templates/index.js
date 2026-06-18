const { requireAuth } = require('../../src/middleware/auth');
const { supabaseAdmin } = require('../../src/lib/supabase');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const DEFAULT_TEMPLATES = {
  'menu.welcome': {
    description: 'Mensaje principal del menu que se envia cuando un contacto nuevo escribe "hola"',
    content: '¡Hola! Gracias por tu interes en *Alebrijes Teotihuacan* ⚽🔥. El inicio de tu carrera profesional comienza aqui.\n\nPara brindarte la informacion correcta y generar tu *Pase de Prueba de 1 Semana SIN COSTO*, por favor selecciona la categoria que te interesa escribiendo el numero:\n\n1️⃣ Centro de Iniciacion Deportiva (Escuela) - Ninos de 6 a 11 anos\n2️⃣ Tercera Division Profesional (Liga TDP) - Jovenes nacidos entre 2005 y 2012\n3️⃣ Equipo Piloto Liga de Expansion MX - Jovenes nacidos entre 2002 y 2004\n4️⃣ Preguntas frecuentes\n\n_Responde con el numero de la opcion._',
    variables: []
  },
  'escuela.info': {
    description: 'Informacion del plan Escuela (6-11 anos) con precios y horarios',
    content: '¡Excelente eleccion! Nuestra Escuela es el lugar ideal para los fundamentos y la pasion por el futbol.\n\nTenemos una *Inversion Transparente*:\n✅ Costo de Inscripcion: *$0*\n✅ Mensualidad fija: *$550 MXN* (Sin letras chiquitas)\n\nContamos con dos horarios de entrenamiento, ¿cual prefieres? (Escribe *A* o *B*)\n\n*A. Turno Matutino (Alto Rendimiento):* Lunes a Viernes de 08:00 a 10:30 hrs.\n*B. Turno Vespertino (Iniciacion y Desarrollo):* Martes, Miercoles y Jueves de 16:00 a 18:30 hrs.',
    variables: []
  },
  'help.invalid': {
    description: 'Mensaje que se envia cuando el usuario ingresa una opcion no valida',
    content: '🤔 No entendi tu respuesta.\n\nPor favor responde con una de las opciones validas.\n\n_Escribe *menu* o *0* para volver al inicio._',
    variables: []
  },
  'cierre.success': {
    description: 'Mensaje final cuando el contacto completa su registro de pase de prueba',
    content: '¡Excelente! Hemos recibido tus datos correctamente.\n\n📲 En breve un miembro de nuestro equipo te contactara para confirmar tu *Pase de Prueba de 1 Semana SIN COSTO*.\n\n¡Te esperamos en la cancha! ⚽',
    variables: ['{{name}}', '{{category}}']
  }
};

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    if (req.method === 'GET') {
      // Listar todas las plantillas
      const { data: customTemplates, error } = await supabaseAdmin
        .from('bot_templates')
        .select('key, description, content, variables, updated_at, updated_by');

      if (error) {
        console.warn('[templates] Tabla bot_templates no existe aun, usando defaults');
        const merged = Object.entries(DEFAULT_TEMPLATES).map(([key, t]) => ({
          key,
          description: t.description,
          content: t.content,
          variables: t.variables,
          is_default: true
        }));
        return res.status(200).json({ templates: merged, is_default: true });
      }

      const customKeys = new Set((customTemplates || []).map(t => t.key));
      const merged = [
        ...(customTemplates || []),
        ...Object.entries(DEFAULT_TEMPLATES)
          .filter(([key]) => !customKeys.has(key))
          .map(([key, t]) => ({
            key,
            description: t.description,
            content: t.content,
            variables: t.variables,
            is_default: true
          }))
      ];

      return res.status(200).json({ templates: merged });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) {}
      }
      if (!body || !body.key || !body.content) {
        return res.status(400).json({ error: 'key y content requeridos.' });
      }

      const { key, description, content, variables } = body;
      const { data, error } = await supabaseAdmin
        .from('bot_templates')
        .upsert({
          key,
          description: description || null,
          content,
          variables: variables || [],
          updated_at: new Date().toISOString(),
          updated_by: auth.user.id
        }, { onConflict: 'key' })
        .select()
        .single();

      if (error) {
        console.error('[templates] Error upsert:', error);
        return res.status(500).json({ error: 'Error al guardar plantilla.' });
      }

      return res.status(200).json({ template: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[templates] Excepcion:', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
