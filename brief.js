// =============================================
// BRIEF EXPRESS — 10 preguntas → cotización (Fase 3)
// =============================================
// Recolecta respuestas rápidas (ping-pong de opciones) + notas opcionales.
// Setea los parámetros del stand DISPARANDO los controles reales de la UI
// (clicks/change) para no desincronizar State. Si la IA está habilitada en el
// backend, pide el mapeo de ítems contra el catálogo real (/api/ai/brief).
// Siempre muestra un PREVIEW antes de aplicar: el humano confirma.
const Brief = {
    aiEnabled: false,

    QUESTIONS: [
        { id: 'datos', q: 'Cliente y evento', type: 'text' },
        { id: 'superficie', q: '¿Cuánto espacio? (m²)', type: 'single', custom: true,
          opts: [['9', '9'], ['18', '18'], ['36', '36'], ['54', '54']] },
        { id: 'ubicacion', q: '¿Cómo es la ubicación?', type: 'single',
          opts: [['Isla', 'isla'], ['Esquina', 'esquina'], ['Península', 'peninsula'], ['Contra pared', 'centro']] },
        { id: 'altura', q: '¿Qué altura?', type: 'single',
          opts: [['2,5 m', 'standard'], ['3,0 m', 'media'], ['Plus 3,5 m', 'plus'], ['4,0 m', 'extra'], ['5,0 m', 'maxima']] },
        { id: 'piso', q: '¿Qué piso?', type: 'single',
          opts: [['Alfombra ferial', 'Alfombra ferial'], ['Tarima', 'Tarima'], ['Vinílico símil madera', 'Vinílico símil madera'], ['Tarima alta', 'Tarima alta']] },
        { id: 'grafica', q: '¿Cuánta gráfica?', type: 'single',
          opts: [['Poca (~30%)', '30%'], ['Media (~60%)', '60%'], ['Full (~100%)', '100%']] },
        { id: 'ilum', q: '¿Qué iluminación?', type: 'single',
          opts: [['Básica', 'Básica'], ['Destacada', 'Destacada'], ['Premium', 'Premium']] },
        { id: 'atencion', q: '¿Qué necesita para atender?', type: 'multi',
          opts: [['Mostrador', 'Mostrador'], ['Banquetas', 'Banquetas'], ['Mesa de reunión', 'Mesa de reunión'], ['Exhibidores', 'Exhibidores'], ['Depósito cerrado', 'Depósito cerrado']] },
        { id: 'electro', q: '¿Electrónica y electrodomésticos?', type: 'multi',
          opts: [['Smart TV', 'Smart TV'], ['Pantalla LED', 'Pantalla LED'], ['Heladera', 'Heladera'], ['Dispenser', 'Dispenser'], ['Cargadores', 'Cargadores']] },
        { id: 'servicios', q: '¿Servicios y logística?', type: 'multi',
          opts: [['Diseño 3D + render', 'Diseño 3D + render'], ['Azafatas', 'Azafatas'], ['Servicio AV', 'Servicio AV'], ['Flete / logística', 'Flete / logística'], ['Catering', 'Catering'], ['Sonido', 'Sonido'], ['Plantas / deco', 'Plantas / deco'], ['Limpieza', 'Limpieza'], ['Seguridad', 'Seguridad']] }
    ],

    async init() {
        try { const s = await API.aiStatus(); this.aiEnabled = !!(s && s.enabled); }
        catch { this.aiEnabled = false; }
        document.getElementById('btn-brief')?.addEventListener('click', () => this.open());
    },

    // ── Modal ──────────────────────────────────────────────
    open() {
        const cli = document.getElementById('input-cliente')?.value || '';
        const evt = document.getElementById('input-evento')?.value || '';

        const overlay = document.createElement('div');
        overlay.className = 'brief-overlay';
        overlay.innerHTML = `
            <div class="brief-modal">
                <div class="brief-header">
                    <div>
                        <div class="brief-title">✨ Brief Express</div>
                        <div class="brief-sub">10 preguntas · ~15 min · ${this.aiEnabled ? 'IA activa' : 'IA off — setea params, no autocompleta ítems'}</div>
                    </div>
                    <button class="brief-close" aria-label="Cerrar">✕</button>
                </div>
                <div class="brief-body" id="brief-body">
                    ${this._questionsHtml(cli, evt)}
                </div>
                <div class="brief-footer">
                    <button class="btn-secondary brief-cancel">Cancelar</button>
                    <button class="btn-primary brief-generate">Generar cotización →</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        const close = () => overlay.remove();
        overlay.querySelector('.brief-close').addEventListener('click', close);
        overlay.querySelector('.brief-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        // Selección de chips (single = radio por pregunta, multi = toggle)
        overlay.querySelectorAll('.brief-chips').forEach(box => {
            box.addEventListener('click', (e) => {
                const chip = e.target.closest('.brief-chip');
                if (!chip) return;
                if (box.dataset.type === 'multi') {
                    chip.classList.toggle('sel');
                } else {
                    box.querySelectorAll('.brief-chip').forEach(c => c.classList.remove('sel'));
                    chip.classList.add('sel');
                }
            });
        });

        overlay.querySelector('.brief-generate').addEventListener('click', () => this.generate(overlay));
        this._overlay = overlay;
    },

    _questionsHtml(cli, evt) {
        let n = 0;
        return this.QUESTIONS.map(qq => {
            n++;
            if (qq.type === 'text') {
                return `
                <div class="brief-q">
                    <div class="brief-qh"><span class="brief-qn">${n}</span>${qq.q}</div>
                    <div class="brief-text-fields">
                        <input type="text" class="brief-input" data-k="cliente" placeholder="Cliente" value="${cli.replace(/"/g, '&quot;')}">
                        <input type="text" class="brief-input" data-k="evento" placeholder="Evento" value="${evt.replace(/"/g, '&quot;')}">
                    </div>
                </div>`;
            }
            const chips = qq.opts.map(o => `<span class="brief-chip" data-val="${o[1]}">${o[0]}</span>`).join('');
            const custom = qq.custom ? `<span class="brief-chip brief-chip-custom" data-val="__custom">Otro…</span>` : '';
            return `
                <div class="brief-q">
                    <div class="brief-qh"><span class="brief-qn">${n}</span>${qq.q}${qq.type === 'multi' ? '<span class="brief-multi">elegí varios</span>' : ''}</div>
                    <div class="brief-chips" data-id="${qq.id}" data-type="${qq.type}">${chips}${custom}</div>
                </div>`;
        }).join('') + `
            <div class="brief-q">
                <div class="brief-qh"><span class="brief-qn">+</span>Notas de la reunión (opcional)</div>
                <textarea class="brief-notes" id="brief-notes" rows="3" placeholder="Pegá acá el resumen de la reunión y la IA lo usa para afinar el brief…"></textarea>
            </div>`;
    },

    _answers(overlay) {
        const a = { items_text: [] };
        overlay.querySelectorAll('.brief-input').forEach(inp => { a[inp.dataset.k] = inp.value.trim(); });
        overlay.querySelectorAll('.brief-chips').forEach(box => {
            const id = box.dataset.id;
            const sel = [...box.querySelectorAll('.brief-chip.sel')].map(c => c.dataset.val);
            a[id] = box.dataset.type === 'multi' ? sel : (sel[0] || null);
        });
        a.notas = overlay.querySelector('#brief-notes')?.value.trim() || '';
        return a;
    },

    // Compila las respuestas en un brief en lenguaje natural para la IA
    _briefText(a) {
        const L = [];
        if (a.cliente) L.push(`Cliente: ${a.cliente}.`);
        if (a.evento) L.push(`Evento: ${a.evento}.`);
        if (a.superficie) L.push(`Superficie: ${a.superficie} m².`);
        const ubi = { isla: 'isla (4 lados abiertos)', esquina: 'esquina (2 lados)', peninsula: 'península (3 lados)', centro: 'contra pared (1 lado)' };
        if (a.ubicacion) L.push(`Ubicación: ${ubi[a.ubicacion] || a.ubicacion}.`);
        const alt = { standard: '2,5m', media: '3,0m', plus: '3,5m', extra: '4,0m', maxima: '5,0m' };
        if (a.altura) L.push(`Altura: ${alt[a.altura] || a.altura}.`);
        if (a.piso) L.push(`Piso: ${a.piso}.`);
        if (a.grafica) L.push(`Cobertura de gráfica: ${a.grafica} de la superficie.`);
        if (a.ilum) L.push(`Iluminación: ${a.ilum}.`);
        if (a.atencion?.length) L.push(`Atención al público: ${a.atencion.join(', ')}.`);
        if (a.electro?.length) L.push(`Electrónica/electrodomésticos: ${a.electro.join(', ')}.`);
        if (a.servicios?.length) L.push(`Servicios y logística: ${a.servicios.join(', ')}.`);
        if (a.notas) L.push(`Notas de la reunión: ${a.notas}`);
        return L.join('\n');
    },

    async generate(overlay) {
        const a = this._answers(overlay);
        const briefText = this._briefText(a);
        const body = overlay.querySelector('#brief-body');
        const footer = overlay.querySelector('.brief-footer');

        let aiItems = null, aiError = null;
        if (this.aiEnabled) {
            footer.innerHTML = `<div class="brief-loading"><span class="mp-spinner"></span> La IA está armando el borrador…</div>`;
            try {
                const catalog = (DATABASE.items || []).map(i => ({ id: i.id, name: i.name, rubro: i.rubro, category: i.category, unit: i.unit }));
                const res = await API.aiBrief(briefText, catalog);
                aiItems = (res && res.items) || [];
            } catch (e) { aiError = e.message; }
        }

        // Preview
        const stdLabel = { isla: 'Isla', esquina: 'Esquina', peninsula: 'Península', centro: 'Contra pared' };
        const altLabel = { standard: '2,5m', media: '3,0m', plus: '3,5m', extra: '4,0m', maxima: '5,0m' };
        const paramRows = [
            a.superficie ? `Superficie: <b>${a.superficie} m²</b>` : '',
            a.ubicacion ? `Tipo: <b>${stdLabel[a.ubicacion]}</b>` : '',
            a.altura ? `Altura: <b>${altLabel[a.altura]}</b>` : ''
        ].filter(Boolean).join(' · ');

        let itemsHtml;
        if (aiItems && aiItems.length) {
            itemsHtml = aiItems.map(it => {
                const cat = DB.getItemById(String(it.id));
                const name = cat ? cat.name : `(id ${it.id})`;
                const ghost = (it.confianza != null && it.confianza < 0.5);
                return `<div class="brief-prev-item ${ghost ? 'ghost' : ''}">
                    <span>${ghost ? '◇ ' : '✓ '}${name}</span><span>×${it.cantidad || 1}</span></div>`;
            }).join('');
        } else if (this.aiEnabled) {
            itemsHtml = `<div class="brief-empty">${aiError ? 'La IA no pudo mapear ítems: ' + aiError : 'La IA no sugirió ítems.'} Se aplicarán solo los parámetros.</div>`;
        } else {
            itemsHtml = `<div class="brief-empty">IA desactivada: se aplican los parámetros (superficie, tipo, altura). Para autocompletar ítems, configurá ANTHROPIC_API_KEY en el backend.</div>`;
        }

        body.innerHTML = `
            <div class="brief-prev">
                <div class="brief-prev-h">Parámetros del stand</div>
                <div class="brief-prev-params">${paramRows || 'Sin parámetros'}</div>
                <div class="brief-prev-h">Ítems propuestos ${aiItems && aiItems.length ? `(${aiItems.length})` : ''}</div>
                <div class="brief-prev-items">${itemsHtml}</div>
                <div class="brief-prev-note">◇ = baja confianza (revisá). Vas a poder ajustar todo después de aplicar.</div>
            </div>`;
        footer.innerHTML = `
            <button class="btn-secondary brief-back">← Volver</button>
            <button class="btn-primary brief-apply">Aplicar al cotizador</button>`;
        footer.querySelector('.brief-back').addEventListener('click', () => { overlay.remove(); this.open(); });
        footer.querySelector('.brief-apply').addEventListener('click', () => { this._apply(a, aiItems); overlay.remove(); });
    },

    // Aplica disparando los controles reales (no toca State a mano)
    _apply(a, aiItems) {
        // 1) Modo stand
        document.querySelector('.quot-btn-param[data-type="stand"]')?.click();

        // 2) Superficie
        if (a.superficie && a.superficie !== '__custom') {
            const m = document.getElementById('input-metraje');
            if (m) { m.value = parseInt(a.superficie) || m.value; m.dispatchEvent(new Event('change', { bubbles: true })); }
        }
        // 3) Tipo de stand
        if (a.ubicacion) document.querySelector(`.stand-btn[data-type="${a.ubicacion}"]`)?.click();
        // 4) Altura
        if (a.altura) document.querySelector(`.height-chip[data-height="${a.altura}"]`)?.click();
        // 5) Cliente / evento
        const setInput = (id, val) => {
            if (!val) return;
            const el = document.getElementById(id);
            if (el) { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
        };
        setInput('input-cliente', a.cliente);
        setInput('input-evento', a.evento);

        // 6) Ítems sugeridos por IA
        let applied = 0;
        if (aiItems && aiItems.length && typeof State !== 'undefined') {
            aiItems.forEach(it => {
                const item = DB.getItemById(String(it.id));
                if (item) { State.toggleItem(String(it.id), Math.max(1, parseInt(it.cantidad) || 1)); applied++; }
            });
        }

        if (typeof Toast !== 'undefined') {
            Toast.success(`Brief aplicado: parámetros${applied ? ` + ${applied} ítems` : ''}. Revisá y ajustá.`);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => Brief.init());
window.Brief = Brief;
console.log('✨ Brief Express module loaded');
