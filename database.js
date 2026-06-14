// =============================================
// DATABASE - CATÁLOGO MAESTRO DE ITEMS
// =============================================
// Esta es la base de datos central de precios y configuraciones
// Todos los items tienen: id, name, price, unit, description, category, subcategory, type

const DATABASE = {
    // Metadatos
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    currency: "USD",

    // Configuración de rubros
    categories: {
        flooring: {
            id: "flooring",
            name: "Pisos",
            icon: "🏠",
            order: 1
        },
        infrastructure: {
            id: "infrastructure",
            name: "Infraestructura",
            icon: "🔧",
            order: 2
        },
        lighting: {
            id: "lighting",
            name: "Iluminación",
            icon: "💡",
            order: 3
        },
        equipment: {
            id: "equipment",
            name: "Equipamiento",
            icon: "🪑",
            order: 4,
            subcategories: {
                furniture: { name: "Mobiliario", icon: "🛋️" },
                electronics: { name: "Electrónicos", icon: "📺" }
            }
        },
        marketing: {
            id: "marketing",
            name: "Marketing y Servicios",
            icon: "📢",
            order: 5,
            subcategories: {
                graphics: { name: "Gráfica y Cartelería", icon: "🎨" },
                design: { name: "Diseño y Branding", icon: "✏️" },
                services: { name: "Servicios Adicionales", icon: "👥" }
            }
        },
        moreservices: {
            id: "moreservices",
            name: "Más Servicios",
            icon: "🛎️",
            order: 6
        }
    },

    // Catálogo de Items - VACÍO: Los items vienen de Supabase
    // =============================================
    // Los items se cargan dinámicamente desde Supabase via API
    // Esta lista puede contener items de fallback si la API no está disponible
    // =============================================
    items: [
        // Items se cargan desde Supabase
        // Si necesitas items de fallback (offline), agrégalos aquí
    ],

    // Configuración de Fees y Multiplicadores
    fees: {
        design: {
            id: "fee_design",
            name: "Fee de Diseño y Gestión",
            percentage: 0.15,
            description: "Diseño 3D, renders, coordinación de proyecto"
        }
    },

    // Multiplicadores de altura
    // NOTA: Solo aplican a categorías "infrastructure" y "lighting"
    heightMultipliers: [
        { id: "standard", name: "Estándar", height: "2,50m", multiplier: 1.0 },
        { id: "media", name: "Media", height: "3,00m", multiplier: 1.05 },
        { id: "plus", name: "Plus", height: "3,50m", multiplier: 1.10 },
        { id: "extra", name: "Extra", height: "4,00m", multiplier: 1.20 },
        { id: "maxima", name: "Máxima", height: "5,00m", multiplier: 1.35 }
    ],

    // Categorías afectadas por el multiplicador de altura
    heightAffectedCategories: ['infrastructure', 'lighting']
};

// Funciones de utilidad para la base de datos
const DB = {
    // Obtener todos los items
    getAllItems() {
        return DATABASE.items;
    },

    // Obtener items por categoría
    getItemsByCategory(categoryId) {
        return DATABASE.items.filter(item => item.category === categoryId);
    },

    // Obtener items por subcategoría
    getItemsBySubcategory(categoryId, subcategoryId) {
        return DATABASE.items.filter(
            item => item.category === categoryId && item.subcategory === subcategoryId
        );
    },

    // Obtener item por ID
    getItemById(itemId) {
        return DATABASE.items.find(item => item.id === itemId);
    },

    // Actualizar precio de un item
    updateItemPrice(itemId, newPrice) {
        const item = this.getItemById(itemId);
        if (item) {
            item.price = parseFloat(newPrice);
            DATABASE.lastUpdated = new Date().toISOString();
            return true;
        }
        return false;
    },

    // Actualizar item completo
    updateItem(itemId, updates) {
        const itemIndex = DATABASE.items.findIndex(item => item.id === itemId);
        if (itemIndex !== -1) {
            DATABASE.items[itemIndex] = { ...DATABASE.items[itemIndex], ...updates };
            DATABASE.lastUpdated = new Date().toISOString();
            return true;
        }
        return false;
    },

    // Agregar nuevo item
    addItem(newItem) {
        if (!newItem.id || this.getItemById(newItem.id)) {
            return false; // ID requerido y único
        }
        DATABASE.items.push(newItem);
        DATABASE.lastUpdated = new Date().toISOString();
        return true;
    },

    // Eliminar item
    removeItem(itemId) {
        const itemIndex = DATABASE.items.findIndex(item => item.id === itemId);
        if (itemIndex !== -1) {
            DATABASE.items.splice(itemIndex, 1);
            DATABASE.lastUpdated = new Date().toISOString();
            return true;
        }
        return false;
    },

    // Exportar base de datos a JSON
    exportToJSON() {
        return JSON.stringify(DATABASE, null, 2);
    },

    // Importar desde JSON
    importFromJSON(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            if (imported.items && Array.isArray(imported.items)) {
                DATABASE.items = imported.items;
                DATABASE.lastUpdated = new Date().toISOString();
                if (imported.fees) DATABASE.fees = imported.fees;
                if (imported.complexityLevels) DATABASE.complexityLevels = imported.complexityLevels;
                return true;
            }
            return false;
        } catch (e) {
            console.error("Error importing database:", e);
            return false;
        }
    },

    // Guardar en localStorage
    saveToLocalStorage() {
        try {
            localStorage.setItem('mepex_database', this.exportToJSON());
            return true;
        } catch (e) {
            console.error("Error saving to localStorage:", e);
            return false;
        }
    },

    // Cargar desde localStorage
    loadFromLocalStorage() {
        try {
            const stored = localStorage.getItem('mepex_database');
            if (stored) {
                return this.importFromJSON(stored);
            }
            return false;
        } catch (e) {
            console.error("Error loading from localStorage:", e);
            return false;
        }
    },

    // Obtener categorías ordenadas
    getCategories() {
        return Object.values(DATABASE.categories).sort((a, b) => a.order - b.order);
    },

    // ¿El item se cotiza por m²? (unidad m2/m²) → su cantidad sigue a la superficie
    isAreaItem(item) {
        if (!item || !item.unit) return false;
        return String(item.unit).toLowerCase().replace('²', '2').trim() === 'm2';
    },

    // Calcular cantidad auto para un item
    calculateAutoQuantity(itemId, metraje, standType, heightType) {
        const item = this.getItemById(itemId);
        if (!item || !item.autoCalculate) return 0;

        switch (item.calcFormula) {
            case "perimeter":
                // Calcula perímetro basado en stand cuadrado aproximado
                const side = Math.sqrt(metraje);
                const perimeter = side * 4;
                // Ajusta según tipo de stand (lados cerrados)
                const closedSides = standType === 'isla' ? 0 :
                    standType === 'peninsula' ? 1 :
                        standType === 'esquina' ? 2 : 3;
                return Math.ceil((perimeter * closedSides / 4) * item.calcFactor);

            case "spots":
                // 1 spot cada 4m²
                return Math.ceil(metraje * item.calcFactor);

            default:
                // Cálculo directo por factor
                return Math.ceil(metraje * item.calcFactor);
        }
    }
};

// IMPORTANTE: No cargar desde localStorage automáticamente
// Los items ahora vienen exclusivamente de Supabase
// Para limpiar items viejos guardados en el navegador:
// localStorage.removeItem('mepex_database');

console.log('📦 Database loaded — waiting for API items...');
