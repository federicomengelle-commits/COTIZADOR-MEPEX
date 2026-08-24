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
        // Cotización guardada → estructura anidada (fee como entero). Pricing lo normaliza.
        const pricingCtx = Pricing.contextFromSavedParams(params, heightAffected);

        const itemsMap = {};
        let subtotal = 0;
        let itemCount = 0;

        const processItem = (entry) => {
            const id = entry.id;
            const qty = entry.quantity || 0;
            if (qty <= 0) return;
            const cur = DB.getItemById(id);
            const name = cur?.name || entry.name || id;
            const base = cur ? Pricing.parsePrice(cur.price) : 0;
            const cat = cur?.category;
            const loaded = Pricing.loadedUnitPrice(base, cat, pricingCtx);
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
        quotationType: 'stand',  // 'stand' | 'expo' | 'alquiler' (= Equipamiento) | 'energia'
        detailLevel: 'minimo',   // 'minimo' | 'medio' | 'detallado' — cuánto muestra el PDF (ver State.detailLevel())
        proposalText: '',        // texto comercial editable (va al PDF; se autogenera si queda vacío)
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

    // ¿Esta rama se cotiza por espacios? Stand es la única que no.
    // Predicado sobre un tipo cualquiera (lo necesita el switch, que compara el viejo
    // contra el nuevo). Fuente única de la lista de ramas multi-espacio.
    isMultiSpaceType(t) {
        return t === 'expo' || t === 'alquiler' || t === 'energia';
    },

    // Determina si estamos en modo multi-espacio
    isMultiSpaceMode() {
        return this.isMultiSpaceType(this.generalParams.quotationType);
    },

    // =============================================
    // NIVEL DE DETALLE — cuánto muestra el documento que ve el cliente
    // =============================================
    // 🟥 Premisa del dueño: STAND NUNCA DISCRIMINA. No es el default de Stand,
    // es una regla dura: el selector ni se muestra y acá se fuerza igual.
    // Los renders (presupuesto jsPDF y propuesta) NO leen el string: preguntan
    // por las dos predicados de abajo. Fuente única de la decisión.
    detailLevel() {
        if (!this.isMultiSpaceMode()) return 'minimo';
        const lvl = this.generalParams.detailLevel;
        return (lvl === 'medio' || lvl === 'detallado') ? lvl : 'minimo';
    },

    // ¿Va el monto pegado a cada ítem?
    showsItemPrices() {
        return this.detailLevel() === 'detallado';
    },

    // ¿Va el subtotal de cada espacio? (mostrar precio por ítem lo implica)
    showsSpaceSubtotals() {
        return this.detailLevel() !== 'minimo';
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
                items[itemId] = {
                    quantity: this._autoQuantityFor(item),
                    autoCalc: DB.isAreaItem(item) || !!item.autoCalculate
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

    // Cantidad automática de un item:
    //  · por m² (unidad m2) → la superficie del contexto (metraje en Stand, surface del espacio en Expo)
    //  · autoCalculate clásico (perímetro/spots) → su fórmula
    //  · nada → 1
    _autoQuantityFor(item) {
        if (DB.isAreaItem(item)) {
            const space = this.getActiveSpace();
            const surface = this.isMultiSpaceMode()
                ? (parseFloat(space?.surface) || this.generalParams.metraje || 1)
                : (this.generalParams.metraje || 1);
            return Math.max(1, Math.round(surface));
        }
        if (item.autoCalculate) {
            return DB.calculateAutoQuantity(item.id, this.generalParams.metraje,
                this.generalParams.standType, this.generalParams.heightType) || 1;
        }
        return 1;
    },

    // Actualizar cantidades auto-calculadas (al cambiar superficie/tipo/altura)
    recalculateAutoItems() {
        const items = this.getCurrentItems();
        Object.keys(items).forEach(itemId => {
            const selection = items[itemId];
            if (!selection.autoCalc) return;
            const item = DB.getItemById(itemId);
            if (item) selection.quantity = this._autoQuantityFor(item);
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
            detailLevel: 'minimo',
            proposalText: '',
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
        this._initProposalBlock();

        // Bind global actions
        document.getElementById('btn-reset')?.addEventListener('click', () => this.handleReset());
        document.getElementById('btn-export')?.addEventListener('click', () => this.handleExport());
        document.getElementById('btn-preview')?.addEventListener('click', () => this.handlePreview());
        document.getElementById('btn-export-csv')?.addEventListener('click', () => this.handleExportCSV());

        // Colapsar/expandir la barra izquierda (desktop) — persiste en localStorage
        const navCollapseBtn = document.getElementById('btn-nav-collapse');
        if (navCollapseBtn) {
            const applyCollapse = (c) => {
                document.querySelector('.app-container')?.classList.toggle('nav-collapsed', c);
                navCollapseBtn.textContent = c ? '»' : '«';
                navCollapseBtn.title = c ? 'Expandir menú' : 'Colapsar menú';
            };
            applyCollapse(localStorage.getItem('mepex_nav_collapsed') === '1');
            navCollapseBtn.addEventListener('click', () => {
                const c = !document.querySelector('.app-container')?.classList.contains('nav-collapsed');
                try { localStorage.setItem('mepex_nav_collapsed', c ? '1' : '0'); } catch { /* silent */ }
                applyCollapse(c);
            });
        }
        // "Cargar" se removió del resumen: Cotizaciones vive en el nav izquierdo (renderNav)
        document.getElementById('btn-templates')?.addEventListener('click', () => {
            if (typeof Templates !== 'undefined') Templates.openModal();
        });
        document.getElementById('btn-compare')?.addEventListener('click', () => {
            if (typeof Compare !== 'undefined') Compare.openModal();
        });

        // Desplegable "Herramientas" (Brief · Templates · Comparar · CSV)
        const toolsToggle = document.getElementById('btn-tools-toggle');
        const toolsMenu = document.getElementById('tools-menu');
        if (toolsToggle && toolsMenu) {
            const setToolsOpen = (open) => {
                toolsMenu.hidden = !open;
                toolsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
                toolsToggle.classList.toggle('open', open);
            };
            toolsToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                setToolsOpen(toolsMenu.hidden);
            });
            // Cerrar al elegir una herramienta o al clickear afuera
            toolsMenu.addEventListener('click', () => setToolsOpen(false));
            document.addEventListener('click', (e) => {
                if (toolsMenu.hidden) return;
                if (e.target.closest('#tools-menu') || e.target.closest('#btn-tools-toggle')) return;
                setToolsOpen(false);
            });
        }
        // btn-admin se vincula en renderNav()

        // Quotation type selector (en params section)
        document.querySelectorAll('.quot-btn-param').forEach(btn => {
            btn.addEventListener('click', () => this.handleQuotationTypeSwitch(btn));
        });

        // Nivel de detalle del PDF (solo visible en multi-espacio)
        document.querySelectorAll('.detail-btn-param').forEach(btn => {
            btn.addEventListener('click', () => {
                State.generalParams.detailLevel = btn.dataset.level;
                this._refreshDetailUI();
                if (typeof Autosave !== 'undefined') Autosave.schedule();
            });
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
        const fromMulti = State.isMultiSpaceType(oldType);
        const toMulti = State.isMultiSpaceType(newType);

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
                    State.recalculateAutoItems(); // los ítems por m² siguen la superficie del espacio
                    Render.updateAll();
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
        paramsLink.innerHTML = '<span class="nav-ico">⚙️</span><span class="nav-text">Parámetros</span>';
        paramsLink.href = '#general-params';
        paramsLink.onclick = (e) => {
            e.preventDefault();
            document.getElementById('general-params').scrollIntoView({ behavior: 'smooth' });
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            paramsLink.classList.add('active');
        };
        paramsBlock.appendChild(paramsLink);
        navContainer.appendChild(paramsBlock);

        // (Cotizaciones se movió al bloque de config de abajo, junto a Propuestas y Catálogo)

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
            link.innerHTML = `<span class="nav-ico">${cat.icon}</span><span class="nav-text">${cat.name}</span> <span class="nav-badge" id="nav-badge-${cat.id}" style="display:none">0</span>`;
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
        // BLOQUE 3: CONFIGURACIÓN (abajo) — Cotizaciones · Propuestas · Catálogo
        // ============================================
        const configBlock = document.createElement('div');
        configBlock.className = 'nav-block nav-block-config';

        // Cotizaciones guardadas (movido desde arriba; "Cargar" del resumen ya no hace falta)
        const savedLink = document.createElement('a');
        savedLink.className = 'nav-link';
        savedLink.innerHTML = '<span class="nav-ico">📁</span><span class="nav-text">Cotizaciones</span>';
        savedLink.href = '#';
        savedLink.onclick = (e) => {
            e.preventDefault();
            if (typeof QuotationUI !== 'undefined') QuotationUI.openModal();
        };
        configBlock.appendChild(savedLink);

        // Propuestas guardadas (Fase 2.3)
        const propuestasLink = document.createElement('a');
        propuestasLink.className = 'nav-link';
        propuestasLink.innerHTML = '<span class="nav-ico">📋</span><span class="nav-text">Propuestas</span>';
        propuestasLink.href = '#';
        propuestasLink.onclick = (e) => {
            e.preventDefault();
            if (typeof PropuestaUI !== 'undefined') PropuestaUI.openModal();
        };
        configBlock.appendChild(propuestasLink);

        // Catálogo (admin)
        const adminLink = document.createElement('a');
        adminLink.className = 'nav-link nav-admin';
        adminLink.id = 'btn-admin';
        adminLink.innerHTML = '<span class="nav-ico">📚</span><span class="nav-text">Catálogo</span>';
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
            // Contenedor de sugerencias fantasma DE ESTE rubro (se llena en _paintGhosts).
            sectionHTML += `<div class="section-ghosts" data-cat="${cat.id}"></div>`;

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

        // Las sugerencias fantasma ahora van DENTRO de cada rubro (.section-ghosts),
        // cada una en la sección de SU ítem (se llenan en _renderGhosts/_paintGhosts).

        this.attachItemListeners();
        this.reapplySearchFilter();
        this._rescanScrollSpy();
        this._enhanceAccordion();
        this._renderGhosts();
    },

    // ── Acordeón por rubro (Fase 1) ────────────────────────────────
    // Hace colapsable cada .category-section y le agrega al título un
    // chevron + meta (conteo y subtotal). El estado verde "has-items"
    // marca el rubro que ya tiene ítems cargados. El colapso se preserva
    // entre re-renders vía this._collapsedCats.
    _categoryStats(catId) {
        const items = DB.getItemsByCategory(catId);
        let count = 0, subtotal = 0;
        items.forEach(it => {
            const q = State.getItemQuantity(it.id) || 0;
            if (q > 0) { count++; subtotal += this._parsePrice(it.price) * q; }
        });
        return { count, subtotal };
    },

    _catMetaHtml(count, subtotal) {
        return count > 0
            ? `<span class="cat-count">${count} ${count === 1 ? 'ítem' : 'ítems'}</span><span class="cat-sub">$${Math.round(subtotal).toLocaleString('es-AR')}</span>`
            : `<span class="cat-count cat-count-empty">vacío</span>`;
    },

    _enhanceAccordion() {
        if (!this._collapsedCats) this._collapsedCats = new Set();
        document.querySelectorAll('#items-container .category-section').forEach(section => {
            const catId = section.id.replace(/^cat-/, '');
            const title = section.querySelector('.category-title');
            if (!title || title.dataset.acc) return;
            title.dataset.acc = '1';

            const chev = document.createElement('span');
            chev.className = 'cat-chevron';
            chev.textContent = '▾';
            title.prepend(chev);

            const { count, subtotal } = this._categoryStats(catId);
            const meta = document.createElement('span');
            meta.className = 'cat-meta';
            meta.innerHTML = this._catMetaHtml(count, subtotal);
            title.appendChild(meta);

            section.classList.toggle('has-items', count > 0);
            if (this._collapsedCats.has(catId)) section.classList.add('collapsed');

            title.addEventListener('click', () => {
                section.classList.toggle('collapsed');
                if (section.classList.contains('collapsed')) this._collapsedCats.add(catId);
                else this._collapsedCats.delete(catId);
            });
        });
    },

    _refreshAccordionMeta() {
        document.querySelectorAll('#items-container .category-section').forEach(section => {
            const catId = section.id.replace(/^cat-/, '');
            const { count, subtotal } = this._categoryStats(catId);
            section.classList.toggle('has-items', count > 0);
            const meta = section.querySelector('.cat-meta');
            if (meta) meta.innerHTML = this._catMetaHtml(count, subtotal);
        });
    },

    // Medidor de "calor" de la propuesta: FRÍA → TIBIA → CALIENTE según
    // cuántos ítems tiene cargados. Gamificación anti-olvidos (Fase 1).
    _updateHeat(count) {
        const el = document.getElementById('heat-meter');
        if (!el) return;
        el.hidden = count === 0;
        let pct, col, txt;
        if (count < 4) { pct = 28; col = '#6AA0FF'; txt = 'FRÍA'; }
        else if (count < 8) { pct = 55; col = 'var(--color-secondary)'; txt = 'TIBIA'; }
        else { pct = 92; col = '#FF4D4D'; txt = 'CALIENTE'; }
        const fill = el.querySelector('.heat-fill');
        const state = el.querySelector('.heat-state');
        if (fill) { fill.style.width = pct + '%'; fill.style.background = col; }
        if (state) { state.textContent = txt; state.style.color = col; }
    },

    // Sugerencias fantasma (Fase 4 — v1 por reglas). Para cada rubro que YA tiene
    // algo cargado, propone hasta 2 ítems no cargados de rubros afines (cross-sell).
    // Pensado para enchufar IA después: reemplazar el cuerpo por una llamada al backend.
    _GHOST_AFFINITY: {
        flooring: ['infrastructure', 'lighting'],
        infrastructure: ['lighting', 'equipment'],
        // Luces → energía primero: si cargaste reflectores, te falta el tablero. Es
        // justamente el cruce que se perdía cuando los tableros vivían en Iluminación.
        lighting: ['energy', 'equipment'],
        energy: ['lighting', 'infrastructure'],
        equipment: ['marketing', 'moreservices'],
        marketing: ['moreservices', 'equipment'],
        moreservices: ['equipment', 'lighting']
    },

    _renderGhosts() {
        // 1) Reglas de afinidad: render INSTANTÁNEO (sin red) y fallback si la IA está
        //    off/caída. 2) Si la IA está habilitada, refina la franja con sugerencias
        //    contextuales (debounced + cache), sin spamear el backend.
        this._paintGhosts(this._ruleGhosts(), false);
        this._maybeAIGhosts();
    },

    // Sugerencias por reglas de afinidad cross-rubro (v1, fallback). Para cada rubro con
    // algo cargado, propone ítems NO cargados de rubros afines, con dedup global.
    _ruleGhosts() {
        const seen = new Set();
        const sugs = [];
        DB.getCategories().forEach(cat => {
            if (this._categoryStats(cat.id).count === 0) return;
            for (const tcat of (this._GHOST_AFFINITY[cat.id] || [])) {
                for (const it of DB.getItemsByCategory(tcat)) {
                    if (State.getItemQuantity(it.id) > 0 || seen.has(it.id)) continue;
                    seen.add(it.id);
                    sugs.push({ it, from: DATABASE.categories[tcat]?.name || tcat });
                }
            }
        });
        return sugs;
    },

    // Pinta las sugerencias DENTRO de la sección de cada ítem sugerido (agrupadas por
    // su categoría real). `sugs`: [{ it, from, motivo? }]. isAI cambia el rótulo/badge.
    _paintGhosts(sugs, isAI) {
        // Limpiar todos los contenedores por sección (y el legacy global si quedara)
        document.querySelectorAll('.section-ghosts').forEach(c => c.innerHTML = '');
        const legacy = document.getElementById('global-ghosts');
        if (legacy) legacy.innerHTML = '';
        if (!sugs || sugs.length === 0) return;
        // Agrupar por la categoría del ítem sugerido → cada uno en SU rubro
        const byCat = {};
        sugs.forEach(s => { (byCat[s.it.category] = byCat[s.it.category] || []).push(s); });
        Object.entries(byCat).forEach(([cat, list]) => {
            const cont = document.querySelector(`.section-ghosts[data-cat="${cat}"]`);
            if (!cont) return;
            cont.innerHTML = `<div class="ghost-label"><span class="ghost-spark">✦</span> Sugerido${isAI ? ' <span class="ghost-ia">IA</span>' : ''}</div>` +
                list.slice(0, 3).map(s => `
                    <div class="ghost-row">
                        <span class="ghost-name">${s.it.name}${s.motivo ? ` <small>· ${s.motivo}</small>` : ''}</span>
                        <button class="btn-add ghost-add" data-action="add" data-id="${s.it.id}">+ Sumar</button>
                    </div>`).join('');
        });
    },

    // IDs de ítems cargados (stand: selectedItems; multi: unión de espacios).
    _loadedItemIds() {
        const ids = new Set();
        if (!State.isMultiSpaceMode()) {
            Object.entries(State.selectedItems || {}).forEach(([id, d]) => { if (d.quantity > 0) ids.add(id); });
        } else {
            (State.generalParams.spaces || []).forEach(sp =>
                Object.entries(sp.items || {}).forEach(([id, d]) => { if (d.quantity > 0) ids.add(id); }));
        }
        return [...ids];
    },

    // Refina con IA si está habilitada. Debounce + cache por firma (ítems cargados + modo)
    // para no llamar al backend en cada cambio de cantidad.
    _maybeAIGhosts() {
        // Estado de la IA: se consulta UNA vez y se cachea. Hasta confirmar, solo reglas.
        if (this._aiEnabled === undefined) {
            this._aiEnabled = false;
            if (typeof API !== 'undefined' && API.aiStatus) {
                API.aiStatus()
                    .then(s => { this._aiEnabled = !!(s && s.enabled); if (this._aiEnabled) this._maybeAIGhosts(); })
                    .catch(() => { });
            }
            return;
        }
        if (!this._aiEnabled) return;
        const loadedIds = this._loadedItemIds();
        if (loadedIds.length === 0) return; // nada cargado → sin sugerencias (igual que reglas)
        const sig = loadedIds.slice().sort().join(',') + '|' + State.generalParams.quotationType;
        if (sig === this._ghostAISig && this._ghostAICache) { this._paintGhosts(this._ghostAICache, true); return; }
        clearTimeout(this._ghostAITimer);
        this._ghostAITimer = setTimeout(() => this._fetchAIGhosts(sig, loadedIds), 1100);
    },

    async _fetchAIGhosts(sig, loadedIds) {
        try {
            const loadedSet = new Set(loadedIds);
            const rubro = (it) => DATABASE.categories[it.category]?.name || it.category;
            const loaded = loadedIds.map(id => DB.getItemById(id)).filter(Boolean)
                .map(it => ({ name: it.name, rubro: rubro(it) }));
            const candidates = DATABASE.items.filter(it => !loadedSet.has(it.id))
                .map(it => ({ id: it.id, name: it.name, rubro: rubro(it) }));
            if (candidates.length === 0) return;
            const resp = await API.aiGhosts({
                // La ETIQUETA, no la clave: a la IA hay que decirle "Equipamiento", no
                // "alquiler" (y "Energía", que la clave sí acierta). Ver DATABASE.quotationTypes.
                tipo: DB.typeLabel(State.generalParams.quotationType),
                superficie: State.generalParams.metraje,
                loaded, candidates
            });
            const list = ((resp && resp.suggestions) || [])
                .map(s => { const it = DB.getItemById(s.id); return it ? { it, from: rubro(it), motivo: s.motivo } : null; })
                .filter(Boolean)
                .filter(s => State.getItemQuantity(s.it.id) === 0);
            if (list.length === 0) return; // sin sugerencias válidas → quedan las reglas
            this._ghostAISig = sig;
            this._ghostAICache = list;
            // Pintar solo si la selección no cambió mientras esperábamos la respuesta.
            const nowSig = this._loadedItemIds().slice().sort().join(',') + '|' + State.generalParams.quotationType;
            if (nowSig === sig) this._paintGhosts(list, true);
        } catch (e) {
            // IA caída/sin key → nos quedamos con las reglas ya pintadas.
            if (/no configurada|NO_KEY|503/i.test(e.message || '')) this._aiEnabled = false;
        }
    },

    // Renderiza un grupo de items en un contenedor con lógica de favoritos
    _renderItemGroup(items, container, displayName) {
        // Label del picker (los items no cargados quedan debajo via CSS order)
        const label = document.createElement('div');
        label.className = 'rubro-add-label';
        label.textContent = `Agregar a ${displayName}`;
        container.appendChild(label);

        // Favoritos primero (orden), pero SIN ocultar el resto. Ocultar lo no-favorito
        // detrás de "Ver todos" hacía "desaparecer" items al cambiar de espacio en multi
        // (un ítem visible por estar cargado en un espacio quedaba escondido en otro,
        // donde no estaba cargado). El acordeón por rubro ya maneja el clutter → mostramos
        // TODO, con los favoritos arriba.
        const favorites = items.filter(i => Favorites.isFavorite(i));
        const rest = items.filter(i => !Favorites.isFavorite(i));
        [...favorites, ...rest].forEach(item => container.appendChild(this.createItemCard(item)));
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
        const isFav = Favorites.isFavorite(item);
        const favTitle = isFav ? 'Quitar de favoritos' : 'Marcar como favorito';
        const unit = this._normalizeUnit(item.unit);
        const basePrice = this._parsePrice(item.price);

        // Fila estilo receta: modo "agregar" (botón + Agregar) cuando no está cargado,
        // modo "renglón" (stepper + total + quitar) cuando sí. El swap lo hace el CSS
        // según la clase .selected (que mantiene updateAll), sin re-render.
        card.innerHTML = `
            <button class="item-fav-btn ${isFav ? 'is-fav' : ''}" data-action="fav" data-id="${item.id}" title="${favTitle}" aria-label="${favTitle}">${isFav ? '★' : '☆'}</button>
            <div class="item-info">
                <div class="item-header">
                    <span class="item-name">${item.name}</span>
                    ${(item.autoCalculate || DB.isAreaItem(item)) ? '<span class="auto-calc-badge" title="Cantidad calculada automáticamente por superficie">AUTO</span>' : ''}
                </div>
                <span class="item-price">$${Math.round(basePrice).toLocaleString('es-AR')}${unit ? ` <small>/ ${unit}</small>` : ''}</span>
            </div>
            <div class="item-controls">
                <button class="btn-add" data-action="add" data-id="${item.id}">+ Agregar</button>
                <div class="item-stepper">
                    <button class="btn-count" data-action="dec" data-id="${item.id}" aria-label="restar">−</button>
                    <input type="number" class="count-input" data-id="${item.id}" value="${currentQty}" min="0" step="1">
                    <button class="btn-count" data-action="inc" data-id="${item.id}" aria-label="sumar">+</button>
                    <span class="item-line-total">${this._fmt(basePrice * (currentQty || 0))}</span>
                    <button class="btn-del" data-action="del" data-id="${item.id}" title="Quitar" aria-label="Quitar">🗑</button>
                </div>
            </div>`;

        if (isSelected) card.classList.add('selected');
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

            // Botón "+ Agregar" (picker) y "+ Sumar" (fantasma) → carga con cantidad auto
            const addBtn = e.target.closest('.btn-add');
            if (addBtn) {
                State.toggleItem(addBtn.dataset.id);
                return;
            }

            // Botón quitar (renglón cargado)
            const delBtn = e.target.closest('.btn-del');
            if (delBtn) {
                State.toggleItem(delBtn.dataset.id, 0);
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

    // ── Texto de la propuesta (editable, va al PDF) ──────────────────
    // Bloque en el centro tras los ítems: textarea + botón "Generar con IA".
    // El texto vive en State.generalParams.proposalText (persiste con el borrador y
    // la cotización). exportPDF lo usa tal cual; si queda vacío, autogenera.
    _initProposalBlock() {
        const ta = document.getElementById('proposal-text');
        const btn = document.getElementById('btn-generate-proposal');
        if (ta && !ta._wired) {
            ta._wired = true;
            ta.addEventListener('input', () => {
                State.generalParams.proposalText = ta.value;
                this._updateProposalCount();
                if (typeof Autosave !== 'undefined') Autosave.schedule();
            });
        }
        if (btn && !btn._wired) {
            btn._wired = true;
            btn.addEventListener('click', () => this.generateProposal());
        }
        this._refreshProposalUI();
        this._reflectProposalAIState();
    },

    // Deshabilita el botón "Generar" si la IA no está disponible en el backend.
    _reflectProposalAIState() {
        const btn = document.getElementById('btn-generate-proposal');
        if (!btn || typeof API === 'undefined' || !API.aiStatus) return;
        API.aiStatus().then(s => {
            const on = !!(s && s.enabled);
            btn.disabled = !on;
            btn.title = on
                ? 'Generar el texto a partir de los ítems cargados'
                : 'IA no disponible (falta ANTHROPIC_API_KEY en el server)';
        }).catch(() => { });
    },

    _updateProposalCount() {
        const ta = document.getElementById('proposal-text');
        const el = document.getElementById('proposal-count');
        if (!ta || !el) return;
        const words = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
        el.textContent = `${words} ${words === 1 ? 'palabra' : 'palabras'}`;
    },

    // Sincroniza el textarea desde State (init, reset, restore de borrador/cotización).
    _refreshProposalUI() {
        const ta = document.getElementById('proposal-text');
        if (ta) ta.value = State.generalParams.proposalText || '';
        this._updateProposalCount();
    },

    // Sincroniza los botones de nivel de detalle con el State. Lo llaman el click,
    // el reset, la restauración de una cotización guardada y el draft recuperado.
    _refreshDetailUI() {
        const lvl = State.generalParams.detailLevel || 'minimo';
        document.querySelectorAll('.detail-btn-param').forEach(b => {
            b.classList.toggle('active', b.dataset.level === lvl);
        });
    },

    // Contexto para la IA: ítems CON cantidades + datos del proyecto. Lo comparten el
    // botón "Generar" y el autogenerado del PDF (misma fuente → consistencia).
    _buildSanataContext() {
        const p = State.generalParams;
        const qType = p.quotationType || 'stand';
        const isMulti = State.isMultiSpaceMode();
        const hd = DATABASE.heightMultipliers.find(h => h.id === p.heightType);
        const heightLabel = hd ? `${hd.name} (${hd.height})` : 'Estándar';
        const items = [];
        const collect = (entries) => entries.forEach(([id, d]) => {
            if (!d || d.quantity <= 0) return;
            const it = DB.getItemById(id);
            if (it) items.push({ nombre: it.name, cantidad: d.quantity, rubro: DATABASE.categories[it.category]?.name || it.category });
        });
        if (!isMulti) collect(Object.entries(State.selectedItems || {}));
        else (p.spaces || []).forEach(sp => collect(Object.entries(sp.items || {})));
        const ed = p.eventoData || {};
        const fechas = (typeof formatEventDateRange === 'function')
            ? formatEventDateRange(ed.eventStartDate, ed.eventEndDate)
            : '';
        return {
            cliente: document.getElementById('input-cliente')?.value || p.cliente || '',
            proyecto: document.getElementById('input-proyecto')?.value || '',
            evento: document.getElementById('input-evento')?.value || p.evento || '',
            fechas: fechas || '',
            lugar: ed.venue || '',
            tipo: qType,
            superficie: qType === 'stand' ? p.metraje : undefined,
            altura: qType === 'stand' ? heightLabel : undefined,
            tipoStand: qType === 'stand' && p.standType ? (p.standType.charAt(0).toUpperCase() + p.standType.slice(1)) : undefined,
            espacios: isMulti ? (p.spaces || []).map(s => s.name) : undefined,
            items
        };
    },

    async generateProposal() {
        const ta = document.getElementById('proposal-text');
        const btn = document.getElementById('btn-generate-proposal');
        if (!ta) return;
        if (typeof API === 'undefined' || !API.isConnected) {
            if (typeof Toast !== 'undefined') Toast.error('Sin conexión con el servidor.');
            return;
        }
        const ctx = this._buildSanataContext();
        if (!ctx.items.length) {
            if (typeof Toast !== 'undefined') Toast.info('Cargá algún ítem primero para que el texto tenga de qué hablar.');
            return;
        }
        if (ta.value.trim()) {
            const ok = await Confirm.show({
                title: 'Regenerar texto',
                message: 'Esto reemplaza el texto actual por uno nuevo de la IA. ¿Continuar?',
                confirmText: 'Sí, regenerar',
                cancelText: 'Cancelar'
            });
            if (!ok) return;
        }
        const label = btn ? btn.querySelector('.label') : null;
        const prevLabel = label ? label.textContent : '';
        if (btn) btn.classList.add('loading');
        if (label) label.textContent = 'Generando…';
        try {
            const resp = await API.aiSanata(ctx);
            const text = ((resp && resp.text) || '').trim();
            if (!text) throw new Error('La IA no devolvió texto');
            ta.value = text;
            State.generalParams.proposalText = text;
            this._updateProposalCount();
            if (typeof Autosave !== 'undefined') Autosave.schedule();
            if (typeof Toast !== 'undefined') Toast.success('Texto generado — editalo a gusto');
        } catch (e) {
            console.error('Generar propuesta:', e);
            if (typeof Toast !== 'undefined') Toast.error(/503|no configurada/i.test(e.message || '') ? 'IA no disponible en el server.' : 'No se pudo generar el texto.');
        } finally {
            if (btn) btn.classList.remove('loading');
            if (label) label.textContent = prevLabel || 'Generar con IA';
        }
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

        // Update card selection state + total por renglón
        document.querySelectorAll('.item-card').forEach(card => {
            const id = card.dataset.itemId;
            const qty = State.getItemQuantity(id);
            const isSelected = qty > 0;
            card.classList.toggle('selected', isSelected);
            const item = DB.getItemById(id);
            const totalEl = card.querySelector('.item-line-total');
            if (item && totalEl) totalEl.textContent = this._fmt(this._parsePrice(item.price) * qty);
        });

        // Mantener visibles items no-favoritos seleccionados aunque el grupo esté colapsado
        document.querySelectorAll('.item-card.non-favorite').forEach(card => {
            const id = card.dataset.itemId;
            const isSelected = State.getItemQuantity(id) > 0;
            card.classList.toggle('force-visible', isSelected);
        });

        this._renderGhosts();
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

        // Pill flotante de atajos (siempre visible en desktop): abre el mismo cheatsheet
        document.getElementById('btn-shortcuts-fab')?.addEventListener('click', () => {
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
    // Navegación:  Ctrl/Cmd+B ("B" de Buscar) y "/" → focus search · Esc → close/blur
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

            // Ctrl/Cmd+B ("B" de Buscar): focus al search
            if (ctrl && key === 'b') {
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
                const propModal = document.getElementById('propuestas-modal');
                if (propModal && typeof PropuestaUI !== 'undefined') {
                    PropuestaUI.closeModal();
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
                            <dt><kbd>${mod}</kbd> + <kbd>B</kbd></dt><dd>Buscar items</dd>
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

    // Helper: parse un precio numérico de forma consistente (delega en Pricing)
    _parsePrice(price) {
        return Pricing.parsePrice(price);
    },

    // Helper: formato de moneda en ARS
    _fmt(n) {
        const sign = n < 0 ? '-' : '';
        return `${sign}$${Math.round(Math.abs(n)).toLocaleString('es-AR')}`;
    },

    // Normaliza la unidad para mostrar: oculta "unidad/set/proyecto" (no aportan),
    // muestra m² con superíndice, deja pasar el resto tal cual.
    _normalizeUnit(u) {
        if (!u) return '';
        const norm = String(u).toLowerCase();
        if (norm === 'unidad' || norm === 'set' || norm === 'proyecto') return '';
        if (norm === 'm2' || norm === 'm²') return 'm²';
        return u;
    },

    // Formato canónico de línea de ítem, compartido entre UI y PDF.
    //  · qty === 1                          → "Cesto Papelero"
    //  · qty > 1 + unidad significativa     → "15 m² — Vinilo impreso y colocado"
    //  · qty > 1 + unidad genérica o vacía  → "15× Taburete JB"
    _formatItemLine(item) {
        const qty = Number(item.quantity) || 1;
        const unitLabel = this._normalizeUnit(item.unit);
        if (qty === 1) return item.name;
        if (unitLabel) return `${qty} ${unitLabel} — ${item.name}`;
        return `${qty}× ${item.name}`;
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
        // Factor de ajuste aditivo: modificador + fee, ambos sobre el subtotal (no encadenados)
        const adjFactor = 1 + (params.modifierPercentage / 100) + (params.includeFee ? params.feePercentage : 0);

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

        // Cálculo centralizado en Pricing.compute (fuente única de la fórmula).
        const pricingCtx = Pricing.contextFromLiveParams(params, heightAffectedCategories);
        const calc = Pricing.compute(getAllItemsFlat(), pricingCtx);
        const {
            subBase, subConAltura, subConModifier, subConFee,
            byCategory, aporteAltura, aporteModifier, aporteFee,
        } = calc;

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
            const typeMeta = DATABASE.quotationTypes[qType] || DATABASE.quotationTypes.expo;
            const typeLabel = `${typeMeta.icon} ${typeMeta.label}`;
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
                                <span class="summary-item-name">${this._formatItemLine(item)}</span>
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

                        // Monto mostrado: altura + ajuste (modificador + fee sobre el subtotal)
                        const shownTotal = Math.round(lineBase * heightMult * adjFactor);

                        summaryHTML += `
                            <div class="summary-item">
                                <span class="summary-item-name">${this._formatItemLine({ ...item, quantity: data.quantity })}</span>
                                <span class="summary-item-total">${this._fmt(shownTotal)}</span>
                            </div>`;
                    });
                }

                // Subtotal del espacio: altura + ajuste (modificador + fee sobre el subtotal)
                const spaceSubtotal = Math.round(spaceConAltura * adjFactor);

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
        const tax = Math.round(subtotalFinal * 0.21);
        const total = subtotalFinal + tax;

        subtotalEl.textContent = `$${Math.round(subtotalFinal).toLocaleString('es-AR')}`;
        taxEl.textContent = `$${Math.round(tax).toLocaleString('es-AR')}`;
        totalEl.textContent = `$${Math.round(total).toLocaleString('es-AR')}`;

        // Mantener el acordeón del centro sincronizado (conteo/subtotal/estado por rubro)
        this._refreshAccordionMeta();

        // Medidor de calor: cantidad de ítems cargados en la cotización actual
        const heatCount = isMultiSpace
            ? (params.spaces || []).reduce((n, s) => n + Object.values(s.items).filter(d => d.quantity > 0).length, 0)
            : Object.values(State.selectedItems).filter(d => d.quantity > 0).length;
        this._updateHeat(heatCount);
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
                // Fuente única del multiplicador: DATABASE.heightMultipliers (no el
                // data-multiplier del HTML, que quedaba duplicado y podía divergir
                // del snapshot guardado). El data-multiplier queda solo informativo.
                const hm = DATABASE.heightMultipliers.find(h => h.id === btn.dataset.height);
                State.updateGeneralParam('heightMultiplier', hm ? hm.multiplier : 1);
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

        // Texto de la propuesta: sincronizar el textarea con el State (reset o restore)
        this._refreshProposalUI();

        // Nivel de detalle: igual que arriba, se LEE del State en vez de hardcodear el
        // default. Esta función corre después de restaurar un draft o una plantilla, así
        // que fijar 'minimo' acá desincronizaría los botones de lo que se restauró.
        this._refreshDetailUI();
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
        const metrajeInput = document.getElementById('input-metraje');

        const clienteVal = (clienteInput?.value || '').trim();

        // Cliente es el ÚNICO dato obligatorio. Proyecto y Evento quedan opcionales:
        // la cotización se asigna a un proyecto (y el proyecto a un evento) más tarde
        // en el CRM de LOBBY, no al momento de cotizar.
        if (!clienteVal) {
            errors.push({ field: clienteInput, msg: 'Falta el Cliente' });
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
        const pricingCtx = Pricing.contextFromLiveParams(params, heightAffected);

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
            const loadedUnit = Pricing.loadedUnitPrice(base, item.category, pricingCtx);
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

        const params = State.generalParams;
        const qType = params.quotationType || 'stand';
        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 14;
        const contentWidth = pageWidth - (margin * 2);

        // ── Datos render-independientes (se calculan UNA vez; renderDoc se redibuja
        // a varias escalas para el achique automático, pero esto no cambia). ──
        const today = new Date(); // fecha de emisión — usada en header y filename
        const cliente = document.getElementById('input-cliente')?.value || 'No especificado';
        const proyecto = (document.getElementById('input-proyecto')?.value || '').trim();
        const evento = (document.getElementById('input-evento')?.value || '').trim(); // opcional: vacío ⇒ no se dibuja
        const eventoData = State.generalParams.eventoData;
        const fechaEventoStr = formatEventDateRange(eventoData?.eventStartDate, eventoData?.eventEndDate);
        const venue = eventoData?.venue || '';
        const tipoStand = params.standType.charAt(0).toUpperCase() + params.standType.slice(1);
        const isMultiSpace = State.isMultiSpaceMode();

        // Número de cotización: SOLO desde la API (contador atómico en la DB).
        // Sin fallback localStorage — generaba números fantasma que colisionaban
        // (ej. COT-2026-0008 en PDF pero no en DB).
        //
        // ⚠️ Reserva diferida en modo preview: el contador es monótono (no se puede
        // "devolver" un número), así que cancelar el preview dejaba huecos en la
        // secuencia. En preview NO se reserva todavía — el PDF se dibuja con un
        // placeholder y el número real se pide RECIÉN al confirmar "Descargar y
        // guardar" (ver finalize() más abajo). En export directo el click ES la
        // confirmación, así que se reserva acá.
        let cotNumber;
        if (options.preview) {
            cotNumber = `COT-${today.getFullYear()}-XXXX`; // placeholder visible en el preview
        } else {
            try {
                if (typeof API === 'undefined' || !API.isConnected) {
                    throw new Error('API no conectada');
                }
                const numData = await API.getNextQuotationNumber();
                if (!numData?.formatted) throw new Error('respuesta sin número');
                cotNumber = numData.formatted;
                if (typeof State !== 'undefined') State.generalParams.cotNumber = cotNumber; // la propuesta reusa este Ref (no quema número propio)
                console.log(`🔢 Número de cotización reservado: ${cotNumber}`);
            } catch (e) {
                console.error('❌ No se pudo reservar número de cotización:', e.message);
                if (typeof Toast !== 'undefined') {
                    Toast.error('No se pudo conectar con el servidor para numerar la cotización. Revisá la conexión e intentá de nuevo.');
                }
                return; // aborta la exportación — no se genera PDF sin número válido
            }
        }

        // Colores MEPEX (dark theme)
        const cyanColor = [0, 169, 193];   // #00A9C1 — unificado con --color-primary de la app
        const orangeColor = [242, 141, 21];
        const pageBg = [26, 26, 26];       // #1a1a1a
        const surfaceBg = [35, 35, 35];     // #232323
        const white = [255, 255, 255];
        const lightGray = [200, 200, 200];
        const mediumGray = [140, 140, 140];

        // Reserva para el footer fijo (la fórmula keep-with-next compara contra esto).
        // Los helpers de página (drawPageBg/addDarkPage/ensureSpace) viven DENTRO de
        // renderDoc porque dependen del `doc` y el `yPos` de cada pasada de render.
        const bottomSafe = pageHeight - 39;

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

        // ── Load logo images (resolución pensada para impresión a 300dpi) ──
        // logo_full: se muestra a 50×7mm → ~590×83px a 300dpi (cap 600×100)
        // mepex_iso: se muestra a 10×10mm → ~118×118px a 300dpi (cap 240×240)
        // Los assets fuente ya son alta resolución; el cap solo evita un PNG enorme embebido.
        const logoFullData = await loadImageAsDataURL('assets/logo_full.png', 600, 100);
        const isoData = await loadImageAsDataURL('assets/mepex_iso.png', 240, 240);

        // Sanata IA: se pide UNA sola vez (cacheada) aunque el cuerpo se redibuje a
        // varias escalas para el achique automático.
        let _sanataText = '';
        let _sanataDone = false;

        // ── renderDoc(s): dibuja TODO el documento a una escala vertical `s` (1 = normal).
        // G(n)=n*s comprime SOLO los avances/paddings del flujo del cuerpo (datos→rubros).
        // Header, footer y caja de total quedan a tamaño fijo. Con s=1, G es identidad →
        // el PDF es idéntico al de siempre (sin regresión). Devuelve cuántas páginas ocupó. ──
        const renderDoc = async (s) => {
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const G = (n) => n * s;
            let yPos;

            const drawPageBg = () => {
                doc.setFillColor(...pageBg);
                doc.rect(0, 0, pageWidth, pageHeight, 'F');
            };
            const addDarkPage = () => {
                doc.addPage();
                drawPageBg();
                doc.setFillColor(...cyanColor);
                doc.rect(0, 0, pageWidth, 2, 'F');
            };
            const ensureSpace = (needed) => {
                if (yPos + needed > bottomSafe) { addDarkPage(); yPos = 25; }
            };

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

        // Tipo de cotización badge (top-right) — etiqueta desde DATABASE.quotationTypes
        const typeLabel = DB.typeLabelUpper(qType) || 'STAND';
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...white);
        const badgeW = doc.getTextWidth(typeLabel) + 12;
        doc.setFillColor(...cyanColor);
        doc.roundedRect(pageWidth - margin - badgeW, 10, badgeW, 8, 2, 2, 'F');
        doc.text(typeLabel, pageWidth - margin - badgeW + 6, 15.5);

        // Fecha de emisión (debajo del badge)
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
        // Arranca la "zona de flujo" (yPos se declaró con let al tope de renderDoc).
        yPos = 35;

        // Columna izquierda: cliente, proyecto (si existe), evento
        // Columna derecha: superficie/tipo/altura, fecha evento (si existe), lugar (si existe)
        let leftRows = 1; // cliente siempre
        if (proyecto) leftRows++;
        if (evento) leftRows++;
        let rightRows = 0;
        if (qType === 'stand') rightRows += 2; // superficie + tipo/altura
        else rightRows += 1; // espacios
        if (fechaEventoStr) rightRows++;
        if (venue) rightRows++;

        const dataRows = Math.max(leftRows, rightRows);
        const boxHeight = G(10 + (dataRows * 6) + 4); // título + filas + padding (escalado)

        doc.setFillColor(...surfaceBg);
        doc.roundedRect(margin, yPos, contentWidth, boxHeight, 3, 3, 'F');

        // Card border accent
        doc.setDrawColor(50, 50, 50);
        doc.setLineWidth(0.3);
        doc.roundedRect(margin, yPos, contentWidth, boxHeight, 3, 3, 'S');

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...cyanColor);
        doc.text('D A T O S   D E L   P R O Y E C T O', margin + 5, yPos + G(6));

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...lightGray);

        // Columna izquierda
        let leftY = yPos + G(13);
        doc.text(`Cliente: ${cliente}`, margin + 5, leftY);
        if (proyecto) {
            leftY += G(6);
            doc.text(`Proyecto: ${proyecto}`, margin + 5, leftY);
        }
        if (evento) {
            leftY += G(6);
            doc.text(`Evento: ${evento}`, margin + 5, leftY);
        }

        // Columna derecha
        let rightY = yPos + G(13);
        if (qType === 'stand') {
            doc.text(`Superficie: ${params.metraje}m²`, margin + 90, rightY);
            rightY += G(6);
            doc.text(`Tipo: ${tipoStand}  |  Altura: ${heightLabel}`, margin + 90, rightY);
        } else {
            doc.text(`Espacios: ${params.spaces.length}`, margin + 90, rightY);
        }
        if (fechaEventoStr) {
            rightY += G(6);
            doc.text(`Fecha evento: ${fechaEventoStr}`, margin + 90, rightY);
        }
        if (venue) {
            rightY += G(6);
            doc.text(`Lugar: ${venue}`, margin + 90, rightY);
        }

        yPos += boxHeight + G(8);

        // ========================================
        // TÍTULO DE COTIZACIÓN
        // ========================================
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...white);
        doc.text('P R O P U E S T A   D E   C O T I Z A C I Ó N', pageWidth / 2, yPos, { align: 'center' });

        yPos += G(10);

        // ── Sanata comercial (IA, opcional) ──
        // Si la IA está habilitada en el backend, genera un párrafo comercial y lo
        // dibuja entre el título y los rubros. Si falla o está off, se omite sin romper.
        if (!_sanataDone) {
            _sanataDone = true; // resolver el texto UNA sola vez, no en cada re-render por escala
            const edited = (State.generalParams.proposalText || '').trim();
            if (edited) {
                _sanataText = edited; // el dueño escribió/generó el texto en el cotizador → se respeta tal cual
            } else if (typeof API !== 'undefined' && API.isConnected) {
                // Vacío → autogenerar con el MISMO contexto que el botón "Generar con IA"
                try {
                    const sanataResp = await API.aiSanata(this._buildSanataContext());
                    _sanataText = ((sanataResp && sanataResp.text) || '').trim();
                } catch (e) {
                    console.warn('Sanata IA omitida:', e.message);
                }
            }
        }
        if (_sanataText) {
            const sanataLines = doc.splitTextToSize(_sanataText, contentWidth - 6);
            ensureSpace(G(8 + sanataLines.length * 4.6));
            doc.setFillColor(...cyanColor);
            doc.rect(margin, yPos - G(3), 1.2, sanataLines.length * G(4.6) + G(4), 'F');
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8.5);
            doc.setTextColor(...lightGray);
            sanataLines.forEach(line => { doc.text(line, margin + 5, yPos); yPos += G(4.6); });
            yPos += G(5);
            doc.setFont('helvetica', 'normal');
        }

        // ========================================
        // Mapa de iconos de texto para PDF
        // ========================================
        const categoryIcons = {
            'flooring': '[PIS]',
            'infrastructure': '[INF]',
            'lighting': '[ILU]',
            'energy': '[ENE]',
            'equipment': '[EQP]',
            'marketing': '[MKT]',
            'moreservices': '[SER]'
        };

        const heightAffectedCategories = DATABASE.heightAffectedCategories || ['infrastructure', 'lighting'];
        const pricingCtx = Pricing.contextFromLiveParams(params, heightAffectedCategories);

        let adjustedSubtotal = 0;

        // Helper: parse price (delega en Pricing para mantener una sola fuente)
        const parsePrice = (price) => Pricing.parsePrice(price);

        // Helper: precio cargado (Base × Altura × Modificador × Fee) vía Pricing.
        const getLoadedPrice = (item, price) => Pricing.loadedUnitPrice(price, item.category, pricingCtx);

        // Atajo local al helper compartido (definido en Render._formatItemLine)
        // para que PDF y UI usen exactamente el mismo formato de línea de ítem.
        const formatItemLine = (item) => '• ' + this._formatItemLine(item);

        // Nivel de detalle (solo aplica a la rama multi-espacio; Stand nunca discrimina).
        // Se pregunta al State, que es la fuente única — ver State.detailLevel().
        const showItemPrices = State.showsItemPrices();
        const showSpaceSubtotals = State.showsSpaceSubtotals();

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

                    ensureSpace(G(26)); // header del rubro + primeras líneas, juntos

                    // Header del rubro
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(...cyanColor);
                    doc.text(cat.name.toUpperCase(), margin, yPos);
                    doc.setDrawColor(60, 60, 60);
                    doc.setLineWidth(0.3);
                    doc.line(margin, yPos + G(2), pageWidth - margin, yPos + G(2));
                    yPos += G(7);

                    // Stand = proyecto integral. En el PDF no enumeramos precios
                    // individuales: Infraestructura sale como línea OCTEXA y los demás
                    // rubros listan piezas (qty - nombre) sin monto por ítem.
                    if (isInfrastructure) {
                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(...lightGray);
                        doc.text(`Superficie: ${params.metraje}m² — Altura: ${heightLabel}`, margin + 5, yPos);
                        yPos += G(5);
                        doc.setFont('helvetica', 'italic');
                        doc.setTextColor(...mediumGray);
                        doc.text('Construcción modular con sistema OCTEXA', margin + 5, yPos);
                        yPos += G(6);
                    } else {
                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(...lightGray);
                        groupedItems[cat.id].forEach(item => {
                            ensureSpace(G(10));
                            doc.text(`${item.quantity} - ${item.name}`, margin + 5, yPos);
                            yPos += G(5);
                        });
                    }

                    // catTotal se acumula igual en todos los rubros para que el
                    // subtotal/grand total quede correcto, aunque no se imprima.
                    groupedItems[cat.id].forEach(item => {
                        catTotal += item.price * item.quantity;
                    });

                    subtotalLoaded += catTotal;

                    yPos += G(9); // más aire entre rubros
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
                ensureSpace(G(30)); // cabecera del espacio + primer rubro + primer ítem

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
                yPos += G(13);
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
                        ensureSpace(G(18)); // header del rubro + primer ítem, juntos

                        const catIcon = categoryIcons[cat.id] || '>>';
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(...cyanColor);
                        doc.text(cat.name.toUpperCase(), margin + 3, yPos);
                        doc.setDrawColor(60, 60, 60);
                        doc.setLineWidth(0.2);
                        doc.line(margin + 3, yPos + G(2), pageWidth - margin, yPos + G(2));
                        yPos += G(6);

                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(...lightGray);

                        spaceGrouped[cat.id].forEach(item => {
                            ensureSpace(G(10));
                            const itemTotal = item.price * item.quantity;
                            // El monto se ACUMULA siempre, se IMPRIMA o no: bajar el nivel de
                            // detalle cambia lo que se muestra, nunca lo que se cobra.
                            spaceTotal += itemTotal;

                            doc.setTextColor(...lightGray);
                            doc.text(formatItemLine(item), margin + 6, yPos);
                            if (showItemPrices) {
                                doc.setTextColor(...white);
                                doc.text(`$${Math.round(itemTotal).toLocaleString('es-AR')}`, pageWidth - margin, yPos, { align: 'right' });
                            }
                            yPos += G(5);
                        });

                        yPos += G(2);
                    }
                });

                // Subtotal del espacio (en nivel Mínimo no va: un solo número, al final)
                if (showSpaceSubtotals) {
                    ensureSpace(G(14)); // línea de subtotal del espacio
                    doc.setDrawColor(60, 60, 60);
                    doc.setLineWidth(0.3);
                    doc.line(margin + 3, yPos, pageWidth - margin, yPos);
                    yPos += G(4);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(...mediumGray);
                    doc.text(`Subtotal ${space.name}`, margin + 4, yPos);
                    doc.setTextColor(...cyanColor);
                    doc.text(`$${Math.round(spaceTotal).toLocaleString('es-AR')}`, pageWidth - margin, yPos, { align: 'right' });
                    yPos += G(8);
                } else {
                    yPos += G(4); // aire entre espacios, sin la línea de subtotal
                }

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
        yPos += G(5);

        ensureSpace(26); // caja de total (RESERVA FIJA, sin escalar) — evita hoja huérfana del footer

        // Caja de total (con desglose)
        doc.setFillColor(...cyanColor);
        doc.roundedRect(margin, yPos, contentWidth, 22, 3, 3, 'F');

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
        doc.text(breakdownText, pageWidth - margin - 8, yPos + 15, { align: 'right' });

        // ========================================
        // PIE DE PÁGINA
        // ========================================
        const footerY = pageHeight - 30;

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

            return { doc, pages: doc.getNumberOfPages(), scale: s };
        };

        // ── Achique automático: probamos de mayor a menor escala y nos quedamos con
        // la MÁS GRANDE que entre en una sola hoja. Si ni la más comprimida entra
        // (cotización genuinamente larga), usamos s=1 y dejamos las hojas necesarias. ──
        const FIT_LADDER = [1, 0.94, 0.88, 0.82, 0.76, 0.72];
        const _fitMemo = {};
        const renderAt = async (s) => (_fitMemo[s] || (_fitMemo[s] = await renderDoc(s)));
        let chosen = null;
        for (const s of FIT_LADDER) {
            const attempt = await renderAt(s);
            if (attempt.pages <= 1) { chosen = attempt; break; }
        }
        if (!chosen) chosen = await renderAt(1);
        this._lastPdfFit = { scale: chosen.scale, pages: chosen.pages };
        if (chosen.scale !== 1) console.log(`📄 PDF comprimido a escala ${chosen.scale} para entrar en 1 hoja`);
        const doc = chosen.doc;

        // ========================================
        // GUARDAR PDF
        // ========================================
        const safeCliente = (cliente || 'cliente').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
        const fileNameFor = (num) => `MEPEX_${num}_${safeCliente}_${today.toISOString().split('T')[0]}.pdf`;

        // Modo preview: mostrar el PDF (con número placeholder) en un modal. El número
        // real se reserva RECIÉN al confirmar "Descargar y guardar" → cancelar el preview
        // NO quema un número de la secuencia. finalize() reserva el número, redibuja a la
        // MISMA escala elegida (solo cambia el "Ref:" del footer) y devuelve el PDF final.
        if (options.preview) {
            let previewBlob = null;
            try {
                previewBlob = doc.output('blob');
            } catch (e) {
                console.warn('⚠️ No se pudo generar el blob del preview:', e);
            }
            if (!previewBlob) {
                if (typeof Toast !== 'undefined') Toast.error('No se pudo generar la vista previa del PDF.');
                return;
            }
            const chosenScale = chosen.scale;
            const finalize = async () => {
                let realNumber;
                try {
                    if (typeof API === 'undefined' || !API.isConnected) {
                        throw new Error('API no conectada');
                    }
                    const numData = await API.getNextQuotationNumber();
                    if (!numData?.formatted) throw new Error('respuesta sin número');
                    realNumber = numData.formatted;
                    console.log(`🔢 Número de cotización reservado: ${realNumber}`);
                } catch (e) {
                    console.error('❌ No se pudo reservar número de cotización:', e.message);
                    return null; // el modal avisa y deja reintentar (no se quemó número)
                }
                cotNumber = realNumber; // renderDoc dibuja el "Ref:" con el número real
                if (typeof State !== 'undefined') State.generalParams.cotNumber = realNumber; // la propuesta reusa este Ref (no quema número propio)
                const finalDoc = (await renderDoc(chosenScale)).doc;
                let finalBlob = null;
                try {
                    finalBlob = finalDoc.output('blob');
                } catch (e) {
                    console.warn('⚠️ No se pudo generar el blob del PDF (se guardará igualmente):', e);
                }
                return { doc: finalDoc, blob: finalBlob, cotNumber: realNumber, fileName: fileNameFor(realNumber) };
            };
            this._showPDFPreview(previewBlob, finalize);
            return;
        }

        // Export directo (sin preview): el número ya se reservó arriba (el click es la confirmación).
        let pdfBlob = null;
        try {
            pdfBlob = doc.output('blob');
        } catch (e) {
            console.warn('⚠️ No se pudo generar el blob del PDF (se guardará igualmente):', e);
        }
        doc.save(fileNameFor(cotNumber));

        // Guardar cotización (API + localStorage) + subir PDF a Supabase en background
        if (typeof QuotationStorage !== 'undefined') {
            QuotationStorage.saveQuotation(cotNumber, pdfBlob).catch(e =>
                console.error('Error guardando cotización:', e)
            );
        }
    },

    // Modal de vista previa del PDF. El número de cotización se reserva RECIÉN cuando
    // el user confirma "Descargar y guardar" (vía finalize()), NO al abrir el preview:
    // así cancelar/cerrar/Esc no consume un número de la secuencia. finalize() devuelve
    // { doc, blob, cotNumber, fileName } ya con el número real, o null si la API falló.
    _showPDFPreview(previewBlob, finalize) {
        const url = URL.createObjectURL(previewBlob);

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
                            <div class="pdf-preview-cot">Vista previa</div>
                            <div class="pdf-preview-meta">El número se asigna al descargar</div>
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
            document.removeEventListener('keydown', onKey);
            try { URL.revokeObjectURL(url); } catch { /* silent */ }
            overlay.remove();
        };

        // Esc cierra (no reserva número)
        const onKey = (e) => {
            if (e.key === 'Escape') cleanup();
        };
        document.addEventListener('keydown', onKey);

        overlay.querySelector('.pdf-preview-close').addEventListener('click', cleanup);
        overlay.querySelector('.pdf-preview-cancel').addEventListener('click', cleanup);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) cleanup();
        });

        // Descargar y guardar: acá (y SOLO acá) se reserva el número real y se re-renderiza
        // el PDF. Si la API falla, NO se cierra el modal y se deja reintentar (no se quemó nada).
        const downloadBtn = overlay.querySelector('.pdf-preview-download');
        let busy = false;
        downloadBtn.addEventListener('click', async () => {
            if (busy) return; // evita doble-reserva por doble click
            busy = true;
            const prevHTML = downloadBtn.innerHTML;
            downloadBtn.disabled = true;
            downloadBtn.innerHTML = '<span class="mp-spinner"></span>Numerando...';
            const reEnable = () => {
                downloadBtn.disabled = false;
                downloadBtn.innerHTML = prevHTML;
                busy = false;
            };
            try {
                const result = await finalize();
                if (!result) {
                    if (typeof Toast !== 'undefined') Toast.error('No se pudo numerar la cotización (servidor). Revisá la conexión e intentá de nuevo.');
                    reEnable();
                    return;
                }
                result.doc.save(result.fileName);
                if (typeof QuotationStorage !== 'undefined') {
                    QuotationStorage.saveQuotation(result.cotNumber, result.blob).catch(e =>
                        console.error('Error guardando cotización:', e)
                    );
                }
                if (typeof Toast !== 'undefined') Toast.success(`PDF descargado y guardado — ${result.cotNumber}`);
                cleanup();
            } catch (e) {
                console.error('❌ Error descargando PDF:', e);
                if (typeof Toast !== 'undefined') Toast.error('No se pudo descargar el PDF');
                reEnable();
            }
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
