// =============================================
// MIGRACIÓN ONE-TIME: Notion → Supabase
// =============================================
// Uso: node migrate-notion-to-supabase.js
// Requiere: .env con NOTION_TOKEN + SUPABASE_URL + SUPABASE_SERVICE_KEY
// =============================================

require('dotenv').config();
const { Client } = require('@notionhq/client');
const { createClient } = require('@supabase/supabase-js');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Notion DB IDs
const CATALOG_DB = process.env.NOTION_DATABASE_ID;
const CLIENTS_DB = process.env.NOTION_CLIENTS_DB_ID;
const PROJECTS_DB = process.env.NOTION_PROJECTS_DB_ID;
const EVENTS_DB = process.env.NOTION_EVENTS_DB_ID;
const QUOTATIONS_DB = process.env.NOTION_QUOTATIONS_DB_ID;

// Mapping de Notion IDs → Supabase UUIDs
const idMap = {
    clients: {},
    events: {},
    projects: {}
};

// =============================================
// Notion property helpers (copiados del server original)
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
// Paginar toda una DB de Notion
// =============================================
async function fetchAllPages(databaseId, sorts) {
    let allPages = [];
    let hasMore = true;
    let startCursor = undefined;

    while (hasMore) {
        const params = { database_id: databaseId, start_cursor: startCursor, page_size: 100 };
        if (sorts) params.sorts = sorts;
        const response = await notion.databases.query(params);
        allPages = allPages.concat(response.results);
        hasMore = response.has_more;
        startCursor = response.next_cursor;
    }

    return allPages;
}

// Leer fullState JSON del code block de una página
async function getPageJsonBody(pageId) {
    try {
        const response = await notion.blocks.children.list({ block_id: pageId, page_size: 100 });
        const codeBlock = response.results.find(b => b.type === 'code');
        if (!codeBlock) return null;
        const text = codeBlock.code.rich_text.map(rt => rt.plain_text).join('');
        return JSON.parse(text);
    } catch {
        return null;
    }
}

// =============================================
// MIGRAR CLIENTES
// =============================================
async function migrateClients() {
    console.log('\n👥 Migrando clientes...');
    const pages = await fetchAllPages(CLIENTS_DB);
    console.log(`   Encontrados: ${pages.length} clientes en Notion`);

    const rows = pages.map(page => {
        const props = page.properties;
        return {
            name: getTitle(props['Nombre Empresa']),
            razon_social: getRichText(props['Razón Social']),
            cuit: getNumber(props['CUIT']) || null,
            email: getEmail(props['Correo Electrónico']),
            phone: getPhone(props['Teléfono']),
            rubro: getMultiSelect(props['Rubro '])
        };
    });

    // Insertar en batch
    const { data, error } = await supabase.from('clientes').insert(rows).select('id');
    if (error) {
        console.error('   ❌ Error insertando clientes:', error.message);
        return;
    }

    // Guardar mapping notion_id → supabase_id
    pages.forEach((page, i) => {
        if (data[i]) {
            idMap.clients[page.id] = data[i].id;
        }
    });

    console.log(`   ✅ ${data.length} clientes migrados`);
}

// =============================================
// MIGRAR EVENTOS
// =============================================
async function migrateEvents() {
    console.log('\n📅 Migrando eventos...');
    const pages = await fetchAllPages(EVENTS_DB);
    console.log(`   Encontrados: ${pages.length} eventos en Notion`);

    const rows = pages.map(page => {
        const props = page.properties;
        return {
            name: getTitle(props['Nombre']),
            status: getSelect(props['Estado']),
            setup_date: getDate(props['Fecha de armado']),
            teardown_date: getDate(props['Fecha de desarme']),
            phone: getPhone(props['Teléfono']),
            pavilion: getMultiSelect(props['Pabellón']),
            total_stands: getNumber(props['Stands totales']),
            completed_stands: getNumber(props['Stands terminados']),
            priority: getSelect(props['Prioridad']),
            event_start_date: props['Fecha de evento']?.date?.start || null,
            event_end_date: props['Fecha de evento']?.date?.end || null,
            venue: getSelect(props['Lugar']),
            venue_id: getRelation(props['Predio'])[0] || null
        };
    });

    const { data, error } = await supabase.from('eventos').insert(rows).select('id');
    if (error) {
        console.error('   ❌ Error insertando eventos:', error.message);
        return;
    }

    pages.forEach((page, i) => {
        if (data[i]) {
            idMap.events[page.id] = data[i].id;
        }
    });

    console.log(`   ✅ ${data.length} eventos migrados`);
}

// =============================================
// MIGRAR PROYECTOS (depende de clientes + eventos)
// =============================================
async function migrateProjects() {
    console.log('\n📁 Migrando proyectos...');
    const pages = await fetchAllPages(PROJECTS_DB);
    console.log(`   Encontrados: ${pages.length} proyectos en Notion`);

    const rows = pages.map(page => {
        const props = page.properties;
        const notionClientId = getRelation(props['Empresa'])[0] || null;
        const notionEventId = getRelation(props['Eventos 2026-'])[0] || null;

        return {
            name: getTitle(props['Cliente']),
            number: getNumber(props['N° ']) || null,
            area: getRichText(props['Área']),
            status: getStatus(props['Estado']),
            request_date: getDate(props['Fecha de solicitud']),
            client_id: notionClientId ? (idMap.clients[notionClientId] || null) : null,
            event_id: notionEventId ? (idMap.events[notionEventId] || null) : null
        };
    });

    const { data, error } = await supabase.from('proyectos').insert(rows).select('id');
    if (error) {
        console.error('   ❌ Error insertando proyectos:', error.message);
        return;
    }

    pages.forEach((page, i) => {
        if (data[i]) {
            idMap.projects[page.id] = data[i].id;
        }
    });

    console.log(`   ✅ ${data.length} proyectos migrados`);
}

// =============================================
// MIGRAR COTIZACIONES (depende de clientes + proyectos + eventos)
// =============================================
async function migrateQuotations() {
    console.log('\n📋 Migrando cotizaciones...');
    const pages = await fetchAllPages(QUOTATIONS_DB, [{ property: 'Fecha Emisión', direction: 'descending' }]);
    console.log(`   Encontradas: ${pages.length} cotizaciones en Notion`);

    let migrated = 0;
    let errors = 0;

    // Procesar de a una para leer fullState de cada una
    for (const page of pages) {
        const props = page.properties;
        const notionClientIds = getRelation(props['Clientes']);
        const notionProjectIds = getRelation(props['Proyectos 2026']);
        const notionEventIds = getRelation(props['Eventos 2026']);

        // Leer fullState del code block
        let fullState = null;
        try {
            fullState = await getPageJsonBody(page.id);
        } catch (e) {
            console.warn(`   ⚠️ No se pudo leer fullState de ${page.id}: ${e.message}`);
        }

        const row = {
            name: getTitle(props['Nombre']),
            type: getSelect(props['Tipo']),
            client_id: notionClientIds[0] ? (idMap.clients[notionClientIds[0]] || null) : null,
            project_id: notionProjectIds[0] ? (idMap.projects[notionProjectIds[0]] || null) : null,
            event_id: notionEventIds[0] ? (idMap.events[notionEventIds[0]] || null) : null,
            surface: getNumber(props['Superficie']),
            stand_type: getSelect(props['Tipo Stand']),
            height: getSelect(props['Altura']),
            subtotal: getNumber(props['Subtotal']),
            tax: getNumber(props['IVA']),
            total: getNumber(props['Total']),
            date: getDate(props['Fecha Emisión']),
            full_state: fullState
        };

        const { error } = await supabase.from('cotizaciones').insert(row);
        if (error) {
            console.error(`   ❌ Error en cotización ${row.name}: ${error.message}`);
            errors++;
        } else {
            migrated++;
        }

        // Rate limit: no bombardear Notion
        await new Promise(r => setTimeout(r, 350));
    }

    console.log(`   ✅ ${migrated} cotizaciones migradas (${errors} errores)`);
}

// =============================================
// MAIN
// =============================================
async function main() {
    console.log('═══════════════════════════════════════════');
    console.log('  MIGRACIÓN NOTION → SUPABASE');
    console.log('═══════════════════════════════════════════');

    // Verificar conexiones
    if (!process.env.NOTION_TOKEN) {
        console.error('❌ Falta NOTION_TOKEN en .env');
        process.exit(1);
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
        console.error('❌ Falta SUPABASE_URL o SUPABASE_SERVICE_KEY en .env');
        process.exit(1);
    }

    console.log('📊 Notion DBs:');
    console.log(`   Catalog:    ${CATALOG_DB?.substring(0, 8)}...`);
    console.log(`   Clients:    ${CLIENTS_DB?.substring(0, 8)}...`);
    console.log(`   Projects:   ${PROJECTS_DB?.substring(0, 8)}...`);
    console.log(`   Events:     ${EVENTS_DB?.substring(0, 8)}...`);
    console.log(`   Quotations: ${QUOTATIONS_DB?.substring(0, 8)}...`);
    console.log(`🔗 Supabase: ${process.env.SUPABASE_URL}`);

    // Orden: eventos y clientes (sin deps) → proyectos → cotizaciones
    // NOTA: catalogo_items NO se migra porque ya existe en Supabase con 216 items
    await migrateClients();
    await migrateEvents();
    await migrateProjects();
    await migrateQuotations();

    console.log('\n═══════════════════════════════════════════');
    console.log('  MIGRACIÓN COMPLETADA');
    console.log('═══════════════════════════════════════════');
    console.log('  ID Mappings:');
    console.log(`    Clientes:  ${Object.keys(idMap.clients).length}`);
    console.log(`    Eventos:   ${Object.keys(idMap.events).length}`);
    console.log(`    Proyectos: ${Object.keys(idMap.projects).length}`);
    console.log('═══════════════════════════════════════════');
}

main().catch(err => {
    console.error('💥 Error fatal:', err);
    process.exit(1);
});
