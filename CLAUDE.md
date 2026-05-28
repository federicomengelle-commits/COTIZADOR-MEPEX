# COTIZADOR-MEPEX — Contexto del proyecto

SPA vanilla JS para cotizar stands/expos/alquiler. Desplegada en `http://195.200.1.250/cotizador/`. Comparte instancia Supabase con LOBBY-MEPEX.

## Reglas duraderas (leer antes de tocar nada)

### 🟥 Tablas compartidas con LOBBY — coordinar SIEMPRE
- `catalogo_items` la usa el módulo **Costos** de LOBBY. Tiene 40+ columnas, muchas del costing (margen_*, pct_*, snapshot_*). Cualquier columna nueva debe coordinarse con LOBBY.
- `clientes`, `proyectos`, `eventos` son del CRM de LOBBY. El cotizador solo lee. NO modificar columnas existentes.
- `cotizaciones` está extendida con ALTERs (ver `server/supabase-setup.sql`) y además tiene columnas `pyme_*` de la integración de facturación de LOBBY. No tocar esas tampoco.

### 🟥 Tres modos de cotización con reglas distintas
- **Stand**: stand único, params (superficie, frente, profundidad, tipo, altura, modificador). Items en lista plana. Auto-cálculo de cantidades por perímetro/spots. **Único modo que usa multiplicador global de altura**.
- **Expo**: multi-espacio, items por espacio, sin auto-cálculo, sin multiplicador.
- **Alquiler**: igual estructura que Expo, pricing distinto (debería usar `precio_alquiler` pero hoy usa `precio_cliente` — bug a confirmar).

Cualquier cambio que toque pricing/render debe respetar y documentar la diferencia por modo. Antes de modificar un `if (type === 'stand')`, mapear todos los demás IFs por modo.

### 🟥 Reglas operativas
1. **No inventar schema.** Antes de proponer columnas nuevas, verificar con un SELECT real (la service_role key está allow-listada en `.claude/settings.local.json`).
2. **SQL ejecutable inmediato** → en bloque de código. **SQL futuro / propuesto** → en bloque de código pero comentado o con label `-- PROPUESTA`.
3. **Dry-run SELECTs antes de cualquier UPDATE en producción.** No negociable.
4. **2-query strategy para joins**: PostgREST no soporta joins arbitrarios. Pattern: SELECT parent IDs primero, después SELECT children con `id=in.(uuid1,uuid2,...)`.
5. **Auth**: usar `Auth.getUser().uid` (no `.id`). Hoy `vendedor_id` está NULL en todas las cotizaciones → el cotizador no está populando uid. Si tocás eso, verificar.
6. **localStorage es para drafts y preferencias UI**, no para datos de negocio. Hay autosave del borrador en localStorage que es válido. Pero items, precios, cotizaciones guardadas siempre van a Supabase.

### 🟥 Featureset positivo que NO se rompe
Favorites, Autosave, Templates, Compare, cotizaciones guardadas, número secuencial via API (`/api/cotizaciones/next-number`), Export PDF (jsPDF dark), Export CSV, autocomplete cliente/proyecto/evento, Mobile FAB+drawer, shortcuts Ctrl+K/?/Esc, help tips, Toast+Confirm propios.

### 🟥 Zonas frágiles — no tocar sin avisar
- **Flujo de guardado a Supabase** (`api.js` saveQuotation + `server/index.js` `/api/quotations` POST). Recién arreglado, funciona.
- **Numerador secuencial** (`/api/cotizaciones/next-number`) — lee `numero` de `cotizaciones` y matchea regex `^COT-(\d{4})-(\d{4})$`. Si cambiás el formato del número, romper esto rompe TODO.
- **Upload de PDF a Storage** (`POST /api/quotations/:id/pdf`).

## Stack

- Vanilla JS ES6+, SPA.
- Supabase (PostgreSQL + Auth + Storage). URL: `selnevalaeykdrgycvdz.supabase.co`.
- Express backend en `server/index.js` (port 3001 local, `/cotizador-api/api` en prod).
- jsPDF para PDFs.
- VPS Hostinger 195.200.1.250 (Ubuntu 24.04). Deploy: `~/pull-cotizador.sh`.

## Estructura del repo

```
.
├── index.html              — Single page, 3 columnas
├── style.css               — Monolito CSS (~4590 líneas)
├── script.js               — Monolito JS (~3895 líneas, sección Render entre 1200-3818)
├── api.js                  — Cliente Supabase REST
├── database.js             — Catálogo en memoria + cálculos auto (heightMultipliers, fees)
├── autocomplete.js         — Inputs autocomplete
├── quotation-storage.js    — Persistencia de cotizaciones guardadas
├── quotation-ui.js         — UI del modal "Cargar cotización"
├── server/
│   ├── index.js                — Backend Express
│   ├── supabase-setup.sql      — Schema (mínimo, NO refleja toda la tabla)
│   └── migrate-notion-to-supabase.js  — LEGACY (eliminar)
├── .audit/                 — Docs de auditoría (lectura obligatoria si se trabaja en el refactor)
└── .claude/settings.local.json  — Allowlist con service_role key (gitignored)
```

## Refactor en curso

Hay un proceso de auditoría + refactor en marcha. Los docs vivos están en `.audit/`:
- `BRIEF_AUDITORIA.md` — contexto general y decisiones tomadas
- `01_mapa_arquitectonico.md` — foto del estado actual
- `schema_dump.md` — dump real de Supabase (columnas + samples + counts)

Si se trabaja en el refactor, leer esos 3 antes que el código.

**Patrón visual canónico**: `inventario.js` de LOBBY (dark theme, Space Mono + Outfit/Archivo, prefix `.inventario-*`). En el cotizador el prefix sería `.cotizador-*`. Skill activable: `lobby-module-builder`.

**Módulos planeados** (extraer del monolito `script.js`):
- `render-ui.js`, `render-pdf.js`, `render-csv.js`, `pricing.js`, `validation.js`.

**Decisión tomada sobre schema**: normalizar items con tabla `cotizacion_items` separada. El `full_state JSONB` se mantiene como snapshot/respaldo, pero las queries útiles van contra columnas reales.

## Seguridad — atención

- `.claude/settings.local.json` tiene la **service_role key** de Supabase embebida en patrones de allow. Está gitignored (`.gitignore` línea 21: `.claude/`). NO commitearla.
- Si compartís el directorio entero (zip, sync), la key viaja. Considerar rotar la key si eso pasa.
