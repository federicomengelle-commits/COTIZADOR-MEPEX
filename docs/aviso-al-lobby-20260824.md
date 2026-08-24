# Para el Lobby — qué cambió del lado del Cotizador (2026-08-24)

> Contraparte del handoff *"Para llevar al Cotizador"* del 23/8. Esto es lo que **ya está aplicado
> y desplegado** de este lado, y las tres cosas que necesitan una decisión o un ojo del lado del Lobby.
> Todo medido contra producción.

## Lo aplicado

**El vocabulario de las cuatro ramas está implementado.** El Cotizador dice `Stand · Expo ·
Equipamiento · Energía` en el selector, en el resumen, en el título del PDF de presupuesto y en la
carátula de la propuesta comercial.

**Los códigos internos no se tocaron**, igual que ustedes con los `SRV-*`: `quotationType` sigue
siendo `'alquiler'` para la rama Equipamiento. Solo cambió la etiqueta.

**Se agregó el nivel de detalle** del documento (Mínimo/Medio/Detallado, default Mínimo; Stand nunca
discrimina). Vive en `cotizaciones.full_state`, **sin columna nueva** y sin tocar schema compartido —
como propusieron. No les cambia nada.

## 1 · `tipo_cotizacion` empieza a escribir dos palabras nuevas

El `typeMap` del Cotizador ahora escribe exactamente una de: `Stand` · `Expo` · **`Equipamiento`** ·
**`Energía`**.

**Lo que les toca mirar**: el trigger `trigger_cotizacion_aprobada_crea_proyecto` hace
`UPPER(TRIM(tipo_cotizacion))` y lo propaga a `proyectos.tipo`, así que van a empezar a aparecer
**`EQUIPAMIENTO`** y **`ENERGÍA`** ahí. Si alguna vista, filtro o reporte del Lobby compara
`proyectos.tipo` contra una lista fija, hay que sumarlas.

Las 3 cotizaciones vivas siguen todas en `Stand`: no hubo migración de datos, no hay nada que
convertir.

> Nota: sigue sin haber `CHECK` en la columna. Ahora el Cotizador normaliza siempre vía `typeMap`,
> así que el texto libre ya no es la puerta por donde entra basura desde acá. Si igual quieren el
> constraint, es decisión de ustedes — toca tabla compartida.

## 2 · Nació el rubro `Energía` en `catalogo_items`

Movidos **solo tres ítems**, y **solo la columna `rubro`** (jamás `categoria`, que es de ustedes):

| id | código | nombre | de → a |
|---|---|---|---|
| 52 | `TAB-MON` | Tablero seccional monofásico | Iluminación → **Energía** |
| 1 | `TAB-TRI` | Tablero seccional trifásico | Iluminación → **Energía** |
| 55 | `TOM-DOB` | Tomacorriente doble | Iluminación → **Energía** |

Si Costos tiene la lista de rubros hardcodeada en algún lado, hay que sumar `Energía`.

## 3 · 🟥 Quedaron dos eléctricos en Iluminación — decisión de ustedes

El handoff hablaba de tres ítems, pero en la base hay **cinco**:

| id | nombre | `es_cotizable` | por qué quedó |
|---|---|---|---|
| 80 | Tablero de obra. | ❌ | no cotizable, `precio_alquiler` = 0 |
| 72 | Tablero doble comando | ❌ | ídem |

Son **invisibles para el Cotizador** (que solo lee `es_cotizable = true`), así que moverlos no me
cambiaba nada — pero **sí los ve Costos**. Si agrupan por rubro para medir, la rama Energía les va a
quedar incompleta con estos dos colgando entre los reflectores.

No los toqué porque el efecto es enteramente de su lado. El `UPDATE`, si lo quieren:

```sql
-- PROPUESTA (correr solo si el Lobby lo confirma; dry-run primero)
-- select id, nombre, rubro, categoria, es_cotizable from catalogo_items where id in (80, 72);
update catalogo_items set rubro = 'Energía' where id in (80, 72);
```

## Lo que sigue esperando a una persona

Los **guiones de brief** de expo, equipamiento y energía (§G9 de `PENDIENTES.md`). `brief.js` tiene
las 10 preguntas de stand y nada más, y el Brief Express fuerza modo stand a propósito por eso mismo.
No es trabajo de IA ni de código: es saber qué se le pregunta a un cliente. Media hora con Noe.

Es el prerequisito del agente de onboarding.
