// =============================================
// MEPEX COTIZADOR - API CLIENT
// =============================================
// Módulo para conectar con el backend y Supabase
// =============================================

const API = {
    // Configuración
    baseUrl: window.location.hostname === 'localhost'
        ? 'http://localhost:3001/api'
        : '/cotizador-api/api',

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

    // =============================================
    // IA (Claude vía backend) — feature-flag por ANTHROPIC_API_KEY
    // =============================================
    async aiStatus() {
        try { return await this.request('/ai/status'); }
        catch { return { enabled: false }; }
    },
    async aiSanata(ctx) {
        return await this.request('/ai/sanata', { method: 'POST', body: JSON.stringify(ctx) });
    },
    async aiBrief(brief, catalog) {
        return await this.request('/ai/brief', { method: 'POST', body: JSON.stringify({ brief, catalog }) });
    },
    async aiGhosts(ctx) {
        return await this.request('/ai/ghosts', { method: 'POST', body: JSON.stringify(ctx) });
    },
    // Visión: propone un comentario para un render. image = {media_type, data(base64 sin prefijo)}.
    async aiRenderCaption(image, contexto) {
        return await this.request('/ai/render-caption', { method: 'POST', body: JSON.stringify({ image, contexto }) });
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

        console.log(`📦 Loaded ${response.count} items from API`);
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

    // NOTA: updateItem/createItem (escritura del catálogo) se eliminaron — el
    // cotizador es read-only sobre catalogo_items (la edición vive en Costos de
    // LOBBY). Estaban sin uso y apuntaban a endpoints ya removidos del server.

    // =============================================
    // SYNC CON DATABASE LOCAL
    // =============================================
    async loadCatalog() {
        try {
            const apiItems = await this.getCatalog();

            // Convertir formato API a formato local
            const convertedItems = apiItems.map(item => this.convertToLocalFormat(item));

            console.log('🔄 Catalog synced from API:', convertedItems.length, 'items');

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

    // Convertir item de API a formato de la app
    convertToLocalFormat(apiItem) {
        // Mapear RUBRO (categoría principal) a categoría local
        // NOTA: 'infrastructure' y 'lighting' son afectados por el multiplicador de altura
        // Keys normalizados (minúscula, sin acentos) → robusto a variaciones de la DB
        const rubroMap = {
            'pisos': 'flooring',
            'infraestructura': 'infrastructure',   // afectado por altura
            'iluminacion': 'lighting',             // afectado por altura
            'equipamiento': 'equipment',
            'marketing': 'marketing',
            'marketing y servicios': 'marketing',
            'mas servicios': 'moreservices'
        };
        const normRubro = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

        // Mapear Categoría (subcategoría) a subcategoría local
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

        // Obtener rubro (categoría principal) y subcategoría real
        const rubro = apiItem.rubro || '';
        const categoria = apiItem.category || null;  // subcategoría real (Alfombramiento, etc.)

        // Categoría local desde el RUBRO (normalizado). Si no matchea, inferir por
        // palabras clave en rubro/categoria/nombre; fallback 'moreservices'.
        let localCategory = rubroMap[normRubro(rubro)];
        if (!localCategory) {
            const hay = normRubro(`${rubro} ${categoria || ''} ${apiItem.name || ''}`);
            if (/piso|alfombr|tarima|moqueta/.test(hay)) localCategory = 'flooring';
            else if (/ilumin|luz|luces|spot|led|reflector|electric|artefacto|dicroic/.test(hay)) localCategory = 'lighting';
            else if (/octexa|panel|estructura|infraestr|tabique|truss|cenefa/.test(hay)) localCategory = 'infrastructure';
            else if (/grafic|vinilo|cartel|impres|lona|banner|marketing|branding/.test(hay)) localCategory = 'marketing';
            else if (/mobil|mostrador|vitrina|\btv\b|pantalla|audiovisual|tablero|mueble|silla|mesa|banqueta|heladera/.test(hay)) localCategory = 'equipment';
            else localCategory = 'moreservices';
        }

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
        const code = apiItem.code || '';
        const safeName = (apiItem.name || 'item').toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
        const itemId = code ? `item_${code.toLowerCase().replace(/[^a-z0-9]/g, '_')}` : `item_${safeName}`;

        return {
            id: itemId,
            sourceId: apiItem.id,
            name: apiItem.name || 'Sin nombre',
            description: apiItem.description || '',
            code: code,
            price: apiItem.price || 0,
            unit: this.convertUnit(apiItem.unit),
            category: localCategory,
            subcategory: localSubcategory,
            // Campos originales de la DB para mostrar en la tabla
            originalCategory: apiItem.category || '',   // Etiqueta original (Audiovisual, Tableros, etc)
            originalRubro: apiItem.rubro || '',          // RUBRO original
            // Variantes paramétricas (agrupado por familia + medida). Inertes hasta
            // que existan items cotizables paramétricos (ver C4 / render de variantes).
            parametric: apiItem.parametric || false,
            familia: apiItem.familia || null,
            medidaMm: apiItem.medidaMm != null ? apiItem.medidaMm : null,
            type: 'counter', // Por defecto counter
            autoCalculate: false,
            favorite: apiItem.favorite || false,
            // Metadata
            source: 'supabase',
            updatedAt: apiItem.updatedAt
        };
    },

    // Convertir unidad de la DB a formato local
    convertUnit(dbUnit) {
        const unitMap = {
            'm2': 'm²',
            'ml': 'ml',
            'Unidad': 'unidad',
            'unidad': 'unidad',
            'día': 'día',
            'set': 'set',
            'proyecto': 'proyecto'
        };
        return unitMap[dbUnit] || dbUnit || 'unidad';
    },

    // Merge items de la API con DATABASE local
    mergeCatalog(apiItems) {
        if (!apiItems || apiItems.length === 0) return;

        console.log('🔀 Merging', apiItems.length, 'API items with local database...');

        apiItems.forEach(apiItem => {
            // Buscar si ya existe un item con el mismo ID
            const existingIndex = DATABASE.items.findIndex(item => item.id === apiItem.id);

            if (existingIndex !== -1) {
                // Actualizar el item existente con datos de la API
                DATABASE.items[existingIndex] = {
                    ...DATABASE.items[existingIndex],
                    ...apiItem,
                    // Mantener configuraciones locales importantes
                    type: DATABASE.items[existingIndex].type || apiItem.type,
                    autoCalculate: DATABASE.items[existingIndex].autoCalculate || false
                };
                console.log(`   ↻ Updated: ${apiItem.name}`);
            } else {
                // Agregar nuevo item
                DATABASE.items.push(apiItem);
                console.log(`   + Added: ${apiItem.name}`);
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

    // Reservar el siguiente número de cotización (POST: consume un número del
    // contador atómico en la DB). Sin fallback local — si falla, el front bloquea.
    async getNextQuotationNumber() {
        const response = await this.request('/cotizaciones/next-number', { method: 'POST' });
        return response; // { success, year, next, formatted }
    },

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

    async deleteQuotation(id) {
        try {
            const response = await this.request(`/quotations/${id}`, {
                method: 'DELETE'
            });
            return response;
        } catch (error) {
            console.error('❌ Error deleting quotation:', error.message);
            throw error;
        }
    },

    // Subir PDF a Supabase Storage (multipart — NO usar this.request())
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
    // PROPUESTAS (Fase 2.3) — panel de propuestas comerciales
    // =============================================

    // Guardar una propuesta: sube el PDF (multipart) + metadata. Devuelve la fila creada.
    async savePropuesta(blob, fileName, meta = {}) {
        const url = `${this.baseUrl}/propuestas`;
        const formData = new FormData();
        formData.append('pdf', blob, fileName);
        formData.append('fileName', fileName);
        if (meta.cliente != null) formData.append('cliente', meta.cliente);
        if (meta.evento != null) formData.append('evento', meta.evento);
        if (meta.modo != null) formData.append('modo', meta.modo);
        if (meta.total != null) formData.append('total', String(meta.total));
        if (meta.ref != null) formData.append('ref', meta.ref);
        if (meta.cotizacionId != null) formData.append('cotizacionId', meta.cotizacionId);
        if (meta.payload != null) formData.append('payload', JSON.stringify(meta.payload));

        const response = await fetch(url, { method: 'POST', body: formData });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo guardar la propuesta');
        return data.propuesta;
    },

    async getPropuestas() {
        try {
            const response = await this.request('/propuestas');
            return response.propuestas || [];
        } catch (error) {
            console.error('❌ Error fetching propuestas:', error.message);
            throw error;
        }
    },

    async deletePropuesta(id) {
        try {
            return await this.request(`/propuestas/${id}`, { method: 'DELETE' });
        } catch (error) {
            console.error('❌ Error deleting propuesta:', error.message);
            throw error;
        }
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
console.log('📡 API Client loaded — waiting for initialization');
