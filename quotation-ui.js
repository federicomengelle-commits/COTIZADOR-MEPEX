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
                    <div class="quot-modal-loading">Cargando cotizaciones...</div>
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

            listHTML += `
                <div class="quot-row">
                    <div class="quot-row-info">
                        <span class="quot-row-number">${displayName}</span>
                        <span class="quot-row-badge">${typeLabel}</span>
                        <span class="quot-row-client">${clientName}</span>
                        <span class="quot-row-separator">·</span>
                        <span class="quot-row-event">${eventName}</span>
                        <span class="quot-row-date">${dateStr}</span>
                    </div>
                    <div class="quot-row-actions">
                        <button class="quot-btn-load" data-id="${q.id}">Cargar</button>
                        <button class="quot-btn-template" data-id="${q.id}">Usar como base</button>
                    </div>
                </div>
            `;
        });

        body.innerHTML = listHTML;

        body.querySelectorAll('.quot-btn-load').forEach(btn => {
            btn.addEventListener('click', () => this.loadQuotation(btn.dataset.id));
        });
        body.querySelectorAll('.quot-btn-template').forEach(btn => {
            btn.addEventListener('click', () => this.loadAsTemplate(btn.dataset.id));
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
            // Si viene de Notion con fullState, usar ese objeto para restaurar
            const stateObj = q.fullState || q;
            this._restoreState(stateObj, false);
            this.closeModal();
            console.log(`📂 Cotización ${stateObj.cotNumber || id} cargada`);
        } catch (e) {
            console.error('❌ Error cargando cotización:', e);
            alert('No se pudo cargar la cotización');
        }
    },

    async loadAsTemplate(id) {
        try {
            const q = await QuotationStorage.getQuotationById(id);
            if (!q) return;
            const stateObj = q.fullState || q;
            this._restoreState(stateObj, true);
            this.closeModal();
            console.log(`📋 Cotización ${stateObj.cotNumber || id} usada como base`);
        } catch (e) {
            console.error('❌ Error cargando cotización:', e);
            alert('No se pudo cargar la cotización');
        }
    },

    _restoreState(quotation, clearClientData) {
        const p = quotation.params;

        // Paso 1: Reset previo
        State.reset();

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
