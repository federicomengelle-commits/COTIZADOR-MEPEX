// =============================================
// PRICING MODULE  —  fuente única de la fórmula de cotización
// =============================================
// Antes la fórmula vivía replicada en 4 lugares (updateSummary, exportPDF,
// handleExportCSV, Compare._summarizeQuotation) que "coincidían por accidente".
// Cualquier divergencia hacía que total visible ≠ PDF ≠ CSV ≠ guardado.
//
// Este módulo es PURO: no toca el DOM, no lee globals (State/DATABASE).
// Recibe todo por parámetro vía un "contexto de pricing" (ctx). Los context
// builders adaptan los dos modelos de datos existentes:
//   · State.generalParams (live)  → fee como decimal (0.10), height como heightMultiplier
//   · cotización guardada (snap)  → fee como entero (10),    height como params.height.multiplier
//
// Fórmula canónica (premisa MEPEX — ajustes SIEMPRE sobre el subtotal):
//   loadedUnit = precio × (altura si categoría afectada) × (1 + modificador% + fee%)
//   lineLoaded = round(loadedUnit × cantidad)     ← redondeo al peso por línea
//   subtotal   = Σ lineLoaded                      ← el desglose cierra exacto
//   iva        = round(subtotal × 0.21)  |  total = subtotal + iva
//
// El modificador y el fee se SUMAN entre sí y se aplican sobre el subtotal
// (NO encadenados, NO sobre impuestos). El IVA va al final, sobre el subtotal
// ya ajustado. La altura es precio real del ítem → entra en el subtotal base.

const Pricing = {
    IVA_RATE: 0.21,
    DEFAULT_HEIGHT_AFFECTED: ['infrastructure', 'lighting'],

    // Parse robusto de precio (string "1.234,56" o número) → float.
    parsePrice(price) {
        return typeof price === 'string'
            ? parseFloat(price.toString().replace(/[^\d.,-]/g, '').replace(',', '.')) || 0
            : (parseFloat(price) || 0);
    },

    // ──────────────────────────────────────────
    // CONTEXT BUILDERS
    // Devuelven un ctx normalizado: { heightMultiplier, modifierPct, feePct,
    // heightAffected }. modifierPct/feePct son decimales (0.10 = 10%), 0 si off.
    // ──────────────────────────────────────────

    // Desde State.generalParams (cotización en edición). modifierPct/feePct como
    // decimales (0.10 = 10%). El fee live ya viene decimal; el modificador en %.
    contextFromLiveParams(params, heightAffected) {
        return {
            heightMultiplier: params.heightMultiplier || 1,
            modifierPct: (params.modifierPercentage || 0) / 100,
            feePct: params.includeFee ? (params.feePercentage || 0) : 0,
            heightAffected: heightAffected || this.DEFAULT_HEIGHT_AFFECTED,
        };
    },

    // Desde los params de una cotización GUARDADA (estructura anidada, fee entero).
    contextFromSavedParams(params, heightAffected) {
        return {
            heightMultiplier: params.height?.multiplier || 1,
            modifierPct: (params.modifier?.percentage || 0) / 100,
            feePct: params.fee?.enabled ? ((params.fee.percentage || 0) / 100) : 0,
            heightAffected: heightAffected || this.DEFAULT_HEIGHT_AFFECTED,
        };
    },

    // Factor de ajuste ÚNICO: modificador y fee, AMBOS sobre el subtotal y SUMADOS
    // entre sí (no encadenados). Clamp a 0 por si un descuento supera el 100%.
    adjustmentFactor(ctx) {
        return Math.max(0, 1 + (ctx.modifierPct || 0) + (ctx.feePct || 0));
    },

    // ──────────────────────────────────────────
    // FÓRMULA — única fuente del precio cargado por unidad
    //   loadedUnit = precio × altura(si corresponde) × (1 + modificador% + fee%)
    // ──────────────────────────────────────────
    loadedUnitPrice(basePrice, category, ctx) {
        const h = ctx.heightAffected.includes(category) ? ctx.heightMultiplier : 1;
        return basePrice * h * this.adjustmentFactor(ctx);
    },

    // ──────────────────────────────────────────
    // CÁLCULO COMPLETO — desglose para el summary, PDF, CSV y compare.
    // flatItems: [{ item, quantity }]   (item debe tener price, category, etc.)
    //
    // Ajustes (modificador + fee) SUMADOS sobre el subtotal-con-altura. Cada línea
    // se redondea al peso, y el subtotal es la SUMA de líneas redondeadas → el
    // desglose por rubro y por ítem cierra exacto contra el total.
    // ──────────────────────────────────────────
    compute(flatItems, ctx) {
        let subBase = 0;
        let subConAltura = 0;
        const byCategory = {};
        const items = [];
        const adj = this.adjustmentFactor(ctx);

        flatItems.forEach(({ item, quantity }) => {
            const qty = Number(quantity) || 0;
            if (qty <= 0) return;

            const base = this.parsePrice(item.price);
            const hMult = ctx.heightAffected.includes(item.category) ? ctx.heightMultiplier : 1;
            const lineBase = base * qty;
            const lineConAltura = lineBase * hMult;
            // Línea final = (base × altura) × factor de ajuste, redondeada al peso.
            const lineLoaded = Math.round(lineConAltura * adj);

            subBase += lineBase;
            subConAltura += lineConAltura;

            if (!byCategory[item.category]) {
                byCategory[item.category] = { base: 0, conAltura: 0, final: 0 };
            }
            byCategory[item.category].base += lineBase;
            byCategory[item.category].conAltura += lineConAltura;
            byCategory[item.category].final += lineLoaded;

            items.push({
                id: item.id,
                name: item.name,
                unit: item.unit,
                code: item.code,
                category: item.category,
                qty,
                basePrice: base,
                lineBase,
                loadedUnit: base * hMult * adj,
                lineLoaded,
            });
        });

        // Subtotal = suma de líneas ya redondeadas. IVA al final sobre el subtotal ajustado.
        const subtotal = items.reduce((s, it) => s + it.lineLoaded, 0);
        const tax = Math.round(subtotal * this.IVA_RATE);
        const total = subtotal + tax;

        // Aportes informativos (sobre el subtotal-con-altura), redondeados para mostrar.
        const aporteAltura = Math.round(subConAltura - subBase);
        const aporteModifier = Math.round(subConAltura * (ctx.modifierPct || 0));
        const aporteFee = Math.round(subConAltura * (ctx.feePct || 0));

        return {
            items,
            byCategory,
            subBase: Math.round(subBase),
            subConAltura: Math.round(subConAltura),
            subConModifier: Math.round(subConAltura) + aporteModifier, // compat
            subConFee: subtotal,                                       // compat (= subtotal final)
            aporteAltura,
            aporteModifier,
            aporteFee,
            subtotal,
            tax,
            total,
        };
    },
};

// Exportar para uso global
window.Pricing = Pricing;

console.log('💰 Pricing module loaded');
