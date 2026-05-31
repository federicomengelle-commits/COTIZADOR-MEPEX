-- =============================================
-- MIGRACIÓN 003 — Numerador secuencial atómico de cotizaciones
-- =============================================
-- Reemplaza el viejo MAX(numero)+1 (no atómico, race conditions, y combinado
-- con el fallback localStorage del front generaba números fantasma como los
-- COT-2026-0008 que existían como PDF pero no en la DB).
--
-- Modelo: tabla contador por año + función atómica que incrementa y devuelve
-- el siguiente número en UNA sola operación (sin condiciones de carrera).
-- Resetea naturalmente por año (cada año arranca su propia fila en 1).
--
-- EJECUTAR en el editor SQL de Supabase. Idempotente.
-- Coordinar con LOBBY: tabla y función nuevas, no tocan nada existente.
-- =============================================

-- Contador: una fila por año
CREATE TABLE IF NOT EXISTS cotizacion_numerador (
    anio          integer PRIMARY KEY,
    ultimo_numero integer NOT NULL DEFAULT 0
);

-- Función atómica: incrementa y devuelve el siguiente número del año.
-- El upsert con ON CONFLICT bloquea la fila durante el incremento → sin dupes
-- aunque haya 2 exports simultáneos. Crea la fila del año si no existe.
CREATE OR REPLACE FUNCTION siguiente_numero_cotizacion(p_anio integer)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
    v_next integer;
BEGIN
    INSERT INTO cotizacion_numerador (anio, ultimo_numero)
    VALUES (p_anio, 1)
    ON CONFLICT (anio)
    DO UPDATE SET ultimo_numero = cotizacion_numerador.ultimo_numero + 1
    RETURNING ultimo_numero INTO v_next;
    RETURN v_next;
END;
$$;

-- ──────────────────────────────────────────
-- SEED 2026
-- DB tiene hasta COT-2026-0006, pero hay PDFs COT-2026-0008 ya emitidos
-- (recuperados de papelera). Sembramos en 8 para que el próximo sea 0009 y NO
-- se reuse ningún número ya impreso. GREATEST evita bajarlo si se re-ejecuta.
--
-- ⚠️ Si sabés de un número emitido mayor a 8, cambiá el 8 por ese valor.
-- ──────────────────────────────────────────
INSERT INTO cotizacion_numerador (anio, ultimo_numero)
VALUES (2026, 8)
ON CONFLICT (anio) DO UPDATE
    SET ultimo_numero = GREATEST(cotizacion_numerador.ultimo_numero, 8);

-- ──────────────────────────────────────────
-- Verificación (correr después):
--   SELECT siguiente_numero_cotizacion(2026);   -- debe devolver 9 (y luego 10, 11...)
--   SELECT * FROM cotizacion_numerador;          -- anio=2026 con ultimo_numero creciendo
-- OJO: cada SELECT de la función CONSUME un número (avanza el contador).
-- ──────────────────────────────────────────
