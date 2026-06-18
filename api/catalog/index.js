const { requireAuth } = require('../../src/middleware/auth');
const { supabaseAdmin } = require('../../src/lib/supabase');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function validateUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (e) { return false; }
}

function validatePlanPayload(body, partial = false) {
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

  if (body.price !== undefined && body.price !== null) {
    const priceNum = Number(body.price);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      errors.push('price debe ser numero >= 0.');
    } else {
      data.price = priceNum;
    }
  } else if (body.price === null) {
    data.price = null;
  }

  if (body.category !== undefined) {
    if (body.category === null) data.category = null;
    else if (typeof body.category !== 'string') errors.push('category debe ser string o null.');
    else if (body.category.length > 50) errors.push('category excede 50 caracteres.');
    else data.category = body.category;
  }

  if (body.image_url !== undefined) {
    if (body.image_url === null) data.image_url = null;
    else if (typeof body.image_url !== 'string') errors.push('image_url debe ser string o null.');
    else if (!validateUrl(body.image_url)) errors.push('image_url debe ser una URL http(s) valida.');
    else data.image_url = body.image_url;
  }

  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') errors.push('is_active debe ser boolean.');
    else data.is_active = body.is_active;
  }

  return { errors, data };
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    // GET /api/catalog?id=xxx - list or single
    if (req.method === 'GET') {
      const { id, category, search, include_inactive } = req.query;

      if (id) {
        const { data: plan, error } = await supabaseAdmin
          .from('catalog_plans')
          .select('id, name, description, price, category, image_url, is_active, created_at, updated_at')
          .eq('id', id).maybeSingle();
        if (error) return res.status(500).json({ error: 'Error al consultar.' });
        if (!plan) return res.status(404).json({ error: 'Plan no encontrado.' });
        return res.status(200).json({ plan });
      }

      let query = supabaseAdmin
        .from('catalog_plans')
        .select('id, name, description, price, category, image_url, is_active, created_at, updated_at')
        .order('price', { ascending: true });
      if (include_inactive !== 'true') query = query.eq('is_active', true);
      if (category) query = query.eq('category', category);
      if (search && search.trim()) {
        const t = '%' + search.trim() + '%';
        query = query.or(`name.ilike.${t},description.ilike.${t},category.ilike.${t}`);
      }

      const { data, error } = await query;
      if (error) return res.status(500).json({ error: 'Error al listar.' });
      return res.status(200).json({ plans: data || [], count: (data || []).length });
    }

    // POST /api/catalog - create (no id in body)
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) {}
      }
      if (!body || typeof body !== 'object') body = {};

      const { errors, data } = validatePlanPayload(body, false);
      if (errors.length > 0) return res.status(400).json({ error: 'Datos invalidos.', details: errors });

      const { data: plan, error } = await supabaseAdmin
        .from('catalog_plans')
        .insert({ ...data, is_active: true, updated_at: new Date().toISOString() })
        .select('id, name, description, price, category, image_url, is_active, created_at, updated_at')
        .single();
      if (error) return res.status(500).json({ error: 'Error al crear.' });
      return res.status(201).json({ plan });
    }

    // PATCH /api/catalog - update (id in body)
    if (req.method === 'PATCH') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) {}
      }
      if (!body || typeof body !== 'object') body = {};

      const { id, ...rest } = body;
      if (!id) return res.status(400).json({ error: 'ID requerido en body.' });

      const { errors, data } = validatePlanPayload(rest, true);
      if (errors.length > 0) return res.status(400).json({ error: 'Datos invalidos.', details: errors });
      if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nada que actualizar.' });

      const { data: plan, error } = await supabaseAdmin
        .from('catalog_plans')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id, name, description, price, category, image_url, is_active, created_at, updated_at')
        .single();
      if (error) return res.status(500).json({ error: 'Error al actualizar.' });
      return res.status(200).json({ plan, updated_fields: Object.keys(data) });
    }

    // DELETE /api/catalog - soft delete (id in body)
    if (req.method === 'DELETE') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) {}
      }
      if (!body || typeof body !== 'object') body = {};

      const { id } = body;
      if (!id) return res.status(400).json({ error: 'ID requerido en body.' });

      const { data: existing } = await supabaseAdmin
        .from('catalog_plans').select('id, is_active').eq('id', id).maybeSingle();
      if (!existing) return res.status(404).json({ error: 'Plan no encontrado.' });

      if (!existing.is_active) {
        return res.status(200).json({ deleted: false, message: 'Ya estaba inactivo.' });
      }

      const { data: plan, error } = await supabaseAdmin
        .from('catalog_plans')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id, name, description, price, category, image_url, is_active, created_at, updated_at')
        .single();
      if (error) return res.status(500).json({ error: 'Error al desactivar.' });
      return res.status(200).json({ plan, deleted: true, soft_delete: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[catalog] Excepcion:', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};
