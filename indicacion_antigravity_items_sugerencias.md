# CAMBIO DE UX: Sistema de selección de items con sugerencias inteligentes

## Problema actual
La página principal del cotizador muestra la lista completa de items de cada rubro. Esto genera mucho scroll, ruido visual y complejidad innecesaria en la pantalla de trabajo.

## Cambio solicitado

### Página principal del cotizador
- **Eliminar** la grilla/catálogo completo de items de la vista principal
- La selección de items se hace desde **Configuración** (ya existe en el sidebar)
- En la página principal solo se ve:
  - Parámetros del proyecto (arriba)
  - Resumen lateral de cotización (derecha)
  - Los items ya seleccionados (en el centro, de forma limpia, con botones de + y - para aumentar o disminuir la cantidad, y un botón de eliminar para eliminar el item de la cotización). 

---

## Nueva mecánica de selección de items (dentro de Configuración)

### Campo de búsqueda/selección
- Un **campo de texto tipo searchbar** donde el usuario escribe para buscar items
- Al escribir, se filtran y sugieren items del catálogo (autocomplete)
- Al seleccionar un item, se agrega al presupuesto con cantidad inicial = 1
- Los items seleccionados se listan debajo del campo, con controles de cantidad (+/-) y opción de eliminar

### Sugerencias inteligentes de items relacionados
Cuando el usuario agrega un item, el sistema sugiere automáticamente otros items que suelen ir juntos. Funciona como un autocompletado predictivo basado en relaciones entre items.

#### Ejemplos de relaciones:
| Al agregar... | Sugerir... |
|---|---|
| Stand con altura > Estándar | Pórticos, cenefa, iluminación en altura |
| Tablero seccional trifásico | Reflectores LED, tomas de corriente |
| Mesa de reunión | Sillas, mantelería |
| Counter de atención | Banquetas/taburetes, gráfica para counter |
| Auditorio (como espacio) | Sillas apilables, atril, proyector, pantalla, sonido |
| Acreditaciones (como espacio) | Counter, PC/notebook, impresora de credenciales |
| Alfombra/piso | Zócalo perimetral |
| Cualquier stand tipo Isla | Iluminación perimetral completa |

#### Comportamiento de las sugerencias:
- Aparecen como **chips o tarjetas pequeñas** debajo del campo de búsqueda, con un label tipo: "¿También necesitás...?" o "Sugerido:"
- El usuario puede aceptar (click/tap) o ignorar
- Las sugerencias desaparecen si el usuario las descarta o ya agregó ese item
- **No son obligatorias**, solo asistenciales
- Las relaciones entre items se definen en una tabla/base de datos (puede ser en Notion o dentro de la app) para poder editarlas sin tocar código

---

## Visualización en la página principal (post-selección)

Una vez seleccionados los items en Configuración, la página principal muestra solo:
- Lista compacta de items seleccionados, agrupados por rubro
- Formato limpio: nombre del item + cantidad (sin la grilla completa del catálogo)
- El resumen lateral se actualiza en tiempo real como ya funciona

---

## Resumen del cambio

| Antes | Después |
|---|---|
| Catálogo completo visible en página principal | Catálogo solo visible en Configuración |
| Selección por scroll y browse | Selección por búsqueda + sugerencias |
| Sin sugerencias | Sugerencias inteligentes de items relacionados |
| Mucho ruido visual | Vista principal limpia, solo items seleccionados |

---

## Base de datos de relaciones (para las sugerencias)
Se necesita una tabla de relaciones que vincule items entre sí. Estructura mínima:

- **Item trigger**: el item que dispara la sugerencia
- **Items sugeridos**: lista de items relacionados
- **Condición** (opcional): por ejemplo, "solo si altura > Estándar" o "solo si tipo = Isla"

Esta tabla debe ser editable (idealmente desde Notion o desde la sección Configuración de la app) para que MEPEX pueda ir ajustando las relaciones sin depender de desarrollo.
