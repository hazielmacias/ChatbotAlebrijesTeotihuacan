const { requireAuth } = require('../../src/middleware/auth');
const { supabaseAdmin } = require('../../src/lib/supabase');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function validateUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

function validatePlanPayload(body) {
  const errors = [];
  const data = {};

  if (body.name !== undefined) {
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      errors.push('name no puede estar vacio.');
    } else if (body.name.length > 100) {
      errors.push('name excede 100 caracteres.');
    } else {
      data.name = body.name.trim();
    }
  }

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== 'string') {
      errors.push('description debe ser string o null.');
    } else if (body.description && body.description.length > 5000) {
      errors.push('description excede 5000 caracteres.');
    } else {
      data.description = body.description;
    }
  }

  if (body.price !== undefined) {
    if (body.price === null) {
      data.price = null;
    } else {
      const priceNum = Number(body.price);
      if (!Number.isFinite(priceNum) || priceNum < 0) {
        errors.push('price debe ser numero >= 0 o null.');
      } else {
        data.price = priceNum;
      }
    }
  }

  if (body.category !== undefined) {
    if (body.category === null) {
      data.category = null;
    } else if (typeof body.category !== 'string') {
      errors.push('category debe ser string o null.');
    } else if (body.category.length > 50) {
      errors.push('category excede 50 caracteres.');
    } else {
      data.category = body.category;
    }
  }

  if (body.image_url !== undefined) {
    if (body.image_url === null) {
      data.image_url = null;
    } else if (typeof body.image_url !== 'string') {
      errors.push('image_url debe ser string o null.');
    } else if (!validateUrl(body.image_url)) {
      errors.push('image_url debe ser una URL http(s) valida o null.');
    } else {
      data.image_url = body.image_url;
    }
  }

  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') {
      errors.push('is_active debe ser boolean.');
    } else {
      data.is_active = body.is_active;
    }
  }

  return { errors, data };
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'ID de plan requerido.' });
  }

  try {
    if (req.method === 'GET') {
      return await handleGet(req, res, id);
    }
    if (req.method === 'PATCH') {
      return await handleUpdate(req, res, id);
    }
    if (req.method === 'DELETE') {
      return await handleDelete(req, res, id);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[catalog:id] Excepcion:', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};

async function handleGet(req, res, id) {
  try {
    const { data: plan, error } = await supabaseAdmin
      .from('catalog_plans')
      .select('id, name, description, price, category, image_url, is_active, created_at, updated_at')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[catalog:get] Error:', error);
      return res.status(500).json({ error: 'Error al consultar el plan.' });
    }
    if (!plan) {
      return res.status(404).json({ error: 'Plan no encontrado.' });
    }

    return res.status(200).json({ plan });
  } catch (e) {
    console.error('[catalog:get] Excepcion:', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
}

async function handleUpdate(req, res, id) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) {}
  }
  if (!body || typeof body !== 'object') body = {};

  const { errors, data } = validatePlanPayload(body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos invalidos.', details: errors });
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'Nada que actualizar. Envia al menos un campo.' });
  }

  try {
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('catalog_plans')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) {
      console.error('[catalog:patch] Error verificando:', fetchErr);
      return res.status(500).json({ error: 'Error al verificar el plan.' });
    }
    if (!existing) {
      return res.status(404).json({ error: 'Plan no encontrado.' });
    }

    const { data: plan, error } = await supabaseAdmin
      .from('catalog_plans')
      .update({
        ...data,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('id, name, description, price, category, image_url, is_active, created_at, updated_at')
      .single();

    if (error) {
      console.error('[catalog:patch] Error:', error);
      return res.status(500).json({ error: 'Error al actualizar el plan.' });
    }

    return res.status(200).json({ plan, updated_fields: Object.keys(data) });
  } catch (e) {
    console.error('[catalog:patch] Excepcion:', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
}

async function handleDelete(req, res, id) {
  try {
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('catalog_plans')
      .select('id, is_active, name')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) {
      console.error('[catalog:delete] Error verificando:', fetchErr);
      return res.status(500).json({ error: 'Error al verificar el plan.' });
    }
    if (!existing) {
      return res.status(404).json({ error: 'Plan no encontrado.' });
    }
    if (!existing.is_active) {
      return res.status(200).json({
        plan: existing,
        deleted: false,
        message: 'El plan ya estaba inactivo.'
      });
    }

    const { data: plan, error } = await supabaseAdmin
      .from('catalog_plans')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('id, name, description, price, category, image_url, is_active, created_at, updated_at')
      .single();

    if (error) {
      console.error('[catalog:delete] Error:', error);
      return res.status(500).json({ error: 'Error al desactivar el plan.' });
    }

    return res.status(200).json({
      plan,
      deleted: true,
      soft_delete: true,
      message: 'Plan desactivado (soft delete).'
    });
  } catch (e) {
    console.error('[catalog:delete] Excepcion:', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
}
