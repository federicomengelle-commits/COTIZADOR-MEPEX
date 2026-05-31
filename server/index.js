// =============================================
// MEPEX COTIZADOR - BACKEND API v2.0 (Supabase)
// =============================================
// Migrado de Notion a Supabase
// Mismos endpoints, mismos response shapes
// Tablas existentes con column mapping
// =============================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3001;

// Inicializar cliente de Supabase
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// Multer — almacenamiento en memoria para upload de PDFs
const upload = multer({ storage: multer.memoryStorage() });

console.log('📊 Supabase connected:', process.env.SUPABASE_URL?.substring(0, 30) + '...');

// Middleware
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
            return callback(null, true);
        }
        if (origin.includes('vercel.app') || origin.includes('mepex')) {
            return callback(null, true);
        }
        return callback(null, true);
    },
    credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..')));

// =============================================
// FORMATTERS: row → response shape
// =============================================
// Mapean columnas reales de Supabase al shape que espera el frontend

// catalogo_items: id(int), codigo, nombre, rubro, categoria, descripcion, unidad,
//   precio_cliente, precio_alquiler, es_cotizable, favorito, activo, _deleted
//
// PRECIO: el cotizador usa `precio_alquiler` (lo que muestra la "Lista de Precios"
// del módulo Costos de LOBBY), NO `precio_cliente`. precio_cliente quedó como
// columna legacy casi vacía (8/226). El precio canónico de venta es precio_alquiler.
function formatCatalogItem(row) {
    return {
        id: String(row.id),
        notionUrl: null,
        name: row.nombre || '',
        code: row.codigo || '',
        description: row.descripcion || '',
        rubro: row.rubro || '',
        category: row.categoria || '',
        unit: row.unidad || null,
        // Redondeo a pesos enteros: precio_alquiler viene con decimales del costeo
        // de LOBBY (ej. 25273.8) que son artefacto del margen, no plata real. La
        // tarjeta ya mostraba el valor redondeado; redondear acá en el origen hace
        // que tarjeta = cálculo = PDF = CSV y la cuenta cierre al peso.
        price: Math.round(parseFloat(row.precio_alquiler) || 0),
        favorite: row.favorito || false,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

// clientes: id(uuid), nombre_empresa, razon_social, cuit, contacto_empresa, telefono, cargo, correo_electronico, rubro
function formatClient(row) {
    return {
        id: row.id,
        notionUrl: null,
        name: row.nombre_empresa || '',
        razonSocial: row.razon_social || '',
        cuit: row.cuit || 0,
        email: row.correo_electronico || '',
        phone: row.telefono || '',
        rubro: row.rubro ? (Array.isArray(row.rubro) ? row.rubro : [row.rubro]) : [],
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

// proyectos: id(uuid), nombre, cliente_id, cliente_nombre, n_lote, evento_id, evento_nombre, estado, tipo, responsable, empresa
function formatProject(row) {
    return {
        id: row.id,
        notionUrl: null,
        name: row.nombre || '',
        number: parseInt(row.n_lote) || 0,
        area: '',
        status: row.estado || null,
        requestDate: null,
        clientId: row.cliente_id || null,
        eventId: row.evento_id || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

// eventos: id(uuid), nombre, predio, fecha_armado_inicio/fin, fecha_evento_inicio/fin,
//          fecha_desarme_inicio/fin, hora_*_apertura/cierre, color, notas_operativas, _deleted
// Nota: las columnas `lugar`, `fecha_desarme`, `prioridad`, `estado` NO existen en la tabla
// actual — fueron renombradas/eliminadas en el rename `eventos_2026` → `eventos`.
function formatEvent(row) {
    return {
        id: row.id,
        notionUrl: null,
        name: row.nombre || '',
        status: null,                                       // columna no existe en `eventos`
        setupDate: row.fecha_armado_inicio || null,
        teardownDate: row.fecha_desarme_inicio || null,     // antes: row.fecha_desarme
        phone: '',
        pavilion: [],
        totalStands: 0,
        completedStands: 0,
        priority: null,                                     // columna no existe en `eventos`
        eventStartDate: row.fecha_evento_inicio || null,
        eventEndDate: row.fecha_evento_fin || null,
        venue: row.predio || null,                          // antes: row.lugar
        venueId: null,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

// cotizaciones: id(uuid), numero, cliente_id, nombre_evento, tipo_evento, fecha_evento, monto_total, estado, vendedor_id, notas_internas
//   + nuevas columnas: project_id, event_id, tipo_cotizacion, superficie, tipo_stand, altura, subtotal, iva, fecha_emision, full_state, pdf_url
//   + columnas de facturación de LOBBY: pyme_*
function formatQuotation(row) {
    return {
        id: row.id,
        notionUrl: null,
        name: row.numero || '',
        type: row.tipo_cotizacion || null,
        status: row.estado || null,
        clientIds: row.cliente_id ? [row.cliente_id] : [],
        projectIds: row.project_id ? [row.project_id] : [],
        eventIds: row.event_id ? [row.event_id] : [],
        surface: parseFloat(row.superficie) || 0,
        standType: row.tipo_stand || null,
        height: row.altura || null,
        subtotal: parseFloat(row.subtotal) || 0,
        tax: parseFloat(row.iva) || 0,
        total: parseFloat(row.monto_total) || 0,
        date: row.fecha_emision || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        pdfUrl: row.pdf_url || null
    };
}

// =============================================
// ENDPOINTS: HEALTH
// =============================================

app.get('/api/health', async (req, res) => {
    try {
        // Verify Supabase connectivity
        const { count, error } = await supabase
            .from('catalogo_items')
            .select('id', { count: 'exact', head: true });

        if (error) throw error;

        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            version: '2.0.0',
            db: 'supabase',
            catalogItems: count
        });
    } catch (error) {
        console.error('❌ Health check — Supabase error:', error.message);
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            version: '2.0.0',
            db: 'error',
            dbError: error.message
        });
    }
});

// =============================================
// ENDPOINTS: CATÁLOGO (tabla: catalogo_items)
// =============================================

app.get('/api/catalog', async (req, res) => {
    try {
        console.log('📦 Fetching catalog from Supabase...');

        // Solo items marcados COTIZABLES en LOBBY (es_cotizable=true) — espejo de la
        // "Lista de Precios" del módulo Costos. El catálogo del cotizador crece a
        // medida que se marcan items como cotizables allá. Se excluyen los borrados.
        const { data, error } = await supabase
            .from('catalogo_items')
            .select('*')
            .eq('es_cotizable', true)
            .or('activo.eq.true,activo.is.null')
            .or('_deleted.eq.false,_deleted.is.null')
            .order('nombre');

        if (error) throw error;

        const items = data.map(formatCatalogItem);
        console.log(`✅ Fetched ${items.length} items cotizables from Supabase`);

        res.json({
            success: true,
            count: items.length,
            items: items,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error fetching catalog:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/catalog/schema', async (req, res) => {
    try {
        console.log('🔧 Fetching catalog schema...');

        const { data: items, error } = await supabase
            .from('catalogo_items')
            .select('rubro, categoria, unidad')
            .or('activo.eq.true,activo.is.null');

        if (error) throw error;

        const rubros = [...new Set(items.map(i => i.rubro).filter(Boolean))].sort();
        const categorias = [...new Set(items.map(i => i.categoria).filter(Boolean))].sort();
        const unidades = [...new Set(items.map(i => i.unidad).filter(Boolean))].sort();

        const schema = {
            title: 'Catálogo de Items',
            properties: {
                'RUBRO': {
                    type: 'select',
                    name: 'RUBRO',
                    options: rubros.map(r => ({ name: r, color: 'default' }))
                },
                'Categoría': {
                    type: 'multi_select',
                    name: 'Categoría',
                    options: categorias.map(c => ({ name: c, color: 'default' }))
                },
                'Unidad': {
                    type: 'select',
                    name: 'Unidad',
                    options: unidades.map(u => ({ name: u, color: 'default' }))
                }
            }
        };

        console.log('✅ Schema retrieved successfully');
        res.json({ success: true, schema });

    } catch (error) {
        console.error('❌ Error fetching schema:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/catalog/category/:category', async (req, res) => {
    try {
        const { category } = req.params;
        console.log(`📦 Fetching items for category: ${category}`);

        const { data, error } = await supabase
            .from('catalogo_items')
            .select('*')
            .or('activo.eq.true,activo.is.null')
            .eq('categoria', category);

        if (error) throw error;

        const items = data.map(formatCatalogItem);

        res.json({
            success: true,
            category: category,
            count: items.length,
            items: items
        });

    } catch (error) {
        console.error('❌ Error fetching category:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/catalog/:itemId', async (req, res) => {
    try {
        const { itemId } = req.params;
        const { price, name, description, unit, category } = req.body;

        console.log(`✏️ Updating item: ${itemId}`);

        const updateData = {};
        if (price !== undefined) updateData.precio_cliente = price;
        if (name !== undefined) updateData.nombre = name;
        if (description !== undefined) updateData.descripcion = description;
        if (unit !== undefined) updateData.unidad = unit;
        if (category !== undefined) {
            updateData.categoria = Array.isArray(category) ? category.join(', ') : category;
        }

        const { data, error } = await supabase
            .from('catalogo_items')
            .update(updateData)
            .eq('id', parseInt(itemId))
            .select()
            .single();

        if (error) throw error;

        console.log('✅ Item updated successfully');
        res.json({ success: true, item: formatCatalogItem(data) });

    } catch (error) {
        console.error('❌ Error updating item:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/catalog', async (req, res) => {
    try {
        const { name, code, description, category, unit, price } = req.body;

        console.log(`➕ Creating new item: ${name}`);

        const newRow = {
            nombre: name || '',
            codigo: code || '',
            descripcion: description || '',
            categoria: Array.isArray(category) ? category.join(', ') : (category || ''),
            unidad: unit || null,
            precio_cliente: price || 0,
            favorito: false,
            activo: true
        };

        const { data, error } = await supabase
            .from('catalogo_items')
            .insert(newRow)
            .select()
            .single();

        if (error) throw error;

        console.log('✅ Item created successfully');
        res.json({ success: true, item: formatCatalogItem(data) });

    } catch (error) {
        console.error('❌ Error creating item:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================
// ENDPOINTS: CLIENTES (tabla: clientes)
// =============================================

app.get('/api/clients', async (req, res) => {
    try {
        console.log('👥 Fetching clients from Supabase...');

        const { data, error } = await supabase
            .from('clientes')
            .select('*')
            .order('nombre_empresa');

        if (error) throw error;

        const clients = data.map(formatClient);
        console.log(`✅ Fetched ${clients.length} clients`);

        res.json({
            success: true,
            count: clients.length,
            clients: clients,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error fetching clients:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/clients/search', async (req, res) => {
    try {
        const { q } = req.query;
        console.log(`🔍 Searching clients for: "${q}"`);

        if (!q || q.length < 2) {
            return res.json({ success: true, results: [] });
        }

        const { data, error } = await supabase
            .from('clientes')
            .select('*')
            .ilike('nombre_empresa', `%${q}%`)
            .limit(10);

        if (error) throw error;

        res.json({ success: true, results: data.map(formatClient) });

    } catch (error) {
        console.error('❌ Error searching clients:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================
// ENDPOINTS: PROYECTOS (tabla: proyectos)
// =============================================

app.get('/api/projects', async (req, res) => {
    try {
        console.log('📁 Fetching projects from Supabase...');

        const { data, error } = await supabase
            .from('proyectos')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const projects = data.map(formatProject);
        console.log(`✅ Fetched ${projects.length} projects`);

        res.json({
            success: true,
            count: projects.length,
            projects: projects,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error fetching projects:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/projects/search', async (req, res) => {
    try {
        const { q } = req.query;
        console.log(`🔍 Searching projects for: "${q}"`);

        if (!q || q.length < 2) {
            return res.json({ success: true, results: [] });
        }

        const { data, error } = await supabase
            .from('proyectos')
            .select('*')
            .ilike('nombre', `%${q}%`)
            .limit(10);

        if (error) throw error;

        res.json({ success: true, results: data.map(formatProject) });

    } catch (error) {
        console.error('❌ Error searching projects:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/projects/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        console.log(`📁 Fetching project: ${projectId}`);

        const { data: projectRow, error } = await supabase
            .from('proyectos')
            .select('*')
            .eq('id', projectId)
            .single();

        if (error) throw error;

        const project = formatProject(projectRow);

        // Obtener cliente relacionado
        if (project.clientId) {
            try {
                const { data: clientRow } = await supabase
                    .from('clientes')
                    .select('*')
                    .eq('id', project.clientId)
                    .single();
                if (clientRow) project.client = formatClient(clientRow);
            } catch (e) {
                console.warn('⚠️ Could not fetch related client:', e.message);
            }
        }

        // Obtener evento relacionado
        if (project.eventId) {
            try {
                const { data: eventRow } = await supabase
                    .from('eventos')
                    .select('*')
                    .eq('id', project.eventId)
                    .single();
                if (eventRow) project.event = formatEvent(eventRow);
            } catch (e) {
                console.warn('⚠️ Could not fetch related event:', e.message);
            }
        }

        res.json({ success: true, project });

    } catch (error) {
        console.error('❌ Error fetching project:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================
// ENDPOINTS: EVENTOS (tabla: eventos)
// =============================================

app.get('/api/events', async (req, res) => {
    try {
        console.log('📅 Fetching events from Supabase...');

        const { data, error } = await supabase
            .from('eventos')
            .select('*')
            .order('fecha_evento_inicio', { ascending: true, nullsFirst: false });

        if (error) throw error;

        const events = data.map(formatEvent);
        console.log(`✅ Fetched ${events.length} events`);

        res.json({
            success: true,
            count: events.length,
            events: events,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error fetching events:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/events/search', async (req, res) => {
    try {
        const { q } = req.query;
        console.log(`🔍 Searching events for: "${q}"`);

        if (!q || q.length < 2) {
            return res.json({ success: true, results: [] });
        }

        const { data, error } = await supabase
            .from('eventos')
            .select('*')
            .ilike('nombre', `%${q}%`)
            .limit(10);

        if (error) throw error;

        res.json({ success: true, results: data.map(formatEvent) });

    } catch (error) {
        console.error('❌ Error searching events:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================
// ENDPOINTS: COTIZACIONES — NEXT NUMBER (tabla: cotizaciones)
// =============================================

app.get('/api/cotizaciones/next-number', async (req, res) => {
    try {
        const currentYear = new Date().getFullYear();
        const prefix = `COT-${currentYear}-`;
        console.log(`🔢 Buscando siguiente número de cotización para ${currentYear}...`);

        const { data, error } = await supabase
            .from('cotizaciones')
            .select('numero')
            .like('numero', `${prefix}%`);

        if (error) throw error;

        const regex = /^COT-(\d{4})-(\d{4})$/;
        let maxSeq = 0;

        (data || []).forEach(row => {
            const match = row.numero?.match(regex);
            if (match && parseInt(match[1]) === currentYear) {
                const seq = parseInt(match[2]);
                if (seq > maxSeq) maxSeq = seq;
            }
        });

        const nextSeq = maxSeq + 1;
        const formatted = `COT-${currentYear}-${String(nextSeq).padStart(4, '0')}`;

        console.log(`✅ Siguiente cotización: ${formatted} (${(data || []).length} encontradas en ${currentYear})`);

        res.json({
            success: true,
            year: currentYear,
            next: nextSeq,
            formatted,
            existingCount: (data || []).length
        });

    } catch (error) {
        console.error('❌ Error obteniendo next-number:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================
// ENDPOINTS: COTIZACIONES (tabla: cotizaciones)
// =============================================

// Listar cotizaciones (sin fullState)
app.get('/api/quotations', async (req, res) => {
    try {
        console.log('📋 Fetching quotations from Supabase...');

        const { data, error } = await supabase
            .from('cotizaciones')
            .select('id, numero, tipo_cotizacion, estado, cliente_id, project_id, event_id, superficie, tipo_stand, altura, subtotal, iva, monto_total, fecha_emision, pdf_url, created_at, updated_at')
            .order('fecha_emision', { ascending: false, nullsFirst: false });

        if (error) throw error;

        const quotations = data.map(formatQuotation);
        console.log(`✅ Fetched ${quotations.length} quotations`);

        res.json({
            success: true,
            count: quotations.length,
            quotations: quotations,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error fetching quotations:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Obtener cotización completa (con fullState)
app.get('/api/quotations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`📋 Fetching quotation: ${id}`);

        const { data, error } = await supabase
            .from('cotizaciones')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        const quotation = formatQuotation(data);
        quotation.fullState = data.full_state || null;
        quotation.pdfUrl = data.pdf_url || null;

        res.json({ success: true, quotation });

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

        // Mapas de capitalización (compatibilidad con frontend)
        const typeMap = { stand: 'Stand', expo: 'Expo', alquiler: 'Alquiler' };
        const standTypeMap = { centro: 'Centro', esquina: 'Esquina', peninsula: 'Peninsula', isla: 'Isla' };
        const heightMap = { 'estándar': 'Estándar', 'media': 'Media', 'plus': 'Plus', 'extra': 'Extra', 'máxima': 'Máxima' };

        const row = {
            numero: data.cotNumber || '',
            tipo_cotizacion: data.type ? (typeMap[data.type.toLowerCase()] || data.type) : null,
            cliente_id: data.clientId || null,
            project_id: data.projectId || null,
            event_id: data.eventId || null,
            superficie: data.surface || 0,
            tipo_stand: data.standType ? (standTypeMap[data.standType.toLowerCase()] || data.standType) : null,
            altura: data.height ? (heightMap[data.height.toLowerCase()] || data.height) : null,
            subtotal: data.subtotal || 0,
            iva: data.tax || 0,
            monto_total: data.total || 0,
            fecha_emision: data.date || null,
            full_state: data.fullState || null
        };

        const { data: inserted, error } = await supabase
            .from('cotizaciones')
            .insert(row)
            .select()
            .single();

        if (error) throw error;

        const quotation = formatQuotation(inserted);
        console.log(`✅ Quotation created: ${quotation.name} (${quotation.id})`);

        res.json({ success: true, quotation });

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

        const typeMap = { stand: 'Stand', expo: 'Expo', alquiler: 'Alquiler' };
        const standTypeMap = { centro: 'Centro', esquina: 'Esquina', peninsula: 'Peninsula', isla: 'Isla' };
        const heightMap = { 'estándar': 'Estándar', 'media': 'Media', 'plus': 'Plus', 'extra': 'Extra', 'máxima': 'Máxima' };

        const updateData = {};
        if (data.cotNumber !== undefined) updateData.numero = data.cotNumber;
        if (data.type !== undefined) updateData.tipo_cotizacion = typeMap[data.type.toLowerCase()] || data.type;
        if (data.clientId !== undefined) updateData.cliente_id = data.clientId || null;
        if (data.projectId !== undefined) updateData.project_id = data.projectId || null;
        if (data.eventId !== undefined) updateData.event_id = data.eventId || null;
        if (data.surface !== undefined) updateData.superficie = data.surface;
        if (data.standType !== undefined) updateData.tipo_stand = standTypeMap[data.standType.toLowerCase()] || data.standType;
        if (data.height !== undefined) updateData.altura = heightMap[data.height.toLowerCase()] || data.height;
        if (data.subtotal !== undefined) updateData.subtotal = data.subtotal;
        if (data.tax !== undefined) updateData.iva = data.tax;
        if (data.total !== undefined) updateData.monto_total = data.total;
        if (data.date !== undefined) updateData.fecha_emision = data.date;
        if (data.fullState !== undefined) updateData.full_state = data.fullState;

        const { data: updated, error } = await supabase
            .from('cotizaciones')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        const quotation = formatQuotation(updated);
        console.log(`✅ Quotation updated: ${quotation.name}`);

        res.json({ success: true, quotation });

    } catch (error) {
        console.error('❌ Error updating quotation:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================
// PDF UPLOAD — Supabase Storage (bucket: cotizaciones-pdf)
// =============================================
app.post('/api/quotations/:id/pdf', upload.single('pdf'), async (req, res) => {
    const quotationId = req.params.id;

    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No se recibió archivo PDF' });
    }

    const fileName = req.file.originalname || `cotizacion-${quotationId}.pdf`;
    const filePath = `${quotationId}/${fileName}`;
    const fileBuffer = req.file.buffer;

    try {
        console.log(`📎 Uploading PDF: ${fileName} for quotation ${quotationId}`);

        // Subir a Supabase Storage
        const { error: uploadError } = await supabase.storage
            .from('cotizaciones-pdf')
            .upload(filePath, fileBuffer, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (uploadError) throw uploadError;

        // Obtener URL pública
        const { data: urlData } = supabase.storage
            .from('cotizaciones-pdf')
            .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;

        // Guardar URL en la cotización
        const { error: updateError } = await supabase
            .from('cotizaciones')
            .update({ pdf_url: publicUrl })
            .eq('id', quotationId);

        if (updateError) throw updateError;

        console.log(`✅ PDF uploaded and linked to quotation ${quotationId}`);
        res.json({ success: true, fileUploadId: filePath, pdfUrl: publicUrl });

    } catch (error) {
        console.error('❌ Error subiendo PDF:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================
// DELETE QUOTATION
// =============================================
app.delete('/api/quotations/:id', async (req, res) => {
    const { id } = req.params;
    try {
        console.log(`🗑️ Deleting quotation: ${id}`);

        // 1. Obtener cotización para ver si tiene PDF
        const { data: existing, error: fetchError } = await supabase
            .from('cotizaciones')
            .select('id, numero, pdf_url')
            .eq('id', id)
            .single();

        if (fetchError || !existing) {
            return res.status(404).json({ success: false, error: 'Cotización no encontrada' });
        }

        // 2. Borrar PDF del storage si existe
        if (existing.pdf_url) {
            const pdfPath = `${id}/${existing.numero}.pdf`;
            console.log(`   📎 Removing PDF: ${pdfPath}`);
            await supabase.storage
                .from('cotizaciones-pdf')
                .remove([pdfPath]);
        }

        // 3. Borrar cotización de la tabla
        const { error } = await supabase
            .from('cotizaciones')
            .delete()
            .eq('id', id);

        if (error) throw error;

        console.log(`✅ Quotation ${existing.numero || id} deleted`);
        res.json({ success: true, deleted: id });

    } catch (error) {
        console.error('❌ Error deleting quotation:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================
// START SERVER
// =============================================
app.listen(PORT, () => {
    console.log('');
    console.log('🚀 ═══════════════════════════════════════════');
    console.log('   MEPEX COTIZADOR API v2.0 (Supabase)');
    console.log('═══════════════════════════════════════════════');
    console.log(`   ✅ Server running at http://localhost:${PORT}`);
    console.log(`   🔗 Supabase: ${process.env.SUPABASE_URL?.substring(0, 40)}...`);
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
    console.log('      GET  /api/cotizaciones/next-number - Next COT number');
    console.log('      GET  /api/quotations          - List quotations');
    console.log('      GET  /api/quotations/:id      - Get quotation + state');
    console.log('      POST /api/quotations          - Create quotation');
    console.log('      PUT  /api/quotations/:id      - Update quotation');
    console.log('      POST /api/quotations/:id/pdf  - Upload PDF');
    console.log('   📦 Tables: catalogo_items, clientes, proyectos, eventos, cotizaciones');
    console.log('═══════════════════════════════════════════════');
    console.log('');
});
