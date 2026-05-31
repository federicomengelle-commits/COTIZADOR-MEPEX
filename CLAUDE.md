# COTIZADOR-MEPEX — Contexto del proyecto

SPA vanilla JS para cotizar stands/expos/alquiler. Desplegada en `http://195.200.1.250/cotizador/`. Comparte instancia Supabase con LOBBY-MEPEX.

## Reglas duraderas (leer antes de tocar nada)

### 🟥 Tablas compartidas con LOBBY — coordinar SIEMPRE
- `catalogo_items` la usa el módulo **Costos** de LOBBY. Tiene 40+ columnas, muchas del costing (margen_*, pct_*, snapshot_*). Cualquier columna nueva debe coordinarse con LOBBY. El cotizador **solo lee** (no escribe; el alta/edición de items vive en Costos).
  - **Precio**: el cotizador usa `precio_alquiler` (la "Lista de Precios" de Costos), redondeado a pesos enteros en `formatCatalogItem`. NO `precio_cliente` (columna legacy casi vacía).
  - **Filtro**: `/api/catalog` devuelve solo `es_cotizable=true` (espejo de la Lista de Precios). El catálogo crece a medida que se marcan items cotizables en Costos.
- `clientes`, `proyectos`, `eventos` son del CRM de LOBBY. El cotizador solo lee. NO modificar columnas existentes.
- `cotizaciones` está extendida con ALTERs (ver `server/supabase-setup.sql`) y además tiene columnas `pyme_*` de la integración de facturación de LOBBY. No tocar esas tampoco.
- **Tablas propias del cotizador** (creadas en `server/migrations/`): `cotizacion_items` + `cotizacion_espacios` (normalización de lo cotizado, snapshot inmutable del precio por línea) y `cotizacion_numerador` (contador atómico por año + función `siguiente_numero_cotizacion`). Referencian `cotizaciones`/`catalogo_items` pero no las modifican.

### 🟥 Tres modos de cotización con reglas distintas
- **Stand**: stand único, params (superficie, frente, profundidad, tipo, altura, modificador). Items en lista plana. Auto-cálculo de cantidades por perímetro/spots. **Único modo que usa multiplicador global de altura**.
- **Expo**: multi-espacio, items por espacio, sin auto-cálculo, sin multiplicador.
- **Alquiler**: igual estructura que Expo. Los 3 modos usan `precio_alquiler` como precio base (resuelto en C1.5; antes el código leía `precio_cliente`).

**Pricing centralizado**: la fórmula vive en `pricing.js` (`Pricing.loadedUnitPrice` + `Pricing.compute`). Las 4 vistas (summary, PDF, CSV, Compare) la consumen. NO duplicar la fórmula — tocar `pricing.js`.

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
- **Numerador secuencial** (`POST /api/cotizaciones/next-number`) — usa la función SQL atómica `siguiente_numero_cotizacion(anio)` sobre la tabla `cotizacion_numerador` (contador por año). NO hay fallback localStorage: si la API cae, el front bloquea el export. Formato `COT-YYYY-NNNN`. Si cambiás el formato, actualizá la función SQL y el padStart del server.
- **Upload de PDF a Storage** (`POST /api/quotations/:id/pdf`).

## Stack

- Vanilla JS ES6+, SPA.
- Supabase (PostgreSQL + Auth + Storage). URL: `selnevalaeykdrgycvdz.supabase.co`.
- Express backend en `server/index.js` (port 3001 local, `/cotizador-api/api` en prod).
- jsPDF para PDFs.
- VPS Hostinger 195.200.1.250 (Ubuntu 24.04). El server corre con **pm2** como `cotizador-api`.
  - Deploy completo (frontend + backend): `cd ~/cotizador && git pull origin main && pm2 restart cotizador-api`
  - Solo frontend (HTML/CSS/JS de browser): alcanza con `git pull` + Ctrl+F5. Si tocás `server/`, el `pm2 restart` es obligatorio.
  - Migraciones SQL (`server/migrations/`): se corren a mano en el editor SQL de Supabase (la API REST no hace DDL).
  - La key nueva de Supabase (`sb_secret_…`) está en `server/.env` como `SUPABASE_SERVICE_KEY` (la legacy service_role fue deshabilitada en 2026-04).

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
