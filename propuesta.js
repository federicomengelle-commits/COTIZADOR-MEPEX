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
        const multi = State.isMultiSpaceType(gp.quotationType);
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

    function buildPayload(renders) {
        const gp = State.generalParams;
        const tipo = gp.quotationType || 'expo';
        // `modo` se pinta como badge en la CARÁTULA, o sea que lo lee el cliente → va la
        // etiqueta de la rama, no la clave interna (que para Equipamiento dice "alquiler").
        // El motor solo compara contra "STAND", y esa no cambió.
        const modo = DB.typeLabelUpper(tipo);
        const esStand = tipo === 'stand';
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
            // Nivel de detalle: 'minimo' | 'medio' | 'detallado'. El payload manda SIEMPRE
            // los importes y el motor decide cuáles imprimir. Es a propósito: si el front
            // se despliega antes que el motor, un motor viejo ignora este campo y dibuja
            // detallado — feo pero válido. Si en cambio le sacáramos las claves acá, el
            // motor viejo tiraría 500 (KeyError 'parcial'). Degradar > romper.
            nivel_detalle: (typeof State !== 'undefined' && State.detailLevel) ? State.detailLevel() : 'detallado',
            fecha_emision: hoyLargo(),
            ref: gp.cotNumber || null,           // si la cotización ya tiene número
            incluye_diseno: incluyeDiseno(flatAll),
            proyecto,
            resena: gp.proposalText || '',
            detalle,
            renders: Array.isArray(renders) ? renders : [],   // [{src(data-URI), comentario}] — opcional
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

    async function generate(renders) {
        let payload;
        try { payload = buildPayload(renders); }
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

    // ── Constructor de renders (paso previo a "Exportar propuesta") ──────────
    // Las imágenes son OPCIONALES: se puede generar la propuesta sola, con 1 o con N.
    const _RENDER_PHRASES = [
        'Vitrina para exhibición', 'Mostrador de atención', 'Cartel en altura',
        'Piso de tarima', 'Alfombra ferial', 'Iluminación destacada',
        'Sistema modular OCTEXA', 'Depósito cerrado', 'Living / sillones',
        'Mesa de reunión', 'Pantalla / TV', 'Logo iluminado', 'Estantería',
        'Gráfica de marca', 'Acceso al stand', 'Plantas / deco', 'Barra / kitchenette'
    ];

    function _stripDataUri(src) {
        const m = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i.exec(src || '');
        return m ? { media_type: m[1], data: m[2] } : { media_type: 'image/jpeg', data: '' };
    }

    function _downscale(file, maxDim, quality) {
        maxDim = maxDim || 1600; quality = quality || 0.82;
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = () => {
                    let w = img.width, h = img.height;
                    if (w > maxDim || h > maxDim) {
                        const s = maxDim / Math.max(w, h);
                        w = Math.round(w * s); h = Math.round(h * s);
                    }
                    const c = document.createElement('canvas');
                    c.width = w; c.height = h;
                    try {
                        const cx = c.getContext('2d');
                        // Relleno BLANCO primero: los renders PNG transparentes, al pasar a JPEG,
                        // rellenarían la transparencia de NEGRO. Con esto la transparencia queda blanca.
                        cx.fillStyle = '#ffffff';
                        cx.fillRect(0, 0, w, h);
                        cx.drawImage(img, 0, 0, w, h);
                        resolve(c.toDataURL('image/jpeg', quality));
                    } catch (e) { reject(e); }
                };
                img.onerror = reject;
                img.src = reader.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function ensureRenderStepStyles() {
        if (document.getElementById('rstep-styles')) return;
        const s = document.createElement('style');
        s.id = 'rstep-styles';
        s.textContent =
            '.rstep-modal{background:#111;border:1px solid #333;border-radius:10px;width:min(680px,96vw);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;color:#E8E8E8;font-family:inherit;}' +
            '.rstep-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #2a2a2a;}' +
            '.rstep-sub{font-size:12px;color:#888;margin-top:3px;}' +
            '.rstep-body{padding:14px 16px;overflow-y:auto;flex:1;}' +
            '.rstep-drop{display:flex;flex-direction:column;align-items:center;gap:4px;padding:18px;border:1.5px dashed #3a3a3a;border-radius:8px;cursor:pointer;color:#9aa0a6;transition:all .15s;text-align:center;}' +
            '.rstep-drop:hover{border-color:rgba(0,169,193,.5);color:#00A9C1;background:rgba(0,169,193,.05);}' +
            '.rstep-drop-ico{font-size:22px;}' +
            '.rstep-drop-hint{font-size:11px;color:#666;}' +
            '.rstep-list{display:flex;flex-direction:column;gap:10px;margin-top:12px;}' +
            '.rstep-item{display:flex;gap:10px;padding:8px;border:1px solid #2a2a2a;border-radius:8px;background:#161616;}' +
            '.rstep-thumb{width:96px;height:72px;object-fit:cover;border-radius:5px;flex-shrink:0;background:#000;}' +
            '.rstep-item-main{flex:1;display:flex;flex-direction:column;gap:6px;min-width:0;}' +
            '.rstep-cap{width:100%;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:5px;color:#E8E8E8;font-family:inherit;font-size:12px;padding:6px 8px;resize:vertical;min-height:42px;box-sizing:border-box;}' +
            '.rstep-item-actions{display:flex;gap:6px;align-items:center;}' +
            '.rstep-ia{background:transparent;border:1px solid rgba(0,169,193,.4);color:#00A9C1;border-radius:5px;font-size:11px;font-weight:600;padding:4px 9px;cursor:pointer;font-family:inherit;}' +
            '.rstep-ia:hover{background:rgba(0,169,193,.1);}' +
            '.rstep-ia:disabled{opacity:.5;cursor:not-allowed;}' +
            '.rstep-rm{background:transparent;border:none;color:#888;cursor:pointer;font-size:14px;margin-left:auto;}' +
            '.rstep-rm:hover{color:#FF4D4D;}' +
            '.rstep-chips{display:flex;flex-wrap:wrap;gap:4px;}' +
            '.rstep-chip{background:#1a1a1a;border:1px solid #2a2a2a;color:#9aa0a6;border-radius:20px;font-size:10px;padding:2px 8px;cursor:pointer;font-family:inherit;}' +
            '.rstep-chip:hover{border-color:rgba(0,169,193,.4);color:#00A9C1;}' +
            '.rstep-mini{background:transparent;border:1px solid #2a2a2a;color:#9aa0a6;border-radius:4px;font-size:11px;width:22px;cursor:pointer;font-family:inherit;}' +
            '.rstep-mini:disabled{opacity:.3;cursor:default;}' +
            '.rstep-mini:hover:not(:disabled){border-color:rgba(0,169,193,.4);color:#00A9C1;}' +
            '.rstep-acotar{background:transparent;border:1px solid rgba(0,169,193,.4);color:#00A9C1;border-radius:5px;font-size:11px;font-weight:600;padding:4px 9px;cursor:pointer;font-family:inherit;}' +
            '.rstep-acotar:hover{background:rgba(0,169,193,.1);}' +
            '.rstep-portada{font-size:10px;font-weight:700;color:#F28D15;letter-spacing:.3px;}' +
            // Editor de acotes
            '.acot-modal{background:#111;border:1px solid #333;border-radius:10px;width:min(940px,97vw);max-height:94vh;display:flex;flex-direction:column;overflow:hidden;color:#E8E8E8;}' +
            '.acot-body{display:flex;gap:14px;padding:14px 16px;overflow:auto;}' +
            '.acot-stage{position:relative;display:inline-block;flex-shrink:0;background:#fff;border:1px solid #2a2a2a;border-radius:4px;line-height:0;}' +
            '.acot-stage img{display:block;max-width:560px;max-height:62vh;cursor:crosshair;}' +
            '.acot-layer{position:absolute;inset:0;}' +
            '.acot-h{position:absolute;height:0;border-top:1px solid #111;}' +
            '.acot-v{position:absolute;width:0;border-left:1px solid #111;}' +
            '.acot-dot{position:absolute;width:8px;height:8px;margin:-4px 0 0 -4px;background:#00A9C1;border-radius:50%;}' +
            '.acot-lab{position:absolute;font-size:11px;font-weight:400;color:#111;background:rgba(255,255,255,.55);padding:0 3px;white-space:nowrap;cursor:move;border:1px dashed transparent;}' +
            '.rstep-imgtag{font-size:10px;color:#777;}' +
            '.acot-lab.active{border-color:#00A9C1;}' +
            '.acot-side{flex:1;display:flex;flex-direction:column;gap:8px;min-width:190px;}' +
            '.acot-list{display:flex;flex-direction:column;gap:5px;}' +
            '.acot-row{display:flex;gap:6px;align-items:center;}' +
            '.acot-row input{flex:1;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:5px;color:#E8E8E8;font-size:12px;padding:5px 7px;font-family:inherit;}' +
            '.acot-row.active input{border-color:#00A9C1;}' +
            '.rstep-foot{display:flex;justify-content:space-between;gap:10px;padding:12px 16px;border-top:1px solid #2a2a2a;}';
        document.head.appendChild(s);
    }

    function openRenderStep() {
        ensureStyles();
        ensureRenderStepStyles();
        const gp = (typeof State !== 'undefined' && State.generalParams) || {};
        const ctx = { cliente: gp.cliente || '', evento: gp.evento || '', tipo: gp.quotationType || '' };
        const items = []; // {src(data-URI), comentario}

        const ov = document.createElement('div');
        ov.className = 'propuesta-overlay';
        ov.innerHTML =
            '<div class="rstep-modal">' +
            '<div class="rstep-head"><div><strong>Exportar propuesta</strong>' +
            '<div class="rstep-sub">Agregá renders del diseño (opcional). Podés generar la propuesta sola.</div></div>' +
            '<button class="btn-ghost" id="rstep-close">✕</button></div>' +
            '<div class="rstep-body">' +
            '<label class="rstep-drop"><input type="file" id="rstep-file" accept="image/*" multiple hidden>' +
            '<span class="rstep-drop-ico">🖼️</span><span>Subir renders (JPG/PNG)</span>' +
            '<span class="rstep-drop-hint">La 1ra va en la carátula. Reordená y acotá cada render con ✎ Acotar.</span></label>' +
            '<div class="rstep-list" id="rstep-list"></div></div>' +
            '<div class="rstep-foot"><button class="btn-ghost" id="rstep-cancel">Cancelar</button>' +
            '<button class="btn-primary" id="rstep-generate">Generar propuesta →</button></div>' +
            '</div>';
        document.body.appendChild(ov);
        const close = () => ov.remove();
        ov.querySelector('#rstep-close').addEventListener('click', close);
        ov.querySelector('#rstep-cancel').addEventListener('click', close);
        ov.addEventListener('click', e => { if (e.target === ov) close(); });

        const listEl = ov.querySelector('#rstep-list');
        const renderList = () => {
            listEl.innerHTML = '';
            items.forEach((it, idx) => {
                const row = document.createElement('div');
                row.className = 'rstep-item';

                const thumb = document.createElement('img');
                thumb.className = 'rstep-thumb'; thumb.src = it.src;

                const rm = document.createElement('button');
                rm.className = 'rstep-rm'; rm.title = 'Quitar'; rm.textContent = '✕';
                rm.addEventListener('click', () => { items.splice(idx, 1); renderList(); });

                const mkMini = (txt, title) => {
                    const b = document.createElement('button');
                    b.type = 'button'; b.className = 'rstep-mini'; b.title = title; b.textContent = txt;
                    return b;
                };
                const up = mkMini('↑', 'Subir'); up.disabled = idx === 0;
                const down = mkMini('↓', 'Bajar'); down.disabled = idx === items.length - 1;
                up.addEventListener('click', () => { if (idx > 0) { const t = items[idx - 1]; items[idx - 1] = items[idx]; items[idx] = t; renderList(); } });
                down.addEventListener('click', () => { if (idx < items.length - 1) { const t = items[idx + 1]; items[idx + 1] = items[idx]; items[idx] = t; renderList(); } });
                const nAcotes = (it.anotaciones || []).length;
                const acotar = document.createElement('button');
                acotar.type = 'button'; acotar.className = 'rstep-acotar';
                acotar.textContent = nAcotes ? `✎ Acotar (${nAcotes})` : '✎ Acotar';
                acotar.title = 'Marcar features del render con líneas';
                acotar.addEventListener('click', () => openAcotar(it, renderList));

                const actions = document.createElement('div');
                actions.className = 'rstep-item-actions';
                actions.appendChild(up); actions.appendChild(down);
                actions.appendChild(acotar); actions.appendChild(rm);

                const main = document.createElement('div');
                main.className = 'rstep-item-main';
                const tag = document.createElement('div');
                tag.className = idx === 0 ? 'rstep-portada' : 'rstep-imgtag';
                tag.textContent = idx === 0 ? '★ Portada (va en la carátula)' : `Render ${idx + 1}`;
                main.appendChild(tag); main.appendChild(actions);

                row.appendChild(thumb); row.appendChild(main);
                listEl.appendChild(row);
            });
        };

        const fileInput = ov.querySelector('#rstep-file');
        fileInput.addEventListener('change', async () => {
            const files = Array.from(fileInput.files || []);
            for (const f of files) {
                if (!/^image\//.test(f.type)) continue;
                try { const src = await _downscale(f); items.push({ src, comentario: '' }); }
                catch (_) { notify('No pude procesar una imagen.', 'error'); }
            }
            fileInput.value = '';
            renderList();
        });

        ov.querySelector('#rstep-generate').addEventListener('click', () => {
            const renders = items.filter(i => i.src).map(i => ({
                src: i.src,
                comentario: i.comentario || '',
                anotaciones: i.anotaciones || []
            }));
            close();
            generate(renders);
        });
    }

    // Editor de acotes: clickeás un punto del render → escribís/elegís el título →
    // arrastrás la etiqueta. Guarda item.anotaciones = [{label, tx, ty, lx, ly}] (en %).
    function openAcotar(item, onChange) {
        ensureStyles(); ensureRenderStepStyles();
        const anots = (item.anotaciones || []).map(a => ({ ...a }));
        let active = anots.length ? anots.length - 1 : -1;

        const ov = document.createElement('div');
        ov.className = 'propuesta-overlay';
        ov.innerHTML =
            '<div class="acot-modal">' +
            '<div class="rstep-head"><div><strong>Acotar render</strong>' +
            '<div class="rstep-sub">Clickeá un punto del render para marcarlo → escribí el título o usá un chip. Arrastrá la etiqueta para acomodarla.</div></div>' +
            '<button class="btn-ghost" id="acot-x">✕</button></div>' +
            '<div class="acot-body"><div class="acot-stage" id="acot-stage"><img id="acot-img" src="' + item.src + '"><div class="acot-layer" id="acot-layer"></div></div>' +
            '<div class="acot-side"><div class="rstep-chips" id="acot-chips"></div><div class="acot-list" id="acot-list"></div></div></div>' +
            '<div class="rstep-foot"><button class="btn-ghost" id="acot-cancel">Cancelar</button><button class="btn-primary" id="acot-done">Listo</button></div>' +
            '</div>';
        document.body.appendChild(ov);
        const close = () => ov.remove();
        ov.querySelector('#acot-x').addEventListener('click', close);
        ov.querySelector('#acot-cancel').addEventListener('click', close);
        ov.addEventListener('click', e => { if (e.target === ov) close(); });

        const stage = ov.querySelector('#acot-stage');
        const img = ov.querySelector('#acot-img');
        const layer = ov.querySelector('#acot-layer');
        const listEl = ov.querySelector('#acot-list');
        const chipsEl = ov.querySelector('#acot-chips');
        const rectOf = () => img.getBoundingClientRect();
        const clamp = (n) => Math.max(0, Math.min(100, n));

        const draw = () => {
            layer.innerHTML = '';
            anots.forEach((a, i) => {
                const hx = Math.min(a.lx, a.tx), hw = Math.abs(a.tx - a.lx);
                const vy = Math.min(a.ly, a.ty), vh = Math.abs(a.ty - a.ly);
                const mk = (cls, css) => { const d = document.createElement('div'); d.className = cls; d.style.cssText = css; return d; };
                layer.appendChild(mk('acot-h', `left:${hx}%;top:${a.ly}%;width:${hw}%`));
                layer.appendChild(mk('acot-v', `left:${a.tx}%;top:${vy}%;height:${vh}%`));
                layer.appendChild(mk('acot-dot', `left:${a.tx}%;top:${a.ty}%`));
                const lab = document.createElement('div');
                lab.className = 'acot-lab' + (i === active ? ' active' : '');
                // Texto al lado CONTRARIO al objetivo → la línea toca el borde de la palabra
                const tr = a.tx >= a.lx ? 'translate(-100%,-50%)' : 'translate(0,-50%)';
                lab.style.cssText = `left:${a.lx}%;top:${a.ly}%;transform:${tr}`;
                lab.textContent = a.label || '(sin título)';
                lab.addEventListener('mousedown', (e) => {
                    e.preventDefault(); e.stopPropagation(); active = i; renderSide(); draw();
                    const move = (ev) => { const r = rectOf(); a.lx = clamp((ev.clientX - r.left) / r.width * 100); a.ly = clamp((ev.clientY - r.top) / r.height * 100); draw(); };
                    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
                    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
                });
                layer.appendChild(lab);
            });
        };

        const renderSide = () => {
            chipsEl.innerHTML = '';
            _RENDER_PHRASES.forEach(ph => {
                const b = document.createElement('button'); b.type = 'button'; b.className = 'rstep-chip'; b.textContent = ph;
                b.addEventListener('click', () => { if (active >= 0) { anots[active].label = ph; draw(); renderSide(); } });
                chipsEl.appendChild(b);
            });
            listEl.innerHTML = '';
            anots.forEach((a, i) => {
                const row = document.createElement('div'); row.className = 'acot-row' + (i === active ? ' active' : '');
                const inp = document.createElement('input'); inp.type = 'text'; inp.value = a.label || ''; inp.placeholder = 'Título del acote';
                inp.addEventListener('focus', () => { active = i; draw(); });
                inp.addEventListener('input', () => { a.label = inp.value; draw(); });
                const del = document.createElement('button'); del.type = 'button'; del.className = 'rstep-rm'; del.textContent = '✕';
                del.addEventListener('click', () => { anots.splice(i, 1); active = Math.min(active, anots.length - 1); draw(); renderSide(); });
                row.appendChild(inp); row.appendChild(del); listEl.appendChild(row);
            });
        };

        stage.addEventListener('click', (e) => {
            if (e.target.closest('.acot-lab')) return;
            const r = rectOf();
            const tx = clamp((e.clientX - r.left) / r.width * 100);
            const ty = clamp((e.clientY - r.top) / r.height * 100);
            const lx = tx < 70 ? Math.min(92, tx + 18) : Math.max(8, tx - 22);
            anots.push({ label: '', tx, ty, lx, ly: ty });
            active = anots.length - 1;
            draw(); renderSide();
        });

        ov.querySelector('#acot-done').addEventListener('click', () => {
            item.anotaciones = anots.filter(a => a.label && a.label.trim());
            if (typeof onChange === 'function') onChange();
            close();
        });

        if (img.complete && img.naturalWidth) { draw(); renderSide(); }
        else img.addEventListener('load', () => { draw(); renderSide(); });
    }

    function init() {
        // "Exportar propuesta" abre el constructor (renders opcionales) → generate().
        const btn = document.getElementById('btn-propuesta');
        if (btn) btn.addEventListener('click', openRenderStep);
    }
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
        else init();
    }

    const api = { buildPayload, generate };
    if (typeof window !== 'undefined') window.Propuesta = api;
    if (typeof globalThis !== 'undefined') globalThis.Propuesta = api;
})();
