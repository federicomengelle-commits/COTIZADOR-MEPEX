// =============================================
// MEPEX COTIZADOR - MAIN APPLICATION
// =============================================

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
    const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    if (!startDate) return '';
    const start     = new Date(startDate + 'T00:00:00');
    const startDay  = start.getDate();
    const startMes  = MESES[start.getMonth()];
    const startYear = start.getFullYear();

    if (!endDate) return `${startDay} de ${startMes} ${startYear}`;

    const end     = new Date(endDate + 'T00:00:00');
    const endDay  = end.getDate();
    const endMes  = MESES[end.getMonth()];
    const endYear = end.getFullYear();

    if (start.getMonth() === end.getMonth() && startYear === endYear) {
        return `${startDay} - ${endDay} de ${endMes} ${startYear}`;
    }
    return `${startDay} de ${startMes} - ${endDay} de ${endMes} ${endYear}`;
}

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
        this.renderItems();
        this.renderAdminPanel();
        this.updateSummary();

        // Bind global actions
        document.getElementById('btn-reset')?.addEventListener('click', () => State.reset());
        document.getElementById('btn-export')?.addEventListener('click', () => this.exportPDF());
        // btn-admin se vincula en renderNav()

        // Quotation type selector (en params section)
        document.querySelectorAll('.quot-btn-param').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.quot-btn-param').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const newType = btn.dataset.type;
                const oldType = State.generalParams.quotationType;

                // Si cambiamos de Stand a multi-espacio, migrar items
                if (oldType === 'stand' && (newType === 'expo' || newType === 'alquiler')) {
                    const hasItems = Object.keys(State.selectedItems).length > 0;
                    if (State.generalParams.spaces.length === 0) {
                        const space = State.addSpace('Espacio 1');
                        if (hasItems) {
                            space.items = { ...State.selectedItems };
                        }
                    }
                }
                // Si cambiamos de multi-espacio a Stand, migrar items del espacio activo
                if ((oldType === 'expo' || oldType === 'alquiler') && newType === 'stand') {
                    const activeSpace = State.getActiveSpace();
                    if (activeSpace && Object.keys(activeSpace.items).length > 0) {
                        State.selectedItems = { ...activeSpace.items };
                    }
                }

                State.generalParams.quotationType = newType;
                this.updateLayoutForType(newType);
                Render.renderItems();
                Render.updateAll();
            });
        });

        // Botón agregar espacio
        document.getElementById('btn-add-space')?.addEventListener('click', () => {
            State.addSpace();
        });

        // Layout inicial
        this.updateLayoutForType(State.generalParams.quotationType);
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

        // Tabs
        let tabsHTML = '';
        spaces.forEach(space => {
            const isActive = space.id === activeId;
            const itemCount = Object.keys(space.items).length;
            tabsHTML += `
                <button class="space-tab ${isActive ? 'active' : ''}" data-space-id="${space.id}">
                    <span class="space-tab-name">${space.name}</span>
                    ${itemCount > 0 ? `<span class="space-tab-count">${itemCount}</span>` : ''}
                    ${spaces.length > 1 ? `<span class="space-tab-remove" data-remove-id="${space.id}" title="Eliminar">&times;</span>` : ''}
                </button>
            `;
        });
        tabsContainer.innerHTML = tabsHTML;

        // Event listeners para tabs
        tabsContainer.querySelectorAll('.space-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                if (e.target.classList.contains('space-tab-remove')) return;
                State.setActiveSpace(tab.dataset.spaceId);
            });
        });
        tabsContainer.querySelectorAll('.space-tab-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('¿Eliminar este espacio y todos sus items?')) {
                    State.removeSpace(btn.dataset.removeId);
                }
            });
        });

        // Info del espacio activo
        if (infoContainer) {
            const activeSpace = State.getActiveSpace();
            if (activeSpace) {
                infoContainer.innerHTML = `
                    <div class="active-space-controls">
                        <div class="input-group input-group-compact">
                            <label>Nombre</label>
                            <input type="text" class="text-input space-name-input" value="${activeSpace.name}" maxlength="40">
                        </div>
                        <div class="input-group input-group-compact">
                            <label>Superficie</label>
                            <div class="metraje-input">
                                <input type="number" class="number-input space-surface-input" value="${activeSpace.surface || ''}" min="1" max="5000" placeholder="—">
                                <span class="input-suffix">m²</span>
                            </div>
                        </div>
                    </div>
                `;
                // Listeners
                const nameInput = infoContainer.querySelector('.space-name-input');
                nameInput?.addEventListener('input', (e) => {
                    activeSpace.name = e.target.value;
                    // Actualizar solo el tab label
                    const tabBtn = tabsContainer.querySelector(`.space-tab[data-space-id="${activeSpace.id}"] .space-tab-name`);
                    if (tabBtn) tabBtn.textContent = e.target.value;
                });
                const surfaceInput = infoContainer.querySelector('.space-surface-input');
                surfaceInput?.addEventListener('input', (e) => {
                    activeSpace.surface = e.target.value;
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
        adminLink.innerHTML = '🔧 Configuración';
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
                    <div class="empty-icon">📡</div>
                    <h3>Conectando con Notion...</h3>
                    <p>Los items se cargarán automáticamente desde la base de datos de Notion.</p>
                    <p class="empty-hint">Si el servidor no está corriendo, ejecutá <strong>INICIAR COTIZADOR.bat</strong></p>
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
    },

    // Renderiza un grupo de items en un contenedor con lógica de favoritos
    _renderItemGroup(items, container, displayName) {
        const favorites = items.filter(i => i.favorite === true);
        const nonFavorites = items.filter(i => i.favorite !== true);

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

        // Botón toggle "Ver todos / Ver menos"
        const btn = document.createElement('button');
        btn.className = 'toggle-all-btn';
        btn.dataset.containerId = container.id;
        btn.dataset.nonFavCount = nonFavorites.length;
        btn.dataset.catName = displayName;
        btn.textContent = `Ver todos los items de ${displayName} (+${nonFavorites.length} más)`;
        btn.addEventListener('click', () => {
            const isExpanded = container.classList.contains('expanded');
            container.classList.toggle('expanded', !isExpanded);
            btn.textContent = !isExpanded
                ? 'Ver menos'
                : `Ver todos los items de ${displayName} (+${nonFavorites.length} más)`;
        });
        // Insertar el botón después del contenedor (como hermano en el DOM)
        container.parentNode.insertBefore(btn, container.nextSibling);
    },

    createItemCard(item) {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.dataset.itemId = item.id;

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

        card.innerHTML = `
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

    attachItemListeners() {
        // Contadores
        document.querySelectorAll('.btn-count').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                const action = e.target.dataset.action;
                const currentQty = State.getItemQuantity(id);

                let newQty = currentQty;
                if (action === 'inc') newQty++;
                if (action === 'dec') newQty = Math.max(0, newQty - 1);

                State.toggleItem(id, newQty);
            });
        });

        // Checkboxes
        document.querySelectorAll('input[data-action="check"]').forEach(chk => {
            chk.addEventListener('change', (e) => {
                const id = e.target.dataset.id;
                State.toggleItem(id);
            });
        });

        // Inputs de cantidad (editables con teclado)
        document.querySelectorAll('.count-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const id = e.target.dataset.id;
                const newQty = Math.max(0, parseInt(e.target.value) || 0);
                e.target.value = newQty; // Asegurar que el valor sea válido
                State.toggleItem(id, newQty);
            });
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
        const datesEl     = display.querySelector('.event-info-dates');

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

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                input.value = '';
                clearBtn.style.display = 'none';
                this.applySearchFilter('');
                input.focus();
            });
        }
    },

    // Aplica el filtro de búsqueda visualmente (no modifica State)
    applySearchFilter(query) {
        const container = document.getElementById('items-container');
        if (!container) return;

        if (!query) {
            container.classList.remove('searching');
            document.querySelectorAll('.item-card').forEach(c => c.classList.remove('item-search-hidden'));
            document.querySelectorAll('.category-section').forEach(s => s.style.display = '');
            return;
        }

        container.classList.add('searching');
        const lowerQuery = query.toLowerCase();

        document.querySelectorAll('.item-card').forEach(card => {
            const name = card.querySelector('.item-name')?.textContent?.toLowerCase() || '';
            card.classList.toggle('item-search-hidden', !name.includes(lowerQuery));
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

    updateSummary() {
        const summaryList = document.getElementById('summary-list');
        const subtotalEl = document.getElementById('subtotal-display');
        const taxEl = document.getElementById('tax-display');
        const totalEl = document.getElementById('total-display');

        const params = State.generalParams;
        const qType = params.quotationType || 'stand';
        const isMultiSpace = State.isMultiSpaceMode();
        let summaryHTML = '';

        const heightAffectedCategories = DATABASE.heightAffectedCategories || ['infrastructure', 'lighting'];
        const currentHeight = DATABASE.heightMultipliers.find(h => h.id === params.heightType);
        const heightLabel = currentHeight ? `${currentHeight.name} (${currentHeight.height})` : 'Estándar';
        const modifierMultiplier = 1 + (params.modifierPercentage / 100);

        // ── Sección de parámetros ──
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
                    ${params.modifierPercentage !== 0 ? `
                    <div class="summary-param-row ${params.modifierPercentage > 0 ? 'modifier-positive' : 'modifier-negative'}">
                        <span class="param-name">🔧 ${params.modifierName || 'Modificador'}:</span>
                        <span class="param-value">${params.modifierPercentage > 0 ? '+' : ''}${params.modifierPercentage}%</span>
                    </div>
                    ` : ''}
                    ${params.includeFee ? `
                    <div class="summary-param-row fee-active">
                        <span class="param-name">💼 Fee Agencia:</span>
                        <span class="param-value">+${(params.feePercentage * 100).toFixed(0)}%</span>
                    </div>
                    ` : ''}
                </div>
                <div class="summary-divider"></div>
            `;
        } else {
            // Expo/Alquiler: mostrar tipo + fee si activo
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
                    ${params.includeFee ? `
                    <div class="summary-param-row fee-active">
                        <span class="param-name">💼 Fee Agencia:</span>
                        <span class="param-value">+${(params.feePercentage * 100).toFixed(0)}%</span>
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
            let subtotalLoaded = 0;

            const groupedItems = {};
            Object.entries(State.selectedItems).forEach(([id, data]) => {
                if (data.quantity <= 0) return;
                const item = DB.getItemById(id);
                if (item) {
                    const price = typeof item.price === 'string'
                        ? parseFloat(item.price.toString().replace(/[^\d.,-]/g, '').replace(',', '.')) || 0
                        : (parseFloat(item.price) || 0);
                    const catId = item.category;
                    if (!groupedItems[catId]) groupedItems[catId] = [];
                    groupedItems[catId].push({ ...item, price, quantity: data.quantity });
                }
            });

            DB.getCategories().forEach(cat => {
                if (groupedItems[cat.id] && groupedItems[cat.id].length > 0) {
                    const isHeightAffected = heightAffectedCategories.includes(cat.id);
                    const isInfrastructure = cat.id === 'infrastructure';

                    summaryHTML += `<div class="summary-category">
                        <div class="summary-category-title">${cat.icon} ${cat.name}${isHeightAffected && params.heightMultiplier > 1 ? ' <small style="opacity:0.6">[×Altura]</small>' : ''}</div>`;

                    if (isInfrastructure) {
                        summaryHTML += `
                            <div class="summary-item">
                                <span class="summary-item-name">Superficie: ${params.metraje}m² — Altura: ${heightLabel}</span>
                            </div>`;
                    }

                    groupedItems[cat.id].forEach(item => {
                        // Cálculo per-item (misma lógica que getLoadedPrice en exportPDF)
                        let loadedPrice = item.price * modifierMultiplier;
                        if (heightAffectedCategories.includes(cat.id)) {
                            loadedPrice *= params.heightMultiplier;
                        }
                        if (params.includeFee) {
                            loadedPrice *= (1 + params.feePercentage);
                        }
                        subtotalLoaded += loadedPrice * item.quantity;

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

            summaryList.innerHTML = summaryHTML;

            const tax = subtotalLoaded * 0.21;
            const total = subtotalLoaded + tax;

            subtotalEl.textContent = `$${Math.round(subtotalLoaded).toLocaleString('es-AR')}`;
            taxEl.textContent = `$${Math.round(tax).toLocaleString('es-AR')}`;
            totalEl.textContent = `$${Math.round(total).toLocaleString('es-AR')}`;

            // ──────────────────────────────
            // EXPO / ALQUILER MODE: desglose por espacio
            // ──────────────────────────────
        } else {
            let grandTotal = 0;

            params.spaces.forEach(space => {
                let spaceTotal = 0;
                const itemCount = Object.keys(space.items).length;

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
                        const price = typeof item.price === 'string'
                            ? parseFloat(item.price.toString().replace(/[^\d.,-]/g, '').replace(',', '.')) || 0
                            : (parseFloat(item.price) || 0);
                        const itemTotal = price * data.quantity;
                        spaceTotal += itemTotal;

                        summaryHTML += `
                            <div class="summary-item">
                                <span class="summary-item-name">${data.quantity > 1 ? data.quantity + 'x ' : ''}${item.name}</span>
                                <span class="summary-item-total">$${Math.round(itemTotal).toLocaleString('es-AR')}</span>
                            </div>`;
                    });
                }

                summaryHTML += `
                        <div class="summary-space-subtotal">
                            <span>Subtotal</span>
                            <span>$${Math.round(spaceTotal).toLocaleString('es-AR')}</span>
                        </div>
                    </div>`;

                grandTotal += spaceTotal;
            });

            if (params.spaces.length === 0) {
                summaryHTML += '<div class="empty-state">No hay espacios creados</div>';
            }

            summaryList.innerHTML = summaryHTML;

            let adjustedTotal = grandTotal * modifierMultiplier;
            if (params.includeFee) adjustedTotal *= (1 + params.feePercentage);

            const tax = adjustedTotal * 0.21;
            const total = adjustedTotal + tax;

            subtotalEl.textContent = `$${Math.round(adjustedTotal).toLocaleString('es-AR')}`;
            taxEl.textContent = `$${Math.round(tax).toLocaleString('es-AR')}`;
            totalEl.textContent = `$${Math.round(total).toLocaleString('es-AR')}`;
        }
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
                <h2>🔧 Catálogo de Items desde Notion</h2>
                <p>Visualiza los items sincronizados desde la base de datos de Notion</p>
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
                    <small>Los items se cargan automáticamente desde Notion</small>
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
                    // Obtener datos de Notion - usar notionCategory para mostrar etiquetas originales
                    const categoria = item.notionCategory || item.category || '-';
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
        const metrajeInput = document.getElementById('input-metraje');
        if (metrajeInput) {
            metrajeInput.addEventListener('input', (e) => {
                let value = parseInt(e.target.value) || 9;
                value = Math.max(9, Math.min(500, value));
                State.updateGeneralParam('metraje', value);
            });
            metrajeInput.addEventListener('blur', (e) => {
                let value = parseInt(e.target.value) || 9;
                value = Math.max(9, Math.min(500, value));
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

    async exportPDF() {
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

        // Número de cotización secuencial (persiste en localStorage)
        const currentYear = new Date().getFullYear();
        const storageKey = `mepex_cot_seq_${currentYear}`;
        let cotSeq = parseInt(localStorage.getItem(storageKey) || '0') + 1;
        localStorage.setItem(storageKey, cotSeq.toString());
        const cotNumber = `COT-${currentYear}-${String(cotSeq).padStart(4, '0')}`;

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
                        width  = Math.round(width  * ratio);
                        height = Math.round(height * ratio);
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width  = width;
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
        const isoData      = await loadImageAsDataURL('assets/mepex_iso.png',  80, 80);

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
        const eventoData     = State.generalParams.eventoData;
        const fechaEventoStr = formatEventDateRange(eventoData?.eventStartDate, eventoData?.eventEndDate);
        const venue          = eventoData?.venue || '';
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

        // ========================================
        // STAND MODE — items globales por categoría
        // ========================================
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

                    const catIcon = categoryIcons[cat.id] || '>>';
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(...cyanColor);
                    doc.text(cat.name.toUpperCase(), margin, yPos);
                    doc.setDrawColor(60, 60, 60);
                    doc.setLineWidth(0.3);
                    doc.line(margin, yPos + 2, pageWidth - margin, yPos + 2);
                    yPos += 7;

                    if (isInfrastructure) {
                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(...lightGray);
                        doc.text(`Superficie: ${params.metraje}m² — Altura: ${heightLabel}`, margin + 5, yPos);
                        yPos += 5;
                        doc.setFont('helvetica', 'italic');
                        doc.setTextColor(...mediumGray);
                        doc.text('Construcción modular con sistema OCTEXA', margin + 5, yPos);
                        yPos += 6;

                        // En Infraestructura STAND, mostramos el total del rubro o desglose?
                        // La lógica original no mostraba items individuales en Infraestructura Stand.
                        // Mantendremos esa lógica, pero calculando el total correctamente.
                    } else {
                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(...lightGray);
                        groupedItems[cat.id].forEach(item => {
                            if (yPos > pageHeight - 60) { addDarkPage(); yPos = 25; }
                            doc.text(`${item.quantity} - ${item.name}`, margin + 5, yPos);
                            yPos += 5;
                        });
                    }

                    groupedItems[cat.id].forEach(item => {
                        const itemTotal = item.price * item.quantity;
                        catTotal += itemTotal;
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

                            const itemText = item.quantity > 1
                                ? `• ${item.quantity}x ${item.name}`
                                : `• ${item.name}`;
                            doc.setTextColor(...lightGray);
                            doc.text(itemText, margin + 6, yPos);
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

        // Leyendas debajo del total
        yPos += 30;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...mediumGray);
        doc.text('El presupuesto es en concepto de alquiler', margin, yPos);
        yPos += 4;
        doc.text('Incluye armado, desarme, logística', margin, yPos);
        yPos += 4;
        doc.text('No incluye diseño del material gráfico', margin, yPos);

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
        doc.text('La oferta tiene una vigencia de 15 días.', isoX + 14, isoY + 2);
        doc.text('La forma de pago es a convenir.', isoX + 14, isoY + 6);
        doc.text(`Ref: ${cotNumber}`, isoX + 14, isoY + 10);

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
        const fileName = `MEPEX_${cotNumber}_${cliente.replace(/\s+/g, '_')}_${today.toISOString().split('T')[0]}.pdf`;
        const pdfBlob = doc.output('blob');
        doc.save(fileName);

        // Guardar cotización (API + localStorage) + subir PDF a Notion en background
        if (typeof QuotationStorage !== 'undefined') {
            QuotationStorage.saveQuotation(cotNumber, pdfBlob).catch(e =>
                console.error('Error guardando cotización:', e)
            );
        }
    }

};

// =============================================
// INITIALIZE APP
// =============================================
document.addEventListener('DOMContentLoaded', async () => {
    // LIMPIAR CACHE: Eliminar items viejos de localStorage
    // Esto asegura que solo se muestren items de Notion
    localStorage.removeItem('mepex_database');
    DATABASE.items = []; // Asegurar que el array esté vacío
    console.log('🧹 Cleared cached items - waiting for Notion data...');

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
                updateSyncStatus('online', 'Notion');
                console.log('✅ Connected to Notion via API');
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

    // Initialize render (works with merged DATABASE)
    Render.init();

    // Initialize autocomplete module
    if (typeof Autocomplete !== 'undefined') {
        Autocomplete.init();
        console.log('🔗 Autocomplete module initialized');
    }

    Render.initSearchFilter();

    console.log('MEPEX Cotizador initialized successfully.');

    // Listen for future catalog sync events (for real-time updates)
    window.addEventListener('catalog-synced', (e) => {
        const { items, timestamp } = e.detail;
        console.log(`📦 Catalog synced: ${items.length} items at ${new Date(timestamp).toLocaleString()}`);

        // Re-render items to show new Notion items
        Render.renderItems();
        Render.renderAdminPanel();
    });
});
