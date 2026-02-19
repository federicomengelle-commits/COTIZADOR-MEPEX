// =============================================
// MEPEX COTIZADOR - API CLIENT
// =============================================
// Módulo para conectar con el backend y Notion
// =============================================

const API = {
    // Configuración
    baseUrl: window.location.hostname === 'localhost'
        ? 'http://localhost:3001/api'
        : 'https://cotizador-mepex-production.up.railway.app/api',

    // Estado de conexión
    isConnected: false,
    lastSync: null,

    // Cache local
    cache: {
        catalog: null,
        schema: null,
        timestamp: null
    },

    // =============================================
    // INICIALIZACIÓN
    // =============================================
    async init() {
        console.log('🔌 Initializing API connection...');
        try {
            const health = await this.checkHealth();
            if (health.status === 'ok') {
                this.isConnected = true;
                console.log('✅ API connected successfully');

                // Cargar catálogo inicial
                await this.loadCatalog();
                return true;
            }
        } catch (error) {
            console.warn('⚠️ API not available, using local database');
            this.isConnected = false;
            return false;
        }
    },

    // =============================================
    // MÉTODOS HTTP
    // =============================================
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
            },
            ...options
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error(`❌ API Error [${endpoint}]:`, error.message);
            throw error;
        }
    },

    // =============================================
    // ENDPOINTS
    // =============================================

    // Health check
    async checkHealth() {
        return await this.request('/health');
    },

    // Obtener catálogo completo
    async getCatalog(forceRefresh = false) {
        // Usar cache si existe y no forzamos refresh
        if (!forceRefresh && this.cache.catalog) {
            console.log('📦 Using cached catalog');
            return this.cache.catalog;
        }

        const response = await this.request('/catalog');

        // Guardar en cache
        this.cache.catalog = response.items;
        this.cache.timestamp = new Date();
        this.lastSync = response.timestamp;

        console.log(`📦 Loaded ${response.count} items from Notion`);
        return response.items;
    },

    // Obtener schema (categorías, unidades disponibles)
    async getSchema() {
        if (this.cache.schema) {
            return this.cache.schema;
        }

        const response = await this.request('/catalog/schema');
        this.cache.schema = response.schema;
        return response.schema;
    },

    // Obtener items por categoría
    async getByCategory(category) {
        const response = await this.request(`/catalog/category/${encodeURIComponent(category)}`);
        return response.items;
    },

    // Actualizar item (admin mode)
    async updateItem(itemId, data) {
        const response = await this.request(`/catalog/${itemId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });

        // Invalidar cache
        this.cache.catalog = null;

        return response.item;
    },

    // Crear nuevo item
    async createItem(data) {
        const response = await this.request('/catalog', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        // Invalidar cache
        this.cache.catalog = null;

        return response.item;
    },

    // =============================================
    // SYNC CON DATABASE LOCAL
    // =============================================
    async loadCatalog() {
        try {
            const notionItems = await this.getCatalog();

            // Convertir formato Notion a formato local
            const convertedItems = notionItems.map(item => this.convertToLocalFormat(item));

            console.log('🔄 Catalog synced from Notion:', convertedItems.length, 'items');

            // Merge con el DATABASE local
            this.mergeCatalog(convertedItems);

            // Emitir evento de sincronización
            window.dispatchEvent(new CustomEvent('catalog-synced', {
                detail: { items: convertedItems, timestamp: this.lastSync }
            }));

            return convertedItems;

        } catch (error) {
            console.error('❌ Error loading catalog:', error);
            return null;
        }
    },

    // Convertir item de Notion a formato de la app
    convertToLocalFormat(notionItem) {
        // Mapear RUBRO de Notion (categoría principal) a categoría local
        // NOTA: 'infrastructure' y 'lighting' son afectados por el multiplicador de altura
        const rubroMap = {
            // Pisos
            'Pisos': 'flooring',
            // Infraestructura (afectado por altura)
            'Infraestructura': 'infrastructure',
            // Iluminación (afectado por altura)
            'Iluminación': 'lighting',
            // Equipamiento
            'Equipamiento': 'equipment',
            // Marketing y servicios
            'Marketing': 'marketing',
            // Más servicios
            'Más servicios': 'moreservices'
        };

        // Mapear Categoría de Notion (subcategoría) a subcategoría local
        // Solo para equipment y marketing que tienen subcategorías
        const subcategoryMap = {
            // Equipment subcategories
            'Alfombramiento': 'furniture',
            'Sistema modular': 'furniture',
            'Tableros': 'furniture',
            'Audiovisual': 'electronics',
            // Marketing subcategories
            'Gráfica y cartelería': 'graphics',
            'Limpieza': 'services'
        };

        // Obtener rubro (categoría principal)
        const rubro = notionItem.rubro || 'Equipamiento';
        const categoria = notionItem.category || null;  // subcategoría

        // Determinar categoría local usando RUBRO
        const localCategory = rubroMap[rubro] || 'equipment';

        // Determinar subcategoría (solo si aplica)
        let localSubcategory = null;
        if (localCategory === 'equipment' || localCategory === 'marketing') {
            if (categoria && subcategoryMap[categoria]) {
                localSubcategory = subcategoryMap[categoria];
            } else {
                // Defaults por categoría
                localSubcategory = localCategory === 'equipment' ? 'furniture' : 'graphics';
            }
        }

        // Generar ID único basado en el código o nombre
        const code = notionItem.code || '';
        const safeName = (notionItem.name || 'item').toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
        const itemId = code ? `notion_${code.toLowerCase().replace(/[^a-z0-9]/g, '_')}` : `notion_${safeName}`;

        return {
            id: itemId,
            notionId: notionItem.id,
            name: notionItem.name || 'Sin nombre',
            description: notionItem.description || '',
            code: code,
            price: notionItem.price || 0,
            unit: this.convertUnit(notionItem.unit),
            category: localCategory,
            subcategory: localSubcategory,
            // CAMPOS ORIGINALES DE NOTION para mostrar en la tabla
            notionCategory: notionItem.category || '',   // Etiqueta original de Notion (Audiovisual, Tableros, etc)
            notionRubro: notionItem.rubro || '',         // RUBRO original de Notion
            type: 'counter', // Por defecto counter
            autoCalculate: false,
            favorite: notionItem.favorite || false,
            // Metadata
            source: 'notion',
            notionUrl: notionItem.notionUrl,
            updatedAt: notionItem.updatedAt
        };
    },

    // Convertir unidad de Notion a formato local
    convertUnit(notionUnit) {
        const unitMap = {
            'm2': 'm²',
            'ml': 'ml',
            'Unidad': 'unidad',
            'unidad': 'unidad',
            'día': 'día',
            'set': 'set',
            'proyecto': 'proyecto'
        };
        return unitMap[notionUnit] || notionUnit || 'unidad';
    },

    // Merge items de Notion con DATABASE local
    mergeCatalog(notionItems) {
        if (!notionItems || notionItems.length === 0) return;

        console.log('🔀 Merging', notionItems.length, 'Notion items with local database...');

        notionItems.forEach(notionItem => {
            // Buscar si ya existe un item con el mismo ID
            const existingIndex = DATABASE.items.findIndex(item => item.id === notionItem.id);

            if (existingIndex !== -1) {
                // Actualizar el item existente con datos de Notion
                DATABASE.items[existingIndex] = {
                    ...DATABASE.items[existingIndex],
                    ...notionItem,
                    // Mantener configuraciones locales importantes
                    type: DATABASE.items[existingIndex].type || notionItem.type,
                    autoCalculate: DATABASE.items[existingIndex].autoCalculate || false
                };
                console.log(`   ↻ Updated: ${notionItem.name}`);
            } else {
                // Agregar nuevo item
                DATABASE.items.push(notionItem);
                console.log(`   + Added: ${notionItem.name}`);
            }
        });

        DATABASE.lastUpdated = new Date().toISOString();
        console.log('✅ Merge complete. Total items:', DATABASE.items.length);
    },

    // =============================================
    // ENDPOINTS: CLIENTES
    // =============================================

    // Obtener todos los clientes
    async getClients() {
        try {
            const response = await this.request('/clients');
            return response.clients;
        } catch (error) {
            console.error('❌ Error fetching clients:', error.message);
            return [];
        }
    },

    // Buscar clientes (autocompletado)
    async searchClients(query) {
        if (!query || query.length < 2) return [];

        try {
            const response = await this.request(`/clients/search?q=${encodeURIComponent(query)}`);
            return response.results;
        } catch (error) {
            console.error('❌ Error searching clients:', error.message);
            return [];
        }
    },

    // =============================================
    // ENDPOINTS: PROYECTOS
    // =============================================

    // Obtener todos los proyectos
    async getProjects() {
        try {
            const response = await this.request('/projects');
            return response.projects;
        } catch (error) {
            console.error('❌ Error fetching projects:', error.message);
            return [];
        }
    },

    // Buscar proyectos (autocompletado)
    async searchProjects(query) {
        if (!query || query.length < 2) return [];

        try {
            const response = await this.request(`/projects/search?q=${encodeURIComponent(query)}`);
            return response.results;
        } catch (error) {
            console.error('❌ Error searching projects:', error.message);
            return [];
        }
    },

    // Obtener proyecto específico con relaciones
    async getProject(projectId) {
        try {
            const response = await this.request(`/projects/${projectId}`);
            return response.project;
        } catch (error) {
            console.error('❌ Error fetching project:', error.message);
            return null;
        }
    },

    // =============================================
    // ENDPOINTS: EVENTOS
    // =============================================

    // Obtener todos los eventos
    async getEvents() {
        try {
            const response = await this.request('/events');
            return response.events;
        } catch (error) {
            console.error('❌ Error fetching events:', error.message);
            return [];
        }
    },

    // Buscar eventos (autocompletado)
    async searchEvents(query) {
        if (!query || query.length < 2) return [];

        try {
            const response = await this.request(`/events/search?q=${encodeURIComponent(query)}`);
            return response.results;
        } catch (error) {
            console.error('❌ Error searching events:', error.message);
            return [];
        }
    },

    // =============================================
    // ENDPOINTS: COTIZACIONES
    // =============================================

    async getQuotations() {
        try {
            const response = await this.request('/quotations');
            return response.quotations;
        } catch (error) {
            console.error('❌ Error fetching quotations:', error.message);
            throw error;
        }
    },

    async getQuotation(id) {
        try {
            const response = await this.request(`/quotations/${id}`);
            return response.quotation;
        } catch (error) {
            console.error('❌ Error fetching quotation:', error.message);
            throw error;
        }
    },

    async saveQuotation(data) {
        try {
            const response = await this.request('/quotations', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            return response.quotation;
        } catch (error) {
            console.error('❌ Error saving quotation:', error.message);
            throw error;
        }
    },

    async updateQuotation(id, data) {
        try {
            const response = await this.request(`/quotations/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
            return response.quotation;
        } catch (error) {
            console.error('❌ Error updating quotation:', error.message);
            throw error;
        }
    },

    // Subir PDF a Notion (multipart — NO usar this.request())
    async uploadPDF(pageId, blob, fileName) {
        const url = `${this.baseUrl}/quotations/${pageId}/pdf`;
        const formData = new FormData();
        formData.append('pdf', blob, fileName);

        const response = await fetch(url, {
            method: 'POST',
            body: formData
            // Sin Content-Type header — lo pone FormData automáticamente con boundary
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Upload failed');
        }
        return data;
    },

    // =============================================
    // UTILIDADES
    // =============================================

    // Limpiar cache
    clearCache() {
        this.cache.catalog = null;
        this.cache.schema = null;
        this.cache.timestamp = null;
        console.log('🗑️ Cache cleared');
    },

    // Estado de la conexión
    getStatus() {
        return {
            connected: this.isConnected,
            lastSync: this.lastSync,
            cacheAge: this.cache.timestamp
                ? Math.round((new Date() - this.cache.timestamp) / 1000)
                : null,
            itemCount: this.cache.catalog?.length || 0
        };
    }
};

// Exportar para uso global
window.API = API;

// Log inicial
console.log('📡 API Client loaded - waiting for initialization');
