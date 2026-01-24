
let mainChart = null; // Instancia global para el gráfico

// Variables Globales de Datos (para búsqueda)
let allTripsData = [];
let allExpensesData = [];

document.addEventListener('DOMContentLoaded', () => {
    // Verificar sesión al cargar
    const session = checkAuth();
    if (session) {
        const ids = ['user-name-display', 'display-chofer', 'admin-name', 'user-display'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = session.nombre || session.usuario || 'Usuario';
        });
    }

    // Inicializar Formularios
    const gastoForm = document.getElementById('gasto-form');
    if (gastoForm) gastoForm.addEventListener('submit', enviarGasto);

    const viajeForm = document.getElementById('viaje-form');
    if (viajeForm) viajeForm.addEventListener('submit', enviarViaje);

    // Inicializar Dashboard Nativo por API
    if (document.getElementById('period-table-body')) {
        setupDateFilters();
        updateDashboardByPeriod();
    }

    // Sidebar: Carga de Listados
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const navId = e.currentTarget.id.replace('nav-', '');
            if (navId === 'viajes') loadTripsList();
            if (navId === 'gastos') loadExpensesList();
        });
    });

    // Inicializar Catálogos en Selects
    initFormCatalogs();

    // Eventos de Búsqueda
    document.getElementById('search-viajes')?.addEventListener('input', (e) => {
        filterTrips(e.target.value);
    });
    document.getElementById('search-gastos')?.addEventListener('input', (e) => {
        filterExpenses(e.target.value);
    });
});

function setupDateFilters() {
    const startInput = document.getElementById('filter-start');
    const endInput = document.getElementById('filter-end');
    if (!startInput || !endInput) return;

    const today = new Date();
    // Default: Últimos 30 días
    const lastMonth = new Date();
    lastMonth.setDate(today.getDate() - 30);

    startInput.value = lastMonth.toISOString().split('T')[0];
    endInput.value = today.toISOString().split('T')[0];
}

async function updateDashboardByPeriod() {
    const start = document.getElementById('filter-start').value;
    const end = document.getElementById('filter-end').value;
    const loader = document.getElementById('chart-loader');

    const statusEl = document.getElementById('conn-status');
    if (!statusEl) return;

    statusEl.innerText = 'Consultando...';
    statusEl.className = 'text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest animate-pulse';

    if (loader) loader.classList.remove('hidden');

    try {
        console.log('Cargando datos para el periodo:', start, 'al', end);

        // Fetch de datos maestros
        const [viajesRaw, gastosRaw] = await Promise.all([
            fetchSupabaseData(DB_CONFIG.tableViajes),
            fetchSupabaseData(DB_CONFIG.tableGastos)
        ]);

        if (viajesRaw.length === 0 && gastosRaw.length === 0) {
            if (statusEl) {
                statusEl.innerText = 'Sin Datos';
                statusEl.className = 'text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest';
            }
        } else {
            if (statusEl) {
                statusEl.innerText = 'Conectado';
                statusEl.className = 'text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest';
            }
        }

        console.log('Respuesta Viajes (total):', viajesRaw.length);
        console.log('Respuesta Gastos (total):', gastosRaw.length);

        // Helper para normalizar fechas de AppSheet (vienen como MM/DD/YYYY en es-MX o YYYY-MM-DD)
        const parseDate = (d) => {
            if (!d) return null;
            if (d.includes('/')) {
                const parts = d.split('/'); // DD/MM/YYYY o MM/DD/YYYY
                // Detectar si es DD/MM o MM/DD (AppSheet suele usar MM/DD/YYYY o DD/MM/YYYY según el locale)
                if (parseInt(parts[0]) > 12) {
                    // DD/MM/YYYY -> YYYY-MM-DD
                    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                } else {
                    // MM/DD/YYYY -> YYYY-MM-DD
                    return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
                }
            }
            return d; // Asumimos YYYY-MM-DD
        };

        const filterByDate = (rows, s, e) => rows.filter(r => {
            const rowDate = parseDate(r.fecha);
            return rowDate && rowDate >= s && rowDate <= e;
        });

        const viajes = filterByDate(viajesRaw, start, end);
        const gastos = filterByDate(gastosRaw, start, end);

        console.log('Viajes filtrados:', viajes.length);
        console.log('Gastos filtrados:', gastos.length);

        // Agregaciones
        const totalVenta = viajes.reduce((acc, v) => acc + (parseFloat(v.monto_flete) || 0), 0);
        const totalGasto = gastos.reduce((acc, g) => acc + (parseFloat(g.monto) || 0), 0);
        const totalGanancia = totalVenta - totalGasto;

        // Actualizar Tarjetas UI
        const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

        safeSetText('period-venta', fmt(totalVenta));
        safeSetText('period-gasto', fmt(totalGasto));
        safeSetText('period-ganancia', fmt(totalGanancia));
        safeSetText('period-label', `Periodo: ${start} al ${end}`);

        // Renderizar Tabla y Gráfico
        renderPeriodTable(viajes, gastos);
        renderChart(viajes, gastos);

    } catch (error) {
        console.error('Error al actualizar dashboard:', error);
        if (statusEl) {
            statusEl.innerText = 'Error: ' + error.message;
            statusEl.className = 'text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest';
            statusEl.title = error.message; // Tooltip con detalle
        }
        // No alertar en carga inicial para no ser intrusivo, solo mostrar en status
    } finally {
        if (loader) loader.classList.add('hidden');
    }
}

function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

function renderPeriodTable(viajes, gastos) {
    const tableBody = document.getElementById('period-table-body');
    if (!tableBody) return;

    const combined = [
        ...viajes.map(v => ({ type: 'venta', date: v.fecha, detail: v.id_viaje || 'Sin ID', amount: v.monto_flete })),
        ...gastos.map(g => ({ type: 'gasto', date: g.fecha, detail: g.concepto || 'Gasto', amount: g.monto }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 15);

    if (combined.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="2" class="p-8 text-center text-slate-400 italic">No se encontraron datos en este rango de fechas.</td></tr>';
        return;
    }

    tableBody.innerHTML = combined.map(op => `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-6 py-3">
                <div class="text-[10px] text-slate-400 font-mono">${op.date}</div>
                <div class="text-sm font-bold text-slate-800 truncate max-w-[150px]">${op.detail}</div>
            </td>
            <td class="px-6 py-3 text-right">
                <span class="text-xs font-bold ${op.type === 'venta' ? 'text-blue-600' : 'text-red-500'}">
                    ${op.type === 'venta' ? '+' : '-'}${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(op.amount)}
                </span>
            </td>
        </tr>
    `).join('');
}

function renderChart(viajes, gastos) {
    const canvas = document.getElementById('mainChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Agrupar por fecha para la gráfica
    const timeline = {};
    viajes.forEach(v => {
        timeline[v.fecha] = timeline[v.fecha] || { v: 0, g: 0 };
        timeline[v.fecha].v += parseFloat(v.monto_flete) || 0;
    });
    gastos.forEach(g => {
        timeline[g.fecha] = timeline[g.fecha] || { v: 0, g: 0 };
        timeline[g.fecha].g += parseFloat(g.monto) || 0;
    });

    const labels = Object.keys(timeline).sort();
    const vData = labels.map(l => timeline[l].v);
    const gData = labels.map(l => timeline[l].g);

    if (labels.length === 0) {
        console.warn('Sin datos para la gráfica');
        if (mainChart) mainChart.destroy();
        return;
    }

    if (mainChart) mainChart.destroy();

    mainChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Ventas',
                    data: vData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Gastos',
                    data: gData,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 6 } }
            },
            scales: {
                y: { grid: { display: false }, ticks: { callback: v => '$' + v.toLocaleString() } },
                x: { grid: { display: false } }
            }
        }
    });
}

async function fetchSupabaseData(tableName) {
    try {
        const { data, error } = await window.supabaseClient
            .from(tableName)
            .select('*');

        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error(`Error en Supabase (${tableName}):`, e);
        throw e;
    }
}

// Funciones de Formulario (Mantenidas)
async function enviarViaje(e) {
    e.preventDefault();
    const session = checkAuth();
    if (!session) return;
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando en Supabase...';

        const getVal = (id) => document.getElementById(id)?.value || '';
        const formData = {
            id_viaje: getVal('V_ID_Viaje'),
            fecha: getVal('V_Fecha'),
            id_unidad: getVal('V_ID_Unidad'),
            id_chofer: getVal('V_ID_Chofer'),
            cliente: getVal('V_Cliente'),
            origen: getVal('V_Origen'),
            destino: getVal('V_Destino'),
            monto_flete: parseFloat(getVal('V_Monto_Flete')) || 0,
            estatus_viaje: getVal('V_Estatus_Viaje'),
            comision_chofer: parseFloat(getVal('V_Comision_Chofer')) || 0,
            estatus_pago: getVal('V_Estatus_Pago')
        };

        console.log('Insertando Viaje en Supabase:', formData);

        const { data, error, status, statusText } = await window.supabaseClient
            .from(DB_CONFIG.tableViajes)
            .insert([formData]);

        console.log('Respuesta insert Viaje:', { data, error, status, statusText });

        if (error) {
            console.error('Error Supabase insert:', error);
            alert(`❌ ERROR DE SUPABASE [${status}]:\n${error.message}\n\nDetalle: ${error.details || 'Ninguno'}\nSugerencia: Revisa si la tabla 'reg_viajes' tiene las columnas en minúsculas.`);
            return;
        }

        alert('✅ REGISTRO EXITOSO EN SUPABASE\n\nEl viaje ha sido guardado correctamente.');
        e.target.reset();
        document.getElementById('V_Fecha').value = new Date().toISOString().split('T')[0];
        generateTripID(); // Regenerar para el próximo viaje

        if (document.getElementById('viajes-list-view')) {
            toggleSectionView('viajes', 'list');
            loadTripsList();
        }
    } catch (err) {
        console.error('Error enviando viaje:', err);
        alert('❌ ERROR AL GUARDAR EN SUPABASE:\n\n' + (err.message || JSON.stringify(err)));
    }
    finally { btn.disabled = false; btn.innerHTML = originalText; }
}

async function enviarGasto(e) {
    e.preventDefault();
    const session = checkAuth();
    if (!session) return;
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando en Supabase...';

        const getVal = (id) => document.getElementById(id)?.value || '';
        const tipoPago = document.querySelector('input[name="Tipo_Pago"]:checked')?.value || 'Efectivo';

        // Helper para convertir imagen a base64
        const fileToBase64 = (file) => new Promise((resolve, reject) => {
            if (!file) return resolve('');
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });

        const ticketFile = document.getElementById('Ticket_Foto')?.files[0];
        const tacoFile = document.getElementById('Foto_tacometro')?.files[0];

        const [ticketBase64, tacoBase64] = await Promise.all([
            fileToBase64(ticketFile),
            fileToBase64(tacoFile)
        ]);

        const formData = {
            id_gasto: getVal('ID_Gasto'),
            id_viaje: getVal('ID_Viaje'),
            id_unidad: getVal('ID_Unidad'),
            fecha: getVal('Fecha') || new Date().toISOString().split('T')[0],
            concepto: getVal('Concepto'),
            monto: parseFloat(getVal('Monto')) || 0,
            tipo_pago: tipoPago,
            id_chofer: getVal('ID_Chofer') || session.userID,
            kmts_anteriores: parseInt(getVal('Kmts_Anteriores')) || 0,
            kmts_actuales: parseInt(getVal('Kmts_Actuales')) || 0,
            kmts_recorridos: parseInt(getVal('Kmts_Recorridos')) || 0,
            litros_rellenados: parseFloat(getVal('Litros_Rellenados')) || 0,
            ticket_foto: ticketBase64,
            foto_tacometro: tacoBase64
        };

        const { data, error, status, statusText } = await window.supabaseClient
            .from(DB_CONFIG.tableGastos)
            .insert([formData]);

        console.log('Respuesta insert Gasto:', { data, error, status, statusText });

        if (error) {
            console.error('Error Supabase insert:', error);
            alert(`❌ ERROR DE SUPABASE [${status}]:\n${error.message}\n\nDetalle: ${error.details || 'Ninguno'}\nSugerencia: Revisa si la tabla 'reg_gastos' tiene las columnas en minúsculas.`);
            return;
        }

        alert('✅ GASTO REGISTRADO EN SUPABASE\n\nSe han guardado todos los campos correctamente.');
        e.target.reset();
        if (document.getElementById('Fecha')) document.getElementById('Fecha').value = new Date().toISOString().split('T')[0];
        if (document.getElementById('ID_Gasto')) document.getElementById('ID_Gasto').value = 'G-' + Date.now().toString().slice(-6);

        if (document.getElementById('gastos-list-view')) {
            toggleSectionView('gastos', 'list');
            loadExpensesList();
            initFormCatalogs(); // Refrescar combos (por si acaso cambió algo)
        }
        else if (typeof showToast === 'function') {
            showToast('Gasto registrado con éxito.');
        }
    } catch (err) {
        console.error('Error enviando gasto:', err);
        alert('❌ ERROR AL GUARDAR EN SUPABASE:\n\n' + (err.message || JSON.stringify(err)));
    }
    finally { btn.disabled = false; btn.innerHTML = originalText; }
}

function checkAuth() {
    const session = localStorage.getItem('crm_session');
    return session ? JSON.parse(session) : null;
}

// --- INICIALIZACIÓN DE FORMULARIOS ---

async function initFormCatalogs() {
    const selects = {
        'V_ID_Unidad': DB_CONFIG.tableUnidades,
        'V_ID_Chofer': DB_CONFIG.tableChoferes,
        'V_Cliente': DB_CONFIG.tableClientes,
        'ID_Unidad': DB_CONFIG.tableUnidades,
        'ID_Chofer': DB_CONFIG.tableChoferes,
        'ID_Viaje': DB_CONFIG.tableViajes
    };

    for (const [id, table] of Object.entries(selects)) {
        const el = document.getElementById(id);
        if (!el) continue;

        try {
            const data = await fetchSupabaseData(table);

            // Texto por defecto vacío o "Selecciona"
            el.innerHTML = `<option value="">-- Selecciona una opción --</option>`;

            data.forEach(item => {
                let text = '';
                let val = '';

                if (table === DB_CONFIG.tableUnidades) {
                    text = `${item.id_unidad} (${item.nombre_unidad || 'Sin nombre'})`;
                    val = item.id_unidad;
                } else if (table === DB_CONFIG.tableChoferes) {
                    text = `${item.nombre} [${item.id_chofer}]`;
                    val = item.id_chofer;
                } else if (table === DB_CONFIG.tableClientes) {
                    text = item.nombre_cliente;
                    val = item.nombre_cliente;
                } else if (table === DB_CONFIG.tableViajes) {
                    text = `${item.id_viaje} - ${item.cliente}`;
                    val = item.id_viaje;
                }

                if (val) el.innerHTML += `<option value="${val}">${text}</option>`;
            });
        } catch (err) {
            console.error(`Error cargando catálogo para ${id}:`, err);
            el.innerHTML = `<option value="">Error al cargar datos</option>`;
        }
    }

    // Auto-generar ID de Viaje al iniciar
    generateTripID();
}

function generateTripID() {
    const el = document.getElementById('V_ID_Viaje');
    if (!el) return;
    const now = new Date();
    const datePart = now.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
    const randomPart = Math.random().toString(36).substring(2, 5).toUpperCase();
    el.value = `V-${datePart}-${randomPart}`;
}

// Re-vincular al abrir el formulario de Viaje
function showSection(sectionId) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.add('hidden'));
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));

    const section = document.getElementById('section-' + sectionId);
    const nav = document.getElementById('nav-' + sectionId);

    if (section) section.classList.remove('hidden');
    if (nav) nav.classList.add('active');

    // Refrescar catálogos al entrar a secciones relevantes
    if (sectionId === 'viajes' || sectionId === 'gastos') {
        initFormCatalogs();
    }
}
// --- LÓGICA DE LISTADOS Y BÚSQUEDA ---

function toggleSectionView(section, view) {
    const listView = document.getElementById(`${section}-list-view`);
    const formView = document.getElementById(`${section}-form-view`);
    if (!listView || !formView) return;

    if (view === 'list') {
        listView.classList.remove('hidden');
        formView.classList.add('hidden');
    } else {
        listView.classList.add('hidden');
        formView.classList.remove('hidden');
    }
}

async function loadTripsList() {
    const loader = document.getElementById('trips-loader');
    const tbody = document.getElementById('trips-table-body');
    if (loader) loader.classList.remove('hidden');
    if (tbody) tbody.innerHTML = '';

    allTripsData = await fetchSupabaseData(DB_CONFIG.tableViajes);

    if (loader) loader.classList.add('hidden');
    renderTripsTable(allTripsData);
}

function renderTripsTable(data) {
    const tbody = document.getElementById('trips-table-body');
    if (!tbody) return;
    tbody.innerHTML = data.map(v => `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-6 py-4">
                <div class="font-bold text-slate-800 text-sm">${v.id_viaje}</div>
                <div class="text-[10px] text-slate-400 font-mono">${v.fecha}</div>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm font-semibold text-slate-700">${v.cliente}</div>
                <div class="text-[10px] text-slate-400 uppercase tracking-tight">${v.origen} ➔ ${v.destino}</div>
            </td>
            <td class="px-6 py-4 text-xs text-slate-600">
                <div><i class="fas fa-truck text-xs mr-1 text-slate-300"></i> ${v.id_unidad}</div>
                <div><i class="fas fa-user text-xs mr-1 text-slate-300"></i> ${v.id_chofer}</div>
            </td>
            <td class="px-6 py-4 text-right font-mono font-bold text-slate-700 text-sm">
                $${parseFloat(v.monto_flete).toLocaleString()}
            </td>
            <td class="px-6 py-4">
                <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase ${v.estatus_viaje === 'Terminado' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}">
                    ${v.estatus_viaje}
                </span>
            </td>
        </tr>
    `).join('');
}

function filterTrips(query) {
    const q = query.toLowerCase();
    const filtered = allTripsData.filter(v =>
        String(v.id_viaje).toLowerCase().includes(q) ||
        String(v.cliente).toLowerCase().includes(q) ||
        String(v.id_chofer).toLowerCase().includes(q) ||
        String(v.id_unidad).toLowerCase().includes(q)
    );
    renderTripsTable(filtered);
}

// --- CATALOG MANAGEMENT LOGIC ---
let currentCatalog = 'choferes';
let catalogData = [];

function switchCatalogTab(type) {
    currentCatalog = type;
    document.querySelectorAll('.catalog-tab').forEach(btn => {
        btn.classList.remove('bg-blue-600', 'text-white');
        btn.classList.add('text-slate-500', 'hover:bg-slate-50');
    });
    document.getElementById(`tab-${type}`).classList.add('bg-blue-600', 'text-white');
    document.getElementById(`tab-${type}`).classList.remove('text-slate-500', 'hover:bg-slate-50');

    const titles = {
        'choferes': 'Listado de Choferes',
        'unidades': 'Listado de Unidades',
        'clientes': 'Listado de Clientes',
        'proveedores': 'Listado de Proveedores'
    };
    document.getElementById('catalog-title').innerText = titles[type];
    hideCatalogForm();
    loadCatalog(type);
}

async function loadCatalog(type) {
    const loader = document.getElementById('catalog-loader');
    const tbody = document.getElementById('catalog-table-body');
    const thead = document.getElementById('catalog-table-head');

    if (loader) loader.classList.remove('hidden');
    if (tbody) tbody.innerHTML = '';

    const tables = {
        'choferes': DB_CONFIG.tableChoferes,
        'unidades': DB_CONFIG.tableUnidades,
        'clientes': DB_CONFIG.tableClientes,
        'proveedores': DB_CONFIG.tableProveedores
    };

    catalogData = await fetchSupabaseData(tables[type]);
    if (loader) loader.classList.add('hidden');

    renderCatalogTable(type, catalogData);
}

function renderCatalogTable(type, data) {
    const thead = document.getElementById('catalog-table-head');
    const tbody = document.getElementById('catalog-table-body');
    if (!thead || !tbody) return;

    const config = {
        'choferes': {
            headers: ['ID', 'Nombre', 'Licencia', 'Unidad Asignada'],
            row: d => `<td class="px-6 py-4 font-bold text-slate-800">${d.id_chofer}</td>
                       <td class="px-6 py-4 font-semibold text-slate-700">${d.nombre}</td>
                       <td class="px-6 py-4 text-slate-500">${d.licencia || '-'}</td>
                       <td class="px-6 py-4 text-blue-600 font-bold">${d.id_unidad || '<span class="text-slate-300 font-normal">Sin asignar</span>'}</td>`
        },
        'unidades': {
            headers: ['ID', 'Unidad', 'Placas', 'Chofer Asignado'],
            row: d => `<td class="px-6 py-4 font-bold text-slate-800">${d.id_unidad}</td>
                       <td class="px-6 py-4 font-semibold text-slate-700">${d.nombre_unidad}</td>
                       <td class="px-6 py-4 text-slate-500">${d.placas || '-'}</td>
                       <td class="px-6 py-4 text-green-600 font-bold">${d.id_chofer || '<span class="text-slate-300 font-normal">Sin asignar</span>'}</td>`
        },
        'clientes': {
            headers: ['Nombre', 'RFC/Razón Social', 'Contacto'],
            row: d => `<td class="px-6 py-4 font-bold text-slate-800">${d.nombre_cliente}</td>
                       <td class="px-6 py-4 font-semibold text-slate-700 text-xs">${d.rfc} / ${d.razon_social}</td>
                       <td class="px-6 py-4 text-slate-500 text-xs">${d.contacto_nombre} <br/> ${d.email}</td>`
        },
        'proveedores': {
            headers: ['ID', 'Proveedor', 'Tipo', 'Teléfono'],
            row: d => `<td class="px-6 py-4 font-bold text-slate-800">${d.id_proveedor}</td>
                       <td class="px-6 py-4 font-semibold text-slate-700">${d.nombre_proveedor}</td>
                       <td class="px-6 py-4 text-slate-500">${d.tipo_proveedor}</td>
                       <td class="px-6 py-4 text-slate-500">${d.telefono || '-'}</td>`
        }
    };

    const c = config[type];
    thead.innerHTML = `<tr>${c.headers.map(h => `<th class="px-6 py-4">${h}</th>`).join('')}</tr>`;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${c.headers.length}" class="px-6 py-12 text-center text-slate-400 italic">No hay registros aún</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(d => `
        <tr class="hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">${c.row(d)}</tr>
    `).join('');
}

function showCatalogForm() {
    document.getElementById('catalog-list-view').classList.add('hidden');
    document.getElementById('catalog-form-view').classList.remove('hidden');

    const fieldsContainer = document.getElementById('catalog-form-fields');
    const config = {
        'choferes': [
            { id: 'C_ID', label: 'ID Chofer', type: 'text', placeholder: 'CHO-01' },
            { id: 'C_Nombre', label: 'Nombre Completo', type: 'text', placeholder: 'Nombre Apellido' },
            { id: 'C_Licencia', label: 'Num. Licencia', type: 'text', placeholder: 'LIC-000' },
            { id: 'C_Telefono', label: 'Teléfono', type: 'tel', placeholder: '55 0000 0000' },
            { id: 'C_Unidad', label: 'Unidad Asignada (ID ECO)', type: 'text', placeholder: 'ECO-01' }
        ],
        'unidades': [
            { id: 'U_ID', label: 'ID Unidad (ECO)', type: 'text', placeholder: 'ECO-01' },
            { id: 'U_Nombre', label: 'Nombre/Alias', type: 'text', placeholder: 'Kenworth T680' },
            { id: 'U_Placas', label: 'Placas', type: 'text', placeholder: '00-AA-00' },
            { id: 'U_Modelo', label: 'Modelo', type: 'text', placeholder: '2024' },
            { id: 'U_Marca', label: 'Marca', type: 'text', placeholder: 'Freightliner' },
            { id: 'U_Chofer', label: 'Chofer Asignado (ID)', type: 'text', placeholder: 'CHO-01' }
        ],
        'clientes': [
            { id: 'CL_ID', label: 'ID Cliente (Opcional)', type: 'text', placeholder: 'CLI-01' },
            { id: 'CL_Nombre', label: 'Nombre Comercial', type: 'text', placeholder: 'Empresa S.A.' },
            { id: 'CL_Razon', label: 'Razón Social', type: 'text', placeholder: 'Logística Total S.A. de C.V.' },
            { id: 'CL_RFC', label: 'RFC', type: 'text', placeholder: 'RFC000000AAA' },
            { id: 'CL_Contacto', label: 'Nombre de Contacto', type: 'text', placeholder: 'Juan Pérez' },
            { id: 'CL_Email', label: 'Email', type: 'email', placeholder: 'contacto@empresa.com' },
            { id: 'CL_Tel', label: 'Teléfono', type: 'tel', placeholder: '55 0000 0000' }
        ],
        'proveedores': [
            { id: 'P_ID', label: 'ID Proveedor', type: 'text', placeholder: 'PROV-01' },
            { id: 'P_Nombre', label: 'Nombre/Razón Social', type: 'text', placeholder: 'Gasolinera Plus' },
            { id: 'P_Tipo', label: 'Tipo Proveedor', type: 'text', placeholder: 'Diesel / Refacciones' },
            { id: 'P_Tel', label: 'Teléfono', type: 'tel', placeholder: '55 0000 0000' }
        ]
    };

    fieldsContainer.innerHTML = config[currentCatalog].map(f => `
        <div>
            <label class="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">${f.label}</label>
            <input type="${f.type}" id="${f.id}" required placeholder="${f.placeholder}"
                class="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all">
        </div>
    `).join('');
}

function hideCatalogForm() {
    document.getElementById('catalog-list-view').classList.remove('hidden');
    document.getElementById('catalog-form-view').classList.add('hidden');
}

// Inicializar envío del formulario de catálogo
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('catalog-form');
    if (form) form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        const originalText = btn.innerText;

        try {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

            const getVal = id => document.getElementById(id)?.value || '';
            let data = {};
            let table = '';

            if (currentCatalog === 'choferes') {
                data = {
                    id_chofer: getVal('C_ID'),
                    nombre: getVal('C_Nombre'),
                    licencia: getVal('C_Licencia'),
                    telefono: getVal('C_Telefono'),
                    id_unidad: getVal('C_Unidad')
                };
                table = DB_CONFIG.tableChoferes;
            } else if (currentCatalog === 'unidades') {
                data = {
                    id_unidad: getVal('U_ID'),
                    nombre_unidad: getVal('U_Nombre'),
                    placas: getVal('U_Placas'),
                    modelo: getVal('U_Modelo'),
                    marca: getVal('U_Marca'),
                    id_chofer: getVal('U_Chofer')
                };
                table = DB_CONFIG.tableUnidades;
            } else if (currentCatalog === 'clientes') {
                data = { id_cliente: getVal('CL_ID') || 'CLI-' + Date.now(), nombre_cliente: getVal('CL_Nombre'), razon_social: getVal('CL_Razon'), rfc: getVal('CL_RFC'), contacto_nombre: getVal('CL_Contacto'), email: getVal('CL_Email'), telefono: getVal('CL_Tel') };
                table = DB_CONFIG.tableClientes;
            } else if (currentCatalog === 'proveedores') {
                data = { id_proveedor: getVal('P_ID'), nombre_proveedor: getVal('P_Nombre'), tipo_proveedor: getVal('P_Tipo'), telefono: getVal('P_Tel') };
                table = DB_CONFIG.tableProveedores;
            }

            const { error } = await window.supabaseClient.from(table).insert([data]);
            if (error) throw error;

            alert('✅ Registro guardado correctamente');
            hideCatalogForm();
            loadCatalog(currentCatalog);
        } catch (err) {
            console.error('Error al guardar catálogo:', err);
            alert('❌ Error al guardar: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.innerText = originalText;
        }
    });
});

async function loadTripsList() {
    const loader = document.getElementById('trips-loader');
    const tbody = document.getElementById('trips-table-body');
    if (loader) loader.classList.remove('hidden');
    if (tbody) tbody.innerHTML = '';

    allTripsData = await fetchSupabaseData(DB_CONFIG.tableViajes);

    if (loader) loader.classList.add('hidden');
    renderTripsTable(allTripsData);
}

async function loadExpensesList() {
    const loader = document.getElementById('expenses-loader');
    const tbody = document.getElementById('expenses-table-body');
    if (loader) loader.classList.remove('hidden');
    if (tbody) tbody.innerHTML = '';

    allExpensesData = await fetchSupabaseData(DB_CONFIG.tableGastos);

    if (loader) loader.classList.add('hidden');
    renderExpensesTable(allExpensesData);
}

function renderExpensesTable(data) {
    const tbody = document.getElementById('expenses-table-body');
    if (!tbody) return;
    tbody.innerHTML = data.map(g => `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-6 py-4">
                <div class="font-bold text-slate-800 text-sm">${g.id_gasto || 'N/A'}</div>
                <div class="text-[10px] text-slate-400 font-mono">${g.fecha}</div>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm font-semibold text-slate-700">Viaje: ${g.id_viaje}</div>
                <div class="text-[10px] text-slate-400">Unidad: ${g.id_unit_eco || g.id_unidad}</div>
            </td>
            <td class="px-6 py-4 text-sm text-slate-600">
                <div class="font-bold text-slate-800 text-sm">${g.concepto}</div>
                <div class="text-[10px] text-slate-400">Chofer: ${g.id_chofer}</div>
            </td>
            <td class="px-6 py-4 text-right font-mono font-bold text-red-600 text-sm">
                $${parseFloat(g.monto).toLocaleString()}
            </td>
            <td class="px-6 py-4 text-[10px] text-slate-500 font-mono">
                ${g.kmts_recorridos} km
            </td>
        </tr>
    `).join('');
}

function filterExpenses(query) {
    const q = query.toLowerCase();
    const filtered = allExpensesData.filter(g =>
        String(g.id_viaje).toLowerCase().includes(q) ||
        String(g.concepto).toLowerCase().includes(q) ||
        String(g.id_chofer).toLowerCase().includes(q) ||
        String(g.id_unidad).toLowerCase().includes(q) ||
        String(g.id_unit_eco).toLowerCase().includes(q)
    );
    renderExpensesTable(filtered);
}

