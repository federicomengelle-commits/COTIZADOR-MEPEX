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
// Fórmula canónica por ítem:
//   lineBase   = precio × cantidad
//   loadedUnit = precio × (altura si categoría afectada) × modificador × fee
//   lineLoaded = loadedUnit × cantidad
//   subtotal   = Σ lineLoaded     |  iva = subtotal × 0.21  |  total = subtotal + iva
//
// El orden de las multiplicaciones es matemáticamente irrelevante (todo es
// multiplicativo); se documenta uno solo para que el lector no dude.

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
    // Devuelven un ctx normalizado: { heightMultiplier, modifierMultiplier,
    // feeMultiplier, heightAffected }. feeMultiplier === 1 cuando el fee está off.
    // ──────────────────────────────────────────

    // Desde State.generalParams (cotización en edición).
    contextFromLiveParams(params, heightAffected) {
        return {
            heightMultiplier: params.heightMultiplier || 1,
            modifierMultiplier: 1 + ((params.modifierPercentage || 0) / 100),
            feeMultiplier: params.includeFee ? (1 + (params.feePercentage || 0)) : 1,
            heightAffected: heightAffected || this.DEFAULT_HEIGHT_AFFECTED,
        };
    },

    // Desde los params de una cotización GUARDADA (estructura anidada, fee entero).
    contextFromSavedParams(params, heightAffected) {
        return {
            heightMultiplier: params.height?.multiplier || 1,
            modifierMultiplier: 1 + ((params.modifier?.percentage || 0) / 100),
            feeMultiplier: params.fee?.enabled ? (1 + ((params.fee.percentage || 0) / 100)) : 1,
            heightAffected: heightAffected || this.DEFAULT_HEIGHT_AFFECTED,
        };
    },

    // ──────────────────────────────────────────
    // FÓRMULA — única fuente del precio cargado por unidad
    // ──────────────────────────────────────────
    loadedUnitPrice(basePrice, category, ctx) {
        const h = ctx.heightAffected.includes(category) ? ctx.heightMultiplier : 1;
        return basePrice * h * ctx.modifierMultiplier * ctx.feeMultiplier;
    },

    // ──────────────────────────────────────────
    // CÁLCULO COMPLETO — para el desglose del summary live
    // flatItems: [{ item, quantity }]   (item debe tener price, category, etc.)
    //
    // Los agregados (subConModifier/subConFee, byCategory.final) se calculan
    // aplicando modificador y fee sobre la SUMA, replicando exactamente el orden
    // que usaba updateSummary — así el total mostrado/guardado no cambia ni un
    // peso respecto del comportamiento previo.
    // ──────────────────────────────────────────
    compute(flatItems, ctx) {
        let subBase = 0;
        let subConAltura = 0;
        const byCategory = {};
        const items = [];

        flatItems.forEach(({ item, quantity }) => {
            const qty = Number(quantity) || 0;
            if (qty <= 0) return;

            const base = this.parsePrice(item.price);
            const lineBase = base * qty;
            const hMult = ctx.heightAffected.includes(item.category) ? ctx.heightMultiplier : 1;
            const lineConAltura = lineBase * hMult;

            subBase += lineBase;
            subConAltura += lineConAltura;

            if (!byCategory[item.category]) {
                byCategory[item.category] = { base: 0, conAltura: 0, final: 0 };
            }
            byCategory[item.category].base += lineBase;
            byCategory[item.category].conAltura += lineConAltura;

            const loadedUnit = this.loadedUnitPrice(base, item.category, ctx);
            items.push({
                id: item.id,
                name: item.name,
                unit: item.unit,
                code: item.code,
                category: item.category,
                qty,
                basePrice: base,
                lineBase,
                loadedUnit,
                lineLoaded: loadedUnit * qty,
            });
        });

        // Agregados: modificador y fee sobre la suma (orden histórico de updateSummary)
        const subConModifier = subConAltura * ctx.modifierMultiplier;
        const subConFee = subConModifier * ctx.feeMultiplier;

        const catMultiplier = ctx.modifierMultiplier * ctx.feeMultiplier;
        Object.keys(byCategory).forEach(catId => {
            byCategory[catId].final = byCategory[catId].conAltura * catMultiplier;
        });

        const subtotal = subConFee;
        const tax = subtotal * this.IVA_RATE;
        const total = subtotal + tax;

        return {
            items,
            byCategory,
            subBase,
            subConAltura,
            subConModifier,
            subConFee,
            aporteAltura: subConAltura - subBase,
            aporteModifier: subConModifier - subConAltura,
            aporteFee: subConFee - subConModifier,
            subtotal,
            tax,
            total,
        };
    },
};

// Exportar para uso global
window.Pricing = Pricing;

console.log('💰 Pricing module loaded');
