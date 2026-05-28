# Schema dump — COTIZADOR-MEPEX (Supabase)

> Generado automáticamente vía REST API con service_role key.
> Fecha: 2026-05-20
> Proyecto Supabase: `selnevalaeykdrgycvdz`

## Conteos por tabla

| Tabla | Rows totales |
|---|---|
| `catalogo_items` | **226** |
| `cotizaciones` | **3** (todas tipo Stand) |
| `clientes` | ≥ 2 (samples) |
| `proyectos` | ≥ 2 (renombrada desde `proyectos_2026`) |
| `eventos` | ≥ 2 (renombrada desde `eventos_2026`) |

---

## Tabla `catalogo_items` — columnas REALES

(Difieren del `server/supabase-setup.sql` — la tabla la maneja LOBBY y tiene mucho más que lo declarado.)

| Columna | Tipo observado | Uso en COTIZADOR | Uso en LOBBY |
|---|---|---|---|
| `id` | int | ✅ (formatCatalogItem) | ✅ |
| `codigo` | text \| null | ✅ (genera `item_xxx` id local) | ✅ |
| `nombre` | text | ✅ | ✅ |
| `rubro` | text \| null \| "" | ✅ (mapea a category) | ✅ |
| `categoria` | text \| null \| "" | ✅ (originalCategory) | ✅ |
| `descripcion` | text \| null | ✅ | ✅ |
| `origen` | text \| null | ❌ | ✅ |
| `unidad` | text \| null | ✅ (PDF/CSV) | ✅ |
| `costo_produccion` | numeric | ❌ | ✅ |
| `precio_cliente` | numeric | ✅ (price) | ✅ |
| `nivel` | int | ❌ | ✅ (jerarquía recetas) |
| `favorito` | bool | ✅ | ✅ |
| `disponible_publico` | bool | ❌ | ✅ |
| `stock` | int | ❌ | ✅ |
| `parametrico` | bool | ❌ ⚠️ | ✅ (variantes por medida) |
| `medida_mm` | int \| null | ❌ ⚠️ | ✅ |
| `familia` | text \| null | ❌ ⚠️ | ✅ (COC, CHE, CMO, DAA, DLL...) |
| `activo` | bool | ✅ (filtro) | ✅ |
| `_deleted` | bool | ❌ (no filtra por esto!) | ✅ |
| `tipo_receta` | text | ❌ | ✅ ("propio") |
| `margen_*`, `pct_*`, `costo_*`, `snapshot_*` | numeric | ❌ | ✅ (módulo Costos) |
| `precio_alquiler` | numeric | ❌ ⚠️ | ✅ (clave para modo Alquiler!) |
| `vida_util_usos` | int | ❌ | ✅ |
| `costo_proveedor_directo` | numeric \| null | ❌ | ✅ |
| `proveedor_id_directo` | uuid \| null | ❌ | ✅ |
| `es_cotizable` | bool | ❌ ⚠️ | ✅ |
| `created_at`, `updated_at` | timestamptz | ✅ | ✅ |

⚠️ **Hallazgos críticos**:
- El cotizador IGNORA `precio_alquiler` aunque tiene un modo Alquiler. Todos los modos usan `precio_cliente`.
- El cotizador IGNORA `parametrico` + `familia` + `medida_mm` — el catálogo YA tiene variantes paramétricas (similar a lo que Fede quiere para alturas).
- El cotizador IGNORA `es_cotizable` — debería filtrar por esta columna pero no lo hace.
- El cotizador IGNORA `_deleted` — items "borrados lógicos" aparecen en el catálogo.

### Estadísticas del catálogo (226 rows)

| Métrica | Valor |
|---|---|
| Items totales | 226 |
| Items con `precio_cliente > 0` | **8** |
| Items con `precio_cliente = 0` | **218** (96%) |
| Items con `favorito = true` | **215** (95%) |
| Items con `favorito = false` | 11 |
| Items con `unidad = NULL` | mayoría (≥ ~150) |
| Items con `unidad = "m2"` | ~10 (Alfombramiento, Tarimas) |
| Items con `unidad = "Unidad"` | ~60 (Mobiliario, Tableros) |
| Items con `parametrico = true` | varios (al menos 20 vistos) |

⚠️ El feature "favoritos arriba" perdió sentido: el 95% de los ítems son `favorito=true`.
⚠️ El 96% de los ítems no tiene precio cargado → cotizaciones se guardan con totales artificialmente bajos.

### Rubros (valores observados)

- `Infraestructura` (mayoría, asociado a Sistema OCTEXA)
- `Equipamiento` (Mobiliario, Tableros, Audiovisual)
- `Iluminación` (Red Eléctrica, Artefactos)
- `Pisos` (Alfombramiento, Tarimas y escenarios)
- `Más servicios` (raro)
- `""` (vacío) — varios items
- `null` — al menos 1

### Categorías observadas (subcategoría)

- "Sistema OCTEXA" → la dominante
- "Mobiliario en sistema"
- "Mobiliario"
- "Tableros"
- "Red Eléctrica"
- "Artefactos"
- "Estructuras especiales"
- "Audiovisual"
- "Alfombramiento"
- "Tarimas y escenarios"
- "Limpieza"
- `""` (vacío) — varios

⚠️ `api.js:193` (`subcategoryMap`) no contempla "Sistema OCTEXA", "Mobiliario en sistema", "Red Eléctrica", "Estructuras especiales", "Mobiliario", "Tarimas y escenarios". → fallback a `furniture` o `graphics`. Eso significa que la subcategoría visible en cards probablemente está mal en muchos items.

### Familias paramétricas observadas

`COC` (Columna octogonal), `CHE` (Columna hexagonal), `CMO` (Columna media octogonal), `CCO` (Columna cuarto octogonal), `CDO` (Columna doble octogonal), `DAA` (Dintel aletado aletado), `DLL` (Dintel liso liso) — y más.

Cada familia tiene N items con medida_mm distinto.

---

## Tabla `cotizaciones` — columnas REALES

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid | |
| `numero` | text | "COT-2026-NNNN" |
| `cliente_id` | uuid | FK clientes |
| `nombre_evento` | text \| null | **legacy**, todas las nuevas tienen NULL |
| `tipo_evento` | text \| null | **legacy** |
| `fecha_evento` | date \| null | **legacy** |
| `monto_total` | numeric | con 2 decimales |
| `estado` | text | "borrador", "aprobada", "rechazada" |
| `vendedor_id` | uuid \| null | **siempre NULL** ⚠️ — auth.uid no se está poblando |
| `notas_internas` | text \| null | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `project_id` | uuid | FK proyectos |
| `event_id` | uuid | FK eventos |
| `tipo_cotizacion` | text | "Stand" \| "Expo" \| "Alquiler" (capitalizado) |
| `superficie` | numeric | |
| `tipo_stand` | text | "Centro" \| "Esquina" \| "Peninsula" \| "Isla" |
| `altura` | text | "Estándar" \| "Media" \| "Plus" \| "Extra" \| "Máxima" |
| `subtotal` | numeric | |
| `iva` | numeric | |
| `fecha_emision` | date | |
| `full_state` | jsonb | snapshot del state del front |
| `pdf_url` | text | |
| `pyme_venta_id`, `pyme_factura_*`, `pyme_total`, `pyme_balance`, `pyme_estado_cobro`, `pyme_last_sync` | mixed | **integración facturación** (LOBBY) |
| `_deleted` | bool | siempre `false` en samples |
| `temperatura` | text | siempre `""` en samples |

⚠️ `vendedor_id` está NULL en todas las cotizaciones → el cotizador no está usando auth, o no está guardando el uid.

⚠️ Hay 6 columnas `pyme_*` para integración con facturación. El cotizador no las usa pero podrían ser útiles después.

### Estructura del JSONB `full_state` (3 samples Stand)

```json
{
  "id": "uuid-front-side",
  "date": "YYYY-MM-DD",
  "type": "stand" | "expo" | "alquiler",   // ⚠️ minúsculas vs tipo_cotizacion en mayúsculas
  "items": [
    {
      "id": "item_<slug>",            // ⚠️ slug del frontend, NO el id INT del catalogo
      "name": string,
      "unit": "m²" | "unidad" | "Unidad",
      "price": number,
      "category": "flooring" | "infrastructure" | "lighting" | "equipment" | "marketing" | "moreservices",
      "quantity": number
    }
  ],
  "params": {
    "fee": { "enabled": bool, "percentage": number },
    "event": { "id": uuid, "name": str, "dates": str, "venue": str, "eventStartDate": ISO, "eventEndDate": ISO },
    "client": { "id": uuid, "cuit": str, "name": str, "email": str },  // ⚠️ no incluye phone, rubro
    "height": { "label": "Estándar"|..., "value": 2.5..., "multiplier": 1.0... },
    "frontal": number | null,
    "project": { "id": uuid | null, "name": str },
    "surface": number,
    "modifier": { "name": str, "percentage": number },
    "standType": "isla"|"centro"|"esquina"|"peninsula",
    "profundidad": number | null
  },
  "spaces": [],   // ⚠️ siempre vacío en samples Stand. Para Expo/Alquiler debería tener items por espacio.
  "totals": { "tax": num, "total": num, "subtotal": num },
  "savedAt": ISO,
  "cotNumber": "COT-YYYY-NNNN"
}
```

⚠️ **Problema de identidad del item**: `items[].id` es un slug del frontend (`item_alf__003`, `item_psb_250`), no el `id` integer del catalogo. Esto significa que al normalizar `cotizacion_items`, no podemos hacer FK directa al `catalogo_items.id`. Hay 3 opciones (ver Bloque 6 en HALLAZGOS).

⚠️ **Sample real de items con `price: 0`**: en COT-2026-0002, de 10 items, 9 tienen price=0. El subtotal $27.600 sale solo de la alfombra ($6.900 × 4 m²).

⚠️ **`spaces` siempre vacío en samples**: no tengo data de Expo/Alquiler. Necesitamos al menos 1 sample real para verificar la estructura por espacio. → MARCAR EN ANEXO B.

---

## Tabla `clientes` — columnas REALES

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid | |
| `nombre_empresa` | text | |
| `razon_social` | text \| null | |
| `cuit` | text \| null | ⚠️ Tipo declarado en `server/index.js` como número, pero en DB es text con valores como "Director" |
| `contacto_empresa` | text \| null | |
| `telefono` | text \| null | ⚠️ Sample tiene "Natalia Castro" — datos corruptos |
| `cargo` | text \| null | |
| `correo_electronico` | text \| null | ⚠️ Sample tiene "Alimentos" — datos corruptos |
| `rubro` | text \| null | |
| `created_at` | timestamptz | |
| `tipo` | text \| null | no usado por cotizador |
| `estado` | text | "activo" |
| `score` | int | |
| `ultimo_contacto` | date \| null | |
| `_deleted` | bool | |

⚠️ **Datos corruptos en `clientes`**: el sample muestra valores en columnas equivocadas (CUIT con "Director", teléfono con "Natalia Castro", email con "Alimentos"). Esto NO es del cotizador, viene del LOBBY. Pero el cotizador hereda el ruido.

---

## Tabla `proyectos` — columnas REALES

Renombrada desde `proyectos_2026` (commit `3b9bf40`).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid | |
| `nombre` | text | |
| `cliente_id` | uuid | FK clientes |
| `evento_id` | uuid | FK eventos |
| `responsable_id` | uuid \| null | |
| `estado` | text | "en_taller", etc |
| `fecha_inicio` | date \| null | |
| `fecha_entrega` | date \| null | |
| `notas` | text \| null | |
| `cotizacion_id` | uuid \| null | ⚠️ FK inverso — proyecto puede apuntar a cotización |
| `drive_folder_url` | text \| null | |
| `drive_folder_id` | text \| null | |
| `created_from` | text | "manual" |
| `estado_taller` | text | "pendiente" |
| `estado_taller_updated_at`, `estado_taller_updated_by` | mixed | |
| `completitud_pct` | int | 0-100 |
| `_deleted` | bool | |

⚠️ `server/index.js:88` declara columnas `cliente_nombre`, `evento_nombre`, `n_lote`, `tipo`, `responsable`, `empresa` que NO existen en la tabla actual — son legacy. El cotizador trae `name` del `nombre`, pero las relaciones cliente/evento se hacen por id.

---

## Tabla `eventos` — columnas REALES

Renombrada desde `eventos_2026` (commit `3b9bf40`).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid | |
| `nombre` | text | |
| `fecha_evento_inicio` | date \| null | |
| `fecha_evento_fin` | date \| null | |
| `fecha_armado_inicio` | date \| null | |
| `fecha_armado_fin` | date \| null | |
| `fecha_desarme_inicio` | date \| null | ⚠️ era `fecha_desarme` antes |
| `fecha_desarme_fin` | date \| null | |
| `hora_armado_apertura/cierre` | time \| null | |
| `hora_evento_apertura/cierre` | time \| null | |
| `hora_desarme_apertura/cierre` | time \| null | |
| `predio` | text | ⚠️ era `lugar` antes |
| `color` | text \| null | |
| `notas_operativas` | text \| null | |
| `_deleted` | bool | |
| `prioridad` | ❓ | ⚠️ NO observado en samples, server/index.js lo asume |

⚠️ `server/index.js:105-124` usa nombres viejos:
- `lugar` → ahora es `predio`
- `fecha_desarme` → ahora es `fecha_desarme_inicio` (singular)
- `prioridad`, `estado` → no aparecen en samples (posiblemente borrados)

**Esto significa que el endpoint `/api/events` está parcialmente roto en producción.** El frontend pide `events` y obtiene `venue=null`, `teardownDate=null`, `priority=null`. Marcar como hallazgo crítico [ALTA].

---

## Recursos verificados

- Bucket `cotizaciones-pdf` existe y es público (`pdf_url` en cotizaciones apunta a `https://selnevalaeykdrgycvdz.supabase.co/storage/v1/object/public/cotizaciones-pdf/...`).
- Numerador secuencial funciona: COT-2026-0001, 0002, 0003 ordenados.

---

## Anexo: queries usadas

Todas via REST API. Apikey y URL hardcodeadas en `.claude/settings.local.json` (gitignored).

```bash
# Conteo
curl -I "https://.../rest/v1/<tabla>?select=id" -H "Prefer: count=exact" -H "Range: 0-0"

# Sample
curl "https://.../rest/v1/<tabla>?select=*&limit=N"

# Filter
curl "https://.../rest/v1/<tabla>?select=*&columna=eq.valor"

# Specific columns
curl "https://.../rest/v1/<tabla>?select=col1,col2&order=col1"
```

---

## Lo que falta verificar (sample insuficiente)

1. **Cotización Expo real** — para ver estructura de `spaces` en el JSONB.
2. **Cotización Alquiler real** — para ver si difiere de Expo.
3. **Modelo de espacios** — ¿cómo se serializa cada espacio? ¿items anidados? ¿flat con `spaceId`?
4. **Items con `precio_cliente > 0` para los 3 modos** — solo verificado para Stand.
5. **Cómo se usa `precio_alquiler`** (si es que se usa) en el modo Alquiler. Hoy el cotizador no lo lee.

Si Fede crea una cotización Expo de muestra (mismo flujo, distinto modo) y otra Alquiler, se completa el dump.
