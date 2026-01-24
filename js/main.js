
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
            if (el) el.innerText = session.nombre || session.Usuario || 'Usuario';
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
            const rowDate = parseDate(r.Fecha);
            return rowDate && rowDate >= s && rowDate <= e;
        });

        const viajes = filterByDate(viajesRaw, start, end);
        const gastos = filterByDate(gastosRaw, start, end);

        console.log('Viajes filtrados:', viajes.length);
        console.log('Gastos filtrados:', gastos.length);

        // Agregaciones
        const totalVenta = viajes.reduce((acc, v) => acc + (parseFloat(v.Monto_Flete) || 0), 0);
        const totalGasto = gastos.reduce((acc, g) => acc + (parseFloat(g.Monto) || 0), 0);
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
        ...viajes.map(v => ({ type: 'venta', date: v.Fecha, detail: v.ID_Viaje || 'Sin ID', amount: v.Monto_Flete })),
        ...gastos.map(g => ({ type: 'gasto', date: g.Fecha, detail: g.Concepto || 'Gasto', amount: g.Monto }))
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
        timeline[v.Fecha] = timeline[v.Fecha] || { v: 0, g: 0 };
        timeline[v.Fecha].v += parseFloat(v.Monto_Flete) || 0;
    });
    gastos.forEach(g => {
        timeline[g.Fecha] = timeline[g.Fecha] || { v: 0, g: 0 };
        timeline[g.Fecha].g += parseFloat(g.Monto) || 0;
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
            ID_Viaje: getVal('V_ID_Viaje'),
            Fecha: getVal('V_Fecha'),
            ID_Unidad: getVal('V_ID_Unidad'),
            ID_Chofer: getVal('V_ID_Chofer'),
            Cliente: getVal('V_Cliente'),
            Origen: getVal('V_Origen'),
            Destino: getVal('V_Destino'),
            Monto_Flete: parseFloat(getVal('V_Monto_Flete')) || 0,
            Estatus_Viaje: getVal('V_Estatus_Viaje'),
            Comision_Chofer: parseFloat(getVal('V_Comision_Chofer')) || 0,
            Estatus_Pago: getVal('V_Estatus_Pago')
        };

        console.log('Insertando Viaje en Supabase:', formData);

        const { error } = await window.supabaseClient
            .from(DB_CONFIG.tableViajes)
            .insert([formData]);

        if (error) throw error;

        alert('✅ REGISTRO EXITOSO EN SUPABASE\n\nEl viaje ha sido guardado correctamente.');
        e.target.reset();
        document.getElementById('V_Fecha').value = new Date().toLocaleDateString('en-CA');

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
            ID_Gasto: getVal('ID_Gasto'),
            ID_Viaje: getVal('ID_Viaje'),
            ID_Unidad: getVal('ID_Unidad'),
            Fecha: getVal('Fecha') || new Date().toISOString().split('T')[0],
            Concepto: getVal('Concepto'),
            Monto: parseFloat(getVal('Monto')) || 0,
            Tipo_Pago: tipoPago,
            ID_Chofer: getVal('ID_Chofer') || session.userID,
            Kmts_Anteriores: parseInt(getVal('Kmts_Anteriores')) || 0,
            Kmts_Actuales: parseInt(getVal('Kmts_Actuales')) || 0,
            Kmts_Recorridos: parseInt(getVal('Kmts_Recorridos')) || 0,
            Litros_Rellenados: parseFloat(getVal('Litros_Rellenados')) || 0,
            Ticket_Foto: ticketBase64,
            Foto_tacometro: tacoBase64
        };

        const { error } = await window.supabaseClient
            .from(DB_CONFIG.tableGastos)
            .insert([formData]);

        if (error) throw error;

        alert('✅ GASTO REGISTRADO EN SUPABASE\n\nSe han guardado todos los campos correctamente.');
        e.target.reset();
        if (document.getElementById('Fecha')) document.getElementById('Fecha').value = new Date().toISOString().split('T')[0];
        if (document.getElementById('ID_Gasto')) document.getElementById('ID_Gasto').value = 'G-' + Date.now().toString().slice(-6);

        if (document.getElementById('gastos-list-view')) {
            toggleSectionView('gastos', 'list');
            loadExpensesList();
        } else if (typeof showToast === 'function') {
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
                <div class="font-bold text-slate-800 text-sm">${v.ID_Viaje}</div>
                <div class="text-[10px] text-slate-400 font-mono">${v.Fecha}</div>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm font-semibold text-slate-700">${v.Cliente}</div>
                <div class="text-[10px] text-slate-400 uppercase tracking-tight">${v.Origen} ➔ ${v.Destino}</div>
            </td>
            <td class="px-6 py-4 text-xs text-slate-600">
                <div><i class="fas fa-truck text-xs mr-1 text-slate-300"></i> ${v.ID_Unidad}</div>
                <div><i class="fas fa-user text-xs mr-1 text-slate-300"></i> ${v.ID_Chofer}</div>
            </td>
            <td class="px-6 py-4 text-right font-mono font-bold text-slate-700 text-sm">
                $${parseFloat(v.Monto_Flete).toLocaleString()}
            </td>
            <td class="px-6 py-4">
                <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase ${v.Estatus_Viaje === 'Terminado' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}">
                    ${v.Estatus_Viaje}
                </span>
            </td>
        </tr>
    `).join('');
}

function filterTrips(query) {
    const q = query.toLowerCase();
    const filtered = allTripsData.filter(v =>
        String(v.ID_Viaje).toLowerCase().includes(q) ||
        String(v.Cliente).toLowerCase().includes(q) ||
        String(v.ID_Chofer).toLowerCase().includes(q) ||
        String(v.ID_Unidad).toLowerCase().includes(q)
    );
    renderTripsTable(filtered);
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
                <div class="font-bold text-slate-800 text-sm">${g.ID_Gasto || 'N/A'}</div>
                <div class="text-[10px] text-slate-400 font-mono">${g.Fecha}</div>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm font-semibold text-slate-700">Viaje: ${g.ID_Viaje}</div>
                <div class="text-[10px] text-slate-400">Unidad: ${g.ID_Unidad}</div>
            </td>
            <td class="px-6 py-4 text-sm text-slate-600">
                <div class="font-bold text-slate-800 text-sm">${g.Concepto}</div>
                <div class="text-[10px] text-slate-400">Chofer: ${g.ID_Chofer}</div>
            </td>
            <td class="px-6 py-4 text-right font-mono font-bold text-red-600 text-sm">
                $${parseFloat(g.Monto).toLocaleString()}
            </td>
            <td class="px-6 py-4 text-[10px] text-slate-500 font-mono">
                ${g.Kmts_Recorridos} km
            </td>
        </tr>
    `).join('');
}

function filterExpenses(query) {
    const q = query.toLowerCase();
    const filtered = allExpensesData.filter(g =>
        String(g.ID_Viaje).toLowerCase().includes(q) ||
        String(g.Concepto).toLowerCase().includes(q) ||
        String(g.ID_Chofer).toLowerCase().includes(q) ||
        String(g.ID_Unidad).toLowerCase().includes(q)
    );
    renderExpensesTable(filtered);
}

// --- LÓGICA DE LISTADOS Y BÚSQUEDA ---

function toggleSectionView(section, view) {
    const listView = document.getElementById(`${section}-list-view`);
    const formView = document.getElementById(`${section}-form-view`);
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
                <div class="font-bold text-slate-800">${v.ID_Viaje}</div>
                <div class="text-[10px] text-slate-400 font-mono">${v.Fecha}</div>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm font-semibold text-slate-700">${v.Cliente}</div>
                <div class="text-xs text-slate-400">${v.Origen} → ${v.Destino}</div>
            </td>
            <td class="px-6 py-4 text-sm text-slate-600">
                <div><i class="fas fa-truck text-xs mr-1"></i> ${v.ID_Unidad}</div>
                <div><i class="fas fa-user text-xs mr-1"></i> ${v.ID_Chofer}</div>
            </td>
            <td class="px-6 py-4 text-right font-mono font-bold text-slate-700">
                $${parseFloat(v.Monto_Flete).toLocaleString()}
            </td>
            <td class="px-6 py-4">
                <span class="px-3 py-1 rounded-full text-[10px] font-bold uppercase ${v.Estatus_Viaje === 'Terminado' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}">
                    ${v.Estatus_Viaje}
                </span>
            </td>
        </tr>
    `).join('');
}

function filterTrips(query) {
    const q = query.toLowerCase();
    const filtered = allTripsData.filter(v =>
        String(v.ID_Viaje).toLowerCase().includes(q) ||
        String(v.Cliente).toLowerCase().includes(q) ||
        String(v.ID_Chofer).toLowerCase().includes(q) ||
        String(v.ID_Unidad).toLowerCase().includes(q)
    );
    renderTripsTable(filtered);
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
                <div class="font-bold text-slate-800">${g.ID_Gasto || 'N/A'}</div>
                <div class="text-[10px] text-slate-400 font-mono">${g.Fecha}</div>
            </td>
            <td class="px-6 py-4">
                <div class="text-sm font-semibold text-slate-700">Viaje: ${g.ID_Viaje}</div>
                <div class="text-xs text-slate-400">Unidad: ${g.ID_Unidad}</div>
            </td>
            <td class="px-6 py-4 text-sm text-slate-600">
                <div class="font-bold text-slate-800">${g.Concepto}</div>
                <div class="text-xs text-slate-400">Chofer: ${g.ID_Chofer}</div>
            </td>
            <td class="px-6 py-4 text-right font-mono font-bold text-red-600">
                $${parseFloat(g.Monto).toLocaleString()}
            </td>
            <td class="px-6 py-4 text-sm text-slate-500 font-mono">
                ${g.Kmts_Recorridos} km
            </td>
        </tr>
    `).join('');
}

function filterExpenses(query) {
    const q = query.toLowerCase();
    const filtered = allExpensesData.filter(g =>
        String(g.ID_Viaje).toLowerCase().includes(q) ||
        String(g.Concepto).toLowerCase().includes(q) ||
        String(g.ID_Chofer).toLowerCase().includes(q) ||
        String(g.ID_Unidad).toLowerCase().includes(q)
    );
    renderExpensesTable(filtered);
}

