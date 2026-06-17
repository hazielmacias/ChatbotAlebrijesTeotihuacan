require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const USERS = [
  { email: 'areli@alebrijesteotihuacan.com',  password: 'areli123',  display_name: 'Areli' },
  { email: 'athziri@alebrijesteotihuacan.com', password: 'athziri123', display_name: 'Athziri' },
  { email: 'juan@alebrijesteotihuacan.com',   password: 'juan123',   display_name: 'Juan' },
  { email: 'lalo@alebrijesteotihuacan.com',   password: 'lalo123',   display_name: 'Lalo' }
];

async function ensureUser(user) {
  console.log(`\n--- Procesando ${user.email} ---`);

  const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
  const existing = listData.users.find(u => u.email === user.email);
  let authUserId = null;

  if (existing) {
    authUserId = existing.id;
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
      password: user.password,
      email_confirm: true,
      user_metadata: { display_name: user.display_name }
    });
    if (updateErr) console.error('  Error auth.update:', updateErr.message);
    else console.log(`  Auth actualizado: display_name="${user.display_name}"`);
  } else {
    const { data: createData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { display_name: user.display_name }
    });
    if (createErr) { console.error('  Error auth.create:', createErr.message); return false; }
    authUserId = createData.user.id;
    console.log(`  Auth user creado: id=${authUserId}`);
  }

  const { data: existingDash } = await supabaseAdmin
    .from('dashboard_users')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (existingDash) {
    const { error: dashUpdErr } = await supabaseAdmin
      .from('dashboard_users')
      .update({ display_name: user.display_name })
      .eq('id', existingDash.id);
    if (dashUpdErr) console.error('  Error dashboard_users.update:', dashUpdErr.message);
    else console.log(`  dashboard_users actualizado: display_name="${user.display_name}"`);
  } else {
    const { error: dashInsErr } = await supabaseAdmin
      .from('dashboard_users')
      .insert({ auth_user_id: authUserId, display_name: user.display_name });
    if (dashInsErr) console.error('  Error dashboard_users.insert:', dashInsErr.message);
    else console.log(`  dashboard_users creado: display_name="${user.display_name}"`);
  }

  return true;
}

async function main() {
  console.log('=== Actualizando usuarios (solo primer nombre) ===\n');
  let allOk = true;
  for (const u of USERS) {
    if (!await ensureUser(u)) allOk = false;
  }
  console.log('\n=== Resultado ===');
  if (allOk) {
    console.log('OK - Usuarios actualizados:');
    USERS.forEach(u => console.log(`  - ${u.email} -> ${u.display_name}`));
  } else {
    console.log('FAIL');
    process.exit(1);
  }
}

main();
