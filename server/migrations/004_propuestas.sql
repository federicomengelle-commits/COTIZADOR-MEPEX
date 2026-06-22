-- =============================================
-- MIGRACIÓN 004 — Panel de Propuestas (Fase 2.3)
-- =============================================
-- Guarda las PROPUESTAS comerciales en PDF generadas desde el cotizador
-- (servicio /propuesta-api) para listarlas/abrirlas en la sidebar, espejo del
-- panel de "cotizaciones guardadas".
--
-- Tabla PROPIA del cotizador (no compartida con LOBBY). Referencia opcional a
-- `cotizaciones` (ON DELETE SET NULL → borrar una cotización no rompe la propuesta).
-- El PDF vive en un bucket NUEVO de Storage: `propuestas-pdf` (espejo de
-- `cotizaciones-pdf`).
--
-- EJECUTAR en el editor SQL de Supabase. Idempotente.
-- Coordinar con LOBBY: tabla y bucket nuevos, no tocan nada existente.
-- =============================================

-- Tabla: una fila por propuesta guardada
CREATE TABLE IF NOT EXISTS cotizacion_propuestas (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente       text,
    evento        text,
    modo          text,                       -- 'STAND' | 'EXPO' | 'ALQUILER'
    total         numeric,                    -- total con IVA (para mostrar/ordenar)
    ref           text,                       -- número de cotización (COT-AAAA-NNNN) si lo hay
    cotizacion_id uuid REFERENCES cotizaciones(id) ON DELETE SET NULL,
    pdf_url       text,                       -- URL pública del PDF en Storage
    pdf_path      text,                       -- key dentro del bucket (para poder borrarlo)
    payload       jsonb,                      -- snapshot del JSON enviado al motor (respaldo)
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- Índice para el orden del panel (más nuevas primero)
CREATE INDEX IF NOT EXISTS idx_cotizacion_propuestas_created_at
    ON cotizacion_propuestas (created_at DESC);

-- ──────────────────────────────────────────
-- Bucket de Storage para los PDFs de propuestas (público, espejo de cotizaciones-pdf).
-- Público = la URL del PDF se puede abrir en una pestaña sin auth.
-- El upload lo hace el backend con la service_role key (bypassa RLS).
-- ──────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('propuestas-pdf', 'propuestas-pdf', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ──────────────────────────────────────────
-- Verificación (correr después):
--   SELECT * FROM cotizacion_propuestas ORDER BY created_at DESC LIMIT 5;
--   SELECT id, public FROM storage.buckets WHERE id = 'propuestas-pdf';  -- public = true
-- ──────────────────────────────────────────
