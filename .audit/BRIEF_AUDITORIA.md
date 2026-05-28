# BRIEF — Auditoría y Refactor COTIZADOR-MEPEX

> Documento de contexto. Leelo entero antes de cualquier acción.
> Generado en sesión Claude.ai previa al handoff a Claude Code.

## 1. Contexto del proyecto

**COTIZADOR-MEPEX** es el cotizador de stands/expos/alquiler de MEPEX. SPA vanilla JS desplegada en `http://195.200.1.250/cotizador/`. Comparte instancia Supabase con LOBBY-MEPEX. Repo: `federicomengelle-commits/COTIZADOR-MEPEX`.

**Objetivo del proyecto de refactor**: auditoría total + rediseño visual homogéneo (estilo LOBBY/`inventario.js`) + corrección de bugs + nuevas features (importador CSV desde 3dsMax, presets de stand a evaluar, modelo de alturas mejorado). Sin deadlines, calidad sobre velocidad. Se ejecuta en paralelo a otros frentes de LOBBY.

**Filosofía**: ordenar lo que hay, limpiar fricciones, unificar UX entre los 3 modos, agregar features estratégicos. NO reescribir desde cero. Cuidar IFs sensibles entre modos.

## 2. Los 3 modos de cotización (CRÍTICO)

Hay **reglas diferenciadas** entre los 3. Cualquier cambio debe respetar y documentar cada diferencia:

- **Stand**: Cotización de un stand único. Params: superficie, frente, profundidad, tipo (centro/esquina/península/isla), altura, modificador %. Items en lista plana. Auto-cálculo de cantidades vía perímetro/spots.
- **Expo**: Cotización con múltiples espacios. Cada espacio tiene sus items. Sin auto-cálculo.
- **Alquiler**: Igual estructura que Expo (multi-espacio), reglas de pricing distintas.

Todos comparten: Cliente/Proyecto/Evento, Fee de Agencia, validaciones base.

## 3. Hallazgos ya confirmados en Fase A

### Bug <9m² (alta prioridad)
- **Causa**: `index.html` línea 132 → `<input id="input-metraje" min="9">`. Validación nativa del browser bloquea valores menores.
- **JS acepta ≥1** (`script.js` línea 2949).
- **Fix**: cambiar `min="9"` a `min="1"`. Verificar que `calculateAutoQuantity` en `database.js:217` se comporte bien con metrajes chicos (perímetro y spots).

### Unidades mal exportadas en PDF (alta prioridad)
- **Modo Stand** (`script.js:3504`): `${item.quantity} - ${item.name}` → produce `"15 - vinilo impreso"`.
- **Modo Expo/Alquiler** (`script.js:3585-3587`): `• ${item.quantity}x ${item.name}` → produce `"• 15x vinilo impreso"`.
- **Ninguno usa `item.unit`**. Debería decir `"15 m² — vinilo impreso"`.
- Además los formatos son **inconsistentes entre modos**. Unificar.

### Render monstruoso (refactor estructural)
- `script.js` línea 1200–3818 → 2618 líneas en una sola sección `const Render = {…}`.
- Mezcla: render de cards, render de summary, cálculos de pricing, export PDF, export CSV, validaciones.
- Decisión tomada: **partir en 5 módulos** → `render-ui.js`, `render-pdf.js`, `render-csv.js`, `pricing.js`, `validation.js`.

### Schema Supabase mínimo (refactor estructural)
- `cotizaciones` extendida con ALTERs simples + columna `full_state JSONB`.
- Todo el detalle de items vive en JSON, lo que impide queries útiles ("ítem más cotizado", reportes, dashboards LOBBY).
- Decisión tomada: **normalizar** con tabla `cotizacion_items` separada. El JSONB se mantiene como respaldo/snapshot, pero los datos consultables van en columnas reales.

## 4. Modelo de alturas — propuesta acordada

### Estado actual
`database.js` define 5 niveles globales con multiplicadores (1.0 / 1.15 / 1.25 / 1.4 / 1.7) que se aplican SOLO a categorías `infrastructure` y `lighting`. Resto de categorías no afectadas.

### Problemas
1. Los porcentajes son altos. Fede quiere bajarlos (a definir números exactos en la fase de propuesta).
2. No contempla **piezas individuales con altura propia**. Ejemplos textuales de Fede:
   - *"cenefa h=5,00m h=1,25m (mL)"* → es la misma pieza que la de altura común pero con modificador propio.
   - Panel de 5m vs panel de 2,50m en Expos → debería tener variante directa.
   - Pórtico con placa h=4m y h=2,5mL, frente y reverso → cada parte tiene precio unitario.
3. El 3dsMax va a exportar piezas con códigos específicos. El cotizador tiene que poder recibir esos códigos directo desde el CSV.

### Propuesta acordada con Fede
- **Mantener** el multiplicador global del stand (modo Stand), pero con porcentajes más bajos.
- **Agregar** al catálogo (`catalogo_items` en Supabase) un sistema de **variantes por ítem**: cada ítem puede tener variantes con altura propia y precio propio (ej: "Panel" → [h=2,50 / h=4,00 / h=5,00]).
- En Stand: el multiplicador global sigue aplicando como hoy, pero items con variantes pueden ignorarlo (la variante ya tiene su precio).
- En Expo/Alquiler: las variantes son la única forma de manejar alturas (no hay multiplicador global).
- El CSV de 3dsMax mapea contra códigos de variante específica.

## 5. Importador CSV desde 3dsMax

### Estado actual
No existe. 3dsMax exporta hoy una lista de materiales que se usa manualmente para presupuestos.

### Requerimientos definidos
- **Mapeo**: cada material del CSV tiene un código único que matchea contra `catalogo_items` (o tabla de variantes).
- **Comportamiento si no existe el material**: alerta visible para que Fede pueda crear el ítem en la DB y reimportar. NO crear automáticamente, NO ignorar silenciosamente.
- **Destino**: importar a una cotización (nueva o existente, a definir en UX).
- **Aplica a**: principalmente Stand. En Expo/Alquiler podría tener menos uso porque la modulación es más estándar.
- **No hay muestra de CSV todavía**. Tenemos que definir el formato ideal que 3dsMax debería exportar, y Fede lo adapta del lado de Max.

## 6. Patrón visual de referencia

**LOBBY-MEPEX → `inventario.js`** es el canon. Está en memoria del skill `lobby-module-builder`.

- Dark theme
- Fuentes: Space Mono + Outfit/Archivo
- CSS prefix scoping (`.inventario-*`, acá sería `.cotizador-*`)
- Cards más chicas, densas, con priorización de favoritos/más usados arriba
- Filtros y agrupaciones colapsables para esconder lo que no se usa seguido
- Vista cards + vista tabla, ambas funcionales y consistentes

## 7. Featureset actual que NO se rompe

- Favorites (overlay localStorage sobre flag de catálogo)
- Autosave del borrador en localStorage
- Templates (snapshots de params+items sin datos de cliente)
- Compare (lado a lado de cotizaciones guardadas)
- Número secuencial vía API + fallback localStorage
- Export PDF (jsPDF) con dark theme
- Export CSV
- Autocomplete cliente/proyecto/evento
- Mobile FAB + drawer
- Shortcuts (Ctrl+K, ?, Esc)
- Help tips
- Toast + Confirm custom

## 8. Featureset propuesto a evaluar

- **Presets de stand prediseñado**: cargar "stand base 30m² centro altura standard" con todos sus ítems precargados, y permitir agregar/quitar piezas. Solo si la complejidad lo justifica.
- **Mejora del bucket de presupuesto**: más adornado, mejor jerarquía visual, respetando estética actual.
- **Importador CSV** (ver punto 5).

## 9. Limpieza a definir (NO eliminación bruta)

- `migrate-notion-to-supabase.js` → legacy, se elimina.
- `DETENER SERVIDOR.bat`, `INICIAR COTIZADOR.bat`, `NOTION_INTEGRATION.md` → legacy local, se eliminan (ahora se usa solo online).
- Resto: requiere análisis caso por caso. NO eliminar sin entender.

## 10. Reglas de trabajo (heredadas de la sesión)

1. **Nunca proponer schema sin ver data real.** Pedir SELECTs antes.
2. **SQL en bloques de código solo si es ejecutable inmediato.** Futuro SQL va aparte y comentado.
3. **Dry-run SELECTs antes de cualquier UPDATE en producción.** No negociable.
4. **2-query strategy** para joins en Supabase (parent IDs primero, después children).
5. **`Auth.getUser().uid`** (no `.id`).
6. **localStorage es anti-patrón** para datos de negocio. Para drafts y preferencias UI sí.
7. **Fases browser-testables después de cada commit**. No bigbangs.
8. **Patrón canónico: `inventario.js` de LOBBY.**
9. **Skill activable**: `lobby-module-builder` en `/mnt/skills/user/`.

## 11. Stack técnico

- Vanilla JS ES6+, SPA
- Supabase (PostgreSQL + Auth + Storage)
- Express backend (`server/index.js`)
- jsPDF para PDFs
- Hospedaje: VPS 195.200.1.250 (Hostinger, Ubuntu 24.04, São Paulo)
- Deploy: `~/pull-cotizador.sh`
- Local dev: `C:\Users\Fede\Desktop\APPS ANTIGRAVITY\COTIZADOR-MEPEX` (a confirmar)

## 12. Cosas sensibles que NO se tocan sin avisar

- Flujo de guardado a Supabase (recién arreglado, funciona).
- Numerador secuencial de cotizaciones.
- Catálogo compartido con LOBBY (`catalogo_items` es la misma tabla que usa el módulo Costos de LOBBY — cualquier columna nueva debe coordinarse).
- IFs entre los 3 modos (documentarlos antes de cambiarlos).
