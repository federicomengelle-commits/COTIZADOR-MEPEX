// =============================================
// MEPEX COTIZADOR - MAIN APPLICATION
// =============================================

// =============================================
// TOAST NOTIFICATIONS
// =============================================
const Toast = {
    _container: null,

    _getContainer() {
        if (!this._container) {
            this._container = document.getElementById('toast-container');
            if (!this._container) {
                this._container = document.createElement('div');
                this._container.id = 'toast-container';
                document.body.appendChild(this._container);
            }
        }
        return this._container;
    },

    show(message, type = 'info', duration = 3500) {
        const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message"></span>
            <button class="toast-close" aria-label="Cerrar">×</button>
        `;
        toast.querySelector('.toast-message').textContent = message;

        const close = () => {
            toast.classList.add('toast-hide');
            setTimeout(() => toast.remove(), 200);
        };

        toast.querySelector('.toast-close').addEventListener('click', close);
        this._getContainer().appendChild(toast);

        if (duration > 0) setTimeout(close, duration);
        return toast;
    },

    success(msg, duration) { return this.show(msg, 'success', duration); },
    error(msg, duration) { return this.show(msg, 'error', duration ?? 5000); },
    warning(msg, duration) { return this.show(msg, 'warning', duration); },
    info(msg, duration) { return this.show(msg, 'info', duration); }
};

// =============================================
// CONFIRM DIALOG (reemplazo de window.confirm)
// =============================================
const Confirm = {
    /**
     * Muestra un diálogo de confirmación custom.
     * @param {Object} opts - { title, message, confirmText, cancelText, danger }
     * @returns {Promise<boolean>} true si el usuario confirma
     */
    show(opts = {}) {
        return new Promise((resolve) => {
            const {
                title = '¿Estás seguro?',
                message = '',
                confirmText = 'Confirmar',
                cancelText = 'Cancelar',
                danger = false
            } = opts;

            const overlay = document.createElement('div');
            overlay.className = 'confirm-overlay';
            overlay.innerHTML = `
                <div class="confirm-dialog" role="dialog" aria-modal="true">
                    <div class="confirm-title"></div>
                    <div class="confirm-message"></div>
                    <div class="confirm-actions">
                        <button class="confirm-btn confirm-btn-cancel"></button>
                        <button class="confirm-btn ${danger ? 'confirm-btn-danger' : 'confirm-btn-ok'}"></button>
                    </div>
                </div>
            `;
            overlay.querySelector('.confirm-title').textContent = title;
            overlay.querySelector('.confirm-message').textContent = message;
            overlay.querySelector('.confirm-btn-cancel').textContent = cancelText;
            overlay.querySelector(`.${danger ? 'confirm-btn-danger' : 'confirm-btn-ok'}`).textContent = confirmText;

            const cleanup = (result) => {
                overlay.remove();
                document.removeEventListener('keydown', onKey);
                resolve(result);
            };

            const onKey = (e) => {
                if (e.key === 'Escape') cleanup(false);
                if (e.key === 'Enter') cleanup(true);
            };

            overlay.querySelector('.confirm-btn-cancel').addEventListener('click', () => cleanup(false));
            overlay.querySelector(`.${danger ? 'confirm-btn-danger' : 'confirm-btn-ok'}`)
                .addEventListener('click', () => cleanup(true));
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) cleanup(false);
            });
            document.addEventListener('keydown', onKey);

            document.body.appendChild(overlay);
            // Focus en el botón de confirmación
            setTimeout(() => {
                overlay.querySelector(`.${danger ? 'confirm-btn-danger' : 'confirm-btn-ok'}`)?.focus();
            }, 50);
        });
    }
};

// =============================================
// UTILIDADES DE FORMATO
// =============================================

/**
 * Formatea un rango de fechas de evento en español.
 * Ejemplos:
 *   "14 - 16 de Marzo 2026"      (mismo mes)
 *   "28 de Marzo - 2 de Abril 2026" (meses distintos)
 *   "14 de Marzo 2026"           (sin endDate)
 */
function formatEventDateRange(startDate, endDate) {
    const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    if (!startDate) return '';
    const start = new Date(startDate + 'T00:00:00');
    const startDay = start.getDate();
    const startMes = MESES[start.getMonth()];
    const startYear = start.getFullYear();

    if (!endDate) return `${startDay} de ${startMes} ${startYear}`;

    const end = new Date(endDate + 'T00:00:00');
    const endDay = end.getDate();
    const endMes = MESES[end.getMonth()];
    const endYear = end.getFullYear();

    if (start.getMonth() === end.getMonth() && startYear === endYear) {
        return `${startDay} - ${endDay} de ${endMes} ${startYear}`;
    }
    return `${startDay} de ${startMes} - ${endDay} de ${endMes} ${endYear}`;
}

// =============================================
// FAVORITES — overlay local (localStorage) sobre el flag del catálogo
// =============================================
// El backend marca items con favorite=true (read-only). Este módulo permite
// al usuario toggle-ar favoritos propios que persisten en el browser.
// La lógica de render combina: fav = itemDeDB.favorite || Favorites.has(id).
const Favorites = {
    _key: 'mepex_user_favorites',
    _set: new Set(),

    init() {
        try {
            const raw = localStorage.getItem(this._key);
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) this._set = new Set(arr);
            }
        } catch (e) {
            console.warn('Favorites: localStorage inválido, reseteando', e);
            this._set = new Set();
        }
    },

    has(itemId) {
        return this._set.has(itemId);
    },

    // Combina flag del catálogo con fav local
    isFavorite(item) {
        if (!item) return false;
        return item.favorite === true || this._set.has(item.id);
    },

    toggle(itemId) {
        if (this._set.has(itemId)) {
            this._set.delete(itemId);
        } else {
            this._set.add(itemId);
        }
        this._persist();
        return this._set.has(itemId);
    },

    _persist() {
        try {
            localStorage.setItem(this._key, JSON.stringify([...this._set]));
        } catch (e) {
            console.warn('Favorites: no se pudo persistir', e);
        }
    }
};

// =============================================
// AUTOSAVE — guarda el State en localStorage cada X ms
// =============================================
// Persiste el borrador actual (cliente, params, items, spaces) en cada cambio
// relevante. Al reload, si hay un draft con contenido, ofrece restaurarlo.
// Se limpia al hacer reset. Tolerante a errores de localStorage (quota, privado).
const Autosave = {
    _key: 'mepex_draft',
    _version: 1,
    _debounceMs: 500,
    _timer: null,
    _suspended: false,

    // Programa un guardado con debounce. Llamar desde cualquier mutation de State.
    schedule() {
        if (this._suspended) return;
        clearTimeout(this._timer);
        this._timer = setTimeout(() => this._save(), this._debounceMs);
    },

    _save() {
        try {
            const payload = {
                v: this._version,
                savedAt: Date.now(),
                selectedItems: State.selectedItems,
                generalParams: State.generalParams,
                spaceCounter: State._spaceCounter
            };
            localStorage.setItem(this._key, JSON.stringify(payload));
        } catch (e) {
            // quota full, modo privado, etc — fallar silencioso
            console.warn('Autosave: no se pudo guardar', e.message);
        }
    },

    // Forzar guardado sincrónico (ej: desde Ctrl+S). Cancela debounce.
    flush() {
        clearTimeout(this._timer);
        this._save();
    },

    load() {
        try {
            const raw = localStorage.getItem(this._key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || parsed.v !== this._version) return null;
            return parsed;
        } catch {
            return null;
        }
    },

    clear() {
        clearTimeout(this._timer);
        try { localStorage.removeItem(this._key); } catch { /* silent */ }
    },

    // Heurística: ¿el borrador tiene contenido que vale la pena restaurar?
    hasMeaningfulContent(draft) {
        if (!draft) return false;
        const items = draft.selectedItems || {};
        if (Object.keys(items).some(k => (items[k]?.quantity || 0) > 0)) return true;
        const p = draft.generalParams || {};
        if ((p.cliente || '').trim()) return true;
        if ((p.proyecto || '').trim()) return true;
        if ((p.evento || '').trim()) return true;
        if ((p.spaces || []).some(s =>
            Object.values(s.items || {}).some(d => (d.quantity || 0) > 0)
        )) return true;
        return false;
    },

    // Formato "hace X" humano
    _ago(ts) {
        if (!ts) return '';
        const sec = Math.max(1, Math.floor((Date.now() - ts) / 1000));
        if (sec < 60) return 'hace un instante';
        const min = Math.floor(sec / 60);
        if (min < 60) return `hace ${min} min`;
        const hr = Math.floor(min / 60);
        if (hr < 24) return `hace ${hr} h`;
        const days = Math.floor(hr / 24);
        return `hace ${days} d`;
    },

    // Aplica un draft al State y re-renderiza toda la UI
    apply(draft) {
        if (!draft) return false;
        this._suspended = true; // evitar autosave en cadena mientras aplicamos
        try {
            const p = draft.generalParams || {};
            // Merge sobre los defaults para no perder props nuevas si cambió el schema
            State.selectedItems = draft.selectedItems || {};
            State.generalParams = { ...State.generalParams, ...p };
            // Restaurar counter de espacios — si no está, derivarlo
            if (typeof draft.spaceCounter === 'number') {
                State._spaceCounter = draft.spaceCounter;
            } else if (Array.isArray(p.spaces)) {
                State._spaceCounter = p.spaces.reduce((m, s) => {
                    const n = parseInt((s.id || '').replace(/\D/g, ''), 10);
                    return Number.isFinite(n) && n > m ? n : m;
                }, 0);
            }

            // Re-renderizar UI completa
            if (typeof Render.resetGeneralParamsUI === 'function') Render.resetGeneralParamsUI();
            if (typeof Render.updateLayoutForType === 'function') {
                Render.updateLayoutForType(State.generalParams.quotationType);
            }
            if (typeof Render.renderSpacesTabs === 'function') Render.renderSpacesTabs();
            if (typeof Render.renderItems === 'function') Render.renderItems();
            if (typeof Render.updateAll === 'function') Render.updateAll();
            return true;
        } catch (e) {
            console.error('Autosave: error aplicando draft', e);
            return false;
        } finally {
            this._suspended = false;
        }
    },

    // Llamar al arrancar la app. Si hay draft con contenido, muestra banner.
    maybePromptRecovery() {
        const draft = this.load();
        if (!this.hasMeaningfulContent(draft)) {
            if (draft) this.clear(); // draft vacío: limpiar
            return;
        }
        this._showBanner(draft);
    },

    _showBanner(draft) {
        // Si ya hay uno, no duplicar
        if (document.querySelector('.draft-recovery-banner')) return;

        const banner = document.createElement('div');
        banner.className = 'draft-recovery-banner';
        banner.setAttribute('role', 'status');
        banner.innerHTML = `
            <div class="draft-recovery-icon">📝</div>
            <div class="draft-recovery-text">
                <div class="draft-recovery-title">Tenés un borrador sin guardar</div>
                <div class="draft-recovery-meta">Último cambio ${this._ago(draft.savedAt)}</div>
            </div>
            <div class="draft-recovery-actions">
                <button type="button" class="btn-draft-restore">Restaurar</button>
                <button type="button" class="btn-draft-discard">Descartar</button>
            </div>
        `;

        const main = document.querySelector('.col-main');
        if (!main) return;
        // Insertar al inicio del main (antes del header)
        main.insertBefore(banner, main.firstChild);

        banner.querySelector('.btn-draft-restore').addEventListener('click', () => {
            const ok = this.apply(draft);
            banner.remove();
            if (ok && typeof Toast !== 'undefined') {
                Toast.success('Borrador restaurado');
            }
        });
        banner.querySelector('.btn-draft-discard').addEventListener('click', () => {
            this.clear();
            banner.remove();
            if (typeof Toast !== 'undefined') Toast.info('Borrador descartado', 1500);
        });
    }
};

// =============================================
// TEMPLATES — presets reusables guardados en localStorage
// =============================================
// Permite snapshotear el estado actual (params + items, sin datos de cliente/proyecto/
// evento/fecha) como un "template" reusable. Al aplicarlo, se pisan los params e items
// pero se preservan los datos del cliente/proyecto/evento/fecha que ya estén cargados.
// Casos de uso: stands "base 30m² centro altura standard", presets de alquiler típicos, etc.
const Templates = {
    _key: 'mepex_templates',
    _version: 1,

    list() {
        try {
            const raw = localStorage.getItem(this._key);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!parsed || parsed.v !== this._version || !Array.isArray(parsed.items)) return [];
            return parsed.items;
        } catch {
            return [];
        }
    },

    _write(items) {
        try {
            localStorage.setItem(this._key, JSON.stringify({ v: this._version, items }));
            return true;
        } catch (e) {
            console.warn('Templates: no se pudo guardar', e.message);
            return false;
        }
    },

    // Snapshotea el State actual excluyendo datos sensibles (cliente/proyecto/evento/fecha).
    // Devuelve el objeto guardado, o null si falla.
    saveFromCurrent(name) {
        const cleanName = (name || '').trim();
        if (!cleanName) return null;

        // Clonar generalParams y borrar campos que NO forman parte del template
        const gp = JSON.parse(JSON.stringify(State.generalParams));
        gp.cliente = '';
        gp.clienteData = null;
        gp.proyecto = '';
        gp.proyectoData = null;
        gp.evento = '';
        gp.eventoData = null;
        gp.fecha = '';

        // Los spaces sí se preservan enteros (un template puede incluir espacios tipo)
        const snapshot = {
            generalParams: gp,
            selectedItems: JSON.parse(JSON.stringify(State.selectedItems || {})),
            spaceCounter: State._spaceCounter || 0
        };

        const tpl = {
            id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: cleanName,
            createdAt: Date.now(),
            snapshot
        };

        const items = this.list();
        items.push(tpl);
        if (!this._write(items)) return null;
        return tpl;
    },

    delete(id) {
        const items = this.list().filter(t => t.id !== id);
        return this._write(items);
    },

    // Aplica un template al State. Preserva cliente/proyecto/evento/fecha actuales.
    apply(id) {
        const tpl = this.list().find(t => t.id === id);
        if (!tpl || !tpl.snapshot) return false;

        // Suspendemos autosave durante la aplicación para no disparar saves en cadena
        if (typeof Autosave !== 'undefined') Autosave._suspended = true;
        try {
            // Backup de datos actuales del cliente — se preservan
            const preserved = {
                cliente: State.generalParams.cliente,
                clienteData: State.generalParams.clienteData,
                proyecto: State.generalParams.proyecto,
                proyectoData: State.generalParams.proyectoData,
                evento: State.generalParams.evento,
                eventoData: State.generalParams.eventoData,
                fecha: State.generalParams.fecha
            };

            const snap = tpl.snapshot;
            State.selectedItems = JSON.parse(JSON.stringify(snap.selectedItems || {}));
            State.generalParams = { ...State.generalParams, ...snap.generalParams, ...preserved };
            if (typeof snap.spaceCounter === 'number') State._spaceCounter = snap.spaceCounter;

            // Re-render completo
            if (typeof Render.resetGeneralParamsUI === 'function') Render.resetGeneralParamsUI();
            if (typeof Render.updateLayoutForType === 'function') {
                Render.updateLayoutForType(State.generalParams.quotationType);
            }
            if (typeof Render.renderSpacesTabs === 'function') Render.renderSpacesTabs();
            if (typeof Render.renderItems === 'function') Render.renderItems();
            if (typeof Render.updateAll === 'function') Render.updateAll();

            return true;
        } catch (e) {
            console.error('Templates: error aplicando template', e);
            return false;
        } finally {
            if (typeof Autosave !== 'undefined') Autosave._suspended = false;
        }
    },

    _escapeHTML(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    },

    _describeSnapshot(tpl) {
        const gp = tpl.snapshot?.generalParams || {};
        const items = tpl.snapshot?.selectedItems || {};
        const spaces = Array.isArray(gp.spaces) ? gp.spaces.length : 0;
        const qType = (gp.quotationType || 'stand').toUpperCase();
        const itemCount = Object.values(items).filter(d => (d?.quantity || 0) > 0).length;

        const parts = [qType];
        if (gp.quotationType === 'stand') {
            parts.push(`${gp.metraje || 0}m²`);
            if (gp.standType) parts.push(gp.standType);
        } else {
            parts.push(`${spaces} espacio${spaces === 1 ? '' : 's'}`);
        }
        if (itemCount > 0) parts.push(`${itemCount} item${itemCount === 1 ? '' : 's'}`);
        return parts.join(' · ');
    },

    openModal() {
        this.closeModal();

        const overlay = document.createElement('div');
        overlay.id = 'templates-modal';
        overlay.className = 'quot-modal-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-label', 'Templates de cotización');
        overlay.innerHTML = `
            <div class="quot-modal templates-modal">
                <div class="quot-modal-header">
                    <h2>Templates (Presets)</h2>
                    <button class="quot-modal-close" id="templates-modal-close" aria-label="Cerrar">&times;</button>
                </div>
                <div class="quot-modal-body">
                    <div class="templates-save-row">
                        <input type="text" id="template-name-input" class="input-base" placeholder="Nombre del template (ej: Stand 30m² base)" maxlength="60" />
                        <button type="button" id="btn-save-template" class="btn-primary">Guardar actual</button>
                    </div>
                    <div class="templates-save-hint">Guarda los parámetros e items actuales. <strong>No</strong> guarda cliente/proyecto/evento/fecha.</div>
                    <div class="templates-list" id="templates-list"></div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#templates-modal-close').addEventListener('click', () => this.closeModal());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.closeModal();
        });

        const nameInput = overlay.querySelector('#template-name-input');
        const saveBtn = overlay.querySelector('#btn-save-template');

        const doSave = () => {
            const name = nameInput.value.trim();
            if (!name) {
                if (typeof Toast !== 'undefined') Toast.error('Poné un nombre para el template');
                nameInput.focus();
                return;
            }
            const tpl = this.saveFromCurrent(name);
            if (tpl) {
                nameInput.value = '';
                this._renderList(overlay);
                if (typeof Toast !== 'undefined') Toast.success(`Template "${name}" guardado`);
            } else {
                if (typeof Toast !== 'undefined') Toast.error('No se pudo guardar el template');
            }
        };

        saveBtn.addEventListener('click', doSave);
        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') doSave();
        });

        this._renderList(overlay);
        setTimeout(() => nameInput.focus(), 50);
    },

    _renderList(overlay) {
        const list = overlay.querySelector('#templates-list');
        if (!list) return;
        const items = this.list().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        if (items.length === 0) {
            list.innerHTML = '<div class="quot-modal-empty">No hay templates guardados todavía</div>';
            return;
        }

        list.innerHTML = items.map(tpl => {
            const dateStr = tpl.createdAt
                ? new Date(tpl.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : '—';
            return `
                <div class="template-row" data-id="${this._escapeHTML(tpl.id)}">
                    <div class="template-row-info">
                        <span class="template-row-name">${this._escapeHTML(tpl.name)}</span>
                        <span class="template-row-meta">${this._escapeHTML(this._describeSnapshot(tpl))}</span>
                        <span class="template-row-date">${dateStr}</span>
                    </div>
                    <div class="template-row-actions">
                        <button type="button" class="btn-primary btn-apply-template" data-id="${this._escapeHTML(tpl.id)}">Aplicar</button>
                        <button type="button" class="quot-btn-delete btn-delete-template" data-id="${this._escapeHTML(tpl.id)}" data-name="${this._escapeHTML(tpl.name)}" aria-label="Borrar template">✕</button>
                    </div>
                </div>
            `;
        }).join('');

        list.querySelectorAll('.btn-apply-template').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const ok = this.apply(id);
                if (ok) {
                    this.closeModal();
                    if (typeof Toast !== 'undefined') Toast.success('Template aplicado');
                } else {
                    if (typeof Toast !== 'undefined') Toast.error('No se pudo aplicar el template');
                }
            });
        });

        list.querySelectorAll('.btn-delete-template').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                const name = btn.dataset.name || 'template';
                let confirmed;
                if (typeof Confirm !== 'undefined') {
                    confirmed = await Confirm.show({
                        title: 'Borrar template',
                        message: `¿Borrar el template "${name}"? Esta acción no se puede deshacer.`,
                        confirmText: 'Sí, borrar',
                        cancelText: 'Cancelar',
                        danger: true
                    });
                } else {
                    confirmed = confirm(`¿Borrar el template "${name}"?`);
                }
                if (!confirmed) return;
                this.delete(id);
                this._renderList(overlay);
                if (typeof Toast !== 'undefined') Toast.success(`Template "${name}" borrado`);
            });
        });
    },

    closeModal() {
        const m = document.getElementById('templates-modal');
        if (m) m.remove();
    }
};

// =============================================
// COMPARE — comparador side-by-side de cotizaciones guardadas
// =============================================
// Permite elegir 2 cotizaciones guardadas y verlas lado a lado. Calcula totales
// con la lógica actual (no usa el total que quedó guardado, para que una
// actualización de precios se refleje). Resalta diferencias clave en totales.
const Compare = {

    async openModal() {
        this.closeModal();

        const overlay = document.createElement('div');
        overlay.id = 'compare-modal';
        overlay.className = 'quot-modal-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-label', 'Comparador de cotizaciones');
        overlay.innerHTML = `
            <div class="quot-modal compare-modal">
                <div class="quot-modal-header">
                    <h2>Comparador de cotizaciones</h2>
                    <button class="quot-modal-close" id="compare-modal-close" aria-label="Cerrar">&times;</button>
                </div>
                <div class="quot-modal-body">
                    <div class="compare-selectors">
                        <div class="compare-selector-group">
                            <label for="compare-select-a">Cotización A</label>
                            <select id="compare-select-a" class="input-base"><option value="">Cargando…</option></select>
                        </div>
                        <div class="compare-vs">VS</div>
                        <div class="compare-selector-group">
                            <label for="compare-select-b">Cotización B</label>
                            <select id="compare-select-b" class="input-base"><option value="">Cargando…</option></select>
                        </div>
                    </div>
                    <div class="compare-content" id="compare-content">
                        <div class="compare-empty">Elegí dos cotizaciones para compararlas</div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#compare-modal-close').addEventListener('click', () => this.closeModal());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.closeModal();
        });

        // Cargar lista de cotizaciones y poblar los selects
        let quotations = [];
        try {
            quotations = await QuotationStorage.getQuotations();
            if (!Array.isArray(quotations)) quotations = [];
            quotations.sort((a, b) => {
                const dateA = a.savedAt || a.updatedAt || a.createdAt || '';
                const dateB = b.savedAt || b.updatedAt || b.createdAt || '';
                return new Date(dateB) - new Date(dateA);
            });
        } catch (e) {
            console.error('❌ Error cargando cotizaciones para comparar:', e);
        }

        const selectA = overlay.querySelector('#compare-select-a');
        const selectB = overlay.querySelector('#compare-select-b');

        if (quotations.length === 0) {
            const empty = '<option value="">Sin cotizaciones guardadas</option>';
            selectA.innerHTML = empty;
            selectB.innerHTML = empty;
            const content = overlay.querySelector('#compare-content');
            if (content) content.innerHTML = '<div class="compare-empty">No hay cotizaciones guardadas todavía</div>';
            return;
        }

        const optionsHTML = ['<option value="">— elegir —</option>']
            .concat(quotations.map(q => {
                const label = `${q.cotNumber || q.name || q.id} — ${q.params?.client?.name || '—'}`;
                return `<option value="${this._escapeHTML(q.id)}">${this._escapeHTML(label)}</option>`;
            }))
            .join('');
        selectA.innerHTML = optionsHTML;
        selectB.innerHTML = optionsHTML;

        const onChange = async () => {
            const idA = selectA.value;
            const idB = selectB.value;
            if (!idA || !idB) {
                overlay.querySelector('#compare-content').innerHTML = '<div class="compare-empty">Elegí dos cotizaciones para compararlas</div>';
                return;
            }
            if (idA === idB) {
                overlay.querySelector('#compare-content').innerHTML = '<div class="compare-empty">Elegí dos cotizaciones distintas</div>';
                return;
            }
            await this._renderComparison(overlay, idA, idB);
        };

        selectA.addEventListener('change', onChange);
        selectB.addEventListener('change', onChange);
    },

    async _renderComparison(overlay, idA, idB) {
        const content = overlay.querySelector('#compare-content');
        if (!content) return;
        content.innerHTML = '<div class="compare-loading"><span class="mp-spinner mp-spinner-lg"></span> Cargando…</div>';

        let qA, qB;
        try {
            [qA, qB] = await Promise.all([
                QuotationStorage.getQuotationById(idA),
                QuotationStorage.getQuotationById(idB)
            ]);
        } catch (e) {
            console.error('❌ Error cargando cotizaciones para comparar:', e);
            content.innerHTML = '<div class="compare-empty">No se pudieron cargar las cotizaciones</div>';
            return;
        }

        if (!qA || !qB) {
            content.innerHTML = '<div class="compare-empty">No se pudieron cargar las cotizaciones</div>';
            return;
        }

        const summA = this._summarizeQuotation(qA);
        const summB = this._summarizeQuotation(qB);

        const fmt = (n) => `$${(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const deltaPct = (a, b) => {
            if (!a) return b ? '+∞%' : '0%';
            const d = ((b - a) / a) * 100;
            const sign = d > 0 ? '+' : '';
            return `${sign}${d.toFixed(1)}%`;
        };
        const diffClass = (a, b) => a === b ? '' : 'compare-diff';

        const col = (summ, label) => `
            <div class="compare-col">
                <div class="compare-col-header">
                    <div class="compare-col-label">${label}</div>
                    <div class="compare-col-cot">${this._escapeHTML(summ.cotNumber || '—')}</div>
                </div>
                <div class="compare-col-meta">
                    <div><strong>Cliente:</strong> ${this._escapeHTML(summ.clientName)}</div>
                    <div><strong>Proyecto:</strong> ${this._escapeHTML(summ.projectName)}</div>
                    <div><strong>Evento:</strong> ${this._escapeHTML(summ.eventName)}</div>
                    <div><strong>Tipo:</strong> ${this._escapeHTML(summ.qType.toUpperCase())}</div>
                    <div><strong>Fecha guardado:</strong> ${this._escapeHTML(summ.dateStr)}</div>
                </div>
            </div>
        `;

        const pRow = (label, a, b, formatter = fmt) => `
            <tr>
                <td class="compare-row-label">${this._escapeHTML(label)}</td>
                <td class="compare-row-val ${diffClass(a, b)}">${formatter(a)}</td>
                <td class="compare-row-val ${diffClass(a, b)}">${formatter(b)}</td>
            </tr>
        `;

        // Items diff (presencia de items por id)
        const idsA = new Set(Object.keys(summA.itemsMap));
        const idsB = new Set(Object.keys(summB.itemsMap));
        const onlyA = [...idsA].filter(x => !idsB.has(x));
        const onlyB = [...idsB].filter(x => !idsA.has(x));
        const both = [...idsA].filter(x => idsB.has(x));
        const qtyChanged = both.filter(id => summA.itemsMap[id].qty !== summB.itemsMap[id].qty);

        const renderItemList = (ids, map, cls) => {
            if (ids.length === 0) return '<div class="compare-items-empty">—</div>';
            return ids.slice(0, 30).map(id => {
                const it = map[id];
                return `<div class="compare-item ${cls}"><span class="compare-item-qty">${it.qty}x</span> <span class="compare-item-name">${this._escapeHTML(it.name)}</span></div>`;
            }).join('') + (ids.length > 30 ? `<div class="compare-items-more">+${ids.length - 30} más…</div>` : '');
        };

        content.innerHTML = `
            <div class="compare-grid">
                ${col(summA, 'A')}
                ${col(summB, 'B')}
            </div>

            <table class="compare-table">
                <thead>
                    <tr>
                        <th></th>
                        <th>A</th>
                        <th>B <span class="compare-delta">${deltaPct(summA.total, summB.total)}</span></th>
                    </tr>
                </thead>
                <tbody>
                    ${pRow('Items (cant.)', summA.itemCount, summB.itemCount, (n) => String(n || 0))}
                    ${pRow('Superficie/Espacios', summA.scaleLabel, summB.scaleLabel, (v) => this._escapeHTML(String(v || '—')))}
                    ${pRow('Altura', summA.heightLabel, summB.heightLabel, (v) => this._escapeHTML(String(v || '—')))}
                    ${pRow('Modificador', summA.modifierLabel, summB.modifierLabel, (v) => this._escapeHTML(String(v || '—')))}
                    ${pRow('Fee', summA.feeLabel, summB.feeLabel, (v) => this._escapeHTML(String(v || '—')))}
                    ${pRow('Subtotal', summA.subtotal, summB.subtotal)}
                    ${pRow('IVA (21%)', summA.tax, summB.tax)}
                    <tr class="compare-row-total">
                        <td class="compare-row-label"><strong>TOTAL</strong></td>
                        <td class="compare-row-val ${diffClass(summA.total, summB.total)}"><strong>${fmt(summA.total)}</strong></td>
                        <td class="compare-row-val ${diffClass(summA.total, summB.total)}"><strong>${fmt(summB.total)}</strong></td>
                    </tr>
                </tbody>
            </table>

            <div class="compare-items-section">
                <h3>Diferencias de items</h3>
                <div class="compare-items-grid">
                    <div class="compare-items-col">
                        <div class="compare-items-title compare-only-a">Solo en A (${onlyA.length})</div>
                        ${renderItemList(onlyA, summA.itemsMap, 'only-a')}
                    </div>
                    <div class="compare-items-col">
                        <div class="compare-items-title compare-only-b">Solo en B (${onlyB.length})</div>
                        ${renderItemList(onlyB, summB.itemsMap, 'only-b')}
                    </div>
                    <div class="compare-items-col">
                        <div class="compare-items-title compare-qty-changed">Cantidad distinta (${qtyChanged.length})</div>
                        ${qtyChanged.length === 0 ? '<div class="compare-items-empty">—</div>' :
                            qtyChanged.slice(0, 30).map(id => `
                                <div class="compare-item qty-changed">
                                    <span class="compare-item-name">${this._escapeHTML(summA.itemsMap[id].name)}</span>
                                    <span class="compare-item-qty-diff">${summA.itemsMap[id].qty} → ${summB.itemsMap[id].qty}</span>
                                </div>
                            `).join('') + (qtyChanged.length > 30 ? `<div class="compare-items-more">+${qtyChanged.length - 30} más…</div>` : '')
                        }
                    </div>
                </div>
            </div>
        `;
    },

    // Recalcula totales usando la lógica actual (precios actuales del DATABASE),
    // para que el comparador muestre totales comparables aún si los precios cambiaron.
    _summarizeQuotation(q) {
        const params = q.params || {};
        const qType = q.type || 'stand';
        const heightAffected = DATABASE.heightAffectedCategories || ['infrastructure', 'lighting'];
        const hMult = params.height?.multiplier || 1;
        const modMult = 1 + ((params.modifier?.percentage || 0) / 100);
        const feeMult = params.fee?.enabled ? (1 + (params.fee.percentage || 0) / 100) : 1;

        const itemsMap = {};
        let subtotal = 0;
        let itemCount = 0;

        const processItem = (entry) => {
            const id = entry.id;
            const qty = entry.quantity || 0;
            if (qty <= 0) return;
            const cur = DB.getItemById(id);
            const name = cur?.name || entry.name || id;
            const base = cur ? (typeof Render !== 'undefined' && Render._parsePrice ? Render._parsePrice(cur.price) : parseFloat(cur.price) || 0) : 0;
            const cat = cur?.category;
            const h = heightAffected.includes(cat) ? hMult : 1;
            const loaded = base * h * modMult * feeMult;
            const sub = loaded * qty;
            subtotal += sub;
            itemCount += 1;
            // Si el mismo id aparece en varios spaces, acumulamos cantidad
            if (itemsMap[id]) {
                itemsMap[id].qty += qty;
                itemsMap[id].subtotal += sub;
            } else {
                itemsMap[id] = { name, qty, subtotal: sub };
            }
        };

        if (qType === 'stand') {
            (q.items || []).forEach(processItem);
        } else {
            (q.spaces || []).forEach(space => {
                (space.items || []).forEach(processItem);
            });
        }

        const tax = subtotal * 0.21;
        const total = subtotal + tax;

        const heightLabel = params.height
            ? `${params.height.name || ''}${params.height.multiplier ? ` (x${params.height.multiplier})` : ''}`.trim() || '—'
            : '—';
        const modifierLabel = params.modifier && (params.modifier.percentage || 0) !== 0
            ? `${params.modifier.name || 's/n'} (${params.modifier.percentage}%)`
            : '—';
        const feeLabel = params.fee?.enabled ? `${params.fee.percentage}%` : '—';
        const scaleLabel = qType === 'stand'
            ? `${params.surface || 0}m² · ${params.standType || ''}`
            : `${(q.spaces || []).length} espacio${(q.spaces || []).length === 1 ? '' : 's'}`;

        const dateSource = q.savedAt || q.date || q.updatedAt || q.createdAt;
        const dateStr = dateSource
            ? new Date(dateSource).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '—';

        return {
            cotNumber: q.cotNumber || q.name || '—',
            clientName: params.client?.name || '—',
            projectName: params.project?.name || '—',
            eventName: params.event?.name || '—',
            qType,
            dateStr,
            itemCount,
            itemsMap,
            subtotal,
            tax,
            total,
            heightLabel,
            modifierLabel,
            feeLabel,
            scaleLabel
        };
    },

    _escapeHTML(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    },

    closeModal() {
        const m = document.getElementById('compare-modal');
        if (m) m.remove();
    }
};

// =============================================
// STATE MANAGEMENT
// =============================================
const State = {
    selectedItems: {}, // { itemId: { quantity, autoCalc } } — usado en modo Stand
    activeMultipliers: new Set(),
    adminMode: false,
    _spaceCounter: 0, // Contador interno para IDs de espacios

    // Parámetros Generales
    generalParams: {
        cliente: '',
        clienteData: null,
        proyecto: '',
        proyectoData: null,
        evento: '',
        eventoData: null,
        fecha: '',
        metraje: 25,
        frontal: null,           // Frente en metros (informativo)
        profundidad: null,       // Profundidad en metros (informativo)
        standType: 'centro',
        standSides: 1,
        heightMultiplier: 1,
        heightType: 'standard',
        modifierName: '',
        modifierPercentage: 0,
        includeFee: false,
        feePercentage: 0.10,
        quotationType: 'stand',  // 'stand' | 'expo' | 'alquiler'
        // Expo/Alquiler: modelo de espacios
        spaces: [],              // [{ id, name, surface, items: {} }]
        activeSpaceId: null
    },

    // =============================================
    // SPACES MANAGEMENT (Expo/Alquiler)
    // =============================================
    addSpace(name) {
        this._spaceCounter++;
        const space = {
            id: `space_${this._spaceCounter}`,
            name: name || `Espacio ${this._spaceCounter}`,
            surface: '',
            items: {} // { itemId: { quantity, autoCalc } }
        };
        this.generalParams.spaces.push(space);
        this.generalParams.activeSpaceId = space.id;
        Render.renderSpacesTabs();
        Render.renderItems();
        Render.updateAll();
        return space;
    },

    removeSpace(spaceId) {
        const idx = this.generalParams.spaces.findIndex(s => s.id === spaceId);
        if (idx === -1) return;
        this.generalParams.spaces.splice(idx, 1);
        // Si borramos el activo, activar el primero (o null)
        if (this.generalParams.activeSpaceId === spaceId) {
            this.generalParams.activeSpaceId = this.generalParams.spaces.length > 0
                ? this.generalParams.spaces[0].id : null;
        }
        Render.renderSpacesTabs();
        Render.renderItems();
        Render.updateAll();
    },

    setActiveSpace(spaceId) {
        const space = this.generalParams.spaces.find(s => s.id === spaceId);
        if (!space) return;
        this.generalParams.activeSpaceId = spaceId;
        Render.renderSpacesTabs();
        Render.renderItems();
        Render.updateAll();
    },

    duplicateSpace(spaceId) {
        const src = this.generalParams.spaces.find(s => s.id === spaceId);
        if (!src) return null;
        this._spaceCounter++;
        const copy = {
            id: `space_${this._spaceCounter}`,
            name: `${src.name} (copia)`,
            surface: src.surface,
            items: JSON.parse(JSON.stringify(src.items || {}))
        };
        // Insertar inmediatamente después del original
        const idx = this.generalParams.spaces.findIndex(s => s.id === spaceId);
        this.generalParams.spaces.splice(idx + 1, 0, copy);
        this.generalParams.activeSpaceId = copy.id;
        Render.renderSpacesTabs();
        Render.renderItems();
        Render.updateAll();
        return copy;
    },

    getActiveSpace() {
        return this.generalParams.spaces.find(s => s.id === this.generalParams.activeSpaceId) || null;
    },

    // Determina si estamos en modo multi-espacio
    isMultiSpaceMode() {
        const t = this.generalParams.quotationType;
        return t === 'expo' || t === 'alquiler';
    },

    // Obtiene el pool de items actual (global para Stand, del espacio activo para Expo/Alquiler)
    getCurrentItems() {
        if (this.isMultiSpaceMode()) {
            const space = this.getActiveSpace();
            return space ? space.items : {};
        }
        return this.selectedItems;
    },

    // Seleccionar/deseleccionar item
    toggleItem(itemId, quantity = null) {
        const item = DB.getItemById(itemId);
        if (!item) return;

        const items = this.getCurrentItems();

        if (quantity === null) {
            // Toggle para checkboxes
            if (items[itemId]) {
                delete items[itemId];
            } else {
                const autoQty = item.autoCalculate ?
                    DB.calculateAutoQuantity(itemId, this.generalParams.metraje,
                        this.generalParams.standType, this.generalParams.heightType) : 1;
                items[itemId] = {
                    quantity: autoQty,
                    autoCalc: item.autoCalculate
                };
            }
        } else {
            // Contador
            if (quantity <= 0) {
                delete items[itemId];
            } else {
                items[itemId] = {
                    quantity: quantity,
                    autoCalc: false
                };
            }
        }
        Render.updateAll();
    },

    // Obtener cantidad de un item (del pool actual)
    getItemQuantity(itemId) {
        const items = this.getCurrentItems();
        return items[itemId]?.quantity || 0;
    },

    // Actualizar cantidades auto-calculadas
    recalculateAutoItems() {
        // Recalcular en el pool actual
        const items = this.getCurrentItems();
        Object.keys(items).forEach(itemId => {
            const selection = items[itemId];
            if (selection.autoCalc) {
                const newQty = DB.calculateAutoQuantity(
                    itemId,
                    this.generalParams.metraje,
                    this.generalParams.standType,
                    this.generalParams.heightType
                );
                selection.quantity = newQty;
            }
        });
    },

    // Actualizar parámetros generales
    updateGeneralParam(param, value) {
        this.generalParams[param] = value;
        this.recalculateAutoItems();
        Render.updateAll();
    },

    setModifier(name, percentage) {
        this.generalParams.modifierName = name || '';
        this.generalParams.modifierPercentage = parseFloat(percentage) || 0;
        Render.updateModifierDisplay();
        Render.updateSummary();
    },

    reset() {
        // Borrar borrador al reiniciar (arrancás de cero — no queremos recovery fantasma)
        if (typeof Autosave !== 'undefined') Autosave.clear();

        this.selectedItems = {};
        this.activeMultipliers.clear();
        this._spaceCounter = 0;
        this.generalParams = {
            cliente: '',
            clienteData: null,
            proyecto: '',
            proyectoData: null,
            evento: '',
            eventoData: null,
            fecha: '',
            metraje: 25,
            frontal: null,
            profundidad: null,
            standType: 'centro',
            standSides: 1,
            heightMultiplier: 1,
            heightType: 'standard',
            modifierName: '',
            modifierPercentage: 0,
            includeFee: false,
            feePercentage: 0.10,
            quotationType: 'stand',
            spaces: [],
            activeSpaceId: null
        };
        Render.renderItems();
        Render.resetGeneralParamsUI();
        Render.updateSummary();
    },


    toggleAdminMode() {
        this.adminMode = !this.adminMode;
        Render.toggleAdminPanel();
    }
};

// =============================================
// RENDERING LOGIC
// =============================================
const Render = {
    init() {
        this.setupGeneralParams();
        this.renderNav();
        this._initItemsDelegation();
        this.renderItems();
        this.renderAdminPanel();
        this.updateSummary();
        this._initScrollSpy();

        // Bind global actions
        document.getElementById('btn-reset')?.addEventListener('click', () => this.handleReset());
        document.getElementById('btn-export')?.addEventListener('click', () => this.handleExport());
        document.getElementById('btn-preview')?.addEventListener('click', () => this.handlePreview());
        document.getElementById('btn-export-csv')?.addEventListener('click', () => this.handleExportCSV());
        document.getElementById('btn-load-quotation')?.addEventListener('click', () => {
            if (typeof QuotationUI !== 'undefined') QuotationUI.openModal();
        });
        document.getElementById('btn-templates')?.addEventListener('click', () => {
            if (typeof Templates !== 'undefined') Templates.openModal();
        });
        document.getElementById('btn-compare')?.addEventListener('click', () => {
            if (typeof Compare !== 'undefined') Compare.openModal();
        });
        // btn-admin se vincula en renderNav()

        // Quotation type selector (en params section)
        document.querySelectorAll('.quot-btn-param').forEach(btn => {
            btn.addEventListener('click', () => this.handleQuotationTypeSwitch(btn));
        });

        // Botón agregar espacio
        document.getElementById('btn-add-space')?.addEventListener('click', () => {
            State.addSpace();
        });

        // Layout inicial
        this.updateLayoutForType(State.generalParams.quotationType);

        // Limpiar estado de error al tipear/cambiar cualquier input
        document.addEventListener('input', (e) => {
            if (e.target.classList?.contains('input-error')) {
                e.target.classList.remove('input-error');
            }
        });

        // Controles responsive (drawers en <1024px)
        this._initMobileControls();
    },

    // Drawers mobile: hamburguesa (nav) + FAB (summary)
    // En desktop (≥1024px) CSS oculta los botones, así que estos listeners
    // quedan dormidos pero son idempotentes ante resize.
    _initMobileControls() {
        if (this._mobileControlsBound) return;
        this._mobileControlsBound = true;

        const container = document.querySelector('.app-container');
        const overlay = document.getElementById('mobile-overlay');
        const navBtn = document.getElementById('btn-nav-toggle');
        const sumBtn = document.getElementById('btn-summary-toggle');
        if (!container || !overlay) return;

        const closeAll = () => {
            container.classList.remove('nav-open', 'summary-open');
            overlay.classList.remove('is-visible');
            navBtn?.setAttribute('aria-expanded', 'false');
            document.body.classList.remove('drawer-locked');
        };

        const openNav = () => {
            container.classList.add('nav-open');
            container.classList.remove('summary-open');
            overlay.classList.add('is-visible');
            navBtn?.setAttribute('aria-expanded', 'true');
            document.body.classList.add('drawer-locked');
        };

        const openSummary = () => {
            container.classList.add('summary-open');
            container.classList.remove('nav-open');
            overlay.classList.add('is-visible');
            navBtn?.setAttribute('aria-expanded', 'false');
            document.body.classList.add('drawer-locked');
        };

        navBtn?.addEventListener('click', () => {
            container.classList.contains('nav-open') ? closeAll() : openNav();
        });
        sumBtn?.addEventListener('click', () => {
            container.classList.contains('summary-open') ? closeAll() : openSummary();
        });

        // Tap en overlay cierra
        overlay.addEventListener('click', closeAll);

        // Tap en un link del nav cierra el drawer (sólo si está abierto por mobile)
        document.getElementById('category-nav')?.addEventListener('click', (e) => {
            const link = e.target.closest('a, .nav-link, [data-nav-link]');
            if (link && container.classList.contains('nav-open')) closeAll();
        });

        // Esc cierra cualquier drawer
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' &&
                (container.classList.contains('nav-open') ||
                 container.classList.contains('summary-open'))) {
                closeAll();
            }
        });

        // Si la ventana crece a desktop, cerrar cualquier drawer abierto
        let lastIsMobile = window.matchMedia('(max-width: 1023px)').matches;
        window.addEventListener('resize', () => {
            const isMobile = window.matchMedia('(max-width: 1023px)').matches;
            if (lastIsMobile && !isMobile) closeAll();
            lastIsMobile = isMobile;
        });

        // Sincronizar el total del FAB con el total real en cada update
        // Hook simple: observamos el nodo #total-display via MutationObserver
        const totalEl = document.getElementById('total-display');
        const fabTotal = document.getElementById('fab-total');
        if (totalEl && fabTotal) {
            fabTotal.textContent = totalEl.textContent;
            const obs = new MutationObserver(() => {
                fabTotal.textContent = totalEl.textContent;
            });
            obs.observe(totalEl, { childList: true, characterData: true, subtree: true });
        }
    },

    // Maneja el cambio de tipo de cotización preservando items cuando sea posible
    async handleQuotationTypeSwitch(btn) {
        const newType = btn.dataset.type;
        const oldType = State.generalParams.quotationType;
        if (newType === oldType) return;

        const fromStand = oldType === 'stand';
        const toStand = newType === 'stand';
        const fromMulti = oldType === 'expo' || oldType === 'alquiler';
        const toMulti = newType === 'expo' || newType === 'alquiler';

        // Caso 1: Stand → multi-espacio
        if (fromStand && toMulti) {
            const standItemCount = Object.values(State.selectedItems).filter(d => d.quantity > 0).length;
            const existingSpaces = State.generalParams.spaces || [];
            const hasExistingSpaceItems = existingSpaces.some(s =>
                Object.values(s.items || {}).some(d => d.quantity > 0)
            );

            // Si hay items en Stand Y ya hay espacios con items → preguntar
            if (standItemCount > 0 && hasExistingSpaceItems) {
                const ok = await Confirm.show({
                    title: 'Cambiar a modo multi-espacio',
                    message: `Tenés ${standItemCount} items cargados en modo Stand. Se agregarán al primer espacio (combinándose con sus items actuales). ¿Continuar?`,
                    confirmText: 'Sí, continuar',
                    cancelText: 'Cancelar'
                });
                if (!ok) return;
            }

            // Asegurar que haya al menos un espacio
            if (existingSpaces.length === 0) {
                State.addSpace('Espacio 1');
            }

            // Volcar items del Stand al primer espacio (merging quantities)
            if (standItemCount > 0) {
                const targetSpace = State.generalParams.spaces[0];
                Object.entries(State.selectedItems).forEach(([id, data]) => {
                    if (data.quantity <= 0) return;
                    if (targetSpace.items[id]) {
                        targetSpace.items[id].quantity += data.quantity;
                    } else {
                        targetSpace.items[id] = { quantity: data.quantity, autoCalc: data.autoCalc };
                    }
                });
                State.selectedItems = {}; // limpiar stand
                State.generalParams.activeSpaceId = targetSpace.id;
            }
        }

        // Caso 2: multi-espacio → Stand
        if (fromMulti && toStand) {
            const spaces = State.generalParams.spaces || [];
            const totalSpaceItems = spaces.reduce((acc, s) =>
                acc + Object.values(s.items || {}).filter(d => d.quantity > 0).length, 0);
            const spacesWithItems = spaces.filter(s =>
                Object.values(s.items || {}).some(d => d.quantity > 0)).length;
            const standItemCount = Object.values(State.selectedItems).filter(d => d.quantity > 0).length;

            // Advertir si hay múltiples espacios con items (se unifican) o si Stand ya tenía items
            if (spacesWithItems > 1 || (totalSpaceItems > 0 && standItemCount > 0)) {
                const msg = spacesWithItems > 1
                    ? `Todos los items de los ${spacesWithItems} espacios se unificarán en una única lista Stand (sumando cantidades). ¿Continuar?`
                    : `Se combinarán los items del espacio con los que ya tenías en Stand. ¿Continuar?`;
                const ok = await Confirm.show({
                    title: 'Cambiar a modo Stand',
                    message: msg,
                    confirmText: 'Sí, unificar',
                    cancelText: 'Cancelar'
                });
                if (!ok) return;
            }

            // Merge de todos los espacios a State.selectedItems
            spaces.forEach(space => {
                Object.entries(space.items || {}).forEach(([id, data]) => {
                    if (data.quantity <= 0) return;
                    if (State.selectedItems[id]) {
                        State.selectedItems[id].quantity += data.quantity;
                    } else {
                        State.selectedItems[id] = { quantity: data.quantity, autoCalc: data.autoCalc };
                    }
                });
            });
            // Limpiar espacios
            State.generalParams.spaces = [];
            State.generalParams.activeSpaceId = null;
            State._spaceCounter = 0;
        }

        // Caso 3: expo ↔ alquiler (ambos multi-espacio) → no migra nada, solo cambia el tipo

        // Aplicar el cambio
        document.querySelectorAll('.quot-btn-param').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        State.generalParams.quotationType = newType;
        this.updateLayoutForType(newType);
        Render.renderItems();
        Render.updateAll();
    },

    // Toggle visibilidad de secciones según tipo
    updateLayoutForType(type) {
        const standBlock = document.getElementById('stand-params-block');
        const expoBlock = document.getElementById('expo-params-block');

        if (type === 'stand') {
            if (standBlock) standBlock.style.display = '';
            if (expoBlock) expoBlock.style.display = 'none';
        } else {
            if (standBlock) standBlock.style.display = 'none';
            if (expoBlock) expoBlock.style.display = '';
            // Si no hay espacios, crear el primero
            if (State.generalParams.spaces.length === 0) {
                State.addSpace('Espacio 1');
            }
        }
    },

    // Renderizar tabs de espacios
    renderSpacesTabs() {
        const tabsContainer = document.getElementById('spaces-tabs');
        const infoContainer = document.getElementById('active-space-info');
        if (!tabsContainer) return;

        const spaces = State.generalParams.spaces;
        const activeId = State.generalParams.activeSpaceId;

        // Tabs (event delegation en tabsContainer más abajo)
        let tabsHTML = '';
        spaces.forEach(space => {
            const isActive = space.id === activeId;
            const itemCount = Object.keys(space.items).length;
            tabsHTML += `
                <button class="space-tab ${isActive ? 'active' : ''}" data-space-id="${space.id}">
                    <span class="space-tab-name">${space.name}</span>
                    ${itemCount > 0 ? `<span class="space-tab-count">${itemCount}</span>` : ''}
                    ${spaces.length > 1 ? `<span class="space-tab-remove" data-remove-id="${space.id}" title="Eliminar espacio">&times;</span>` : ''}
                </button>
            `;
        });
        // Botón "+" al final para agregar espacio rápido
        tabsHTML += `<button class="space-tab-add" id="btn-space-add-inline" title="Agregar espacio">+</button>`;
        tabsContainer.innerHTML = tabsHTML;

        // Delegación: un solo listener en el contenedor
        if (!tabsContainer._delegated) {
            tabsContainer.addEventListener('click', async (e) => {
                const addBtn = e.target.closest('.space-tab-add');
                if (addBtn) {
                    State.addSpace();
                    return;
                }
                const removeBtn = e.target.closest('.space-tab-remove');
                if (removeBtn) {
                    e.stopPropagation();
                    const id = removeBtn.dataset.removeId;
                    const space = State.generalParams.spaces.find(s => s.id === id);
                    const itemCount = space ? Object.keys(space.items).length : 0;
                    const msg = itemCount > 0
                        ? `¿Eliminar "${space.name}" y sus ${itemCount} item${itemCount === 1 ? '' : 's'}? No se puede deshacer.`
                        : `¿Eliminar "${space?.name || 'este espacio'}"?`;
                    const ok = await Confirm.show({
                        title: 'Eliminar espacio',
                        message: msg,
                        confirmText: 'Eliminar',
                        cancelText: 'Cancelar',
                        danger: true
                    });
                    if (ok) State.removeSpace(id);
                    return;
                }
                const tab = e.target.closest('.space-tab');
                if (tab) {
                    State.setActiveSpace(tab.dataset.spaceId);
                }
            });
            tabsContainer._delegated = true;
        }

        // Info del espacio activo
        if (infoContainer) {
            const activeSpace = State.getActiveSpace();
            if (activeSpace) {
                const itemCount = Object.keys(activeSpace.items).length;
                infoContainer.innerHTML = `
                    <div class="active-space-controls">
                        <div class="input-group input-group-compact">
                            <label>Nombre</label>
                            <input type="text" class="text-input space-name-input" value="${activeSpace.name}" maxlength="40" placeholder="Nombre del espacio">
                        </div>
                        <div class="input-group input-group-compact">
                            <label>Superficie</label>
                            <div class="metraje-input">
                                <input type="number" class="number-input space-surface-input" value="${activeSpace.surface || ''}" min="1" max="5000" placeholder="—">
                                <span class="input-suffix">m²</span>
                            </div>
                        </div>
                        <div class="space-actions">
                            <button type="button" class="btn-space-duplicate" title="Duplicar este espacio con sus items">⧉ Duplicar</button>
                            ${itemCount > 0 ? `<span class="space-items-count">${itemCount} item${itemCount === 1 ? '' : 's'}</span>` : ''}
                        </div>
                    </div>
                `;
                // Listeners
                const nameInput = infoContainer.querySelector('.space-name-input');
                nameInput?.addEventListener('input', (e) => {
                    activeSpace.name = e.target.value;
                    const tabBtn = tabsContainer.querySelector(`.space-tab[data-space-id="${activeSpace.id}"] .space-tab-name`);
                    if (tabBtn) tabBtn.textContent = e.target.value;
                });
                const surfaceInput = infoContainer.querySelector('.space-surface-input');
                surfaceInput?.addEventListener('input', (e) => {
                    activeSpace.surface = e.target.value;
                });
                infoContainer.querySelector('.btn-space-duplicate')?.addEventListener('click', () => {
                    const copy = State.duplicateSpace(activeSpace.id);
                    if (copy && typeof Toast !== 'undefined') {
                        Toast.success(`Espacio duplicado: "${copy.name}"`);
                    }
                });
            } else {
                infoContainer.innerHTML = '<p class="empty-state">Sin espacios</p>';
            }
        }
    },


    renderNav() {
        const navContainer = document.getElementById('category-nav');
        navContainer.innerHTML = '';

        // ============================================
        // BLOQUE 1: PARÁMETROS
        // ============================================
        const paramsBlock = document.createElement('div');
        paramsBlock.className = 'nav-block nav-block-params';

        const paramsLink = document.createElement('a');
        paramsLink.className = 'nav-link active';
        paramsLink.textContent = '⚙️ Parámetros';
        paramsLink.href = '#general-params';
        paramsLink.onclick = (e) => {
            e.preventDefault();
            document.getElementById('general-params').scrollIntoView({ behavior: 'smooth' });
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            paramsLink.classList.add('active');
        };
        paramsBlock.appendChild(paramsLink);
        navContainer.appendChild(paramsBlock);

        // ============================================
        // BLOQUE 1.5: COTIZACIONES GUARDADAS
        // ============================================
        const savedBlock = document.createElement('div');
        savedBlock.className = 'nav-block nav-block-saved';

        const savedLink = document.createElement('a');
        savedLink.className = 'nav-link';
        savedLink.innerHTML = '📁 Cotizaciones';
        savedLink.href = '#';
        savedLink.onclick = (e) => {
            e.preventDefault();
            if (typeof QuotationUI !== 'undefined') {
                QuotationUI.openModal();
            }
        };
        savedBlock.appendChild(savedLink);
        navContainer.appendChild(savedBlock);

        // ============================================
        // BLOQUE 2: RUBROS (6 CATEGORÍAS)
        // ============================================
        const rubrosBlock = document.createElement('div');
        rubrosBlock.className = 'nav-block nav-block-rubros';

        // Agregar título del bloque
        const rubrosTitle = document.createElement('div');
        rubrosTitle.className = 'nav-block-title';
        rubrosTitle.textContent = 'RUBROS';
        rubrosBlock.appendChild(rubrosTitle);

        // Links a cada categoría
        DB.getCategories().forEach(cat => {
            const link = document.createElement('a');
            link.className = 'nav-link';
            link.dataset.catId = cat.id;
            link.innerHTML = `${cat.icon} ${cat.name} <span class="nav-badge" id="nav-badge-${cat.id}" style="display:none">0</span>`;
            link.href = `#cat-${cat.id}`;
            link.onclick = (e) => {
                e.preventDefault();
                document.getElementById(`cat-${cat.id}`).scrollIntoView({ behavior: 'smooth' });
                document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                link.classList.add('active');
            };
            rubrosBlock.appendChild(link);
        });
        navContainer.appendChild(rubrosBlock);

        // ============================================
        // BLOQUE 3: CONFIGURACIÓN
        // ============================================
        const configBlock = document.createElement('div');
        configBlock.className = 'nav-block nav-block-config';

        const adminLink = document.createElement('a');
        adminLink.className = 'nav-link nav-admin';
        adminLink.id = 'btn-admin';
        adminLink.innerHTML = '📚 Catálogo';
        adminLink.href = '#admin-panel';
        adminLink.onclick = (e) => {
            e.preventDefault();
            State.toggleAdminMode();
        };
        configBlock.appendChild(adminLink);
        navContainer.appendChild(configBlock);
    },

    renderItems() {
        const mainContainer = document.getElementById('items-container');
        mainContainer.innerHTML = '';

        // Verificar si hay items cargados
        const totalItems = DATABASE.items.length;

        if (totalItems === 0) {
            mainContainer.innerHTML = `
                <div class="empty-catalog-state">
                    <div class="empty-icon"><span class="mp-spinner mp-spinner-lg"></span></div>
                    <h3>Cargando catálogo...</h3>
                    <p>Conectando con la base de datos de items.</p>
                    <p class="empty-hint">Si no carga, revisá la conexión y refrescá la página. Si el problema persiste, contactá al equipo técnico.</p>
                </div>
            `;
            return;
        }

        DB.getCategories().forEach(cat => {
            const section = document.createElement('section');
            section.id = `cat-${cat.id}`;
            section.className = 'category-section';

            // Verificar si la categoría tiene items
            const catItems = DB.getItemsByCategory(cat.id);
            if (catItems.length === 0) return; // No mostrar categorías vacías

            let sectionHTML = `<h3 class="category-title">${cat.icon} ${cat.name}</h3>`;

            // Si tiene subcategorías
            if (DATABASE.categories[cat.id].subcategories) {
                const subcats = DATABASE.categories[cat.id].subcategories;
                for (const [subId, subData] of Object.entries(subcats)) {
                    const subItems = DB.getItemsBySubcategory(cat.id, subId);
                    if (subItems.length > 0) {
                        sectionHTML += `
                            <div class="subcategory-section">
                                <h4 class="subcategory-title">${subData.icon} ${subData.name}</h4>
                                <div class="category-items" id="items-${cat.id}-${subId}"></div>
                            </div>
                        `;
                    }
                }
            } else {
                sectionHTML += `<div class="category-items" id="items-${cat.id}"></div>`;
            }

            section.innerHTML = sectionHTML;
            mainContainer.appendChild(section);

            // Renderizar items con lógica de favoritos
            if (DATABASE.categories[cat.id].subcategories) {
                const subcats = DATABASE.categories[cat.id].subcategories;
                for (const [subId, subData] of Object.entries(subcats)) {
                    const container = section.querySelector(`#items-${cat.id}-${subId}`);
                    if (container) {
                        const subItems = DB.getItemsBySubcategory(cat.id, subId);
                        this._renderItemGroup(subItems, container, subData.name);
                    }
                }
            } else {
                const container = section.querySelector(`#items-${cat.id}`);
                const items = DB.getItemsByCategory(cat.id);
                this._renderItemGroup(items, container, cat.name);
            }
        });

        this.attachItemListeners();
        this.reapplySearchFilter();
        this._rescanScrollSpy();
    },

    // Renderiza un grupo de items en un contenedor con lógica de favoritos
    _renderItemGroup(items, container, displayName) {
        const favorites = items.filter(i => Favorites.isFavorite(i));
        const nonFavorites = items.filter(i => !Favorites.isFavorite(i));

        // Fallback graceful: si no hay favoritos, mostrar todos como siempre
        if (favorites.length === 0) {
            items.forEach(item => container.appendChild(this.createItemCard(item)));
            return;
        }

        // Renderizar favoritos normalmente
        favorites.forEach(item => container.appendChild(this.createItemCard(item)));

        // Si no hay no-favoritos, terminar
        if (nonFavorites.length === 0) return;

        // Renderizar no-favoritos con clase .non-favorite (ocultos por CSS)
        nonFavorites.forEach(item => {
            const card = this.createItemCard(item);
            card.classList.add('non-favorite');
            container.appendChild(card);
        });

        // Botón toggle "Ver todos / Ver menos" — click manejado por delegación en #items-container
        const btn = document.createElement('button');
        btn.className = 'toggle-all-btn';
        btn.dataset.containerId = container.id;
        btn.dataset.nonFavCount = nonFavorites.length;
        btn.dataset.catName = displayName;
        btn.textContent = `Ver todos los items de ${displayName} (+${nonFavorites.length} más)`;
        container.parentNode.insertBefore(btn, container.nextSibling);
    },

    createItemCard(item) {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.dataset.itemId = item.id;

        const catName = DATABASE.categories[item.category]?.name || '';
        const subName = DATABASE.categories[item.category]?.subcategories?.[item.subcategory]?.name || '';
        card.dataset.search = this._normalizeSearch(
            `${item.name} ${item.description || ''} ${catName} ${subName} ${item.unit || ''}`
        );

        const currentQty = State.getItemQuantity(item.id);
        const isSelected = currentQty > 0;

        let controlsHtml = '';
        let autoCalcInfo = '';

        if (item.autoCalculate && isSelected) {
            autoCalcInfo = `<span class="auto-calc-badge" title="Calculado automáticamente">AUTO</span>`;
        }

        if (item.type === 'counter') {
            controlsHtml = `
                <div class="counter-box">
                    <button class="btn-count" data-action="dec" data-id="${item.id}">−</button>
                    <input type="number" class="count-input" data-id="${item.id}" value="${currentQty}" min="0" step="1">
                    <button class="btn-count" data-action="inc" data-id="${item.id}">+</button>
                </div>
            `;
        } else {
            controlsHtml = `
                <label class="item-checkbox">
                    <input type="checkbox" data-action="check" data-id="${item.id}" ${isSelected ? 'checked' : ''}>
                    <span class="checkmark"></span>
                </label>
            `;
        }

        const isFav = Favorites.isFavorite(item);
        const favTitle = isFav ? 'Quitar de favoritos' : 'Marcar como favorito';

        card.innerHTML = `
            <button class="item-fav-btn ${isFav ? 'is-fav' : ''}" data-action="fav" data-id="${item.id}" title="${favTitle}" aria-label="${favTitle}">
                ${isFav ? '★' : '☆'}
            </button>
            <div class="item-info">
                <div class="item-header">
                    <span class="item-name">${item.name}</span>
                    ${autoCalcInfo}
                </div>
                <div class="item-description">${item.description}</div>
                <div class="item-price-row">
                    <span class="item-price">$${Math.round(item.price).toLocaleString('es-AR')}</span>
                    <span class="item-unit">/ ${item.unit}</span>
                </div>
            </div>
            <div class="item-controls">
                ${controlsHtml}
            </div>
        `;

        if (isSelected) {
            card.classList.add('selected');
        }

        return card;
    },

    // Event delegation en #items-container — bindeado UNA sola vez desde init.
    // Evita re-bindear en cada renderItems() y elimina riesgo de listeners huérfanos.
    _initItemsDelegation() {
        const container = document.getElementById('items-container');
        if (!container || container._delegated) return;
        container._delegated = true;

        // Clicks: favorito, contadores, "Ver todos"
        container.addEventListener('click', (e) => {
            // Botón favorito
            const favBtn = e.target.closest('.item-fav-btn');
            if (favBtn) {
                e.stopPropagation();
                const id = favBtn.dataset.id;
                const nowFav = Favorites.toggle(id);
                this.renderItems();
                if (typeof Toast !== 'undefined') {
                    Toast.info(nowFav ? '⭐ Agregado a favoritos' : 'Quitado de favoritos', 1500);
                }
                return;
            }

            // Botón +/- de contador
            const countBtn = e.target.closest('.btn-count');
            if (countBtn) {
                const id = countBtn.dataset.id;
                const action = countBtn.dataset.action;
                const currentQty = State.getItemQuantity(id);
                let newQty = currentQty;
                if (action === 'inc') newQty++;
                if (action === 'dec') newQty = Math.max(0, newQty - 1);
                State.toggleItem(id, newQty);
                return;
            }

            // Botón "Ver todos / Ver menos" de categoría
            const toggleBtn = e.target.closest('.toggle-all-btn');
            if (toggleBtn) {
                const catContainer = document.getElementById(toggleBtn.dataset.containerId);
                if (!catContainer) return;
                const catName = toggleBtn.dataset.catName;
                const nonFavCount = toggleBtn.dataset.nonFavCount;
                const willExpand = !catContainer.classList.contains('expanded');
                catContainer.classList.toggle('expanded', willExpand);
                toggleBtn.textContent = willExpand
                    ? 'Ver menos'
                    : `Ver todos los items de ${catName} (+${nonFavCount} más)`;
            }
        });

        // Change: checkboxes + inputs de cantidad
        container.addEventListener('change', (e) => {
            const target = e.target;
            if (target.matches('input[data-action="check"]')) {
                State.toggleItem(target.dataset.id);
                return;
            }
            if (target.matches('.count-input')) {
                const id = target.dataset.id;
                const newQty = Math.max(0, parseInt(target.value) || 0);
                target.value = newQty;
                State.toggleItem(id, newQty);
            }
        });
    },

    attachItemListeners() {
        // No-op: los listeners están delegados en _initItemsDelegation().
        // Mantengo el método por compatibilidad con llamadas existentes en renderItems().
    },

    // Scrollspy: auto-highlight del nav-link según qué sección está en viewport.
    // Se llama UNA sola vez desde init(), observa #general-params y toda sección
    // .category-section que aparece después del render inicial.
    _initScrollSpy() {
        if (this._scrollSpyInit) return;
        this._scrollSpyInit = true;

        // Mapa sectionId → nav-link correspondiente
        const linkFor = (sectionId) => {
            if (sectionId === 'general-params') {
                return document.querySelector('.nav-block-params .nav-link');
            }
            if (sectionId.startsWith('cat-')) {
                const catId = sectionId.replace(/^cat-/, '');
                return document.querySelector(`.nav-link[data-cat-id="${catId}"]`);
            }
            return null;
        };

        const setActive = (link) => {
            if (!link) return;
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        };

        // Observer con rootMargin: dispara cuando la sección entra al tercio superior
        const observer = new IntersectionObserver((entries) => {
            // Toma la entrada con mayor intersectionRatio de las que están intersectando
            const visible = entries
                .filter(e => e.isIntersecting)
                .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
            if (visible.length === 0) return;
            const link = linkFor(visible[0].target.id);
            if (link) setActive(link);
        }, {
            // Activa la sección cuando su top cruza ~25% del viewport desde arriba
            rootMargin: '-20% 0px -60% 0px',
            threshold: [0, 0.25, 0.5, 0.75, 1]
        });

        // Observar sections existentes. Como renderItems puede recrear
        // .category-section, expongo el observer para que renderItems lo llame
        // (opcional) — por ahora observamos una vez acá, y como las sections se
        // recrean por innerHTML, observamos de nuevo cada vez que termina renderItems.
        this._scrollSpyObserver = observer;
        this._rescanScrollSpy();
    },

    // Re-observar tras cualquier re-render que recree .category-section
    _rescanScrollSpy() {
        if (!this._scrollSpyObserver) return;
        this._scrollSpyObserver.disconnect();
        const paramsEl = document.getElementById('general-params');
        if (paramsEl) this._scrollSpyObserver.observe(paramsEl);
        document.querySelectorAll('.category-section').forEach(s => {
            this._scrollSpyObserver.observe(s);
        });
    },

    updateAll() {
        // Update counter inputs
        document.querySelectorAll('.count-input').forEach(el => {
            const id = el.dataset.id;
            const qty = State.getItemQuantity(id);
            el.value = qty;
        });

        // Update checkboxes
        document.querySelectorAll('input[data-action="check"]').forEach(el => {
            const id = el.dataset.id;
            el.checked = State.getItemQuantity(id) > 0;
        });

        // Update card selection state
        document.querySelectorAll('.item-card').forEach(card => {
            const id = card.dataset.itemId;
            const isSelected = State.getItemQuantity(id) > 0;
            card.classList.toggle('selected', isSelected);

            // Update auto-calc badge
            const item = DB.getItemById(id);
            const badge = card.querySelector('.auto-calc-badge');
            if (item?.autoCalculate && isSelected && !badge) {
                const header = card.querySelector('.item-header');
                const newBadge = document.createElement('span');
                newBadge.className = 'auto-calc-badge';
                newBadge.title = 'Calculado automáticamente';
                newBadge.textContent = 'AUTO';
                header.appendChild(newBadge);
            } else if (badge && !isSelected) {
                badge.remove();
            }
        });

        // Mantener visibles items no-favoritos seleccionados aunque el grupo esté colapsado
        document.querySelectorAll('.item-card.non-favorite').forEach(card => {
            const id = card.dataset.itemId;
            const isSelected = State.getItemQuantity(id) > 0;
            card.classList.toggle('force-visible', isSelected);
        });

        this.updateNavBadges();
        this.updateSummary();

        // Autosave con debounce — toda mutation de State termina acá
        if (typeof Autosave !== 'undefined') Autosave.schedule();
    },

    // Actualiza los badges de contador en el nav por categoría
    updateNavBadges() {
        const items = State.getCurrentItems();
        const counts = {};
        Object.keys(items).forEach(itemId => {
            const item = DB.getItemById(itemId);
            if (item) counts[item.category] = (counts[item.category] || 0) + 1;
        });
        DB.getCategories().forEach(cat => {
            const badge = document.getElementById(`nav-badge-${cat.id}`);
            if (!badge) return;
            const count = counts[cat.id] || 0;
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline-block' : 'none';
        });
    },

    // Muestra la info del evento seleccionado en el bloque de params-header
    updateEventInfo(eventoData) {
        const display = document.getElementById('event-info-display');
        if (!display) return;

        if (!eventoData || (!eventoData.eventStartDate && !eventoData.venue && !eventoData.name)) {
            display.style.display = 'none';
            return;
        }

        const nameVenueEl = display.querySelector('.event-info-name-venue');
        const datesEl = display.querySelector('.event-info-dates');

        // Línea 1: "Nombre del evento — La Rural"
        let nameVenue = eventoData.name || '';
        if (eventoData.venue) nameVenue += ` — ${eventoData.venue}`;
        nameVenueEl.textContent = nameVenue;

        // Línea 2: "14 - 16 de Marzo 2026"
        datesEl.textContent = formatEventDateRange(eventoData.eventStartDate, eventoData.eventEndDate);

        display.style.display = 'flex';
    },

    // Inicializa el buscador de items (llamar una sola vez en DOMContentLoaded)
    initSearchFilter() {
        const input = document.getElementById('items-search');
        const clearBtn = document.getElementById('items-search-clear');
        if (!input) return;

        input.addEventListener('input', () => {
            const query = input.value.trim();
            if (clearBtn) clearBtn.style.display = query ? 'flex' : 'none';
            this.applySearchFilter(query);
        });

        // Esc dentro del input: limpia búsqueda y quita focus
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (input.value) {
                    input.value = '';
                    if (clearBtn) clearBtn.style.display = 'none';
                    this.applySearchFilter('');
                }
                input.blur();
            }
        });

        this._initGlobalShortcuts(input);

        // Botón de ayuda de atajos (?)
        document.getElementById('btn-shortcuts-help')?.addEventListener('click', () => {
            this._toggleShortcutsCheatsheet();
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                input.value = '';
                clearBtn.style.display = 'none';
                this.applySearchFilter('');
                input.focus();
            });
        }
    },

    // Atajos de teclado globales
    // Navegación:  Ctrl/Cmd+K y "/" → focus search · Esc → close/blur
    // Acciones:    Ctrl+S → guardar borrador · Ctrl+P → exportar PDF
    //              Ctrl+N → reiniciar · ? → cheatsheet de atajos
    _initGlobalShortcuts(searchInput) {
        if (this._shortcutsBound) return;
        this._shortcutsBound = true;

        const isTypingTarget = (el) => {
            if (!el) return false;
            const tag = el.tagName;
            return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
        };

        const focusSearch = () => {
            searchInput.focus();
            searchInput.select();
            searchInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
        };

        document.addEventListener('keydown', (e) => {
            const ctrl = e.ctrlKey || e.metaKey;
            const key = e.key.toLowerCase();

            // Ctrl/Cmd+K: focus al search
            if (ctrl && key === 'k') {
                e.preventDefault();
                focusSearch();
                return;
            }

            // Ctrl/Cmd+S: forzar guardado del borrador
            if (ctrl && key === 's') {
                e.preventDefault();
                if (typeof Autosave !== 'undefined') {
                    Autosave.flush();
                    if (typeof Toast !== 'undefined') Toast.success('Borrador guardado', 1400);
                }
                return;
            }

            // Ctrl/Cmd+P: exportar PDF
            if (ctrl && key === 'p') {
                e.preventDefault();
                const btn = document.getElementById('btn-export');
                if (btn && !btn.disabled) btn.click();
                return;
            }

            // Ctrl/Cmd+N: reiniciar cotización (nueva)
            if (ctrl && key === 'n') {
                e.preventDefault();
                const btn = document.getElementById('btn-reset');
                if (btn) btn.click();
                return;
            }

            // "/" solo dispara si no estamos ya tipeando en otro campo
            if (e.key === '/' && !isTypingTarget(e.target)) {
                e.preventDefault();
                focusSearch();
                return;
            }

            // "?" (Shift+/): cheatsheet de atajos — solo fuera de inputs
            if (e.key === '?' && !isTypingTarget(e.target)) {
                e.preventDefault();
                this._toggleShortcutsCheatsheet();
                return;
            }

            // Esc global: modales primero, después blur
            if (e.key === 'Escape') {
                // Cheatsheet tiene prioridad
                const cheat = document.querySelector('.shortcuts-cheatsheet-overlay');
                if (cheat) {
                    this._closeShortcutsCheatsheet();
                    return;
                }
                const confirmOverlay = document.querySelector('.confirm-overlay');
                if (confirmOverlay) return; // Confirm maneja su propio Esc
                const quotModal = document.getElementById('quotation-modal');
                if (quotModal && typeof QuotationUI !== 'undefined') {
                    QuotationUI.closeModal();
                    return;
                }
                if (isTypingTarget(document.activeElement) && document.activeElement !== searchInput) {
                    document.activeElement.blur();
                }
            }
        });
    },

    // Modal con tabla de atajos (?)
    _toggleShortcutsCheatsheet() {
        if (document.querySelector('.shortcuts-cheatsheet-overlay')) {
            this._closeShortcutsCheatsheet();
            return;
        }

        const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || '');
        const mod = isMac ? '⌘' : 'Ctrl';

        const overlay = document.createElement('div');
        overlay.className = 'shortcuts-cheatsheet-overlay';
        overlay.innerHTML = `
            <div class="shortcuts-cheatsheet" role="dialog" aria-label="Atajos de teclado">
                <div class="shortcuts-cheatsheet-header">
                    <h3>Atajos de teclado</h3>
                    <button type="button" class="shortcuts-cheatsheet-close" aria-label="Cerrar">✕</button>
                </div>
                <div class="shortcuts-cheatsheet-body">
                    <div class="shortcuts-section">
                        <h4>Navegación</h4>
                        <dl class="shortcuts-list">
                            <dt><kbd>${mod}</kbd> + <kbd>K</kbd></dt><dd>Buscar items</dd>
                            <dt><kbd>/</kbd></dt><dd>Buscar items (alternativa)</dd>
                            <dt><kbd>Esc</kbd></dt><dd>Cerrar modal / limpiar búsqueda</dd>
                        </dl>
                    </div>
                    <div class="shortcuts-section">
                        <h4>Acciones</h4>
                        <dl class="shortcuts-list">
                            <dt><kbd>${mod}</kbd> + <kbd>S</kbd></dt><dd>Guardar borrador</dd>
                            <dt><kbd>${mod}</kbd> + <kbd>P</kbd></dt><dd>Exportar PDF</dd>
                            <dt><kbd>${mod}</kbd> + <kbd>N</kbd></dt><dd>Nueva cotización (reiniciar)</dd>
                            <dt><kbd>?</kbd></dt><dd>Mostrar / ocultar esta ayuda</dd>
                        </dl>
                    </div>
                </div>
                <div class="shortcuts-cheatsheet-footer">
                    <small>Los atajos con <kbd>${mod}</kbd> funcionan desde cualquier lado de la app.</small>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this._closeShortcutsCheatsheet();
        });
        overlay.querySelector('.shortcuts-cheatsheet-close')
            .addEventListener('click', () => this._closeShortcutsCheatsheet());
    },

    _closeShortcutsCheatsheet() {
        const overlay = document.querySelector('.shortcuts-cheatsheet-overlay');
        if (overlay) overlay.remove();
    },

    // Normaliza un texto para búsqueda: lowercase + sin acentos + sin espacios extra
    _normalizeSearch(text) {
        return (text || '')
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    },

    // Aplica el filtro de búsqueda visualmente (no modifica State)
    // Matchea en nombre + descripción + categoría + subcategoría + unidad.
    // Múltiples tokens (separados por espacios) se combinan con AND.
    applySearchFilter(query) {
        const container = document.getElementById('items-container');
        if (!container) return;

        const normalized = this._normalizeSearch(query);

        if (!normalized) {
            container.classList.remove('searching');
            document.querySelectorAll('.item-card').forEach(c => c.classList.remove('item-search-hidden'));
            document.querySelectorAll('.category-section').forEach(s => s.style.display = '');
            return;
        }

        container.classList.add('searching');
        const tokens = normalized.split(' ').filter(Boolean);

        document.querySelectorAll('.item-card').forEach(card => {
            const haystack = card.dataset.search || '';
            const matches = tokens.every(t => haystack.includes(t));
            card.classList.toggle('item-search-hidden', !matches);
        });

        // Mostrar/ocultar secciones según si tienen items visibles
        document.querySelectorAll('.category-section').forEach(section => {
            const hasVisible = section.querySelectorAll('.item-card:not(.item-search-hidden)').length > 0;
            section.style.display = hasVisible ? '' : 'none';
        });

    },

    // Re-aplica el filtro activo después de un re-render de items
    reapplySearchFilter() {
        const input = document.getElementById('items-search');
        if (input?.value.trim()) this.applySearchFilter(input.value.trim());
    },

    // Helper: parse un precio numérico de forma consistente
    _parsePrice(price) {
        return typeof price === 'string'
            ? parseFloat(price.toString().replace(/[^\d.,-]/g, '').replace(',', '.')) || 0
            : (parseFloat(price) || 0);
    },

    // Helper: formato de moneda en ARS
    _fmt(n) {
        const sign = n < 0 ? '-' : '';
        return `${sign}$${Math.round(Math.abs(n)).toLocaleString('es-AR')}`;
    },

    updateSummary() {
        const summaryList = document.getElementById('summary-list');
        const subtotalEl = document.getElementById('subtotal-display');
        const taxEl = document.getElementById('tax-display');
        const totalEl = document.getElementById('total-display');

        const params = State.generalParams;
        const qType = params.quotationType || 'stand';
        const isMultiSpace = State.isMultiSpaceMode();

        const heightAffectedCategories = DATABASE.heightAffectedCategories || ['infrastructure', 'lighting'];
        const currentHeight = DATABASE.heightMultipliers.find(h => h.id === params.heightType);
        const heightLabel = currentHeight ? `${currentHeight.name} (${currentHeight.height})` : 'Estándar';
        const modifierMultiplier = 1 + (params.modifierPercentage / 100);

        // ──────────────────────────────
        // Calcular subtotales paralelos para desglose visual
        //   base     : precio × cantidad (sin ningún ajuste)
        //   conAlt   : base + aporte altura en categorías afectadas
        //   conMod   : conAlt × modifierMultiplier
        //   conFee   : conMod × (1 + feePercentage) si fee activo
        // ──────────────────────────────
        const getAllItemsFlat = () => {
            const flat = [];
            if (isMultiSpace) {
                (params.spaces || []).forEach(space => {
                    Object.entries(space.items || {}).forEach(([id, data]) => {
                        if (data.quantity <= 0) return;
                        const item = DB.getItemById(id);
                        if (item) flat.push({ item, quantity: data.quantity });
                    });
                });
            } else {
                Object.entries(State.selectedItems).forEach(([id, data]) => {
                    if (data.quantity <= 0) return;
                    const item = DB.getItemById(id);
                    if (item) flat.push({ item, quantity: data.quantity });
                });
            }
            return flat;
        };

        let subBase = 0;
        let subConAltura = 0;
        // Desglose por categoría: { [catId]: { conAltura, final } }
        const byCategory = {};
        getAllItemsFlat().forEach(({ item, quantity }) => {
            const price = this._parsePrice(item.price);
            const lineBase = price * quantity;
            subBase += lineBase;
            const heightMult = heightAffectedCategories.includes(item.category)
                ? params.heightMultiplier : 1;
            const lineConAltura = lineBase * heightMult;
            subConAltura += lineConAltura;

            if (!byCategory[item.category]) {
                byCategory[item.category] = { conAltura: 0, final: 0 };
            }
            byCategory[item.category].conAltura += lineConAltura;
        });
        const subConModifier = subConAltura * modifierMultiplier;
        const subConFee = params.includeFee
            ? subConModifier * (1 + params.feePercentage)
            : subConModifier;

        // Propagar modifier + fee a cada categoría para calcular el "final"
        const catMultiplier = modifierMultiplier * (params.includeFee ? (1 + params.feePercentage) : 1);
        Object.keys(byCategory).forEach(catId => {
            byCategory[catId].final = byCategory[catId].conAltura * catMultiplier;
        });

        const aporteAltura = subConAltura - subBase;
        const aporteModifier = subConModifier - subConAltura;
        const aporteFee = subConFee - subConModifier;

        // ──────────────────────────────
        // Sección de parámetros con montos
        // ──────────────────────────────
        let summaryHTML = '';

        if (qType === 'stand') {
            summaryHTML += `
                <div class="summary-params">
                    <div class="summary-param-row">
                        <span class="param-name">📐 Superficie:</span>
                        <span class="param-value">${params.metraje}m²</span>
                    </div>
                    <div class="summary-param-row">
                        <span class="param-name">🏗️ Tipo:</span>
                        <span class="param-value">${params.standType.charAt(0).toUpperCase() + params.standType.slice(1)}</span>
                    </div>
                    <div class="summary-param-row">
                        <span class="param-name">📏 Altura:</span>
                        <span class="param-value">${heightLabel}${params.heightMultiplier > 1 ? ` [×${params.heightMultiplier}]` : ''}</span>
                    </div>
                    ${params.heightMultiplier > 1 && aporteAltura > 0 ? `
                    <div class="summary-param-row height-aporte">
                        <span class="param-name">&nbsp;&nbsp;↳ Aporte altura:</span>
                        <span class="param-value">+${this._fmt(aporteAltura)}</span>
                    </div>
                    ` : ''}
                    ${params.modifierPercentage !== 0 ? `
                    <div class="summary-param-row ${params.modifierPercentage > 0 ? 'modifier-positive' : 'modifier-negative'}">
                        <span class="param-name">🔧 ${params.modifierName || 'Modificador'} (${params.modifierPercentage > 0 ? '+' : ''}${params.modifierPercentage}%):</span>
                        <span class="param-value">${params.modifierPercentage > 0 ? '+' : ''}${this._fmt(aporteModifier)}</span>
                    </div>
                    ` : ''}
                    ${params.includeFee ? `
                    <div class="summary-param-row fee-active">
                        <span class="param-name">💼 Fee Agencia (+${(params.feePercentage * 100).toFixed(0)}%):</span>
                        <span class="param-value">+${this._fmt(aporteFee)}</span>
                    </div>
                    ` : ''}
                </div>
                <div class="summary-divider"></div>
            `;
        } else {
            const typeLabel = qType === 'expo' ? '🎪 Expo' : '📦 Alquiler';
            summaryHTML += `
                <div class="summary-params">
                    <div class="summary-param-row">
                        <span class="param-name">Tipo:</span>
                        <span class="param-value">${typeLabel}</span>
                    </div>
                    <div class="summary-param-row">
                        <span class="param-name">Espacios:</span>
                        <span class="param-value">${params.spaces.length}</span>
                    </div>
                    ${params.heightMultiplier > 1 && aporteAltura > 0 ? `
                    <div class="summary-param-row height-aporte">
                        <span class="param-name">↳ Aporte altura:</span>
                        <span class="param-value">+${this._fmt(aporteAltura)}</span>
                    </div>
                    ` : ''}
                    ${params.modifierPercentage !== 0 ? `
                    <div class="summary-param-row ${params.modifierPercentage > 0 ? 'modifier-positive' : 'modifier-negative'}">
                        <span class="param-name">🔧 ${params.modifierName || 'Modificador'} (${params.modifierPercentage > 0 ? '+' : ''}${params.modifierPercentage}%):</span>
                        <span class="param-value">${params.modifierPercentage > 0 ? '+' : ''}${this._fmt(aporteModifier)}</span>
                    </div>
                    ` : ''}
                    ${params.includeFee ? `
                    <div class="summary-param-row fee-active">
                        <span class="param-name">💼 Fee Agencia (+${(params.feePercentage * 100).toFixed(0)}%):</span>
                        <span class="param-value">+${this._fmt(aporteFee)}</span>
                    </div>
                    ` : ''}
                </div>
                <div class="summary-divider"></div>
            `;
        }

        // ──────────────────────────────
        // STAND MODE: una sola lista global
        // ──────────────────────────────
        if (!isMultiSpace) {
            const groupedItems = {};
            Object.entries(State.selectedItems).forEach(([id, data]) => {
                if (data.quantity <= 0) return;
                const item = DB.getItemById(id);
                if (item) {
                    const price = this._parsePrice(item.price);
                    const catId = item.category;
                    if (!groupedItems[catId]) groupedItems[catId] = [];
                    groupedItems[catId].push({ ...item, price, quantity: data.quantity });
                }
            });

            DB.getCategories().forEach(cat => {
                if (groupedItems[cat.id] && groupedItems[cat.id].length > 0) {
                    const isHeightAffected = heightAffectedCategories.includes(cat.id);
                    const isInfrastructure = cat.id === 'infrastructure';

                    summaryHTML += `<div class="summary-category${isHeightAffected && params.heightMultiplier > 1 ? ' cat-height-affected' : ''}">
                        <div class="summary-category-title">${cat.icon} ${cat.name}${isHeightAffected && params.heightMultiplier > 1 ? ' <small class="cat-altura-hint">×Altura</small>' : ''}</div>`;

                    if (isInfrastructure) {
                        summaryHTML += `
                            <div class="summary-item">
                                <span class="summary-item-name">Superficie: ${params.metraje}m² — Altura: ${heightLabel}</span>
                            </div>`;
                    }

                    groupedItems[cat.id].forEach(item => {
                        if (isInfrastructure) return;
                        summaryHTML += `
                            <div class="summary-item">
                                <span class="summary-item-name">${item.quantity > 1 ? item.quantity + 'x ' : ''}${item.name}</span>
                            </div>`;
                    });

                    summaryHTML += `</div>`;
                }
            });

            if (Object.keys(groupedItems).length === 0) {
                summaryHTML += '<div class="empty-state">No hay items seleccionados</div>';
            }

        // ──────────────────────────────
        // EXPO / ALQUILER MODE: desglose por espacio
        // ──────────────────────────────
        } else {
            params.spaces.forEach(space => {
                const itemCount = Object.keys(space.items).length;
                let spaceBase = 0;
                let spaceConAltura = 0;

                summaryHTML += `
                    <div class="summary-space-block ${space.id === params.activeSpaceId ? 'active-space' : ''}">
                        <div class="summary-space-header">
                            <span class="space-title">${space.name}</span>
                            ${space.surface ? `<span class="space-surface">${space.surface}m²</span>` : ''}
                        </div>`;

                if (itemCount === 0) {
                    summaryHTML += '<div class="summary-item empty-state">Sin items</div>';
                } else {
                    Object.entries(space.items).forEach(([id, data]) => {
                        if (data.quantity <= 0) return;
                        const item = DB.getItemById(id);
                        if (!item) return;
                        const price = this._parsePrice(item.price);
                        const lineBase = price * data.quantity;
                        const heightMult = heightAffectedCategories.includes(item.category)
                            ? params.heightMultiplier : 1;
                        spaceBase += lineBase;
                        spaceConAltura += lineBase * heightMult;

                        // Monto mostrado: incluye altura + modifier + fee (consistente con PDF)
                        let shownTotal = lineBase * heightMult * modifierMultiplier;
                        if (params.includeFee) shownTotal *= (1 + params.feePercentage);

                        summaryHTML += `
                            <div class="summary-item">
                                <span class="summary-item-name">${data.quantity > 1 ? data.quantity + 'x ' : ''}${item.name}</span>
                                <span class="summary-item-total">${this._fmt(shownTotal)}</span>
                            </div>`;
                    });
                }

                // Subtotal del espacio con todos los ajustes aplicados
                let spaceSubtotal = spaceConAltura * modifierMultiplier;
                if (params.includeFee) spaceSubtotal *= (1 + params.feePercentage);

                summaryHTML += `
                        <div class="summary-space-subtotal">
                            <span>Subtotal</span>
                            <span>${this._fmt(spaceSubtotal)}</span>
                        </div>
                    </div>`;
            });

            if (params.spaces.length === 0) {
                summaryHTML += '<div class="empty-state">No hay espacios creados</div>';
            }
        }

        // Nota: los ajustes no salen en el PDF
        if (params.modifierPercentage !== 0 || params.includeFee || params.heightMultiplier > 1) {
            summaryHTML += `
                <div class="summary-note">
                    <small>ℹ Los ajustes (altura, modificador, fee) están incluidos en los precios. No se detallan en el PDF.</small>
                </div>`;
        }

        // ──────────────────────────────
        // Desglose por rubro (expandible)
        // Solo mostramos si hay al menos 1 item cargado
        // ──────────────────────────────
        const catEntries = Object.entries(byCategory)
            .filter(([_, v]) => v.final > 0)
            .sort((a, b) => b[1].final - a[1].final);

        if (catEntries.length > 0 && subConFee > 0) {
            // Preservar estado abierto/cerrado entre renders del resumen
            const breakdownOpen = localStorage.getItem('mepex_breakdown_open') === '1';
            summaryHTML += `
                <details class="summary-breakdown" ${breakdownOpen ? 'open' : ''}>
                    <summary class="summary-breakdown-toggle">
                        <span class="breakdown-label">Desglose por rubro</span>
                        <span class="breakdown-chevron" aria-hidden="true">▾</span>
                    </summary>
                    <div class="summary-breakdown-body">
            `;

            catEntries.forEach(([catId, data]) => {
                const cat = DB.getCategories().find(c => c.id === catId);
                if (!cat) return;
                const pct = subConFee > 0 ? (data.final / subConFee) * 100 : 0;
                const isHeightAffected = heightAffectedCategories.includes(catId);
                summaryHTML += `
                    <div class="breakdown-row${isHeightAffected && params.heightMultiplier > 1 ? ' breakdown-row-altura' : ''}">
                        <div class="breakdown-row-head">
                            <span class="breakdown-cat-name">${cat.icon} ${cat.name}</span>
                            <span class="breakdown-amount">${this._fmt(data.final)}</span>
                        </div>
                        <div class="breakdown-row-bar">
                            <div class="breakdown-bar-fill" style="width: ${pct.toFixed(1)}%"></div>
                            <span class="breakdown-pct">${pct.toFixed(1)}%</span>
                        </div>
                    </div>
                `;
            });

            summaryHTML += `
                    </div>
                </details>
            `;
        }

        summaryList.innerHTML = summaryHTML;

        // Persistir estado del desglose al toggle
        const breakdownEl = summaryList.querySelector('.summary-breakdown');
        if (breakdownEl) {
            breakdownEl.addEventListener('toggle', () => {
                try { localStorage.setItem('mepex_breakdown_open', breakdownEl.open ? '1' : '0'); }
                catch { /* silent */ }
            });
        }

        const subtotalFinal = subConFee;
        const tax = subtotalFinal * 0.21;
        const total = subtotalFinal + tax;

        subtotalEl.textContent = `$${Math.round(subtotalFinal).toLocaleString('es-AR')}`;
        taxEl.textContent = `$${Math.round(tax).toLocaleString('es-AR')}`;
        totalEl.textContent = `$${Math.round(total).toLocaleString('es-AR')}`;
    },

    // =============================================
    // ADMIN PANEL
    // =============================================
    renderAdminPanel() {
        const adminPanel = document.getElementById('admin-panel');
        if (!adminPanel) return;

        let html = `
            <div class="admin-header">
                <div class="admin-header-top">
                    <button id="btn-admin-back" class="btn-admin-back">
                        ← Volver al Cotizador
                    </button>
                </div>
                <h2>🔧 Catálogo de Items</h2>
                <p>Visualiza los items sincronizados desde la base de datos</p>
            </div>
            <div class="admin-content">
        `;

        // Tabs de categorías
        html += `<div class="admin-tabs">`;
        DB.getCategories().forEach((cat, index) => {
            html += `<button class="admin-tab ${index === 0 ? 'active' : ''}" data-category="${cat.id}">
                ${cat.icon} ${cat.name}
            </button>`;
        });
        html += `</div>`;

        // Contenido por categoría
        html += `<div class="admin-items-container">`;
        DB.getCategories().forEach((cat, index) => {
            const items = DB.getItemsByCategory(cat.id);
            html += `<div class="admin-category-panel ${index === 0 ? 'active' : ''}" data-category="${cat.id}">`;

            if (items.length === 0) {
                html += `<div class="admin-empty-state">
                    <p>📭 No hay items en esta categoría</p>
                    <small>Los items se cargan automáticamente desde la base de datos</small>
                </div>`;
            } else {
                html += `<table class="admin-table">
                    <thead>
                        <tr>
                            <th>CATEGORÍA</th>
                            <th>Código</th>
                            <th>ÍTEM</th>
                            <th>DESCRIPCIÓN</th>
                            <th>IMPORTE</th>
                            <th>UNIDAD</th>
                        </tr>
                    </thead>
                    <tbody>`;

                items.forEach(item => {
                    // Usar originalCategory para mostrar etiquetas originales de la DB
                    const categoria = item.originalCategory || item.category || '-';
                    const codigo = item.code || '-';
                    const descripcion = item.description || '-';

                    html += `
                        <tr data-item-id="${item.id}">
                            <td><span class="categoria-badge">${categoria}</span></td>
                            <td><code>${codigo}</code></td>
                            <td class="item-name-cell">${item.name}</td>
                            <td class="item-desc-cell">${descripcion}</td>
                            <td class="price-cell">$${Math.round(item.price).toLocaleString('es-AR')}</td>
                            <td class="unit-cell">${item.unit}</td>
                        </tr>
                    `;
                });

                html += `</tbody></table>`;
            }

            html += `</div>`;
        });
        html += `</div></div>`;

        adminPanel.innerHTML = html;
        this.attachAdminListeners();
    },

    attachAdminListeners() {
        // Botón volver
        document.getElementById('btn-admin-back')?.addEventListener('click', () => {
            State.toggleAdminMode();
        });

        // Tabs de categorías
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.admin-category-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                document.querySelector(`.admin-category-panel[data-category="${tab.dataset.category}"]`).classList.add('active');
            });
        });
    },

    toggleAdminPanel() {
        const adminPanel = document.getElementById('admin-panel');
        const mainContent = document.querySelector('.col-main');

        if (State.adminMode) {
            adminPanel.classList.add('visible');
            mainContent.classList.add('hidden');
            document.getElementById('btn-admin').classList.add('active');
        } else {
            adminPanel.classList.remove('visible');
            mainContent.classList.remove('hidden');
            document.getElementById('btn-admin').classList.remove('active');
        }
    },

    // =============================================
    // GENERAL PARAMS SETUP
    // =============================================
    setupGeneralParams() {
        // Input numérico de metraje
        // Mínimo 1m² — el cotizador acepta cualquier stand chico.
        // `validateForExport` ya valida `metraje >= 1` así que el input coincide.
        const metrajeInput = document.getElementById('input-metraje');
        if (metrajeInput) {
            metrajeInput.addEventListener('input', (e) => {
                let value = parseInt(e.target.value) || 1;
                value = Math.max(1, Math.min(500, value));
                State.updateGeneralParam('metraje', value);
            });
            metrajeInput.addEventListener('blur', (e) => {
                let value = parseInt(e.target.value) || 1;
                value = Math.max(1, Math.min(500, value));
                e.target.value = value;
            });
        }

        // Frente (informativo)
        const frontalInput = document.getElementById('input-frontal');
        if (frontalInput) {
            frontalInput.addEventListener('input', (e) => {
                State.updateGeneralParam('frontal', parseFloat(e.target.value) || null);
            });
        }

        // Profundidad (informativo)
        const profundidadInput = document.getElementById('input-profundidad');
        if (profundidadInput) {
            profundidadInput.addEventListener('input', (e) => {
                State.updateGeneralParam('profundidad', parseFloat(e.target.value) || null);
            });
        }

        // Tipo de stand (botones compactos)
        document.querySelectorAll('.stand-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.stand-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                State.updateGeneralParam('standType', btn.dataset.type);
                State.updateGeneralParam('standSides', parseInt(btn.dataset.sides));
            });
        });

        // Altura del stand (chips)
        document.querySelectorAll('.height-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.height-chip').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                State.updateGeneralParam('heightType', btn.dataset.height);
                State.updateGeneralParam('heightMultiplier', parseFloat(btn.dataset.multiplier));
            });
        });

        // Modificador personalizado (nombre + porcentaje)
        const modifierNameInput = document.getElementById('modifier-name');
        const modifierPercentageInput = document.getElementById('modifier-percentage');
        const modifierWrap = document.querySelector('.modifier-percentage-wrap');

        if (modifierNameInput) {
            modifierNameInput.addEventListener('input', (e) => {
                State.updateGeneralParam('modifierName', e.target.value);
            });
        }

        if (modifierPercentageInput) {
            modifierPercentageInput.addEventListener('input', (e) => {
                let value = parseFloat(e.target.value) || 0;
                value = Math.max(-50, Math.min(100, value));
                State.updateGeneralParam('modifierPercentage', value);

                // Actualizar estado visual del input
                if (modifierWrap) {
                    modifierWrap.classList.toggle('active', value > 0);
                    modifierWrap.classList.toggle('negative', value < 0);
                }
            });

            modifierPercentageInput.addEventListener('blur', (e) => {
                let value = parseFloat(e.target.value) || 0;
                value = Math.max(-50, Math.min(100, value));
                e.target.value = value;
            });
        }

        // Fee del proyecto con porcentaje editable
        const feeCheckbox = document.getElementById('fee-checkbox');
        const feeInput = document.getElementById('fee-percentage-input');

        if (feeCheckbox) {
            feeCheckbox.addEventListener('change', (e) => {
                State.updateGeneralParam('includeFee', e.target.checked);
            });
        }

        if (feeInput) {
            feeInput.addEventListener('input', (e) => {
                let value = parseFloat(e.target.value) || 0;
                value = Math.max(0, Math.min(100, value));
                State.updateGeneralParam('feePercentage', value / 100);
            });
            feeInput.addEventListener('blur', (e) => {
                let value = parseFloat(e.target.value) || 0;
                value = Math.max(0, Math.min(100, value));
                e.target.value = value;
            });
            // Inicializar valor por defecto
            State.generalParams.feePercentage = 0.10;
        }

        this.updateModifierDisplay();
    },

    updateModifierDisplay() {
        const modifierWrap = document.querySelector('.modifier-percentage-wrap');
        const percentage = State.generalParams.modifierPercentage;

        if (modifierWrap) {
            modifierWrap.classList.toggle('active', percentage > 0);
            modifierWrap.classList.toggle('negative', percentage < 0);
        }
    },

    resetGeneralParamsUI() {
        // Campos de texto
        const clienteInput = document.getElementById('input-cliente');
        const eventoInput = document.getElementById('input-evento');
        if (clienteInput) clienteInput.value = '';
        if (eventoInput) eventoInput.value = '';

        // Metraje
        const metrajeInput = document.getElementById('input-metraje');
        if (metrajeInput) metrajeInput.value = 25;

        // Frente y Profundidad
        const frontalInput = document.getElementById('input-frontal');
        if (frontalInput) frontalInput.value = '';
        const profundidadInput = document.getElementById('input-profundidad');
        if (profundidadInput) profundidadInput.value = '';

        // Tipo de stand
        document.querySelectorAll('.stand-btn').forEach((btn, index) => {
            btn.classList.toggle('active', index === 0);
        });

        // Altura
        document.querySelectorAll('.height-chip').forEach((btn, index) => {
            btn.classList.toggle('active', index === 0);
        });

        // Modificador
        const modifierNameInput = document.getElementById('modifier-name');
        const modifierPercentageInput = document.getElementById('modifier-percentage');
        if (modifierNameInput) modifierNameInput.value = '';
        if (modifierPercentageInput) modifierPercentageInput.value = 0;
        this.updateModifierDisplay();

        // Fee
        const feeCheckbox = document.getElementById('fee-checkbox');
        const feeInput = document.getElementById('fee-percentage-input');
        if (feeCheckbox) feeCheckbox.checked = false;
        if (feeInput) feeInput.value = 10;

        // Tipo de cotización: reset a Stand
        document.querySelectorAll('.quot-btn-param').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === 'stand');
        });
        this.updateLayoutForType('stand');
    },

    // =============================================
    // VALIDACIÓN PRE-EXPORT
    // =============================================
    validateForExport() {
        const errors = [];
        const params = State.generalParams;
        const qType = params.quotationType || 'stand';

        // Limpiar estados de error previos
        document.querySelectorAll('.input-error').forEach(el => el.classList.remove('input-error'));

        const clienteInput = document.getElementById('input-cliente');
        const proyectoInput = document.getElementById('input-proyecto');
        const eventoInput = document.getElementById('input-evento');
        const metrajeInput = document.getElementById('input-metraje');

        const clienteVal = (clienteInput?.value || '').trim();
        const proyectoVal = (proyectoInput?.value || '').trim();
        const eventoVal = (eventoInput?.value || '').trim();

        if (!clienteVal) {
            errors.push({ field: clienteInput, msg: 'Falta el Cliente' });
        }
        if (!proyectoVal) {
            errors.push({ field: proyectoInput, msg: 'Falta el Proyecto' });
        }
        if (!eventoVal) {
            errors.push({ field: eventoInput, msg: 'Falta el Evento' });
        }

        if (qType === 'stand') {
            const metraje = parseFloat(metrajeInput?.value);
            if (!metraje || metraje < 1) {
                errors.push({ field: metrajeInput, msg: 'Falta la Superficie' });
            }
            const hasItems = Object.values(State.selectedItems).some(d => d.quantity > 0);
            if (!hasItems) {
                errors.push({ field: null, msg: 'No hay items seleccionados' });
            }
        } else {
            // Expo/Alquiler: al menos un espacio con al menos un item
            const spaces = params.spaces || [];
            if (spaces.length === 0) {
                errors.push({ field: null, msg: 'No hay espacios creados' });
            } else {
                const hasAnyItem = spaces.some(s => Object.values(s.items || {}).some(d => d.quantity > 0));
                if (!hasAnyItem) {
                    errors.push({ field: null, msg: 'Ningún espacio tiene items cargados' });
                }
            }
        }

        return errors;
    },

    handleReset() {
        const hasContent = Object.keys(State.selectedItems).length > 0
            || (State.generalParams.spaces || []).some(s => Object.keys(s.items || {}).length > 0)
            || (document.getElementById('input-cliente')?.value || '').trim()
            || (document.getElementById('input-proyecto')?.value || '').trim()
            || (document.getElementById('input-evento')?.value || '').trim();

        if (!hasContent) {
            State.reset();
            return;
        }

        Confirm.show({
            title: 'Reiniciar cotización',
            message: 'Se perderán todos los datos cargados (cliente, parámetros e items). ¿Continuar?',
            confirmText: 'Sí, reiniciar',
            cancelText: 'Cancelar',
            danger: true
        }).then(confirmed => {
            if (confirmed) {
                State.reset();
                Toast.success('Cotización reiniciada');
            }
        });
    },

    async handleExport(options = {}) {
        const errors = this.validateForExport();
        if (errors.length > 0) {
            errors.forEach(err => {
                if (err.field) err.field.classList.add('input-error');
            });
            const first = errors[0];
            Toast.error(first.msg);
            if (first.field) {
                first.field.focus();
                first.field.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }

        const isPreview = !!options.preview;
        const btn = document.getElementById(isPreview ? 'btn-preview' : 'btn-export');
        if (!btn) return;

        const originalHTML = btn.innerHTML;
        btn.classList.add('is-loading');
        btn.disabled = true;
        btn.innerHTML = `<span class="mp-spinner"></span>${isPreview ? 'Preparando vista previa...' : 'Generando PDF...'}`;

        try {
            await this.exportPDF(options);
            if (!isPreview) Toast.success('PDF generado correctamente');
        } catch (e) {
            console.error('❌ Error generando PDF:', e);
            Toast.error('No se pudo generar el PDF. Revisá la consola.');
        } finally {
            btn.classList.remove('is-loading');
            btn.disabled = false;
            btn.innerHTML = originalHTML;
        }
    },

    // Handler para el botón de preview
    async handlePreview() {
        return this.handleExport({ preview: true });
    },

    // =============================================
    // EXPORT CSV — items + totales en un CSV listo para Excel
    // =============================================
    handleExportCSV() {
        const params = State.generalParams;
        const isMultiSpace = State.isMultiSpaceMode();
        const qType = params.quotationType || 'stand';

        // Validación mínima: al menos 1 item
        const itemCount = isMultiSpace
            ? (params.spaces || []).reduce((sum, s) =>
                sum + Object.values(s.items || {}).filter(d => d.quantity > 0).length, 0)
            : Object.values(State.selectedItems).filter(d => d.quantity > 0).length;

        if (itemCount === 0) {
            Toast.error('Agregá al menos un item antes de exportar');
            return;
        }

        const heightAffected = DATABASE.heightAffectedCategories || ['infrastructure', 'lighting'];
        const hMult = params.heightMultiplier || 1;
        const modMult = 1 + ((params.modifierPercentage || 0) / 100);
        const feeMult = params.includeFee ? (1 + params.feePercentage) : 1;

        // Construir filas: header + metadata + items + totales
        const rows = [];

        // Bloque de metadata
        rows.push(['MEPEX — Cotización']);
        rows.push(['Cliente', params.cliente || '']);
        rows.push(['Proyecto', params.proyecto || '']);
        rows.push(['Evento', params.evento || '']);
        rows.push(['Tipo', qType.toUpperCase()]);
        if (qType === 'stand') {
            rows.push(['Superficie', `${params.metraje}m²`]);
            rows.push(['Tipo de Stand', params.standType || '']);
            const heightData = DATABASE.heightMultipliers.find(h => h.id === params.heightType);
            rows.push(['Altura', heightData ? `${heightData.name} (${heightData.height})` : '']);
        } else {
            rows.push(['Espacios', String((params.spaces || []).length)]);
        }
        if ((params.modifierPercentage || 0) !== 0) {
            rows.push(['Modificador', `${params.modifierName || ''} (${params.modifierPercentage}%)`]);
        }
        if (params.includeFee) {
            rows.push(['Fee Agencia', `${(params.feePercentage * 100).toFixed(0)}%`]);
        }
        rows.push(['Fecha', new Date().toLocaleDateString('es-AR')]);
        rows.push([]); // línea en blanco

        // Tabla de items
        rows.push(['Espacio', 'Categoría', 'Código', 'Item', 'Unidad', 'Cantidad', 'Precio Base', 'Precio c/ajustes', 'Subtotal']);

        let runningTotal = 0;
        const pushItem = (item, qty, spaceName = '') => {
            const base = this._parsePrice(item.price);
            const h = heightAffected.includes(item.category) ? hMult : 1;
            const loadedUnit = base * h * modMult * feeMult;
            const subtotal = loadedUnit * qty;
            runningTotal += subtotal;
            const cat = DB.getCategories().find(c => c.id === item.category);
            rows.push([
                spaceName,
                cat ? cat.name : (item.category || ''),
                item.code || '',
                item.name || '',
                item.unit || '',
                qty,
                base.toFixed(2),
                loadedUnit.toFixed(2),
                subtotal.toFixed(2)
            ]);
        };

        if (isMultiSpace) {
            (params.spaces || []).forEach(space => {
                Object.entries(space.items || {}).forEach(([id, data]) => {
                    if (data.quantity <= 0) return;
                    const item = DB.getItemById(id);
                    if (item) pushItem(item, data.quantity, space.name);
                });
            });
        } else {
            Object.entries(State.selectedItems).forEach(([id, data]) => {
                if (data.quantity <= 0) return;
                const item = DB.getItemById(id);
                if (item) pushItem(item, data.quantity);
            });
        }

        // Totales
        const tax = runningTotal * 0.21;
        const total = runningTotal + tax;
        rows.push([]);
        rows.push(['', '', '', '', '', '', '', 'Subtotal', runningTotal.toFixed(2)]);
        rows.push(['', '', '', '', '', '', '', 'IVA (21%)', tax.toFixed(2)]);
        rows.push(['', '', '', '', '', '', '', 'TOTAL', total.toFixed(2)]);

        // Serializar a CSV — RFC 4180 con separador `,` y BOM para que Excel abra bien UTF-8
        const csvEscape = (v) => {
            if (v === null || v === undefined) return '';
            const s = String(v);
            if (/[,"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
            return s;
        };
        const csv = rows.map(r => r.map(csvEscape).join(',')).join('\r\n');
        const BOM = '\uFEFF';

        // Descarga
        try {
            const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const safeCliente = (params.cliente || 'cotizacion')
                .replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40) || 'cotizacion';
            const today = new Date().toISOString().split('T')[0];
            const fileName = `MEPEX_${safeCliente}_${today}.csv`;

            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            Toast.success(`CSV exportado: ${fileName}`);
        } catch (e) {
            console.error('❌ Error exportando CSV:', e);
            Toast.error('No se pudo exportar el CSV');
        }
    },

    async exportPDF(options = {}) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const params = State.generalParams;
        const qType = params.quotationType || 'stand';
        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 20;
        const contentWidth = pageWidth - (margin * 2);

        // Número de cotización secuencial (API-first, localStorage fallback)
        let cotNumber;
        const currentYear = new Date().getFullYear();
        try {
            if (typeof API !== 'undefined' && API.isConnected) {
                const numData = await API.getNextQuotationNumber();
                cotNumber = numData.formatted;
                console.log(`🔢 Número de cotización obtenido de la API: ${cotNumber}`);
            } else {
                throw new Error('API not available');
            }
        } catch (e) {
            console.warn('⚠️ No se pudo obtener número de la API, usando localStorage:', e.message);
            const storageKey = `mepex_cot_seq_${currentYear}`;
            let cotSeq = parseInt(localStorage.getItem(storageKey) || '0') + 1;
            localStorage.setItem(storageKey, cotSeq.toString());
            cotNumber = `COT-${currentYear}-${String(cotSeq).padStart(4, '0')}`;
        }

        // Colores MEPEX (dark theme)
        const cyanColor = [0, 180, 213];
        const orangeColor = [243, 122, 31];
        const pageBg = [26, 26, 26];       // #1a1a1a
        const surfaceBg = [35, 35, 35];     // #232323
        const white = [255, 255, 255];
        const lightGray = [200, 200, 200];
        const mediumGray = [140, 140, 140];

        // Helper: draw dark background on current page
        const drawPageBg = () => {
            doc.setFillColor(...pageBg);
            doc.rect(0, 0, pageWidth, pageHeight, 'F');
        };

        // Helper: add new page with background
        const addDarkPage = () => {
            doc.addPage();
            drawPageBg();
            // Thin cyan line at top of continuation pages
            doc.setFillColor(...cyanColor);
            doc.rect(0, 0, pageWidth, 2, 'F');
        };

        // Helper: get height label
        const currentHeight = DATABASE.heightMultipliers.find(h => h.id === params.heightType);
        const heightLabel = currentHeight ? `${currentHeight.name} (${currentHeight.height})` : 'Estándar (≤2.40m)';

        // Helper: convert local image to data URL for embedding
        // maxWidth/maxHeight controlan el tamaño del canvas (= datos almacenados en el PDF)
        const loadImageAsDataURL = (src, maxWidth = 200, maxHeight = 200) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    let width = img.naturalWidth;
                    let height = img.naturalHeight;
                    if (width > maxWidth || height > maxHeight) {
                        const ratio = Math.min(maxWidth / width, maxHeight / height);
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/png'));
                };
                img.onerror = () => resolve(null);
                img.src = src;
            });
        };

        // ── Load logo images (dimensiones acotadas al tamaño de display en el PDF) ──
        // logo_full: se muestra a 50×7mm → ~300×42px a 150dpi
        // mepex_iso: se muestra a 10×10mm → ~60×60px a 150dpi
        const logoFullData = await loadImageAsDataURL('assets/logo_full.png', 300, 50);
        const isoData = await loadImageAsDataURL('assets/mepex_iso.png', 80, 80);

        // ========================================
        // PAGE 1 - BACKGROUND
        // ========================================
        drawPageBg();

        // ========================================
        // HEADER
        // ========================================
        // Top accent bar
        doc.setFillColor(...cyanColor);
        doc.rect(0, 0, pageWidth, 3, 'F');

        // MEPEX Logo (image or text fallback)
        if (logoFullData) {
            // logo_full.png has aspect ~7.5:1
            doc.addImage(logoFullData, 'PNG', margin, 10, 50, 7);
        } else {
            doc.setFontSize(22);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...cyanColor);
            doc.text('M E P E X', margin, 17);
        }

        // Subtitle — spaced uppercase
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...mediumGray);
        doc.text('M O N T A J E   Y   E Q U I P A M I E N T O   P A R A   E X P O S I C I O N E S', margin, 23);

        // Tipo de cotización badge (top-right)
        const typeLabels = { stand: 'STAND', expo: 'EXPO', alquiler: 'ALQUILER' };
        const typeLabel = typeLabels[qType] || 'STAND';
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...white);
        const badgeW = doc.getTextWidth(typeLabel) + 12;
        doc.setFillColor(...cyanColor);
        doc.roundedRect(pageWidth - margin - badgeW, 10, badgeW, 8, 2, 2, 'F');
        doc.text(typeLabel, pageWidth - margin - badgeW + 6, 15.5);

        // Fecha de emisión (debajo del badge)
        const today = new Date();
        const dateStr = today.toLocaleDateString('es-AR', {
            day: '2-digit', month: 'long', year: 'numeric'
        });
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...mediumGray);
        doc.text(dateStr, pageWidth - margin, 24, { align: 'right' });

        // Línea separadora
        doc.setDrawColor(...cyanColor);
        doc.setLineWidth(0.5);
        doc.line(margin, 28, pageWidth - margin, 28);

        // ========================================
        // INFORMACIÓN DEL PROYECTO
        // ========================================
        let yPos = 35;

        const cliente = document.getElementById('input-cliente')?.value || 'No especificado';
        const proyecto = document.getElementById('input-proyecto')?.value || '';
        const evento = document.getElementById('input-evento')?.value || 'No especificado';
        const eventoData = State.generalParams.eventoData;
        const fechaEventoStr = formatEventDateRange(eventoData?.eventStartDate, eventoData?.eventEndDate);
        const venue = eventoData?.venue || '';
        const tipoStand = params.standType.charAt(0).toUpperCase() + params.standType.slice(1);
        const isMultiSpace = State.isMultiSpaceMode();

        // Columna izquierda: cliente, proyecto (si existe), evento
        // Columna derecha: superficie/tipo/altura, fecha evento (si existe), lugar (si existe)
        let leftRows = 2; // cliente + evento siempre
        if (proyecto) leftRows++;
        let rightRows = 0;
        if (qType === 'stand') rightRows += 2; // superficie + tipo/altura
        else rightRows += 1; // espacios
        if (fechaEventoStr) rightRows++;
        if (venue) rightRows++;

        const dataRows = Math.max(leftRows, rightRows);
        const boxHeight = 10 + (dataRows * 6) + 4; // título + filas + padding

        doc.setFillColor(...surfaceBg);
        doc.roundedRect(margin, yPos, contentWidth, boxHeight, 3, 3, 'F');

        // Card border accent
        doc.setDrawColor(50, 50, 50);
        doc.setLineWidth(0.3);
        doc.roundedRect(margin, yPos, contentWidth, boxHeight, 3, 3, 'S');

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...cyanColor);
        doc.text('D A T O S   D E L   P R O Y E C T O', margin + 5, yPos + 6);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...lightGray);

        // Columna izquierda
        let leftY = yPos + 13;
        doc.text(`Cliente: ${cliente}`, margin + 5, leftY);
        if (proyecto) {
            leftY += 6;
            doc.text(`Proyecto: ${proyecto}`, margin + 5, leftY);
        }
        leftY += 6;
        doc.text(`Evento: ${evento}`, margin + 5, leftY);

        // Columna derecha
        let rightY = yPos + 13;
        if (qType === 'stand') {
            doc.text(`Superficie: ${params.metraje}m²`, margin + 90, rightY);
            rightY += 6;
            doc.text(`Tipo: ${tipoStand}  |  Altura: ${heightLabel}`, margin + 90, rightY);
        } else {
            doc.text(`Espacios: ${params.spaces.length}`, margin + 90, rightY);
        }
        if (fechaEventoStr) {
            rightY += 6;
            doc.text(`Fecha evento: ${fechaEventoStr}`, margin + 90, rightY);
        }
        if (venue) {
            rightY += 6;
            doc.text(`Lugar: ${venue}`, margin + 90, rightY);
        }

        yPos += boxHeight + 8;

        // ========================================
        // TÍTULO DE COTIZACIÓN
        // ========================================
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...white);
        doc.text('P R O P U E S T A   D E   C O T I Z A C I Ó N', pageWidth / 2, yPos, { align: 'center' });

        yPos += 10;

        // ========================================
        // Mapa de iconos de texto para PDF
        // ========================================
        const categoryIcons = {
            'flooring': '[PIS]',
            'infrastructure': '[INF]',
            'lighting': '[ILU]',
            'equipment': '[EQP]',
            'marketing': '[MKT]',
            'moreservices': '[SER]'
        };

        const heightAffectedCategories = DATABASE.heightAffectedCategories || ['infrastructure', 'lighting'];
        const modifierMultiplier = 1 + (params.modifierPercentage / 100);

        let adjustedSubtotal = 0;

        // Helper: parse price
        const parsePrice = (price) => typeof price === 'string'
            ? parseFloat(price.toString().replace(/[^\d.,-]/g, '').replace(',', '.')) || 0
            : (parseFloat(price) || 0);

        // Helper: calculate loaded price (Base * Height * Modifier * Fee)
        const getLoadedPrice = (item, price) => {
            let loaded = price;
            // 1. Modificador global (e.g. correlativo a urgencia, etc)
            loaded *= modifierMultiplier;

            // 2. Multiplicador de altura (solo si aplica)
            if (heightAffectedCategories.includes(item.category)) {
                loaded *= params.heightMultiplier;
            }

            // 3. Fee de agencia (si está habilitado)
            if (params.includeFee) {
                loaded *= (1 + params.feePercentage);
            }

            return loaded;
        };

        // Helper: formato consistente de cada línea de ítem para el PDF.
        //  · qty > 1 + unidad significativa (m², ml, día): "• 15 m² — Vinilo impreso"
        //  · qty > 1 + unidad genérica (unidad/set/proyecto) o vacía: "• 15× Taburete JB"
        //  · qty === 1: "• Cesto Papelero"  (sin prefijo "1x", igual que el modo multi-space lo hacía)
        const normalizeUnit = (u) => {
            if (!u) return '';
            const norm = String(u).toLowerCase();
            // Unidades genéricas no aportan información visible en el PDF → omitir
            if (norm === 'unidad' || norm === 'set' || norm === 'proyecto') return '';
            // m2 → m² (mejor display tipográfico)
            if (norm === 'm2' || norm === 'm²') return 'm²';
            return u;
        };
        const formatItemLine = (item) => {
            const qty = item.quantity;
            const unitLabel = normalizeUnit(item.unit);
            if (qty === 1) return `• ${item.name}`;
            if (unitLabel) return `• ${qty} ${unitLabel} — ${item.name}`;
            return `• ${qty}× ${item.name}`;
        };

        // ========================================
        // STAND MODE — items globales por categoría
        // ========================================
        if (!isMultiSpace) {
            const groupedItems = {};
            let subtotalLoaded = 0;

            Object.entries(State.selectedItems).forEach(([id, data]) => {
                if (data.quantity <= 0) return;
                const item = DB.getItemById(id);
                if (item) {
                    const priceList = parsePrice(item.price);
                    const loadedPrice = getLoadedPrice(item, priceList);
                    const catId = item.category;
                    if (!groupedItems[catId]) groupedItems[catId] = [];
                    groupedItems[catId].push({ ...item, price: loadedPrice, quantity: data.quantity });
                }
            });

            doc.setFontSize(9);

            DB.getCategories().forEach(cat => {
                if (groupedItems[cat.id] && groupedItems[cat.id].length > 0) {
                    const isInfrastructure = cat.id === 'infrastructure';
                    let catTotal = 0;

                    if (yPos > pageHeight - 70) { addDarkPage(); yPos = 25; }

                    // Header del rubro
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(...cyanColor);
                    doc.text(cat.name.toUpperCase(), margin, yPos);
                    doc.setDrawColor(60, 60, 60);
                    doc.setLineWidth(0.3);
                    doc.line(margin, yPos + 2, pageWidth - margin, yPos + 2);
                    yPos += 7;

                    // Stand = proyecto integral. En el PDF no enumeramos precios
                    // individuales: Infraestructura sale como línea OCTEXA y los demás
                    // rubros listan piezas (qty - nombre) sin monto por ítem.
                    if (isInfrastructure) {
                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(...lightGray);
                        doc.text(`Superficie: ${params.metraje}m² — Altura: ${heightLabel}`, margin + 5, yPos);
                        yPos += 5;
                        doc.setFont('helvetica', 'italic');
                        doc.setTextColor(...mediumGray);
                        doc.text('Construcción modular con sistema OCTEXA', margin + 5, yPos);
                        yPos += 6;
                    } else {
                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(...lightGray);
                        groupedItems[cat.id].forEach(item => {
                            if (yPos > pageHeight - 60) { addDarkPage(); yPos = 25; }
                            doc.text(`${item.quantity} - ${item.name}`, margin + 5, yPos);
                            yPos += 5;
                        });
                    }

                    // catTotal se acumula igual en todos los rubros para que el
                    // subtotal/grand total quede correcto, aunque no se imprima.
                    groupedItems[cat.id].forEach(item => {
                        catTotal += item.price * item.quantity;
                    });

                    subtotalLoaded += catTotal;

                    yPos += 5;
                }
            });

            adjustedSubtotal = subtotalLoaded;

            // ========================================
            // EXPO / ALQUILER MODE — items por espacio
            // ========================================
        } else {
            let grandTotal = 0;

            doc.setFontSize(9);

            params.spaces.forEach((space, spaceIndex) => {
                // ── Encabezado del espacio ──
                if (yPos > pageHeight - 70) { addDarkPage(); yPos = 25; }

                doc.setFillColor(40, 40, 40);
                doc.roundedRect(margin, yPos - 1, contentWidth, 9, 2, 2, 'F');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(...cyanColor);
                doc.text(space.name.toUpperCase(), margin + 4, yPos + 5);
                if (space.surface) {
                    doc.setFontSize(8);
                    doc.setTextColor(...mediumGray);
                    doc.text(`${space.surface}m²`, pageWidth - margin - 4, yPos + 5, { align: 'right' });
                }
                yPos += 13;
                doc.setFontSize(9);

                let spaceTotal = 0;

                // Agrupar items del espacio por categoría
                const spaceGrouped = {};
                Object.entries(space.items).forEach(([id, data]) => {
                    if (data.quantity <= 0) return;
                    const item = DB.getItemById(id);
                    if (item) {
                        const priceList = parsePrice(item.price);
                        const loadedPrice = getLoadedPrice(item, priceList);
                        const catId = item.category;
                        if (!spaceGrouped[catId]) spaceGrouped[catId] = [];
                        spaceGrouped[catId].push({ ...item, price: loadedPrice, quantity: data.quantity });
                    }
                });

                DB.getCategories().forEach(cat => {
                    if (spaceGrouped[cat.id] && spaceGrouped[cat.id].length > 0) {
                        if (yPos > pageHeight - 60) { addDarkPage(); yPos = 25; }

                        const catIcon = categoryIcons[cat.id] || '>>';
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(...cyanColor);
                        doc.text(cat.name.toUpperCase(), margin + 3, yPos);
                        doc.setDrawColor(60, 60, 60);
                        doc.setLineWidth(0.2);
                        doc.line(margin + 3, yPos + 2, pageWidth - margin, yPos + 2);
                        yPos += 6;

                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(...lightGray);

                        spaceGrouped[cat.id].forEach(item => {
                            if (yPos > pageHeight - 60) { addDarkPage(); yPos = 25; }
                            const itemTotal = item.price * item.quantity;
                            spaceTotal += itemTotal;

                            doc.setTextColor(...lightGray);
                            doc.text(formatItemLine(item), margin + 6, yPos);
                            doc.setTextColor(...white);
                            doc.text(`$${Math.round(itemTotal).toLocaleString('es-AR')}`, pageWidth - margin, yPos, { align: 'right' });
                            yPos += 5;
                        });

                        yPos += 2;
                    }
                });

                // Subtotal del espacio
                if (yPos > pageHeight - 50) { addDarkPage(); yPos = 25; }
                doc.setDrawColor(60, 60, 60);
                doc.setLineWidth(0.3);
                doc.line(margin + 3, yPos, pageWidth - margin, yPos);
                yPos += 4;
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(...mediumGray);
                doc.text(`Subtotal ${space.name}`, margin + 4, yPos);
                doc.setTextColor(...cyanColor);
                doc.text(`$${Math.round(spaceTotal).toLocaleString('es-AR')}`, pageWidth - margin, yPos, { align: 'right' });
                yPos += 8;

                grandTotal += spaceTotal;
            });

            adjustedSubtotal = grandTotal;
        }

        // ========================================
        // CÁLCULO DEL TOTAL (Ya incluido en los items)
        // ========================================
        // El fee ya se aplicó ítem por ítem en getLoadedPrice. No sumar al final.

        const tax = adjustedSubtotal * 0.21;
        const total = adjustedSubtotal + tax;

        // ========================================
        // TOTAL (destacado)
        // ========================================
        yPos += 8;

        if (yPos > pageHeight - 55) {
            addDarkPage();
            yPos = 25;
        }

        // Caja de total (con desglose)
        doc.setFillColor(...cyanColor);
        doc.roundedRect(margin, yPos, contentWidth, 26, 3, 3, 'F');

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...white);
        doc.text('T O T A L   D E   L A   P R O P U E S T A', margin + 8, yPos + 8);

        doc.setFontSize(14);
        doc.text(`$${Math.round(total).toLocaleString('es-AR')}`, pageWidth - margin - 8, yPos + 8, { align: 'right' });

        // Desglose subtotal + IVA (dentro del bloque cyan)
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(255, 255, 255, 180);
        const breakdownText = `Subtotal $${Math.round(adjustedSubtotal).toLocaleString('es-AR')} + IVA (21%) $${Math.round(tax).toLocaleString('es-AR')}`;
        doc.text(breakdownText, pageWidth - margin - 8, yPos + 16, { align: 'right' });

        // ========================================
        // PIE DE PÁGINA
        // ========================================
        const footerY = pageHeight - 38;

        // Línea separadora
        doc.setDrawColor(...cyanColor);
        doc.setLineWidth(0.5);
        doc.line(margin, footerY - 6, pageWidth - margin, footerY - 6);

        // Isotype (image or fallback)
        const isoX = margin;
        const isoY = footerY;
        if (isoData) {
            doc.addImage(isoData, 'PNG', isoX, isoY - 2, 10, 10);
        } else {
            doc.setDrawColor(...cyanColor);
            doc.setLineWidth(1.5);
            doc.line(isoX, isoY, isoX + 8, isoY + 8);
            doc.line(isoX + 8, isoY, isoX, isoY + 8);
        }

        // Términos (izquierda, al lado del isotype)
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...mediumGray);
        doc.text('Presupuesto en concepto de alquiler. Incluye armado, desarme y logística.', isoX + 14, isoY + 1);
        doc.text('No incluye diseño del material gráfico. Vigencia: 15 días. Forma de pago a convenir.', isoX + 14, isoY + 5);
        doc.text(`Ref: ${cotNumber}`, isoX + 14, isoY + 9);

        // Contacto (derecha)
        const contactX = pageWidth - margin - 55;

        // WhatsApp
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...mediumGray);
        doc.text('WhatsApp:', contactX, isoY + 1);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...cyanColor);
        doc.textWithLink('11 4970 7000', contactX + 20, isoY + 1, { url: 'https://wa.me/541149707000' });

        // Web
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...mediumGray);
        doc.text('Web:', contactX, isoY + 5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...cyanColor);
        doc.textWithLink('www.mepex.com.ar', contactX + 20, isoY + 5, { url: 'https://www.mepex.com.ar' });

        // Dirección
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...mediumGray);
        doc.text('Pallares 549 - Dpto 1, CP 1824, Lanús Oeste', contactX, isoY + 9);

        // Barra inferior decorativa — CELESTE
        doc.setFillColor(...cyanColor);
        doc.rect(0, pageHeight - 4, pageWidth, 4, 'F');

        // ========================================
        // GUARDAR PDF
        // ========================================
        const safeCliente = (cliente || 'cliente').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
        const fileName = `MEPEX_${cotNumber}_${safeCliente}_${today.toISOString().split('T')[0]}.pdf`;

        let pdfBlob = null;
        try {
            pdfBlob = doc.output('blob');
        } catch (e) {
            console.warn('⚠️ No se pudo generar el blob del PDF (se guardará igualmente):', e);
        }

        // Modo preview: mostrar en modal antes de descargar/guardar.
        // El user decide desde el modal si descarga y guarda, o descarta.
        if (options.preview && pdfBlob) {
            this._showPDFPreview(pdfBlob, doc, fileName, cotNumber);
            return;
        }

        doc.save(fileName);

        // Guardar cotización (API + localStorage) + subir PDF a Supabase en background
        if (typeof QuotationStorage !== 'undefined') {
            QuotationStorage.saveQuotation(cotNumber, pdfBlob).catch(e =>
                console.error('Error guardando cotización:', e)
            );
        }
    },

    // Modal de vista previa del PDF. El user decide si descargar+guardar o descartar.
    _showPDFPreview(pdfBlob, doc, fileName, cotNumber) {
        const url = URL.createObjectURL(pdfBlob);

        const overlay = document.createElement('div');
        overlay.className = 'pdf-preview-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-label', 'Vista previa del PDF');
        overlay.innerHTML = `
            <div class="pdf-preview-modal">
                <div class="pdf-preview-header">
                    <div class="pdf-preview-title">
                        <span class="pdf-preview-icon">📄</span>
                        <div>
                            <div class="pdf-preview-cot">${cotNumber}</div>
                            <div class="pdf-preview-meta">Vista previa — no se descargó todavía</div>
                        </div>
                    </div>
                    <button type="button" class="pdf-preview-close" aria-label="Cerrar">✕</button>
                </div>
                <div class="pdf-preview-iframe-wrap">
                    <iframe class="pdf-preview-iframe" src="${url}" title="Preview PDF"></iframe>
                </div>
                <div class="pdf-preview-footer">
                    <button type="button" class="btn-secondary pdf-preview-cancel">Cancelar</button>
                    <button type="button" class="btn-primary pdf-preview-download">Descargar y guardar</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            try { URL.revokeObjectURL(url); } catch { /* silent */ }
            overlay.remove();
        };

        overlay.querySelector('.pdf-preview-close').addEventListener('click', cleanup);
        overlay.querySelector('.pdf-preview-cancel').addEventListener('click', cleanup);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) cleanup();
        });

        // Esc cierra
        const onKey = (e) => {
            if (e.key === 'Escape') {
                cleanup();
                document.removeEventListener('keydown', onKey);
            }
        };
        document.addEventListener('keydown', onKey);

        // Descargar y guardar: usamos doc.save() para mantener el mismo flujo que antes,
        // y después delegamos a QuotationStorage para persistir
        overlay.querySelector('.pdf-preview-download').addEventListener('click', () => {
            try {
                doc.save(fileName);
                if (typeof QuotationStorage !== 'undefined') {
                    QuotationStorage.saveQuotation(cotNumber, pdfBlob).catch(e =>
                        console.error('Error guardando cotización:', e)
                    );
                }
                if (typeof Toast !== 'undefined') Toast.success('PDF descargado y guardado');
            } catch (e) {
                console.error('❌ Error descargando PDF:', e);
                if (typeof Toast !== 'undefined') Toast.error('No se pudo descargar el PDF');
            }
            cleanup();
        });
    }

};

// =============================================
// INITIALIZE APP
// =============================================
document.addEventListener('DOMContentLoaded', async () => {
    // LIMPIAR CACHE: Eliminar items viejos de localStorage
    // Esto asegura que solo se muestren items de Supabase
    localStorage.removeItem('mepex_database');
    DATABASE.items = []; // Asegurar que el array esté vacío
    console.log('🧹 Cleared cached items — waiting for Supabase data...');

    // Update sync status UI
    const updateSyncStatus = (status, text) => {
        const statusEl = document.getElementById('sync-status');
        if (statusEl) {
            statusEl.className = `sync-status sync-${status}`;
            statusEl.querySelector('.sync-text').textContent = text;
        }
    };

    // Try to connect to API
    updateSyncStatus('syncing', 'Conectando...');

    try {
        if (typeof API !== 'undefined') {
            const connected = await API.init();

            if (connected) {
                // Verify items actually loaded
                if (DATABASE.items.length > 0) {
                    updateSyncStatus('online', 'Supabase');
                    console.log(`✅ Connected to Supabase — ${DATABASE.items.length} items loaded`);
                } else {
                    updateSyncStatus('error', 'Sin items');
                    console.warn('⚠️ API connected but 0 items loaded');
                }
            } else {
                updateSyncStatus('offline', 'Local');
                console.log('⚠️ API not available, using local database');
            }
        } else {
            updateSyncStatus('offline', 'Local');
            console.log('⚠️ API module not loaded');
        }
    } catch (error) {
        updateSyncStatus('error', 'Error');
        console.error('❌ API connection error:', error);
    }

    // Cargar favoritos del usuario desde localStorage
    Favorites.init();

    // Initialize render (works with merged DATABASE)
    Render.init();

    // Initialize autocomplete module
    if (typeof Autocomplete !== 'undefined') {
        Autocomplete.init();
        console.log('🔗 Autocomplete module initialized');
    }

    Render.initSearchFilter();

    // Detectar borrador sin guardar y ofrecer restaurar
    if (typeof Autosave !== 'undefined') Autosave.maybePromptRecovery();

    console.log('MEPEX Cotizador initialized successfully.');

    // Listen for future catalog sync events (for real-time updates)
    window.addEventListener('catalog-synced', (e) => {
        const { items, timestamp } = e.detail;
        console.log(`📦 Catalog synced: ${items.length} items at ${new Date(timestamp).toLocaleString()}`);

        // Re-render items to show new synced items
        Render.renderItems();
        Render.renderAdminPanel();
    });
});
