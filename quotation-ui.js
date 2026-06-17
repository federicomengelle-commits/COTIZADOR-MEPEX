// =============================================
// QUOTATION UI — Modal para cotizaciones guardadas
// =============================================

const QuotationUI = {

    async openModal() {
        // Remover modal anterior si existe
        this.closeModal();

        // Crear modal con loading
        const overlay = document.createElement('div');
        overlay.id = 'quotation-modal';
        overlay.className = 'quot-modal-overlay';
        overlay.innerHTML = `
            <div class="quot-modal">
                <div class="quot-modal-header">
                    <h2>Cotizaciones Guardadas</h2>
                    <button class="quot-modal-close" id="quot-modal-close">&times;</button>
                </div>
                <div class="quot-modal-body">
                    <div class="quot-modal-loading">
                        <span class="mp-spinner mp-spinner-lg"></span>
                        <span>Cargando cotizaciones...</span>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Event listeners del modal
        overlay.querySelector('#quot-modal-close').addEventListener('click', () => this.closeModal());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.closeModal();
        });

        // Cargar cotizaciones (API-first)
        try {
            const quotations = await QuotationStorage.getQuotations();
            const sorted = Array.isArray(quotations)
                ? quotations.sort((a, b) => {
                    const dateA = a.savedAt || a.updatedAt || a.createdAt || '';
                    const dateB = b.savedAt || b.updatedAt || b.createdAt || '';
                    return new Date(dateB) - new Date(dateA);
                })
                : [];

            this._renderQuotationList(overlay, sorted);
        } catch (e) {
            console.error('❌ Error cargando cotizaciones:', e);
            const body = overlay.querySelector('.quot-modal-body');
            if (body) {
                body.innerHTML = '<div class="quot-modal-empty">No se pudieron cargar las cotizaciones</div>';
            }
        }
    },

    _renderQuotationList(overlay, quotations) {
        const body = overlay.querySelector('.quot-modal-body');
        if (!body) return;

        if (quotations.length === 0) {
            body.innerHTML = '<div class="quot-modal-empty">No hay cotizaciones guardadas aún</div>';
            return;
        }

        // Formateador de moneda ARS reusado por todas las filas.
        const fmtCurrency = (n) => {
            const v = Number(n) || 0;
            return `$${Math.round(v).toLocaleString('es-AR')}`;
        };

        // Labels para los estados conocidos. Si llega un estado nuevo, se muestra tal cual.
        const STATUS_LABELS = {
            borrador: 'Borrador',
            aprobada: 'Aprobada',
            rechazada: 'Rechazada',
            enviada: 'Enviada'
        };

        let listHTML = '';
        quotations.forEach(q => {
            const dateSource = q.savedAt || q.date || q.updatedAt || q.createdAt;
            const dateStr = dateSource
                ? new Date(dateSource).toLocaleDateString('es-AR', {
                    day: '2-digit', month: '2-digit', year: 'numeric'
                })
                : '—';
            const typeLabel = (q.type || 'stand').toUpperCase();
            const clientName = q.params?.client?.name || '—';
            const eventName = q.params?.event?.name || '—';
            const displayName = q.cotNumber || q.name || '—';

            // Total: viene de la API como `q.total`, o de localStorage como `q.totals.total`.
            const total = q.total ?? q.totals?.total ?? 0;
            const totalStr = fmtCurrency(total);

            // Estado: viene solo cuando se carga desde la API. localStorage no lo persiste.
            const statusKey = (q.status || '').toLowerCase();
            const statusLabel = STATUS_LABELS[statusKey] || q.status || '';
            const statusBadge = statusLabel
                ? `<span class="quot-row-status quot-status-${statusKey || 'unknown'}">${statusLabel}</span>`
                : '';

            listHTML += `
                <div class="quot-row">
                    <div class="quot-row-info">
                        <span class="quot-row-number">${displayName}</span>
                        <span class="quot-row-badge">${typeLabel}</span>
                        ${statusBadge}
                        <span class="quot-row-client">${clientName}</span>
                        <span class="quot-row-separator">·</span>
                        <span class="quot-row-event">${eventName}</span>
                        <span class="quot-row-total">${totalStr}</span>
                        <span class="quot-row-date">${dateStr}</span>
                    </div>
                    <div class="quot-row-actions">
                        ${q.pdfUrl ? `<button class="quot-btn-view" data-url="${q.pdfUrl}" title="Ver PDF">PDF</button>` : ''}
                        <button class="quot-btn-load" data-id="${q.id}" title="Cargar la cotización tal cual">Cargar</button>
                        <button class="quot-btn-duplicate" data-id="${q.id}" title="Duplicar (misma info, número nuevo al exportar)">Duplicar</button>
                        <button class="quot-btn-template" data-id="${q.id}" title="Cargar sin datos de cliente">Usar como base</button>
                        <button class="quot-btn-delete" data-id="${q.id}" data-name="${displayName}" title="Eliminar">✕</button>
                    </div>
                </div>
            `;
        });

        body.innerHTML = listHTML;

        body.querySelectorAll('.quot-btn-load').forEach(btn => {
            btn.addEventListener('click', () => this.loadQuotation(btn.dataset.id));
        });
        body.querySelectorAll('.quot-btn-duplicate').forEach(btn => {
            btn.addEventListener('click', () => this.duplicateQuotation(btn.dataset.id));
        });
        body.querySelectorAll('.quot-btn-template').forEach(btn => {
            btn.addEventListener('click', () => this.loadAsTemplate(btn.dataset.id));
        });
        body.querySelectorAll('.quot-btn-view').forEach(btn => {
            btn.addEventListener('click', () => window.open(btn.dataset.url, '_blank'));
        });
        body.querySelectorAll('.quot-btn-delete').forEach(btn => {
            btn.addEventListener('click', () => this.deleteQuotation(btn.dataset.id, btn.dataset.name));
        });
    },

    closeModal() {
        const modal = document.getElementById('quotation-modal');
        if (modal) modal.remove();
    },

    async loadQuotation(id) {
        try {
            const q = await QuotationStorage.getQuotationById(id);
            if (!q) return;
            // Si viene de Supabase con fullState, usar ese objeto para restaurar
            const stateObj = q.fullState || q;
            this._restoreState(stateObj, false);
            this.closeModal();
            if (typeof Toast !== 'undefined') Toast.success(`Cotización ${stateObj.cotNumber || ''} cargada`);
        } catch (e) {
            console.error('❌ Error cargando cotización:', e);
            if (typeof Toast !== 'undefined') Toast.error('No se pudo cargar la cotización');
        }
    },

    async deleteQuotation(id, name) {
        let confirmed;
        if (typeof Confirm !== 'undefined') {
            confirmed = await Confirm.show({
                title: 'Eliminar cotización',
                message: `¿Eliminar la cotización ${name}? Esta acción no se puede deshacer.`,
                confirmText: 'Sí, eliminar',
                cancelText: 'Cancelar',
                danger: true
            });
        } else {
            confirmed = confirm(`¿Eliminar la cotización ${name}?`);
        }
        if (!confirmed) return;

        try {
            await QuotationStorage.deleteQuotation(id);
            if (typeof Toast !== 'undefined') Toast.success(`Cotización ${name} eliminada`);
            // Refrescar la lista del modal
            this.openModal();
        } catch (e) {
            console.error('❌ Error eliminando cotización:', e);
            if (typeof Toast !== 'undefined') Toast.error('No se pudo eliminar la cotización');
        }
    },

    async loadAsTemplate(id) {
        try {
            const q = await QuotationStorage.getQuotationById(id);
            if (!q) return;
            const stateObj = q.fullState || q;
            this._restoreState(stateObj, true);
            this.closeModal();
            if (typeof Toast !== 'undefined') Toast.success(`Cotización ${stateObj.cotNumber || ''} cargada como base`);
        } catch (e) {
            console.error('❌ Error cargando cotización:', e);
            if (typeof Toast !== 'undefined') Toast.error('No se pudo cargar la cotización');
        }
    },

    // Duplica una cotización: carga todo (incluso cliente) pero renombra el proyecto con " (copia)"
    // para distinguir la variante. Al exportar, se asigna un número nuevo automáticamente.
    async duplicateQuotation(id) {
        try {
            const q = await QuotationStorage.getQuotationById(id);
            if (!q) return;
            const stateObj = q.fullState || q;
            this._restoreState(stateObj, false);

            // Marcar el proyecto con sufijo para que se distinga de la original
            const originalProject = stateObj.params?.project?.name || '';
            const newProject = originalProject ? `${originalProject} (copia)` : '(copia)';
            State.generalParams.proyecto = newProject;
            if (State.generalParams.proyectoData) {
                State.generalParams.proyectoData.name = newProject;
                State.generalParams.proyectoData.id = null; // nuevo registro en DB si se guarda
            } else {
                State.generalParams.proyectoData = { id: null, name: newProject };
            }
            const proyectoInput = document.getElementById('input-proyecto');
            if (proyectoInput) proyectoInput.value = newProject;

            // Trigger re-render para reflejar el nuevo project name
            if (typeof Render !== 'undefined') Render.updateAll();

            this.closeModal();
            if (typeof Toast !== 'undefined') {
                Toast.success('Cotización duplicada — al exportar se asigna número nuevo', 3500);
            }
        } catch (e) {
            console.error('❌ Error duplicando cotización:', e);
            if (typeof Toast !== 'undefined') Toast.error('No se pudo duplicar la cotización');
        }
    },

    _restoreState(quotation, clearClientData) {
        const p = quotation.params;

        // Paso 1: Reset previo
        State.reset();

        // Texto de la propuesta (no se trae a templates: puede referir a este cliente/evento)
        State.generalParams.proposalText = clearClientData ? '' : (quotation.proposalText || '');

        // Paso 2: Restaurar generalParams (NO se restaura cotNumber)
        State.generalParams.quotationType = quotation.type;
        State.generalParams.metraje = p.surface;
        State.generalParams.frontal = p.frontal || null;
        State.generalParams.profundidad = p.profundidad || null;
        State.generalParams.standType = p.standType;

        const standSidesMap = { centro: 1, esquina: 2, peninsula: 3, isla: 4 };
        State.generalParams.standSides = standSidesMap[p.standType] || 1;

        const heightMatch = DATABASE.heightMultipliers.find(h => h.multiplier === p.height.multiplier);
        State.generalParams.heightType = heightMatch?.id || 'standard';
        State.generalParams.heightMultiplier = p.height.multiplier;

        State.generalParams.modifierName = p.modifier.name;
        State.generalParams.modifierPercentage = p.modifier.percentage;
        State.generalParams.includeFee = p.fee.enabled;
        State.generalParams.feePercentage = p.fee.percentage / 100;

        // Paso 3: Restaurar datos de cliente (solo si no es template)
        if (!clearClientData) {
            State.generalParams.cliente = p.client.name;
            State.generalParams.clienteData = {
                id: p.client.id || null,
                name: p.client.name,
                cuit: p.client.cuit,
                email: p.client.email
            };
            State.generalParams.proyecto = p.project.name;
            State.generalParams.proyectoData = {
                id: p.project.id || null,
                name: p.project.name
            };
            State.generalParams.evento = p.event.name;
            State.generalParams.eventoData = {
                id:             p.event.id             || null,
                name:           p.event.name,
                setupDate:      p.event.dates          || '',
                eventStartDate: p.event.eventStartDate || null,
                eventEndDate:   p.event.eventEndDate   || null,
                venue:          p.event.venue          || ''
            };
        }

        // Paso 4: Restaurar items
        if (quotation.type === 'stand') {
            State.selectedItems = {};
            quotation.items.forEach(item => {
                State.selectedItems[item.id] = { quantity: item.quantity, autoCalc: false };
            });
        } else {
            // Expo/Alquiler: restaurar espacios
            State.generalParams.spaces = quotation.spaces.map(space => ({
                id: space.id,
                name: space.name,
                surface: space.surface,
                items: {}
            }));
            quotation.spaces.forEach(space => {
                const stateSpace = State.generalParams.spaces.find(s => s.id === space.id);
                if (stateSpace) {
                    space.items.forEach(item => {
                        stateSpace.items[item.id] = { quantity: item.quantity, autoCalc: false };
                    });
                }
            });
            State._spaceCounter = quotation.spaces.length;
            State.generalParams.activeSpaceId = quotation.spaces[0]?.id || null;
        }

        // Paso 5: Actualizar DOM inputs
        const clienteInput = document.getElementById('input-cliente');
        const proyectoInput = document.getElementById('input-proyecto');
        const eventoInput = document.getElementById('input-evento');
        if (clienteInput) clienteInput.value = clearClientData ? '' : (p.client.name || '');
        if (proyectoInput) proyectoInput.value = clearClientData ? '' : (p.project.name || '');
        if (eventoInput) eventoInput.value = clearClientData ? '' : (p.event.name || '');

        // Actualizar display de evento/lugar/fecha
        if (typeof Render !== 'undefined') {
            Render.updateEventInfo(clearClientData ? null : State.generalParams.eventoData);
            Render._refreshProposalUI();
        }

        const metrajeInput = document.getElementById('input-metraje');
        if (metrajeInput) metrajeInput.value = p.surface;

        const frontalInput = document.getElementById('input-frontal');
        if (frontalInput) frontalInput.value = p.frontal || '';

        const profundidadInput = document.getElementById('input-profundidad');
        if (profundidadInput) profundidadInput.value = p.profundidad || '';

        // Tipo de stand
        document.querySelectorAll('.stand-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === p.standType);
        });

        // Altura
        const heightId = heightMatch?.id || 'standard';
        document.querySelectorAll('.height-chip').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.height === heightId);
        });

        // Modificador
        const modNameInput = document.getElementById('modifier-name');
        const modPctInput = document.getElementById('modifier-percentage');
        if (modNameInput) modNameInput.value = p.modifier.name || '';
        if (modPctInput) modPctInput.value = p.modifier.percentage || 0;

        // Fee
        const feeCheckbox = document.getElementById('fee-checkbox');
        const feeInput = document.getElementById('fee-percentage-input');
        if (feeCheckbox) feeCheckbox.checked = p.fee.enabled;
        if (feeInput) feeInput.value = p.fee.percentage;

        // Tipo de cotización
        document.querySelectorAll('.quot-btn-param').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === quotation.type);
        });

        // Paso 6: Disparar renders
        Render.updateLayoutForType(quotation.type);
        Render.updateModifierDisplay();
        if (State.isMultiSpaceMode()) {
            Render.renderSpacesTabs();
        }
        Render.renderItems();
        Render.updateAll();
    }
};
