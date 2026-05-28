# PROMPT FASE B — Diagnóstico Funcional del Cotizador

> **Para Claude Code.** Ejecutar SOLO la Fase B. NO escribir código todavía.
> Entrada: este prompt + `BRIEF_AUDITORIA.md` + `01_mapa_arquitectonico.md`.
> Salida: un único archivo `AUDITORIA_HALLAZGOS.md` en la raíz del repo.

---

## Tu rol en esta fase

Sos un auditor técnico. NO escribís código de implementación. Solo leés, analizás, documentás. Cualquier propuesta de cambio va en el documento de hallazgos, NO en el código.

Si en algún momento sentís la tentación de "aprovechar y corregir esto que es de 1 línea", **NO LO HAGAS**. Anotalo. La implementación es otra fase.

## Lectura previa obligatoria

Antes de tocar nada, leé en este orden:
1. `BRIEF_AUDITORIA.md` — contexto del proyecto
2. `01_mapa_arquitectonico.md` — foto ya armada del repo

NO repitas el trabajo de la Fase A. Esos hallazgos ya están confirmados.

## Qué tenés que auditar (alcance)

### Bloque 1 — Reglas diferenciadas entre los 3 modos (CRÍTICO)

Leé `script.js` completo y documentá **TODOS** los `if` que ramifican lógica por `quotationType` (stand / expo / alquiler). Para cada uno:
- Línea exacta
- Función contenedora
- Qué hace cada rama
- Si la diferencia es intencional o parece bug/inconsistencia
- Si hay reglas que aplican a un modo y "deberían" aplicar a otro

Esto es el activo más importante de la Fase B. Sin este mapa, cualquier refactor rompe cosas.

Salida: tabla en `AUDITORIA_HALLAZGOS.md` sección "Mapa de IFs por modo".

### Bloque 2 — Pricing y altura

- Mapear flujo completo del cálculo de subtotal. Desde que el usuario toca un item hasta que aparece el total. Funciones involucradas, en orden.
- Identificar dónde y cómo se aplica `heightMultiplier`. Confirmar/desmentir si aplica en Expo y Alquiler (en Fase A quedó como POR CONFIRMAR).
- Detectar acoplamientos: ¿hay cálculos duplicados en el render principal y en el PDF? ¿se calcula lo mismo dos veces con riesgo de divergir?
- Documentar el flujo del **Modificador personalizado** (campo `modifier-percentage`) y del **Fee de Agencia** — en qué orden se aplican, sobre qué se aplican.

### Bloque 3 — Export PDF y CSV — formato y unidades

- Documentar cómo se renderiza cada línea de ítem en el PDF en cada modo.
- Documentar el bug de unidades ya identificado (línea 3504 y 3585-3587) con propuesta de formato unificado.
- Revisar si el PDF expone correctamente: cliente, proyecto, evento, fecha, número de cotización, aporte de altura, subtotal/IVA/total, modificadores.
- Detectar posibles mejoras de jerarquía visual del PDF (tipografía, espacios, agrupaciones) — sin proponer rediseño total, solo lo que esté claramente desprolijo.
- Verificar export CSV: ¿qué columnas tiene? ¿usa unidades correctamente? ¿sirve para reimportar o solo para Excel humano?

### Bloque 4 — UI/UX

Revisar y listar problemas en:
- **Cards del catálogo**: tamaño, densidad, info redundante, info faltante.
- **Filtros y categorías**: ¿se pueden colapsar? ¿hay forma de ver solo favoritos? ¿la búsqueda funciona bien?
- **Vista cards vs tabla**: ¿existe vista tabla? Si existe, ¿es consistente con cards? Si no existe, anotarlo.
- **Bucket (cotizaciones guardadas)**: revisar modal de carga, qué info muestra, qué se podría mejorar.
- **Templates**: igual revisión.
- **Compare**: igual revisión.
- **Admin panel**: qué hace, qué tan accesible es, qué le falta.
- **Mobile**: cómo se comporta el FAB y el drawer, problemas observables en el CSS responsive.

Para cada problema:
- Selector / componente / archivo:línea
- Descripción del problema
- Severidad (alta / media / baja)
- Propuesta de mejora (1-3 líneas)

### Bloque 5 — Validaciones

- Listar todas las validaciones existentes
- Identificar validaciones faltantes (ej: ¿qué pasa si seleccionás 0 metros frontales? ¿si modificador es -100%?)
- Confirmar el bug del `min="9"` y verificar si hay otros límites HTML que entren en conflicto con la lógica JS

### Bloque 6 — Schema Supabase y persistencia

- Leer `server/index.js` y mapear los endpoints (path, método, qué tabla toca, qué hace).
- Leer `api.js` y `quotation-storage.js` para entender el flujo cliente → server → DB.
- Pedir a Fede SELECTs reales que necesites para entender estructura actual de `cotizaciones` (qué columnas existen además de las del setup.sql, qué hay en `full_state` típicamente). NO INVENTAR. Si necesitás data, pedila explícita.
- Proponer modelo normalizado: tabla `cotizacion_items` y, si aplica, `cotizacion_espacios`. Documentar columnas propuestas, FKs, índices.
- Documentar estrategia de migración: cómo poblar la nueva tabla a partir del `full_state` JSONB existente sin perder data.

### Bloque 7 — Modelo de alturas con variantes

Es una **propuesta nueva**, no algo a auditar en el código actual. Documentar:
- Estructura propuesta de `variantes` en `catalogo_items` (¿columna JSONB? ¿tabla aparte `catalogo_items_variantes`?). Recomendar una con trade-offs.
- Cómo cambia la UI del catálogo cuando un ítem tiene variantes (dropdown, chips, modal).
- Cómo interactúan multiplicador global de stand + variantes (regla: si el ítem tiene variante seleccionada, NO aplicar multiplicador global; sí aplicar si está en altura "default").
- Cómo se serializan al guardar la cotización (qué identificador queda registrado: id del ítem base + id de variante, o id único de variante).
- Cómo mapea el CSV de 3dsMax: ¿por código de variante directo? Confirmar.

### Bloque 8 — Importador CSV desde 3dsMax

- Proponer formato ideal del CSV (columnas, encoding, separador, encabezados). Ejemplo concreto de 3-5 filas.
- Flujo UX propuesto: dónde está el botón, qué pasa al cargar, cómo se muestran materiales no encontrados, cómo se aplican a la cotización.
- Validaciones del importer (duplicados, cantidades negativas, códigos inválidos).
- Comportamiento en cada uno de los 3 modos (probablemente solo Stand al principio).

### Bloque 9 — Presets de stand (PROPUESTA A EVALUAR)

- Analizar si tiene sentido implementar dado lo que ya existe (Templates).
- ¿Es lo mismo que Templates con otro nombre? ¿O es genuinamente distinto?
- Si conviene, proponer flujo. Si no conviene, recomendar descartar y explicar por qué.

### Bloque 10 — Refactor estructural propuesto

Partiendo de la decisión ya tomada (`render-ui.js`, `render-pdf.js`, `render-csv.js`, `pricing.js`, `validation.js`):
- Mapear, para cada uno de los 5 módulos nuevos, qué funciones actuales del `Render` actual van adentro.
- Identificar dependencias cruzadas que van a ser problemáticas (ej: `render-pdf` necesita resultado de `pricing`).
- Proponer estrategia de extracción: cuál se extrae primero, cuál depende de cuál.
- Proponer convención CSS: prefix `.cotizador-*`, mismo enfoque que `inventario.css` en LOBBY.

### Bloque 11 — Limpieza

Lista de archivos / código a eliminar con justificación. NO eliminar todavía, solo listar.

### Bloque 12 — Riesgos y zonas frágiles

Cualquier cosa que detectes que sea frágil y pueda romperse en el refactor. Específicamente:
- Flujo de guardado a Supabase (recién arreglado por Fede, NO tocar sin avisar).
- Numerador secuencial.
- Acoplamiento con `catalogo_items` que también usa LOBBY.

## Formato de salida

Un único archivo: `AUDITORIA_HALLAZGOS.md` en la raíz del repo.

Estructura:

```markdown
# AUDITORÍA COTIZADOR-MEPEX — Hallazgos (Fase B)

## Resumen ejecutivo
[10-15 líneas. Hallazgos críticos, decisiones clave que Fede tiene que tomar en la siguiente fase, estimación de complejidad del refactor]

## 1. Mapa de IFs por modo
[Tabla completa]

## 2. Pricing y altura
...

## 3. Export PDF y CSV
...

[... hasta Bloque 12]

## Decisiones pendientes para Fede
[Lista numerada de TODAS las decisiones que requieren input humano antes del prompt maestro Fase D. Cada una con: contexto breve, 2-3 opciones con trade-offs, recomendación tuya con justificación]

## Anexo A — Archivos analizados
[Lista de archivos leídos]

## Anexo B — Queries SQL pendientes para Fede
[Si necesitaste data real y no la tuviste, listá los SELECTs que Fede tiene que correr y devolver]
```

## Reglas de proceso

1. **No escribir código de producción**. Solo análisis y propuestas en el `.md`.
2. **Si necesitás data real de Supabase**, pedila explícita en el Anexo B con el SELECT exacto. No inventes estructura.
3. **Si encontrás algo que no entendés**, marcalo como `⚠️ NECESITA CLARIFICACIÓN DE FEDE` con la pregunta concreta.
4. **Severidad de hallazgos**: usá `[ALTA]`, `[MEDIA]`, `[BAJA]` consistentemente.
5. **Cada hallazgo cita archivo:línea**. No vale "en algún lado del render".
6. **No proponer nada sin trade-off**. Toda propuesta lleva al menos pros/contras o alternativas descartadas.
7. **Respetar el featureset positivo** listado en el BRIEF. NO proponer eliminarlos sin justificación fuerte.

## Cuándo terminás

Cuando `AUDITORIA_HALLAZGOS.md` está completo y revisado por vos mismo (Claude Code). Hacé una pasada final preguntándote: "¿Fede puede tomar todas las decisiones que faltan con este documento, o le falta info?". Si falta info, agregala antes de cerrar.

NO ejecutar Fase C ni Fase D. Esperar a que Fede valide y abra una sesión nueva.
