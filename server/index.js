// =============================================
// MEPEX COTIZADOR - BACKEND API v2.0 (Supabase)
// =============================================
// Migrado de Notion a Supabase
// Mismos endpoints, mismos response shapes
// Tablas existentes con column mapping
// =============================================

// Cargar .env desde el directorio del server (no del cwd) → robusto ante pm2,
// `node server/index.js` desde la raíz, o cualquier cwd.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
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

// Static con revalidación obligatoria para HTML/JS/CSS: el navegador puede
// cachear, pero SIEMPRE revalida (conditional GET → 304 si no cambió, fresh si
// cambió). Evita la clase de bug "front viejo cacheado tras deploy" (p.ej. el
// numerador clavado porque el browser servía un script.js previo con fallback).
// Los assets (imágenes/fuentes) sí pueden cachear largo.
app.use(express.static(path.join(__dirname, '..'), {
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
        if (/\.(html|js|css)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'no-cache');
        } else if (/\.(png|jpe?g|gif|svg|woff2?|ttf|ico)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
        }
    }
}));

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
// El grouping rubro→key vive en el FRONT (api.js convertToLocalFormat); acá pasamos
// los valores crudos (rubro/categoria) tal cual para que el front los mapee.
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
        // Variantes paramétricas (familia + medida). Permiten agrupar items del
        // mismo producto en distintas medidas bajo una sola card con selector.
        // Hoy ningún item cotizable es paramétrico → el front los ignora hasta
        // que se marquen cotizables en Costos.
        parametric: row.parametrico || false,
        familia: row.familia || null,
        medidaMm: row.medida_mm != null ? parseInt(row.medida_mm) : null,
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

// NOTA: los endpoints de ESCRITURA del catálogo (PUT /api/catalog/:id y
// POST /api/catalog) se eliminaron en el barrido de consistencia. Eran código
// muerto (ningún caller en el front) y además violaban la regla del proyecto:
// catalogo_items es de LOBBY/Costos, el cotizador SOLO LEE. Encima escribían
// precio_cliente, que ya no es la columna de precio (ahora es precio_alquiler).
// El alta/edición de items se hace en el módulo Costos de LOBBY.

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

// POST (no GET): consume un número del contador atómico, no debe cachearse
// ni prefetcharse. La función SQL siguiente_numero_cotizacion(anio) incrementa
// y devuelve en una sola operación → sin race conditions ni números duplicados.
app.post('/api/cotizaciones/next-number', async (req, res) => {
    try {
        const currentYear = new Date().getFullYear();
        console.log(`🔢 Reservando siguiente número de cotización para ${currentYear}...`);

        const { data, error } = await supabase
            .rpc('siguiente_numero_cotizacion', { p_anio: currentYear });

        if (error) throw error;

        const nextSeq = data;  // entero devuelto por la función
        const formatted = `COT-${currentYear}-${String(nextSeq).padStart(4, '0')}`;

        console.log(`✅ Número reservado: ${formatted}`);

        res.json({ success: true, year: currentYear, next: nextSeq, formatted });

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

// Pobla las tablas normalizadas (cotizacion_espacios + cotizacion_items) a partir
// del bloque `normalized` que arma el front. DEGRADACIÓN SEGURA: si algo falla
// (tabla inexistente, error de insert), se loguea pero NO se propaga — la
// cotización ya quedó guardada con full_state. Idempotente: borra lo previo
// antes de insertar (sirve para re-guardados vía PUT).
async function insertNormalized(cotizacionId, normalized) {
    if (!normalized || (!normalized.items?.length && !normalized.espacios?.length)) return;
    try {
        // Limpiar lo previo de esta cotización (items primero por la FK a espacios)
        await supabase.from('cotizacion_items').delete().eq('cotizacion_id', cotizacionId);
        await supabase.from('cotizacion_espacios').delete().eq('cotizacion_id', cotizacionId);

        // Espacios → insertar y mapear tempId del front → uuid real
        const tempToReal = {};
        if (normalized.espacios?.length) {
            const espRows = normalized.espacios.map((e, i) => ({
                cotizacion_id: cotizacionId,
                nombre: e.nombre || 'Espacio',
                superficie: e.superficie ?? null,
                posicion: e.posicion ?? i
            }));
            const { data: insEsp, error: errEsp } = await supabase
                .from('cotizacion_espacios').insert(espRows).select('id, posicion');
            if (errEsp) throw errEsp;
            normalized.espacios.forEach((e, i) => {
                const match = insEsp.find(r => r.posicion === (e.posicion ?? i)) || insEsp[i];
                if (match) tempToReal[e.tempId] = match.id;
            });
        }

        // Items
        if (normalized.items?.length) {
            const itemRows = normalized.items.map((it, i) => ({
                cotizacion_id: cotizacionId,
                espacio_id: it.espacioTempId ? (tempToReal[it.espacioTempId] || null) : null,
                catalogo_item_id: Number.isInteger(it.catalogoItemId) ? it.catalogoItemId : null,
                nombre: it.nombre || '',
                codigo: it.codigo || null,
                unidad: it.unidad || null,
                rubro: it.rubro || null,
                categoria: it.categoria || null,
                precio_unitario_base: it.precioUnitarioBase || 0,
                precio_unitario_ajustado: it.precioUnitarioAjustado || 0,
                cantidad: it.cantidad || 0,
                subtotal_linea: it.subtotalLinea || 0,
                height_multiplier_aplicado: it.heightMultAplicado ?? 1,
                modifier_pct_aplicado: it.modifierPctAplicado ?? 0,
                fee_pct_aplicado: it.feePctAplicado ?? 0,
                posicion: it.posicion ?? i
            }));
            const { error: errItems } = await supabase.from('cotizacion_items').insert(itemRows);
            if (errItems) throw errItems;
        }
        console.log(`   📐 Normalizado: ${normalized.espacios?.length || 0} espacios, ${normalized.items?.length || 0} items`);
    } catch (e) {
        console.warn('   ⚠️ No se pudieron poblar las tablas normalizadas (full_state intacto):', e.message);
    }
}

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

        // Poblar tablas normalizadas (no bloquea: si falla, full_state ya quedó)
        await insertNormalized(inserted.id, data.normalized);

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

        // Re-poblar tablas normalizadas si el front mandó el bloque (idempotente)
        if (data.normalized !== undefined) await insertNormalized(id, data.normalized);

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
// PROPUESTAS — Panel de propuestas comerciales (Fase 2.3)
// =============================================
// Guarda el PDF de la propuesta (generado por /propuesta-api) en el bucket
// `propuestas-pdf` + una fila en `cotizacion_propuestas` para listarlas en la
// sidebar. Tabla y bucket PROPIOS del cotizador (migración 004). Espejo del
// flujo de upload de PDF de cotizaciones.
const { randomUUID } = require('crypto');

function mapPropuesta(row) {
    return {
        id: row.id,
        cliente: row.cliente,
        evento: row.evento,
        modo: row.modo,
        total: row.total,
        ref: row.ref,
        cotizacionId: row.cotizacion_id,
        pdfUrl: row.pdf_url,
        createdAt: row.created_at
    };
}

// Guardar una propuesta: sube el PDF (multipart) + inserta la metadata.
app.post('/api/propuestas', upload.single('pdf'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No se recibió archivo PDF' });
    }
    const body = req.body || {};
    const id = randomUUID();
    const safeName = String(body.fileName || `Propuesta-${id}.pdf`)
        .replace(/[^\w.\- ]+/g, '').trim().slice(0, 120) || `${id}.pdf`;
    const filePath = `${id}/${safeName}`;

    try {
        console.log(`📎 Guardando propuesta ${id} (${safeName})`);

        const { error: uploadError } = await supabase.storage
            .from('propuestas-pdf')
            .upload(filePath, req.file.buffer, { contentType: 'application/pdf', upsert: true });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('propuestas-pdf').getPublicUrl(filePath);
        const pdfUrl = urlData.publicUrl;

        let payload = null;
        if (body.payload) { try { payload = JSON.parse(body.payload); } catch (_) { /* snapshot opcional */ } }
        const totalNum = body.total != null && body.total !== '' ? Number(body.total) : null;

        const { data, error } = await supabase
            .from('cotizacion_propuestas')
            .insert({
                id,
                cliente: body.cliente || null,
                evento: body.evento || null,
                modo: body.modo || null,
                total: Number.isFinite(totalNum) ? totalNum : null,
                ref: body.ref || null,
                cotizacion_id: body.cotizacionId || null,
                pdf_url: pdfUrl,
                pdf_path: filePath,
                payload
            })
            .select()
            .single();
        if (error) throw error;

        console.log(`✅ Propuesta ${id} guardada`);
        res.json({ success: true, propuesta: mapPropuesta(data) });
    } catch (error) {
        console.error('❌ Error guardando propuesta:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Listar propuestas (más nuevas primero)
app.get('/api/propuestas', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('cotizacion_propuestas')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json({ success: true, propuestas: (data || []).map(mapPropuesta) });
    } catch (error) {
        console.error('❌ Error listando propuestas:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Eliminar una propuesta (borra el PDF del storage + la fila)
app.delete('/api/propuestas/:id', async (req, res) => {
    const { id } = req.params;
    try {
        console.log(`🗑️ Eliminando propuesta: ${id}`);
        const { data: existing } = await supabase
            .from('cotizacion_propuestas')
            .select('id, pdf_path')
            .eq('id', id)
            .single();

        if (existing && existing.pdf_path) {
            await supabase.storage.from('propuestas-pdf').remove([existing.pdf_path]);
        }

        const { error } = await supabase.from('cotizacion_propuestas').delete().eq('id', id);
        if (error) throw error;

        console.log(`✅ Propuesta ${id} eliminada`);
        res.json({ success: true, deleted: id });
    } catch (error) {
        console.error('❌ Error eliminando propuesta:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// =============================================
// IA — generación de texto con Claude (Haiku)
// =============================================
// Toda llamada al LLM vive acá, en el backend: la API key va en server/.env
// (mismo patrón que la service key de Supabase). El front NUNCA ve la key.
// Requiere Node 18+ (usa fetch global). Modelo por defecto: Claude Haiku 4.5.
const AI_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
const AI_ENABLED = !!process.env.ANTHROPIC_API_KEY;
console.log(AI_ENABLED ? `🤖 IA habilitada (${AI_MODEL})` : '🤖 IA deshabilitada (falta ANTHROPIC_API_KEY en server/.env)');

async function callClaude({ system, user, maxTokens = 600, temperature, image }) {
    if (!AI_ENABLED) {
        const err = new Error('IA no configurada: falta ANTHROPIC_API_KEY en server/.env');
        err.code = 'NO_KEY';
        throw err;
    }
    // Con imagen → content multimodal (visión); sin imagen → string simple.
    const content = image
        ? [
            { type: 'image', source: { type: 'base64', media_type: image.media_type || 'image/jpeg', data: image.data } },
            { type: 'text', text: user }
        ]
        : user;
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            model: AI_MODEL,
            max_tokens: maxTokens,
            ...(temperature != null ? { temperature } : {}),
            system,
            messages: [{ role: 'user', content }]
        })
    });
    if (!resp.ok) {
        const detail = await resp.text().catch(() => '');
        throw new Error(`Anthropic API ${resp.status}: ${detail.slice(0, 300)}`);
    }
    const data = await resp.json();
    return (data?.content || []).map(b => b.text || '').join('').trim();
}

// Estado de la IA — el front lo consulta para mostrar/ocultar features de IA
app.get('/api/ai/status', (req, res) => {
    res.json({ enabled: AI_ENABLED, model: AI_ENABLED ? AI_MODEL : null });
});

// Caption de render (VISIÓN): mira la imagen del stand → comentario aclaratorio breve.
// Para la sección "Diseño del proyecto" de la propuesta (Fase 3.1). El front lo propone
// y el usuario lo edita. image.data = base64 SIN el prefijo data-URI.
app.post('/api/ai/render-caption', async (req, res) => {
    try {
        const body = req.body || {};
        const img = body.image || {};
        let data = img.data || '';
        let mediaType = img.media_type || 'image/jpeg';
        // Tolerar que llegue el data-URI completo: lo partimos.
        const m = /^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i.exec(data);
        if (m) { mediaType = m[1]; data = m[2]; }
        if (!data) return res.status(400).json({ success: false, error: 'Falta la imagen' });

        const ctx = body.contexto || {};
        const system = [
            'Sos redactor comercial de MEPEX (stands y exposiciones, Argentina). Mirás un RENDER del stand y escribís un comentario aclaratorio BREVE para la propuesta.',
            '1 sola oración, 12 a 25 palabras, español rioplatense, tono profesional y directo.',
            'Describí lo relevante que SE VE (estructura/sistema modular OCTEXA, gráfica, mostrador/vitrinas, iluminación, espacios) en relación al proyecto. NO inventes lo que no se ve. Sin precios, sin comillas, sin viñetas.',
            'Devolvés SOLO el comentario.'
        ].join('\n');
        const lines = [];
        if (ctx.cliente) lines.push(`Cliente: ${ctx.cliente}`);
        if (ctx.evento) lines.push(`Evento: ${ctx.evento}`);
        if (ctx.tipo) lines.push(`Tipo: ${ctx.tipo}`);
        const user = `Contexto del proyecto:\n${lines.join('\n') || '(sin datos)'}\n\nEscribí el comentario del render.`;

        const text = await callClaude({
            system, user, maxTokens: 120, temperature: 0.5,
            image: { media_type: mediaType, data }
        });
        res.json({ success: true, caption: text });
    } catch (error) {
        const status = error.code === 'NO_KEY' ? 503 : 502;
        console.error('❌ IA render-caption:', error.message);
        res.status(status).json({ success: false, error: error.message });
    }
});

// Sanata comercial: descripción breve de la propuesta para el PDF
app.post('/api/ai/sanata', async (req, res) => {
    try {
        const ctx = req.body || {};
        const items = Array.isArray(ctx.items) ? ctx.items : [];
        // Agrupado por rubro y SIN cantidades: el texto habla en generalidades, no
        // enumera inventario (era una de las causas de la "sanata" larga e inflada).
        const byRubro = {};
        items.forEach(i => {
            const r = i.rubro || 'Otros';
            (byRubro[r] = byRubro[r] || []).push(i.nombre);
        });
        const rubrosTxt = Object.keys(byRubro).length
            ? Object.entries(byRubro).map(([r, ns]) => `- ${r}: ${[...new Set(ns)].join(', ')}`).join('\n')
            : '(todavía sin ítems cargados)';

        const system = [
            'Sos redactor comercial de MEPEX (montaje y equipamiento para stands y exposiciones, Argentina). Español rioplatense, tono profesional y directo.',
            'Devolvés un texto BREVE: 2 a 4 oraciones, 35 a 70 palabras, sin viñetas, sin títulos, sin precios, sin números de presupuesto y SIN cantidades.',
            'Estructura: (1) una oración de encabezado con los datos que TENGAS — "Propuesta para <cliente>" y, si están, proyecto, evento y fechas; omití los que falten, nunca escribas "s/d" ni inventes. (2) una o dos oraciones describiendo EN GENERAL los rubros involucrados, sin enumerar los ítems uno por uno (podés nombrar 1 o 2 piezas emblemáticas si aportan a la imagen del stand).',
            'Reglas por rubro (usá solo las que apliquen según los ítems del contexto):',
            '- Paneles, estructura, infraestructura o sistema modular → mencioná "sistema modular OCTEXA".',
            '- Vinilos o gráfica impresa → decí simplemente "vinilo impreso y colocado".',
            '- Iluminación → mencionala al pasar.',
            '- Mobiliario de atención (mostradores, vitrinas, exhibidores, banquetas, mesas) → podés nombrar 1 o 2 piezas clave para dar imagen del puesto de atención (ej. "mostrador y vitrinas"), sin listar todo.',
            '- Pantallas o equipamiento electrónico/audiovisual → nombralo por encima ("equipamiento audiovisual"), SIN detalles técnicos.',
            '- Pisos y servicios → mencionalos en general si están.',
            'NO inventes ítems, materiales, marcas ni datos que no estén en el contexto. NO agregues experiencias, sensaciones ni beneficios fabricados. Si un dato no está, no lo menciones.'
        ].join('\n');

        const lines = [`- Cliente: ${ctx.cliente || 's/d'}`];
        if (ctx.proyecto) lines.push(`- Proyecto: ${ctx.proyecto}`);
        if (ctx.evento) lines.push(`- Evento: ${ctx.evento}`);
        if (ctx.fechas) lines.push(`- Fechas: ${ctx.fechas}`);
        if (ctx.lugar) lines.push(`- Lugar: ${ctx.lugar}`);
        lines.push(`- Tipo: ${ctx.tipo || 'stand'}`);
        if (ctx.superficie) lines.push(`- Superficie: ${ctx.superficie} m²`);
        if (ctx.tipoStand) lines.push(`- Tipo de stand: ${ctx.tipoStand}`);
        if (ctx.altura) lines.push(`- Altura: ${ctx.altura}`);
        if (Array.isArray(ctx.espacios) && ctx.espacios.length) lines.push(`- Espacios: ${ctx.espacios.join(', ')}`);
        const user = `Datos de la propuesta:\n${lines.join('\n')}\n\nRubros presentes (agrupados, sin cantidades):\n${rubrosTxt}\n\nEscribí el texto breve siguiendo las reglas.`;

        const text = await callClaude({ system, user, maxTokens: 350, temperature: 0.4 });
        res.json({ success: true, text });
    } catch (error) {
        const status = error.code === 'NO_KEY' ? 503 : 502;
        console.error('❌ IA sanata:', error.message);
        res.status(status).json({ success: false, error: error.message });
    }
});

// Brief → cotización: extrae params + ítems del catálogo a partir de un brief (Fase 3)
app.post('/api/ai/brief', async (req, res) => {
    try {
        const { brief, catalog } = req.body || {};
        if (!brief) return res.status(400).json({ success: false, error: 'Falta el brief' });
        const system = 'Sos un asistente de cotización de MEPEX. A partir de un brief de reunión y un catálogo de ítems, devolvés EXCLUSIVAMENTE un JSON válido (sin texto extra) con esta forma: {"params":{"tipo":"stand|expo|alquiler","superficie":number,"standType":"centro|esquina|peninsula|isla","altura":"standard|media|plus|extra|maxima"},"items":[{"id":"<id del catalogo>","cantidad":number,"confianza":0a1}],"notas":"string"}. Elegí SOLO ids que existan en el catálogo provisto. Si dudás de un ítem, incluilo igual con confianza baja (<0.5). No inventes ids ni cantidades absurdas.';
        const user = `CATÁLOGO (id · nombre · rubro · unidad):\n${(catalog || []).map(i => `${i.id} · ${i.name} · ${i.rubro || i.category || ''} · ${i.unit || ''}`).join('\n')}\n\nBRIEF:\n${brief}`;
        const text = await callClaude({ system, user, maxTokens: 1800 });
        let parsed = null;
        try {
            const match = text.match(/\{[\s\S]*\}/);
            parsed = JSON.parse(match ? match[0] : text);
        } catch (e) {
            return res.status(502).json({ success: false, error: 'La IA no devolvió JSON válido', raw: text });
        }
        res.json({ success: true, ...parsed });
    } catch (error) {
        const status = error.code === 'NO_KEY' ? 503 : 502;
        console.error('❌ IA brief:', error.message);
        res.status(status).json({ success: false, error: error.message });
    }
});

// Sugerencias fantasma (cross-sell) contextuales con IA (Fase 4). El front pasa los
// ítems YA cargados + un catálogo de candidatos (no cargados); la IA elige hasta 4
// complementos. Validamos los ids contra el catálogo provisto (sin alucinaciones).
app.post('/api/ai/ghosts', async (req, res) => {
    try {
        const { loaded = [], candidates = [], tipo, superficie } = req.body || {};
        if (!candidates.length) return res.json({ success: true, suggestions: [] });
        const system = 'Sos un asesor comercial de MEPEX (montaje y equipamiento para stands y exposiciones). Te paso los ítems YA cargados en una cotización y un CATÁLOGO de candidatos (ítems NO cargados). Sugerí hasta 4 ítems del catálogo que mejor COMPLEMENTEN la propuesta (cross-sell coherente y útil para el cliente, no relleno). Devolvé EXCLUSIVAMENTE un JSON válido, sin texto extra, con la forma {"suggestions":[{"id":"<id EXACTO del catálogo>","motivo":"<máx 5 palabras>"}]}. Usá SOLO ids que existan en candidates. No sugieras ítems ya cargados. Si no hay buenos complementos, devolvé {"suggestions":[]}.';
        const user = `CONTEXTO: tipo=${tipo || 'stand'}${superficie ? `, superficie=${superficie}m²` : ''}\n\nYA CARGADOS:\n${loaded.map(i => `- ${i.name} (${i.rubro || ''})`).join('\n') || '(ninguno)'}\n\nCATÁLOGO CANDIDATOS (id · nombre · rubro):\n${candidates.map(i => `${i.id} · ${i.name} · ${i.rubro || ''}`).join('\n')}`;
        const text = await callClaude({ system, user, maxTokens: 400 });
        let parsed = { suggestions: [] };
        try { const m = text.match(/\{[\s\S]*\}/); parsed = JSON.parse(m ? m[0] : text); } catch { /* respuesta no-JSON → sin sugerencias */ }
        const valid = new Set(candidates.map(c => c.id));
        const suggestions = (parsed.suggestions || []).filter(s => s && valid.has(s.id)).slice(0, 4);
        res.json({ success: true, suggestions });
    } catch (error) {
        const status = error.code === 'NO_KEY' ? 503 : 502;
        console.error('❌ IA ghosts:', error.message);
        res.status(status).json({ success: false, error: error.message });
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
    console.log('      GET  /api/clients             - Get all clients');
    console.log('      GET  /api/clients/search?q=   - Search clients');
    console.log('      GET  /api/projects            - Get all projects');
    console.log('      GET  /api/projects/search?q=  - Search projects');
    console.log('      GET  /api/projects/:id        - Get project + relations');
    console.log('      GET  /api/events              - Get all events');
    console.log('      GET  /api/events/search?q=    - Search events');
    console.log('      POST /api/cotizaciones/next-number - Reserve next COT number');
    console.log('      GET  /api/quotations          - List quotations');
    console.log('      GET  /api/quotations/:id      - Get quotation + state');
    console.log('      POST /api/quotations          - Create quotation');
    console.log('      PUT  /api/quotations/:id      - Update quotation');
    console.log('      POST /api/quotations/:id/pdf  - Upload PDF');
    console.log('      GET  /api/propuestas          - List propuestas');
    console.log('      POST /api/propuestas          - Save propuesta (PDF + meta)');
    console.log('      DELETE /api/propuestas/:id    - Delete propuesta');
    console.log('   📦 Tables: catalogo_items, clientes, proyectos, eventos, cotizaciones, cotizacion_propuestas');
    console.log('═══════════════════════════════════════════════');
    console.log('');
});
