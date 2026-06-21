// =============================================
// PROPUESTA — Generador de PROPUESTA comercial en PDF (Fase 2)
// =============================================
// Feature ADITIVO: toma la cotización actual (State), arma el JSON del motor de
// propuestas y lo envía al servicio de render (servicio externo desacoplado).
// NO toca pricing.js ni el flujo existente. Reusa Pricing.compute() como fuente
// única de la fórmula → la propuesta coincide siempre con el presupuesto.
//
// El Cotizador hace el PRESUPUESTO (números). Esto arma la PROPUESTA (documento
// comercial del evento: carátula + detalle [+ distribución en una etapa futura]).
// =============================================
(function () {
    'use strict';

    // URL del servicio de render. Same-origin en prod (nginx → :8001); al VPS desde dev.
    const BASE = (typeof window !== 'undefined' && window.location &&
        window.location.hostname === 'localhost')
        ? 'http://195.200.1.250/propuesta-api'
        : '/propuesta-api';

    const CONDICIONES_DEFAULT =
        'El presupuesto está calculado para ser facturado y abonado en plaza local, a través ' +
        'del sistema bancario argentino. En caso de requerir facturación al exterior, los costos ' +
        'varían y el presupuesto debe recalcularse.';

    const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

    // Número → "27.650,00" (ARS). Los montos del cotizador ya vienen redondeados al peso.
    function fmtARS(n) {
        return (Math.round(Number(n) || 0))
            .toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function hoyLargo(d) {
        d = d || new Date();
        return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
    }

    // Fecha del evento con el MISMO formato que usa el cotizador, si está disponible.
    function fechaEvento(evd) {
        if (evd && typeof formatEventDateRange === 'function') {
            try { return formatEventDateRange(evd.eventStartDate, evd.eventEndDate) || ''; } catch (_) { }
        }
        return '';
    }

    // Replica el getAllItemsFlat() de Render.updateSummary (closure no exportada):
    // [{ item, quantity }] del estado actual, según modo.
    function flatItems(gp) {
        const flat = [];
        const multi = gp.quotationType === 'expo' || gp.quotationType === 'alquiler';
        const push = (id, data) => {
            if (!data || (Number(data.quantity) || 0) <= 0) return;
            const item = DB.getItemById(id);
            if (item) flat.push({ item, quantity: data.quantity });
        };
        if (multi) {
            (gp.spaces || []).forEach(sp => Object.entries(sp.items || {}).forEach(([id, d]) => push(id, d)));
        } else {
            const sel = (typeof State !== 'undefined' && State.selectedItems) || {};
            Object.entries(sel).forEach(([id, d]) => push(id, d));
        }
        return flat;
    }

    const STAND_TIPOS = { centro: 'Centro', peninsula: 'Península', esquina: 'Esquina', isla: 'Isla' };

    // Label de altura igual que el cotizador: "Media (3,00m)".
    function alturaLabel(gp) {
        const hm = (typeof DATABASE !== 'undefined' && DATABASE.heightMultipliers) || [];
        const h = hm.find(x => x.id === gp.heightType);
        return h ? `${h.name} (${h.height})` : 'Estándar (≤2.40m)';
    }

    // Arma el payload del motor desde el estado vivo. Expuesto para testing.
    function buildPayload() {
        const gp = State.generalParams;
        const modo = String(gp.quotationType || 'expo').toUpperCase();
        const esStand = modo === 'STAND';
        const heightAffected = (typeof DATABASE !== 'undefined' && DATABASE.heightAffectedCategories)
            || ['infrastructure', 'lighting'];
        const ctx = Pricing.contextFromLiveParams(gp, heightAffected);
        const calc = Pricing.compute(flatItems(gp), ctx);

        // Agrupar ítems por rubro, en el orden del catálogo. El total SIEMPRE incluye todo
        // (incluida la infra), aunque en Stand no se detalle ni se muestren precios.
        const rubros = [];
        DB.getCategories().forEach(cat => {
            const items = calc.items.filter(it => it.category === cat.id);
            if (!items.length) return;

            // Stand: la infraestructura NO se detalla por ítems → va como "estructura".
            if (esStand && cat.id === 'infrastructure') {
                rubros.push({
                    nombre: cat.name,
                    descripcion: [
                        `Superficie: ${gp.metraje || '—'} m² — Altura: ${alturaLabel(gp)}`,
                        'Construcción modular con sistema OCTEXA',
                    ],
                    items: [],
                });
                return;
            }

            rubros.push({
                nombre: cat.name,
                items: items.map(it => ({
                    desc: it.name,
                    cant: String(it.qty),
                    // precios: el motor solo los muestra en Expo/Alquiler (en Stand los ignora)
                    unitario: fmtARS(it.loadedUnit),
                    parcial: fmtARS(it.lineLoaded),
                })),
                subtotal: fmtARS((calc.byCategory[cat.id] || {}).final || 0),
            });
        });

        const evd = gp.eventoData || {};
        const proyecto = {
            cliente: gp.cliente || '',
            descripcion: gp.proyecto || '',
            evento: gp.evento || '',
            lugar: evd.venue || '',
            fecha_evento: fechaEvento(evd),
            armado_desarme: evd.setupDate || '',
        };
        if (esStand) {
            proyecto.superficie = gp.metraje ? `${gp.metraje} m²` : '';
            proyecto.tipo = STAND_TIPOS[gp.standType] || (gp.standType || '');
            proyecto.altura = alturaLabel(gp);
        }

        return {
            modo,
            fecha_emision: hoyLargo(),
            ref: gp.cotNumber || null,        // número de la cotización si ya lo tiene; sino sin ref
            proyecto,
            resena: gp.proposalText || '',
            condiciones_facturacion: CONDICIONES_DEFAULT,
            detalle: {
                rubros,
                subtotal: fmtARS(calc.subtotal),
                iva_pct: 21,
                iva: fmtARS(calc.tax),
                total: fmtARS(calc.total),
            },
            distribucion: null,               // Fase 2.1: sin distribución (se suma en 2.2)
        };
    }

    function validate(p) {
        if (!p.proyecto.cliente) return 'Cargá el cliente antes de generar la propuesta.';
        if (!p.detalle.rubros.length) return 'No hay ítems en la cotización.';
        return null;
    }

    function notify(msg, type) {
        try {
            if (typeof Toast !== 'undefined') {
                if (typeof Toast[type] === 'function') return Toast[type](msg);
                if (typeof Toast.show === 'function') return Toast.show(msg, type);
            }
        } catch (_) { }
        console.log('[propuesta]', type || 'info', msg);
    }

    function slug(s) {
        return String(s || 'MEPEX').normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'MEPEX';
    }

    async function generate() {
        let payload;
        try { payload = buildPayload(); }
        catch (e) { return notify('No pude leer la cotización: ' + e.message, 'error'); }
        const err = validate(payload);
        if (err) return notify(err, 'error');

        notify('Generando propuesta…', 'info');
        let resp;
        try {
            resp = await fetch(BASE + '/render-propuesta', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } catch (e) { return notify('No se pudo contactar el servicio de propuestas.', 'error'); }
        if (!resp || !resp.ok) return notify('El servicio devolvió un error (' + (resp && resp.status) + ').', 'error');

        const blob = await resp.blob();
        showPreview(blob, payload);
    }

    function ensureStyles() {
        if (document.getElementById('propuesta-styles')) return;
        const s = document.createElement('style');
        s.id = 'propuesta-styles';
        s.textContent =
            '.propuesta-overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:99999;' +
            'display:flex;align-items:center;justify-content:center;padding:24px;}' +
            '.propuesta-modal{background:#111;border:1px solid #333;border-radius:10px;' +
            'width:min(920px,96vw);height:92vh;display:flex;flex-direction:column;overflow:hidden;}' +
            '.propuesta-modal-head{display:flex;align-items:center;justify-content:space-between;' +
            'gap:12px;padding:12px 16px;border-bottom:1px solid #2a2a2a;color:#E8E8E8;font-family:inherit;}' +
            '.propuesta-modal-head .ph-actions{display:flex;gap:8px;align-items:center;}' +
            '.propuesta-frame{flex:1;border:0;background:#fff;width:100%;}';
        document.head.appendChild(s);
    }

    function showPreview(blob, payload) {
        ensureStyles();
        const url = URL.createObjectURL(blob);
        const fname = 'Propuesta-' + slug(payload.proyecto.evento || payload.proyecto.cliente) + '.pdf';
        const ov = document.createElement('div');
        ov.className = 'propuesta-overlay';
        ov.innerHTML =
            '<div class="propuesta-modal">' +
            '<div class="propuesta-modal-head"><strong>Vista previa — Propuesta</strong>' +
            '<div class="ph-actions">' +
            '<a class="btn-primary" id="propuesta-dl" download="' + fname + '" href="' + url + '">⬇ Descargar</a>' +
            '<button class="btn-ghost" id="propuesta-close">Cerrar</button>' +
            '</div></div>' +
            '<iframe class="propuesta-frame" src="' + url + '"></iframe>' +
            '</div>';
        document.body.appendChild(ov);
        const close = () => { ov.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000); };
        ov.querySelector('#propuesta-close').addEventListener('click', close);
        ov.addEventListener('click', e => { if (e.target === ov) close(); });
    }

    function init() {
        const btn = document.getElementById('btn-propuesta');
        if (btn) btn.addEventListener('click', generate);
    }
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
        else init();
    }

    // Exponer (para wiring y testing).
    const api = { buildPayload, generate };
    if (typeof window !== 'undefined') window.Propuesta = api;
    if (typeof globalThis !== 'undefined') globalThis.Propuesta = api;
})();
