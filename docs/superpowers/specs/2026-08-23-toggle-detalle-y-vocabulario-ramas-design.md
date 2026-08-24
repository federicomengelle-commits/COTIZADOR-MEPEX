# Nivel de detalle del presupuesto + vocabulario de las cuatro ramas

> Diseño acordado con Fede el **2026-08-23**. Origen: el handoff del Lobby
> *"Para llevar al Cotizador — vocabulario de las ramas + toggle de detalle"*, escrito ese mismo
> día tras aplicar el ítem G10 de `PENDIENTES.md` del lado del Lobby.
>
> Todo lo que este documento afirma sobre el estado actual está **medido contra producción**,
> no supuesto. La evidencia está en §2.

---

## 1 · Qué se construye

Dos cosas que viajan juntas porque se pisan:

1. **Un selector de nivel de detalle** para los presupuestos multi-espacio, que hoy no existe:
   el nivel está atado al modo y no se puede elegir.
2. **El vocabulario de las cuatro ramas** — `Stand · Expo · Equipamiento · Energía` — incluyendo
   la rama **Energía**, que en el Cotizador no existe de ninguna forma.

### Las decisiones del dueño (cerradas, no se re-abren)

| | Decisión |
|---|---|
| **D1** | **Stand nunca discrimina. Nunca.** Deja de ser una consecuencia del modo y pasa a ser regla escrita. En Stand el selector **no se muestra**. |
| **D2** | El resto de las ramas llevan **tres niveles**, no dos. Ver §3.1 para por qué tres y no un toggle doble. |
| **D3** | **Default: Mínimo.** Premisa: *"siempre quiero pasar el menor detalle posible"*. |
| **D4** | El nivel **se elige antes de generar**, no se cambia dentro del preview. El preview refleja el nivel elegido. |
| **D5** | Las cotizaciones ya guardadas **se reimprimen como se enviaron**. |
| **D6** | El nivel toca **solo los PDFs**. El CSV queda siempre completo: es interno. |
| **D7** | Entra todo en la misma tanda: nivel + vocabulario + rama Energía. |
| **D8** | El movimiento de los ítems eléctricos en Supabase **lo hace esta sesión**, con dry-run previo. |

---

## 2 · Estado actual, medido

### 2.1 · Lo que el handoff acertó

- El nivel de detalle **está atado al modo**: Stand sale sin precios por ítem
  (`script.js` `exportPDF`, rama Stand; y `render.py` `_provision_stand` del motor), Expo/Alquiler
  sale con precio por ítem y subtotal por espacio.
- `full_state` alcanza para guardar el nivel: no hace falta columna nueva ni coordinar schema.
- El mapeo `rubro → key` hay que tocarlo **antes** de mover los ítems en la base.

### 2.2 · Lo que el handoff no sabía

**a) "Electricidad" no existe en el Cotizador.** Cero ocurrencias de `electricidad|energia|energía`
en todos los `.js/.html/.css`. Los modos son `stand | expo | alquiler`. Entonces §2.1 del handoff no
son dos renombres: es **un renombre** (Alquiler → Equipamiento) y **una rama nueva de cero**.

**b) Hay dos PDFs, no uno.** El acoplamiento modo→detalle está escrito dos veces:

| Salida | Dónde | Motor |
|---|---|---|
| **Presupuesto** | `script.js` `exportPDF` | jsPDF, cliente, 1 hoja, tema oscuro |
| **Propuesta comercial** | `propuesta.js` `buildPayload` → `/propuesta-api` | weasyprint, servidor, con renders |

**c) El motor de propuestas se rompe si le sacás los precios.** Cinco pruebas contra
`POST https://app.mepex.com.ar/propuesta-api/render-propuesta` (endpoint sin efectos de lado: el
guardado es una llamada aparte, `propuesta-storage.js`):

| Payload | Resultado |
|---|---|
| Expo con precios (lo de hoy) | **200** ✅ |
| **Expo sin `unitario`/`parcial`** | **500** — `Error de render: 'parcial'` |
| Expo con `unitario:"" parcial:""` | 200, pero imprime `4 · Silla Jacobsen $` — un `$` huérfano |
| Stand sin precios (lo de hoy) | **200** ✅ — `4 - Silla Jacobsen`, limpio |
| `espacios: []` | 200, pero deja la cabecera de tabla vacía |

**La causa exacta:** `espacios` es un campo **extra** del modelo pydantic (`Detalle` declara solo
`rubros`; `extra="allow"` lo deja pasar). Al no validarse contra `Item`, llega como dict crudo sin la
clave `parcial`, y `render.py:427` hace `it["parcial"]` → `KeyError`. `rubros` nunca falla porque sí se
valida y pydantic rellena `""`.

**d) El motor en el VPS no es un repo git.** `~/generador-propuesta` no tiene `.git` ni remote. Es la
**única copia viva**. Backup obligatorio antes de editar; deploy = editar en el lugar + `pm2 restart
propuesta-api`. Acceso: SSH como **`mepex`** (no `root`), key `mepex_key.ppk` vía `plink`.

**e) Son cinco ítems eléctricos, no tres.** Dry-run sobre `catalogo_items`:

| id | nombre | rubro | `es_cotizable` | `precio_alquiler` |
|---|---|---|---|---|
| 52 | Tablero seccional monofásico | Iluminación | ✅ | 93.000 |
| 1 | Tablero seccional trifásico | Iluminación | ✅ | 105.000 |
| 55 | Tomacorriente doble | Iluminación | ✅ | 25.000 |
| 80 | Tablero de obra. | Iluminación | ❌ | 0 |
| 72 | Tablero doble comando | Iluminación | ❌ | 0 |

Los tres que nombra el handoff son los cotizables. Los otros dos son invisibles para el Cotizador
pero **visibles para Costos en LOBBY** → quedan fuera de esta tanda y se le avisan a Fede (§7).

**f) Prod ya tiene dominio.** `http://195.200.1.250/...` redirige a **`https://app.mepex.com.ar/...`**.
`CLAUDE.md` todavía documenta la IP pelada.

**g) No existe rubro `Energía`.** Panorama actual (activos, con rubro): Infraestructura 241 ·
Equipamiento 76 · Iluminación 19 · Pisos 8 · Más servicios 6 · Marketing 2.

---

## 3 · Diseño

### 3.1 · Por qué tres niveles y no un toggle doble

Fede pidió "doble toggle" — poder mandarlo de las dos maneras. Dos toggles independientes
(`¿precio por ítem?` × `¿subtotal por espacio?`) dan cuatro combinaciones, y una es basura:

| | precio x ítem | subtotal x espacio | |
|---|---|---|---|
| **1 · Mínimo** | no | no | piezas de cada espacio; un solo número al final |
| **2 · Medio** | no | sí | piezas + cuánto sale cada espacio |
| **3 · Detallado** | sí | sí | lo que hace Expo hoy |
| ~~4~~ | sí | ~~no~~ | *le mostrás cada precio pero no se los sumás* — nadie pide eso |

Los ejes no son independientes: mostrar precio por ítem **implica** el subtotal del espacio. Un
control de tres posiciones cubre lo mismo con un botón menos que explicar.

**El costo no está en las posiciones, está en la cañería** — que el nivel viva en el estado,
sobreviva al borrador, entre en `full_state`, se restaure al cargar, y alimente los dos PDFs. Esa
cañería es idéntica para dos posiciones o para tres. La tercera sale casi gratis.

### 3.2 · El control

Selector de tres posiciones en los parámetros generales, junto al tipo de cotización. **Oculto en
Stand** (D1). Default `minimo` (D3). Vive en `State.generalParams.detailLevel`.

Valores internos: `'minimo' | 'medio' | 'detallado'`.

### 3.3 · Persistencia

| Camino | Cómo |
|---|---|
| **Borrador** | Gratis: el autosave serializa `generalParams` entero. |
| **`full_state`** | Se agrega al nivel superior de `_collectCurrentState`, al lado de `proposalText` (mismo patrón). |
| **Restaurar** | `_restoreState` lo lee. **Si no viene** (cotizaciones previas a este cambio) → `'detallado'`, que es como se enviaron (D5). El default `minimo` aplica solo a cotizaciones nuevas. |

> La asimetría entre el default (`minimo`) y el fallback de restauración (`detallado`) es
> **deliberada** y es la implementación literal de D5. Reimprimir una cotización vieja tiene que
> devolver lo que se mandó, no algo distinto.

### 3.4 · Presupuesto (jsPDF)

La rama multi-espacio de `exportPDF` consulta el nivel:

| Nivel | Monto por ítem | Subtotal del espacio |
|---|---|---|
| `detallado` | sí (igual que hoy) | sí |
| `medio` | no | sí |
| `minimo` | no | no |

La rama Stand **no se toca**. El scale-to-fit tampoco: menos texto solo facilita que entre en una
hoja. Se mantiene la anti-regresión de que `s=1` dibuje idéntico al PDF actual en Detallado.

### 3.5 · Propuesta (motor weasyprint)

`buildPayload` manda `nivel_detalle` en el payload. En `_provision_espacios` de `render.py`:

1. `it["parcial"]` → `it.get("parcial", "")` (la causa del 500, se arregla aunque no se use el nivel).
2. La columna de precio y el `$` se emiten **solo** en `detallado`; si no, la fila queda
   `{cant} - {desc}`, igual que la del Stand que ya sale limpia.
3. La fila `Subtotal {espacio}` se emite solo en `detallado` y `medio`.

> **Refinamiento sobre el diseño original (decidido al implementar).** El front manda
> **siempre** los importes y agrega `nivel_detalle`; el motor decide cuáles imprimir. La
> alternativa — que el front omitiera las claves de precio — dejaba el sistema frágil al
> ORDEN de deploy: un front nuevo contra un motor viejo daba **500**. Así, un motor viejo
> ignora el campo y dibuja detallado: feo, pero no roto. Degradar antes que romper.
> Efecto lateral bueno: el cambio del lado del front quedó en una sola línea.

`_provision` y `_provision_stand` **no se tocan**. El caso `espacios: []` (cabecera vacía) queda como
está: `validateForExport` ya impide exportar sin espacios con ítems, así que no es alcanzable.

### 3.6 · Vocabulario

**Criterio: cambia la etiqueta, no el identificador.** Es el mismo que ya tomó el Lobby con los
códigos `SRV-*`, y por la misma razón: renombrar el valor interno `alquiler` rompería la
restauración de borradores y cotizaciones guardadas que lo tienen adentro de `full_state`, sin ganar
nada.

| Capa | Antes | Después |
|---|---|---|
| Botón, labels de UI, títulos de PDF | `Alquiler` | **`Equipamiento`** |
| Valor interno (`quotationType`, `data-type`) | `alquiler` | **`alquiler`** (sin cambio) |
| `typeMap` del server → `tipo_cotizacion` | `alquiler → 'Alquiler'` | `alquiler → 'Equipamiento'` |

`typeMap` final, las cuatro palabras acordadas:
`stand → Stand` · `expo → Expo` · `alquiler → Equipamiento` · `energia → Energía`.
En los dos lugares donde vive (POST y PUT de `/api/quotations`).

### 3.7 · Rama Energía

**Modo**: cuarto botón, valor interno `energia`. Multi-espacio como Expo, con el mismo selector,
arrancando en Mínimo. Entra en `isMultiSpaceMode()` y en la migración de modos.

**Categoría**: `energy` en `DATABASE.categories` (`database.js`), nombre "Energía", `order: 4`
(entre Iluminación y Equipamiento, que es donde cae naturalmente), y correr los `order` siguientes.

**Mapeo**: `'energia': 'energy'` en el `rubroMap` de `api.js`.

**🟥 Y además: sacar `electric` del fallback de Iluminación.** Hoy
`api.js:210` manda cualquier cosa que matchee `/electric/` a `lighting`, y `api.js:213` manda
`/tablero/` a `equipment`. Sin tocar eso, los tableros siguen cayendo entre los reflectores por la
puerta de atrás aunque el rubro diga Energía. Los patrones eléctricos (`electric`, `tablero`,
`tomacorriente`, `disyuntor`, `termomagnetic`, `seccional`) pasan a resolver a `energy`, y se
verifica que el orden de evaluación los agarre antes que `lighting` y `equipment`.

**Base**: recién al final, y solo los tres cotizables (§2.2e), con dry-run antes y después.

---

## 4 · Orden de ejecución

El orden importa: si los ítems se mueven antes que el mapeo, no "desaparecen" — caen en
**Equipamiento**, mezclados con las sillas.

```
1. Nivel de detalle: estado + persistencia + control en la UI
2. Nivel de detalle: presupuesto jsPDF
3. Nivel de detalle: propuesta (payload + motor en el VPS + restart)
4. Vocabulario: Alquiler → Equipamiento (labels) + typeMap de las 4 palabras
5. Energía: modo + categoría + mapeo + fallback de palabras clave
6. Base: mover los 3 ítems cotizables a rubro 'Energía'   ← recién acá
7. Documentación: CLAUDE.md + HANDOFF.md + memoria
```

## 5 · Verificación

- `node --check` sobre cada `.js` tocado.
- **Anti-regresión del presupuesto**: en Detallado con `s=1`, el PDF tiene que salir idéntico al
  actual.
- **Los tres niveles**, en presupuesto y en propuesta, mirando el PDF — no solo el HTTP 200. Para la
  propuesta, extraer el texto del PDF y confirmar qué filas aparecen y cuáles no.
- **El 500 arreglado**: el payload que hoy revienta tiene que devolver 200 con la fila limpia.
- **Restauración**: guardar en Detallado, recargar, confirmar que vuelve en Detallado; y que una
  cotización sin el campo también.
- **Los 3 ítems**: dry-run antes, UPDATE, y SELECT después confirmando que `/api/catalog` los
  devuelve bajo `energy`.

## 6 · Fuera de alcance

- Los guiones de brief de las otras tres ramas (§5 del handoff) — no es trabajo de código.
- El nivel de detalle en CSV y Compare (D6).
- `_provision` y `_provision_stand` del motor.
- Los dos ítems eléctricos **no cotizables** (ids 80 y 72) — ver §7.
- Poner un `CHECK` en `cotizaciones.tipo_cotizacion`: el server ya normaliza vía `typeMap`, y un
  constraint en tabla compartida hay que coordinarlo con el Lobby.

## 7 · Para avisarle al Lobby

1. **Los dos eléctricos no cotizables** (id 80 "Tablero de obra.", id 72 "Tablero doble comando")
   quedan en Iluminación. No afectan al Cotizador, pero si Costos agrupa por rubro, la rama Energía
   le va a quedar incompleta. Decisión de Fede.
2. **`tipo_cotizacion` empieza a escribir `Equipamiento` y `Energía`.** El trigger
   `trigger_cotizacion_aprobada_crea_proyecto` hace `UPPER(TRIM(...))` y lo propaga a
   `proyectos.tipo` → van a empezar a aparecer `EQUIPAMIENTO` y `ENERGÍA`.
3. **El rubro `Energía` nace en `catalogo_items`.** Si algún módulo del Lobby tiene la lista de
   rubros hardcodeada, hay que sumarlo.
