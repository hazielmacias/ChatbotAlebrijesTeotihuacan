require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const USERS = [
  { email: 'areli@alebrijesteotihuacan.com',  password: 'areli123',  display_name: 'Areli Janette' },
  { email: 'athziri@alebrijesteotihuacan.com', password: 'athziri123', display_name: 'Athziri Velazquez' },
  { email: 'juan@alebrijesteotihuacan.com',   password: 'juan123',   display_name: 'Juan' },
  { email: 'lalo@alebrijesteotihuacan.com',   password: 'lalo123',   display_name: 'Lalo' }
];

async function ensureUser(user) {
  console.log(`\n--- Procesando ${user.email} ---`);

  // 1) Listar usuarios existentes con este email
  const { data: listData, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
  if (listErr) {
    console.error('  Error listando usuarios:', listErr.message);
    return false;
  }

  const existing = listData.users.find(u => u.email === user.email);
  let authUserId = null;

  if (existing) {
    console.log(`  Auth user ya existe (id=${existing.id})`);
    authUserId = existing.id;

    // Actualizar password y confirmar email si es necesario
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
      password: user.password,
      email_confirm: true
    });
    if (updateErr) {
      console.error('  Error actualizando password:', updateErr.message);
    } else {
      console.log(`  Password actualizado a: ${user.password}`);
    }
  } else {
    // Crear el usuario
    const { data: createData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { display_name: user.display_name }
    });
    if (createErr) {
      console.error('  Error creando usuario:', createErr.message);
      return false;
    }
    authUserId = createData.user.id;
    console.log(`  Auth user creado (id=${authUserId})`);
  }

  // 2) Crear/actualizar registro en dashboard_users
  const { data: existingDash, error: dashFetchErr } = await supabaseAdmin
    .from('dashboard_users')
    .select('id, display_name')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (dashFetchErr) {
    console.error('  Error buscando dashboard_users:', dashFetchErr.message);
    return false;
  }

  if (existingDash) {
    const { error: dashUpdErr } = await supabaseAdmin
      .from('dashboard_users')
      .update({ display_name: user.display_name })
      .eq('id', existingDash.id);
    if (dashUpdErr) {
      console.error('  Error actualizando dashboard_users:', dashUpdErr.message);
    } else {
      console.log(`  dashboard_users actualizado: display_name="${user.display_name}"`);
    }
  } else {
    const { data: newDash, error: dashInsErr } = await supabaseAdmin
      .from('dashboard_users')
      .insert({ auth_user_id: authUserId, display_name: user.display_name })
      .select()
      .single();
    if (dashInsErr) {
      console.error('  Error creando dashboard_users:', dashInsErr.message);
    } else {
      console.log(`  dashboard_users creado: id=${newDash.id}, display_name="${user.display_name}"`);
    }
  }

  return true;
}

async function main() {
  console.log('=== Configurando usuarios del dashboard ===\n');
  console.log(`URL: ${SUPABASE_URL}`);

  let allOk = true;
  for (const u of USERS) {
    const ok = await ensureUser(u);
    if (!ok) allOk = false;
  }

  console.log('\n=== Resumen ===');
  if (allOk) {
    console.log('OK - Los 4 usuarios estan listos:');
    USERS.forEach(u => {
      console.log(`  - ${u.email} / ${u.password}  ->  ${u.display_name}`);
    });
  } else {
    console.log('FAIL - Hubo errores. Revisa los logs arriba.');
    process.exit(1);
  }
}

main();
