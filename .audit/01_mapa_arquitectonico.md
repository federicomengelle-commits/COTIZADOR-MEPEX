# COTIZADOR-MEPEX — Mapa Arquitectónico (Fase A)
> Foto del estado actual del código. Insumo para Fase B.

## Estructura del repo

```
COTIZADOR-MEPEX/
├── index.html              (415 líneas)   — Single page, 3 columnas
├── style.css              (4.590 líneas)  — Monolito CSS
├── script.js              (3.895 líneas)  — Monolito JS (lógica principal)
├── api.js                   (505 líneas)  — Cliente Supabase REST
├── database.js              (248 líneas)  — Catálogo en memoria + cálculos auto
├── autocomplete.js          (389 líneas)  — Inputs autocomplete (cliente/proyecto/evento)
├── quotation-storage.js     (254 líneas)  — Persistencia de cotizaciones guardadas
├── quotation-ui.js          (350 líneas)  — UI del modal "Cargar cotización"
├── server/
│   ├── index.js          (32 KB Express)  — Backend
│   ├── supabase-setup.sql                  — Schema (mínimo)
│   └── migrate-notion-to-supabase.js       — LEGACY (eliminar)
├── DETENER SERVIDOR.bat                    — LEGACY (eliminar)
├── INICIAR COTIZADOR.bat                   — LEGACY (eliminar)
└── NOTION_INTEGRATION.md                   — LEGACY (eliminar)
```

## Layout de la app (3 columnas)

```
┌──────────┬─────────────────────────────┬──────────────┐
│  col-nav │       col-main              │ col-summary  │
│          │                             │              │
│ Logo     │ ┌─ params-section ────────┐ │ Resumen      │
│          │ │ Cliente/Proy/Evento     │ │ Subtotal     │
│ Nav      │ │ Tipo: Stand|Expo|Alq    │ │ IVA          │
│ (cats)   │ │                         │ │ Total        │
│          │ │ ┌ stand-params-block ─┐ │ │              │
│          │ │ │ Superficie/Frente/  │ │ │ Acciones:    │
│          │ │ │ Profundidad/Tipo    │ │ │  - Exportar  │
│          │ │ │ Altura + Modif      │ │ │  - Preview   │
│          │ │ └─────────────────────┘ │ │  - CSV       │
│          │ │ ┌ expo-params-block ──┐ │ │  - Cargar    │
│          │ │ │ Espacios (tabs)     │ │ │  - Templates │
│          │ │ │ + items por espacio │ │ │  - Comparar  │
│          │ │ └─────────────────────┘ │ │  - Reiniciar │
│          │ │ Fee de Agencia (10%)    │ │              │
│          │ └─────────────────────────┘ │              │
│          │                             │              │
│          │ ── Selección de Items ──    │              │
│          │ [search Ctrl+K]             │              │
│          │ items-container (cards)     │              │
└──────────┴─────────────────────────────┴──────────────┘
```

## Secciones internas de `script.js`

| Línea | Módulo                | Qué hace                                              |
|-------|-----------------------|-------------------------------------------------------|
| 1–116 | Toast + Confirm       | Notifs y diálogos custom                              |
| 116–148| Format utils         | `formatEventDateRange`, etc                           |
| 149–200| Favorites            | Overlay localStorage sobre flag `favorite` de catalog |
| 201–372| Autosave             | Snapshot del State a localStorage cada X ms           |
| 373–644| Templates            | Presets reusables (params + items, sin cliente)       |
| 645–969| Compare              | Comparador side-by-side de cotizaciones guardadas     |
| 970–1199| State               | Estado central de la app                              |
| 1200–3818| Render              | **2618 líneas — el monstruo.** Render UI + PDF + cálculos |
| 3819+ | Init                  | Bootstrap                                             |

## Modelo de datos (Supabase)

Tablas reutilizadas del LOBBY:
- `catalogo_items` — el catálogo (compartido con LOBBY)
- `clientes`, `eventos_2026`, `proyectos_2026` — entidades del CRM

Tabla específica del Cotizador (extendida con ALTER):
- `cotizaciones` con columnas: `project_id`, `event_id`, `tipo_cotizacion`, `superficie`, `tipo_stand`, `altura`, `subtotal`, `iva`, `fecha_emision`, `full_state` (JSONB), `pdf_url`

Storage bucket: `cotizaciones-pdf` (público).

## Los 3 modos — diferencias mapeadas (parcial, completar en Fase B)

| Aspecto              | Stand                       | Expo                       | Alquiler                   |
|----------------------|-----------------------------|----------------------------|----------------------------|
| Parámetros           | Superficie, Frente, Prof, Tipo stand, Altura | Espacios (multi) | Espacios (multi)     |
| Estructura items     | Lista plana                 | Por espacio                | Por espacio                |
| Bloque HTML          | `#stand-params-block`       | `#expo-params-block`       | `#expo-params-block` (compartido) |
| Validación mín       | metraje >= 1 (JS) PERO `min="9"` HTML ❌ | spaces >= 1 + items     | spaces >= 1 + items        |
| Render PDF items     | `"${qty} - ${name}"`        | `"• ${qty}x ${name}"`      | `"• ${qty}x ${name}"`      |
| Altura aplica        | Sí (infrastructure + lighting) | ?? POR CONFIRMAR        | ?? POR CONFIRMAR           |
| Auto-cálculo metraje | Sí (perimeter/spots)        | No (manual)                | No (manual)                |
| Fee de Agencia       | Sí                          | Sí                         | Sí                         |

## Sistema de altura actual (database.js)

```js
heightMultipliers: [
  { id: "standard", name: "Estándar", height: "2,50m", multiplier: 1.0 },
  { id: "media",    name: "Media",    height: "3,00m", multiplier: 1.15 },
  { id: "plus",     name: "Plus",     height: "3,50m", multiplier: 1.25 },
  { id: "extra",    name: "Extra",    height: "4,00m", multiplier: 1.4 },
  { id: "maxima",   name: "Máxima",   height: "5,00m", multiplier: 1.7 }
],
heightAffectedCategories: ['infrastructure', 'lighting']
```

## Featureset positivo ya implementado

Favorites, Autosave, Templates, Compare, cotizaciones guardadas, número secuencial vía API, Export CSV, PDF jsPDF dark, autocomplete, Mobile FAB+drawer, shortcuts teclado, help tips, Toast+Confirm propios.

## Conclusión Fase A

El cotizador tiene mucho más feature-set del que parecía. La auditoría NO es "agregar cosas que faltan", es:
1. Ordenar lo que hay
2. Limpiar fricciones
3. Unificar UX entre los 3 modos
4. Agregar 2-3 cosas estratégicas (importador CSV, presets, modelo de alturas con variantes, schema normalizado)
