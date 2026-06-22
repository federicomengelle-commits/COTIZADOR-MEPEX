// =============================================
// PROPUESTA STORAGE — Persistencia de propuestas comerciales (Fase 2.3)
// =============================================
// Guarda/lista/elimina los PDFs de PROPUESTAS en Supabase (bucket propuestas-pdf
// + tabla cotizacion_propuestas), espejo de quotation-storage.js.
// Requiere backend (API). A diferencia de las cotizaciones NO hay fallback a
// localStorage: el PDF es binario y vive en Storage; sin server, no se guarda.
// =============================================

const PropuestaStorage = {

    // "1.234.567,89" (es-AR) → 1234567.89
    _parseARS(s) {
        if (s == null) return null;
        const n = Number(String(s).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
        return Number.isFinite(n) ? n : null;
    },

    // Guarda la propuesta actual (blob + snapshot del payload).
    async save(blob, payload, fileName) {
        if (typeof API === 'undefined' || !API.isConnected) {
            throw new Error('Sin conexión al servidor');
        }
        const p = payload || {};
        const meta = {
            cliente: p.proyecto?.cliente || '',
            evento: p.proyecto?.evento || '',
            modo: p.modo || '',
            total: this._parseARS(p.detalle?.total),
            ref: p.ref || null,
            payload: p
        };
        const saved = await API.savePropuesta(blob, fileName || 'Propuesta.pdf', meta);
        console.log(`☁️ Propuesta guardada en Supabase (${saved && saved.id})`);
        return saved;
    },

    async list() {
        if (typeof API === 'undefined' || !API.isConnected) {
            throw new Error('Sin conexión al servidor');
        }
        return API.getPropuestas();
    },

    async remove(id) {
        if (typeof API === 'undefined' || !API.isConnected) {
            throw new Error('Sin conexión al servidor');
        }
        return API.deletePropuesta(id);
    }
};

if (typeof window !== 'undefined') window.PropuestaStorage = PropuestaStorage;
