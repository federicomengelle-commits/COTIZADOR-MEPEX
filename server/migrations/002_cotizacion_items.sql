-- =============================================
-- MIGRACIÓN 002 — Normalización de items de cotización
-- =============================================
-- Crea cotizacion_espacios + cotizacion_items para poder hacer queries reales
-- sobre lo cotizado (item más vendido, rubro más cotizado, evolución de precios)
-- que hoy son imposibles contra el full_state JSONB.
--
-- full_state JSONB se MANTIENE en cotizaciones como snapshot/respaldo. Estas
-- tablas son la fuente normalizada para reportes. La escritura es additiva:
-- si falla, el guardado de full_state sigue funcionando (ver server/index.js).
--
-- Tipos confirmados contra la DB real (2026-05):
--   cotizaciones.id    = uuid
--   catalogo_items.id  = integer
--
-- IDEMPOTENTE: se puede correr varias veces sin error.
-- EJECUTAR en el editor SQL de Supabase (requiere DDL; la API REST no lo permite).
-- Coordinar con LOBBY: son tablas nuevas que referencian cotizaciones y
-- catalogo_items (compartidas), pero NO las modifican.
-- =============================================

-- ──────────────────────────────────────────
-- Espacios (solo modo Expo / Alquiler; en Stand no se usan)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cotizacion_espacios (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cotizacion_id   uuid NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
    nombre          text NOT NULL,
    superficie      numeric(8,2),
    posicion        integer,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cotizacion_espacios_cot
    ON cotizacion_espacios(cotizacion_id);

-- ──────────────────────────────────────────
-- Items (una fila por línea de cotización)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cotizacion_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cotizacion_id   uuid NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
    -- NULL en modo Stand; FK al espacio en Expo/Alquiler
    espacio_id      uuid REFERENCES cotizacion_espacios(id) ON DELETE CASCADE,
    -- FK floja al catálogo: SET NULL si el item se borra de catalogo_items,
    -- pero el snapshot de abajo conserva los datos para el documento histórico.
    catalogo_item_id integer REFERENCES catalogo_items(id) ON DELETE SET NULL,

    -- Snapshot del item al momento de cotizar (inmutable aunque cambie el catálogo)
    nombre          text NOT NULL,
    codigo          text,
    unidad          text,
    rubro           text,
    categoria       text,

    -- Pricing congelado al momento de guardar
    precio_unitario_base     numeric(12,2) NOT NULL,  -- precio_alquiler redondeado, sin ajustes
    precio_unitario_ajustado numeric(12,2) NOT NULL,  -- post altura × modificador × fee
    cantidad        numeric(10,2) NOT NULL,
    subtotal_linea  numeric(14,2) NOT NULL,           -- precio_unitario_ajustado × cantidad

    -- Trazabilidad de los multiplicadores aplicados a esta línea
    height_multiplier_aplicado numeric(4,2) NOT NULL DEFAULT 1.0,
    modifier_pct_aplicado      numeric(5,2) NOT NULL DEFAULT 0,
    fee_pct_aplicado           numeric(5,2) NOT NULL DEFAULT 0,

    posicion        integer,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cotizacion_items_cot
    ON cotizacion_items(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_cotizacion_items_catalogo
    ON cotizacion_items(catalogo_item_id);
CREATE INDEX IF NOT EXISTS idx_cotizacion_items_rubro
    ON cotizacion_items(rubro);

-- ──────────────────────────────────────────
-- Verificación rápida (correr después de crear):
--   SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('cotizacion_items','cotizacion_espacios');
-- Debe devolver las 2 filas.
-- ──────────────────────────────────────────
