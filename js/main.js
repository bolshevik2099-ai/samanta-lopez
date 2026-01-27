
let mainChart = null; // Instancia global para el grÃ¡fico

// Variables Globales de Datos (para bÃºsqueda)
let allTripsData = [];
let allExpensesData = [];
let currentExpenseTab = 'todos';

document.addEventListener('DOMContentLoaded', () => {
    // Verificar sesiÃ³n al cargar
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
    if (gastoForm) gastoForm.addEventListener('submit', handleExpenseSubmit);

    const viajeForm = document.getElementById('viaje-form');
    // Si queremos mantener la logica de CXC automatica, debemos integrarla en handleTripSubmit o encadenarla.
    // La logica anterior era: enviarViaje(e).then(...)
    // handleTripSubmit es async, asi que podriamos meter la logica ahi dentro, pero por ahora simplifiquemos:
    if (viajeForm) viajeForm.addEventListener('submit', handleTripSubmit);

    const accountForm = document.getElementById('account-form');
    if (accountForm) {
        // Asumiendo que enviarCuenta existe o necesitamos crear un handleAccountSubmit.
        // Si no existe handleAccountSubmit, verificar si enviarCuenta existe.
        if (typeof enviarCuenta === 'function') accountForm.addEventListener('submit', enviarCuenta);
    }

    // Live Commission Calculation (15%)
    const fleteInput = document.getElementById('V_Monto_Flete');
    const commInput = document.getElementById('V_Comision_Chofer');
    if (fleteInput && commInput) {
        fleteInput.addEventListener('input', () => {
            const flete = parseFloat(fleteInput.value) || 0;
            commInput.value = (flete * 0.15).toFixed(2);
        });
    }

    // --- LÃ³gica de Campos Condicionales de Diesel ---
    const conceptoSelect = document.getElementById('Concepto');
    const dieselBlock = document.getElementById('diesel-fields');
    // Inputs que se deben resetear/requerir
    const dieselInputs = ['Litros_Rellenados', 'Kmts_Anteriores', 'Kmts_Actuales', 'Foto_tacometro'];

    if (conceptoSelect && dieselBlock) {
        const toggleDieselInfo = () => {
            const isDiesel = conceptoSelect.value === 'Diesel';
            if (isDiesel) {
                dieselBlock.classList.remove('hidden');
                dieselInputs.forEach(id => document.getElementById(id)?.setAttribute('required', 'true'));
            } else {
                dieselBlock.classList.add('hidden');
                dieselInputs.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.removeAttribute('required');
                        el.value = ''; // Limpiar valores al ocultar
                    }
                });
                if (document.getElementById('Kmts_Recorridos')) document.getElementById('Kmts_Recorridos').value = '';
            }
        };

        conceptoSelect.addEventListener('change', toggleDieselInfo);
        // Ejecutar al inicio por si el navegador guarda el estado
        toggleDieselInfo();
    }

    // --- CÃ¡lculo AutomÃ¡tico de KilÃ³metros ---
    const kmAntInput = document.getElementById('Kmts_Anteriores');
    const kmActInput = document.getElementById('Kmts_Actuales');
    const kmRecInput = document.getElementById('Kmts_Recorridos');

    if (kmAntInput && kmActInput && kmRecInput) {
        const calcKm = () => {
            const ant = parseFloat(kmAntInput.value) || 0;
            const act = parseFloat(kmActInput.value) || 0;
            kmRecInput.value = act > ant ? (act - ant) : 0;
        };
        kmAntInput.addEventListener('input', calcKm);
        kmActInput.addEventListener('input', calcKm);
    }

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

    // Inicializar CatÃ¡logos en Selects
    initFormCatalogs();

    // Eventos de BÃºsqueda
    document.getElementById('search-viajes')?.addEventListener('input', (e) => {
        filterTrips(e.target.value);
    });
    document.getElementById('search-gastos')?.addEventListener('input', (e) => {
        filterExpenses(e.target.value);
    });

    // Close modal on escape
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDetailModal();
    });

    // Populate Driver Form Options
    populateDriverFormOptions();
});


// --- UNIVERSAL DETAIL MODAL ---
function showDetailModal(type, id) {
    const modal = document.getElementById('detail-modal');
    const content = document.getElementById('modal-content');
    const title = document.getElementById('modal-title');

    if (!modal || !content || !title) return;

    modal.classList.remove('hidden');
    content.innerHTML = `
        <div class="flex items-center justify-center py-12">
            <div class="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600"></div>
        </div>
    `;

    // Fetch details based on type
    let tableName = '';
    let idCol = '';

    // Dispatch to specialized renderers
    switch (type) {
        case 'viajes':
            // Keep generic for simple trip detail or enhance later
            renderGenericDetail(DB_CONFIG.tableViajes, 'id_viaje', id, 'Detalle de Viaje');
            break;
        case 'choferes':
            renderDriverDetail(id);
            break;
        case 'unidades':
            renderUnitDetail(id);
            break;
        case 'clientes':
            renderClientDetail(id);
            break;
        case 'proveedores':
            renderProviderDetail(id);
            break;
        case 'gastos':
            renderGenericDetail(DB_CONFIG.tableGastos, 'id_gasto', id, 'Detalle de Gasto');
            break;
        case 'liquidaciones':
            showEnhancedSettlement(id);
            break;
        default:
            content.innerHTML = '<p class="text-center text-slate-500">Tipo de detalle no soportado.</p>';
    }
}

// --- SPECIALIZED DETAIL RENDERERS ---

async function renderGenericDetail(table, idCol, id, titleText) {
    const content = document.getElementById('modal-content');
    const title = document.getElementById('modal-title');
    if (title) title.innerText = titleText + ': ' + id;

    try {
        const { data, error } = await window.supabaseClient.from(table).select('*').eq(idCol, id).single();
        if (error) throw error;

        let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">';
        for (const [key, value] of Object.entries(data)) {
            if (key === 'created_at' || value === null) continue;

            const label = key.replace(/_/g, ' ');

            // Image Rendering Logic
            if (['ticket_foto', 'foto_tacometro', 'ticket_url'].includes(key)) {
                const url = window.supabaseClient.storage.from('tickets-gastos').getPublicUrl(value).data.publicUrl;
                html += `
                    <div class="border-b border-slate-50 pb-2 col-span-2 md:col-span-1">
                        <label class="block text-[10px] uppercase font-black text-slate-400 mb-1">${label}</label>
                        <img src="${url}" alt="${label}" 
                            class="w-full h-32 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-90 transition-opacity"
                            onclick="window.open('${url}', '_blank')">
                        <div class="mt-1 text-[10px] text-blue-500 cursor-pointer" onclick="window.open('${url}', '_blank')"><i class="fas fa-external-link-alt"></i> Ver pantalla completa</div>
                    </div>
                `;
                continue;
            }

            html += `
                <div class="border-b border-slate-50 pb-2">
                    <label class="block text-[10px] uppercase font-black text-slate-400 mb-1">${label}</label>
                    <div class="text-sm font-semibold text-slate-800">${value}</div>
                </div>
            `;
        }
        html += '</div>';
        content.innerHTML = html;
    } catch (err) {
        content.innerHTML = `<div class="p-4 bg-red-50 text-red-600 rounded-lg text-sm font-bold">Error: ${err.message}</div>`;
    }
}

// --- HELPER: Calculate Fuel Efficiency (Standardized) ---
// Returns { last: "XX.XX km/L", avg: "XX.XX km/L" } to match string format, or raw numbers if needed. 
// For detail views, we return the object expected by the renderers.
function calculateEntityFuelMetrics(expenses, entityId, entityType) {
    // Filter logic: Must have liters, and if ID provided, match it.
    // If called from Catalog, expenses passed are ALL expenses, so we filter.
    // If called from Detail Modal, expenses are already filtered by Supabase query, but we filter for 'Diesel' and Liters > 0 just in case.

    const fuelExpenses = expenses.filter(g => {
        const isFuel = (parseFloat(g.litros_rellenados) > 0);
        // If entityId is provided, double check (though usually pre-filtered)
        const isMatch = entityId ? (entityType === 'choferes' ? g.id_chofer === entityId : (g.id_unidad === entityId || g.id_unit_eco === entityId)) : true;
        return isFuel && isMatch;
    });

    if (fuelExpenses.length === 0) return { last: 0, avg: 0, lastStr: 'N/A', avgStr: 'N/A' };

    // Sort Descending (Newest first)
    fuelExpenses.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    // 1. Last Yield (Most recent fill-up)
    const last = fuelExpenses[0];
    const lastYield = (parseFloat(last.litros_rellenados) > 0)
        ? (parseFloat(last.kmts_recorridos) / parseFloat(last.litros_rellenados))
        : 0;

    // 2. Historical Average (Total Km / Total Liters) - Robust Method
    const totalKm = fuelExpenses.reduce((sum, g) => sum + (parseFloat(g.kmts_recorridos) || 0), 0);
    const totalLiters = fuelExpenses.reduce((sum, g) => sum + (parseFloat(g.litros_rellenados) || 0), 0);
    const avgYield = totalLiters > 0 ? (totalKm / totalLiters) : 0;

    return {
        last: lastYield,
        avg: avgYield,
        lastStr: lastYield.toFixed(2) + ' km/L',
        avgStr: avgYield.toFixed(2) + ' km/L'
    };
}


async function renderDriverDetail(id) {
    const content = document.getElementById('modal-content');
    const title = document.getElementById('modal-title');
    title.innerText = 'Perfil de Chofer: ' + id;

    try {
        // Parallel Fetch: Driver + Trips + Expenses (for Yield)
        const [driverReq, tripsReq, expensesReq] = await Promise.all([
            window.supabaseClient.from(DB_CONFIG.tableChoferes).select('*').eq('id_chofer', id).single(),
            window.supabaseClient.from(DB_CONFIG.tableViajes).select('*').eq('id_chofer', id).order('fecha', { ascending: false }).limit(20),
            window.supabaseClient.from(DB_CONFIG.tableGastos).select('*').eq('id_chofer', id).eq('concepto', 'Diesel').order('fecha', { ascending: false }).limit(50) // Fetch last 50 diesel entries
        ]);

        if (driverReq.error) throw driverReq.error;
        const driver = driverReq.data;
        const trips = tripsReq.data || [];
        const expenses = expensesReq.data || [];

        // Stats
        const totalTrips = trips.length;
        const totalEarned = trips.reduce((sum, t) => sum + (parseFloat(t.comision_chofer) || 0), 0);

        // Calculate Efficiency
        const metrics = calculateEntityFuelMetrics(expenses, id, 'choferes');
        const lastYield = metrics.last;
        const avgYield = metrics.avg;

        content.innerHTML = `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div class="space-y-4">
                        <div class="flex items-center gap-4 bg-white/[0.03] p-6 rounded-3xl border border-white/5">
                            <div class="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-400 text-2xl">
                                <i class="fas fa-id-card"></i>
                            </div>
                            <div>
                                <h3 class="text-xl font-black text-white px-1 tracking-tight">${driver.nombre}</h3>
                                <p class="text-[10px] text-slate-500 font-black uppercase tracking-widest px-1">ID: ${driver.id_chofer}</p>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div class="bg-white/[0.02] p-5 rounded-3xl border border-white/5">
                                <p class="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Licencia</p>
                                <p class="text-sm font-bold text-white">${driver.licencia || 'N/A'}</p>
                            </div>
                            <div class="bg-white/[0.02] p-5 rounded-3xl border border-white/5">
                                <p class="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Unidad</p>
                                <p class="text-sm font-bold text-blue-400">${driver.id_unidad || 'N/A'}</p>
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-blue-600/10 p-6 rounded-3xl border border-blue-500/10 flex flex-col justify-center">
                            <p class="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">Viajes</p>
                            <p class="text-3xl font-black text-white tracking-tighter">${totalTrips}</p>
                        </div>
                        <div class="bg-emerald-600/10 p-6 rounded-3xl border border-emerald-500/10 flex flex-col justify-center">
                            <p class="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-1">Comisiones</p>
                            <p class="text-3xl font-black text-white tracking-tighter">$${totalEarned.toLocaleString()}</p>
                        </div>
                        <div class="bg-amber-600/10 p-6 rounded-3xl border border-amber-500/10 flex flex-col justify-center">
                            <p class="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1">Rend. Ãšltimo</p>
                            <p class="text-2xl font-black text-amber-400 tracking-tighter">${lastYield.toFixed(2)} <span class="text-xs">km/l</span></p>
                        </div>
                         <div class="bg-blue-600/10 p-6 rounded-3xl border border-blue-500/10 flex flex-col justify-center">
                            <p class="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">Rend. Promedio</p>
                            <p class="text-2xl font-black text-blue-400 tracking-tighter">${avgYield.toFixed(2)} <span class="text-xs">km/l</span></p>
                        </div>
                    </div>
                </div>

                <!-- Trips History -->
                <div class="mt-8 bg-white/[0.02] rounded-[2rem] border border-white/5 overflow-hidden">
                    <div class="p-6 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
                        <h3 class="font-black text-white text-xs uppercase tracking-widest">Historial Reciente</h3>
                    </div>
                    <div class="max-h-[300px] overflow-y-auto custom-scrollbar">
                        <table class="w-full text-left">
                            <thead class="bg-white/[0.03] text-[9px] uppercase font-black text-slate-500 tracking-widest">
                                <tr>
                                    <th class="px-6 py-4">Fecha</th>
                                    <th class="px-6 py-4">Ruta</th>
                                    <th class="px-6 py-4 text-right">ComisiÃ³n</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-white/5">
                                ${trips.map(t => `
                                    <tr class="hover:bg-white/[0.02] transition-colors">
                                        <td class="px-6 py-4 text-[11px] font-medium text-slate-400">${t.fecha}</td>
                                        <td class="px-6 py-4">
                                            <div class="text-[11px] font-bold text-slate-200">${t.origen} â†’ ${t.destino}</div>
                                        </td>
                                        <td class="px-6 py-4 text-right text-xs font-black text-emerald-400">$${(parseFloat(t.comision_chofer) || 0).toLocaleString()}</td>
                                    </tr>
                                `).join('')}
                                ${trips.length === 0 ? '<tr><td colspan="3" class="px-6 py-10 text-center text-[10px] uppercase font-bold text-slate-600">No hay viajes recientes</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

    } catch (err) {
        content.innerHTML = `<div class="p-4 bg-red-100 text-red-600 rounded-lg font-bold">Error cargando chofer: ${err.message}</div>`;
    }
}


async function renderClientDetail(id) {
    // id comes as 'nombre_cliente' in current logic, need to be careful if it's ID or Name.
    // Based on showDetailModal: idCol = 'nombre_cliente' for clientes.
    const content = document.getElementById('modal-content');
    document.getElementById('modal-title').innerText = 'Cliente: ' + id;

    try {
        const [clientReq, tripsReq] = await Promise.all([
            window.supabaseClient.from(DB_CONFIG.tableClientes).select('*').eq('nombre_cliente', id).single(),
            window.supabaseClient.from(DB_CONFIG.tableViajes).select('*').eq('cliente', id).order('fecha', { ascending: false }).limit(10)
        ]);

        if (clientReq.error) throw clientReq.error;
        const client = clientReq.data;
        const trips = tripsReq.data || [];
        const totalRevenue = trips.reduce((sum, t) => sum + (parseFloat(t.monto_flete) || 0), 0);

        content.innerHTML = `
             <div class="space-y-6">
                <!-- Header -->
                <div class="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[2rem] p-8 shadow-2xl relative overflow-hidden group">
                    <div class="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform">
                        <i class="fas fa-building text-7xl text-blue-400"></i>
                    </div>
                    <div class="flex items-center gap-6 relative z-10">
                        <div class="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-400 text-3xl">
                            <i class="fas fa-city"></i>
                        </div>
                        <div>
                            <h2 class="text-2xl font-black text-white tracking-tight">${client.nombre_cliente}</h2>
                            <div class="flex flex-col mt-2 gap-1">
                                <p class="text-slate-500 text-xs font-medium"><i class="fas fa-map-marker-alt mr-2 text-blue-500/50"></i> ${client.direccion || 'Sin direcciÃ³n'}</p>
                                <p class="text-slate-500 text-xs font-medium"><i class="fas fa-envelope mr-2 text-blue-500/50"></i> ${client.email || 'Sin email'}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-6">
                    <div class="bg-emerald-600/10 p-6 rounded-[2rem] border border-emerald-500/10 text-center">
                        <p class="text-[10px] text-emerald-400 uppercase font-black tracking-widest mb-1">Venta Acumulada</p>
                        <p class="text-3xl font-black text-white tracking-tighter">$${totalRevenue.toLocaleString()}</p>
                    </div>
                    <div class="bg-blue-600/10 p-6 rounded-[2rem] border border-blue-500/10 text-center">
                        <p class="text-[10px] text-blue-400 uppercase font-black tracking-widest mb-1">Viajes Totales</p>
                        <p class="text-3xl font-black text-white tracking-tighter">${trips.length}</p>
                    </div>
                </div>

                <!-- Recent Activity -->
                <div class="bg-white/[0.02] rounded-[2rem] border border-white/5 overflow-hidden">
                    <div class="p-6 bg-white/[0.02] border-b border-white/5">
                         <h3 class="font-black text-white text-[10px] uppercase tracking-widest">Ãšltimos Envios</h3>
                    </div>
                    <div class="max-h-[300px] overflow-y-auto custom-scrollbar">
                        <table class="w-full text-left">
                            <thead class="bg-white/[0.03] text-[9px] uppercase font-black text-slate-500 tracking-widest">
                                <tr>
                                    <th class="px-6 py-4">Fecha</th>
                                    <th class="px-6 py-4">Origen/Destino</th>
                                    <th class="px-6 py-4 text-right">Monto</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-white/5">
                                ${trips.map(t => `
                                    <tr class="hover:bg-white/[0.02] transition-colors">
                                        <td class="px-6 py-4 text-[11px] text-slate-400 font-medium">${t.fecha}</td>
                                        <td class="px-6 py-4 text-[11px] font-bold text-slate-200">${t.origen} <i class="fas fa-arrow-right text-[10px] mx-2 text-blue-500/30"></i> ${t.destino}</td>
                                        <td class="px-6 py-4 text-right font-black text-white text-xs">$${parseFloat(t.monto_flete).toLocaleString()}</td>
                                    </tr>
                                `).join('')}
                                ${trips.length === 0 ? '<tr><td colspan="3" class="px-6 py-10 text-center text-[10px] uppercase font-bold text-slate-600">Sin historial registrado</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    } catch (e) {
        content.innerHTML = `<div class="p-4 bg-red-100 text-red-600">Error: ${e.message}</div>`;
    }
}

async function renderUnitDetail(id) {
    const content = document.getElementById('modal-content');
    document.getElementById('modal-title').innerText = 'Unidad: ' + id;

    try {
        const [unitReq, expensesReq] = await Promise.all([
            window.supabaseClient.from(DB_CONFIG.tableUnidades).select('*').eq('id_unidad', id).single(),
            window.supabaseClient.from(DB_CONFIG.tableGastos).select('*').eq('id_unidad', id).order('fecha', { ascending: false }).limit(50) // More history for calculation
        ]);

        if (unitReq.error) throw unitReq.error;
        const unit = unitReq.data;
        const expenses = expensesReq.data || [];
        const totalExpenses = expenses.reduce((sum, e) => sum + (parseFloat(e.monto) || 0), 0);

        // Calculate Efficiency
        const metrics = calculateEntityFuelMetrics(expenses, id, 'unidades');
        const lastYield = metrics.last;
        const avgYield = metrics.avg;

        content.innerHTML = `
            <div class="space-y-6">
                <!-- Card -->
                <div class="bg-slate-900/60 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/5 relative overflow-hidden group">
                    <div class="absolute -top-10 -right-10 w-64 h-64 bg-blue-500/5 blur-[100px] rounded-full pointer-events-none"></div>
                    
                    <div class="relative z-10 flex flex-col md:flex-row justify-between items-start gap-8">
                        <div>
                            <span class="text-[9px] font-black text-blue-400 uppercase tracking-[0.3em] mb-2 block">Unidad ECO</span>
                            <h2 class="text-4xl font-black text-white tracking-tighter">${unit.id_unidad}</h2>
                            <p class="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-2 flex items-center gap-2">
                                <span class="w-2 h-2 rounded-full bg-green-500"></span> ${unit.marca || 'N/A'} ${unit.modelo || ''}
                            </p>
                            <div class="mt-6 flex flex-wrap gap-4 text-[10px] font-black uppercase tracking-widest">
                                <span class="bg-white/5 px-4 py-2 rounded-full border border-white/5 text-slate-300"><i class="fas fa-barcode mr-2 text-blue-400"></i>${unit.placas || 'Sin Placas'}</span>
                                <span class="bg-white/5 px-4 py-2 rounded-full border border-white/5 text-slate-300"><i class="fas fa-gas-pump mr-2 text-amber-400"></i>${unit.tipo_combustible || 'Diesel'}</span>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 lg:grid-cols-1 gap-4 w-full md:w-auto">
                             <div class="bg-white/5 p-5 rounded-3xl border border-white/5">
                                <p class="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">InversiÃ³n Reciente</p>
                                <p class="text-2xl font-black text-red-500 tracking-tighter">$${totalExpenses.toLocaleString()}</p>
                             </div>
                             <div class="bg-white/5 p-5 rounded-3xl border border-white/5 grid grid-cols-2 gap-4">
                                <div>
                                    <p class="text-[8px] font-black text-amber-500/70 uppercase tracking-widest mb-1">Ãšltimo Rend.</p>
                                    <p class="text-lg font-black text-amber-500 tracking-tighter">${lastYield.toFixed(2)} <span class="text-[10px]">km/l</span></p>
                                </div>
                                <div class="border-l border-white/5 pl-4">
                                    <p class="text-[8px] font-black text-blue-500/70 uppercase tracking-widest mb-1">Promedio</p>
                                    <p class="text-lg font-black text-blue-500 tracking-tighter">${avgYield.toFixed(2)} <span class="text-[10px]">km/l</span></p>
                                </div>
                             </div>
                        </div>
                    </div>
                </div>

                <!-- Expenses Log -->
                <div class="bg-white/[0.02] rounded-[2.5rem] border border-white/5 overflow-hidden">
                    <div class="p-8 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
                        <h3 class="font-black text-xs text-white uppercase tracking-widest flex items-center gap-3">
                            <i class="fas fa-wrench text-blue-500"></i> Mantenimiento y Combustible
                        </h3>
                    </div>
                    <div class="max-h-[350px] overflow-y-auto custom-scrollbar">
                        <table class="w-full text-left">
                            <thead class="bg-white/[0.03] text-[9px] uppercase font-black text-slate-500 tracking-widest">
                                <tr>
                                    <th class="px-6 py-4">Fecha</th>
                                    <th class="px-6 py-4">Concepto</th>
                                    <th class="px-6 py-4 text-center">MÃ©tricas</th>
                                    <th class="px-6 py-4 text-right">Rendimiento</th>
                                    <th class="px-6 py-4 text-right">Monto</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-white/5">
                                ${expenses.map(e => `
                                    <tr class="hover:bg-white/[0.02] transition-colors">
                                        <td class="px-6 py-4 text-[11px] text-slate-400 font-medium">${e.fecha}</td>
                                        <td class="px-6 py-4">
                                            <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${e.concepto === 'Diesel' ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-500/10 text-slate-400'}">
                                                ${e.concepto}
                                            </span>
                                        </td>
                                        <td class="px-6 py-4 text-center">
                                            <div class="text-[10px] text-slate-500 font-medium">
                                                ${e.kmts_actuales ? `<span>${e.kmts_actuales} KM</span>` : ''}
                                                ${e.litros ? `<span class="mx-2 text-slate-700">|</span> <span>${e.litros} LT</span>` : ''}
                                            </div>
                                        </td>
                                        <td class="px-6 py-4 text-right font-black text-amber-500 text-xs">
                                            ${e._calculatedYield ? e._calculatedYield.toFixed(2) + ' <span class="text-[9px] opacity-70">km/l</span>' : '-'}
                                        </td>
                                        <td class="px-6 py-4 text-right font-black text-red-500 text-sm">-$${parseFloat(e.monto).toLocaleString()}</td>
                                    </tr>
                                `).join('')}
                                ${expenses.length === 0 ? '<tr><td colspan="5" class="px-6 py-10 text-center text-[10px] uppercase font-bold text-slate-600">Sin historial de gastos</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    } catch (e) {
        content.innerHTML = `<div class="text-red-500 font-bold p-4">Error: ${e.message}</div>`;
    }
}

async function renderProviderDetail(id) {
    const content = document.getElementById('modal-content');
    document.getElementById('modal-title').innerText = 'Proveedor: ' + id;

    try {
        // NOTE: Searching expenses by 'acreedor_nombre' might happen if we link them, 
        // but currently expenses don't strictly enforce foreign key to providers table in all logic. 
        // We will try to filter expenses where 'acreedor_nombre' matches the provider ID (which is numeric) OR provider name.
        // For now, let's assume we link by ID if provided, or name. 
        // In the catalog click, 'id' is likely the PK (id_proveedor).

        const { data: provider, error: pErr } = await window.supabaseClient.from(DB_CONFIG.tableProveedores).select('*').eq('id_proveedor', id).single();
        if (pErr) throw pErr;

        // Try to fetch expenses where acreedor_nombre matches provider name
        // (This relies on string matching which might be brittle but is "smart" for this context)
        const { data: expenses, error: eErr } = await window.supabaseClient
            .from(DB_CONFIG.tableGastos)
            .select('*')
            .eq('acreedor_nombre', provider.nombre_proveedor)
            .order('fecha', { ascending: false })
            .limit(10);

        const expenseList = expenses || [];
        const total = expenseList.reduce((acc, curr) => acc + (parseFloat(curr.monto) || 0), 0);

        content.innerHTML = `
            <div class="space-y-6">
                <div class="bg-slate-900/40 backdrop-blur-xl p-8 rounded-[2rem] border border-white/5 shadow-2xl flex flex-col md:flex-row items-center gap-8 relative overflow-hidden group">
                    <div class="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform">
                        <i class="fas fa-truck text-8xl text-purple-400"></i>
                    </div>
                    <div class="w-20 h-20 bg-purple-500/10 rounded-full flex items-center justify-center text-purple-400 text-3xl">
                        <i class="fas fa-handshake"></i>
                    </div>
                    <div>
                        <h2 class="text-2xl font-black text-white tracking-tight">${provider.nombre_proveedor}</h2>
                        <div class="flex flex-col mt-2 gap-1">
                            <p class="text-slate-500 text-xs font-mono font-bold uppercase tracking-widest">ID: ${provider.id_proveedor}</p>
                            <p class="text-slate-500 text-xs font-medium"><i class="fas fa-user mr-2 text-purple-500/50"></i> ${provider.contacto || 'Sin contacto'}</p>
                        </div>
                    </div>
                    <div class="md:ml-auto text-right bg-white/5 p-6 rounded-3xl border border-white/5 min-w-[200px]">
                         <p class="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-1">Total Movimientos</p>
                         <p class="text-3xl font-black text-purple-400 tracking-tighter">$${total.toLocaleString()}</p>
                    </div>
                </div>

                <div class="bg-white/[0.02] rounded-[2rem] border border-white/5 overflow-hidden">
                    <div class="p-6 bg-white/[0.02] border-b border-white/5">
                        <h3 class="font-black text-white text-[10px] uppercase tracking-widest">Historial de Operaciones</h3>
                    </div>
                    <div class="max-h-[300px] overflow-y-auto custom-scrollbar">
                        <table class="w-full text-left">
                            <thead class="bg-white/[0.03] text-[9px] uppercase font-black text-slate-500 tracking-widest">
                                <tr>
                                    <th class="px-6 py-4">Fecha</th>
                                    <th class="px-6 py-4">Concepto</th>
                                    <th class="px-6 py-4 text-right">Monto</th>
                                </tr>
                            </thead>
                             <tbody class="divide-y divide-white/5">
                                ${expenseList.map(e => `
                                    <tr class="hover:bg-white/[0.02] transition-colors">
                                        <td class="px-6 py-4 text-[11px] text-slate-400 font-medium">${e.fecha}</td>
                                        <td class="px-6 py-4 text-[11px] font-bold text-slate-200">${e.concepto}</td>
                                        <td class="px-6 py-4 text-right font-black text-white text-sm">$${parseFloat(e.monto).toLocaleString()}</td>
                                    </tr>
                                `).join('')}
                                ${expenseList.length === 0 ? '<tr><td colspan="3" class="px-6 py-10 text-center text-[10px] uppercase font-black text-slate-600 italic">No se encontraron pagos asociados</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

    } catch (e) {
        content.innerHTML = `<div class="p-4 text-red-500 font-bold">Error: ${e.message}</div>`;
    }
}

function closeDetailModal() {
    document.getElementById('detail-modal')?.classList.add('hidden');
}

async function showEnhancedSettlement(idLiquidacion) {
    const content = document.getElementById('modal-content');
    const title = document.getElementById('modal-title');
    title.innerText = 'LiquidaciÃ³n Detallada: ' + idLiquidacion;

    try {
        // 1. Get Settlement Master
        const { data: settle, error: sErr } = await window.supabaseClient
            .from(DB_CONFIG.tableLiquidaciones)
            .select('*')
            .eq('id_liquidacion', idLiquidacion)
            .single();

        if (sErr) throw sErr;

        // 2. Get Related Trips
        const { data: trips, error: tErr } = await window.supabaseClient
            .from(DB_CONFIG.tableViajes)
            .select('*')
            .eq('id_chofer', settle.id_chofer)
            .eq('estatus_pago', 'Pagado'); // Or filter by specific date range if available

        // 3. Render Enhanced View
        content.innerHTML = `
            <div class="space-y-8">
                <div class="flex flex-col md:flex-row justify-between items-start bg-blue-600/10 p-8 rounded-[2rem] border border-blue-500/10 relative overflow-hidden group">
                    <div class="absolute -top-10 -right-10 w-64 h-64 bg-blue-500/5 blur-[100px] rounded-full pointer-events-none"></div>
                    <div class="relative z-10">
                        <p class="text-[9px] font-black uppercase text-blue-400 tracking-[0.3em] mb-2">Operador Responsable</p>
                        <h3 class="text-3xl font-black text-white tracking-tighter">${settle.id_chofer}</h3>
                        <div class="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-2 bg-white/5 px-4 py-1 rounded-full border border-white/5 w-fit">
                            Periodo: ${settle.fecha_inicio || 'N/A'} â€” ${settle.fecha_fin || 'N/A'}
                        </div>
                    </div>
                    <div class="text-right relative z-10 mt-6 md:mt-0">
                        <p class="text-[10px] font-black uppercase text-blue-400 tracking-widest mb-1">Monto Neto Liquidado</p>
                        <p class="text-4xl font-black text-blue-500 tracking-tighter">$${(parseFloat(settle.monto_neto) || 0).toLocaleString()}</p>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="bg-white/5 p-6 rounded-[2rem] border border-white/5 flex flex-col justify-center">
                        <p class="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-1">Total Fletes</p>
                        <p class="text-2xl font-black text-white">$${(parseFloat(settle.total_fletes) || 0).toLocaleString()}</p>
                    </div>
                    <div class="bg-red-500/5 p-6 rounded-[2rem] border border-red-500/10 flex flex-col justify-center">
                        <p class="text-[9px] font-black uppercase text-red-400/70 tracking-widest mb-1">Retenciones / Gastos</p>
                        <p class="text-2xl font-black text-red-500">$${(parseFloat(settle.total_gastos) || 0).toLocaleString()}</p>
                    </div>
                    <div class="bg-emerald-500/5 p-6 rounded-[2rem] border border-emerald-500/10 flex flex-col justify-center">
                        <p class="text-[9px] font-black uppercase text-emerald-400/70 tracking-widest mb-1">ComisiÃ³n Generada</p>
                        <p class="text-2xl font-black text-emerald-500">$${(parseFloat(settle.monto_comision) || 0).toLocaleString()}</p>
                    </div>
                </div>

                <div class="bg-white/[0.02] rounded-[2rem] border border-white/5 overflow-hidden">
                    <div class="p-8 border-b border-white/5 bg-white/[0.02]">
                         <h4 class="text-xs font-black text-white uppercase tracking-widest flex items-center gap-3">
                            <i class="fas fa-truck-loading text-blue-500"></i> Viajes Auditados
                        </h4>
                    </div>
                    <div class="max-h-[300px] overflow-y-auto custom-scrollbar">
                        <table class="w-full text-left">
                            <thead class="bg-white/[0.03] text-[9px] uppercase font-black text-slate-500 tracking-widest">
                                <tr>
                                    <th class="px-6 py-4">ID Viaje</th>
                                    <th class="px-6 py-4">Ruta Operada</th>
                                    <th class="px-6 py-4 text-right">Monto Flete</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-white/5">
                                ${trips && trips.length > 0 ? trips.map(t => `
                                    <tr class="hover:bg-white/[0.02] transition-colors">
                                        <td class="px-6 py-4 text-[11px] font-black text-slate-300">${t.id_viaje}</td>
                                        <td class="px-6 py-4 text-[11px] font-bold text-slate-500 italic">${t.origen} â€” ${t.destino}</td>
                                        <td class="px-6 py-4 text-right font-black text-white text-xs">$${parseFloat(t.monto_flete).toLocaleString()}</td>
                                    </tr>
                                `).join('') : '<tr><td colspan="3" class="px-6 py-10 text-center text-[10px] font-black uppercase text-slate-600">No hay viajes vinculados</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

    } catch (err) {
        content.innerHTML = `<div class="p-4 bg-red-50 text-red-600 rounded-lg text-sm font-bold">Error: ${err.message}</div>`;
    }
}

function setupDateFilters() {
    const startInput = document.getElementById('filter-start');
    const endInput = document.getElementById('filter-end');
    if (!startInput || !endInput) return;

    const today = new Date();
    // Default: Ãšltimos 30 dÃ­as
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


        // Fetch de datos maestros
        const [viajesRaw, gastosRaw, unidadesRaw] = await Promise.all([
            fetchSupabaseData(DB_CONFIG.tableViajes),
            fetchSupabaseData(DB_CONFIG.tableGastos),
            fetchSupabaseData(DB_CONFIG.tableUnidades)
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



        // Helper para normalizar fechas de AppSheet (vienen como MM/DD/YYYY en es-MX o YYYY-MM-DD)
        const parseDate = (d) => {
            if (!d) return null;
            if (d.includes('/')) {
                const parts = d.split('/'); // DD/MM/YYYY o MM/DD/YYYY
                // Detectar si es DD/MM o MM/DD (AppSheet suele usar MM/DD/YYYY o DD/MM/YYYY segÃºn el locale)
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
        safeSetText('period-viajes-count', viajes.length);
        safeSetText('period-label', `Periodo: ${start} al ${end}`);

        // Renderizar Tabla y GrÃ¡fico Principal
        renderPeriodTable(viajes, gastos);
        renderChart(viajes, gastos);

        // Renderizar GrÃ¡ficos Avanzados (si existen los containers)
        if (typeof renderAdvancedCharts === 'function') {
            renderAdvancedCharts(viajes, gastos, unidadesRaw);
        }

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

    // Agrupar por fecha para la grÃ¡fica
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
        console.warn('Sin datos para la grÃ¡fica');
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
                    borderColor: '#60a5fa',
                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#60a5fa'
                },
                {
                    label: 'Gastos',
                    data: gData,
                    borderColor: '#f87171',
                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: '#f87171'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 6, color: '#94a3b8' } }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8', callback: v => '$' + v.toLocaleString() }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8' }
                }
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

// --- GRÃFICOS AVANZADOS ---

const chartInstances = {};

function renderChartInstance(canvasId, type, data) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) return;

    if (chartInstances[canvasId]) {
        chartInstances[canvasId].destroy();
    }

    chartInstances[canvasId] = new Chart(ctx, {
        type: type,
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 } } }
            },
            scales: type === 'bar' ? {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8', font: { size: 10 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { size: 10 } }
                }
            } : {}
        }
    });
}

const DIVERSE_COLORS = [
    { bg: 'rgba(59, 130, 246, 0.7)', border: 'rgba(59, 130, 246, 1)' },   // Blue
    { bg: 'rgba(34, 197, 94, 0.7)', border: 'rgba(34, 197, 94, 1)' },   // Green
    { bg: 'rgba(249, 115, 22, 0.7)', border: 'rgba(249, 115, 22, 1)' },  // Orange
    { bg: 'rgba(168, 85, 247, 0.7)', border: 'rgba(168, 85, 247, 1)' },  // Purple
    { bg: 'rgba(236, 72, 153, 0.7)', border: 'rgba(236, 72, 153, 1)' },  // Pink
    { bg: 'rgba(234, 179, 8, 0.7)', border: 'rgba(234, 179, 8, 1)' },    // Yellow
    { bg: 'rgba(20, 184, 166, 0.7)', border: 'rgba(20, 184, 166, 1)' },  // Teal
    { bg: 'rgba(239, 68, 68, 0.7)', border: 'rgba(239, 68, 68, 1)' },    // Red
];

function renderAdvancedCharts(viajesData, gastosData, unidadesData = []) {
    // 1. Top 5 Clientes (Bar Chart)
    const clientRevenue = {};
    viajesData.forEach(v => {
        const client = v.cliente || 'Sin Cliente';
        const amount = parseFloat(v.monto_flete) || 0;
        clientRevenue[client] = (clientRevenue[client] || 0) + amount;
    });

    const topClients = Object.entries(clientRevenue)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    renderChartInstance('clientsChart', 'bar', {
        labels: topClients.map(c => c[0]),
        datasets: [{
            label: 'Ingresos',
            data: topClients.map(c => c[1]),
            backgroundColor: topClients.map((_, i) => DIVERSE_COLORS[i % DIVERSE_COLORS.length].bg),
            borderColor: topClients.map((_, i) => DIVERSE_COLORS[i % DIVERSE_COLORS.length].border),
            borderWidth: 1
        }]
    });

    // 2. Desglose de Gastos (Doughnut)
    const expenseBreakdown = {};
    gastosData.forEach(g => {
        const concept = g.concepto || 'Varios';
        const amount = parseFloat(g.monto) || 0;
        expenseBreakdown[concept] = (expenseBreakdown[concept] || 0) + amount;
    });

    const topExpenses = Object.entries(expenseBreakdown)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);

    renderChartInstance('expensesChart', 'doughnut', {
        labels: topExpenses.map(e => e[0]),
        datasets: [{
            data: topExpenses.map(e => e[1]),
            backgroundColor: [
                'rgba(239, 68, 68, 0.7)',
                'rgba(59, 130, 246, 0.7)',
                'rgba(16, 185, 129, 0.7)',
                'rgba(245, 158, 11, 0.7)',
                'rgba(139, 92, 246, 0.7)',
                'rgba(107, 114, 128, 0.7)',
            ],
            borderWidth: 0
        }]
    });

    // 3. Estatus Operativo (Viajes)
    const statusCounts = {};
    viajesData.forEach(v => {
        const s = v.estatus_pago || 'Pendiente';
        statusCounts[s] = (statusCounts[s] || 0) + 1;
    });

    renderChartInstance('statusChart', 'pie', {
        labels: Object.keys(statusCounts),
        datasets: [{
            data: Object.values(statusCounts),
            backgroundColor: [
                'rgba(251, 191, 36, 0.7)',
                'rgba(59, 130, 246, 0.7)',
                'rgba(16, 185, 129, 0.7)',
                'rgba(200, 50, 50, 0.7)',
            ],
            borderWidth: 0
        }]
    });

    // 4. Eficiencia de Combustible (Yield)
    const fuelExpenses = gastosData.filter(g => parseFloat(g.litros_rellenados) > 0 && g.id_unidad);
    const { unitYields } = calculateFleetEfficiency(fuelExpenses);

    const sortedYields = Object.entries(unitYields)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

    // Map unit ID to name if available
    const unitMap = {};
    unidadesData.forEach(u => {
        unitMap[u.id_unidad] = u.nombre_unidad || u.id_unidad;
    });

    renderChartInstance('yieldChart', 'bar', {
        indexAxis: 'y',
        labels: sortedYields.map(u => unitMap[u[0]] || u[0]),
        datasets: [{
            label: 'Km/L',
            data: sortedYields.map(u => u[1]),
            backgroundColor: sortedYields.map((_, i) => DIVERSE_COLORS[i % DIVERSE_COLORS.length].bg),
            borderColor: sortedYields.map((_, i) => DIVERSE_COLORS[i % DIVERSE_COLORS.length].border),
            borderWidth: 1
        }]
    });

    // 5. Best & Worst Drivers (Yield)
    const driverFuelExpenses = gastosData.filter(g => parseFloat(g.litros_rellenados) > 0 && g.id_chofer);
    const { driverYields } = calculateDriverEfficiency(driverFuelExpenses);

    const allDrivers = Object.entries(driverYields);

    const bestDrivers = [...allDrivers]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    const worstDrivers = [...allDrivers]
        .sort((a, b) => a[1] - b[1])
        .slice(0, 3);

    renderChartInstance('bestDriversChart', 'bar', {
        indexAxis: 'y',
        labels: bestDrivers.map(d => d[0]),
        datasets: [{
            label: 'Km/L (Mejor)',
            data: bestDrivers.map(d => d[1]),
            backgroundColor: bestDrivers.map((_, i) => DIVERSE_COLORS[i % DIVERSE_COLORS.length].bg),
            borderColor: bestDrivers.map((_, i) => DIVERSE_COLORS[i % DIVERSE_COLORS.length].border),
            borderWidth: 1
        }]
    });

    renderChartInstance('worstDriversChart', 'bar', {
        indexAxis: 'y',
        labels: worstDrivers.map(d => d[0]),
        datasets: [{
            label: 'Km/L (Menor)',
            data: worstDrivers.map(d => d[1]),
            backgroundColor: worstDrivers.map((_, i) => DIVERSE_COLORS[i % DIVERSE_COLORS.length].bg),
            borderColor: worstDrivers.map((_, i) => DIVERSE_COLORS[i % DIVERSE_COLORS.length].border),
            borderWidth: 1
        }]
    });
}

function calculateFleetEfficiency(expenses) {
    const unitGroups = {};
    expenses.forEach(e => {
        if (!unitGroups[e.id_unidad]) unitGroups[e.id_unidad] = { km: 0, lts: 0 };
        unitGroups[e.id_unidad].km += (parseFloat(e.kmts_recorridos) || 0);
        unitGroups[e.id_unidad].lts += (parseFloat(e.litros_rellenados) || 0);
    });

    const unitYields = {};
    let totalKm = 0;
    let totalLts = 0;

    for (const [unit, data] of Object.entries(unitGroups)) {
        if (data.lts > 0) {
            const yieldVal = data.km / data.lts;
            // Basic sanity check: 0.5 < yield < 15 km/l to avoid bad data outliers
            if (yieldVal > 0.5 && yieldVal < 15) {
                unitYields[unit] = parseFloat(yieldVal.toFixed(2));
                totalKm += data.km;
                totalLts += data.lts;
            }
        }
    }

    const fleetAvg = totalLts > 0 ? (totalKm / totalLts) : 0;

    return {
        unitYields,
        fleetAvg
    };
}

function calculateDriverEfficiency(expenses) {
    const driverGroups = {};
    // Pre-fetch driver names if possible, or use ID. For now using ID or name from expense if available (usually just ID in expense table unless joined)
    // The expense table has 'id_chofer' which might be the name if the select logic uses names.
    // Based on previous code, 'id_chofer' in expenses seems to be the stored value (name or ID).

    expenses.forEach(e => {
        const id = e.id_chofer;
        if (!driverGroups[id]) driverGroups[id] = { km: 0, lts: 0 };
        driverGroups[id].km += (parseFloat(e.kmts_recorridos) || 0);
        driverGroups[id].lts += (parseFloat(e.litros_rellenados) || 0);
    });

    const driverYields = {};

    for (const [driver, data] of Object.entries(driverGroups)) {
        if (data.lts > 0) {
            const yieldVal = data.km / data.lts;
            // Basic sanity check: 0.5 < yield < 15 km/l
            if (yieldVal > 0.5 && yieldVal < 15) {
                driverYields[driver] = parseFloat(yieldVal.toFixed(2));
            }
        }
    }

    return { driverYields };
}

// --- MANEJO DE FORMULARIOS ---

// State for editing (GLOBAL)
let isEditingTrip = false;
let editingTripId = null;
let isEditingExpense = false;
let editingExpenseId = null;
let isRegisteringExpenseFromTrip = false;

// Event Listeners movidos a DOMContentLoaded para asegurar existencia de elementos
// const tripForm = document.getElementById('viaje-form');
// if (tripForm) tripForm.addEventListener('submit', handleTripSubmit);

// const expenseForm = document.getElementById('gasto-form');
// if (expenseForm) expenseForm.addEventListener('submit', handleExpenseSubmit);

// Helper to get form value
const getVal = (id) => document.getElementById(id)?.value || '';

async function handleTripSubmit(e) {
    e.preventDefault();
    const session = checkAuth();
    if (!session) return;
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.innerText = 'Guardando...';
    btn.disabled = true;

    try {
        const tripData = {
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

        let error;
        if (isEditingTrip && editingTripId) {
            const { error: updateError } = await window.supabaseClient
                .from(DB_CONFIG.tableViajes)
                .update(tripData)
                .eq('id_viaje', editingTripId);
            error = updateError;
        } else {
            // Generar ID SOLO si es nuevo
            const id = getVal('V_ID_Viaje') || 'V-' + Date.now().toString().slice(-6);
            tripData.id_viaje = id;
            const { error: insertError } = await window.supabaseClient
                .from(DB_CONFIG.tableViajes)
                .insert([tripData]);
            error = insertError;
        }

        if (error) throw error;

        alert(isEditingTrip ? 'Viaje actualizado correctamente.' : 'Viaje registrado correctamente.');
        e.target.reset();
        isEditingTrip = false;
        editingTripId = null;
        btn.innerText = 'Guardar Viaje'; // Reset text

        document.getElementById('V_Fecha').value = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
        if (typeof generateTripID === 'function') generateTripID();

        // Return to list view
        if (document.getElementById('viajes-list-view')) {
            toggleSectionView('viajes', 'list');
            // Check which load function exists
            if (typeof loadTrips === 'function') loadTrips();
            else if (typeof loadTripsList === 'function') loadTripsList();
        }
    } catch (err) {
        console.error('Error enviando viaje:', err);
        alert('âŒ ERROR AL GUARDAR VIAJE:\n' + err.message);
        btn.innerText = originalText;
    } finally {
        btn.disabled = false;
    }
}

async function handleExpenseSubmit(e) {
    e.preventDefault();
    const session = checkAuth();
    if (!session) return;
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML; // Usar innerHTML por si tiene iconos
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';

    try {
        const tripID = getVal('ID_Viaje');

        // REGLA DE NEGOCIO: ValidaciÃ³n Diferenciada (Chofer vs Admin)
        if (String(session.rol).toLowerCase() !== 'admin' && String(session.rol).toLowerCase() !== 'superadmin') {
            // LÃ³gica para CHOFERES
            if (!tripID) throw new Error('Es obligatorio indicar el ID de Viaje para registrar un gasto.');

            // Validar existencia y estatus En Proceso
            const { data: tripCheck, error: tripCheckErr } = await window.supabaseClient
                .from(DB_CONFIG.tableViajes)
                .select('estatus_viaje')
                .eq('id_viaje', tripID)
                .single();

            if (tripCheckErr || !tripCheck) throw new Error('El ID de Viaje ingresado no existe.');

            // REGLA: Solo viajes en proceso
            if (tripCheck.estatus_viaje !== 'En Proceso') {
                throw new Error(`El viaje ${tripID} no estÃ¡ en curso (Estatus: ${tripCheck.estatus_viaje}). No se pueden registrar gastos.`);
            }
        }
        // Nota: Los admins pueden dejar tripID vacÃ­o para gastos generales.

        const formaPago = document.getElementById('Exp_Forma_Pago')?.value || 'Contado';

        const expenseData = {
            fecha: getVal('Fecha'),
            id_viaje: tripID || null, // Permitir NULL para admins
            id_unidad: getVal('ID_Unidad'),
            id_chofer: (document.getElementById('ID_Chofer') ? (getVal('ID_Chofer') || null) : (session.id_contacto || session.usuario)),
            concepto: getVal('Concepto'),
            monto: parseFloat(getVal('Monto')) || 0,
            litros_rellenados: parseFloat(getVal('Litros_Rellenados')) || 0,
            kmts_anteriores: parseFloat(getVal('Kmts_Anteriores')) || 0,
            kmts_actuales: parseFloat(getVal('Kmts_Actuales')) || 0,
            kmts_recorridos: parseFloat(getVal('Kmts_Recorridos')) || 0,
            forma_pago: formaPago,
            es_deducible: getVal('Exp_Deducible') || 'SÃ­',
            estatus_pago: 'Pendiente' // Regla de negocio: Todo nace/renace pendiente de revisiÃ³n
        };

        const acreedorVal = document.getElementById('Exp_Acreedor')?.value;
        if (acreedorVal) {
            expenseData.acreedor_nombre = acreedorVal;
        } else {
            expenseData.acreedor_nombre = null;
        }

        // Upload photo logic
        const file = document.getElementById('Ticket_Foto')?.files[0];
        if (file) {
            const fileName = `${Date.now()}_${file.name}`;
            const { error: uploadError } = await window.supabaseClient.storage
                .from('tickets-gastos')
                .upload(fileName, file);
            if (uploadError) throw uploadError;
            expenseData.ticket_foto = fileName; // Corrected column name
        }

        // Upload Tachometer Photo Logic
        const fileTaco = document.getElementById('Foto_tacometro')?.files[0];
        if (fileTaco) {
            const fileNameTaco = `taco_${Date.now()}_${fileTaco.name}`;
            const { error: uploadErrorTaco } = await window.supabaseClient.storage
                .from('tickets-gastos')
                .upload(fileNameTaco, fileTaco);
            if (uploadErrorTaco) throw uploadErrorTaco;
            expenseData.foto_tacometro = fileNameTaco;
        }

        let error;
        if (isEditingExpense && editingExpenseId) {
            const { error: updateError } = await window.supabaseClient
                .from(DB_CONFIG.tableGastos)
                .update(expenseData)
                .eq('id_gasto', editingExpenseId);
            error = updateError;
        } else {
            const id = getVal('ID_Gasto') || 'GAS-' + Date.now().toString().slice(-6);
            expenseData.id_gasto = id;
            expenseData.estatus_aprobacion = 'Pendiente';

            const { error: insertError } = await window.supabaseClient
                .from(DB_CONFIG.tableGastos)
                .insert([expenseData]);
            error = insertError;
        }

        if (error) throw error;

        alert(isEditingExpense ? 'Gasto actualizado.' : 'Gasto registrado correctamente.');
        e.target.reset();
        isEditingExpense = false;
        editingExpenseId = null;
        btn.innerHTML = 'Registrar Gasto';

        if (document.getElementById('gastos-list-view')) {
            toggleSectionView('gastos', 'list');
            if (typeof loadExpenses === 'function') loadExpenses();
            else if (typeof loadExpensesList === 'function') loadExpensesList();
            // Note: In render it's called loadExpenses(), but let's be safe.
        }

    } catch (err) {
        console.error('Error procesando gasto:', err);
        alert('Error: ' + err.message);
        btn.innerHTML = originalText;
    } finally {
        btn.disabled = false;
    }
}

// --- FUNCIONES DE EDICIÃ“N Y ACCIONES RÃPIDAS ---

function registerExpenseFromTrip(tripId, unitId, driverId) {
    showSection('gastos');
    toggleSectionView('gastos', 'form');

    // Pre-llenar datos
    document.getElementById('ID_Viaje').value = tripId;
    document.getElementById('ID_Unidad').value = unitId;

    // Seleccionar chofer si existe en la lista y no es null
    const choferSelect = document.getElementById('ID_Chofer');
    if (choferSelect && driverId && driverId !== 'null' && driverId !== 'undefined') {
        choferSelect.value = driverId;
    }

    // Generar ID Gasto nuevo y fecha hoy
    document.getElementById('ID_Gasto').value = 'GAS-' + Date.now().toString().slice(-6);
    document.getElementById('Fecha').value = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();

    isEditingExpense = false;
    const btn = document.querySelector('#gasto-form button[type="submit"]');
    if (btn) btn.innerText = 'Registrar Gasto';
}

function editTrip(id) {
    const trip = allTripsData.find(t => t.id_viaje === id);
    if (!trip) return;

    isEditingTrip = true;
    editingTripId = id;

    // Switch view
    toggleSectionView('viajes', 'form');

    // Fill form
    document.getElementById('V_ID_Viaje').value = trip.id_viaje;
    document.getElementById('V_Fecha').value = trip.fecha;
    document.getElementById('V_ID_Unidad').value = trip.id_unidad;
    document.getElementById('V_ID_Chofer').value = trip.id_chofer;
    document.getElementById('V_Cliente').value = trip.cliente;
    document.getElementById('V_Origen').value = trip.origen;
    document.getElementById('V_Destino').value = trip.destino;
    document.getElementById('V_Monto_Flete').value = trip.monto_flete;
    document.getElementById('V_Estatus_Viaje').value = trip.estatus_viaje;
    document.getElementById('V_Comision_Chofer').value = trip.comision_chofer;
    document.getElementById('V_Estatus_Pago').value = trip.estatus_pago;

    // Change Button Text
    const btn = document.querySelector('#viaje-form button[type="submit"]');
    if (btn) btn.innerText = 'Actualizar Viaje';
}

function editExpense(id) {
    // Buscar en la lista de gastos actual (dependiendo de la tab, puede ser allExpensesData o filtered)
    // Usaremos allExpensesData si existe, o currentExpensesRaw si estÃ¡ definido globalmente
    let expense = null;
    if (typeof allExpensesData !== 'undefined') expense = allExpensesData.find(g => g.id_gasto === id);
    // Fallback variable
    if (!expense && typeof currentExpensesRaw !== 'undefined') expense = currentExpensesRaw.find(g => g.id_gasto === id);

    if (!expense) return;

    isEditingExpense = true;
    editingExpenseId = id;

    toggleSectionView('gastos', 'form');

    document.getElementById('ID_Gasto').value = expense.id_gasto;
    document.getElementById('Fecha').value = expense.fecha;
    document.getElementById('ID_Viaje').value = expense.id_viaje;
    document.getElementById('ID_Unidad').value = expense.id_unidad;
    if (document.getElementById('ID_Chofer')) document.getElementById('ID_Chofer').value = expense.id_chofer || '';
    document.getElementById('Concepto').value = expense.concepto;
    document.getElementById('Monto').value = expense.monto;
    document.getElementById('Litros_Rellenados').value = expense.litros_rellenados;
    document.getElementById('Kmts_Anteriores').value = expense.kmts_anteriores;
    document.getElementById('Kmts_Actuales').value = expense.kmts_actuales;
    document.getElementById('Kmts_Recorridos').value = expense.kmts_recorridos;

    // Handle Forma Pago and Acreedor
    const formaPagoSelect = document.getElementById('Exp_Forma_Pago');
    if (formaPagoSelect) {
        formaPagoSelect.value = expense.forma_pago;
        toggleAcreedorField(); // Trigger visibility logic
    }

    if (document.getElementById('Exp_Deducible')) {
        document.getElementById('Exp_Deducible').value = expense.es_deducible || 'SÃ­';
    }

    if (expense.acreedor_nombre && document.getElementById('Exp_Acreedor')) {
        document.getElementById('Exp_Acreedor').value = expense.acreedor_nombre;
    }

    const btn = document.querySelector('#gasto-form button[type="submit"]');
    if (btn) btn.innerText = 'Actualizar Gasto';
}


// --- INICIALIZACIÃ“N DE FORMULARIOS ---

async function initFormCatalogs() {
    const selects = {
        'V_ID_Unidad': DB_CONFIG.tableUnidades,
        'V_ID_Chofer': DB_CONFIG.tableChoferes,
        'V_Cliente': DB_CONFIG.tableClientes,
        'ID_Unidad': DB_CONFIG.tableUnidades,
        'ID_Chofer': DB_CONFIG.tableChoferes,
        'acc-id-viaje-cta': DB_CONFIG.tableViajes
    };

    for (const [id, table] of Object.entries(selects)) {
        const el = document.getElementById(id);
        if (!el) continue;

        try {
            const data = await fetchSupabaseData(table);
            const activeData = data.filter(item => (item.estatus || 'Activo') === 'Activo');

            // Texto por defecto vacÃ­o o "Selecciona"
            el.innerHTML = `<option value="">-- Selecciona una opciÃ³n --</option>`;

            activeData.forEach(item => {
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
            console.error(`Error cargando catÃ¡logo para ${id}:`, err);
            el.innerHTML = `<option value="">Error al cargar datos</option>`;
        }
    }

    // Special case for Acreedor (Drivers + Clients + Providers)
    const acreedorSelect = document.getElementById('Exp_Acreedor');
    if (acreedorSelect) {
        try {
            const [choferes, clientes, proveedores] = await Promise.all([
                fetchSupabaseData(DB_CONFIG.tableChoferes),
                fetchSupabaseData(DB_CONFIG.tableClientes),
                fetchSupabaseData(DB_CONFIG.tableProveedores)
            ]);

            acreedorSelect.innerHTML = '<option value="">-- Selecciona Acreedor (Opcional) --</option>';
            choferes.filter(x => (x.estatus || 'Activo') === 'Activo').forEach(x => {
                acreedorSelect.innerHTML += `<option value="${x.nombre}">${x.nombre} (Chofer)</option>`;
            });
            clientes.filter(x => (x.estatus || 'Activo') === 'Activo').forEach(x => {
                acreedorSelect.innerHTML += `<option value="${x.nombre_cliente}">${x.nombre_cliente} (Cliente)</option>`;
            });
            proveedores.filter(x => (x.estatus || 'Activo') === 'Activo').forEach(x => {
                acreedorSelect.innerHTML += `<option value="${x.nombre_proveedor}">${x.nombre_proveedor} (Proveedor)</option>`;
            });
        } catch (err) {
            console.error('Error cargando catÃ¡logo de acreedores:', err);
        }
    }

    // Auto-generar ID de Viaje al iniciar
    generateTripID();
}

function toggleAcreedorField() {
    const formaPago = document.getElementById('Exp_Forma_Pago')?.value;
    const container = document.getElementById('acreedor-container');
    if (container) {
        if (formaPago === 'CrÃ©dito') {
            container.classList.remove('hidden');
        } else {
            container.classList.add('hidden');
            const acreedorSelect = document.getElementById('Exp_Acreedor');
            if (acreedorSelect) acreedorSelect.value = '';
        }
    }
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

    if (section) section.classList.remove('hidden');
    if (nav) nav.classList.add('active');

    // Refrescar catÃ¡logos al entrar a secciones relevantes
    if (['viajes', 'gastos', 'tesoreria', 'liquidaciones'].includes(sectionId)) {
        initFormCatalogs();
    }
}
// --- LÃ“GICA DE LISTADOS Y BÃšSQUEDA ---

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

    // Auto-reset forms on toggle if needed
    if (view === 'form' && section === 'tesoreria') {
        document.getElementById('account-form')?.reset();
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
        <tr class="hover:bg-white/[0.02] transition-colors border-b border-white/5 last:border-0 hover:border-white/10">
            <td class="px-6 py-4">
                <div class="font-black text-white text-xs tracking-tight">${v.id_viaje}</div>
                <div class="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-1">${v.fecha}</div>
            </td>
            <td class="px-6 py-4">
                <div class="text-xs font-black text-slate-200 tracking-tight">${v.cliente}</div>
                <div class="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5 flex items-center gap-1">
                    ${v.origen} <i class="fas fa-arrow-right text-[7px] text-blue-500/30"></i> ${v.destino}
                </div>
            </td>
            <td class="px-6 py-4 text-[10px] font-bold text-slate-400 space-y-1">
                <div class="flex items-center gap-2"><i class="fas fa-truck text-blue-500/50 w-3"></i> ${v.id_unidad}</div>
                <div class="flex items-center gap-2"><i class="fas fa-user-tie text-blue-500/50 w-3"></i> ${v.id_chofer}</div>
            </td>
            <td class="px-6 py-4 font-black text-white text-xs">$${(parseFloat(v.monto_flete) || 0).toLocaleString()}</td>
            <td class="px-6 py-4">
                <span class="text-[9px] font-black px-2.5 py-1 rounded-full border ${v.estatus_pago === 'Pagado' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'} uppercase tracking-widest">
                    ${v.estatus_pago || 'Pendiente'}
                </span>
            </td>
            <td class="px-6 py-4 text-right space-x-1">
                <button onclick="showDetailModal('viajes', '${v.id_viaje}')" title="Ver Detalle"
                    class="w-8 h-8 rounded-lg bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all">
                    <i class="fas fa-eye text-xs"></i>
                </button>
                <button onclick="registerExpenseFromTrip('${v.id_viaje}', '${v.id_unidad}', '${v.id_chofer}')" title="Registrar Gasto del Viaje"
                    class="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all">
                    <i class="fas fa-receipt text-xs"></i>
                </button>
                <button onclick="prepareAdvance('${v.id_viaje}', '${v.id_chofer}')" title="Registrar Anticipo"
                    class="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-all">
                    <i class="fas fa-hand-holding-usd text-xs"></i>
                </button>
                <button onclick="editTrip('${v.id_viaje}')" class="w-8 h-8 rounded-lg bg-white/5 text-blue-400 hover:text-blue-200 hover:bg-blue-500/20 transition-all" title="Editar">
                    <i class="fas fa-edit text-xs"></i>
                </button>
                <button onclick="deleteItem('${DB_CONFIG.tableViajes}', '${v.id_viaje}', 'id_viaje')" class="w-8 h-8 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all" title="Eliminar">
                    <i class="fas fa-trash text-xs"></i>
                </button>
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
        btn.classList.remove('bg-blue-600', 'text-white', 'shadow-lg', 'shadow-blue-600/20');
        btn.classList.add('text-slate-500', 'hover:text-white', 'hover:bg-white/5');
    });
    document.getElementById(`tab-${type}`).classList.add('bg-blue-600', 'text-white', 'shadow-lg', 'shadow-blue-600/20');
    document.getElementById(`tab-${type}`).classList.remove('text-slate-500', 'hover:bg-white', 'hover:bg-slate-50');

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

    // Parallel fetch: Catalog Data + Expenses (if needed for yield)
    const promises = [fetchSupabaseData(tables[type])];
    if (type === 'choferes' || type === 'unidades') {
        promises.push(fetchSupabaseData(DB_CONFIG.tableGastos));
    }

    const [data, expenses] = await Promise.all(promises);
    catalogData = data;

    if (loader) loader.classList.add('hidden');

    renderCatalogTable(type, catalogData, expenses || []);
}

function calculateFuelMetrics(id, type, expenses) {
    // Wrapper for Catalog usage
    const m = calculateEntityFuelMetrics(expenses, id, type);
    return {
        last: m.lastStr,
        avg: m.avgStr
    };
}

function renderCatalogTable(type, data, expenses = []) {
    const thead = document.getElementById('catalog-table-head');
    const tbody = document.getElementById('catalog-table-body');
    if (!thead || !tbody) return;

    const config = {
        'choferes': {
            headers: ['ID', 'Nombre', 'Licencia', 'Unidad Asignada', 'Rendimiento (Ãšltimo / Promedio)'],
            row: d => {
                const metrics = calculateFuelMetrics(d.id_chofer, 'choferes', expenses);
                return `<td class="px-6 py-4 font-black text-white text-xs tracking-tight">${d.id_chofer}</td>
                       <td class="px-6 py-4 font-bold text-slate-200 text-xs">${d.nombre}</td>
                       <td class="px-6 py-4 text-slate-400 text-[11px] font-medium">${d.licencia || '-'}</td>
                       <td class="px-6 py-4 text-blue-400 font-black text-xs">${d.id_unidad || '<span class="text-slate-600 font-normal">Sin asignar</span>'}</td>
                       <td class="px-6 py-4">
                           <div class="text-[10px] font-black text-amber-500">Ãšlt: ${metrics.last}</div>
                           <div class="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Prom: ${metrics.avg}</div>
                       </td>`;
            }
        },
        'unidades': {
            headers: ['ID', 'Unidad', 'Placas', 'Chofer Asignado', 'Rendimiento (Ãšltimo / Promedio)'],
            row: d => {
                const id = d.id_unidad; // Use ECO ID usually
                const metrics = calculateFuelMetrics(id, 'unidades', expenses);
                return `<td class="px-6 py-4 font-black text-white text-xs tracking-tight">${d.id_unidad}</td>
                       <td class="px-6 py-4 font-bold text-slate-200 text-xs">${d.nombre_unidad}</td>
                       <td class="px-6 py-4 text-slate-400 text-[11px] font-medium">${d.placas || '-'}</td>
                       <td class="px-6 py-4 text-emerald-400 font-black text-xs">${d.id_chofer || '<span class="text-slate-600 font-normal">Sin asignar</span>'}</td>
                       <td class="px-6 py-4">
                           <div class="text-[10px] font-black text-amber-500">Ãšlt: ${metrics.last}</div>
                           <div class="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1">Prom: ${metrics.avg}</div>
                       </td>`;
            }
        },
        'clientes': {
            headers: ['Nombre', 'RFC/RazÃ³n Social', 'Contacto'],
            row: d => `<td class="px-6 py-4 font-bold text-slate-800">${d.nombre_cliente}</td>
                       <td class="px-6 py-4 font-semibold text-slate-700 text-xs">${d.rfc} / ${d.razon_social}</td>
                       <td class="px-6 py-4 text-slate-500 text-xs">${d.contacto_nombre} <br/> ${d.email}</td>`
        },
        'proveedores': {
            headers: ['ID', 'Proveedor', 'Tipo', 'TelÃ©fono'],
            row: d => `<td class="px-6 py-4 font-bold text-slate-800">${d.id_proveedor}</td>
                       <td class="px-6 py-4 font-semibold text-slate-700">${d.nombre_proveedor}</td>
                       <td class="px-6 py-4 text-slate-500">${d.tipo_proveedor}</td>
                       <td class="px-6 py-4 text-slate-500">${d.telefono || '-'}</td>`
        }
    };

    const c = config[type];
    thead.innerHTML = `<tr>${c.headers.map(h => `<th class="px-6 py-4">${h}</th>`).join('')}<th class="px-6 py-4">Estatus</th><th class="px-6 py-4 text-right">Acciones</th></tr>`;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${c.headers.length + 2}" class="px-6 py-12 text-center text-slate-400 italic">No hay registros aÃºn</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(d => {
        const id = d.id_chofer || d.id_unidad || d.nombre_cliente || d.id_proveedor;
        const idCol = d.id_chofer ? 'id_chofer' : (d.id_unidad ? 'id_unidad' : (d.nombre_cliente ? 'nombre_cliente' : 'id_proveedor'));

        return `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0" id="row-${type}-${id}">
                ${c.row(d)}
                <td class="px-6 py-4">
                    <span class="text-[10px] font-bold ${(d.estatus || 'Activo') === 'Activo' ? 'text-green-500' : 'text-slate-400'} uppercase">
                        â— ${d.estatus || 'Activo'}
                    </span>
                </td>
                <td class="px-6 py-4 text-right space-x-2">
                    <button onclick="showDetailModal('${type}', '${id}')" title="Ver Detalle" class="text-slate-400 hover:text-slate-600 p-1"><i class="fas fa-eye"></i></button>
                    <button onclick="editCatalogInline('${type}', '${id}')" class="text-blue-500 hover:text-blue-700 p-1"><i class="fas fa-edit"></i></button>
                    <button onclick="deleteItem('${DB_CONFIG['table' + type.charAt(0).toUpperCase() + type.slice(1)]}', '${id}', '${idCol}')" class="text-red-500 hover:text-red-700 p-1"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

async function deleteItem(table, id, idCol) {
    if (!confirm('Â¿Desea eliminar definitivamente este registro?')) return;
    try {
        const { error } = await window.supabaseClient.from(table).delete().eq(idCol, id);
        if (error) throw error;
        alert('Registro eliminado.');
        location.reload(); // Recarga simple para actualizar listas
    } catch (err) {
        alert('Error al eliminar: ' + err.message);
    }
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
            { id: 'C_Telefono', label: 'TelÃ©fono', type: 'tel', placeholder: '55 0000 0000' },
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
            { id: 'CL_Razon', label: 'RazÃ³n Social', type: 'text', placeholder: 'LogÃ­stica Total S.A. de C.V.' },
            { id: 'CL_RFC', label: 'RFC', type: 'text', placeholder: 'RFC000000AAA' },
            { id: 'CL_Contacto', label: 'Nombre de Contacto', type: 'text', placeholder: 'Juan PÃ©rez' },
            { id: 'CL_Email', label: 'Email', type: 'email', placeholder: 'contacto@empresa.com' },
            { id: 'CL_Tel', label: 'TelÃ©fono', type: 'tel', placeholder: '55 0000 0000' }
        ],
        'proveedores': [
            { id: 'P_ID', label: 'ID Proveedor', type: 'text', placeholder: 'PROV-01' },
            { id: 'P_Nombre', label: 'Nombre/RazÃ³n Social', type: 'text', placeholder: 'Gasolinera Plus' },
            { id: 'P_Tipo', label: 'Tipo Proveedor', type: 'text', placeholder: 'Diesel / Refacciones' },
            { id: 'P_Tel', label: 'TelÃ©fono', type: 'tel', placeholder: '55 0000 0000' }
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

// Inicializar envÃ­o del formulario de catÃ¡logo
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

            alert('âœ… Registro guardado correctamente');
            hideCatalogForm();
            loadCatalog(currentCatalog);
        } catch (err) {
            console.error('Error al guardar catÃ¡logo:', err);
            alert('âŒ Error al guardar: ' + err.message);
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

    // Update pending count
    const pendingCount = allExpensesData.filter(g => g.estatus_aprobacion === 'Pendiente').length;
    const badge = document.getElementById('pending-expenses-count');
    if (badge) {
        badge.innerText = pendingCount;
        badge.classList.toggle('hidden', pendingCount === 0);
    }

    if (loader) loader.classList.add('hidden');
    renderExpensesTable(allExpensesData);
}

function switchExpenseTab(tab) {
    currentExpenseTab = tab;
    document.querySelectorAll('.expense-tab').forEach(btn => {
        btn.classList.remove('bg-green-600', 'text-white', 'shadow-sm');
        btn.classList.add('text-slate-500', 'hover:bg-white', 'hover:text-slate-800');
    });

    const activeBtn = document.getElementById(`exp-tab-${tab}`);
    if (activeBtn) {
        activeBtn.classList.add('bg-green-600', 'text-white', 'shadow-sm');
        activeBtn.classList.remove('text-slate-500', 'hover:bg-white', 'hover:text-slate-800');
    }

    renderExpensesTable(allExpensesData);
}

function renderExpensesTable(data) {
    const tbody = document.getElementById('expenses-table-body');
    if (!tbody) return;

    let filtered = data;
    if (currentExpenseTab === 'pendientes') {
        filtered = data.filter(g => g.estatus_aprobacion === 'Pendiente');
    }

    tbody.innerHTML = filtered.map(g => {
        const estAprob = g.estatus_aprobacion || 'Pendiente';
        const aprobClass = estAprob === 'Aprobado' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
            (estAprob === 'Rechazado' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20');

        return `
            <tr class="hover:bg-white/[0.02] transition-colors border-b border-white/5 last:border-0 hover:border-white/10">
                <td class="px-6 py-4">
                    <div class="font-black text-white text-sm tracking-tight">${g.id_gasto || 'N/A'}</div>
                    <div class="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-1">${g.fecha}</div>
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
                    $${(parseFloat(g.monto) || 0).toLocaleString()}
                </td>
                <td class="px-6 py-4">
                    <div class="flex flex-col gap-1">
                        <span class="text-[10px] font-bold ${g.estatus_pago === 'Pagado' ? 'text-green-500' : 'text-amber-500'} uppercase">
                            â— Pago: ${g.estatus_pago || 'Pendiente'}
                        </span>
                        ${g.acreedor_nombre ? `<span class="text-[8px] font-bold text-slate-500 uppercase">Acreedor: ${g.acreedor_nombre}</span>` : ''}
                        <span class="text-[8px] font-black px-1.5 py-0.5 rounded ${aprobClass} w-fit uppercase">
                            ${estAprob}
                        </span>
                    </div>
                </td>
                <td class="px-6 py-4 text-right space-x-1">
                    ${estAprob === 'Pendiente' ? `
                        <button onclick="approveExpense('${g.id_gasto}')" title="Aprobar" class="text-green-500 hover:text-green-700 p-1">
                            <i class="fas fa-check-circle"></i>
                        </button>
                        <button onclick="rejectExpense('${g.id_gasto}')" title="Rechazar" class="text-red-500 hover:text-red-700 p-1">
                            <i class="fas fa-times-circle"></i>
                        </button>
                    ` : ''}
                    <button onclick="showDetailModal('gastos', '${g.id_gasto}')" title="Ver Detalle" class="text-slate-400 hover:text-slate-600 p-1"><i class="fas fa-eye"></i></button>
                    <button onclick="editExpense('${g.id_gasto}')" class="text-blue-500 hover:text-blue-700 p-1" title="Editar"><i class="fas fa-edit"></i></button>
                    <button onclick="deleteItem('${DB_CONFIG.tableGastos}', '${g.id_gasto}', 'id_gasto')" class="text-red-500 hover:text-red-700 p-1" title="Eliminar"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

async function approveExpense(id) {
    if (!confirm('Â¿Aprobar este gasto?')) return;
    try {
        const { error } = await window.supabaseClient.from(DB_CONFIG.tableGastos).update({ estatus_aprobacion: 'Aprobado' }).eq('id_gasto', id);
        if (error) throw error;
        loadExpensesList();
    } catch (err) { alert('Error: ' + err.message); }
}

async function rejectExpense(id) {
    const motivo = prompt('Motivo del rechazo (opcional):');
    if (motivo === null) return;
    try {
        const { error } = await window.supabaseClient.from(DB_CONFIG.tableGastos).update({ estatus_aprobacion: 'Rechazado' }).eq('id_gasto', id);
        if (error) throw error;
        loadExpensesList();
    } catch (err) { alert('Error: ' + err.message); }
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

// --- TESORERÃA LOGIC ---

// --- TESORERÃA LOGIC (3-TAB REFACTOR) ---

let currentTreasuryTab = 'favor';

async function switchTreasuryTab(tab) {
    currentTreasuryTab = tab;
    document.querySelectorAll('.treasury-tab').forEach(btn => {
        btn.classList.remove('bg-blue-600', 'text-white', 'shadow-sm');
        btn.classList.add('text-slate-500', 'hover:bg-white', 'hover:text-slate-800');
    });
    const activeBtn = document.getElementById('t-tab-' + tab);
    activeBtn.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
    activeBtn.classList.remove('text-slate-500', 'hover:bg-white', 'hover:text-slate-800');

    renderTreasuryHeader(tab);
    loadTreasuryList();
}

function renderTreasuryHeader(tab) {
    const thead = document.getElementById('treasury-thead');
    if (!thead) return;

    let html = '';
    if (tab === 'viajes') {
        html = `<tr>
            <th class="px-6 py-4">Fecha / No. Interno</th>
            <th class="px-6 py-4">Cliente / Viaje</th>
            <th class="px-6 py-4">Monto Flete</th>
            <th class="px-6 py-4">Estatus Pago</th>
            <th class="px-6 py-4">AcciÃ³n</th>
        </tr>`;
    } else {
        html = `<tr>
            <th class="px-6 py-4">Fecha / ID</th>
            <th class="px-6 py-4">Actor / Concepto</th>
            <th class="px-6 py-4">Monto</th>
            <th class="px-6 py-4">Estatus</th>
            <th class="px-6 py-4">AcciÃ³n</th>
        </tr>`;
    }
    thead.innerHTML = html;
}

async function loadTreasuryList() {
    const tbody = document.getElementById('treasury-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="p-10 text-center"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr>';

    let data = [];
    if (currentTreasuryTab === 'viajes') {
        data = await fetchSupabaseData(DB_CONFIG.tableViajes);
        // Filtrar solo los que NO estÃ¡n pagados si queremos ver pendientes, 
        // pero el usuario pidiÃ³ "viajes por cobrar", usualmente incluye pagados recientes o todos.
        // Mostraremos todos los que no tengan estatus_pago = 'Pagado' por defecto.
    } else {
        const type = currentTreasuryTab === 'favor' ? 'A Favor' : 'En Contra';
        const allData = await fetchSupabaseData(DB_CONFIG.tableCuentas);
        data = allData.filter(c => c.tipo === type);
    }

    let total = 0;

    tbody.innerHTML = data.map(item => {
        if (currentTreasuryTab === 'viajes') {
            const isPaid = item.estatus_pago === 'Pagado';
            if (!isPaid) total += parseFloat(item.monto_flete) || 0;
            return `
                <tr class="hover:bg-white/[0.02] transition-colors border-b border-white/5 last:border-0 hover:border-white/10">
                    <td class="px-6 py-4">
                        <div class="font-black text-white text-xs tracking-tight">${item.no_interno || 'S/N'}</div>
                        <div class="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-1">${item.fecha}</div>
                    </td>
                    <td class="px-6 py-4">
                        <div class="text-xs font-black text-slate-200 tracking-tight">${item.cliente}</div>
                        <div class="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5 italic">${item.id_viaje}</div>
                    </td>
                    <td class="px-6 py-4 font-bold text-slate-800">$${(parseFloat(item.monto_flete) || 0).toLocaleString()}</td>
                    <td class="px-6 py-4">
                        <span class="text-[10px] font-bold ${isPaid ? 'text-green-500' : 'text-amber-500'}">
                            â— ${item.estatus_pago || 'Pendiente'}
                        </span>
                    </td>
                    <td class="px-6 py-4">
                        ${!isPaid ? `<button onclick="markTripAsPaid('${item.id_viaje}')" class="text-xs text-blue-500 hover:underline">Marcar Pagado</button>` : '<span class="text-slate-300">-</span>'}
                    </td>
                    <td class="px-6 py-4 text-right space-x-2">
                        <button onclick="editTrip('${item.id_viaje}')" title="Editar Viaje" class="text-blue-400 hover:text-blue-600 p-1"><i class="fas fa-edit"></i></button>
                        <button onclick="showDetailModal('viajes', '${item.id_viaje}')" title="Ver Detalle" class="text-slate-400 hover:text-slate-600 p-1"><i class="fas fa-eye"></i></button>
                        <button onclick="deleteItem('${DB_CONFIG.tableViajes}', '${item.id_viaje}', 'id_viaje')" class="text-red-400 hover:text-red-600 p-1"><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>
            `;
        } else {
            const monto = parseFloat(item.monto) || 0;
            if (item.estatus !== 'Liquidado') total += monto;
            return `
                <tr class="hover:bg-slate-50 transition-colors border-b border-slate-50">
                    <td class="px-6 py-4">
                        <div class="font-bold text-slate-800 text-xs">${item.id_cuenta}</div>
                        <div class="text-[10px] text-slate-400 font-mono">${item.fecha}</div>
                    </td>
                    <td class="px-6 py-4">
                        <div class="text-sm font-semibold text-slate-800">${item.actor_nombre}</div>
                        <div class="text-[10px] text-slate-400 italic">${item.concepto}</div>
                    </td>
                    <td class="px-6 py-4 font-bold text-slate-800">$${monto.toLocaleString()}</td>
                    <td class="px-6 py-4">
                        <span class="text-[10px] font-bold ${item.estatus === 'Liquidado' ? 'text-green-500' : 'text-amber-500'}">
                            â— ${item.estatus}
                        </span>
                    </td>
                    <td class="px-6 py-4">
                        ${item.estatus !== 'Liquidado' ? `<button onclick="markAccountLiquidated('${item.id_cuenta}')" class="text-xs text-green-500 hover:underline">Liquidar</button>` : '<span class="text-slate-300">-</span>'}
                    </td>
                    <td class="px-6 py-4 text-right space-x-2">
                         ${item.id_cuenta.startsWith('ACC-') ? `<button onclick="editAccount('${item.id_cuenta}')" title="Editar Cuenta" class="text-blue-400 hover:text-blue-600 p-1"><i class="fas fa-edit"></i></button>` : '<span title="Generado AutomÃ¡ticamente" class="text-slate-200 cursor-not-allowed mx-1"><i class="fas fa-edit"></i></span>'}
                        <button onclick="deleteItem('${DB_CONFIG.tableCuentas}', '${item.id_cuenta}', 'id_cuenta')" class="text-red-400 hover:text-red-600 p-1"><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>
            `;
        }
    }).join('');

    // updateTreasurySummary se encarga de los totales globales
    updateTreasurySummary();
}

// Variables globales para ediciÃ³n de cuenta
let isEditingAccount = false;
let editingAccountId = null;

async function editAccount(id) {
    const { data: account, error } = await window.supabaseClient
        .from(DB_CONFIG.tableCuentas)
        .select('*')
        .eq('id_cuenta', id)
        .single();

    if (error || !account) {
        alert('Error cargando cuenta para editar.');
        return;
    }

    isEditingAccount = true;
    editingAccountId = id;

    showAccountForm();

    // Llenar formulario
    document.getElementById('acc-tipo').value = account.tipo;
    // Manejo de actor manual vs select
    // SimplificaciÃ³n: Asumimos 'otro' para editar nombres libres, o intentamos match
    document.getElementById('acc-actor-type').value = 'otro';
    await loadActorOptions();
    document.getElementById('acc-actor-manual').value = account.actor_nombre;
    document.getElementById('acc-actor-manual').classList.remove('hidden');
    document.getElementById('acc-actor').classList.add('hidden');

    document.getElementById('acc-concepto').value = account.concepto;
    document.getElementById('acc-monto').value = account.monto;
    document.getElementById('acc-id-viaje-cta').value = account.id_viaje || '';
    document.getElementById('acc-no-interno-cta').value = account.no_interno || '';

    // Cambiar texto botÃ³n
    const btn = document.querySelector('#account-form button[type="submit"]');
    if (btn) btn.innerText = 'Actualizar Cuenta';
}

async function updateTreasurySummary() {
    // Calcular totales globales independientemente de la pestaÃ±a
    try {
        // 1. Cuentas (Todas)
        const allAccounts = await fetchSupabaseData(DB_CONFIG.tableCuentas);

        let totalFavor = 0;
        let totalContra = 0;

        allAccounts.forEach(acc => {
            if (acc.estatus !== 'Liquidado') {
                const monto = parseFloat(acc.monto) || 0;
                if (acc.tipo === 'A Favor') totalFavor += monto;
                if (acc.tipo === 'En Contra') totalContra += monto;
            }
        });

        // 2. Viajes por Cobrar (Todos los NO pagados)
        // PodrÃ­amos usar allTripsData si ya se cargÃ³, o hacer fetch
        const allTrips = await fetchSupabaseData(DB_CONFIG.tableViajes);
        let totalViajes = 0;
        allTrips.forEach(t => {
            if (t.estatus_pago !== 'Pagado') {
                totalViajes += parseFloat(t.monto_flete) || 0;
            }
        });

        // Actualizar UI
        const elFavor = document.getElementById('summary-total-favor');
        const elContra = document.getElementById('summary-total-contra');
        const elViajes = document.getElementById('summary-viajes-cobrar');

        if (elFavor) elFavor.innerText = `$${totalFavor.toLocaleString(undefined, { minimumFractionDigits: 2 })} `;
        if (elContra) elContra.innerText = `$${totalContra.toLocaleString(undefined, { minimumFractionDigits: 2 })} `;
        if (elViajes) elViajes.innerText = `$${totalViajes.toLocaleString(undefined, { minimumFractionDigits: 2 })} `;

    } catch (err) {
        console.error('Error actualizando resumen tesorerÃ­a:', err);
    }
}
// This line was incorrectly placed in the original instruction, it should not be here.
// The `|| '<tr><td colspan="6" class="p-10 text-center text-slate-400">No hay registros en esta categorÃ­a</td></tr>'`
// belongs to the `tbody.innerHTML = ...` assignment.
// The correct placement is already handled by the `join('')` part.

// The original lines for tab-specific totals should remain:
// if (currentTreasuryTab === 'favor') document.getElementById('total-favor').innerText = `$${ total.toLocaleString() }`;
// if (currentTreasuryTab === 'contra') document.getElementById('total-contra').innerText = `$${ total.toLocaleString() }`;

// These lines are now correctly placed after the `updateTreasurySummary()` call within `loadTreasuryList`.

async function markTripAsPaid(id_viaje) {
    if (!confirm('Â¿Marcar este viaje como PAGADO por el cliente?')) return;
    const { error } = await window.supabaseClient
        .from(DB_CONFIG.tableViajes)
        .update({ estatus_pago: 'Pagado' })
        .eq('id_viaje', id_viaje);

    if (error) alert('Error: ' + error.message);
    else loadTreasuryList();
}

async function loadActorOptions() {
    const typeEl = document.getElementById('acc-actor-type');
    if (!typeEl) return; // Salir si no existe el selector de tipo (HTML simplificado)

    const type = typeEl.value;
    const select = document.getElementById('acc-actor');
    const manualInput = document.getElementById('acc-actor-manual');

    if (!select || !manualInput) return;

    select.innerHTML = '<option value="">Cargando...</option>';
    manualInput.classList.add('hidden');
    select.classList.remove('hidden');

    if (type === 'otro') {
        select.classList.add('hidden');
        manualInput.classList.remove('hidden');
        return;
    }

    const tableMap = {
        'chofer': DB_CONFIG.tableChoferes,
        'proveedor': DB_CONFIG.tableProveedores,
        'cliente': DB_CONFIG.tableClientes
    };

    const data = await fetchSupabaseData(tableMap[type]);
    const active = data.filter(i => (i.estatus || 'Activo') === 'Activo');

    select.innerHTML = '<option value="">Seleccione...</option>' + active.map(i => {
        const name = i.nombre || i.nombre_cliente || i.nombre_proveedor;
        return `<option value="${name}">${name}</option>`;
    }).join('');
}

function prepareAdvance(viajeId, choferId) {
    showSection('tesoreria');
    switchTreasuryTab('favor');
    showAccountForm();

    // Resetear form primero
    const form = document.getElementById('account-form');
    if (form) form.reset();

    // Pre-llenar datos
    document.getElementById('acc-tipo').value = 'A Favor';
    const viajeInput = document.getElementById('acc-id-viaje-cta');
    if (viajeInput) viajeInput.value = viajeId;

    // Configurar Actor (Chofer)
    const actorSimple = document.getElementById('acc-actor');
    // Intentar buscar el input de actor, ya sea simple o complejo
    if (actorSimple) {
        actorSimple.value = choferId;
    } else {
        // Fallback si la estructura cambia a select/manual
        const actorManual = document.getElementById('acc-actor-manual');
        if (actorManual) {
            actorManual.value = choferId;
            document.getElementById('acc-actor-type').value = 'otro';
            loadActorOptions(); // Forzar actualizaciÃ³n de UI si es necesario
        }
    }

    // Concepto
    document.getElementById('acc-concepto').value = `Anticipo Viaje ${viajeId}`;
}

async function crearCXCAutomatica(idViaje, monto, cliente, noInterno) {
    const data = {
        id_cuenta: 'CXC-' + Date.now().toString().slice(-6),
        fecha: (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })(),
        tipo: 'A Favor',
        actor_nombre: cliente,
        concepto: 'Pago de flete via auto-CXC',
        monto: monto,
        id_viaje: idViaje,
        no_interno: noInterno,
        estatus: 'No Liquidado'
    };
    await window.supabaseClient.from(DB_CONFIG.tableCuentas).insert([data]);
}

function showAccountForm() { toggleSectionView('treasury', 'form'); loadActorOptions(); }
function hideAccountForm() { toggleSectionView('treasury', 'list'); }

async function enviarCuenta(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const original = btn.innerText;

    try {
        btn.disabled = true;
        btn.innerText = 'Guardando...';

        const getVal = id => document.getElementById(id)?.value || '';
        const actorType = getVal('acc-actor-type');
        const actor = actorType === 'otro' ? getVal('acc-actor-manual') : getVal('acc-actor');

        const data = {
            fecha: (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })(),
            tipo: getVal('acc-tipo'),
            actor_nombre: actor,
            concepto: getVal('acc-concepto'),
            monto: parseFloat(getVal('acc-monto')) || 0,
            id_viaje: getVal('acc-id-viaje-cta') || null,
            no_interno: getVal('acc-no-interno-cta') || null,
            estatus: 'No Liquidado'
        };

        let error;
        if (isEditingAccount && editingAccountId) {
            const { error: updateError } = await window.supabaseClient
                .from(DB_CONFIG.tableCuentas)
                .update(data)
                .eq('id_cuenta', editingAccountId);
            error = updateError;
        } else {
            data.id_cuenta = 'ACC-' + Date.now().toString().slice(-6);
            const { error: insertError } = await window.supabaseClient
                .from(DB_CONFIG.tableCuentas)
                .insert([data]);
            error = insertError;
        }

        if (error) throw error;

        alert(isEditingAccount ? 'âœ… Cuenta actualizada.' : 'âœ… Cuenta registrada con Ã©xito.');
        e.target.reset();

        // Reset state
        isEditingAccount = false;
        editingAccountId = null;
        const submitBtn = e.target.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.innerText = 'Guardar Cuenta';

        hideAccountForm();
        loadTreasuryList();
    } catch (err) {
        alert('âŒ Error: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = original;
    }
}

async function markAccountLiquidated(id) {
    if (!confirm('Â¿Desea marcar esta cuenta como liquidada?')) return;

    // 1. Obtener datos de la cuenta para ver si estÃ¡ ligada a un gasto
    const { data: account } = await window.supabaseClient
        .from(DB_CONFIG.tableCuentas)
        .select('*')
        .eq('id_cuenta', id)
        .single();

    const { error } = await window.supabaseClient
        .from(DB_CONFIG.tableCuentas)
        .update({ estatus: 'Liquidado' })
        .eq('id_cuenta', id);

    if (error) {
        alert('Error: ' + error.message);
    } else {
        // 2. Si la cuenta era un gasto a crÃ©dito, marcar el gasto como pagado
        if (account && account.id_gasto_ref) {
            await window.supabaseClient
                .from(DB_CONFIG.tableGastos)
                .update({ estatus_pago: 'Pagado' })
                .eq('id_gasto', account.id_gasto_ref);
        }
        loadTreasuryList();
    }
}

async function crearCXPAutomatica({ id_gasto, monto, concepto, actor }) {
    const data = {
        id_cuenta: 'CXP-' + Date.now().toString().slice(-6),
        fecha: (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })(),
        tipo: 'En Contra',
        actor_nombre: actor,
        concepto: concepto,
        monto: monto,
        id_gasto_ref: id_gasto,
        estatus: 'No Liquidado'
    };
    await window.supabaseClient.from(DB_CONFIG.tableCuentas).insert([data]);
}

async function crearGastoComisionAutomatica({ id_viaje, monto, id_chofer, id_unidad }) {
    const data = {
        id_gasto: 'COM-' + Date.now().toString().slice(-6),
        fecha: (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })(),
        id_viaje: id_viaje,
        id_unidad: id_unidad,
        id_chofer: id_chofer,
        concepto: 'ComisiÃ³n Chofer',
        monto: monto,
        forma_pago: 'Contado',
        estatus_pago: 'Pagado',
        estatus_aprobacion: 'Aprobado'
    };
    await window.supabaseClient.from(DB_CONFIG.tableGastos).insert([data]);
}

// --- LIQUIDACIONES LOGIC (BY DRIVER REFACTOR) ---

let selectedDriverForSettlement = null;
let currentExpenses = [];
let currentDebts = [];
let pendingTripsForDriver = [];

async function loadSettlementTrips() {
    const list = document.getElementById('liquidation-driver-list');
    if (!list) return;
    list.innerHTML = '<div class="p-4 text-center"><i class="fas fa-spinner fa-spin"></i></div>';

    // 1. Obtener choferes activos
    const drivers = await fetchSupabaseData(DB_CONFIG.tableChoferes);
    const activeDrivers = drivers.filter(d => (d.estatus || 'Activo') === 'Activo');

    list.innerHTML = activeDrivers.map(d => `
        <button onclick="loadDriverSettlementDetail('${d.id_chofer}')" 
            class="w-full text-left p-4 rounded-xl border border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all flex justify-between items-center group">
            <div>
                <div class="font-black text-slate-800 truncate">${d.nombre}</div>
                <div class="text-[10px] text-slate-400">ID: ${d.id_chofer}</div>
            </div>
            <i class="fas fa-chevron-right text-slate-200 group-hover:text-blue-500 transition-all"></i>
        </button>
        `).join('') || '<p class="text-sm p-4 text-slate-400">No hay choferes disponibles.</p>';
}

async function loadDriverSettlementDetail(id_chofer) {
    selectedDriverForSettlement = id_chofer;
    const detail = document.getElementById('settlement-detail');
    const empty = document.getElementById('settlement-empty');
    if (!detail) return;

    detail.classList.remove('hidden');
    empty.classList.add('hidden');

    // Cargar datos: Viajes Terminados/En Proceso no liquidados + Gastos + Cuentas (Solo Anticipos/A Favor)
    const [trips, expenses, accounts] = await Promise.all([
        window.supabaseClient.from(DB_CONFIG.tableViajes).select('*').eq('id_chofer', id_chofer).neq('estatus_viaje', 'Liquidado'),
        window.supabaseClient.from(DB_CONFIG.tableGastos).select('*').eq('id_chofer', id_chofer).neq('estatus_pago', 'Pagado'),
        window.supabaseClient.from(DB_CONFIG.tableCuentas).select('*').eq('actor_nombre', id_chofer).eq('estatus', 'No Liquidado').eq('tipo', 'A Favor')
    ]);

    pendingTripsForDriver = trips.data || [];
    currentExpenses = expenses.data || [];
    currentDebts = accounts.data || [];

    // Llenar UI
    document.getElementById('set-trip-id').innerText = `LIQUIDACIÃ“N: ${id_chofer}`;
    document.getElementById('set-trip-info').innerText = `Consolidado de ${pendingTripsForDriver.length} viajes pendientes.`;

    let sumFletes = 0;
    let sumComisionesBrutas = 0;
    pendingTripsForDriver.forEach(t => {
        sumFletes += parseFloat(t.monto_flete) || 0;
        sumComisionesBrutas += parseFloat(t.comision_chofer) || 0;
    });

    document.getElementById('set-flete').innerText = `$${sumFletes.toLocaleString()}`;

    // Gastos Operativos
    const expList = document.getElementById('set-expenses-list');
    let sumExp = 0;

    // Filtramos SOLO los gastos de Contado/Efectivo QUE SEAN DEDUCIBLES ('SÃ­')
    const reimbursableExpenses = currentExpenses.filter(g =>
        ['Contado', 'Efectivo'].includes(g.forma_pago) &&
        String(g.es_deducible || 'SÃ­').trim() === 'SÃ­'
    );

    expList.innerHTML = reimbursableExpenses.map(g => {
        const estAprob = g.estatus_aprobacion || 'Pendiente';
        const isPending = estAprob === 'Pendiente';
        const aprobColor = estAprob === 'Aprobado' ? 'text-green-500' : (estAprob === 'Rechazado' ? 'text-red-500' : 'text-amber-500');

        // Solo sumamos lo que se muestra
        sumExp += parseFloat(g.monto);

        return `
    < div class= "flex flex-col gap-1 border-b border-slate-100 pb-2 mb-2 last:border-0 last:pb-0 last:mb-0" >
                <div class="flex justify-between items-center">
                    <span class="text-xs font-semibold text-slate-700">
                        ${g.concepto} (${g.id_viaje})
                    </span>
                    <span class="font-mono font-bold">$${parseFloat(g.monto).toLocaleString()}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-[8px] font-black uppercase ${aprobColor}">${estAprob}</span>
                    ${isPending ? `
                        <div class="flex gap-2">
                            <button onclick="approveSettlementExpense('${g.id_gasto}', '${id_chofer}')" class="text-[8px] bg-green-500 text-white px-2 py-0.5 rounded hover:bg-green-600">Aprobar</button>
                            <button onclick="rejectSettlementExpense('${g.id_gasto}', '${id_chofer}')" class="text-[8px] bg-red-500 text-white px-2 py-0.5 rounded hover:bg-red-600">Rechazar</button>
                        </div>
                    ` : ''}
                </div>
            </div >
        `;
    }).join('') || '<span class="text-slate-400 italic">Sin gastos a reembolsar</span>';
    document.getElementById('set-sum-expenses').innerText = `$${sumExp.toLocaleString()}`;

    // Anticipos/Deudas (Solo se restan los "A Favor" - Anticipos)
    const debtList = document.getElementById('set-debts-list');
    let sumDebtNeto = 0;
    debtList.innerHTML = currentDebts.map(d => {
        const monto = parseFloat(d.monto) || 0;
        sumDebtNeto += monto;
        return `< div class= "flex justify-between text-amber-700" ><span>${d.concepto} (Anticipo)</span><span class="font-mono">-$${monto.toLocaleString()}</span></div > `;
    }).join('') || '<span class="text-amber-400 italic">Sin anticipos pendientes</span>';
    document.getElementById('set-sum-debts').innerText = `- $${sumDebtNeto.toLocaleString()}`;

    // Totales finales
    const approvedExpenses = currentExpenses.filter(g =>
        (g.estatus_aprobacion || 'Pendiente') === 'Aprobado' &&
        ['Contado', 'Efectivo'].includes(g.forma_pago) &&
        String(g.es_deducible || 'SÃ­').trim() === 'SÃ­'
    );
    const sumApprovedExp = approvedExpenses.reduce((sum, g) => sum + (parseFloat(g.monto) || 0), 0);
    const neto = sumComisionesBrutas + sumApprovedExp - sumDebtNeto;

    document.getElementById('set-comm-bruta').innerText = `$${sumComisionesBrutas.toLocaleString()}`;
    document.getElementById('set-sum-expenses').innerText = `$${sumApprovedExp.toLocaleString()}`;
    document.getElementById('set-retencion').innerText = `- $${sumDebtNeto.toLocaleString()}`;
    document.getElementById('set-pago-neto').innerText = `$${neto.toLocaleString()}`;
}

function showSettlementFullDetail() {
    if (!selectedDriverForSettlement) {
        alert('Seleccione un chofer primero.');
        return;
    }

    const modal = document.getElementById('detail-modal');
    const content = document.getElementById('modal-content');
    const title = document.getElementById('modal-title');

    modal.classList.remove('hidden');
    title.innerText = 'Detalle Completo de LiquidaciÃ³n';

    // Generar tabla de Viajes
    const tripsHtml = pendingTripsForDriver.map(t => `
        <tr class="border-b border-slate-100 text-xs text-slate-600">
            <td class="p-2 font-mono">${t.id_viaje}</td>
            <td class="p-2">${t.origen} -> ${t.destino}</td>
            <td class="p-2 text-right font-bold">$${(parseFloat(t.monto_flete) || 0).toLocaleString()}</td>
            <td class="p-2 text-right text-green-600 font-bold">$${((parseFloat(t.monto_flete) || 0) * 0.15).toLocaleString()}</td>
        </tr>
    `).join('') || '<tr><td colspan="4" class="p-4 text-center text-slate-400 italic">Sin viajes pendientes</td></tr>';

    // Generar tabla de Gastos (Aprobados)
    // Generar tabla de Gastos (Aprobados)
    const activeExpenses = currentExpenses.filter(g =>
        g.forma_pago === 'Contado' &&
        String(g.es_deducible || 'SÃ­').trim() === 'SÃ­'
    );
    const expensesHtml = activeExpenses.map(g => `
        <tr class="border-b border-slate-100 text-xs text-slate-600">
            <td class="p-2 font-mono">${g.id_gasto}</td>
            <td class="p-2">${g.concepto}</td>
            <td class="p-2 font-bold ${g.estatus_aprobacion === 'Aprobado' ? 'text-slate-700' : 'text-amber-500'}">
                $${(parseFloat(g.monto) || 0).toLocaleString()}
            </td>
            <td class="p-2 text-[10px]">${g.estatus_aprobacion || 'Pendiente'}</td>
        </tr>
    `).join('') || '<tr><td colspan="4" class="p-4 text-center text-slate-400 italic">Sin gastos reembolsables</td></tr>';

    // Generar tabla de Deudas
    const debtsHtml = currentDebts.map(d => `
        <tr class="border-b border-slate-100 text-xs text-slate-600">
            <td class="p-2 font-mono">${d.id_cuenta}</td>
            <td class="p-2">${d.concepto}</td>
            <td class="p-2 text-right font-bold text-red-500">-$${(parseFloat(d.monto) || 0).toLocaleString()}</td>
        </tr>
    `).join('') || '<tr><td colspan="3" class="p-4 text-center text-slate-400 italic">Sin deudas pendientes</td></tr>';

    content.innerHTML = `
        <div class="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
            <!-- SecciÃ³n Viajes -->
            <div>
                <h4 class="font-bold text-blue-600 uppercase text-xs mb-2 border-b border-blue-100 pb-1">1. Viajes a Liquidar (ComisiÃ³n 15%)</h4>
                <table class="w-full text-left">
                    <thead class="bg-blue-50 text-[10px] uppercase font-bold text-blue-400">
                        <tr><th class="p-2">ID</th><th class="p-2">Ruta</th><th class="p-2 text-right">Flete</th><th class="p-2 text-right">ComisiÃ³n</th></tr>
                    </thead>
                    <tbody>${tripsHtml}</tbody>
                </table>
            </div>

            <!-- SecciÃ³n Gastos -->
            <div>
                <h4 class="font-bold text-slate-600 uppercase text-xs mb-2 border-b border-slate-100 pb-1">2. Reembolsos (Gastos Contado)</h4>
                <table class="w-full text-left">
                    <thead class="bg-slate-50 text-[10px] uppercase font-bold text-slate-400">
                        <tr><th class="p-2">ID</th><th class="p-2">Concepto</th><th class="p-2">Monto</th><th class="p-2">Estado</th></tr>
                    </thead>
                    <tbody>${expensesHtml}</tbody>
                </table>
            </div>

            <!-- SecciÃ³n Deudas -->
            <div>
                <h4 class="font-bold text-amber-600 uppercase text-xs mb-2 border-b border-amber-100 pb-1">3. Descuentos (Adelantos/Deudas)</h4>
                <table class="w-full text-left">
                    <thead class="bg-amber-50 text-[10px] uppercase font-bold text-amber-400">
                        <tr><th class="p-2">ID</th><th class="p-2">Concepto</th><th class="p-2 text-right">Monto</th></tr>
                    </thead>
                    <tbody>${debtsHtml}</tbody>
                </table>
            </div>
        </div>
        <div class="mt-6 pt-4 border-t border-slate-100 text-right">
             <button onclick="closeDetailModal()" class="px-6 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg text-sm">Cerrar Detalle</button>
        </div>
    `;
}

async function finalizeSettlement() {
    if (!selectedDriverForSettlement) return;

    // Check for unapproved expenses
    const unapproved = currentExpenses.filter(g => (g.estatus_aprobacion || 'Pendiente') === 'Pendiente');
    if (unapproved.length > 0) {
        alert('âŒ No se puede finalizar la liquidaciÃ³n: Hay ' + unapproved.length + ' gastos pendientes de aprobaciÃ³n.');
        return;
    }

    const settleData = calculateCurrentSettlement();
    if (!settleData || settleData.monto_neto <= 0) {
        if (!confirm('La liquidaciÃ³n es de $0.00 o menor. Â¿Desea continuar de todos modos?')) return;
    }

    if (!confirm(`Â¿Desea cerrar la liquidaciÃ³n para ${selectedDriverForSettlement} ?\nTotal Neto: $${settleData.monto_neto.toLocaleString()}`)) return;

    try {
        // 1. Guardar Maestro de LiquidaciÃ³n
        const { error: lErr } = await window.supabaseClient.from(DB_CONFIG.tableLiquidaciones).insert([{
            id_chofer: selectedDriverForSettlement,
            fecha_inicio: pendingTripsForDriver.length > 0 ? pendingTripsForDriver[0].fecha : (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })(),
            fecha_fin: (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })(),
            total_fletes: settleData.total_fletes,
            total_gastos: settleData.total_gastos,
            monto_comision: settleData.monto_comision,
            monto_neto: settleData.monto_neto
        }]);
        if (lErr) throw lErr;

        // 2. Marcar deudas como liquidadas
        if (currentDebts.length > 0) {
            const ids = currentDebts.map(d => d.id_cuenta);
            await window.supabaseClient.from(DB_CONFIG.tableCuentas).update({ estatus: 'Liquidado' }).in('id_cuenta', ids);
        }

        // 3. Marcar viajes como operativamente 'Liquidado' y generar comisiones
        if (pendingTripsForDriver.length > 0) {
            const ids = pendingTripsForDriver.map(t => t.id_viaje);
            await window.supabaseClient.from(DB_CONFIG.tableViajes).update({ estatus_viaje: 'Liquidado', estatus_pago: 'Pagado' }).in('id_viaje', ids);

            // Generar gastos de comisiÃ³n por cada viaje
            for (const t of pendingTripsForDriver) {
                await crearGastoComisionAutomatica({
                    id_viaje: t.id_viaje,
                    monto: parseFloat(t.comision_chofer) || (parseFloat(t.monto_flete) * 0.15),
                    id_chofer: t.id_chofer,
                    id_unidad: t.id_unidad
                });
            }
        }

        // 4. Marcar gastos como pagados
        // 4. Marcar gastos como pagados (SOLO LOS REEMBOLSABLES: Contado o Efectivo)
        // OJO: Si pagamos todo lo 'Aprobado', podrÃ­amos pagar crÃ©ditos por error si no filtramos.
        // La lÃ³gica visual solo muestra Contado/Efectivo, asÃ­ que solo debemos liquidar esos.
        const approvedExpenses = currentExpenses.filter(g =>
            (g.estatus_aprobacion || 'Pendiente') === 'Aprobado' &&
            ['Contado', 'Efectivo'].includes(g.forma_pago) &&
            String(g.es_deducible || 'SÃ­').trim() === 'SÃ­'
        );

        if (approvedExpenses.length > 0) {
            const ids = approvedExpenses.map(g => g.id_gasto);
            await window.supabaseClient.from(DB_CONFIG.tableGastos).update({ estatus_pago: 'Pagado' }).in('id_gasto', ids);
        }

        alert('âœ… LiquidaciÃ³n consolidada guardada y cuentas cerradas.');
        loadSettlementTrips();
        document.getElementById('settlement-detail').classList.add('hidden');
        document.getElementById('settlement-empty').classList.remove('hidden');
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

function calculateCurrentSettlement() {
    const totalFletes = pendingTripsForDriver.reduce((sum, t) => sum + (parseFloat(t.monto_flete) || 0), 0);
    const approvedReimbursable = currentExpenses.filter(g =>
        (g.estatus_aprobacion || 'Pendiente') === 'Aprobado' &&
        ['Contado', 'Efectivo'].includes(g.forma_pago) &&
        String(g.es_deducible || 'SÃ­').trim() === 'SÃ­'
    );
    const totalGastosAprobados = approvedReimbursable.reduce((sum, g) => sum + (parseFloat(g.monto) || 0), 0);

    // totalDebts = Solo A Favor (Se recuperan de la liquidaciÃ³n)
    const totalDebts = currentDebts.reduce((sum, d) => {
        return d.tipo === 'A Favor' ? sum + (parseFloat(d.monto) || 0) : sum;
    }, 0);

    const comm = totalFletes * 0.15;
    const neto = comm + totalGastosAprobados - totalDebts;

    return {
        total_fletes: totalFletes,
        total_gastos: totalGastosAprobados,
        monto_comision: comm,
        monto_neto: neto
    };
}

// Inicializar vista de tesorerÃ­a al cargar
switchTreasuryTab('favor');

// --- FUNCIONES EXTRA (Inline Edit Helpers) ---

// --- UNIVERSAL INLINE EDITING ---

async function editCatalogInline(type, id) {
    const row = document.getElementById(`row-${type}-${id}`);
    if (!row) return;

    // Obtener datos actuales del servidor o una cachÃ© si existiera
    const table = DB_CONFIG['table' + type.charAt(0).toUpperCase() + type.slice(1)];
    const idCol = type === 'choferes' ? 'id_chofer' : (type === 'unidades' ? 'id_unidad' : (type === 'clientes' ? 'nombre_cliente' : 'id_proveedor'));

    const { data: item } = await window.supabaseClient.from(table).select('*').eq(idCol, id).single();
    if (!item) return;

    let editHtml = '';
    if (type === 'choferes') {
        editHtml = `
            <td class="px-6 py-4"><input type="text" id="edit-id-${id}" value="${item.id_chofer}" class="w-24 p-1 border rounded bg-slate-50 text-slate-900 font-bold focus:ring-2 focus:ring-blue-500"></td>
            <td class="px-6 py-4"><input type="text" id="edit-nombre-${id}" value="${item.nombre}" class="w-full p-1 border rounded bg-white text-slate-800 font-bold focus:ring-2 focus:ring-blue-500"></td>
            <td class="px-6 py-4"><input type="text" id="edit-licencia-${id}" value="${item.licencia || ''}" class="w-full p-1 border rounded text-slate-800 bg-white"></td>
            <td class="px-6 py-4"><input type="text" id="edit-unidad-${id}" value="${item.id_unidad || ''}" class="w-full p-1 border rounded text-slate-800 bg-white"></td>
            <td class="px-6 py-4 text-slate-400 text-[10px] uppercase font-bold tracking-tight">Cálculo Auto</td>
        `;
    } else if (type === 'unidades') {
        editHtml = `
            <td class="px-6 py-4"><input type="text" id="edit-id-${id}" value="${item.id_unidad}" class="w-24 p-1 border rounded bg-slate-50 text-slate-900 font-bold"></td>
            <td class="px-6 py-4"><input type="text" id="edit-nombre-${id}" value="${item.nombre_unidad || ''}" class="w-full p-1 border rounded bg-white"></td>
            <td class="px-6 py-4"><input type="text" id="edit-placas-${id}" value="${item.placas || ''}" class="w-full p-1 border rounded bg-white"></td>
            <td class="px-6 py-4"><input type="text" id="edit-chofer-${id}" value="${item.id_chofer || ''}" class="w-full p-1 border rounded bg-white"></td>
           <td class="px-6 py-4 text-slate-400 text-[10px] uppercase font-bold tracking-tight">Cálculo Auto</td>
        `;
    } else if (type === 'clientes') {
        editHtml = `
            <td class="px-6 py-4"><input type="text" id="edit-nombre-${id}" value="${item.nombre_cliente}" class="w-full p-1 border rounded bg-slate-50 text-slate-900 font-bold"></td>
            <td class="px-6 py-4"><input type="text" id="edit-rfc-${id}" value="${item.rfc || ''}" class="w-24 p-1 border rounded bg-white"></td>
            <td class="px-6 py-4"><input type="text" id="edit-contacto-${id}" value="${item.contacto_nombre || ''}" class="w-full p-1 border rounded bg-white"></td>
        `;
    } else if (type === 'proveedores') {
        editHtml = `
            <td class="px-6 py-4"><input type="text" id="edit-id-${id}" value="${item.id_proveedor}" class="w-24 p-1 border rounded bg-slate-50 text-slate-900 font-bold"></td>
            <td class="px-6 py-4"><input type="text" id="edit-nombre-${id}" value="${item.nombre_proveedor}" class="w-full p-1 border rounded bg-white"></td>
            <td class="px-6 py-4"><input type="text" id="edit-tipo-${id}" value="${item.tipo_proveedor || ''}" class="w-full p-1 border rounded bg-white"></td>
            <td class="px-6 py-4"><input type="text" id="edit-tel-${id}" value="${item.telefono || ''}" class="w-full p-1 border rounded bg-white"></td>
        `;
    }

    const estatusHtml = `
        <td class="px-6 py-4">
        <select id="edit-estatus-${id}" class="p-1 border rounded text-xs">
            <option value="Activo" ${item.estatus === 'Activo' ? 'selected' : ''}>Activo</option>
            <option value="Inactivo" ${item.estatus === 'Inactivo' ? 'selected' : ''}>Inactivo</option>
        </select>
        </td>
        <td class="px-6 py-4 text-right space-x-2">
            <button onclick="saveCatalogInline('${type}', '${id}')" class="text-green-500 hover:text-green-700 p-1"><i class="fas fa-save"></i></button>
            <button onclick="location.reload()" class="text-slate-400 hover:text-slate-600 p-1"><i class="fas fa-times"></i></button>
        </td>
        `;

    row.innerHTML = editHtml + estatusHtml;
}

async function saveCatalogInline(type, id) {
    const table = DB_CONFIG['table' + type.charAt(0).toUpperCase() + type.slice(1)];
    const idCol = type === 'choferes' ? 'id_chofer' : (type === 'unidades' ? 'id_unidad' : (type === 'clientes' ? 'nombre_cliente' : 'id_proveedor'));

    let updateData = {
        estatus: document.getElementById(`edit-estatus-${id}`).value
    };

    if (type === 'choferes') {
        updateData.id_chofer = document.getElementById(`edit-id-${id}`).value;
        updateData.nombre = document.getElementById(`edit-nombre-${id}`).value;
        updateData.licencia = document.getElementById(`edit-licencia-${id}`).value;
        updateData.id_unidad = document.getElementById(`edit-unidad-${id}`).value;
    } else if (type === 'unidades') {
        updateData.id_unidad = document.getElementById(`edit-id-${id}`).value;
        updateData.nombre_unidad = document.getElementById(`edit-nombre-${id}`).value;
        updateData.placas = document.getElementById(`edit-placas-${id}`).value;
        updateData.id_chofer = document.getElementById(`edit-chofer-${id}`).value;
    } else if (type === 'clientes') {
        updateData.nombre_cliente = document.getElementById(`edit-nombre-${id}`).value;
        updateData.rfc = document.getElementById(`edit-rfc-${id}`).value;
        updateData.contacto_nombre = document.getElementById(`edit-contacto-${id}`).value;
    } else if (type === 'proveedores') {
        updateData.id_proveedor = document.getElementById(`edit-id-${id}`).value;
        updateData.nombre_proveedor = document.getElementById(`edit-nombre-${id}`).value;
        updateData.tipo_proveedor = document.getElementById(`edit-tipo-${id}`).value;
        updateData.telefono = document.getElementById(`edit-tel-${id}`).value;
    }

    try {
        const { error } = await window.supabaseClient.from(table).update(updateData).eq(idCol, id);
        if (error) throw error;
        alert('Cambios guardados con Ã©xito.');
        location.reload();
    } catch (err) {
        alert('Error al guardar: ' + err.message);
    }
}

// --- CATALOG DETAIL MODAL ---


async function approveSettlementExpense(id, id_chofer) {
    try {
        const { error } = await window.supabaseClient.from(DB_CONFIG.tableGastos).update({ estatus_aprobacion: 'Aprobado' }).eq('id_gasto', id);
        if (error) throw error;
        loadDriverSettlementDetail(id_chofer);
        loadExpensesList(); // Update background list too
    } catch (err) { alert('Error: ' + err.message); }
}

async function rejectSettlementExpense(id, id_chofer) {
    const motivo = prompt('Motivo del rechazo:');
    if (motivo === null) return;
    try {
        const { error } = await window.supabaseClient.from(DB_CONFIG.tableGastos).update({ estatus_aprobacion: 'Rechazado' }).eq('id_gasto', id);
        if (error) throw error;
        loadDriverSettlementDetail(id_chofer);
        loadExpensesList(); // Update background list too
    } catch (err) { alert('Error: ' + err.message); }
}


// --- DRIVER FORM HELPER ---
async function populateDriverFormOptions() {
    const unitSelect = document.getElementById('ID_Unidad');
    const driverSelect = document.getElementById('ID_Chofer');

    if (!unitSelect && !driverSelect) return;

    try {
        // Fetch Data: Units and Drivers
        const [units, drivers] = await Promise.all([
            fetchSupabaseData(DB_CONFIG.tableUnidades),
            fetchSupabaseData(DB_CONFIG.tableChoferes)
        ]);

        // Populate Units
        if (unitSelect) {
            const activeUnits = units.filter(u => (u.estatus || 'Activo') === 'Activo');
            unitSelect.innerHTML = '<option value="" class="bg-slate-900">Selecciona Unidad</option>' +
                activeUnits.map(u => `<option value="${u.id_unidad}" class="bg-slate-900">${u.id_unidad} - ${u.nombre_unidad} (${u.placas || 'S/P'})</option>`).join('');
        }

        // Populate Drivers
        if (driverSelect) {
            const activeDrivers = drivers.filter(d => (d.estatus || 'Activo') === 'Activo');
            driverSelect.innerHTML = '<option value="" class="bg-slate-900">Selecciona Chofer</option>' +
                activeDrivers.map(d => `<option value="${d.id_chofer}" class="bg-slate-900">${d.nombre}</option>`).join('');

            // Auto-select current driver if session exists
            const session = checkAuth();
            if (session && session.id_chofer) {
                driverSelect.value = session.id_chofer;
            }
        }

    } catch (err) {
        console.error('Error populating driver form options:', err);
    }
}

