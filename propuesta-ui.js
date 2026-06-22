// =============================================
// PROPUESTA UI — Modal de propuestas guardadas (Fase 2.3)
// =============================================
// Espejo simplificado de quotation-ui.js: lista las propuestas guardadas
// (cliente · evento · modo · total · fecha) con acciones Ver PDF / Eliminar.
// Reusa las clases .quot-* para heredar el estilo del modal de cotizaciones.
// Una propuesta es un artefacto PDF (no se "carga" al estado como una cotización).
// =============================================

const PropuestaUI = {

    async openModal() {
        this.closeModal();

        const overlay = document.createElement('div');
        overlay.id = 'propuestas-modal';
        overlay.className = 'quot-modal-overlay';
        overlay.innerHTML = `
            <div class="quot-modal">
                <div class="quot-modal-header">
                    <h2>Propuestas Guardadas</h2>
                    <button class="quot-modal-close" id="propuestas-modal-close">&times;</button>
                </div>
                <div class="quot-modal-body">
                    <div class="quot-modal-loading">
                        <span class="mp-spinner mp-spinner-lg"></span>
                        <span>Cargando propuestas...</span>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#propuestas-modal-close').addEventListener('click', () => this.closeModal());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) this.closeModal(); });

        try {
            const propuestas = await PropuestaStorage.list();
            this._renderList(overlay, propuestas);
        } catch (e) {
            console.error('❌ Error cargando propuestas:', e);
            const body = overlay.querySelector('.quot-modal-body');
            if (body) {
                body.innerHTML = '<div class="quot-modal-empty">No se pudieron cargar las propuestas</div>';
            }
        }
    },

    _renderList(overlay, propuestas) {
        const body = overlay.querySelector('.quot-modal-body');
        if (!body) return;

        if (!propuestas || propuestas.length === 0) {
            body.innerHTML = '<div class="quot-modal-empty">No hay propuestas guardadas aún</div>';
            return;
        }

        const fmtCurrency = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-AR')}`;
        const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
        ));

        let listHTML = '';
        propuestas.forEach(p => {
            const dateStr = p.createdAt
                ? new Date(p.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : '—';
            const modo = (p.modo || '').toUpperCase();
            const cliente = esc(p.cliente || '—');
            const evento = esc(p.evento || '—');
            const refBadge = p.ref ? `<span class="quot-row-number">${esc(p.ref)}</span>` : '';
            const totalStr = (p.total != null) ? fmtCurrency(p.total) : '';

            listHTML += `
                <div class="quot-row">
                    <div class="quot-row-info">
                        ${refBadge}
                        <span class="quot-row-badge">${esc(modo)}</span>
                        <span class="quot-row-client">${cliente}</span>
                        <span class="quot-row-separator">·</span>
                        <span class="quot-row-event">${evento}</span>
                        ${totalStr ? `<span class="quot-row-total">${totalStr}</span>` : ''}
                        <span class="quot-row-date">${dateStr}</span>
                    </div>
                    <div class="quot-row-actions">
                        ${p.pdfUrl ? `<button class="quot-btn-view" data-url="${esc(p.pdfUrl)}" title="Abrir el PDF en una pestaña">PDF</button>` : ''}
                        <button class="quot-btn-delete" data-id="${esc(p.id)}" data-name="${cliente}" title="Eliminar">✕</button>
                    </div>
                </div>
            `;
        });

        body.innerHTML = listHTML;

        body.querySelectorAll('.quot-btn-view').forEach(btn => {
            btn.addEventListener('click', () => window.open(btn.dataset.url, '_blank'));
        });
        body.querySelectorAll('.quot-btn-delete').forEach(btn => {
            btn.addEventListener('click', () => this.remove(btn.dataset.id, btn.dataset.name));
        });
    },

    closeModal() {
        const modal = document.getElementById('propuestas-modal');
        if (modal) modal.remove();
    },

    async remove(id, name) {
        let confirmed;
        if (typeof Confirm !== 'undefined') {
            confirmed = await Confirm.show({
                title: 'Eliminar propuesta',
                message: `¿Eliminar la propuesta de ${name || 'este cliente'}? Esta acción no se puede deshacer.`,
                confirmText: 'Sí, eliminar',
                cancelText: 'Cancelar',
                danger: true
            });
        } else {
            confirmed = confirm('¿Eliminar la propuesta?');
        }
        if (!confirmed) return;

        try {
            await PropuestaStorage.remove(id);
            if (typeof Toast !== 'undefined') Toast.success('Propuesta eliminada');
            this.openModal(); // refrescar
        } catch (e) {
            console.error('❌ Error eliminando propuesta:', e);
            if (typeof Toast !== 'undefined') Toast.error('No se pudo eliminar la propuesta');
        }
    }
};

// El acceso "Propuestas" vive en el nav izquierdo (script.js renderNav → PropuestaUI.openModal).
if (typeof window !== 'undefined') window.PropuestaUI = PropuestaUI;
