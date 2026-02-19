// =============================================
// AUTOCOMPLETE MODULE
// =============================================
// Maneja los campos de autocompletado para Cliente, Proyecto y Evento

const Autocomplete = {
    // Cache de datos
    clients: [],
    projects: [],
    events: [],

    // Referencias a elementos
    elements: {
        clientInput: null,
        clientDropdown: null,
        projectInput: null,
        projectDropdown: null,
        eventInput: null,
        eventDropdown: null
    },

    // Estado actual
    selectedData: {
        client: null,
        project: null,
        event: null
    },

    // Timers para debounce
    debounceTimers: {},

    // =============================================
    // INICIALIZACIÓN
    // =============================================
    init() {
        console.log('🔗 Initializing Autocomplete module...');

        // Obtener referencias a elementos
        this.elements.clientInput = document.getElementById('input-cliente');
        this.elements.clientDropdown = document.getElementById('clients-dropdown');
        this.elements.projectInput = document.getElementById('input-proyecto');
        this.elements.projectDropdown = document.getElementById('projects-dropdown');
        this.elements.eventInput = document.getElementById('input-evento');
        this.elements.eventDropdown = document.getElementById('events-dropdown');

        // Verificar que existan los elementos
        if (!this.elements.clientInput || !this.elements.projectInput || !this.elements.eventInput) {
            console.warn('⚠️ Autocomplete elements not found');
            return;
        }

        // Configurar event listeners
        this.setupEventListeners();

        // Cargar datos iniciales
        this.loadData();
    },

    // =============================================
    // CARGA DE DATOS
    // =============================================
    async loadData() {
        try {
            console.log('📥 Loading autocomplete data...');

            // Cargar las tres bases de datos en paralelo
            const [clients, projects, events] = await Promise.all([
                API.getClients(),
                API.getProjects(),
                API.getEvents()
            ]);

            this.clients = clients || [];
            this.projects = projects || [];
            this.events = events || [];

            console.log(`✅ Loaded ${this.clients.length} clients, ${this.projects.length} projects, ${this.events.length} events`);
        } catch (error) {
            console.error('❌ Error loading autocomplete data:', error);
        }
    },

    // =============================================
    // EVENT LISTENERS
    // =============================================
    setupEventListeners() {
        // Cliente
        this.elements.clientInput.addEventListener('input', (e) => {
            this.handleInput('client', e.target.value);
        });
        this.elements.clientInput.addEventListener('blur', () => {
            setTimeout(() => this.hideDropdown('client'), 200);
        });

        // Proyecto
        this.elements.projectInput.addEventListener('input', (e) => {
            this.handleInput('project', e.target.value);
        });
        this.elements.projectInput.addEventListener('blur', () => {
            setTimeout(() => this.hideDropdown('project'), 200);
        });

        // Evento
        this.elements.eventInput.addEventListener('input', (e) => {
            if (!e.target.value) {
                State.updateGeneralParam('eventoData', null);
                if (typeof Render !== 'undefined') Render.updateEventInfo(null);
            }
            this.handleInput('event', e.target.value);
        });
        this.elements.eventInput.addEventListener('blur', () => {
            setTimeout(() => this.hideDropdown('event'), 200);
        });

        // Cerrar dropdowns al hacer click fuera
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.autocomplete-group')) {
                this.hideAllDropdowns();
            }
        });
    },

    // =============================================
    // MANEJO DE INPUT
    // =============================================
    handleInput(type, query) {
        // Debounce para evitar demasiadas búsquedas
        clearTimeout(this.debounceTimers[type]);

        this.debounceTimers[type] = setTimeout(async () => {
            if (!query || query.length < 2) {
                this.hideDropdown(type);
                return;
            }

            // Buscar en cache local primero
            const results = this.searchLocal(type, query);

            if (results.length > 0) {
                this.showDropdown(type, results);
            } else {
                // Si no hay resultados locales, buscar en API
                await this.searchRemote(type, query);
            }
        }, 300); // 300ms debounce
    },

    // =============================================
    // BÚSQUEDA LOCAL
    // =============================================
    searchLocal(type, query) {
        const normalizedQuery = query.toLowerCase();
        let data = [];

        switch (type) {
            case 'client':
                data = this.clients;
                return data.filter(item =>
                    item.name?.toLowerCase().includes(normalizedQuery) ||
                    item.razonSocial?.toLowerCase().includes(normalizedQuery)
                ).slice(0, 10);

            case 'project':
                data = this.projects;
                return data.filter(item =>
                    item.name?.toLowerCase().includes(normalizedQuery) ||
                    item.number?.toString().includes(normalizedQuery)
                ).slice(0, 10);

            case 'event':
                data = this.events;
                return data.filter(item =>
                    item.name?.toLowerCase().includes(normalizedQuery)
                ).slice(0, 10);

            default:
                return [];
        }
    },

    // =============================================
    // BÚSQUEDA REMOTA
    // =============================================
    async searchRemote(type, query) {
        try {
            this.showLoading(type);

            let results = [];
            switch (type) {
                case 'client':
                    results = await API.searchClients(query);
                    break;
                case 'project':
                    results = await API.searchProjects(query);
                    break;
                case 'event':
                    results = await API.searchEvents(query);
                    break;
            }

            if (results.length > 0) {
                this.showDropdown(type, results);
            } else {
                this.showNoResults(type);
            }
        } catch (error) {
            console.error(`❌ Error searching ${type}:`, error);
            this.showNoResults(type);
        }
    },

    // =============================================
    // MOSTRAR/OCULTAR DROPDOWNS
    // =============================================
    showDropdown(type, results) {
        const dropdown = this.getDropdownElement(type);
        if (!dropdown) return;

        let html = '';
        results.forEach(item => {
            html += this.createDropdownItem(type, item);
        });

        dropdown.innerHTML = html;
        dropdown.classList.add('active');

        // Agregar event listeners a los items
        dropdown.querySelectorAll('.autocomplete-item').forEach(el => {
            el.addEventListener('click', () => {
                this.selectItem(type, JSON.parse(el.dataset.item));
            });
        });
    },

    hideDropdown(type) {
        const dropdown = this.getDropdownElement(type);
        if (dropdown) {
            dropdown.classList.remove('active');
        }
    },

    hideAllDropdowns() {
        this.hideDropdown('client');
        this.hideDropdown('project');
        this.hideDropdown('event');
    },

    showLoading(type) {
        const dropdown = this.getDropdownElement(type);
        if (dropdown) {
            dropdown.innerHTML = '<div class="autocomplete-loading">Buscando...</div>';
            dropdown.classList.add('active');
        }
    },

    showNoResults(type) {
        const dropdown = this.getDropdownElement(type);
        if (dropdown) {
            dropdown.innerHTML = '<div class="autocomplete-no-results">No se encontraron resultados</div>';
            dropdown.classList.add('active');
        }
    },

    // =============================================
    // CREAR ITEMS DEL DROPDOWN
    // =============================================
    createDropdownItem(type, item) {
        let html = '';

        switch (type) {
            case 'client':
                html = `
                    <div class="autocomplete-item" data-item='${JSON.stringify(item)}'>
                        <div class="autocomplete-item-name">${item.name || 'Sin nombre'}</div>
                        <div class="autocomplete-item-details">
                            ${item.razonSocial ? `<span class="autocomplete-item-detail">📄 ${item.razonSocial}</span>` : ''}
                            ${item.cuit ? `<span class="autocomplete-item-detail">🆔 ${item.cuit}</span>` : ''}
                            ${item.email ? `<span class="autocomplete-item-detail">📧 ${item.email}</span>` : ''}
                        </div>
                    </div>
                `;
                break;

            case 'project':
                html = `
                    <div class="autocomplete-item" data-item='${JSON.stringify(item)}'>
                        <div class="autocomplete-item-name">${item.name || 'Sin nombre'}</div>
                        <div class="autocomplete-item-details">
                            ${item.number ? `<span class="autocomplete-item-detail">#${item.number}</span>` : ''}
                            ${item.status ? `<span class="autocomplete-item-detail">📊 ${item.status}</span>` : ''}
                            ${item.area ? `<span class="autocomplete-item-detail">📂 ${item.area}</span>` : ''}
                        </div>
                    </div>
                `;
                break;

            case 'event':
                html = `
                    <div class="autocomplete-item" data-item='${JSON.stringify(item)}'>
                        <div class="autocomplete-item-name">${item.name || 'Sin nombre'}</div>
                        <div class="autocomplete-item-details">
                            ${item.setupDate ? `<span class="autocomplete-item-detail">📅 ${this.formatDate(item.setupDate)}</span>` : ''}
                            ${item.status ? `<span class="autocomplete-item-detail">📊 ${item.status}</span>` : ''}
                            ${item.pavilion && item.pavilion.length > 0 ? `<span class="autocomplete-item-detail">🏢 ${item.pavilion.join(', ')}</span>` : ''}
                        </div>
                    </div>
                `;
                break;
        }

        return html;
    },

    // =============================================
    // SELECCIONAR ITEM
    // =============================================
    async selectItem(type, item) {
        console.log(`✅ Selected ${type}:`, item);

        this.selectedData[type] = item;
        const input = this.getInputElement(type);

        switch (type) {
            case 'client':
                if (input) input.value = item.name || '';
                State.updateGeneralParam('cliente', item.name || '');
                State.updateGeneralParam('clienteData', item);
                break;

            case 'project':
                if (input) input.value = item.name || '';
                State.updateGeneralParam('proyecto', item.name || '');
                State.updateGeneralParam('proyectoData', item);

                // Si el proyecto tiene relaciones, cargar cliente y evento
                const fullProject = await API.getProject(item.id);
                if (fullProject) {
                    if (fullProject.client) {
                        this.selectItem('client', fullProject.client);
                    }
                    if (fullProject.event) {
                        this.selectItem('event', fullProject.event);
                    }
                }
                break;

            case 'event':
                if (input) input.value = item.name || '';
                State.updateGeneralParam('evento', item.name || '');
                State.updateGeneralParam('eventoData', item);
                if (typeof Render !== 'undefined') Render.updateEventInfo(item);
                break;
        }

        this.hideDropdown(type);
    },

    // =============================================
    // UTILIDADES
    // =============================================
    getInputElement(type) {
        switch (type) {
            case 'client': return this.elements.clientInput;
            case 'project': return this.elements.projectInput;
            case 'event': return this.elements.eventInput;
            default: return null;
        }
    },

    getDropdownElement(type) {
        switch (type) {
            case 'client': return this.elements.clientDropdown;
            case 'project': return this.elements.projectDropdown;
            case 'event': return this.elements.eventDropdown;
            default: return null;
        }
    },

    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
};

// Exportar para uso global
window.Autocomplete = Autocomplete;

console.log('📋 Autocomplete module loaded');
