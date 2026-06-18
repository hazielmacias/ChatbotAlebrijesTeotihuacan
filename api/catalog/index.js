const { requireAuth } = require('../../src/middleware/auth');
const { supabaseAdmin } = require('../../src/lib/supabase');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

function validatePlanPayload(body, partial = false) {
  const errors = [];
  const data = {};

  if (!partial || body.name !== undefined) {
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      if (!partial) errors.push('name es requerido.');
    } else {
      const name = body.name.trim();
      if (name.length > 100) errors.push('name excede 100 caracteres.');
      else data.name = name;
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
  }

  if (body.category !== undefined && body.category !== null) {
    if (typeof body.category !== 'string') {
      errors.push('category debe ser string.');
    } else if (body.category.length > 50) {
      errors.push('category excede 50 caracteres.');
    } else {
      data.category = body.category;
    }
  }

  if (body.image_url !== undefined && body.image_url !== null) {
    if (typeof body.image_url !== 'string') {
      errors.push('image_url debe ser string.');
    } else if (!validateUrl(body.image_url)) {
      errors.push('image_url debe ser una URL http(s) valida.');
    } else {
      data.image_url = body.image_url;
    }
  }

  return { errors, data };
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();

  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    if (req.method === 'GET') {
      return await handleList(req, res);
    }
    if (req.method === 'POST') {
      return await handleCreate(req, res, auth);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[catalog] Excepcion:', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
};

async function handleList(req, res) {
  const { category, search, include_inactive } = req.query;

  try {
    let query = supabaseAdmin
      .from('catalog_plans')
      .select('id, name, description, price, category, image_url, is_active, created_at, updated_at')
      .order('name', { ascending: true });

    if (include_inactive !== 'true') {
      query = query.eq('is_active', true);
    }

    if (category && typeof category === 'string') {
      query = query.eq('category', category);
    }

    if (search && typeof search === 'string' && search.trim()) {
      const term = '%' + search.trim() + '%';
      query = query.or(`name.ilike.${term},description.ilike.${term},category.ilike.${term}`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[catalog:list] Error:', error);
      return res.status(500).json({ error: 'Error al listar planes.' });
    }

    return res.status(200).json({
      plans: data || [],
      count: (data || []).length
    });
  } catch (e) {
    console.error('[catalog:list] Excepcion:', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
}

async function handleCreate(req, res, auth) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) {}
  }
  if (!body || typeof body !== 'object') body = {};

  const { errors, data } = validatePlanPayload(body, false);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Datos invalidos.', details: errors });
  }

  try {
    const { data: plan, error } = await supabaseAdmin
      .from('catalog_plans')
      .insert({
        ...data,
        is_active: true,
        updated_at: new Date().toISOString()
      })
      .select('id, name, description, price, category, image_url, is_active, created_at, updated_at')
      .single();

    if (error) {
      console.error('[catalog:create] Error:', error);
      return res.status(500).json({ error: 'Error al crear el plan.' });
    }

    return res.status(201).json({ plan });
  } catch (e) {
    console.error('[catalog:create] Excepcion:', e);
    return res.status(500).json({ error: 'Error interno.' });
  }
}
