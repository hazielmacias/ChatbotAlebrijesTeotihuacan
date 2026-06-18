// Aplica el SQL de la columna archived_at via pg connection
// Uso: SUPABASE_DB_URL=postgresql://... node scripts/apply-archive-column.js
// o pegar el SQL en Supabase Studio > SQL Editor > New query

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, 'setup-archive-column.sql'), 'utf-8');

  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.log('=== INSTRUCCIONES ===');
    console.log('1. Abre https://supabase.com/dashboard/project/sjajkaqenarsnaevhzko/sql/new');
    console.log('2. Pega el siguiente SQL y haz click en "Run":');
    console.log('---');
    console.log(sql);
    console.log('---');
    console.log('O bien, instala pg y exporta SUPABASE_DB_URL con la connection string de Supabase:');
    console.log('  Settings > Database > Connection string > URI (con password)');
    process.exit(0);
  }

  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  console.log('Conectado, ejecutando SQL...');
  await c.query(sql);
  console.log('OK: columna archived_at agregada');
  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
