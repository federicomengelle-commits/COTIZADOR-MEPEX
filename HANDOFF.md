# HANDOFF — COTIZADOR-MEPEX (sesión 2026-06-17)

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
2. **Texto de la propuesta — afinar (opcional)**: quedó pendiente el selector de tono (formal/cálido/técnico) + largo — el dueño eligió "mejorar la calidad nomás" por ahora. Si el texto sigue saliendo flojo en prod, ajustar el prompt de `/api/ai/sanata`. Relacionado: **reservar el número de cotización recién al confirmar "Descargar"** (hoy se reserva al abrir el preview → cancelar quema un número, deja huecos).
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
