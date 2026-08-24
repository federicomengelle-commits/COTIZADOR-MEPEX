# COTIZADOR-MEPEX — Contexto del proyecto

SPA vanilla JS para cotizar las cuatro ramas (Stand / Expo / Equipamiento / Energía). Desplegada en **`https://app.mepex.com.ar/cotizador/`** (la IP `195.200.1.250` redirige ahí). Comparte instancia Supabase con LOBBY-MEPEX.

## Reglas duraderas (leer antes de tocar nada)

### 🟥 Tablas compartidas con LOBBY — coordinar SIEMPRE
- `catalogo_items` la usa el módulo **Costos** de LOBBY. Tiene 40+ columnas, muchas del costing (margen_*, pct_*, snapshot_*). Cualquier columna nueva debe coordinarse con LOBBY. El cotizador **solo lee** (no escribe; el alta/edición de items vive en Costos).
  - **Precio**: el cotizador usa `precio_alquiler` (la "Lista de Precios" de Costos), redondeado a pesos enteros en `formatCatalogItem`. NO `precio_cliente` (columna legacy casi vacía).
  - **Filtro**: `/api/catalog` devuelve solo `es_cotizable=true` (espejo de la Lista de Precios). El catálogo crece a medida que se marcan items cotizables en Costos.
- `clientes`, `proyectos`, `eventos` son del CRM de LOBBY. El cotizador solo lee. NO modificar columnas existentes.
- `cotizaciones` está extendida con ALTERs (ver `server/supabase-setup.sql`) y además tiene columnas `pyme_*` de la integración de facturación de LOBBY. No tocar esas tampoco.
- **Tablas propias del cotizador** (creadas en `server/migrations/`): `cotizacion_items` + `cotizacion_espacios` (normalización de lo cotizado, snapshot inmutable del precio por línea) y `cotizacion_numerador` (contador atómico por año + función `siguiente_numero_cotizacion`). Referencian `cotizaciones`/`catalogo_items` pero no las modifican.

### 🟥 Las CUATRO RAMAS (vocabulario cerrado con LOBBY, 2026-08-23)
`Stand · Expo · Equipamiento · Energía`. La **misma palabra** en la factura, en la cuenta contable, en la línea del caso del CRM y en el presupuesto que ve el cliente. Si una cambia, cambian todas.

**🟥 La CLAVE interna no se toca; cambia la ETIQUETA.** `quotationType` sigue siendo `'alquiler'` para la rama que ahora se llama **Equipamiento**. Renombrar la clave rompería la restauración de borradores y de las cotizaciones guardadas que la tienen adentro de `full_state`. Es el mismo criterio con el que el Lobby dejó quietos los códigos `SRV-*` (ojo con la trampa gemela: **`SRV-ALQUILER` es la rama Equipamiento**).
- **Fuente única de etiquetas**: `DATABASE.quotationTypes` en `database.js` (`DB.typeLabel` / `DB.typeLabelUpper`). La consumen el botón del selector, el badge del resumen, el título del PDF y **el badge de la carátula de la propuesta, que el cliente ve**. Si dice distinto en dos lados, es un bug.
- "Alquiler" **sigue siendo correcto** para la OPERACIÓN (MEPEX alquila todo; `precio_alquiler`). Lo que cambió es el nombre de la RAMA.
- **`tipo_cotizacion`** es la única columna que le dice al Lobby de qué rama es un trabajo, y el trigger la propaga a `proyectos.tipo`. El `typeMap` del server (`/api/quotations` POST y PUT) escribe exactamente una de las cuatro palabras.

Reglas por rama:
- **Stand**: stand único, params (superficie, frente, profundidad, tipo, altura, modificador). **Único modo que usa multiplicador global de altura** (×1.0–1.35, solo Infra+Iluminación).
- **Expo · Equipamiento · Energía**: multi-espacio, items por espacio. `State.isMultiSpaceType()` es la fuente única de esa lista (estaba repetida en 3 lugares).
- Las 4 ramas usan `precio_alquiler` como precio base.

### 🟥 NIVEL DE DETALLE del documento (2026-08-23, premisa del dueño)
Cuánto muestra el PDF **se elige antes de generar** y viaja con la cotización, no con el navegador.
- **STAND NUNCA DISCRIMINA. Nunca.** No es su default: es regla dura en `State.detailLevel()`, y el selector ni se muestra en Stand (vive dentro de `#expo-params-block`, que ya se oculta).
- Las otras tres ramas tienen **tres niveles**: `minimo` (qué lleva cada espacio, un solo total) · `medio` (+ subtotal por espacio) · `detallado` (+ precio por ítem). **Default `minimo`** — "siempre quiero pasar el menor detalle posible".
- **Los renders NO leen el string**: preguntan `State.showsItemPrices()` / `State.showsSpaceSubtotals()`. Fuente única.
- **Los montos se acumulan siempre, se impriman o no.** Bajar el nivel cambia lo que se muestra, nunca lo que se cobra: el total es idéntico en los tres.
- **Persistencia**: gratis en el draft (serializa `generalParams`); explícita en `full_state`. Al restaurar, una cotización **sin** el campo vuelve como `'detallado'` — es anterior a la feature, se envió discriminada, y reimprimir tiene que devolver lo que se mandó. La asimetría con el default `minimo` es deliberada.
- Toca **solo los PDFs**. El CSV queda siempre completo: es interno.

**Auto-cálculo por m² (2026-06)**: items con `unidad = 'm2'/'m²'` toman cantidad = superficie automáticamente (metraje en Stand, surface del espacio en Expo) y se recalculan al cambiarla. Lógica: `DB.isAreaItem()` + `State._autoQuantityFor()`. (El auto-cálculo clásico perímetro/spots sigue para items con `autoCalculate`.)

**🟥 REGLA DE CÁLCULO (2026-06, premisa del dueño — NO romper)**: la fórmula vive SOLO en `pricing.js` (`adjustmentFactor` + `loadedUnitPrice` + `compute`); las 4 vistas (summary, PDF, CSV, Compare) la consumen. Modificador, descuentos, bonificaciones y fee se **SUMAN entre sí** y se aplican sobre el **subtotal** (factor único `1 + mod% + fee%`), NUNCA encadenados (un % sobre otro) ni sobre impuestos. La altura entra en el subtotal base. IVA 21% al final. **Redondeo al peso por línea** → el desglose por rubro/ítem cierra exacto contra el total. (Antes compoundeaba mod×fee e inflaba — corregido.)

**🟥 Mapeo de rubro (2026-06, +Energía 2026-08)**: el cotizador agrupa por **7 keys** (`flooring/infrastructure/lighting/energy/equipment/marketing/moreservices`). El mapeo `rubro → key` vive en `api.js` `convertToLocalFormat` (normalizado sin acentos + fallback por palabras clave en rubro/categoria/nombre). **NO se toca `categoria` en la tabla compartida (la usa LOBBY).** Para sumar un ítem al cotizador alcanza con `es_cotizable=true` + `precio_alquiler>0` (campos solo-cotizador) → cae en su rubro solo.

**🟥 Rubro `Energía` (2026-08-23)**: nació separándose de Iluminación, donde los tableros y tomacorrientes vivían mezclados con los reflectores. Movidos en `catalogo_items` (solo `rubro`, jamás `categoria`): ids 52, 1, 55 (los cotizables). **Quedaron 2 eléctricos NO cotizables en Iluminación** (id 80 "Tablero de obra.", id 72 "Tablero doble comando") — invisibles para el cotizador, visibles para Costos en LOBBY: coordinar antes de moverlos.
- **La trampa, si algún día se agrega otro rubro**: no alcanza con sumar la key al `rubroMap`. El fallback por palabras clave tenía `electric` en el patrón de **Iluminación** y `tablero` en el de **Equipamiento**, así que los ítems caían ahí por la puerta de atrás aunque el rubro dijera Energía. Hubo que sacarlos de ambos y poner el patrón de energía **antes** que el de iluminación. **Orden obligatorio: primero el mapeo en el código, después el `UPDATE` del rubro en la base.** Al revés no "desaparecen": caen en el rubro equivocado.

Cualquier cambio que toque pricing/render debe respetar la diferencia por modo.

### 🟥 Reglas operativas
1. **No inventar schema.** Antes de proponer columnas nuevas, verificar con un SELECT real (la service_role key está allow-listada en `.claude/settings.local.json`).
2. **SQL ejecutable inmediato** → en bloque de código. **SQL futuro / propuesto** → en bloque de código pero comentado o con label `-- PROPUESTA`.
3. **Dry-run SELECTs antes de cualquier UPDATE en producción.** No negociable.
4. **2-query strategy para joins**: PostgREST no soporta joins arbitrarios. Pattern: SELECT parent IDs primero, después SELECT children con `id=in.(uuid1,uuid2,...)`.
5. **Auth**: usar `Auth.getUser().uid` (no `.id`). Hoy `vendedor_id` está NULL en todas las cotizaciones → el cotizador no está populando uid. Si tocás eso, verificar.
6. **localStorage es para drafts y preferencias UI**, no para datos de negocio. Hay autosave del borrador en localStorage que es válido. Pero items, precios, cotizaciones guardadas siempre van a Supabase.
7. **Único dato obligatorio para exportar = Cliente** (2026-06, premisa del dueño). Proyecto y Evento son **opcionales**: la cotización se asigna a un proyecto (y el proyecto a un evento) más tarde en el CRM de LOBBY, no al cotizar. La validación (`validateForExport`) solo exige Cliente + ítems + (superficie en Stand / ≥1 espacio con ítems en Expo/Alquiler). El PDF omite las filas Proyecto/Evento si están vacías (`exportPDF`: `if (proyecto)` / `if (evento)`); el guardado ya tolera `project_id/event_id` NULL. Labels marcados "(opcional)" (`.label-hint`).

### 🟥 Featureset positivo que NO se rompe
Favorites, Autosave, Templates, Compare, cotizaciones guardadas, número secuencial via API (`/api/cotizaciones/next-number`), Export PDF (jsPDF, tema dark turquesa), Export CSV, autocomplete cliente/proyecto/evento, Mobile FAB+drawer, shortcuts Ctrl+K/?/Esc, help tips, Toast+Confirm propios.

**Nuevos (2026-06) — tampoco romper (estado final consolidado):**
- **Centro tipo receta**: acordeón por rubro colapsable (`_enhanceAccordion`), filas con `+ Agregar` (picker) / renglón con stepper + total + quitar; renglones cargados arriba (CSS `order`). Delegación en `_initItemsDelegation`. **Muestra TODOS los ítems del rubro** (favoritos primero, sin ocultar): ocultar los no-favoritos tras "Ver todos" hacía "desaparecer" ítems al cambiar de espacio en multi → se quitó (`_renderItemGroup`).
- **Parámetros agrupados**: `#general-params` en 3 bloques (identidad+modo / config del stand / fee) separados por `border-top` sutil + aire (reglas sobre `#stand-params-block`/`#expo-params-block`/`.params-row-fee`). **"Tipo de Stand" va a la DERECHA de Superficie/Frente/Profundidad** (clase `.param-inline-standtype` dentro de `.params-row-dimensions`, se estira con flex y ahorra un renglón). Mismos controles, nada escondido (premisa del dueño).
- **Medidor de calor** (`_updateHeat`) en el resumen.
- **Sugerencias fantasma**: se pintan DENTRO de la sección de cada ítem sugerido (`.section-ghosts` por rubro; `_renderGhosts` → `_ruleGhosts` + `_paintGhosts`), agrupadas por la categoría real del sugerido. Reglas de afinidad `_GHOST_AFFINITY` = render instantáneo + **fallback**; si la IA está habilitada refina con `/api/ai/ghosts` (`_maybeAIGhosts`/`_fetchAIGhosts`, debounce 1.1s + cache por firma ítems+modo, badge "IA" + motivo); si la IA cae, queda en reglas. (Antes era una franja única al pie `#global-ghosts`, ya removida.)
- **Texto de la propuesta** (editable): bloque en el centro tras los ítems (`#proposal-block`; `_initProposalBlock`/`generateProposal`/`_buildSanataContext`/`_refreshProposalUI`) con textarea + botón "Generar con IA". Vive en `State.generalParams.proposalText` (persiste en borrador y cotización). El PDF lo usa **tal cual** (entre título y rubros); si queda vacío, autogenera vía `/api/ai/sanata`. **Prompt afinado (2026-06, premisa del dueño)**: texto BREVE (2-4 oraciones, 35-70 palabras), encabezado factual (cliente + proyecto/evento/fechas si están — `_buildSanataContext` ahora manda `proyecto`, `fechas` y `lugar`) y luego **generalidades por rubro SIN cantidades** (los ítems se mandan agrupados por rubro, sin cantidad). Reglas de redacción por rubro: paneles/estructura/infra/modular → "sistema modular OCTEXA"; vinilos/gráfica → "vinilo impreso y colocado"; iluminación → al pasar; pantallas/electrónica → por encima sin tecnicismos. `temperature 0.4` + "NO inventes" para cortar la sanata larga e incorrecta. Botón deshabilitado si la IA está off; el textarea siempre edita.
- **Brief Express** (`brief.js`): modal de 10 preguntas → setea params (disparando los controles reales) + mapea ítems vía `/api/ai/brief`. Botón `#btn-brief`.
- **PDF scale-to-fit** (`exportPDF`): el dibujo vive en `renderDoc(s)` con `G(n)=n*s` que comprime SOLO el flujo del cuerpo (datos→rubros); elige la mayor escala que entra en 1 hoja. `s=1` ⇒ idéntico al PDF anterior. (Detalle en Zonas frágiles.)
- **Nav izquierda colapsable** (`#btn-nav-collapse`, clase `.nav-collapsed`, persistida en localStorage).
- **Marca MEPEX** aplicada (ver Stack › Marca).

### 🟥 Zonas frágiles — no tocar sin avisar
- **Flujo de guardado a Supabase** (`api.js` saveQuotation + `server/index.js` `/api/quotations` POST). Recién arreglado, funciona.
- **Numerador secuencial** (`POST /api/cotizaciones/next-number`) — usa la función SQL atómica `siguiente_numero_cotizacion(anio)` sobre la tabla `cotizacion_numerador` (contador por año). NO hay fallback localStorage: si la API cae, el front bloquea el export. Formato `COT-YYYY-NNNN`. Si cambiás el formato, actualizá la función SQL y el padStart del server.
  - **La función incrementa bien (verificado).** Si ves números REPETIDOS (ej. "todas son la 14"), es **caché del navegador** sirviendo un front viejo (con el fallback localStorage que ya no existe). Por eso el server manda `Cache-Control: no-cache` en HTML/JS/CSS (revalida siempre) — tras desplegar ESE fix, un hard-refresh único limpia el front viejo y no vuelve a pasar.
  - **🟥 Reserva diferida (2026-06)**: el contador es monótono (no se puede "devolver" un número), así que **cancelar un preview NO debe consumir un número**. En modo **preview** `exportPDF` NO reserva: dibuja el PDF con placeholder `COT-AAAA-XXXX` y el número real se pide **recién al click "Descargar y guardar"** (`finalize()` en `script.js`), que reserva, re-renderiza a la misma escala (solo cambia el `Ref:` del footer) y guarda. En **export directo** (sin preview) el click ES la confirmación → reserva arriba como siempre. Guard anti-doble-click en el botón de descarga. Si la API falla al descargar, el modal queda abierto para reintentar (no se quemó nada).
- **🟥 MOTOR DE PROPUESTAS (`/propuesta-api`) — vive SOLO en el VPS.** `~/generador-propuesta` **NO es un repo git** (sin `.git`, sin remote): esa carpeta es la única copia. Editar = `pscp` encima + `.venv/bin/python -m py_compile` + `pm2 restart propuesta-api`. **Backup antes de tocar** (`render.py.bak-AAAAMMDD`). FastAPI + weasyprint; las plantillas HTML están inline en `app/render.py`, no hay carpeta de templates.
  - **Dos caminos de dibujo distintos**: `_provision_stand` (rubros, sin precios) y `_provision_espacios` (por espacio). No son el mismo código — arreglar uno no arregla el otro.
  - ⚠️ **`detalle.espacios` es un campo EXTRA del modelo pydantic** (`Detalle` solo declara `rubros`; pasa gracias a `extra="allow"`). Al no validarse contra `Item`, llega como **dict crudo**: acceder con `it["x"]` tira `KeyError` → 500. Usar siempre `.get()` en esa rama. (Fue exactamente el bug del 2026-08-23.)
  - `POST /render-propuesta` **no persiste nada** (el guardado es una llamada aparte) → se puede sondear con payloads de prueba sin ensuciar. Hay `openapi.json` para leer el contrato sin entrar por SSH.
  - El front manda **siempre** los importes + `nivel_detalle`, y el motor decide cuáles imprimir. Así un front nuevo contra un motor viejo **degrada** (dibuja detallado) en vez de romper.
- **Upload de PDF a Storage** (`POST /api/quotations/:id/pdf`).
- **`pricing.js`** — fuente única de la fórmula. Respetar la REGLA DE CÁLCULO de arriba (ajustes sobre el subtotal, sumados, IVA al final, redondeo por línea).
- **`script.js` `exportPDF`** — el dibujo vive en `renderDoc(s)`; `G(n)=n*s` comprime SOLO el flujo del cuerpo (datos→rubros). Header, footer y la **reserva de la caja de total (`ensureSpace(26)`)** quedan FIJOS. `s=1` debe seguir siendo idéntico al PDF actual (anti-regresión). La sanata IA se pide UNA vez (cacheada) aunque redibuje a varias escalas. El **número** se reserva una sola vez: en export directo arriba, en preview recién al descargar (ver Numerador › Reserva diferida) — `finalize()` re-renderiza a la escala ya elegida, así que solo cambia el `Ref:` del footer.
- **Mapeo `rubro → key`** en `api.js convertToLocalFormat` — no romper el normalizado ni el fallback; NO mover el grouping a `categoria`.
- **Endpoints IA** (`/api/ai/sanata`, `/api/ai/brief`, `/api/ai/ghosts`, `/api/ai/status`) en `server/index.js` — degradan a 503 si falta `ANTHROPIC_API_KEY`; el front los consume defensivamente. `/api/ai/ghosts` valida los ids sugeridos contra el catálogo de candidatos provisto (sin alucinaciones).

## Stack

- Vanilla JS ES6+, SPA.
- Supabase (PostgreSQL + Auth + Storage). URL: `selnevalaeykdrgycvdz.supabase.co`.
- Express backend en `server/index.js` (port 3001 local, `/cotizador-api/api` en prod).
- jsPDF para PDFs (tema dark, turquesa `#00A9C1`).
- **IA**: Claude Haiku 4.5 vía backend (`/api/ai/sanata`, `/api/ai/brief`, `/api/ai/ghosts`, `/api/ai/status`), usando `fetch` nativo (Node 18+) desde `callClaude` (acepta `temperature` opcional). Key `ANTHROPIC_API_KEY` en `server/.env` (+ opcional `ANTHROPIC_MODEL`). Decisión: usar Claude (no OpenAI) por coherencia de stack; a bajo volumen el costo es centavos/mes. ChatGPT Plus/Claude Pro ≠ API.
- **Marca MEPEX (2026-06)**: re-skin con el manual de LOBBY (`LOBBY-MEPEX/docs/MEPEX_BRAND.md`). Tokens en `style.css :root` (nombres viejos, valores nuevos): `--color-primary #00A9C1` (turquesa), `--color-secondary #F28D15`, `--color-bg #050505`, `--color-surface #111111`, `--color-success #00CC88`, texto `#E8E8E8/#888/#555`. Fuentes **Outfit** (UI) + **Space Mono** (montos/labels, `--font-mono`). Radios 4/6/10.
- VPS Hostinger 195.200.1.250 (Ubuntu 24.04). El server corre con **pm2** como `cotizador-api`.
  - **Prod tiene dominio**: `http://195.200.1.250/...` redirige (301) a **`https://app.mepex.com.ar/...`**. Ojo con `curl -L` sobre un POST: al seguir el 301 tira el body y da 422; hay que pegarle al dominio directo.
  - **SSH: usuario `mepex`, NO `root`.** Key `~/.ssh/mepex_key.ppk` (formato PuTTY → `plink`/`pscp`, no el `ssh` de OpenSSH). ⚠️ **Hay fail2ban**: unos pocos intentos fallidos y te DROPea el puerto 22 (síntoma: *timeout*, no "connection refused"; el HTTP sigue andando). Banea **por IP**, así que también deja afuera al dueño. Se destraba desde la consola del navegador de Hostinger con `sudo fail2ban-client set sshd unbanip <IP>`. **No adivinar usuarios.**
  - Deploy completo (frontend + backend): `cd ~/cotizador && git pull origin main && pm2 restart cotizador-api`
  - Solo frontend (HTML/CSS/JS de browser): alcanza con `git pull` + Ctrl+F5. Si tocás `server/`, el `pm2 restart` es obligatorio.
  - Migraciones SQL (`server/migrations/`): se corren a mano en el editor SQL de Supabase (la API REST no hace DDL).
  - La key nueva de Supabase (`sb_secret_…`) está en `server/.env` como `SUPABASE_SERVICE_KEY` (la legacy service_role fue deshabilitada en 2026-04).

## Estructura del repo

```
.
├── index.html              — Single page, 3 columnas. Fuentes Outfit + Space Mono. Carga brief.js
├── style.css               — Monolito CSS. Marca MEPEX en :root + centro receta + acordeón + params agrupados + .section-ghosts + #proposal-block + brief
├── script.js               — Monolito JS (sección Render). Centro receta (muestra todo), acordeón, calor, auto-calc, fantasmas por sección (+IA), texto de propuesta (_initProposalBlock/_buildSanataContext), exportPDF (renderDoc/scale-to-fit)
├── api.js                  — Cliente REST + mapeo rubro→key 7 rubros (convertToLocalFormat; energía ANTES que iluminación) + métodos IA
├── database.js             — Catálogo en memoria + DATABASE.quotationTypes (las 4 ramas) + 7 rubros + DB.isAreaItem/typeLabel + cálculos auto
├── pricing.js              — FUENTE ÚNICA de la fórmula (adjustmentFactor + loadedUnitPrice + compute)
├── brief.js                — Brief Express (10 preguntas → params + items vía IA, preview, aplicar)
├── autocomplete.js         — Inputs autocomplete
├── quotation-storage.js    — Persistencia de cotizaciones guardadas (incluye proposalText en _collectCurrentState)
├── quotation-ui.js         — UI del modal "Cargar cotización" (_restoreState restaura proposalText, salvo en templates)
├── server/
│   ├── index.js                — Backend Express + endpoints IA (/api/ai/sanata|brief|ghosts|status, callClaude)
│   ├── .env.example            — Variables (Supabase + ANTHROPIC_API_KEY)
│   ├── supabase-setup.sql      — Schema (mínimo, NO refleja toda la tabla)
│   └── migrate-notion-to-supabase.js  — LEGACY (eliminar)
├── HANDOFF.md              — Pendientes + decisiones (handoff entre sesiones)
├── .audit/                 — Docs de auditoría (schema_dump.md = dump real de Supabase)
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
