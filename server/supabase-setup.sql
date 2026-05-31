-- =============================================
-- MEPEX COTIZADOR — Supabase Setup
-- =============================================
-- Tablas reutilizadas del LOBBY: catalogo_items, clientes, eventos, proyectos
-- Solo se agregan columnas a cotizaciones para el cotizador.
-- Tablas propias del cotizador: ver migrations/002 (cotizacion_items +
-- cotizacion_espacios) y migrations/003 (cotizacion_numerador + función).
-- =============================================

-- Columnas nuevas para cotizaciones (las del cotizador)
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS project_id UUID;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS event_id UUID;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS tipo_cotizacion TEXT;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS superficie NUMERIC DEFAULT 0;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS tipo_stand TEXT;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS altura TEXT;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS subtotal NUMERIC DEFAULT 0;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS iva NUMERIC DEFAULT 0;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS fecha_emision DATE;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS full_state JSONB;
ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cotizaciones_numero ON cotizaciones(numero);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_fecha_emision ON cotizaciones(fecha_emision DESC);

-- Storage bucket para PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('cotizaciones-pdf', 'cotizaciones-pdf', true)
ON CONFLICT (id) DO NOTHING;
