# HANDOFF — COTIZADOR-MEPEX (sesión 2026-08-23)

> Para retomar en un chat nuevo. Leer también `CLAUDE.md` (contexto durable) y el spec de esta
> sesión: `docs/superpowers/specs/2026-08-23-toggle-detalle-y-vocabulario-ramas-design.md`.

## 📍 Estado

- **Origen**: el handoff del Lobby *"Para llevar al Cotizador — vocabulario de las ramas + toggle de
  detalle"*, tras aplicar allá el ítem G10 de `PENDIENTES.md`.
- **Prod**: `https://app.mepex.com.ar/cotizador/` (la IP redirige). VPS `~/cotizador`, pm2 `cotizador-api`.
- **Commits**: `a894750` (spec) · `151fdcd` (nivel de detalle) · `a5bec26` (ramas + Energía) · `93c1368` (docs).

## ✅ Hecho esta sesión — TODO verificado, no supuesto

| | Qué |
|---|---|
| **Nivel de detalle** | Selector de 3 posiciones (Mínimo/Medio/Detallado) para Expo/Equipamiento/Energía. **Stand nunca discrimina**: regla dura en `State.detailLevel()`, el selector ni se muestra. Default Mínimo. Se elige ANTES de generar; el preview lo refleja. |
| **Los dos PDFs** | El acoplamiento modo→detalle estaba escrito **dos veces**: `exportPDF` (jsPDF) y el motor weasyprint. Los dos honran el nivel ahora. |
| **Motor de propuestas** | Arreglado el **500** (`KeyError 'parcial'`) + los tres niveles. Desplegado en el VPS con backup (`render.py.bak-20260823`). |
| **Vocabulario** | *Alquiler → Equipamiento* en todo lo visible, **incluido el badge de la carátula de la propuesta, que lo ve el cliente y decía "ALQUILER"**. Clave interna `alquiler` intacta. |
| **`tipo_cotizacion`** | El `typeMap` del server escribe las 4 palabras acordadas. |
| **Rama Energía** | Modo nuevo (multi-espacio), rubro `energy` (order 4), mapeo, y los 3 ítems eléctricos movidos en Supabase. |
| **Cross-sell** | `lighting → energy` en `_GHOST_AFFINITY`: cargar reflectores ahora sugiere el tablero. Antes era imposible (vivían en el mismo rubro). |

**Verificaciones corridas** (no "debería andar"):
- Los 3 niveles en el **presupuesto**, leyendo el PDF generado con montos distinguibles del subtotal
  (el primer test daba falso positivo porque con 1 ítem por espacio el monto del ítem *es* el subtotal).
  **El total da igual en los tres niveles** — se cambia lo que se muestra, nunca lo que se cobra.
- Los 3 niveles en la **propuesta**, contra el motor real en prod, extrayendo el texto del PDF.
  `detallado` sale idéntico al anterior (anti-regresión).
- **Ida y vuelta de persistencia**: guardar → restaurar → draft → reset. Y una cotización **sin** el
  campo vuelve como `detallado`.
- El **clasificador real** (`convertToLocalFormat`) contra los 5 ítems eléctricos del catálogo, antes
  y después de mover el rubro.
- End-to-end en el navegador: 62 ítems, Energía con 3, Iluminación con 3, los 7 rubros en orden.

## 🔜 PENDIENTES

1. **Deploy a prod del front** — el motor de propuestas YA está desplegado; el front NO.
   `cd ~/cotizador && git pull origin main && pm2 restart cotizador-api` (se tocó `server/index.js`
   → el restart es **obligatorio**) + un Ctrl+F5. El orden no es crítico: el motor nuevo dibuja bien
   los payloads viejos.
2. **Mirar un PDF de verdad con ojos.** Se verificó el contenido (qué filas hay y cuáles no), no el
   pixel. En Mínimo, con muchos espacios, conviene chequear que el aire entre espacios no quede raro
   sin la línea de subtotal.
3. **Avisar al Lobby** (ver §7 del spec): los 2 eléctricos NO cotizables que quedaron en Iluminación,
   que `tipo_cotizacion` empieza a escribir `Equipamiento`/`Energía` (y el trigger lo propaga a
   `proyectos.tipo`), y que nació el rubro `Energía` en `catalogo_items`.
4. **Guiones de brief de las otras 3 ramas** — `brief.js` solo tiene el de stand. No es trabajo de
   código: es media hora con Noe. Es el prerequisito del agente de onboarding.

## ⚠️ Cosas que casi me comen

- **`fail2ban` en el VPS**: probé 5 usuarios de SSH a ver cuál entraba, 4 fallaron y me DROPeó el
  puerto 22 — **y al dueño también**, porque banea por IP. El usuario es **`mepex`**. Se destraba
  desde la consola web de Hostinger.
- **`curl -L` sobre un POST**: el 301 al dominio tira el body → 422 "Field required". Pegarle
  directo a `https://app.mepex.com.ar`.
- **Un test que miente**: ver arriba, el falso positivo del nivel Medio. Si un marcador puede
  aparecer por dos motivos distintos, no prueba nada.

---

# (sesión anterior — 2026-06-17)

> Para retomar en un chat nuevo. Leer también `CLAUDE.md` (contexto durable) y, si se trabaja el refactor, `.audit/`.

## 📍 Estado

- **Repo**: `github.com/federicomengelle-commits/COTIZADOR-MEPEX` · branch **`main`** · último commit **`6171705`** (pusheado).
- **Prod**: `http://195.200.1.250/cotizador/` · VPS `~/cotizador` · pm2 `cotizador-api`.
- **Deploy**: `cd ~/cotizador && git pull origin main` + `pm2 restart cotizador-api` (el restart SOLO si se tocó `server/`; frontend solo = pull + Ctrl+Shift+R). ⚠️ **Esta sesión tocó `server/index.js` (endpoint nuevo) → el `pm2 restart` es obligatorio al deployar.**
- **IA**: Claude Haiku 4.5. La `ANTHROPIC_API_KEY` va en `server/.env`. En **prod** está cargada (sanata/brief/ghosts funcionan). ⚠️ En la copia **CLEAN local NO está** → la IA degrada a reglas/503 (es esperado; se verifica en prod).
- **Verificación local**: `node --check` sobre los `.js`; para ver la app, levantar el backend (`cd server && npm start` o `node server/index.js`) → sirve todo en `localhost:3001` (conecta a la Supabase real). Hay launch.json para preview (`cotizador-full`).

## ✅ Hecho esta sesión (todo en `main`, verificado headless)

| Commit | Qué |
|---|---|
| `ce1c391` | **UI #1**: parámetros agrupados en 3 bloques (identidad+modo / config stand / fee) separados por línea sutil + aire; "Tipo de Stand" en fila propia (descomprime dimensiones). Sin esconder/sacar controles. |
| `265c2c5` | **PDF #2**: achique automático (scale-to-fit). `renderDoc(s)` con `G(n)=n*s` comprime solo el flujo del cuerpo; elige la mayor escala que entra en 1 hoja. `s=1` = idéntico al actual (anti-regresión). |
| `742d117` | **Ghosts IA #3**: endpoint `POST /api/ai/ghosts` (Haiku, valida ids) + front que refina con IA (debounce+cache, badge "IA", motivo) y cae a reglas si la IA está off/caída. |
| `26c72b6` | **Numerador "clavado en 14" = caché del browser** (NO el backend: la función SQL incrementa bien, verificado 15→18). Fix: server manda `Cache-Control: no-cache` en HTML/JS/CSS + `max-age` en assets → no vuelve a servirse un front viejo tras deploy. |
| `cdd34b3` | **Ítem "desaparecía" en multi-espacio + fantasmas por sección**: el render ocultaba no-favoritos tras "Ver todos" (un ítem cargado en un espacio quedaba escondido en otro) → ahora muestra TODOS (favoritos primero). Las sugerencias dejan la franja al pie y se pintan en `.section-ghosts` dentro del rubro de su ítem. |
| `065c13f` | **UI: Tipo de Stand a la derecha de las dimensiones** (aprovecha el hueco, ahorra un renglón). |
| `6171705` | **Texto de la propuesta editable**: bloque en el centro tras los ítems (textarea + "Generar con IA"), persiste en `State.generalParams.proposalText`; el PDF usa el texto editado (autogenera si vacío). Mejor generación: ítems+cantidades + `temperature 0.6`. |
| _(sesión 2026-06-18, sin commitear aún)_ | **Numerador diferido en preview**: `exportPDF` en modo preview ya NO reserva número al abrir (cancelar dejaba huecos en la secuencia). Dibuja con placeholder `COT-AAAA-XXXX` y reserva el número real RECIÉN al click "Descargar y guardar" (`finalize()` reserva + re-renderiza a la misma escala + guarda). Export directo (sin preview) intacto. Guard anti-doble-click; si la API falla al descargar, el modal queda abierto para reintentar. **Verificado headless**: abrir preview = 0 reservas, descargar = 1 reserva (`numCallsAfterOpen:0`, `numCallsAfterDownload:1`), `s=1` sin regresión. |

> Sesiones previas (contexto): acordeón por rubro, endpoints IA sanata/brief, brief express, re-skin marca MEPEX, pricing sobre subtotal, auto-cálculo m², mapeo rubro→key robusto.

## 🧠 Decisiones durables (no revertir sin avisar)

1. **Pricing** (premisa del dueño): modificador, descuentos, bonificaciones y fee **se suman entre sí y van sobre el subtotal** (factor `1 + mod% + fee%`), nunca encadenados ni sobre impuestos. Altura en el subtotal base. IVA al final. Redondeo al peso por línea. Fuente única: `pricing.js`.
2. **PDF scale-to-fit**: la fórmula `G(n)=n*s` comprime SOLO los avances/paddings del flujo (datos→rubros). Header, footer y **caja de total (reserva `ensureSpace(26)`)** quedan FIJOS. `s=1` ⇒ identidad ⇒ sin regresión. Ladder `[1, .94, .88, .82, .76, .72]`; piso 0.72 elegido para que el header de espacio (caja fija 9mm) no se solape con su avance `G(13)`.
3. **IA = Claude Haiku 4.5** (no OpenAI). Sanata, brief y **ghosts** viven en el backend (key nunca en el front). Cada endpoint degrada a 503 si falta la key; el front los consume defensivamente.
4. **Ghosts**: las reglas de afinidad (`_GHOST_AFFINITY`) son el render instantáneo y el **fallback**. La IA solo refina si está habilitada. Debounce 1.1s + cache por firma (ítems cargados + modo) para no spamear. El backend valida los ids contra el catálogo provisto (sin alucinaciones).
5. **Catálogo compartido**: NO tocar `categoria` (la usa LOBBY). Grouping en el front (`api.js convertToLocalFormat`). Para sumar un ítem al cotizador: `es_cotizable=true` + `precio_alquiler>0`. Auto-cálculo m²: `unidad='m2'`.
6. **Numerador**: la función SQL `siguiente_numero_cotizacion` incrementa bien — un número REPETIDO = caché de un front viejo, NO el backend. El server manda `Cache-Control: no-cache` en HTML/JS/CSS (revalida siempre) para que el deploy se tome sin quedar un front viejo; un hard-refresh único limpia el cache existente.
7. **Multi-espacio**: el picker muestra TODOS los ítems del rubro (favoritos primero, sin ocultar). El manejo de ítems por espacio (State) ya era correcto; el bug de "ítem que desaparece" era visual (no-favoritos escondidos tras "Ver todos").
8. **Texto de la propuesta**: editable en el cotizador, gana al autogenerado. El PDF usa `State.generalParams.proposalText` si tiene contenido; si está vacío, autogenera con el mismo contexto (`_buildSanataContext`). No se trae a templates.

## 🔜 PENDIENTES (en orden sugerido)

1. **PDF — validación visual pendiente**: exportar un caso *borderline* (ej. expo con varios espacios) y mirar que el achique no apriete feo (interlínea/mínimos). El conteo de hojas está verificado headless; el pixel no. (La UI nueva ya la aprobó el dueño: "más linda, más espaciosa, genial".)
2. **Texto de la propuesta — afinar (opcional)**: quedó pendiente el selector de tono (formal/cálido/técnico) + largo — el dueño eligió "mejorar la calidad nomás" por ahora. Si el texto sigue saliendo flojo en prod, ajustar el prompt de `/api/ai/sanata`. ~~Relacionado: reservar el número recién al confirmar "Descargar"~~ → **HECHO** (sesión 2026-06-18, ver tabla arriba): cancelar el preview ya no quema número.
3. **Ghosts IA — tope de candidatos**: hoy el front manda TODOS los ítems no cargados como candidatos. Con ~9 ítems es trivial, pero cuando el catálogo crezca conviene capar (ej. top ~60 por afinidad) para acotar prompt/costo.
4. **Brief fino end-to-end**: ajustar el mapeo de ítems; rinde poco hasta que el catálogo crezca.
5. **Fase 5 — avatar "Martín"**: vendedor IA que hace el ping-pong del brief. Idea futura.
6. **Cosmético**: el cuerpo del PDF quedó indentado un nivel "de menos" dentro de `renderDoc` (es válido y corre igual). Reflow opcional.

## 👤 Tareas del dueño (Fede) — en paralelo

1. **Llenar el catálogo** con SQL por rubro (dry-run SELECT primero, siempre): marcar `es_cotizable=true` + `precio_alquiler>0`. Opcional `unidad='m2'`. **NO tocar `categoria`.** Hoy ~9 ítems cotizables. Cuantos más rubros con ítems, mejor rinden ghosts/brief.
2. **Probar** en prod (con IA on) Brief, cuentas, multi-espacio, fantasmas por sección y el texto de la propuesta con 2-3 casos reales y anotar qué falla. La 1ª vez tras el deploy: **Ctrl+Shift+R** (cache-busting).

## 🗂️ Dónde está cada cosa

- **Fórmula**: `pricing.js` (`adjustmentFactor`, `loadedUnitPrice`, `compute`).
- **PDF**: `script.js` `exportPDF` → `renderDoc(s)` + `G()` + ladder `FIT_LADDER` + `_lastPdfFit`. Márgenes/total/footer ahí.
- **Ghosts**: `script.js` (`_renderGhosts`, `_ruleGhosts`, `_paintGhosts`, `_maybeAIGhosts`, `_fetchAIGhosts`, `_GHOST_AFFINITY`; contenedores `.section-ghosts[data-cat]` creados en `renderItems`) + `api.js` `aiGhosts` + `server/index.js` `POST /api/ai/ghosts`.
- **Texto de la propuesta**: `script.js` (`_initProposalBlock`, `generateProposal`, `_buildSanataContext`, `_refreshProposalUI`; `State.generalParams.proposalText`; lo consume `exportPDF`) + `index.html` `#proposal-block` + `server/index.js` `/api/ai/sanata` (prompt con ítems+cantidades, `temperature 0.6`). Persiste: `quotation-storage.js` `_collectCurrentState` + `quotation-ui.js` `_restoreState`.
- **Centro receta / acordeón / calor / auto-calc / show-all**: `script.js` (`renderItems`, `_renderItemGroup`, `createItemCard`, `_enhanceAccordion`, `_updateHeat`, `_autoQuantityFor`).
- **UI parámetros**: `index.html` `#general-params` — Tipo de Stand en `.param-inline-standtype` dentro de `.params-row-dimensions`; fee en `.params-row-fee`. Agrupación (border-top) en `style.css` sobre `#stand-params-block`/`#expo-params-block`/`.params-row-fee`.
- **Mapeo rubro→key**: `api.js` `convertToLocalFormat`. **Brief**: `brief.js`. **IA backend**: `server/index.js` (`callClaude` con `temperature` opcional, `/api/ai/*`). **Marca/tokens**: `style.css` `:root`. **Cache-control**: `server/index.js` static (`no-cache` HTML/JS/CSS).

## 🧪 Cómo retomar (reconocimiento rápido)

1. `git log --oneline -10` y `git status` (confirmar limpio y al día con `origin/main`).
2. Leer `CLAUDE.md` (ya actualizado con todo lo de arriba).
3. Levantar el backend local y abrir `localhost:3001` para ver el estado real.
4. Elegir un pendiente (sugerido: #1 — validar el PDF borderline con ojo humano).
