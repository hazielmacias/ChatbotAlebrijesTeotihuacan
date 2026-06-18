-- Crear tabla bot_templates para el editor de plantillas
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS bot_templates (
  key TEXT PRIMARY KEY,
  description TEXT,
  content TEXT NOT NULL,
  variables TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Habilitar RLS
ALTER TABLE bot_templates ENABLE ROW LEVEL SECURITY;

-- Solo service_role puede leer/escribir (los admins usan el backend con service_key)
-- El anon key NO debe tener acceso directo
CREATE POLICY "service_role_all" ON bot_templates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Comentario
COMMENT ON TABLE bot_templates IS 'Plantillas de mensajes del bot, editables desde el dashboard';
COMMENT ON COLUMN bot_templates.key IS 'Identificador unico (ej: menu.welcome, escuela.info)';
COMMENT ON COLUMN bot_templates.content IS 'Contenido del mensaje, soporta {{variables}}';
COMMENT ON COLUMN bot_templates.variables IS 'Lista de variables que el template espera (ej: {{name}})';
