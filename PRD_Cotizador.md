1. Core Intent
Construir una SPA (Single Page Application) reactiva que actúe como interfaz comercial para la base de datos de servicios y materiales de MEPEX. La app no "inventa" lógica de ingeniería; consume un catálogo y aplica modificadores de proyecto.

2. Arquitectura de Datos (Data-Driven)
La aplicación debe basarse en un esquema de objeto único (JSON/DB) con la siguiente estructura:

Items: id, name, price_unit, category, type (checkbox o counter).

Multipliers: Factores numéricos que afectan a categorías enteras (Altura, Complejidad).

3. Layout Industrial (3 Columnas)
Nav (Izquierda): Menú de anclas dinámico basado en las categorías del JSON.

Selection (Centro): Renderizado dinámico de tarjetas por categoría. Si un ítem en la DB es tipo "cantidad", muestra un contador; si es "único", muestra un checkbox.

Summary (Derecha): Panel sticky con desglose por categorías, subtotal, impuestos y total.