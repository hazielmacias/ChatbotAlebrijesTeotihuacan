-- Agregar columna archived_at a conversations
-- Una conversacion archivada se oculta de la lista principal
-- pero sigue siendo accesible desde la vista "Archivados".
-- archived_at NULL = no archivada
-- archived_at con timestamp = archivada en ese momento
--
-- Ejecutar en Supabase SQL Editor

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

-- Indice para filtrar rapidamente
CREATE INDEX IF NOT EXISTS idx_conversations_archived_at
  ON conversations (archived_at)
  WHERE archived_at IS NOT NULL;

-- RLS: el servicio usa service_role, pero la anon key no debe escribir
-- (los admins usan el backend con service_key)
-- No requiere cambios a policies existentes: el backend tiene service_role
-- y la anon key solo lee.

COMMENT ON COLUMN conversations.archived_at IS 'NULL = activa, con timestamp = archivada';
