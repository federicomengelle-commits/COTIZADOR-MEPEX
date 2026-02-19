# MEPEX Cotizador - Integración con Notion

## Bases de Datos Conectadas

### 1. Catálogo de Items ✅
- **Ubicación**: mepex/inicio/catálogo
- **Database ID**: `2d17d508-0de8-8008-a227-ce63782f5745`
- **Propiedades**:
  - Item (title)
  - Código (rich_text)
  - Descripción (rich_text)
  - Categoría (multi_select)
  - Unidad (select)
  - Importe (number)

### 2. Clientes ✅
- **Ubicación**: mepex/inicio/crm/clientes
- **Database ID**: `1837d5080de880039615ce31eb560601`
- **Propiedades**:
  - Nombre Empresa (title)
  - Razón Social (rich_text)
  - CUIT (number)
  - Correo Electrónico (email)
  - Teléfono (phone_number)
  - Rubro (multi_select)

### 3. Proyectos 2026 ✅
- **Ubicación**: mepex/inicio/proyectos 2026
- **Database ID**: `2947d5080de880a6b75ed336e48599e9`
- **Propiedades**:
  - Cliente (title)
  - N° (number)
  - Área (rich_text)
  - Estado (status)
  - Fecha de solicitud (date)
  - Empresa (relation → Clientes)
  - Eventos 2026 (relation → Eventos)

### 4. Eventos 2026 ✅
- **Ubicación**: mepex/inicio/eventos 2026
- **Database ID**: `2947d5080de880c18569c2dc84652154`
- **Propiedades**:
  - Nombre (title)
  - Estado (select)
  - Fecha de armado (date)
  - Fecha de desarme (date)
  - Teléfono (phone_number)
  - Pabellón (multi_select)
  - Stands totales (number)
  - Stands terminados (number)
  - Prioridad (select)
  - Predio (relation)

---

## Endpoints API

| Endpoint | Método | Descripción | Estado |
|----------|--------|-------------|--------|
| `/api/catalog` | GET | Obtener items del catálogo | ✅ |
| `/api/catalog/schema` | GET | Estructura de la DB | ✅ |
| `/api/clients` | GET | Buscar clientes | ✅ |
| `/api/clients/search` | GET | Autocompletar clientes | ✅ |
| `/api/projects` | GET | Obtener proyectos | ✅ |
| `/api/projects/search` | GET | Autocompletar proyectos | ✅ |
| `/api/projects/:id` | GET | Proyecto con relaciones | ✅ |
| `/api/events` | GET | Obtener eventos | ✅ |
| `/api/events/search` | GET | Autocompletar eventos | ✅ |

---

## Arquitectura de Datos

```
┌─────────────────┐     ┌─────────────────┐
│    CLIENTE      │────►│    PROYECTO     │
└─────────────────┘     └────────┬────────┘
                                 │
                                 ▼
┌─────────────────┐     ┌─────────────────┐
│    EVENTO       │◄────│   COTIZACIÓN    │
└─────────────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │    CATÁLOGO     │
                        └─────────────────┘
```

---

## Notas de Implementación

1. Los campos Cliente, Proyecto y Evento serán autocomplete con búsqueda
2. Al seleccionar un Proyecto, se autocompletan Cliente y Evento (si están relacionados)
3. El PDF incluirá todos los datos del cliente seleccionado
