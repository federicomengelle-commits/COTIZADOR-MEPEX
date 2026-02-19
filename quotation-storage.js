// =============================================
// QUOTATION STORAGE — Persistencia de cotizaciones
// API-first con fallback a localStorage
// =============================================

const QuotationStorage = {
    STORAGE_KEY: 'mepex_quotations',
    MAX_QUOTATIONS: 50,

    // =============================================
    // MÉTODOS PÚBLICOS (async, API-first)
    // =============================================

    // Guardar cotización actual
    async saveQuotation(cotNumber, pdfBlob = null) {
        const quotation = this._collectCurrentState(cotNumber);

        // Intentar guardar en Notion via API
        try {
            if (typeof API !== 'undefined' && API.isConnected) {
                const apiData = {
                    cotNumber: quotation.cotNumber,
                    type: quotation.type,
                    clientId: quotation.params.client.id || null,
                    projectId: quotation.params.project.id || null,
                    eventId: quotation.params.event.id || null,
                    surface: quotation.params.surface,
                    standType: quotation.params.standType,
                    height: quotation.params.height?.label || null,
                    subtotal: quotation.totals.subtotal,
                    tax: quotation.totals.tax,
                    total: quotation.totals.total,
                    date: quotation.date,
                    fullState: quotation
                };

                const saved = await API.saveQuotation(apiData);
                // Usar el id de Notion como id de la cotización
                quotation.id = saved.id;
                console.log(`☁️ Cotización ${cotNumber} guardada en Notion (${saved.id})`);

                // Subir PDF en background (fire-and-forget)
                if (pdfBlob && saved.id) {
                    const fileName = `${cotNumber}.pdf`;
                    API.uploadPDF(saved.id, pdfBlob, fileName)
                        .then(() => console.log(`📎 PDF ${fileName} subido a Notion`))
                        .catch(e => console.warn('⚠️ No se pudo subir el PDF a Notion:', e.message));
                }
            }
        } catch (e) {
            console.warn('⚠️ No se pudo guardar en Notion, usando localStorage:', e.message);
        }

        // Siempre guardar en localStorage (como backup)
        this._saveToLocalStorage(quotation);

        return quotation;
    },

    // Obtener todas las cotizaciones
    async getQuotations() {
        try {
            if (typeof API !== 'undefined' && API.isConnected) {
                const quotations = await API.getQuotations();
                console.log(`☁️ ${quotations.length} cotizaciones cargadas de Notion`);
                return quotations;
            }
        } catch (e) {
            console.warn('⚠️ No se pudieron cargar de Notion, usando localStorage:', e.message);
        }

        return this._getFromLocalStorage();
    },

    // Obtener cotización por id (Notion page_id o UUID local)
    async getQuotationById(id) {
        try {
            if (typeof API !== 'undefined' && API.isConnected) {
                const quotation = await API.getQuotation(id);
                console.log(`☁️ Cotización ${id} cargada de Notion`);
                return quotation;
            }
        } catch (e) {
            console.warn('⚠️ No se pudo cargar de Notion, buscando en localStorage:', e.message);
        }

        return this._getFromLocalStorageById(id);
    },

    // =============================================
    // FALLBACK: localStorage (privados)
    // =============================================

    _saveToLocalStorage(quotation) {
        const quotations = this._getFromLocalStorage();

        // Actualizar si existe (por cotNumber o id)
        const existingIndex = quotations.findIndex(
            q => q.cotNumber === quotation.cotNumber || q.id === quotation.id
        );
        if (existingIndex !== -1) {
            quotations[existingIndex] = quotation;
        } else {
            quotations.push(quotation);
        }

        while (quotations.length > this.MAX_QUOTATIONS) {
            quotations.shift();
        }

        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(quotations));
            console.log(`💾 Cotización ${quotation.cotNumber} guardada en localStorage (${quotations.length} total)`);
        } catch (e) {
            console.error('❌ Error guardando en localStorage:', e);
        }
    },

    _getFromLocalStorage() {
        try {
            return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
        } catch {
            return [];
        }
    },

    _getFromLocalStorageById(id) {
        const quotations = this._getFromLocalStorage();
        return quotations.find(q => q.id === id || q.cotNumber === id) || null;
    },

    // =============================================
    // HELPERS (sin cambios)
    // =============================================

    _parseCurrencyFromDOM(elementId) {
        const text = document.getElementById(elementId)?.textContent || '$0';
        return parseInt(text.replace(/[^\d]/g, '')) || 0;
    },

    _expandItems(itemsMap) {
        return Object.entries(itemsMap)
            .filter(([_, data]) => data.quantity > 0)
            .map(([id, data]) => {
                const item = DB.getItemById(id);
                return item ? {
                    id,
                    name: item.name,
                    category: item.category,
                    price: item.price,
                    quantity: data.quantity,
                    unit: item.unit
                } : null;
            })
            .filter(Boolean);
    },

    // Recolectar estado completo de la cotización actual
    _collectCurrentState(cotNumber) {
        const params = State.generalParams;
        const qType = params.quotationType || 'stand';
        const isMultiSpace = State.isMultiSpaceMode();

        const heightData = DATABASE.heightMultipliers.find(h => h.id === params.heightType);

        const items = !isMultiSpace ? this._expandItems(State.selectedItems) : [];

        const spaces = isMultiSpace
            ? params.spaces.map(space => ({
                id: space.id,
                name: space.name,
                surface: space.surface,
                items: this._expandItems(space.items)
            }))
            : [];

        return {
            id: crypto.randomUUID(),
            cotNumber,
            date: new Date().toISOString().split('T')[0],
            type: qType,
            params: {
                client: {
                    id: params.clienteData?.id || null,
                    name: document.getElementById('input-cliente')?.value || '',
                    cuit: params.clienteData?.cuit || '',
                    email: params.clienteData?.email || ''
                },
                project: {
                    id: params.proyectoData?.id || null,
                    name: document.getElementById('input-proyecto')?.value || ''
                },
                event: {
                    id:             params.eventoData?.id             || null,
                    name:           document.getElementById('input-evento')?.value || '',
                    dates:          params.eventoData?.setupDate      || '',   // backward compat
                    eventStartDate: params.eventoData?.eventStartDate || null,
                    eventEndDate:   params.eventoData?.eventEndDate   || null,
                    venue:          params.eventoData?.venue          || ''
                },
                surface: params.metraje,
                frontal: params.frontal || null,
                profundidad: params.profundidad || null,
                standType: params.standType,
                height: heightData ? {
                    label: heightData.name,
                    value: parseFloat(heightData.height.replace(',', '.')),
                    multiplier: heightData.multiplier
                } : { label: 'Estándar', value: 2.5, multiplier: 1 },
                modifier: {
                    name: params.modifierName || '',
                    percentage: params.modifierPercentage || 0
                },
                fee: {
                    enabled: params.includeFee || false,
                    percentage: Math.round(params.feePercentage * 100)
                }
            },
            items,
            spaces,
            totals: {
                subtotal: this._parseCurrencyFromDOM('subtotal-display'),
                tax: this._parseCurrencyFromDOM('tax-display'),
                total: this._parseCurrencyFromDOM('total-display')
            },
            savedAt: new Date().toISOString()
        };
    }
};
