# HANDOFF — COTIZADOR-MEPEX (sesión 2026-06-14)

> Para retomar en un chat nuevo. Leer también `CLAUDE.md` (contexto durable) y, si se trabaja el refactor, `.audit/`.

## 📍 Estado

- **Repo**: `github.com/federicomengelle-commits/cotizador-mepex` · branch **`main`** · último commit **`1379272`** (todo pusheado).
- **Prod**: `http://195.200.1.250/cotizador/` · VPS `~/cotizador` · pm2 `cotizador-api`.
- **Deploy**: `cd ~/cotizador && git pull origin main` + `pm2 restart cotizador-api` (el restart SOLO si se tocó `server/`; frontend solo = pull + Ctrl+Shift+R).
- **IA**: Claude Haiku 4.5. La `ANTHROPIC_API_KEY` YA está cargada en `server/.env` y verificada (la sanata genera bien). ⚠️ Si se redeploya el server desde cero, esa key tiene que seguir en `server/.env`.
- **Verificación local**: `node --check` sobre los `.js`; para ver la app, levantar el backend (`cd server && npm start` o `node server/index.js`) → sirve todo en `localhost:3001` (conecta a la Supabase real).

## ✅ Hecho esta sesión (todo en `main`, verificado en preview)

| Commit | Qué |
|---|---|
| `9e16eb4` | Acordeón por rubro colapsable + tokens de estado |
| `8471fb7` | Endpoints IA en backend (`/api/ai/sanata\|brief\|status`, Claude Haiku) |
| `2f73d67` | Sanata IA en el PDF + medidor de calor + cliente `API.ai*` |
| `1db12b9` | **Brief Express** (`brief.js`): 10 preguntas → params + ítems vía IA |
| `033a4e1` | server carga `.env` desde `__dirname` + fallback de visibility |
| `f539a05` | **Centro estilo receta** completo (picker `+ Agregar` + renglones + fantasmas) |
| `ceebc37` | **Re-skin marca MEPEX** (turquesa `#00A9C1`, Outfit + Space Mono) + nav colapsable |
| `1d9d63f` | Sugerencias en franja única al pie + PDF más compacto |
| `99b5f27` | **Pricing corregido**: ajustes sobre el subtotal, sumados, IVA al final, redondeo por línea |
| `8c17a7c` | **Auto-cálculo por m²** (cantidad = superficie para `unidad='m2'`) |
| `1379272` | **Mapeo `rubro → key` robusto** en `api.js` (sin tocar `categoria` de LOBBY) |

## 🧠 Decisiones durables (no revertir sin avisar)

1. **Pricing** (premisa del dueño): modificador, descuentos, bonificaciones y fee **se suman entre sí y van sobre el subtotal** (factor `1 + mod% + fee%`), nunca encadenados ni sobre impuestos. Altura en el subtotal base. IVA al final. Redondeo al peso por línea. Fuente única: `pricing.js`.
2. **IA = Claude Haiku 4.5** (no OpenAI), por coherencia de stack; a bajo volumen el costo es centavos/mes. ChatGPT Plus / Claude Pro **no** dan API (se paga por token aparte).
3. **Marca = manual de LOBBY** (`LOBBY-MEPEX/docs/MEPEX_BRAND.md`): turquesa `#00A9C1`, naranja `#F28D15`, verde `#00CC88`, fondo `#050505`, Outfit (UI) + Space Mono (montos).
4. **Catálogo compartido**: NO tocar `categoria` (la usa LOBBY). El grouping vive en el front (`api.js convertToLocalFormat`, `rubro → key`). Para sumar un ítem al cotizador: `es_cotizable=true` + `precio_alquiler>0`. Para auto-cálculo por m²: `unidad='m2'`.

## 🔜 PENDIENTES (en orden sugerido)

1. **Simplificar la UI manual** — *sin esconder ni sacar botones* (premisa del dueño): mismos controles, pero más ordenado/agrupado/con aire. **No implementado** (era el próximo paso cuando se cortó).
2. **PDF scale-to-fit** — el total + footer **todavía saltan a una 2ª hoja casi vacía** en algunos casos (el fix de márgenes lo redujo pero NO lo eliminó; el dueño confirmó que sigue pasando). Falta el "achique automático" (reducir fuente/interlínea para forzar una hoja).
3. **Fase 4 — sugerencias fantasma con IA**: hoy son por reglas de afinidad cross-rubro (`_GHOST_AFFINITY` en `script.js`). Enchufarle el backend de IA.
4. **Brief fino end-to-end**: ajustar el mapeo de ítems; rinde poco hasta que el catálogo crezca.
5. **Fase 5 — avatar "Martín"**: vendedor IA que hace el ping-pong del brief. Idea futura.
6. **Afinar mapeo `rubro → key`**: ya cubre Pisos/Infraestructura/Iluminación/Equipamiento/Más servicios. "Marketing" aún sin ítems en la DB.

## 👤 Tareas del dueño (Fede) — en paralelo

1. **Llenar el catálogo** con SQL por rubro (dry-run SELECT primero, siempre):
   ```sql
   -- ejemplo (descomentar tras revisar el count):
   -- UPDATE catalogo_items SET es_cotizable = true
   --   WHERE rubro = 'Pisos' AND precio_alquiler > 0 AND _deleted IS NOT TRUE;
   ```
   - Marcar `es_cotizable=true` + asegurar `precio_alquiler>0`. Opcional `unidad='m2'` (auto-cálculo). **NO tocar `categoria`.**
   - Hoy hay **9 ítems cotizables** (3 alfombras m², 2 paneles OCTEXA, 1 reflector, TV, vinilo, vitrina).
2. **Probar** el Brief y las cuentas con 2-3 casos reales y anotar qué falla.

## 🗂️ Dónde está cada cosa

- **Fórmula**: `pricing.js` (`adjustmentFactor`, `loadedUnitPrice`, `compute`).
- **Centro receta / acordeón / calor / auto-calc / fantasmas**: `script.js` (`renderItems`, `createItemCard`, `_enhanceAccordion`, `_updateHeat`, `_autoQuantityFor`, `_renderGhosts`, `_GHOST_AFFINITY`).
- **Mapeo rubro→key**: `api.js` `convertToLocalFormat`.
- **Brief**: `brief.js`.
- **IA backend**: `server/index.js` (`callClaude`, `/api/ai/*`).
- **PDF**: `script.js` `exportPDF` (jsPDF; márgenes/total/footer ahí).
- **Marca/tokens**: `style.css` `:root`.

## 🧪 Cómo retomar (reconocimiento rápido)

1. `git log --oneline -12` y `git status` (confirmar limpio y en `1379272`).
2. Leer `CLAUDE.md` (ya actualizado con todo lo de arriba).
3. Levantar el backend local y abrir `localhost:3001` para ver el estado real.
4. Elegir un pendiente (sugerido: #1 simplificar UI, o #2 PDF scale-to-fit).
