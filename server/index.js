// =============================================
// MEPEX COTIZADOR - BACKEND API
// =============================================
// Proxy seguro para conectar con Notion API
// También sirve los archivos estáticos del frontend
// =============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Client } = require('@notionhq/client');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3001;

// Inicializar cliente de Notion
const notion = new Client({
    auth: process.env.NOTION_TOKEN
});

// Multer — almacenamiento en memoria para upload de PDFs
const upload = multer({ storage: multer.memoryStorage() });

// =============================================
// DATABASE IDs
// =============================================
const DATABASE_ID = process.env.NOTION_DATABASE_ID;           // Catálogo de items
const CLIENTS_DB_ID = process.env.NOTION_CLIENTS_DB_ID;       // Clientes
const PROJECTS_DB_ID = process.env.NOTION_PROJECTS_DB_ID;     // Proyectos 2026
const EVENTS_DB_ID = process.env.NOTION_EVENTS_DB_ID;         // Eventos 2026
const QUOTATIONS_DB_ID = process.env.NOTION_QUOTATIONS_DB_ID; // Cotizaciones

console.log('📊 Database IDs loaded:');
console.log('   - Catalog:', DATABASE_ID?.substring(0, 8) + '...');
console.log('   - Clients:', CLIENTS_DB_ID?.substring(0, 8) + '...');
console.log('   - Projects:', PROJECTS_DB_ID?.substring(0, 8) + '...');
console.log('   - Events:', EVENTS_DB_ID?.substring(0, 8) + '...');
console.log('   - Quotations:', QUOTATIONS_DB_ID?.substring(0, 8) + '...');

// Middleware
// Permitir todas las origenes para desarrollo (incluyendo file://)
app.use(cors({
    origin: function (origin, callback) {
        // Permitir requests sin origin (como file:// o Postman)
        if (!origin) return callback(null, true);
        // Permitir localhost en cualquier puerto
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
            return callback(null, true);
        }
        return callback(null, true); // Permitir todo en desarrollo
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
}));
app.use(express.json());

// =============================================
// SERVIR ARCHIVOS ESTÁTICOS DEL FRONTEND
// =============================================
// Servir la carpeta raíz del proyecto (donde está index.html)
const frontendPath = path.join(__dirname, '..');
app.use(express.static(frontendPath));
console.log('📂 Serving static files from:', frontendPath);

// =============================================
// UTILIDADES: Parsear propiedades de Notion
// =============================================

function getTitle(prop) {
    if (!prop || !prop.title || prop.title.length === 0) return '';
    return prop.title.map(t => t.plain_text).join('');
}

function getRichText(prop) {
    if (!prop || !prop.rich_text || prop.rich_text.length === 0) return '';
    return prop.rich_text.map(t => t.plain_text).join('');
}

function getSelect(prop) {
    if (!prop || !prop.select) return null;
    return prop.select.name;
}

function getStatus(prop) {
    if (!prop || !prop.status) return null;
    return prop.status.name;
}

function getMultiSelect(prop) {
    if (!prop || !prop.multi_select || prop.multi_select.length === 0) return [];
    return prop.multi_select.map(s => s.name);
}

function getNumber(prop) {
    if (!prop || prop.number === null || prop.number === undefined) return 0;
    return prop.number;
}

function getEmail(prop) {
    if (!prop || !prop.email) return '';
    return prop.email;
}

function getPhone(prop) {
    if (!prop || !prop.phone_number) return '';
    return prop.phone_number;
}

function getDate(prop) {
    if (!prop || !prop.date || !prop.date.start) return null;
    return prop.date.start;
}

function getRelation(prop) {
    if (!prop || !prop.relation || prop.relation.length === 0) return [];
    return prop.relation.map(r => r.id);
}

function getCheckbox(prop) {
    if (!prop || prop.checkbox === null || prop.checkbox === undefined) return false;
    return prop.checkbox === true;
}

// =============================================
// PARSERS ESPECÍFICOS POR TIPO DE ENTIDAD
// =============================================

// Parser para items del catálogo
function parseNotionItem(page) {
    const props = page.properties;

    // RUBRO es select (no multi_select) - categoría principal
    const rubro = getSelect(props['RUBRO']) || '';

    // Categoría es multi_select - etiquetas múltiples
    const categorias = getMultiSelect(props['Categoría']);
    const categoria = categorias.length > 0 ? categorias.join(', ') : '';

    return {
        id: page.id,
        notionUrl: page.url,
        // Campos de la DB usando nombres EXACTOS de Notion
        name: getTitle(props['Item']),                     // PROPIEDAD: Item (SIN acento)
        code: getRichText(props['Código']),                // PROPIEDAD: Código
        description: getRichText(props['Descripción']),    // PROPIEDAD: Descripción
        rubro: rubro,                                      // PROPIEDAD: RUBRO (select)
        category: categoria,                               // PROPIEDAD: Categoría (select)
        unit: getSelect(props['Unidad']),                  // PROPIEDAD: Unidad
        price: getNumber(props['Importe']),                // PROPIEDAD: Importe (sin #)
        favorite: getCheckbox(props['Favorito']),          // PROPIEDAD: Favorito (checkbox)
        // Metadatos
        createdAt: page.created_time,
        updatedAt: page.last_edited_time
    };
}

// Parser para clientes
function parseClient(page) {
    const props = page.properties;

    return {
        id: page.id,
        notionUrl: page.url,
        // Campos principales
        name: getTitle(props['Nombre Empresa']),
        razonSocial: getRichText(props['Razón Social']),
        cuit: getNumber(props['CUIT']),
        email: getEmail(props['Correo Electrónico']),
        phone: getPhone(props['Teléfono']),
        rubro: getMultiSelect(props['Rubro ']),
        // Metadatos
        createdAt: page.created_time,
        updatedAt: page.last_edited_time
    };
}

// Parser para proyectos
function parseProject(page) {
    const props = page.properties;

    return {
        id: page.id,
        notionUrl: page.url,
        // Campos principales
        name: getTitle(props['Cliente']),  // El campo title en Proyectos se llama "Cliente"
        number: getNumber(props['N° ']),
        area: getRichText(props['Área']),
        status: getStatus(props['Estado']),
        requestDate: getDate(props['Fecha de solicitud']),
        // Relaciones
        clientId: getRelation(props['Empresa'])[0] || null,
        eventId: getRelation(props['Eventos 2026-'])[0] || null,
        // Metadatos
        createdAt: page.created_time,
        updatedAt: page.last_edited_time
    };
}

// Parser para eventos
function parseEvent(page) {
    const props = page.properties;

    return {
        id: page.id,
        notionUrl: page.url,
        // Campos principales
        name: getTitle(props['Nombre']),
        status: getSelect(props['Estado']),
        setupDate: getDate(props['Fecha de armado']),
        teardownDate: getDate(props['Fecha de desarme']),
        phone: getPhone(props['Teléfono']),
        pavilion: getMultiSelect(props['Pabellón']),
        totalStands: getNumber(props['Stands totales']),
        completedStands: getNumber(props['Stands terminados']),
        priority: getSelect(props['Prioridad']),
        // Fechas del evento (rango start → end)
        eventStartDate: props['Fecha de evento']?.date?.start || null,
        eventEndDate:   props['Fecha de evento']?.date?.end   || null,
        // Lugar del evento
        venue: getSelect(props['Lugar']),
        // Relaciones
        venueId: getRelation(props['Predio'])[0] || null,
        // Metadatos
        createdAt: page.created_time,
        updatedAt: page.last_edited_time
    };
}

// Parser para cotizaciones
function parseQuotation(page) {
    const props = page.properties;

    return {
        id: page.id,
        notionUrl: page.url,
        name: getTitle(props['Nombre']),
        type: getSelect(props['Tipo']),
        clientIds: getRelation(props['Clientes']),
        projectIds: getRelation(props['Proyectos 2026']),
        eventIds: getRelation(props['Eventos 2026']),
        surface: getNumber(props['Superficie']),
        standType: getSelect(props['Tipo Stand']),
        height: getSelect(props['Altura']),
        subtotal: getNumber(props['Subtotal']),
        tax: getNumber(props['IVA']),
        total: getNumber(props['Total']),
        date: getDate(props['Fecha Emisión']),
        createdAt: page.created_time,
        updatedAt: page.last_edited_time
    };
}

// =============================================
// HELPERS: Cotizaciones — JSON body en code blocks
// =============================================

// Dividir texto largo en chunks de max 2000 chars (límite Notion rich_text)
function createRichTextChunks(text, maxLen = 2000) {
    const chunks = [];
    for (let i = 0; i < text.length; i += maxLen) {
        chunks.push({ type: 'text', text: { content: text.substring(i, i + maxLen) } });
    }
    return chunks;
}

// Leer el code block del body de una página (contiene fullState JSON)
async function getPageJsonBody(pageId) {
    const response = await notion.blocks.children.list({ block_id: pageId, page_size: 100 });
    const codeBlock = response.results.find(b => b.type === 'code');
    if (!codeBlock) return null;

    const text = codeBlock.code.rich_text.map(rt => rt.plain_text).join('');
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

// Construir properties de Notion para cotización, capitalizando selects
function buildQuotationProperties(data) {
    // Mapa de capitalización para selects
    const typeMap = { stand: 'Stand', expo: 'Expo', alquiler: 'Alquiler' };
    const standTypeMap = { centro: 'Centro', esquina: 'Esquina', peninsula: 'Peninsula', isla: 'Isla' };
    const heightMap = { 'estándar': 'Estándar', 'media': 'Media', 'plus': 'Plus', 'extra': 'Extra', 'máxima': 'Máxima' };

    const props = {
        'Nombre': { title: [{ text: { content: data.cotNumber || '' } }] },
        'Superficie': { number: data.surface || 0 },
        'Subtotal': { number: data.subtotal || 0 },
        'IVA': { number: data.tax || 0 },
        'Total': { number: data.total || 0 }
    };

    // Selects obligatorios
    if (data.type) {
        const val = typeMap[data.type.toLowerCase()] || data.type;
        props['Tipo'] = { select: { name: val } };
    }

    // Selects opcionales — solo incluir si hay valor
    if (data.standType) {
        const val = standTypeMap[data.standType.toLowerCase()] || data.standType;
        props['Tipo Stand'] = { select: { name: val } };
    }
    if (data.height) {
        const val = heightMap[data.height.toLowerCase()] || data.height;
        props['Altura'] = { select: { name: val } };
    }

    // Relations — solo incluir si hay ID
    props['Clientes'] = { relation: data.clientId ? [{ id: data.clientId }] : [] };
    props['Proyectos 2026'] = { relation: data.projectId ? [{ id: data.projectId }] : [] };
    props['Eventos 2026'] = { relation: data.eventId ? [{ id: data.eventId }] : [] };

    // Fecha
    if (data.date) {
        props['Fecha Emisión'] = { date: { start: data.date } };
    }

    return props;
}

// =============================================
// ENDPOINTS
// =============================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Obtener todos los items del catálogo
app.get('/api/catalog', async (req, res) => {
    try {
        console.log('📦 Fetching catalog from Notion...');

        let allItems = [];
        let hasMore = true;
        let startCursor = undefined;

        // Paginación para obtener todos los items
        while (hasMore) {
            const response = await notion.databases.query({
                database_id: DATABASE_ID,
                start_cursor: startCursor,
                page_size: 100
            });

            const items = response.results.map(parseNotionItem);
            allItems = allItems.concat(items);

            hasMore = response.has_more;
            startCursor = response.next_cursor;
        }

        console.log(`✅ Fetched ${allItems.length} items from Notion`);

        res.json({
            success: true,
            count: allItems.length,
            items: allItems,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error fetching catalog:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Obtener estructura de la base de datos (categorías, unidades, etc.)
app.get('/api/catalog/schema', async (req, res) => {
    try {
        console.log('🔧 Fetching database schema...');

        const database = await notion.databases.retrieve({
            database_id: DATABASE_ID
        });

        const schema = {
            title: database.title.map(t => t.plain_text).join(''),
            properties: {}
        };

        // Extraer opciones de selects
        for (const [key, prop] of Object.entries(database.properties)) {
            schema.properties[key] = {
                type: prop.type,
                name: prop.name
            };

            if (prop.type === 'select' && prop.select?.options) {
                schema.properties[key].options = prop.select.options.map(o => ({
                    name: o.name,
                    color: o.color
                }));
            }

            if (prop.type === 'multi_select' && prop.multi_select?.options) {
                schema.properties[key].options = prop.multi_select.options.map(o => ({
                    name: o.name,
                    color: o.color
                }));
            }
        }

        console.log('✅ Schema retrieved successfully');
        res.json({
            success: true,
            schema: schema
        });

    } catch (error) {
        console.error('❌ Error fetching schema:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Obtener items por categoría
app.get('/api/catalog/category/:category', async (req, res) => {
    try {
        const { category } = req.params;
        console.log(`📦 Fetching items for category: ${category}`);

        const response = await notion.databases.query({
            database_id: DATABASE_ID,
            filter: {
                property: 'Categoría',
                multi_select: {
                    contains: category
                }
            }
        });

        const items = response.results.map(parseNotionItem);

        res.json({
            success: true,
            category: category,
            count: items.length,
            items: items
        });

    } catch (error) {
        console.error('❌ Error fetching category:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Actualizar precio de un item (para modo admin)
app.put('/api/catalog/:itemId', async (req, res) => {
    try {
        const { itemId } = req.params;
        const { price, name, description, unit, category } = req.body;

        console.log(`✏️ Updating item: ${itemId}`);

        const updateData = { page_id: itemId, properties: {} };

        if (price !== undefined) {
            updateData.properties.Importe = { number: price };
        }
        if (name !== undefined) {
            updateData.properties.Item = { title: [{ text: { content: name } }] };
        }
        if (description !== undefined) {
            updateData.properties['Descripción'] = { rich_text: [{ text: { content: description } }] };
        }
        if (unit !== undefined) {
            updateData.properties.Unidad = { select: { name: unit } };
        }
        if (category !== undefined) {
            updateData.properties['Categoría'] = {
                multi_select: Array.isArray(category)
                    ? category.map(c => ({ name: c }))
                    : [{ name: category }]
            };
        }

        const response = await notion.pages.update(updateData);
        const updatedItem = parseNotionItem(response);

        console.log('✅ Item updated successfully');
        res.json({
            success: true,
            item: updatedItem
        });

    } catch (error) {
        console.error('❌ Error updating item:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Crear nuevo item
app.post('/api/catalog', async (req, res) => {
    try {
        const { name, code, description, category, unit, price } = req.body;

        console.log(`➕ Creating new item: ${name}`);

        const response = await notion.pages.create({
            parent: { database_id: DATABASE_ID },
            properties: {
                Item: { title: [{ text: { content: name || '' } }] },
                'Código': { rich_text: [{ text: { content: code || '' } }] },
                'Descripción': { rich_text: [{ text: { content: description || '' } }] },
                'Categoría': {
                    multi_select: Array.isArray(category)
                        ? category.map(c => ({ name: c }))
                        : category ? [{ name: category }] : []
                },
                Unidad: unit ? { select: { name: unit } } : undefined,
                Importe: { number: price || 0 }
            }
        });

        const newItem = parseNotionItem(response);

        console.log('✅ Item created successfully');
        res.json({
            success: true,
            item: newItem
        });

    } catch (error) {
        console.error('❌ Error creating item:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =============================================
// ENDPOINTS: CLIENTES
// =============================================

// Obtener todos los clientes
app.get('/api/clients', async (req, res) => {
    try {
        console.log('👥 Fetching clients from Notion...');

        let allClients = [];
        let hasMore = true;
        let startCursor = undefined;

        while (hasMore) {
            const response = await notion.databases.query({
                database_id: CLIENTS_DB_ID,
                start_cursor: startCursor,
                page_size: 100
            });

            const clients = response.results.map(parseClient);
            allClients = allClients.concat(clients);

            hasMore = response.has_more;
            startCursor = response.next_cursor;
        }

        console.log(`✅ Fetched ${allClients.length} clients`);

        res.json({
            success: true,
            count: allClients.length,
            clients: allClients,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error fetching clients:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Buscar clientes (para autocompletado)
app.get('/api/clients/search', async (req, res) => {
    try {
        const { q } = req.query;
        console.log(`🔍 Searching clients for: "${q}"`);

        if (!q || q.length < 2) {
            return res.json({
                success: true,
                results: []
            });
        }

        const response = await notion.databases.query({
            database_id: CLIENTS_DB_ID,
            filter: {
                property: 'Nombre Empresa',
                title: {
                    contains: q
                }
            },
            page_size: 10
        });

        const clients = response.results.map(parseClient);

        res.json({
            success: true,
            results: clients
        });

    } catch (error) {
        console.error('❌ Error searching clients:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =============================================
// ENDPOINTS: PROYECTOS
// =============================================

// Obtener todos los proyectos
app.get('/api/projects', async (req, res) => {
    try {
        console.log('📁 Fetching projects from Notion...');

        let allProjects = [];
        let hasMore = true;
        let startCursor = undefined;

        while (hasMore) {
            const response = await notion.databases.query({
                database_id: PROJECTS_DB_ID,
                start_cursor: startCursor,
                page_size: 100
            });

            const projects = response.results.map(parseProject);
            allProjects = allProjects.concat(projects);

            hasMore = response.has_more;
            startCursor = response.next_cursor;
        }

        console.log(`✅ Fetched ${allProjects.length} projects`);

        res.json({
            success: true,
            count: allProjects.length,
            projects: allProjects,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error fetching projects:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Buscar proyectos (para autocompletado)
app.get('/api/projects/search', async (req, res) => {
    try {
        const { q } = req.query;
        console.log(`🔍 Searching projects for: "${q}"`);

        if (!q || q.length < 2) {
            return res.json({
                success: true,
                results: []
            });
        }

        const response = await notion.databases.query({
            database_id: PROJECTS_DB_ID,
            filter: {
                property: 'Cliente',
                title: {
                    contains: q
                }
            },
            page_size: 10
        });

        const projects = response.results.map(parseProject);

        res.json({
            success: true,
            results: projects
        });

    } catch (error) {
        console.error('❌ Error searching projects:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Obtener un proyecto específico con sus relaciones
app.get('/api/projects/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        console.log(`📁 Fetching project: ${projectId}`);

        const projectPage = await notion.pages.retrieve({ page_id: projectId });
        const project = parseProject(projectPage);

        // Si el proyecto tiene un cliente relacionado, obtenerlo
        if (project.clientId) {
            try {
                const clientPage = await notion.pages.retrieve({ page_id: project.clientId });
                project.client = parseClient(clientPage);
            } catch (e) {
                console.warn('⚠️ Could not fetch related client:', e.message);
            }
        }

        // Si el proyecto tiene un evento relacionado, obtenerlo
        if (project.eventId) {
            try {
                const eventPage = await notion.pages.retrieve({ page_id: project.eventId });
                project.event = parseEvent(eventPage);
            } catch (e) {
                console.warn('⚠️ Could not fetch related event:', e.message);
            }
        }

        res.json({
            success: true,
            project: project
        });

    } catch (error) {
        console.error('❌ Error fetching project:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =============================================
// ENDPOINTS: EVENTOS
// =============================================

// Obtener todos los eventos
app.get('/api/events', async (req, res) => {
    try {
        console.log('📅 Fetching events from Notion...');

        let allEvents = [];
        let hasMore = true;
        let startCursor = undefined;

        while (hasMore) {
            const response = await notion.databases.query({
                database_id: EVENTS_DB_ID,
                start_cursor: startCursor,
                page_size: 100
            });

            const events = response.results.map(parseEvent);
            allEvents = allEvents.concat(events);

            hasMore = response.has_more;
            startCursor = response.next_cursor;
        }

        console.log(`✅ Fetched ${allEvents.length} events`);

        res.json({
            success: true,
            count: allEvents.length,
            events: allEvents,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error fetching events:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Buscar eventos (para autocompletado)
app.get('/api/events/search', async (req, res) => {
    try {
        const { q } = req.query;
        console.log(`🔍 Searching events for: "${q}"`);

        if (!q || q.length < 2) {
            return res.json({
                success: true,
                results: []
            });
        }

        const response = await notion.databases.query({
            database_id: EVENTS_DB_ID,
            filter: {
                property: 'Nombre',
                title: {
                    contains: q
                }
            },
            page_size: 10
        });

        const events = response.results.map(parseEvent);

        res.json({
            success: true,
            results: events
        });

    } catch (error) {
        console.error('❌ Error searching events:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =============================================
// ENDPOINTS: COTIZACIONES
// =============================================

// Listar cotizaciones (solo properties, sin body JSON)
app.get('/api/quotations', async (req, res) => {
    try {
        console.log('📋 Fetching quotations from Notion...');

        let allQuotations = [];
        let hasMore = true;
        let startCursor = undefined;

        while (hasMore) {
            const response = await notion.databases.query({
                database_id: QUOTATIONS_DB_ID,
                start_cursor: startCursor,
                page_size: 100,
                sorts: [{ property: 'Fecha Emisión', direction: 'descending' }]
            });

            const quotations = response.results.map(parseQuotation);
            allQuotations = allQuotations.concat(quotations);

            hasMore = response.has_more;
            startCursor = response.next_cursor;
        }

        console.log(`✅ Fetched ${allQuotations.length} quotations`);

        res.json({
            success: true,
            count: allQuotations.length,
            quotations: allQuotations,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error fetching quotations:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener cotización completa (properties + fullState del body)
app.get('/api/quotations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`📋 Fetching quotation: ${id}`);

        const page = await notion.pages.retrieve({ page_id: id });
        const quotation = parseQuotation(page);

        // Leer el JSON del body (code block)
        const fullState = await getPageJsonBody(id);
        quotation.fullState = fullState;

        res.json({
            success: true,
            quotation
        });

    } catch (error) {
        console.error('❌ Error fetching quotation:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Crear cotización nueva
app.post('/api/quotations', async (req, res) => {
    try {
        const data = req.body;
        console.log(`➕ Creating quotation: ${data.cotNumber}`);

        const properties = buildQuotationProperties(data);

        // Crear página con properties + code block con fullState
        const children = [];
        if (data.fullState) {
            children.push({
                object: 'block',
                type: 'code',
                code: {
                    rich_text: createRichTextChunks(JSON.stringify(data.fullState)),
                    language: 'json'
                }
            });
        }

        const response = await notion.pages.create({
            parent: { database_id: QUOTATIONS_DB_ID },
            properties,
            children
        });

        const quotation = parseQuotation(response);
        console.log(`✅ Quotation created: ${quotation.name} (${quotation.id})`);

        res.json({
            success: true,
            quotation
        });

    } catch (error) {
        console.error('❌ Error creating quotation:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Actualizar cotización existente
app.put('/api/quotations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        console.log(`✏️ Updating quotation: ${id}`);

        const properties = buildQuotationProperties(data);

        // Actualizar properties
        const response = await notion.pages.update({
            page_id: id,
            properties
        });

        // Actualizar body (code block) si se envía fullState
        if (data.fullState) {
            // Buscar code block existente y borrarlo
            const blocks = await notion.blocks.children.list({ block_id: id, page_size: 100 });
            const codeBlock = blocks.results.find(b => b.type === 'code');
            if (codeBlock) {
                await notion.blocks.delete({ block_id: codeBlock.id });
            }

            // Agregar nuevo code block
            await notion.blocks.children.append({
                block_id: id,
                children: [{
                    object: 'block',
                    type: 'code',
                    code: {
                        rich_text: createRichTextChunks(JSON.stringify(data.fullState)),
                        language: 'json'
                    }
                }]
            });
        }

        const quotation = parseQuotation(response);
        console.log(`✅ Quotation updated: ${quotation.name}`);

        res.json({
            success: true,
            quotation
        });

    } catch (error) {
        console.error('❌ Error updating quotation:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================
// PDF UPLOAD — Sube PDF a Notion (Files & Media)
// =============================================
app.post('/api/quotations/:id/pdf', upload.single('pdf'), async (req, res) => {
    const pageId = req.params.id;

    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No se recibió archivo PDF' });
    }

    const fileName = req.file.originalname || `cotizacion-${pageId}.pdf`;
    const fileBuffer = req.file.buffer;
    const NOTION_VERSION = '2022-06-28';
    const notionToken = process.env.NOTION_TOKEN;

    try {
        // Paso 1: Crear file_upload en Notion
        const createResp = await fetch('https://api.notion.com/v1/file_uploads', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${notionToken}`,
                'Notion-Version': NOTION_VERSION,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ filename: fileName })
        });

        if (!createResp.ok) {
            const err = await createResp.text();
            throw new Error(`file_uploads create failed: ${err}`);
        }

        const { id: fileUploadId } = await createResp.json();
        console.log(`📎 Notion file_upload id: ${fileUploadId}`);

        // Paso 2: Enviar el binario a Notion
        const formData = new FormData();
        formData.append('file', new Blob([fileBuffer], { type: 'application/pdf' }), fileName);

        const sendResp = await fetch(`https://api.notion.com/v1/file_uploads/${fileUploadId}/send`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${notionToken}`,
                'Notion-Version': NOTION_VERSION
                // NO poner Content-Type — FormData lo pone automáticamente con el boundary
            },
            body: formData
        });

        if (!sendResp.ok) {
            const err = await sendResp.text();
            throw new Error(`file_uploads send failed: ${err}`);
        }

        console.log(`✅ PDF enviado a Notion file_uploads (${fileUploadId})`);

        // Paso 3: Actualizar la propiedad "PDF" de la página de cotización
        await notion.pages.update({
            page_id: pageId,
            properties: {
                'PDF': {
                    files: [{
                        type: 'file_upload',
                        file_upload: { id: fileUploadId }
                    }]
                }
            }
        });

        console.log(`☁️ PDF adjuntado a cotización ${pageId} en Notion`);
        res.json({ success: true, fileUploadId });

    } catch (error) {
        console.error('❌ Error subiendo PDF a Notion:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================
// START SERVER
// =============================================
app.listen(PORT, () => {
    console.log('');
    console.log('🚀 ═══════════════════════════════════════════');
    console.log('   MEPEX COTIZADOR API');
    console.log('═══════════════════════════════════════════════');
    console.log(`   ✅ Server running at http://localhost:${PORT}`);
    console.log(`   📦 Database IDs:`);
    console.log(`      - Catalog:  ${DATABASE_ID?.substring(0, 8)}...`);
    console.log(`      - Clients:  ${CLIENTS_DB_ID?.substring(0, 8)}...`);
    console.log(`      - Projects: ${PROJECTS_DB_ID?.substring(0, 8)}...`);
    console.log(`      - Events:   ${EVENTS_DB_ID?.substring(0, 8)}...`);
    console.log(`      - Quotes:   ${QUOTATIONS_DB_ID?.substring(0, 8)}...`);
    console.log('   📍 Endpoints:');
    console.log('      GET  /api/health              - Health check');
    console.log('      GET  /api/catalog             - Get all items');
    console.log('      GET  /api/catalog/schema      - Get DB structure');
    console.log('      GET  /api/catalog/category/:c - Filter by category');
    console.log('      PUT  /api/catalog/:id         - Update item');
    console.log('      POST /api/catalog             - Create item');
    console.log('      GET  /api/clients             - Get all clients');
    console.log('      GET  /api/clients/search?q=   - Search clients');
    console.log('      GET  /api/projects            - Get all projects');
    console.log('      GET  /api/projects/search?q=  - Search projects');
    console.log('      GET  /api/projects/:id        - Get project + relations');
    console.log('      GET  /api/events              - Get all events');
    console.log('      GET  /api/events/search?q=    - Search events');
    console.log('      GET  /api/quotations           - List quotations');
    console.log('      GET  /api/quotations/:id       - Get quotation + state');
    console.log('      POST /api/quotations           - Create quotation');
    console.log('      PUT  /api/quotations/:id       - Update quotation');
    console.log('      POST /api/quotations/:id/pdf   - Upload PDF to Notion');
    console.log('═══════════════════════════════════════════════');
    console.log('');
});
