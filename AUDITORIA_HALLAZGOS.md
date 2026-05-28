# AUDITORÍA COTIZADOR-MEPEX — Hallazgos (Fase B)

> Generado: 2026-05-21
> Inputs: `.audit/BRIEF_AUDITORIA.md` + `.audit/01_mapa_arquitectonico.md` + `.audit/schema_dump.md` + lectura completa de `script.js`, `index.html`, `api.js`, `server/index.js`, `database.js`, `quotation-storage.js`, `quotation-ui.js`, `autocomplete.js`, `server/supabase-setup.sql`, dump real de Supabase.
> Convención de severidad: `[ALTA]` bloquea o degrada feature crítica · `[MEDIA]` funcional pero con fricción/bug visible · `[BAJA]` cosmético o mejora marginal.

---

## Resumen ejecutivo

El cotizador funciona como SPA con un feature-set amplio, pero el código está en un **monolito** (`script.js` 3895 líneas, `style.css` 4590 líneas) que ya empezó a divergir de su propia lógica: hay **cuatro implementaciones independientes del pricing** (summary live, PDF, CSV, comparador) que hoy coinciden por accidente — si cambia una sin actualizar las otras, el guardado y el PDF empiezan a diferir del total visible.

Hallazgos críticos que afectan al usuario hoy:

1. **Render de items en PDF es inconsistente entre modos**: Stand muestra `"15 - nombre"` sin unidad ni monto; Expo/Alquiler muestra `"• 15x nombre"` con monto a la derecha. En Stand el rubro Infraestructura **no lista sus items individuales**, sólo dice "Construcción modular con sistema OCTEXA" — un cliente que pidió 5 cenefas no las ve en el PDF. [ALTA]
2. **`min="9"` en superficie**: confirmado, y no es sólo el HTML — `script.js:2754-2761` también clampa a 9 en input y blur. El BRIEF identificó sólo el HTML. [ALTA]
3. **`/api/events` está parcialmente roto**: `server/index.js:105-124` usa nombres de columna viejos (`lugar`, `fecha_desarme`, `prioridad`) que no existen en la tabla actual de Supabase. **Confirmado con query directa**: `"column eventos.lugar does not exist"`. Las 3 cotizaciones existentes en DB tienen `full_state.params.event.venue = ""` (vacío). El frontend en realidad no recibe error porque PostgREST devuelve los demás campos y el `formatEvent` simplemente devuelve null para `venue`. [ALTA]
4. **Catálogo prácticamente sin precios**: de 226 ítems, 218 (96%) tienen `precio_cliente = 0`. Las cotizaciones se guardan con totales artificialmente bajos. NO es bug del cotizador, es estado del catálogo, pero hay que decidir si bloquear export con `precio_cliente=0` o avisarlo. [ALTA → decisión de producto]
5. **Numerador secuencial puede duplicar números** entre API y localStorage [ALTA — nuevo, ver Bloque 6.5]. Los 2 PDFs que Fede recuperó de papelera son `COT-2026-0008` pero la DB tiene solo `0001`, `0002`, `0003`. Cuando la API falla, el código cae a `localStorage` con contador independiente, generando números que después podrían reusarse cuando la API responde.
6. **Modelo de variantes paramétricas YA existe en `catalogo_items`** (columnas `parametrico`, `familia`, `medida_mm`) pero el cotizador no las usa. Se duplican ítems en el catálogo (ej. 10 columnas COC distintas) en vez de tratarlas como variantes. Hay que coordinarse con LOBBY antes de proponer cambios. [MEDIA → bloquea Bloque 7]
7. **El sistema de favoritos perdió su sentido**: 215 de 226 ítems (95%) están `favorito=true` en la DB. La feature "favoritos arriba" no segmenta nada. [MEDIA]

Decisiones clave que requieren input de Fede antes de Fase C/D:

- Qué hacer con `precio_cliente=0` (bloquear, advertir, o ignorar).
- Si las variantes de altura serán JSONB en `catalogo_items` o tabla aparte (recomendación con trade-off en Bloque 7).
- Formato CSV de 3dsMax (Bloque 8).
- Si Templates absorbe los Presets de stand o se hace un módulo aparte (recomendación: absorber, ver Bloque 9).

Complejidad estimada del refactor: **media-alta**. La extracción de los 5 módulos (`render-ui`, `render-pdf`, `render-csv`, `pricing`, `validation`) es mecánica una vez consolidada la fórmula de pricing en un solo lugar. La normalización del schema (`cotizacion_items`) es la pieza más delicada por el matching JSONB→FK (Bloque 6).

---

## 1. Mapa de IFs por modo

Tabla con todos los puntos del código donde el comportamiento se ramifica según `quotationType` o `isMultiSpaceMode()`. Es el activo más importante de la Fase B — sin esto, cualquier refactor rompe cosas.

| # | Archivo:línea | Función / contexto | Stand | Expo | Alquiler | ¿Intencional? | Observación |
|---|---|---|---|---|---|---|---|
| 1 | [script.js:1072-1075](script.js:1072) | `State.isMultiSpaceMode()` | false | true | true | ✅ Intencional | Expo y Alquiler comparten 100% el flag multi-space. |
| 2 | [script.js:1078-1084](script.js:1078) | `State.getCurrentItems()` | `selectedItems` (lista global) | `space.items` (del espacio activo) | idem Expo | ✅ Intencional | Core del modelo. Bien hecho. |
| 3 | [script.js:1336-1435](script.js:1336) | `handleQuotationTypeSwitch` | merge bidireccional con Confirm | idem | idem | ✅ Intencional | Buena UX: al cambiar de modo se preservan items con confirmación si hay conflictos. |
| 4 | [script.js:1442-1452](script.js:1442) | `updateLayoutForType` | show `stand-params-block` | show `expo-params-block` | show `expo-params-block` | ✅ Intencional | Expo y Alquiler comparten DOM block (`#expo-params-block`). |
| 5 | [script.js:2381-2450](script.js:2381) | `updateSummary` — header de params | muestra Superficie + Tipo + Altura | muestra "Tipo: Expo/Alquiler" + cant. espacios | idem Expo | ✅ Intencional | El emoji y label cambia: `🎪 Expo` vs `📦 Alquiler`. |
| 6 | [script.js:2455-2497](script.js:2455) | `updateSummary` — render items | agrupa por categoría globalmente, **no muestra monto por item** | desglosa por espacio, **muestra monto por item** | idem Expo | ⚠️ Inconsistencia visual | Discusión: ¿Stand debería mostrar montos por item también? El PDF tiene el mismo desbalance. |
| 7 | [script.js:2476-2481](script.js:2476) | `updateSummary` — Infraestructura | imprime "Superficie + Altura" en lugar de los ítems individuales | normal | idem Expo | ⚠️ Posiblemente legacy | Comentario en PDF (3496-3498) dice "lógica original". Items de Infraestructura quedan "ocultos" en la UI Stand. |
| 8 | [script.js:2912-2914](script.js:2912) | `resetGeneralParamsUI` | resetea a `quotationType='stand'` | — | — | ✅ Intencional | Al reset siempre arranca en Stand. |
| 9 | [script.js:2947-2966](script.js:2947) | `validateForExport` | metraje >= 1 + items > 0 | spaces > 0 + algún space con items | idem Expo | ✅ Intencional | OK, pero ver bloque 5: faltan validaciones. |
| 10 | [script.js:3073-3083](script.js:3073) | `handleExportCSV` — metadata header | Superficie + Tipo Stand + Altura | "Espacios: N" | idem Expo | ✅ Intencional | El CSV tiene columna "Espacio" que en Stand queda vacía (ver Bloque 3). |
| 11 | [script.js:3377-3391](script.js:3377) | `exportPDF` — datos del proyecto | Superficie + Tipo + Altura | "Espacios: N" | idem Expo | ✅ Intencional | Header PDF. Coherente con CSV y Summary. |
| 12 | [script.js:3452-3520](script.js:3452) | `exportPDF` — render items Stand | agrupa por categoría; **sin precio por item**; en Infraestructura no muestra ítems | — | — | ⚠️ Inconsistente con multi-space | El mismo cliente, distinta cotización, ve formato distinto. |
| 13 | [script.js:3486-3494](script.js:3486) | `exportPDF` — Infraestructura Stand | "Construcción modular con sistema OCTEXA" en vez de ítems | — | — | ⚠️ Hardcodeado | Texto fijo. Si el stand no es modular (pretende serlo siempre, pero…), no aplica. [MEDIA] |
| 14 | [script.js:3525-3616](script.js:3525) | `exportPDF` — render items multi-space | — | desglose por espacio + monto por item + subtotal de espacio | idem Expo | ✅ Intencional | Más rico que Stand. |
| 15 | [script.js:3585-3587](script.js:3585) | `exportPDF` — formato línea de ítem multi-space | — | `"• ${qty}x ${name}"` (sin unidad) | idem Expo | ❌ Bug confirmado | Falta unidad (`m²`, `unidad`, etc.). |
| 16 | [script.js:3504](script.js:3504) | `exportPDF` — formato línea de ítem Stand | `"${qty} - ${name}"` (sin unidad) | — | — | ❌ Bug confirmado | Falta unidad. Formato distinto al multi-space. |
| 17 | [script.js:266-289](quotation-storage.js:266) | `quotation-ui.js _restoreState` | restaura `selectedItems` | restaura `spaces` con sus items | idem Expo | ✅ Intencional | OK al cargar cotización guardada. |
| 18 | [script.js:912-918](script.js:912) | `Compare._summarizeQuotation` | itera `q.items` | itera `q.spaces[].items` (acumula por id) | idem Expo | ⚠️ Pierde contexto | Si un mismo item está en 2 espacios distintos, el comparador los suma como si fuera uno. [BAJA] |
| 19 | [script.js:166-181](quotation-storage.js:166) | `_collectCurrentState._expandItems` | usa `State.selectedItems` | usa `space.items` por espacio | idem Expo | ✅ Intencional | OK. |
| 20 | [server/index.js:687](server/index.js:687) | `typeMap` backend | `'Stand'` | `'Expo'` | `'Alquiler'` | ✅ Intencional | Capitaliza al guardar. Importante: BD guarda capitalizado, front usa minúscula. Cualquier comparación tiene que normalizar. |

### Reglas que en la práctica **NO difieren** entre modos pero el código las trata como si pudieran

- **`heightMultiplier`** se aplica en TODOS los modos en `updateSummary` (línea 2352), `exportPDF` (línea 3437), `Compare` (línea 898), CSV (línea 3096). **Pero la UI para cambiarla está oculta en multi-space** (`stand-params-block` se hide cuando el tipo es Expo/Alquiler). Resultado: en Expo/Alquiler el `heightMultiplier` queda en 1.0 (default) o el último valor de Stand si se cambió de modo. Esto es un bug latente: **en Expo/Alquiler el multiplicador altura efectivamente no aplica porque no se puede cambiar**, pero el código actúa como si pudiera. Confirma la duda del mapa arquitectónico: "Altura aplica en Stand sí; ¿Expo/Alquiler? POR CONFIRMAR" → respuesta: **No aplica porque no hay UI, aunque el código está listo**. [MEDIA]

- **`modifierPercentage`**, **`includeFee`/`feePercentage`** y **`heightMultiplier`** comparten el mismo bloque DOM en `index.html:217-273` que está dentro de `#stand-params-block`. Pero modificador y fee también aplican en multi-space (línea 2433-2446 en updateSummary). **Inconsistencia UI**: Fede y el equipo no pueden cambiar modificador o altura en modo Expo/Alquiler.

  ⚠️ NECESITA CLARIFICACIÓN DE FEDE: ¿el modificador y el fee deberían poder cambiarse en Expo/Alquiler también? El código lo respeta pero la UI no lo expone.

---

## 2. Pricing y altura

### Flujo completo del cálculo del subtotal

1. Usuario toca un item → `State.toggleItem(itemId, quantity)` ([script.js:1087](script.js:1087))
2. `toggleItem` muta `selectedItems` (Stand) o `space.items` (multi) y llama `Render.updateAll()` ([script.js:1117](script.js:1117))
3. `updateAll()` ([script.js:1959](script.js:1959)) → llama `updateSummary()` y `updateNavBadges()`
4. `updateSummary()` ([script.js:2302](script.js:2302)) calcula totales y actualiza el DOM (`#subtotal-display`, `#tax-display`, `#total-display`)
5. MutationObserver ([script.js:1326-1332](script.js:1326)) sincroniza el `#fab-total` con el total real
6. `Autosave.schedule()` ([script.js:2005](script.js:2005)) persiste el draft en localStorage

### Fórmula canónica de pricing

Confirmada en `updateSummary`, replicada en otras 3 funciones (ver más abajo). Por cada item:

```
lineBase     = item.price × quantity
lineAltura   = lineBase × heightMultiplier   si item.category ∈ ['infrastructure', 'lighting']
             = lineBase                       en otra categoría
lineModFee   = lineAltura × (1 + modifierPct/100) × (1 + feePct si fee enabled, sino × 1)
subtotal     = sum(lineModFee)
iva          = subtotal × 0.21
total        = subtotal + iva
```

Por commutativity matemática, el orden de multiplicaciones no afecta el resultado. Pero el código documenta órdenes distintos en distintos lugares — confunde al lector y abre la puerta a errores de refactor.

### Las CUATRO implementaciones del pricing — [ALTA]

| # | Archivo:línea | Contexto | Forma de cálculo |
|---|---|---|---|
| A | [script.js:2348-2375](script.js:2348) | `Render.updateSummary` (display live) | Acumula `subBase`, `subConAltura`, `subConModifier`, `subConFee`. Mantiene también un `byCategory[]` para el desglose visual. |
| B | [script.js:3431-3447](script.js:3431) | `Render.exportPDF.getLoadedPrice` (PDF) | `loaded = price × modMult × (heightMult si aplica) × (feeMult si aplica)`. Multiplica por `quantity` después. |
| C | [script.js:3094-3112](script.js:3094) | `Render.handleExportCSV.pushItem` (CSV) | `loadedUnit = base × h × modMult × feeMult`. Multiplica por `quantity` para `subtotal`. |
| D | [script.js:890-910](script.js:890) | `Compare._summarizeQuotation` (comparador) | `loaded = base × h × modMult × feeMult`. Para 2 cotizaciones guardadas. **Recalcula con precios ACTUALES del DATABASE**, no los del snapshot — eso es feature, no bug. |

**Por qué importa**: si en el refactor se modifica la fórmula (ej. nuevos modificadores, descuentos por volumen, lógica de variantes), hay que tocar 4 lugares. Hoy "coinciden" porque alguien las mantiene sincronizadas a mano. Cualquier divergencia produce que el total visible en pantalla ≠ total en el PDF ≠ total en el CSV ≠ total guardado en Supabase.

**Propuesta**: extraer a `pricing.js` con UNA función `computeQuotation(state, catalog) → { items: [{id, qty, unit, lineBase, lineLoaded}], subtotal, tax, total, byCategory, aporteAltura, aporteModifier, aporteFee }`. Las 4 funciones la consumen y se quedan solo con el render.

### Modificador y Fee — orden y rango

- Modificador: `min=-50`, `max=100`, paso 5 ([index.html:268](index.html:268)). JS clampa en `setupGeneralParams` ([script.js:2814-2828](script.js:2814)). Range coherente.
- Fee: `min=0`, `max=100`, paso 1 ([index.html:310](index.html:310)). JS clampa ([script.js:2842-2851](script.js:2842)).
- Fee default: **10%** (`feePercentage: 0.10` en State.reset y init).
- Orden de aplicación: altura (por categoría) → modificador (global) → fee (global). Matemáticamente equivalente al orden documentado en getLoadedPrice porque es todo multiplicativo.

### Acoplamientos riesgosos detectados

- **`_parseCurrencyFromDOM`** ([quotation-storage.js:161-164](quotation-storage.js:161)): lee `#subtotal-display`, `#tax-display`, `#total-display` con regex `[^\d]` para extraer enteros. Si en el futuro alguien cambia el formato del display (ej. agrega decimales o cambia el símbolo de moneda), los totales guardados se rompen silenciosamente. [MEDIA] **Fix recomendado**: el módulo `pricing.js` devuelve totales numéricos directos; `_collectCurrentState` los toma de ahí, no del DOM.

- **`Math.round` en summary** ([script.js:2626-2628](script.js:2626)): el total visible está redondeado, pero el cálculo interno usa floats. El total guardado en Supabase es lo que se muestra en el DOM (redondeado), no el float. Pequeña pérdida de precisión que no afecta hoy pero podría confundir auditorías. [BAJA]

---

## 3. Export PDF y CSV — formato y unidades

### Bug de unidades en PDF — confirmado [ALTA]

| Modo | Archivo:línea | Renderiza | Resultado actual | Debería decir |
|---|---|---|---|---|
| Stand | [script.js:3504](script.js:3504) | `${item.quantity} - ${item.name}` | `15 - Vinilo impreso y colocado` | `15 m² — Vinilo impreso y colocado` o `15× Vinilo impreso y colocado (m²)` |
| Expo / Alquiler | [script.js:3585-3587](script.js:3585) | `• ${item.quantity}x ${item.name}` | `• 15x Vinilo impreso y colocado` | `• 15 m² — Vinilo impreso y colocado` |

Además del bug, los **formatos son visualmente distintos entre modos**: con guion y sin viñeta en Stand, con viñeta y "x" en multi-space.

### Evidencia visual confirmada — PDFs reales de Expo y Alquiler

Fede recuperó de papelera 2 PDFs reales:

**COT-2026-0008 — Fenix Entertainment (EXPO)** — 1 espacio "ESPACIO 1" (nombre default), 8 items:
```
ESPACIO 1
PISOS
  • 500x Alfombra nueva con nylon              $0
INFRAESTRUCTURA
  • 2x backlight h=1,20                         $0
  • 2x Cenefón (H/5,00) h= 1,20 por ML          $0
ILUMINACIÓN
  • 2x ficha steck 16/32 con chicote            $0
  • 100x kw instalado                           $0
  • 20x Reflector LED 100w                      $0
EQUIPAMIENTO
  • 12x Taburete JB                             $0
Subtotal Espacio 1                              $0
```

**COT-2026-0008 — Xunta de Galicia (ALQUILER)** — 1 espacio "SALÓN PRINCIPAL" (renombrado), 10 items, algunos con cantidad 1 sin prefijo `Nx`:
```
SALÓN PRINCIPAL
PISOS
  • 18x Tarima h= 30 cm.                        $0
ILUMINACIÓN
  • Tablero seccional monofásico                $0   ← sin "1x" porque qty=1
  • 2x Reflector LED 100w                       $0
  • toma 20A                                    $0   ← sin "1x"
EQUIPAMIENTO
  • Cesto Papelero                              $0   ← sin "1x"
  ...
```

Confirmaciones a partir de los PDFs reales:

1. **Formato EXPO == ALQUILER**. Único diferenciador visible: el badge superior derecho (`EXPO` vs `ALQUILER`). El render del cuerpo es idéntico. Coherente con el código `isMultiSpaceMode()`.
2. **`item.quantity === 1` se renderiza SIN `1x`** ([script.js:3585-3587](script.js:3585) — el ternario `quantity > 1 ? \`\${qty}x \${name}\` : \`\${name}\``). Es decisión estética. Confirmado en el sample Xunta.
3. **TODOS los montos son `$0`** en ambos PDFs. Refuerza el hallazgo crítico del catálogo: 218/226 items sin precio cargado. Un PDF con todo `$0` enviado a un cliente real es muy delicado.
4. **El `venue` SÍ aparece en estos PDFs** ("Estadio Velez Sarsfield", "Club Español - CABA") aunque en las 3 cotizaciones que YA están en DB el `full_state.params.event.venue` está vacío (`""`). Lo más probable: estos 2 PDFs se generaron en sesiones donde el venue se cargó por otro camino (proyecto seleccionado con relación a evento, o tipeado a mano), pero el bug `/api/events` impide que el venue venga al hacer **autocomplete directo de evento**.
5. **Nombre de espacio personalizable**: "SALÓN PRINCIPAL" vs "ESPACIO 1" confirma que el input `space-name-input` ([script.js:1541-1546](script.js:1541)) funciona y persiste al PDF.

### Bug adicional: Stand no muestra monto por ítem, Expo/Alquiler sí [MEDIA]

- Stand PDF ([script.js:3502-3506](script.js:3502)): `doc.text(\`${quantity} - ${name}\`, ...)`. **Solo el nombre. Sin monto, sin unidad.**
- Multi-space PDF ([script.js:3588-3592](script.js:3588)): `doc.text(itemText, …)` + `doc.text("$${itemTotal}", …, align: 'right')`. **Monto a la derecha.**

Si un cliente del modo Stand quiere ver cuánto cuesta cada línea, no puede.

### Bug adicional: Stand "esconde" los items de Infraestructura [MEDIA]

[script.js:3486-3494](script.js:3486): cuando la categoría es `infrastructure`, el PDF imprime sólo:

```
Superficie: 36m² — Altura: Máxima (5,00m)
Construcción modular con sistema OCTEXA
```

Y omite la lista de cenefas, columnas, paneles, etc. — aunque sumen $X miles al total. El comentario del código (3496-3498) admite que es "lógica original", pero el bloque `groupedItems[cat.id].forEach(item => {...})` que viene después de eso (línea 3509-3512) **sí suma los precios** al `catTotal`. Resultado: el cliente paga por items que el PDF no enumera.

**Recomendación**: o se listan los items (consistente con multi-space), o se reemplaza por un desglose tipo "Sistema OCTEXA: $XXX.XXX" para que al menos el monto del rubro Infraestructura aparezca. Sin esto, el PDF es engañoso.

### Propuesta de formato unificado entre modos

```
[STAND]
─────────
INFRAESTRUCTURA
  • 36 m²  Superficie del stand (Altura Máxima 5,00m)
  • 2 unidad  Cenefón (H/3,40) h= 0,90 por ML       $9.876
  • 1 unidad  Cenefa (H/2,50) h= 0,30 por ML        $2.345
  ─────────────────────────────────────  Subtotal $12.221

ILUMINACIÓN
  • 3 unidad  Spot LED premier                      $4.500
  ...

[EXPO/ALQUILER]
─────────
ESPACIO 1 — 36 m²

INFRAESTRUCTURA
  • 36 m²  Alfombra nueva con nylon                 $248.400
  ...
```

Trade-offs:
- **Pro de unificar**: experiencia consistente, menos sorpresa, código simétrico (la diferencia entre modos pasa a ser sólo el "envoltorio" por espacio).
- **Contra**: si Infraestructura tiene 30 items, el PDF Stand se duplica en páginas. Hay clientes que prefieren "Construcción modular OCTEXA" como una sola línea.

⚠️ NECESITA CLARIFICACIÓN DE FEDE: ¿enumera siempre, o agrupa por rubro cuando son >N items?

### Otros aspectos del PDF

- **Cliente, proyecto, evento, fecha de evento, lugar, fecha de emisión, número de cotización**: todos presentes ([script.js:3326-3391](script.js:3326)). Bien.
- **Aporte de altura, modificador, fee**: NO aparecen en el PDF. Una nota explícita en summary dice "Los ajustes están incluidos en los precios" ([script.js:2562](script.js:2562)). Decisión consciente.
- **Número de cotización**: la lógica API-first + localStorage fallback funciona ([script.js:3187-3204](script.js:3187)). El próximo es `COT-2026-0004` (verificado vía API).
- **Tipografía**: Helvetica del jsPDF. Es la default, no se carga la familia Barlow/Cabin del HTML.
- **Footer**: WhatsApp, web, dirección. Bien.
- **Cyan/orange branding**: respetado. Cyan `#00B4D5` (PDF) vs `#00E5FF` (UI). ⚠️ **Mismatch deliberado de cyan**: el PDF usa un cyan distinto al de la UI. Buscado o accidente? Comentario en CSS (`var(--color-primary): #00E5FF; /* MEPEX Cyan - PDF match */`) sugiere que se intentaba matchear pero terminó descalibrado. [BAJA]

### Mejoras de jerarquía visual del PDF (sin rediseño total)

1. [MEDIA] El bloque "DATOS DEL PROYECTO" tiene padding inconsistente (línea 3346: `boxHeight = 10 + (dataRows * 6) + 4`). En cotizaciones con mucho contenido, se ve apretado. Sugerencia: pasar a layout más fluido (calcular alto dinámico, dejar respiración).
2. [BAJA] El subtítulo letter-spaced (`M E P E X`, `M O N T A J E   Y   E Q U I P A M I E N T O…`) usa textWidth fijo y puede salirse en pantallas chicas si el ancho del PDF cambia — hoy no, pero si se hiciera responsive…
3. [BAJA] El badge "STAND/EXPO/ALQUILER" ([script.js:3296-3304](script.js:3296)) usa `cyanColor` y `white` — funciona, pero si Alquiler quisiera diferenciarse visualmente (otro color para destacar que es renta, no diseño), hoy no se puede sin tocar la fórmula del badge.

### CSV — análisis

[script.js:3043-3170](script.js:3043). Hallazgos:

| Aspecto | Estado |
|---|---|
| Encoding | UTF-8 con BOM (`﻿`) — Excel lo abre bien. ✅ |
| Separador | `,` con escape RFC 4180. ✅ |
| Salto de línea | `\r\n`. ✅ Windows-friendly. |
| Bloque metadata | Header con Cliente/Proyecto/Evento/Tipo/Superficie/StandType/Altura/Modificador/Fee/Fecha. ✅ |
| Columnas de items | `Espacio | Categoría | Código | Item | Unidad | Cantidad | Precio Base | Precio c/ajustes | Subtotal` ✅ |
| Unidad presente | ✅ (cosa que el PDF no hace) |
| Código presente | ✅ |
| Precio base vs ajustado | ✅ separados (excelente para auditorías) |
| Subtotal por línea | ✅ |
| Totales al final | Subtotal/IVA/Total en las últimas 3 filas. ✅ |
| Modo Stand | columna "Espacio" queda vacía. ⚠️ [BAJA] mejora: poner `Stand` o `Stand único` para que el CSV no tenga columnas vacías. |
| ¿Reimportable? | ❌ No. La estructura no soporta round-trip. Ver más abajo. |

**¿Sirve para reimportar?** No de manera directa. El bloque de metadata mezclado con la tabla de items hace difícil parsearlo programáticamente. Si en el futuro queremos importador CSV (Bloque 8), va a tener que ser un formato distinto. Pero el CSV actual está OK como reporte Excel humano.

---

## 4. UI/UX

### Cards del catálogo

[script.js:1761-1827](script.js:1761) — `createItemCard`.

| Hallazgo | Severidad | Propuesta |
|---|---|---|
| Card tiene `name`, `description`, `price`, `unit`, botón favorito, controles cantidad/checkbox | — | Tamaño OK pero la `description` (vacío en la mayoría de items según dump) ocupa una línea fantasma. |
| Falta el **código del item** en la card | [BAJA] | En el admin sí está. Útil para que el usuario sepa que está agregando "DLL-100" cuando hay 10 dinteles distintos. |
| Falta indicador visual de **categoría** dentro de la card | [BAJA] | Sólo está en el header de la sección. Si el usuario filtra y ve un item suelto, no sabe a qué rubro pertenece. |
| `item.unit` con valor `null` se renderiza como `/ null` o `/ undefined` cuando la unidad no está poblada en la DB | [MEDIA] | api.js convierte null a `'unidad'` (línea 260), pero hay items donde queda inconsistente (`'Unidad'` capitalizado vs `'unidad'`). Normalizar a un solo formato visible. |
| Card tiene **price prominente** pero el catálogo tiene 96% precio=0 | [MEDIA] | Visualmente todos los items dicen `$0 / unidad`. Confunde al usuario y al PDF resultante. Sugerencia: si `price === 0`, mostrar `—` o tag "a confirmar" en lugar del `$0`. |
| **No hay vista tabla** | [MEDIA] | Solo cards. Para una sesión rápida (cargar 30 items en cotización compleja), una vista tabla sería mucho más eficiente. El admin panel TIENE tabla, pero es read-only. |

### Filtros, búsqueda, favoritos

[script.js:2049-2287](script.js:2049) — search y favorites.

| Hallazgo | Severidad | Propuesta |
|---|---|---|
| Búsqueda funciona bien (normalizada, sin acentos, multi-token AND) | ✅ | — |
| `Ctrl+K` / `/` para focus, `Esc` para limpiar | ✅ | — |
| Filtro de favoritos: el sistema "favoritos primero, resto colapsado" tiene sentido… | — | … excepto que **215 de 226 son favoritos**. El collapse no esconde nada. [ALTA → más bien decisión de catálogo] |
| **No hay filtros adicionales** (por rubro, por unidad, por código de familia) | [MEDIA] | El nav de la izquierda permite scroll-spy a categoría pero no oculta. En un catálogo de 226 items, filtros chips arriba ayudarían. |
| **No hay un toggle "solo cargados"** | [BAJA] | Cuando ya tenés 40 items cargados, repasar el catálogo es lento. Un toggle "mostrar solo seleccionados" en el header ayudaría. |
| El botón "Ver todos los items de X (+N más)" funciona pero rompe el scroll-spy: al expandir, la sección crece y el scroll-spy puede saltar | [BAJA] | Recalcular `_rescanScrollSpy` después del expand. |
| **Falta favoritos persistentes del usuario propio**: ya existe el sistema (`Favorites` overlay localStorage), pero como TODO el catálogo viene con `favorito=true` de DB, el toggle local nunca tiene efecto distintivo | [MEDIA] | Si en la DB se va a depurar el flag `favorito` (volverlo selectivo), todo este sistema cobra sentido. Si no, eliminar el sistema y dejar el flag de DB como único. Decisión de Fede. |

### Bucket (cotizaciones guardadas)

[quotation-ui.js](quotation-ui.js) — modal completo de cargar/listar/duplicar/borrar.

| Hallazgo | Severidad | Propuesta |
|---|---|---|
| Modal muestra: número, tipo (badge), cliente, evento, fecha | ✅ | — |
| Acciones: Ver PDF, Cargar, Duplicar, Usar como base (template), Eliminar | ✅ | — |
| Botones repetidos sin agrupar | [BAJA] | 4 botones de acción + 1 destructivo, en línea, en pantallas chicas se aprieta. Usar dropdown "…" para acciones secundarias. |
| **No muestra el total** de la cotización en el row | [MEDIA] | Saber que la cotización de Pepe es $850k vs $1.2M sin abrir el PDF agiliza decisiones. |
| **No muestra el estado** (`borrador`, `aprobada`, `rechazada`) — está en la DB pero la UI lo ignora | [MEDIA] | Importante para distinguir borradores de aprobadas. |
| **No hay filtros** (por cliente, por evento, por tipo, por fecha) | [MEDIA] | Cuando haya 200 cotizaciones, scrollear la lista no escala. |
| **No hay búsqueda libre** | [MEDIA] | — |
| Ordenamiento fijo por fecha desc | ✅ | OK por default, pero sería mejor configurable. |
| `pdfUrl` se usa para abrir en nueva pestaña ✅ | — | — |
| El uso de `q.id` (UUID de Supabase) como dataset attr es OK, pero hay backward-compat con localStorage UUID | ✅ | OK. |

### Templates

[script.js:373-643](script.js:373) — sistema completo.

| Hallazgo | Severidad | Propuesta |
|---|---|---|
| Templates viven en localStorage únicamente | ⚠️ | Si el usuario cambia de browser/PC, pierde sus templates. En Fase D considerar moverlos a Supabase con `vendedor_id` (pero requiere auth real). [MEDIA] |
| Snapshotea params + items, excluye cliente/proyecto/evento/fecha | ✅ | Lógica correcta. |
| Modal con lista, save inline, apply, delete | ✅ | UX bien resuelto. |
| `_describeSnapshot` muestra preview (tipo + metraje + items) | ✅ | Útil. |
| **No hay categorización ni tags** | [BAJA] | Si Fede tiene 30 templates, va a querer agruparlos por tipo de evento (cosmética / educación / institucional…). |
| Compare _resetState al apply preserva cliente, fecha, etc. — confirmado | ✅ | — |

### Compare

[script.js:651-967](script.js:651) — comparador side-by-side.

| Hallazgo | Severidad | Propuesta |
|---|---|---|
| Compara 2 cotizaciones lado a lado | ✅ | — |
| **Recalcula con precios actuales** del catálogo (no usa el total guardado) | ✅ | Decisión correcta — pero hay que avisarlo al usuario (hoy no se avisa). |
| Diff de items: solo en A, solo en B, cantidad distinta | ✅ | — |
| Muestra delta % en el total | ✅ | — |
| **Pierde contexto de espacios** en multi-space: si un item está en 2 espacios, los suma | [BAJA] | Aceptable porque la fórmula matemática del total no cambia. Pero el conteo "cantidad distinta" puede confundir. |
| **No exporta el comparativo a PDF/CSV** | [BAJA] | Para enviar a un cliente "esta es la opción A, esta es la B", ayudaría. |
| `_summarizeQuotation` tiene SU PROPIA implementación del pricing (es la #D del listado del Bloque 2) | [MEDIA] | Se resuelve unificando en `pricing.js`. |

### Admin panel

[script.js:2634-2729](script.js:2634).

| Hallazgo | Severidad | Propuesta |
|---|---|---|
| Solo permite **VER** items por categoría, en una tabla | — | Es un "viewer", no un "admin". |
| Tabs de categorías | ✅ | OK. |
| Columnas: Categoría, Código, Item, Descripción, Importe, Unidad | ✅ | Útil. |
| **No edita** (a pesar de que `api.js:updateItem` y `server/index.js PUT /api/catalog/:id` existen) | [BAJA / decisión de scope] | Confusing UX: el botón se llama "🔧 Configuración" pero solo se puede mirar. Si la intención es "el catálogo se administra en LOBBY, esto es solo vista", entonces el botón debería llamarse "📚 Catálogo" o similar. |
| **No filtra** (por código, por nombre, por unidad) | [MEDIA] | Con 226 items en una tabla scrolleable, encontrar uno específico requiere Ctrl+F del browser. |
| **No muestra `precio_cliente=0`** distinto al precio cargado | [MEDIA] | Como 96% de items tienen $0, el panel parece todo precio 0. Un highlight visual ayudaría a detectar qué falta cargar. |

### Mobile (FAB + drawer)

[script.js:1253-1333](script.js:1253) + CSS líneas 3796-3941.

| Hallazgo | Severidad | Propuesta |
|---|---|---|
| FAB total + drawer nav en <1024px | ✅ | — |
| Cierre con Esc, overlay tap, resize a desktop | ✅ | — |
| `MutationObserver` sincroniza FAB total con #total-display | ✅ | Ingenioso. |
| `drawer-locked` en `<body>` bloquea scroll del fondo | ✅ | — |
| **El badge `STAND/EXPO/ALQUILER` no se ve en mobile** porque está dentro de un wrapper que se oculta o se sobrepone con el FAB | ⚠️ [BAJA] | Verificar en device real. |
| El **autocomplete dropdown** en mobile aparece pegado al input pero no se ve completo (los detalles `📄 razón social`, `🆔 cuit`, `📧 email` se cortan) | [BAJA] | CSS responsive del dropdown. |
| **Atajos teclado en mobile**: el cheatsheet `?` no aplica (no hay teclado). El botón `?` igual se muestra | [BAJA] | Esconder en touch devices. |

---

## 5. Validaciones existentes y faltantes

### Existentes (`validateForExport`, [script.js:2920-2970](script.js:2920))

| Modo | Valida | Acción si falta |
|---|---|---|
| Todos | Cliente (input texto vacío) | input-error class + Toast + scroll to field |
| Todos | Proyecto | idem |
| Todos | Evento | idem |
| Stand | `metraje >= 1` | idem |
| Stand | Al menos 1 item | idem |
| Multi | Al menos 1 espacio | idem |
| Multi | Al menos 1 espacio con item | idem |

Buena UX: focus, scroll, mensaje específico por campo.

### Faltantes [MEDIA cada una salvo aclaración]

| Validación faltante | Modo | Riesgo |
|---|---|---|
| Frente y Profundidad coherentes con metraje (`frente × profundidad ≈ metraje`) | Stand | El PDF se exporta con valores inconsistentes ("36m² stand de 2×3"). |
| Frente ≤ profundidad para tipos `peninsula`/`isla` (que tienen más lados abiertos) | Stand | Tema de plausibilidad, no rompe nada. [BAJA] |
| Si `standType = isla`, `closedSides=0` → no calcula perímetro de paneles, pero el ítem de panel podría seguir agregándose manualmente con cantidad fija (OK). Hay que validar que `autoCalculate` no devuelva 0 sin avisar. | Stand | Confunde si el usuario espera autocálculo. [BAJA] |
| `superficie por espacio` no se valida en Expo/Alquiler. Se puede dejar en blanco o en 0. | Multi | Genera PDF con `"undefined m²"` o `"0m²"`. [MEDIA] |
| `nombre de espacio` no se valida (puede ser string vacío) | Multi | PDF muestra header vacío. [BAJA] |
| `modifierPercentage` fuera de rango: el HTML/JS clampa a [-50, 100], pero `validateForExport` no revalida. Si el usuario hackea el DOM o se carga un draft con valor inválido (del localStorage), pasa. | Todos | Defense in depth. [BAJA] |
| `feePercentage` fuera de rango [0, 100]: idem | Todos | [BAJA] |
| `precio_cliente = 0` en algún item de la cotización: NO se valida | Todos | El cliente recibe PDF con total irrealmente bajo. **Esto es el hallazgo crítico del Resumen Ejecutivo.** [ALTA → decisión de producto] |
| **Cliente / proyecto / evento sin `id`** (texto libre, no seleccionado del dropdown): se permite, y al guardar `clientId = null`, etc. El backend acepta `cliente_id: null` | Todos | La cotización queda huérfana, sin link al CRM. Hoy es válido (a propósito según el comportamiento del autosave). Pero conviene **avisar** ("estás guardando una cotización sin link al CRM, ¿estás seguro?"). [MEDIA] |

### Bug `min="9"` — detalle completo

- HTML: `<input id="input-metraje" min="9" max="500">` ([index.html:131](index.html:131)).
- JS input handler: `parseInt() || 9; Math.max(9, Math.min(500, …))` ([script.js:2754-2755](script.js:2754)).
- JS blur handler: idem ([script.js:2759-2761](script.js:2759)).
- JS validateForExport: `metraje >= 1` ([script.js:2949](script.js:2949)). **Aquí sí acepta < 9.**
- `database.js calculateAutoQuantity`: usa `Math.sqrt(metraje)` y `Math.ceil(...)`. Para metraje=1 da resultados sensatos (perímetro 4, paneles según closedSides). No hay división por cero.

**Fix mínimo** (anotado para Fase C, NO ejecutar ahora):
1. `index.html:131`: `min="9"` → `min="1"`.
2. `script.js:2754-2755`: `|| 9` → `|| 1`; `Math.max(9, ...)` → `Math.max(1, ...)`.
3. `script.js:2759-2761`: idem.
4. Verificar con cotización de 1m² que `calculateAutoQuantity` no devuelve 0 inesperado para item con `calcFormula="perimeter"` y `closedSides=0` (caso isla). Si devuelve 0, el item se "agrega con cantidad 0" — debería ofrecer al usuario cantidad mínima 1.

---

## 6. Schema Supabase y persistencia

Ver `.audit/schema_dump.md` para el dump completo. Resumen de hallazgos:

### Endpoints del backend (`server/index.js`)

| Path | Método | Tabla | Estado |
|---|---|---|---|
| `/api/health` | GET | catalogo_items (count) | ✅ |
| `/api/catalog` | GET | catalogo_items | ✅ pero **NO filtra por `es_cotizable`** ni `_deleted` |
| `/api/catalog/schema` | GET | catalogo_items | ✅ |
| `/api/catalog/category/:c` | GET | catalogo_items | ✅ pero el match es por `categoria` no `rubro` — confuso |
| `/api/catalog/:id` | PUT | catalogo_items | ✅ pero el front no lo usa |
| `/api/catalog` | POST | catalogo_items | ✅ pero el front no lo usa |
| `/api/clients` | GET | clientes | ✅ |
| `/api/clients/search?q=` | GET | clientes | ✅ |
| `/api/projects` | GET | proyectos | ✅ |
| `/api/projects/search?q=` | GET | proyectos | ✅ |
| `/api/projects/:id` | GET | proyectos + clientes + eventos (2-query) | ✅ |
| `/api/events` | GET | eventos | ⚠️ usa nombres viejos (`lugar`, `fecha_desarme`, `prioridad`) — **ROTO** |
| `/api/events/search?q=` | GET | eventos | ⚠️ idem |
| `/api/cotizaciones/next-number` | GET | cotizaciones | ✅ regex match `COT-YYYY-NNNN` |
| `/api/quotations` | GET | cotizaciones (sin full_state) | ✅ |
| `/api/quotations/:id` | GET | cotizaciones (con full_state) | ✅ |
| `/api/quotations` | POST | cotizaciones | ✅ |
| `/api/quotations/:id` | PUT | cotizaciones | ✅ pero el front no lo usa (siempre POST nuevas) |
| `/api/quotations/:id/pdf` | POST (multipart) | storage `cotizaciones-pdf` + update cotizaciones.pdf_url | ✅ |
| `/api/quotations/:id` | DELETE | cotizaciones + storage cleanup | ✅ |

### Bug crítico `/api/events` — [ALTA] confirmado con query directa

`server/index.js:105-124` `formatEvent` asume columnas que **NO EXISTEN en la tabla actual**. Verificado con query a Supabase REST:

```bash
curl ".../rest/v1/eventos?select=id,nombre,lugar,predio,venue&limit=3"
# → {"code":"42703","message":"column eventos.lugar does not exist"}
```

Columnas que el server pide vs lo que la tabla tiene:
- `lugar` → ahora es `predio` ❌
- `fecha_desarme` → ahora es `fecha_desarme_inicio` y `fecha_desarme_fin` ❌
- `prioridad` → no aparece en la DB ❌
- `estado` → no aparece en la DB ❌

PostgREST con `select=*` NO devuelve error por columnas inexistentes (silenciosamente las ignora). Por eso el endpoint "funciona" pero devuelve `venue=null`, `teardownDate=null`, `priority=null`. **Probablemente este bug se introdujo en el rename de `eventos_2026` → `eventos`** (commit `3b9bf40`).

Confirmación adicional: las 3 cotizaciones en DB (`COT-2026-0001`, `0002`, `0003`) tienen `full_state.params.event.venue = ""` (string vacío). Los PDFs de Fenix/Xunta que SÍ muestran venue se generaron por un camino alternativo (selección de proyecto que arrastró evento completo, o entrada manual).

**Fix mínimo** (Fase C):
```javascript
// server/index.js:formatEvent
return {
    id: row.id,
    name: row.nombre || '',
    setupDate: row.fecha_armado_inicio || null,
    teardownDate: row.fecha_desarme_inicio || null,  // ← cambio
    eventStartDate: row.fecha_evento_inicio || null,
    eventEndDate: row.fecha_evento_fin || null,
    venue: row.predio || null,  // ← cambio
    // priority y status: si la columna no existe, dejarlos en null o eliminarlos del shape
    ...
};
```

### Mismatch frontend ↔ DB observados

| Concepto | Front asume | DB tiene | Impacto |
|---|---|---|---|
| `tipoCotizacion` minúscula (`stand`) | front `stand` | DB `Stand` capitalizado | Hay `typeMap` en backend que normaliza. Funciona. ✅ |
| `standType` minúscula (`isla`) | front `isla` | DB `Isla` | Idem ✅ |
| `height.label` (`Estándar`) | front `Estándar` | DB `Estándar` | ✅ |
| `items[].id` | front `item_alf__003` (slug) | DB `catalogo_items.id` (int) | ❌ No matchea. JSONB queda con slug del front, sin FK al catálogo. **Crítico para normalización.** |
| `unit` en el item del full_state | front `"m²"` o `"unidad"` | DB `"m2"`, `"Unidad"`, NULL | api.js convierte vía `convertUnit`. Funciona pero pierde info (m2 vs m²). |
| Cliente `name` | front `name` | DB `nombre_empresa` | mapeado en `formatClient`. ✅ |

### Proposal de normalización: `cotizacion_items`

**Decisión ya tomada** (BRIEF §3 sección 4): el `full_state JSONB` impide queries útiles. Hay que tener una tabla `cotizacion_items` normalizada que permita: "ítem más cotizado", "rubro más vendido", "evolución del precio promedio por unidad".

**Tabla propuesta**:

```sql
-- PROPUESTA — NO EJECUTAR
CREATE TABLE cotizacion_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cotizacion_id   uuid NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
    espacio_id      uuid REFERENCES cotizacion_espacios(id) ON DELETE CASCADE,  -- NULL en modo Stand
    catalogo_item_id integer REFERENCES catalogo_items(id),  -- puede ser NULL si el item se "perdió" del catálogo
    -- snapshot para que la cotización no se modifique si cambia el catálogo:
    nombre          text NOT NULL,
    codigo          text,
    unidad          text,
    rubro           text,
    categoria       text,
    -- pricing al momento de guardar:
    precio_unitario_base    numeric(12,2) NOT NULL,
    precio_unitario_ajustado numeric(12,2) NOT NULL,  -- post altura/mod/fee
    cantidad        numeric(10,2) NOT NULL,
    subtotal_linea  numeric(14,2) NOT NULL,
    -- metadata:
    height_multiplier_aplicado  numeric(4,2) NOT NULL DEFAULT 1.0,  -- 1.0 si la categoría no se vio afectada
    modifier_pct_aplicado       numeric(5,2) NOT NULL DEFAULT 0,
    fee_pct_aplicado            numeric(5,2) NOT NULL DEFAULT 0,
    posicion        integer,  -- orden en la cotización
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_cotizacion_items_cot ON cotizacion_items(cotizacion_id);
CREATE INDEX idx_cotizacion_items_catalogo ON cotizacion_items(catalogo_item_id);
CREATE INDEX idx_cotizacion_items_rubro ON cotizacion_items(rubro);

-- Para Expo/Alquiler:
CREATE TABLE cotizacion_espacios (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cotizacion_id   uuid NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
    nombre          text NOT NULL,
    superficie      numeric(8,2),
    posicion        integer,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_cotizacion_espacios_cot ON cotizacion_espacios(cotizacion_id);
```

**Por qué snapshot de `nombre`, `precio`, `unidad`**: si en LOBBY editan el catálogo (cambian precio de "Alfombra nueva"), las cotizaciones VIEJAS no deben cambiar de monto. La cotización es un documento legal, no un cálculo dinámico. El comparador (Compare.js) hoy recalcula con precios actuales pero la cotización guardada debe ser inmutable.

**Por qué `catalogo_item_id` puede ser NULL**: si el catálogo borra un ítem (lo marca `_deleted=true`), la cotización vieja sigue existiendo. Mejor mantener referencia floja con snapshot por si la FK falla.

**Trade-offs**:
- `[+]` Queries reales: `SELECT rubro, COUNT(*), SUM(subtotal_linea) FROM cotizacion_items GROUP BY rubro`. Imposible hoy con JSONB sin función custom.
- `[+]` Reportes y dashboards de LOBBY pueden cruzar con catálogo y eventos.
- `[+]` Mantenibilidad: los campos snapshot dejan trazas claras de qué precio se usó.
- `[-]` Duplicación de datos vs JSONB (~5x el espacio). Aceptable para volúmenes de cotizaciones (cientos, no millones).
- `[-]` Migración: hay que poblar la tabla a partir del `full_state` existente. Ver estrategia abajo.

### Estrategia de migración (pseudocódigo)

⚠️ NECESITA CLARIFICACIÓN DE FEDE: ¿migramos las 3 cotizaciones existentes o arrancamos en cero?

Si se migran:

```javascript
// PSEUDOCÓDIGO — no ejecutar todavía
// Para cada row de cotizaciones donde full_state IS NOT NULL:
//   1. INSERT en cotizacion_items una fila por cada full_state.items[].
//      Match catalogo_item_id por: full_state.items[].id (slug "item_xxx") → busqueda inversa
//      en catalogo_items por `LOWER(codigo) = SUBSTR(slug,5)` o `LOWER(nombre)` aproximado.
//      Si no matchea, dejar catalogo_item_id NULL pero conservar el snapshot.
//   2. Para Expo/Alquiler, primero INSERT cotizacion_espacios, después items con espacio_id.
//   3. Mantener full_state JSONB como respaldo durante 1 mes, después marcar columna deprecated.
```

**Matching slug→id es heurístico y puede fallar.** Hoy solo hay 3 cotizaciones (todas Stand, mismo flujo). Riesgo bajo. Pero antes de Fase D vale verificar con Fede.

### Mantener `full_state JSONB`

Aunque tengamos `cotizacion_items`, el JSONB es útil como **snapshot del state completo del front** (params, modifier, fee, height, eventoData, clienteData) — datos que no caben en columnas normalizadas. Recomendación: mantener como respaldo y para `_restoreState` de quotation-ui.js.

### Columnas `pyme_*` de `cotizaciones`

Son de la integración con facturación de LOBBY. El cotizador hoy no las toca. Bien — pero documentar que existen para no pisarlas en algún UPDATE descuidado.

### 6.5. Numerador secuencial — riesgo de duplicados [ALTA] (hallazgo nuevo)

**Cómo se descubrió**: Fede recuperó 2 PDFs de papelera, ambos con número `COT-2026-0008`. La DB Supabase solo tiene `COT-2026-0001`, `0002`, `0003`. Significa que el número `0008` se asignó SIN haber pasado por el endpoint `/api/cotizaciones/next-number` o que cotizaciones intermedias fueron borradas + el algoritmo es local.

**Análisis del código** ([script.js:3187-3204](script.js:3187)):

```javascript
try {
    if (typeof API !== 'undefined' && API.isConnected) {
        const numData = await API.getNextQuotationNumber();
        cotNumber = numData.formatted;     // ← caminito A: API
    } else {
        throw new Error('API not available');
    }
} catch (e) {
    // caminito B: localStorage
    const storageKey = `mepex_cot_seq_${currentYear}`;
    let cotSeq = parseInt(localStorage.getItem(storageKey) || '0') + 1;
    localStorage.setItem(storageKey, cotSeq.toString());
    cotNumber = `COT-${currentYear}-${String(cotSeq).padStart(4, '0')}`;
}
```

**Problema**: los 2 caminitos NO se cruzan. Si la API está caída por un momento, el cliente genera `0004` localmente. Cuando la API vuelve, otro cliente le pide `next-number` y el server contesta `0004` también (porque su MAX(numero) sigue siendo `0003`). Ahora hay 2 cotizaciones físicas con el mismo número en distintas máquinas.

**Por qué los PDFs Fenix y Xunta dieron `0008` y no `0004`**: probablemente porque la API estuvo caída en varias sesiones consecutivas y el localStorage avanzó (0004 → 0005 → 0006 → 0007 → 0008). Al volver la API, la DB sigue con MAX=0003. Pero esas 4 cotizaciones intermedias NO LLEGARON A LA DB (silencio en `catch` de `quotation-storage.js:50-52`).

**Riesgo concreto**:
- Cotizaciones con número que NO existe en la DB (auditoría: imposible buscar `COT-2026-0008` y encontrarla).
- Números duplicados en el tiempo (un cliente recibe COT-2026-0008 en marzo, otro cliente recibe COT-2026-0008 en mayo).
- Si las 4 perdidas (0004-0007) tuvieran un valor económico, se perdieron.

**Propuestas de fix** (Fase C):

| Opción | Pro | Contra |
|---|---|---|
| **A**. Eliminar fallback localStorage. Si API cae, NO exportar PDF. | Garantiza unicidad. | Si la API tiene un problema y Fede está cotizando, queda bloqueado. |
| **B**. Usar PostgreSQL SEQUENCE en lugar de `MAX(numero) + 1`. Las secuencias no se ven afectadas por DELETEs (avanzan monotónicamente). | Robusta, atómica. | Requiere migración SQL, no resuelve el caso de API caída. |
| **C**. Hibrido: si localStorage avanza independiente, marcar el número con un sufijo (`COT-2026-0008-LOCAL`) y reconciliar con la API cuando vuelva (renombrar a número real). | Pragmático. | Confunde al cliente que ve un número distinto en el PDF. |
| **D**. Bloquear exportación si la API está caída, mostrando "Reconectando…". | Simple y predecible. | Idem A: bloquea trabajo. |

**Recomendación**: **B + D combinadas**. La SEQUENCE (B) garantiza unicidad sin depender de DELETE; la bloqueada (D) garantiza que ninguna cotización se genere sin estar persistida. Si Fede prefiere "puedo trabajar offline", entonces C — pero con plan claro de reconciliación.

**SQL propuesta (NO ejecutar todavía)**:

```sql
-- PROPUESTA — coordinar con LOBBY antes
CREATE SEQUENCE IF NOT EXISTS cotizaciones_numero_seq_2026 START 4;  -- arranca después del último real
-- En el endpoint /api/cotizaciones/next-number:
-- SELECT nextval('cotizaciones_numero_seq_2026');
-- Formatea: `COT-2026-${String(seq).padStart(4, '0')}`
-- (una secuencia por año, o una global con prefijo de año aparte)
```

---

## 7. Modelo de alturas con variantes (propuesta)

### Contexto

Decisión del BRIEF: mantener multiplicador global del Stand (con porcentajes más bajos), y agregar **variantes por ítem** con altura/precio propios.

### Catálogo ya tiene un concepto similar (sin usar)

Columnas en `catalogo_items`:
- `parametrico` (bool) — indica que el ítem tiene variantes paramétricas
- `familia` (text) — agrupador: COC, CHE, CMO, DAA, DLL...
- `medida_mm` (int) — medida específica de la variante

Ejemplos vistos:
- COC-1000, COC-1200, COC-3400 — "Columna octogonal" en 3 medidas.
- DLL-100, DLL-130, DLL-207, DLL-1445, DLL-2187, DLL-3425 — "Dintel liso liso" en 7 medidas.

**Si el problema es "altura variable", el catálogo YA tiene la herramienta**. Lo que falta es:
1. Que el cotizador agrupe las variantes en la UI ("una sola card 'Columna octogonal' con dropdown de medidas").
2. Que el campo de variación NO sea solo medida sino "altura" (ej. cenefa h=0,50 / h=0,75 / h=0,90).
3. Que la variante guardada tenga referencia al item específico.

### Dos arquitecturas posibles

#### Opción A: usar el sistema existente (`familia` + `medida_mm`) y extender

- `[+]` No requiere schema migration en `catalogo_items`. Solo se cargan más items del mismo `familia`.
- `[+]` Compatible con LOBBY-Costos (cada variante tiene su propio costo de producción).
- `[+]` El catálogo refleja la realidad: 10 columnas distintas = 10 SKUs distintos = 10 rows.
- `[-]` El cotizador tiene que **agrupar visualmente** las cards por `familia`.
- `[-]` `medida_mm` no es 100% "altura" — para cenefas la altura es independiente de la medida horizontal.

#### Opción B: agregar columna JSONB `variantes` (NUEVA columna)

- `[+]` Flexible: cada variante puede tener altura, ancho, precio, código.
- `[-]` Schema nuevo, hay que coordinar con LOBBY.
- `[-]` Pierde la simetría con el sistema actual de `familia`/`medida_mm`.

#### Opción C: tabla separada `catalogo_items_variantes`

- `[+]` Normalizado, queryable, escalable.
- `[+]` Permite atributos complejos (altura, ancho, color, material...).
- `[-]` Más complejo: hay que coordinar con LOBBY para que el módulo Costos sepa qué hacer con variantes.
- `[-]` Indirección extra en cada lookup.

### Recomendación

**Opción A**, con ajustes. Razones:
1. El sistema YA existe y está poblado parcialmente (al menos 20+ items con `parametrico=true`).
2. LOBBY-Costos ya sabe trabajar con esos items (cada uno tiene su `costo_produccion`, su `precio_cliente`).
3. El cambio en el cotizador es UI (agrupar cards por `familia`), no schema.

Si se descubre que `familia` no es suficiente (ej. necesidad de variantes por altura ortogonal a la medida), se puede agregar una columna `variante_dimension` o similar más adelante.

### UI propuesta

```
┌─ Card "Columna octogonal" ────────┐
│ ★ COC                              │
│ Sistema modular OCTEXA             │
│                                    │
│ Medida: [1000mm ▼]    Precio: $X  │
│                                    │
│ [−] 0 [+]                          │
└────────────────────────────────────┘
```

El dropdown selecciona la variante específica. Al cambiar, se actualiza el precio mostrado. El item guardado en el `selectedItems` lleva el `catalogo_items.id` de la variante específica (no el de la familia, que no existe como id).

### Interacción con multiplicador global de altura del Stand

Regla acordada en BRIEF: "si el ítem tiene variante seleccionada, NO aplicar multiplicador global; sí aplicar si está en altura default".

Implementación propuesta:
- Si el ítem tiene `parametrico=true` y el usuario eligió una variante específica → **NO multiplica por height**.
- Si el ítem tiene `parametrico=false` (no es variante) → multiplica por height si la categoría es `infrastructure`/`lighting`.
- Si el ítem es paramétrico pero el usuario "no eligió" (caso default — usa el primero del array) → mejor obligar a elegir; no asumir.

### Mapping CSV de 3dsMax

CSV trae código de variante directo (ej. `DLL-1445`, `COC-1200`). Se matchea con `catalogo_items.codigo` exacto. **No requiere lógica de family-then-medida**, basta con el código.

### Serialización al guardar la cotización

`full_state.items[].id` debe pasar a usar el `id` integer del `catalogo_items` (no el slug del front). Esto:
- Simplifica el matching en `cotizacion_items` (FK directa).
- Hace el CSV de 3dsMax más simple (un código → un row del catálogo).

⚠️ Esto es un **breaking change** para la lógica actual de `api.js:convertToLocalFormat` (línea 222-246). El `item.id` del DATABASE local pasa de slug a `String(catalogoId)`. Templates y cotizaciones viejas con slug se rompen. Necesita estrategia de migración:
- Compat layer en `_restoreState`: si el `id` es un slug `item_xxx`, intentar matchear contra `catalogo_items.codigo` o `catalogo_items.nombre`. Si match, reemplazar por id integer.
- Templates: igual estrategia, ejecutada una vez al cargar.

⚠️ NECESITA CLARIFICACIÓN DE FEDE: ¿asume el riesgo de breaking change con migración, o prefiere mantener compatibilidad con slugs y solo migrar nuevos? Si lo segundo, el matching de `cotizacion_items.catalogo_item_id` queda más débil.

### Porcentajes propuestos para el multiplicador global

Hoy: 1.0 / 1.15 / 1.25 / 1.4 / 1.7 (Estándar / Media / Plus / Extra / Máxima).

⚠️ NECESITA CLARIFICACIÓN DE FEDE: el BRIEF dice "bajarlos, números a definir". Mi recomendación si no hay base contable es algo más suave: 1.0 / 1.05 / 1.10 / 1.20 / 1.35. Pero esto es decisión de pricing del negocio, no técnica.

---

## 8. Importador CSV desde 3dsMax (propuesta)

### Formato CSV propuesto

Cabecera con columnas claras, separador `,`, encoding UTF-8 con BOM.

```csv
codigo,nombre_3ds,cantidad,unidad,espacio,nota
DLL-1445,Dintel liso liso 1445 mm,4,unidad,Espacio 1,
COC-1200,Columna octogonal 1200 mm,2,unidad,Espacio 1,
ALF-NN,Alfombra nueva con nylon,36,m2,Espacio 1,sobre tarima
TVS-55,TV 55" 4k,1,unidad,,
```

Columnas:
- `codigo` (obligatoria): match contra `catalogo_items.codigo`.
- `nombre_3ds` (informativa): nombre tal cual lo exportó 3dsMax. Sirve para detectar discrepancias y para fallback de matching por nombre si el código no se encuentra.
- `cantidad` (obligatoria): numérica.
- `unidad` (opcional): si está, valida contra la unidad del catálogo y advierte si difiere.
- `espacio` (opcional): nombre del espacio para modo Expo/Alquiler. Vacío en Stand.
- `nota` (opcional): comentario libre para el usuario (no se guarda en items).

### Flujo UX propuesto

1. Botón "📥 Importar desde 3dsMax" en la fila de actions secundarias (junto a CSV, Templates).
2. Modal con drag-drop de archivo + botón "Subir".
3. Parsing local del CSV en el browser:
   - Validar headers.
   - Por cada row: matchear `codigo` contra `catalogo_items.codigo`.
4. Mostrar tabla preview:
   - ✅ Matches (verde): código encontrado, cantidad válida.
   - ⚠️ Warnings (amarillo): código encontrado pero unidad difiere o cantidad inusual.
   - ❌ Errors (rojo): código no encontrado, formato inválido, cantidad negativa, código duplicado.
5. Si hay errors: bloquear "Aplicar". Mostrar texto del error con sugerencias ("¿quisiste decir COC-1200?" basado en similar).
6. Si todo OK: botón "Aplicar a cotización".
   - En Stand: sumar cantidades al `selectedItems`.
   - En Expo/Alquiler: si hay columna `espacio`, crear los espacios que no existan y volcar items ahí. Si no, todo va al espacio activo.
7. Toast de éxito: "Importados N items desde 3dsMax".

### Validaciones del importer

- Header obligatorio (al menos `codigo`, `cantidad`).
- `codigo` no vacío.
- `cantidad` > 0 (no admite ceros ni negativos).
- Duplicados (mismo `codigo` en mismo `espacio`): sumar cantidades pero advertir en el preview.
- `codigo` no encontrado en `catalogo_items`: bloquear, mostrar el código y sugerir Fede cargarlo manualmente en LOBBY-Catálogo. **NO crear ítems automáticamente.**

### Comportamiento por modo

- **Stand**: el caso principal. CSV → `State.selectedItems`.
- **Expo/Alquiler**: solo si el CSV tiene la columna `espacio`. Si no, va al espacio activo.
- Si el modo actual es Stand pero el CSV tiene varios `espacio` distintos: avisar y preguntar si quiere cambiar a multi-espacio.

⚠️ NECESITA CLARIFICACIÓN DE FEDE:
1. ¿El CSV trae unidad? Si 3dsMax no la exporta, ¿asumimos `'unidad'` por default?
2. ¿Qué hacer si el CSV trae un código que existe en catálogo pero está marcado `_deleted=true` o `es_cotizable=false`? Bloquear? Advertir?
3. Espacio vacío en una fila: ¿es Stand? ¿Es "Espacio 1" del modo activo? Sugiero la segunda.

---

## 9. Presets de stand (PROPUESTA A EVALUAR)

### Análisis de overlap con Templates

Templates ya existe ([script.js:380](script.js:380)). Snapshotea: `generalParams` + `selectedItems`, excluye cliente/proyecto/evento/fecha.

**Un Template aplicado** = un preset cargado: tipo + metraje + standType + altura + items + fee + modifier.

**Diferencias propuestas para "Presets"** (BRIEF §8): "stand base 30m² centro altura standard con todos sus ítems precargados".

→ Eso es **exactamente lo que hace un Template**.

### Recomendación: NO crear "Presets" como módulo aparte

Razones:
1. Funcionalmente son iguales: snapshot reusable de params+items.
2. Templates ya está implementado, testeado y guardado en localStorage.
3. Hacer "Presets" sería duplicar código y confundir al usuario.

### Lo que SÍ se puede mejorar en Templates

- [BAJA] **Pre-cargar templates "del sistema"**: stands base 9m², 16m², 25m², 36m² centro/esquina con sets de items razonables. Que vengan precargados (en código o en Supabase) y el usuario solo los aplique. Hoy Templates arranca vacío.
- [BAJA] **Categorizar templates**: tags o carpetas (cosmética / educación / institucional / institutional). Hoy es una lista flat.
- [MEDIA] **Templates en Supabase**: hoy solo localStorage → no comparte entre usuarios ni browsers. Si el equipo MEPEX tiene 3 vendedores, cada uno tiene los suyos. Movérlos a Supabase implica auth real y RLS.

### Conclusión

Renombrar "Presets" → "Templates iniciales del sistema" y precargar 4-6 templates. No crear módulo nuevo.

---

## 10. Refactor estructural propuesto

### Mapeo del monstruo `Render` (líneas 1200-3818) a los 5 módulos

**Total: 2618 líneas en `Render` actualmente.**

| Módulo nuevo | Funciones de Render a extraer | Líneas aprox |
|---|---|---|
| `render-ui.js` | `init`, `renderNav`, `renderItems`, `_renderItemGroup`, `createItemCard`, `_initItemsDelegation`, `attachItemListeners`, `_initScrollSpy`, `_rescanScrollSpy`, `updateAll`, `updateNavBadges`, `updateEventInfo`, `initSearchFilter`, `_initGlobalShortcuts`, `_toggleShortcutsCheatsheet`, `_closeShortcutsCheatsheet`, `_normalizeSearch`, `applySearchFilter`, `reapplySearchFilter`, `updateSummary` (parte que renderiza HTML), `renderSpacesTabs`, `setupGeneralParams`, `updateModifierDisplay`, `resetGeneralParamsUI`, `handleQuotationTypeSwitch`, `updateLayoutForType`, `_initMobileControls`, `renderAdminPanel`, `attachAdminListeners`, `toggleAdminPanel`, `handleReset` | ~1200 |
| `pricing.js` | `_parsePrice`, `_fmt`, **función nueva** `computeQuotation(state, catalog)` que centraliza el cálculo. La consumen render-ui, render-pdf, render-csv y Compare. | ~150 |
| `render-pdf.js` | `exportPDF`, `_showPDFPreview`, `handleExport`, `handlePreview` (handlers) + helpers `loadImageAsDataURL`, `drawPageBg`, `addDarkPage` | ~700 |
| `render-csv.js` | `handleExportCSV` y helpers de CSV escape | ~150 |
| `validation.js` | `validateForExport`, validaciones extras del Bloque 5 | ~100 |

Quedan ~300 líneas de utilities (Toast, Confirm, format dates, etc.) que pueden quedarse en `script.js` como entry point.

### Dependencias cruzadas

```
script.js (entry, Toast, Confirm, Favorites, Autosave, Templates, Compare, State, init)
   │
   ├─ render-ui.js  → pricing.js, validation.js
   ├─ render-pdf.js → pricing.js, validation.js
   ├─ render-csv.js → pricing.js, validation.js
   ├─ pricing.js    → (puro, sin dependencias)
   └─ validation.js → (lee State, sin otras deps)

quotation-storage.js → pricing.js (para totales sin pasar por DOM)
quotation-ui.js      → render-ui.js (para re-render al restaurar)
autocomplete.js      → render-ui.js (Render.updateEventInfo)
Compare              → pricing.js
Templates            → render-ui.js (para re-render al aplicar)
Autosave             → render-ui.js (para re-render al recovery)
```

### Estrategia de extracción (orden propuesto)

1. **`pricing.js` primero**. Es la pieza menos invasiva. Extraer `computeQuotation`, validarlo con tests manuales (cargar las 3 cotizaciones existentes y verificar que el total da igual). Reemplazar las 4 implementaciones por la nueva. **Una vez que pricing está consolidado, el resto es menos riesgoso.**
2. **`validation.js`**: independiente del resto, mover fácil.
3. **`render-csv.js`**: el menos crítico. Si rompe, no rompe el flujo principal.
4. **`render-pdf.js`**: requiere `pricing.js` consolidado. Cuidado: la generación de PDF se llama desde el "guardar cotización" → si rompe, no se puede cotizar.
5. **`render-ui.js`**: lo último. Es el más grande y el más entrelazado. Idealmente se extrae por sub-secciones (params, summary, cards, search, etc.) para no hacer un commit gigante.

### Convención CSS — prefix scoping

Hoy `style.css` es global. Recomendación: prefix `.cotizador-*` en todo selector, espejando lo que hace `inventario.css` de LOBBY.

**Migración**:
1. `body` recibe la clase `.cotizador-app` desde el HTML.
2. Cada selector del CSS pasa a `.cotizador-app .selector-original`.
3. Permite (en el futuro) embebir el cotizador en LOBBY sin colisiones.

**Trade-off**: 4590 líneas a transformar. Es trabajo mecánico pero tedioso. Sugerencia: hacer en Fase D, no Fase C. La Fase C debería enfocarse en bugs críticos (min=9, unidades PDF, /api/events).

### División de `style.css`

Propuesta paralela a JS:
- `style/base.css` — variables, layout 3-col, tipografía
- `style/cards.css` — cards de items + admin panel
- `style/summary.css` — col-summary, totales, FAB
- `style/params.css` — bloques de Stand, Expo, fees, modificador
- `style/modals.css` — quotation, templates, compare, confirm, cheatsheet
- `style/responsive.css` — todos los `@media`

Más cómodo de mantener que un monolito.

---

## 11. Limpieza

### Archivos / código a ELIMINAR (con justificación)

| Path | Motivo | Confirmar con Fede |
|---|---|---|
| `server/migrate-notion-to-supabase.js` | Migración one-shot ya ejecutada. No vuelve a usarse. | ✅ ya marcado en BRIEF como legacy |
| `DETENER SERVIDOR.bat` | Local dev legacy. App ahora se sirve online. | ✅ BRIEF lo marca |
| `INICIAR COTIZADOR.bat` | Local dev legacy. App ahora se sirve online. | ✅ BRIEF lo marca |
| `NOTION_INTEGRATION.md` | Documenta integración con Notion que ya no existe. | ✅ BRIEF lo marca |
| **Mensaje en `script.js:1667`**: `"Si no carga, verificá que el servidor esté corriendo (INICIAR COTIZADOR.bat)"` | Referencia a archivo `.bat` que se va a eliminar. | ⚠️ Actualizar texto |

### Código muerto / no referenciado

| Path / símbolo | Estado | Acción |
|---|---|---|
| `database.js` → `DATABASE.fees.design` (línea 73-79) | Definido pero `Render` no lo usa (el fee actual viene de `feePercentage` del state, no de aquí) | Eliminar o referenciar |
| `database.js` → `DATABASE.complexityLevels` (referenciado en `importFromJSON` línea 177) | No se importa en ningún lado, no se define en otro lugar | Eliminar referencia |
| `quotation-storage.js` línea 9 — `MAX_QUOTATIONS = 50` | Sólo aplica a localStorage. Supabase no tiene límite. | OK, dejar como está. |
| `quotation-storage.js:1` línea 7 — `STORAGE_KEY = 'mepex_quotations'` | Mantenerlo: es el backup local | OK |
| `script.js:1684` `DB.getCategories()` y similares | Bien |
| `script.js:1899` `attachItemListeners` función no-op | Mantener por compatibilidad o eliminar | Eliminar el call + función (ver comentario en el propio código) |

### Comentarios obsoletos

| Path:línea | Comentario | Por qué obsoleto |
|---|---|---|
| `script.js:3492-3494` | `'Construcción modular con sistema OCTEXA'` hardcoded | Asume que TODO Stand es modular OCTEXA. No siempre es así. |
| `script.js:3496-3498` | `"La lógica original no mostraba items individuales en Infraestructura Stand. Mantendremos esa lógica…"` | Confirma que es legacy. Reevaluar. |
| `server/index.js:898` | `console.log('   📦 Tables: catalogo_items, clientes, proyectos, eventos, cotizaciones');` | Las tablas se renombraron (`proyectos`, `eventos`) — el log dice las correctas. ✅ |
| `script.js:243` | `'IMPORTANTE: No cargar desde localStorage automáticamente'` | OK, vigente. |

### Imports y referencias a confirmar

- `index.html:401` carga jsPDF desde CDN. ✅ OK pero considerar self-host para casos offline.
- `database.js` exporta `DB` y `DATABASE` como globals. ✅ Es consistente con el resto.

---

## 12. Riesgos y zonas frágiles

### Zonas tocar-sólo-con-cuidado

1. **Flujo de guardado a Supabase** (`api.js:saveQuotation` + `server/index.js POST /api/quotations`). Recién arreglado. Cambiar el shape del POST sin tocar el backend rompe el guardado.

2. **Numerador secuencial** (`/api/cotizaciones/next-number`). Regex hardcodeado `^COT-(\d{4})-(\d{4})$`. Si se cambia el formato del número de cotización (ej. agregar prefijo), hay que actualizar el regex.
   - ⚠️ Ver Bloque 6.5 — riesgo de duplicación entre fallback localStorage y API.
   - El método actual (`MAX(numero) + 1`) **NO es resistente a DELETE**: si una cotización se borra, su número queda libre y se reasigna.

3. **`catalogo_items` compartido con LOBBY-Costos**. NO agregar columnas sin avisar al módulo Costos. Hoy: 40+ columnas, muchas relacionadas a costing (`pct_*`, `costo_*`, `snapshot_*`). Cualquier query del cotizador que use `SELECT *` recibe todas — performance OK con 226 rows pero atención si crece.

4. **`full_state JSONB`**: si se cambia su estructura (ej. para agregar `variantId`), las cotizaciones VIEJAS guardadas dejan de parsearse en `_restoreState`. Sugerencia: campo `full_state.version` para migrations futuras.

5. **localStorage**:
   - Templates están solo en localStorage.
   - Autosave del draft está solo en localStorage.
   - Favoritos del usuario están solo en localStorage.
   - Si el usuario limpia el browser, pierde todo.

6. **Datos corruptos en `clientes`**: el sample real muestra valores en columnas equivocadas (CUIT con "Director", teléfono con "Natalia Castro", email con "Alimentos"). Es problema de LOBBY (CRM), pero el cotizador hereda el ruido y muestra esa info en el PDF tal cual. [MEDIA → no es scope del cotizador, pero el equipo debería saber]

7. **service_role key embebida en `.claude/settings.local.json`** — gitignored, OK. Pero si se hace un zip / share del directorio, la key viaja. Si se sospecha que se filtró, rotarla en Supabase Dashboard. [BAJA → seguridad]

### Posibles regresiones del refactor

- Cambiar el formato del `full_state.items[].id` (de slug a int) rompe cotizaciones viejas guardadas. Requiere compat layer en `_restoreState`.
- Mover la lógica de pricing a `pricing.js` debe preservar los rounding modes y orden de operaciones (aunque sea matemáticamente equivalente, los floats pueden divergir en último decimal).
- Agregar prefix CSS `.cotizador-*` puede romper selectores hardcoded en `script.js` que asumen estilos globales (ej. `.input-error`, `.mp-spinner`). Auditar todas las referencias antes.

---

## Decisiones pendientes para Fede

> Cada una con: contexto · 2-3 opciones con trade-offs · recomendación.

### D1. ¿Qué hacer con items que tienen `precio_cliente = 0`? [ALTA]

**Contexto**: 218 de 226 ítems (96%) tienen precio 0. Las cotizaciones se guardan con totales irreales.

| Opción | Trade-off |
|---|---|
| **A**. Bloquear export si hay items con precio 0 | Forzaría a cargar precios. Pero hace inválidas las 3 cotizaciones existentes y bloquea testing. |
| **B**. Advertir en la UI con un banner amarillo al cotizar pero permitir exportar | Pragmático. El usuario sabe que falta info. |
| **C**. Ignorar. Es problema del catálogo, no del cotizador. | Mantiene el bug visible al usuario final. |

**Recomendación**: **B**. Banner suave + listar los items afectados en el preview del PDF para que se vean.

### D2. ¿Variantes de altura: opción A, B o C del Bloque 7? [ALTA]

| Opción | Trade-off |
|---|---|
| **A**. Usar `familia`+`medida_mm` existentes | No requiere migration. Reutiliza lo que LOBBY ya tiene. **Recomendada**. |
| **B**. Nueva columna JSONB `variantes` | Más flexible para futuras dimensiones (alto/ancho/color) pero requiere coordinar con LOBBY. |
| **C**. Tabla aparte `catalogo_items_variantes` | Máxima flexibilidad. Pero refactor doble (cotizador + LOBBY-Costos). |

**Recomendación**: **A**, con ajustes a la UI (agrupar variantes por familia en cards).

### D3. ¿Migrar las 3 cotizaciones existentes a `cotizacion_items`? [MEDIA]

| Opción | Trade-off |
|---|---|
| **A**. Migrar — script one-shot que parsea `full_state.items[]` y matchea por slug | Heurístico, puede fallar en items "perdidos". Solo 3 cotizaciones, riesgo bajo. |
| **B**. Arrancar limpio. Las 3 cotizaciones siguen en JSONB; las nuevas van a la tabla normalizada | Más simple. Pero el comparador "viejas vs nuevas" se complica. |

**Recomendación**: **A**. Solo 3 cotizaciones, el matching debería andar bien. Dejar el JSONB como respaldo durante 1-3 meses.

### D4. ¿Render Stand del PDF: enumerar items de Infraestructura o mantener "Construcción modular OCTEXA"? [ALTA]

| Opción | Trade-off |
|---|---|
| **A**. Enumerar siempre (consistente con multi-space) | Más transparente. PDF más largo en stands con muchas piezas. |
| **B**. Mantener "Construcción modular OCTEXA" pero mostrar el subtotal del rubro | Menos info, pero el cliente al menos ve cuánto cuesta el rubro. |
| **C**. Toggle del usuario (`include_infrastructure_items_in_pdf`) | Más complejo. Pero da control. |

**Recomendación**: **A** por default, con opción B configurable a nivel de cotización si Fede quiere PDFs cortos para stands grandes.

### D5. ¿Modifier y Fee deben poder cambiarse en Expo/Alquiler? [MEDIA]

**Contexto**: hoy la UI los oculta en multi-space, pero el código los aplica si están seteados.

| Opción | Trade-off |
|---|---|
| **A**. Mostrar siempre, en todos los modos | Coherencia. Estado mental del usuario igual en cualquier modo. |
| **B**. Mantener oculto en multi-space y forzar a 0 internamente | Coherencia del otro tipo: lo que no se muestra, no aplica. |

**Recomendación**: **A**.

### D6. ¿Altura del stand aplica en Expo/Alquiler? [MEDIA]

**Contexto**: hoy el código aplica el multiplicador pero no hay UI para cambiarlo.

| Opción | Trade-off |
|---|---|
| **A**. Exponer la UI en multi-space también | Consistente con la regla de variantes (cada item tiene su altura). |
| **B**. Forzar `heightMultiplier = 1` en multi-space (sin UI ni cálculo) | Más simple. Las variantes manejan la altura por item. |

**Recomendación**: **B**. La altura global es solo de Stand. En multi-space la altura se modela por variante de item.

### D7. ¿Templates en Supabase o seguir en localStorage? [MEDIA]

**Contexto**: hoy solo localStorage; no comparte entre browsers/usuarios.

| Opción | Trade-off |
|---|---|
| **A**. Mover a Supabase con `vendedor_id` | Compartido entre browsers. Requiere auth real (hoy `vendedor_id` siempre NULL). |
| **B**. Híbrido: templates personales en localStorage + templates "del sistema" en Supabase (precargados) | Lo mejor de ambos mundos. Pero más complejo. |
| **C**. Dejar como está | Cero cambios. Cero shared. |

**Recomendación**: **B**, pero como objetivo de Fase D, no C.

### D8. ¿Porcentajes nuevos del multiplicador de altura? [BAJA → decisión de pricing]

**Hoy**: 1.0 / 1.15 / 1.25 / 1.4 / 1.7.

Fede dijo "más bajos". Sugerencia técnica: cualquier valor, pero documentarlo en CLAUDE.md cuando se elija.

### D9. ¿CSV de 3dsMax: formato y unidad por default? [MEDIA]

Ver Bloque 8. Necesita decisión sobre:
- ¿3dsMax exporta la unidad? Si no → asumir `'unidad'`.
- ¿Qué hacer si el código existe pero está `_deleted` o `es_cotizable=false`?
- Espacio vacío: ¿stand o espacio activo?

### D10. ¿Eliminar `Favorites` overlay si el catálogo va a depurar el flag `favorito`? [BAJA]

Si LOBBY va a hacer una limpieza de `favorito` (que hoy es 95% true), `Favorites` (localStorage) recupera su utilidad. Si NO, mejor eliminar el overlay y dejar solo el flag de DB.

### D11. ¿Renombrar admin panel para reflejar lo que hace? [BAJA]

Hoy se llama "🔧 Configuración" pero no configura nada — solo muestra el catálogo. Sugerencia: "📚 Catálogo".

---

## Anexo A — Archivos analizados

- `BRIEF_AUDITORIA.md`
- `01_mapa_arquitectonico.md`
- `schema_dump.md` (generado en esta sesión)
- `index.html` (415 líneas, completo)
- `style.css` (4590 líneas, lectura parcial + grep estructural)
- `script.js` (3895 líneas, completo)
- `api.js` (505 líneas, completo)
- `database.js` (248 líneas, completo)
- `autocomplete.js` (389 líneas, completo)
- `quotation-storage.js` (254 líneas, completo)
- `quotation-ui.js` (350 líneas, completo)
- `server/index.js` (902 líneas, completo)
- `server/supabase-setup.sql` (29 líneas, completo)
- `.gitignore`
- `.claude/settings.local.json`

### Tablas consultadas en Supabase (vía REST API + service_role)

- `catalogo_items` — sample 8 rows + 1 row + 226 rows agg (rubro, categoria, unidad, favorito, precio_cliente) + 20 rows con `parametrico=true`
- `cotizaciones` — sample 3 rows (todas Stand) — único dato disponible
- `clientes` — sample 2 rows
- `proyectos` — sample 2 rows
- `eventos` — sample 2 rows

---

## Anexo B — Queries SQL pendientes para Fede

> Estas queries necesitan correrse para completar la auditoría. Algunas ya las corrí yo (via service_role key) pero faltan datos que solo se generan en uso real.

### B1. ¿Existen cotizaciones Expo o Alquiler en alguna otra parte? [RESPONDIDO PARCIALMENTE]

**Update**: Fede recuperó de papelera 2 PDFs reales (`COT-2026-0008` Fenix Entertainment EXPO + Xunta de Galicia ALQUILER). Confirman el formato visual del render multi-space. Documentados en el Bloque 3.

**Pero**: las 2 cotizaciones **no están en la DB** (la DB sólo tiene `0001`-`0003`, todas Stand). Los PDFs son artifacts locales generados cuando la API estaba caída → fallback localStorage → guardado falló silenciosamente. Por lo tanto:

- ✅ Tengo confirmación del **formato visual** del PDF Expo/Alquiler.
- ❌ Sigo sin tener la **estructura JSONB `full_state.spaces[]`** de una cotización guardada. No puedo validar nombres exactos de campos en `spaces[i].items[j]`.

**Acción opcional** (si se quiere completar la auditoría con data exacta): crear UNA cotización de prueba Expo con la API arriba (verificar primero que el guardado funciona) y dejarla guardada. Yo corro:

```bash
curl ".../rest/v1/cotizaciones?select=*&tipo_cotizacion=in.(Expo,Alquiler)" -H "apikey: SERVICE_KEY" -H "Authorization: Bearer SERVICE_KEY"
```

**Riesgo de NO hacerlo**: el script de migración a `cotizacion_items`/`cotizacion_espacios` que se diseñe en Fase D va a tener que asumir la estructura desde el código (`quotation-storage.js:_collectCurrentState` líneas 193-200 muestran la forma `{ id, name, surface, items: [{id, name, category, price, quantity, unit}] }`). Es un riesgo bajo porque el código está, pero un sample real cierra el círculo.

### B2. Confirmación de columnas en `eventos` [bloque 6 — fix /api/events]

Necesito confirmar que las columnas son las que vi en el sample (y que no haya un trigger o vista que las renombre). Esta query la corro yo cuando vos digas que es momento:

```bash
curl "https://selnevalaeykdrgycvdz.supabase.co/rest/v1/eventos?select=*&limit=1" -H "apikey: SERVICE_KEY" -H "Authorization: Bearer SERVICE_KEY"
```

Sample observado:
```json
{
  "id": "uuid",
  "nombre": "...",
  "fecha_evento_inicio": "YYYY-MM-DD",
  "fecha_evento_fin": "YYYY-MM-DD",
  "fecha_armado_inicio": "YYYY-MM-DD",
  "fecha_armado_fin": "YYYY-MM-DD",
  "fecha_desarme_inicio": "YYYY-MM-DD",
  "fecha_desarme_fin": null,
  "hora_armado_apertura": "HH:MM:SS",
  ...,
  "predio": "...",
  "color": null,
  "notas_operativas": null,
  "_deleted": false
}
```

⚠️ Si vos sabés que existe `prioridad` o `estado` en `eventos`, decímelo. Yo no las vi en el sample.

### B3. ¿Cuántos items del catálogo tienen `es_cotizable = false`?

```bash
curl -I "https://.../rest/v1/catalogo_items?select=id&es_cotizable=eq.false" -H "apikey: SERVICE_KEY" -H "Authorization: Bearer SERVICE_KEY" -H "Prefer: count=exact" -H "Range: 0-0"
```

Si la respuesta dice "Content-Range: 0-0/N" con N>0, hay que decidir si filtrarlos en el cotizador (hoy no lo hace).

### B4. ¿Cuántos items tienen `_deleted = true`?

```bash
curl -I "https://.../rest/v1/catalogo_items?select=id&_deleted=eq.true" -H "apikey: SERVICE_KEY" -H "Authorization: Bearer SERVICE_KEY" -H "Prefer: count=exact" -H "Range: 0-0"
```

Idem: si hay rows, el cotizador debería filtrarlos.

### B5. Familias paramétricas que existen y cuántas variantes tiene cada una

```bash
curl "https://.../rest/v1/catalogo_items?select=familia&parametrico=eq.true" -H "apikey: SERVICE_KEY" -H "Authorization: Bearer SERVICE_KEY"
```

Agrupar en cliente para saber cuántas familias y cuántas variantes por familia. Es input para el Bloque 7 (UI propuesta de cards con dropdown de variantes).

### B6. Templates pre-cargados — ¿hay alguno guardado en Supabase ya?

No hay tabla `templates` en el server actual. Si la idea es moverlos a Supabase (D7), va a haber que crearla. NO es bloqueante para Fase B.

---

## Cierre

Este documento es completo para que Fede tome las 11 decisiones listadas. La Fase C (implementación de bugfixes críticos) puede arrancar con D1, D4 y los fixes mecánicos (min=9, unidades PDF, /api/events). La Fase D (refactor estructural + features nuevos) requiere D2, D3, D5, D6, D7, D9 resueltas.

Recomiendo cerrar esta sesión y abrir una nueva con el prompt:

> "Fase C, arrancando por bugs críticos: min=9, unidades PDF, /api/events. Después decisiones D1 y D4."

CLAUDE.md ya está en raíz y se va a autoleer. `.audit/schema_dump.md` también estará disponible.
