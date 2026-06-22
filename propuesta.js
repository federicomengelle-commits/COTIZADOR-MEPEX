// =============================================
// PROPUESTA — Generador de PROPUESTA comercial en PDF (Fase 2)
// =============================================
// Feature ADITIVO: toma la cotización actual (State), arma el JSON del motor de
// propuestas y lo envía al servicio de render (servicio externo desacoplado).
// NO toca pricing.js ni el flujo existente. Reusa Pricing.compute() como fuente
// única de la fórmula → la propuesta coincide siempre con el presupuesto.
//   · STAND  → detalle SIN precios (infra = "estructura"), total único.
//   · EXPO/ALQUILER → detalle POR ESPACIO con precios + total.
// =============================================
(function () {
    'use strict';

    const BASE = (typeof window !== 'undefined' && window.location &&
        window.location.hostname === 'localhost')
        ? 'http://195.200.1.250/propuesta-api'
        : '/propuesta-api';

    const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const STAND_TIPOS = { centro: 'Centro', peninsula: 'Península', esquina: 'Esquina', isla: 'Isla' };

    function fmtARS(n) {
        return (Math.round(Number(n) || 0))
            .toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    function hoyLargo(d) {
        d = d || new Date();
        return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
    }
    function fechaEvento(evd) {
        if (evd && typeof formatEventDateRange === 'function') {
            try { return formatEventDateRange(evd.eventStartDate, evd.eventEndDate) || ''; } catch (_) { }
        }
        return '';
    }
    function alturaLabel(gp) {
        const hm = (typeof DATABASE !== 'undefined' && DATABASE.heightMultipliers) || [];
        const h = hm.find(x => x.id === gp.heightType);
        return h ? `${h.name} (${h.height})` : 'Estándar (≤2.40m)';
    }

    function ctxFrom(gp) {
        const heightAffected = (typeof DATABASE !== 'undefined' && DATABASE.heightAffectedCategories)
            || ['infrastructure', 'lighting'];
        return Pricing.contextFromLiveParams(gp, heightAffected);
    }

    function flatFromItems(itemsMap) {
        const flat = [];
        Object.entries(itemsMap || {}).forEach(([id, d]) => {
            if (!d || (Number(d.quantity) || 0) <= 0) return;
            const item = DB.getItemById(id);
            if (item) flat.push({ item, quantity: d.quantity });
        });
        return flat;
    }

    // Flat global (según modo), para totales y detección.
    function flatItems(gp) {
        const multi = gp.quotationType === 'expo' || gp.quotationType === 'alquiler';
        if (multi) {
            let flat = [];
            (gp.spaces || []).forEach(sp => { flat = flat.concat(flatFromItems(sp.items)); });
            return flat;
        }
        return flatFromItems((typeof State !== 'undefined' && State.selectedItems) || {});
    }

    // ¿La cotización incluye diseño de material gráfico? (lo van a vender en Más Servicios).
    // Si lo incluye, NO mostramos la leyenda "No incluye diseño..." en el pie.
    function incluyeDiseno(flat) {
        return flat.some(({ item }) => item && (
            item.subcategory === 'design' || /dise[ñn]o/i.test(item.name || '')
        ));
    }

    // Rubros CON precios (Expo/Alquiler) desde un cálculo de Pricing.
    function rubrosConPrecio(calc) {
        const rubros = [];
        DB.getCategories().forEach(cat => {
            const items = calc.items.filter(it => it.category === cat.id);
            if (!items.length) return;
            rubros.push({
                nombre: cat.name,
                items: items.map(it => ({
                    desc: it.name, cant: String(it.qty),
                    unitario: fmtARS(it.loadedUnit), parcial: fmtARS(it.lineLoaded),
                })),
                subtotal: fmtARS((calc.byCategory[cat.id] || {}).final || 0),
            });
        });
        return rubros;
    }

    function buildPayload() {
        const gp = State.generalParams;
        const modo = String(gp.quotationType || 'expo').toUpperCase();
        const esStand = modo === 'STAND';
        const ctx = ctxFrom(gp);
        const flatAll = flatItems(gp);
        const calc = Pricing.compute(flatAll, ctx);

        let detalle;
        if (esStand) {
            // Sin precios; infra = "estructura".
            const rubros = [];
            DB.getCategories().forEach(cat => {
                const items = calc.items.filter(it => it.category === cat.id);
                if (!items.length) return;
                if (cat.id === 'infrastructure') {
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
                rubros.push({ nombre: cat.name, items: items.map(it => ({ desc: it.name, cant: String(it.qty) })) });
            });
            detalle = { rubros, subtotal: fmtARS(calc.subtotal), iva_pct: 21, iva: fmtARS(calc.tax), total: fmtARS(calc.total) };
        } else {
            // Expo/Alquiler: por ESPACIO, con precios.
            const espacios = (gp.spaces || []).map(sp => {
                const calcSp = Pricing.compute(flatFromItems(sp.items), ctx);
                return {
                    nombre: sp.name || 'Espacio',
                    surface: sp.surface || '',
                    rubros: rubrosConPrecio(calcSp),
                    subtotal: fmtARS(calcSp.subtotal),
                };
            }).filter(e => e.rubros.length);
            detalle = { espacios, subtotal: fmtARS(calc.subtotal), iva_pct: 21, iva: fmtARS(calc.tax), total: fmtARS(calc.total) };
        }

        const evd = gp.eventoData || {};
        const proyecto = {
            cliente: gp.cliente || '', descripcion: gp.proyecto || '', evento: gp.evento || '',
            lugar: evd.venue || '', fecha_evento: fechaEvento(evd), armado_desarme: evd.setupDate || '',
        };
        if (esStand) {
            proyecto.superficie = gp.metraje ? `${gp.metraje} m²` : '';
            proyecto.tipo = STAND_TIPOS[gp.standType] || (gp.standType || '');
            proyecto.altura = alturaLabel(gp);
        } else {
            proyecto.espacios = (gp.spaces || []).length;
        }

        return {
            modo,
            fecha_emision: hoyLargo(),
            ref: gp.cotNumber || null,           // si la cotización ya tiene número
            incluye_diseno: incluyeDiseno(flatAll),
            proyecto,
            resena: gp.proposalText || '',
            detalle,
            distribucion: null,
        };
    }

    function validate(p) {
        if (!p.proyecto.cliente) return 'Cargá el cliente antes de generar la propuesta.';
        const hayItems = (p.detalle.rubros && p.detalle.rubros.length) ||
            (p.detalle.espacios && p.detalle.espacios.length);
        if (!hayItems) return 'No hay ítems en la cotización.';
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

    function fileNameFor(p) {
        let n = `Propuesta - ${p.proyecto.cliente || 'MEPEX'}`;
        if (p.proyecto.evento) n += ` - ${p.proyecto.evento}`;
        return n.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) + '.pdf';
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
        const fname = fileNameFor(payload);
        const ov = document.createElement('div');
        ov.className = 'propuesta-overlay';
        ov.innerHTML =
            '<div class="propuesta-modal">' +
            '<div class="propuesta-modal-head"><strong>Vista previa — Propuesta</strong>' +
            '<div class="ph-actions">' +
            '<a class="btn-primary" id="propuesta-dl" download="' + fname + '" href="' + url + '">⬇ Descargar</a>' +
            '<button class="btn-ghost" id="propuesta-save">💾 Guardar</button>' +
            '<button class="btn-ghost" id="propuesta-close">Cerrar</button>' +
            '</div></div>' +
            '<iframe class="propuesta-frame" src="' + url + '"></iframe>' +
            '</div>';
        document.body.appendChild(ov);
        const close = () => { ov.remove(); setTimeout(() => URL.revokeObjectURL(url), 3000); };
        ov.querySelector('#propuesta-close').addEventListener('click', close);
        ov.addEventListener('click', e => { if (e.target === ov) close(); });

        // Guardar en el panel de Propuestas (Supabase). Guard anti-doble-click.
        const saveBtn = ov.querySelector('#propuesta-save');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                if (saveBtn.dataset.busy) return;
                if (typeof PropuestaStorage === 'undefined') return notify('Módulo de guardado no disponible.', 'error');
                if (typeof API === 'undefined' || !API.isConnected) return notify('Sin conexión al servidor: no se puede guardar.', 'error');
                saveBtn.dataset.busy = '1';
                saveBtn.disabled = true;
                const prev = saveBtn.textContent;
                saveBtn.textContent = 'Guardando…';
                try {
                    await PropuestaStorage.save(blob, payload, fname);
                    saveBtn.textContent = '✓ Guardada';
                    notify('Propuesta guardada en el panel.', 'success');
                } catch (e) {
                    saveBtn.textContent = prev;
                    saveBtn.disabled = false;
                    delete saveBtn.dataset.busy;
                    notify('No se pudo guardar: ' + (e && e.message ? e.message : 'error'), 'error');
                }
            });
        }
    }

    function init() {
        const btn = document.getElementById('btn-propuesta');
        if (btn) btn.addEventListener('click', generate);
        // "Vista previa" de la propuesta: la generación ya es preview-first
        // (abre el modal con Descargar/Guardar), así que comparte método.
        const pv = document.getElementById('btn-propuesta-preview');
        if (pv) pv.addEventListener('click', generate);
    }
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
        else init();
    }

    const api = { buildPayload, generate };
    if (typeof window !== 'undefined') window.Propuesta = api;
    if (typeof globalThis !== 'undefined') globalThis.Propuesta = api;
})();
