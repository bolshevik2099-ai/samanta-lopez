
let mainChart = null; // Instancia global para el gráfico

// Variables Globales de Datos (para búsqueda)
let allTripsData = [];
let allExpensesData = [];
let currentUnitTrips = [];
let currentUnitExpenses = [];
let currentExpenseTab = 'todos';
let globalDriverMap = {};
let globalUnitMap = {};

function getLocalISODate(date = new Date()) {
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().split('T')[0];
}

// Global Helper to parse and normalize date strings to YYYY-MM-DD
function parseDateToISO(d) {
    if (!d) return '';
    if (typeof d !== 'string') {
        try {
            d = new Date(d).toISOString().split('T')[0];
        } catch(e) {
            return '';
        }
    }
    
    // If it already matches YYYY-MM-DD, return the date part
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) {
        return d.substring(0, 10);
    }
    
    if (d.includes('/')) {
        const parts = d.split(' ')[0].split('/');
        if (parts.length === 3) {
            const part0 = parseInt(parts[0], 10);
            const part1 = parseInt(parts[1], 10);
            let year = parseInt(parts[2], 10);
            if (year < 100) year += 2000;
            
            let day = part0;
            let month = part1;
            
            if (part1 > 12) {
                // Format must be MM/DD/YYYY because month is <= 12 and part1 (day) is > 12
                day = part1;
                month = part0;
            } else {
                // Default to Mexican Spanish standard DD/MM/YYYY
                day = part0;
                month = part1;
            }
            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
    }
    
    try {
        const dateObj = new Date(d);
        if (isNaN(dateObj.getTime())) return '';
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    } catch (e) {
        return '';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Verificar sesión al cargar
    const session = checkAuth();
    if (session) {
        const ids = ['user-name-display', 'display-chofer', 'admin-name', 'user-display'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = session.nombre || session.usuario || 'Usuario';
        });

        // Ocultar botón de configuración de chat para saulrivas@gmail.com
        if (session.usuario && String(session.usuario).trim().toLowerCase() === 'saulrivas@gmail.com') {
            const settingsChatBtn = document.getElementById('nav-settings-chat');
            if (settingsChatBtn) {
                settingsChatBtn.style.display = 'none';
            }
        }
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
        if (typeof enviarCuenta === 'function') accountForm.addEventListener('submit', enviarCuenta);
    }

    const rateForm = document.getElementById('rate-form');
    if (rateForm) rateForm.addEventListener('submit', handleRateSubmit);

    const catalogForm = document.getElementById('catalog-form');
    if (catalogForm) catalogForm.addEventListener('submit', handleCatalogSubmit);

    // Live Commission Calculation (15%)
    const fleteInput = document.getElementById('V_Monto_Flete');
    const commInput = document.getElementById('V_Comision_Chofer');
    if (fleteInput && commInput) {
        fleteInput.addEventListener('input', () => {
            const flete = parseFloat(fleteInput.value) || 0;
            commInput.value = (flete * 0.15).toFixed(2);
        });
    }

    // --- Lógica de Campos Condicionales de Diesel ---
    const conceptoSelect = document.getElementById('Concepto');
    const dieselBlock = document.getElementById('diesel-fields');
    // Inputs que se deben resetear/requerir
    const dieselInputs = ['Litros_Rellenados', 'Kmts_Anteriores', 'Kmts_Actuales'];

    if (conceptoSelect && dieselBlock) {
        const toggleDieselInfo = () => {
            const isDiesel = conceptoSelect.value === 'Diesel' || conceptoSelect.value === 'Urea';
            if (isDiesel) {
                dieselBlock.classList.remove('hidden');
                dieselInputs.forEach(id => document.getElementById(id)?.setAttribute('required', 'true'));
                
                // Actualizar rendimientos inmediatamente al mostrar los campos
                if (typeof window.updateLiveYield === 'function') {
                    window.updateLiveYield();
                }
                const currentUnit = document.getElementById('ID_Unidad')?.value;
                if (currentUnit && typeof window.updateLastYieldDisplay === 'function') {
                    window.updateLastYieldDisplay(currentUnit);
                }
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

    // --- Cálculo Automático de Kilómetros ---
    const kmAntInput = document.getElementById('Kmts_Anteriores');
    const kmActInput = document.getElementById('Kmts_Actuales');
    const kmRecInput = document.getElementById('Kmts_Recorridos');

    if (kmAntInput && kmActInput && kmRecInput) {
        const calcKm = () => {
            const ant = parseFloat(kmAntInput.value) || 0;
            const act = parseFloat(kmActInput.value) || 0;
            kmRecInput.value = act > ant ? (act - ant) : 0;
            if (typeof window.updateLiveYield === 'function') {
                window.updateLiveYield();
            }
        };
        kmAntInput.addEventListener('input', calcKm);
        kmActInput.addEventListener('input', calcKm);
    }

    // --- Cálculo de Rendimiento en Vivo al Cambiar Campos ---
    const updateYieldInputs = [
        'Kmts_Anteriores', 'Kmts_Actuales', 'Litros_Tracto', 'Litros_Termo',
        'chk-tracto', 'chk-termo', 'Litros_Rellenados'
    ];
    updateYieldInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const eventName = el.type === 'checkbox' ? 'change' : 'input';
            el.addEventListener(eventName, () => {
                if (typeof window.updateLiveYield === 'function') {
                    window.updateLiveYield();
                }
            });
        }
    });

    const unitSelect = document.getElementById('ID_Unidad');
    if (unitSelect) {
        unitSelect.addEventListener('change', (e) => {
            if (typeof window.updateLastYieldDisplay === 'function') {
                window.updateLastYieldDisplay(e.target.value);
            }
            if (typeof window.updateLiveYield === 'function') {
                window.updateLiveYield();
            }
        });
    }

    // Inicializar Dashboard Nativo por API
    if (document.getElementById('period-table-body')) {
        setupDateFilters();
        updateDashboardByPeriod();
    }

    // Inicializar filtros de fecha de ganancias
    if (document.getElementById('ganancias-filter-start')) {
        setupGananciasDateFilters();
    }

    // Inicializar monitoreo de la conexión de Saúl Rivas
    if (document.getElementById('saul-conn-status')) {
        loadSaulConnectionStatus();
        setInterval(loadSaulConnectionStatus, 30000); // Actualizar cada 30 segundos
    }

    // Sidebar: Carga de Listados
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const navId = e.currentTarget.id.replace('nav-', '');
            if (navId === 'viajes') loadTripsList();
            if (navId === 'gastos') loadExpensesList();
            if (navId === 'dashboard') {
                if (currentDashboardTab === 'unit') {
                    updateUnitDashboard();
                } else {
                    updateDashboardByPeriod();
                }
            }
            if (navId === 'movimientos') loadMovementsByPeriod();
            if (navId === 'tarifas') loadRatesList();
        });
    });

    // Inicializar Catálogos en Selects
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

    // Event listener to auto-populate unit and driver when ID_Viaje is entered
    const viajeInput = document.getElementById('ID_Viaje');
    if (viajeInput) {
        viajeInput.addEventListener('change', async (e) => {
            const tripId = e.target.value.trim();
            if (!tripId) return;
            try {
                const { data: trip, error } = await window.supabaseClient
                    .from(DB_CONFIG.tableViajes)
                    .select('id_unidad, id_chofer')
                    .eq('id_viaje', tripId)
                    .maybeSingle();

                if (error) {
                    console.error('Error fetching trip for auto-fill:', error);
                    return;
                }

                if (trip) {
                    const unitSelect = document.getElementById('ID_Unidad');
                    const driverSelect = document.getElementById('ID_Chofer');
                    if (unitSelect && trip.id_unidad) {
                        unitSelect.value = trip.id_unidad;
                        if (typeof window.updateLastYieldDisplay === 'function') {
                            window.updateLastYieldDisplay(trip.id_unidad);
                        }
                        if (typeof window.updateLiveYield === 'function') {
                            window.updateLiveYield();
                        }
                    }
                    if (driverSelect && trip.id_chofer) {
                        driverSelect.value = trip.id_chofer;
                    }
                }
            } catch (err) {
                console.error('Error in ID_Viaje change listener:', err);
            }
        });
    }
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
        case 'anticipo':
        case 'deuda':
        case 'cobro':
        case 'pago_deuda':
        case 'cuentas':
            renderGenericDetail(DB_CONFIG.tableCuentas, 'id_cuenta', id, 'Detalle de Movimiento / Cuenta');
            break;
        default:
            content.innerHTML = '<p class="text-center text-slate-500">Tipo de detalle no soportado.</p>';
    }
}

async function ensureGlobalMapsLoaded() {
    if (Object.keys(globalDriverMap).length === 0) {
        const drivers = await fetchSupabaseData(DB_CONFIG.tableChoferes);
        drivers.forEach(d => globalDriverMap[d.id_chofer] = d.nombre);
    }
    if (Object.keys(globalUnitMap).length === 0) {
        const units = await fetchSupabaseData(DB_CONFIG.tableUnidades);
        units.forEach(u => globalUnitMap[u.id_unidad] = u.nombre_unidad || u.id_unidad);
    }
}

// --- SPECIALIZED DETAIL RENDERERS ---

async function renderGenericDetail(table, idCol, id, titleText) {
    const content = document.getElementById('modal-content');
    const title = document.getElementById('modal-title');
    if (title) title.innerText = titleText + ': ' + id;

    try {
        await ensureGlobalMapsLoaded();
        const { data, error } = await window.supabaseClient.from(table).select('*').eq(idCol, id).single();
        if (error) throw error;

        let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">';
        for (const [key, value] of Object.entries(data)) {
            if (key === 'created_at' || value === null) continue;

            const label = key.replace(/_/g, ' ');
            let displayValue = value;

            // Mapeo de IDs a Nombres
            if (key === 'id_chofer' || key === 'chofer') {
                displayValue = globalDriverMap[value] ? `${globalDriverMap[value]} [${value}]` : value;
            } else if (key === 'id_unidad' || key === 'id_unit_eco' || key === 'unidad') {
                displayValue = globalUnitMap[value] ? `${globalUnitMap[value]} [${value}]` : value;
            } else if (key === 'actor_nombre') {
                displayValue = globalDriverMap[value] ? `${globalDriverMap[value]} [${value}]` : (globalUnitMap[value] ? `${globalUnitMap[value]} [${value}]` : value);
            }

            // Rendering Lógico de Imagenes
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
                    <div class="text-sm font-semibold text-slate-800">${displayValue}</div>
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
        const tractoSupport = (parseFloat(g.litros_tracto) > 0 || parseFloat(g.litros_termo) > 0);
        const effectiveVol = tractoSupport ? (parseFloat(g.litros_tracto) || 0) : (parseFloat(g.litros_rellenados) || 0);
        const isFuel = (effectiveVol > 0 && g.concepto === 'Diesel');
        // If entityId is provided, double check (though usually pre-filtered)
        const isMatch = entityId ? (entityType === 'choferes' ? g.id_chofer === entityId : (g.id_unidad === entityId || g.id_unit_eco === entityId)) : true;
        return isFuel && isMatch;
    });

    if (fuelExpenses.length === 0) return { last: 0, avg: 0, lastStr: 'N/A', avgStr: 'N/A' };

    // Sort Descending (Newest first)
    fuelExpenses.sort((a, b) => {
        const dateA = parseDateToISO(a.fecha);
        const dateB = parseDateToISO(b.fecha);
        const dateComp = dateB.localeCompare(dateA);
        if (dateComp !== 0) return dateComp;
        const timeA = a.created_at || a.id_gasto || '';
        const timeB = b.created_at || b.id_gasto || '';
        return timeB.localeCompare(timeA);
    });

    // 1. Last Yield (Most recent fill-up)
    const last = fuelExpenses[0];
    const lastTSupport = (parseFloat(last.litros_tracto) > 0 || parseFloat(last.litros_termo) > 0);
    const lastVol = lastTSupport ? (parseFloat(last.litros_tracto) || 0) : (parseFloat(last.litros_rellenados) || 0);
    const lastYield = (lastVol > 0) ? (parseFloat(last.kmts_recorridos) / lastVol) : 0;

    // 2. Historical Average (Total Km / Total Liters) - Robust Method
    const totalKm = fuelExpenses.reduce((sum, g) => sum + (parseFloat(g.kmts_recorridos) || 0), 0);
    const totalLiters = fuelExpenses.reduce((sum, g) => {
        const tractoSupport = (parseFloat(g.litros_tracto) > 0 || parseFloat(g.litros_termo) > 0);
        const vol = tractoSupport ? (parseFloat(g.litros_tracto) || 0) : (parseFloat(g.litros_rellenados) || 0);
        return sum + vol;
    }, 0);
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
                                <p class="text-sm font-bold text-blue-400">${globalUnitMap[driver.id_unidad] ? `${globalUnitMap[driver.id_unidad]} [${driver.id_unidad}]` : (driver.id_unidad || 'N/A')}</p>
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
                        <div class="bg-amber-600/10 p-6 rounded-3xl border border-amber-500/10 flex flex-col justify-center col-span-2">
                            <p class="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1">Rend. Último</p>
                            <p class="text-2xl font-black text-amber-400 tracking-tighter">${lastYield.toFixed(2)} <span class="text-xs">km/l</span></p>
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
                                    <th class="px-6 py-4 text-right">Comisión</th>
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
                                <p class="text-slate-500 text-xs font-medium"><i class="fas fa-map-marker-alt mr-2 text-blue-500/50"></i> ${client.direccion || 'Sin dirección'}</p>
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

        // Pre-calculate individual yields and liters display for the log
        expenses.forEach(e => {
            if (e.concepto === 'Diesel') {
                const tractoSupport = (parseFloat(e.litros_tracto) > 0 || parseFloat(e.litros_termo) > 0);
                const effectiveVol = tractoSupport ? (parseFloat(e.litros_tracto) || 0) : (parseFloat(e.litros_rellenados) || 0);
                if (effectiveVol > 0 && parseFloat(e.kmts_recorridos) > 0) {
                    e._calculatedYield = parseFloat(e.kmts_recorridos) / effectiveVol;
                } else {
                    e._calculatedYield = null;
                }

                if (tractoSupport) {
                    const parts = [];
                    if (parseFloat(e.litros_tracto) > 0) parts.push(`${parseFloat(e.litros_tracto)} LT (Tracto)`);
                    if (parseFloat(e.litros_termo) > 0) parts.push(`${parseFloat(e.litros_termo)} LT (Termo)`);
                    e._litrosDisplay = parts.join(' + ');
                } else {
                    e._litrosDisplay = parseFloat(e.litros_rellenados) > 0 ? `${parseFloat(e.litros_rellenados)} LT` : null;
                }
            } else {
                e._calculatedYield = null;
                e._litrosDisplay = null;
            }
        });

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
                                <span class="bg-blue-500/10 px-4 py-2 rounded-full border border-blue-500/20 text-blue-400"><i class="fas fa-user-tie mr-2"></i>${globalDriverMap[unit.id_chofer] ? `${globalDriverMap[unit.id_chofer]} [${unit.id_chofer}]` : (unit.id_chofer || 'Sin Chofer')}</span>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 lg:grid-cols-1 gap-4 w-full md:w-auto">
                             <div class="bg-white/5 p-5 rounded-3xl border border-white/5">
                                <p class="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Inversión Reciente</p>
                                <p class="text-2xl font-black text-red-500 tracking-tighter">$${totalExpenses.toLocaleString()}</p>
                             </div>
                             <div class="bg-white/5 p-5 rounded-3xl border border-white/5">
                                 <p class="text-[9px] font-black text-amber-500/70 uppercase tracking-widest mb-1">Último Rend.</p>
                                 <p class="text-2xl font-black text-amber-500 tracking-tighter">${lastYield.toFixed(2)} <span class="text-xs">km/l</span></p>
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
                                    <th class="px-6 py-4 text-center">Métricas</th>
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
                                                ${e._litrosDisplay ? `<span class="mx-2 text-slate-700">|</span> <span>${e._litrosDisplay}</span>` : ''}
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
    title.innerText = 'Liquidación Detallada: ' + idLiquidacion;

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
                        <p class="text-[9px] font-black uppercase text-emerald-400/70 tracking-widest mb-1">Comisión Generada</p>
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
    // Default: Ãšltimos 30 días
    const lastMonth = new Date();
    lastMonth.setDate(today.getDate() - 30);

    startInput.value = getLocalISODate(lastMonth);
    endInput.value = getLocalISODate(today);
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
            fetchSupabaseData(DB_CONFIG.tableViajes, 'fecha', start, end),
            fetchSupabaseData(DB_CONFIG.tableGastos, 'fecha', start, end),
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
        const parseDate = parseDateToISO;

        const filterByDate = (rows, s, e) => rows.filter(r => {
            const rowDate = parseDate(r.fecha);
            return rowDate && rowDate >= s && rowDate <= e;
        });

        const viajes = filterByDate(viajesRaw, start, end);
        const gastos = filterByDate(gastosRaw, start, end).filter(g => {
            const c = (g.concepto || '').toLowerCase();
            return c !== 'comisión chofer' && c !== 'comision chofer';
        });

        console.log('Viajes filtrados:', viajes.length);
        console.log('Gastos filtrados:', gastos.length);

        // Agregaciones
        const totalVenta = viajes.reduce((acc, v) => acc + (parseFloat(v.monto_flete) || 0), 0);
        const totalGasto = gastos.reduce((acc, g) => acc + (parseFloat(g.monto) || 0), 0);
        const totalComisiones = viajes.reduce((acc, v) => acc + (parseFloat(v.comision_chofer) || 0), 0);
        const totalGanancia = totalVenta - totalGasto - totalComisiones;

        const totalViajes = viajes.length;
        const margenGanancia = totalVenta > 0 ? (totalGanancia / totalVenta) * 100 : 0;
        const fletePromedio = totalViajes > 0 ? totalVenta / totalViajes : 0;

        // Actualizar Tarjetas UI
        const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

        safeSetText('period-venta', fmt(totalVenta));
        safeSetText('period-gasto', fmt(totalGasto));
        safeSetText('period-comisiones', fmt(totalComisiones));
        safeSetText('period-ganancia', fmt(totalGanancia));
        safeSetText('period-viajes-count', totalViajes);
        safeSetText('period-margen', margenGanancia.toFixed(2) + '%');
        safeSetText('period-flete-promedio', fmt(fletePromedio));
        safeSetText('period-label', `Periodo: ${start} al ${end}`);

        // Rendimiento de la flota del periodo
        const fleetFuelExpenses = gastos.filter(g => {
            const tractoSupport = (parseFloat(g.litros_tracto) > 0 || parseFloat(g.litros_termo) > 0);
            const effectiveVol = tractoSupport ? (parseFloat(g.litros_tracto) || 0) : (parseFloat(g.litros_rellenados) || 0);
            return effectiveVol > 0 && (g.id_unidad || g.id_unit_eco) && g.concepto === 'Diesel';
        });
        const { fleetAvg } = calculateFleetEfficiency(fleetFuelExpenses, unidadesRaw);
        const rendEl = document.getElementById('period-rendimiento');
        if (rendEl) {
            rendEl.innerHTML = fleetAvg > 0 ? `${fleetAvg.toFixed(2)} <span class="text-sm font-bold text-slate-400">km/l</span>` : '-- km/l';
        }

        // Renderizar Tabla y Gráfico Principal
        renderPeriodTable(viajes, gastos);
        renderChart(viajes, gastos);

        // Renderizar Gráficos Avanzados (si existen los containers)
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

// --- DASHBOARD SUB-SECTIONS (GENERAL vs UNIT vs DRIVER vs EXPENSES vs DEBTS) ---
let currentDashboardTab = 'general';
let unitDashboardInitialized = false;
let driverDashboardInitialized = false;
let expensesDashboardInitialized = false;
let debtsDashboardInitialized = false;

window.switchDashboardTab = function(tab) {
    currentDashboardTab = tab;
    
    const tabs = ['general', 'unit', 'driver', 'expenses', 'debts', 'summary', 'range-summary'];
    
    tabs.forEach(t => {
        const btn = document.getElementById('tab-db-' + t);
        const subview = document.getElementById('db-' + t + '-subview');
        
        if (btn) {
            if (t === tab) {
                btn.className = "px-5 py-2.5 rounded-xl text-xs md:text-sm font-bold bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition-all";
            } else {
                btn.className = "px-5 py-2.5 rounded-xl text-xs md:text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-800/40 transition-all";
            }
        }
        
        if (subview) {
            if (t === tab) {
                subview.classList.remove('hidden');
            } else {
                subview.classList.add('hidden');
            }
        }
    });
    
    if (tab === 'general') {
        updateDashboardByPeriod();
    } else if (tab === 'unit') {
        initUnitDashboard();
    } else if (tab === 'driver') {
        initDriverDashboard();
    } else if (tab === 'expenses') {
        initExpensesDashboard();
    } else if (tab === 'debts') {
        initDebtsDashboard();
    } else if (tab === 'summary') {
        initDailySummaryDashboard();
    } else if (tab === 'range-summary') {
        initRangeSummary();
    }
};

let dailySummaryInitialized = false;
let dailySummaryTrips = [];
let dailySummaryExpenses = [];

async function initDailySummaryDashboard() {
    const dateInput = document.getElementById('db-summary-date');
    if (!dateInput) return;

    if (!dateInput.value) {
        dateInput.value = getLocalISODate();
    }

    if (!dailySummaryInitialized) {
        dailySummaryInitialized = true;
    }

    updateDailySummary();
}

async function updateDailySummary() {
    const dateInput = document.getElementById('db-summary-date');
    if (!dateInput) return;

    const dateStr = dateInput.value;
    if (!dateStr) return;

    // Set printable titles
    const printTitle = document.getElementById('print-summary-date-title');
    if (printTitle) printTitle.innerText = `Fecha: ${dateStr}`;
    const printTime = document.getElementById('print-generation-time');
    if (printTime) printTime.innerText = new Date().toLocaleString('es-MX');

    const statusEl = document.getElementById('conn-status');
    if (statusEl) {
        statusEl.innerText = 'Cargando Resumen...';
        statusEl.className = 'text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest animate-pulse';
    }

    try {
        const [tripsRaw, expensesRaw] = await Promise.all([
            window.supabaseClient.from(DB_CONFIG.tableViajes).select('*').eq('fecha', dateStr),
            window.supabaseClient.from(DB_CONFIG.tableGastos).select('*').eq('fecha', dateStr)
        ]);

        if (tripsRaw.error) throw tripsRaw.error;
        if (expensesRaw.error) throw expensesRaw.error;

        const viajes = tripsRaw.data || [];
        const gastos = (expensesRaw.data || []).filter(g => {
            const c = (g.concepto || '').toLowerCase();
            return c !== 'comisión chofer' && c !== 'comision chofer';
        });

        dailySummaryTrips = viajes;
        dailySummaryExpenses = gastos;

        // Aggregate KPIs
        const totalRevenue = viajes.reduce((sum, v) => sum + (parseFloat(v.monto_flete) || 0), 0);
        const totalExpenses = gastos.reduce((sum, g) => sum + (parseFloat(g.monto) || 0), 0);
        const totalComisiones = viajes.reduce((sum, v) => sum + (parseFloat(v.comision_chofer) || 0), 0);
        const netProfit = totalRevenue - totalExpenses - totalComisiones;

        const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

        safeSetText('db-summary-total-revenue', fmt(totalRevenue));
        safeSetText('db-summary-total-expenses', fmt(totalExpenses));
        safeSetText('db-summary-total-comisiones', fmt(totalComisiones));
        
        const profitEl = document.getElementById('db-summary-net-profit');
        if (profitEl) {
            profitEl.innerText = fmt(netProfit);
            if (netProfit >= 0) {
                profitEl.className = 'text-2xl font-black text-emerald-400';
            } else {
                profitEl.className = 'text-2xl font-black text-rose-400';
            }
        }

        // Diesel Breakdown
        let dieselLiters = 0;
        let dieselCost = 0;
        let dieselKm = 0;

        gastos.forEach(g => {
            if (g.concepto === 'Diesel') {
                const tractoSupport = (parseFloat(g.litros_tracto) > 0 || parseFloat(g.litros_termo) > 0);
                const effectiveVol = tractoSupport ? (parseFloat(g.litros_tracto) || 0) : (parseFloat(g.litros_rellenados) || 0);
                dieselLiters += effectiveVol;
                dieselCost += parseFloat(g.monto) || 0;
                dieselKm += parseFloat(g.kmts_recorridos) || 0;
            }
        });

        const avgYield = (dieselLiters > 0 && dieselKm > 0) ? (dieselKm / dieselLiters) : 0;

        safeSetText('db-summary-diesel-liters', `${dieselLiters.toFixed(1)} L`);
        safeSetText('db-summary-diesel-cost', fmt(dieselCost));
        safeSetText('db-summary-diesel-yield', avgYield > 0 ? `${avgYield.toFixed(2)} km/L` : '-- km/L');

        // Render Tables
        await ensureGlobalMapsLoaded();

        const tripsTbody = document.getElementById('db-summary-trips-table-body');
        if (tripsTbody) {
            if (viajes.length === 0) {
                tripsTbody.innerHTML = '<tr><td colspan="4" class="px-4 py-6 text-center text-slate-500 italic">No hay viajes registrados en este día</td></tr>';
            } else {
                tripsTbody.innerHTML = viajes.map(v => {
                    const choferName = globalDriverMap[v.id_chofer] || v.id_chofer || 'No asignado';
                    return `
                        <tr class="hover:bg-slate-800/20 transition-colors">
                            <td class="px-4 py-3">
                                <div class="font-mono font-bold text-white">${v.id_viaje}</div>
                                <div class="text-[10px] text-slate-400">${choferName}</div>
                            </td>
                            <td class="px-4 py-3">
                                <div class="font-semibold text-slate-200">ECO: ${v.id_unidad}</div>
                                <div class="text-[10px] text-slate-400 truncate max-w-[180px]">${v.origen} ➔ ${v.destino}</div>
                            </td>
                            <td class="px-4 py-3 text-right font-bold text-blue-400">${fmt(parseFloat(v.monto_flete) || 0)}</td>
                            <td class="px-4 py-3 text-center no-print">
                                <button onclick="showDetailModal('viajes', '${v.id_viaje}')" class="text-slate-400 hover:text-blue-400 p-1 cursor-pointer transition-all" title="Ver Detalle">
                                    <i class="fas fa-eye text-[11px]"></i>
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');
            }
        }

        const expensesTbody = document.getElementById('db-summary-expenses-table-body');
        if (expensesTbody) {
            if (gastos.length === 0) {
                expensesTbody.innerHTML = '<tr><td colspan="4" class="px-4 py-6 text-center text-slate-500 italic">No hay gastos registrados en este día</td></tr>';
            } else {
                expensesTbody.innerHTML = gastos.map(g => {
                    return `
                        <tr class="hover:bg-slate-800/20 transition-colors">
                            <td class="px-4 py-3">
                                <div class="font-semibold text-white">${g.concepto}</div>
                                <div class="font-mono text-[9px] text-slate-400">${g.id_gasto}</div>
                            </td>
                            <td class="px-4 py-3">
                                <div class="font-semibold text-slate-200">ECO: ${g.id_unidad}</div>
                                <div class="text-[10px] text-slate-400 truncate max-w-[180px]">${g.id_viaje ? `Viaje: ${g.id_viaje}` : 'Gasto General'}</div>
                            </td>
                            <td class="px-4 py-3 text-right font-bold text-red-400">${fmt(parseFloat(g.monto) || 0)}</td>
                            <td class="px-4 py-3 text-center no-print">
                                <button onclick="showDetailModal('gastos', '${g.id_gasto}')" class="text-slate-400 hover:text-red-400 p-1 cursor-pointer transition-all" title="Ver Detalle">
                                    <i class="fas fa-eye text-[11px]"></i>
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');
            }
        }

        // Populate spreadsheet print view table body
        const spreadsheetTbody = document.getElementById('spreadsheet-tbody');
        if (spreadsheetTbody) {
            let rowNum = 1;
            let ssHtml = '';

            // Row 1: Header title and Date
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="font-bold text-left" colspan="2">RESUMEN DIARIO PROCESA-T</td>
                <td class="text-left" colspan="2">Fecha: ${dateStr}</td>
                <td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 2: Empty
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 3: CONSOLIDADO OPERATIVO Title
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="font-bold text-left" colspan="9">CONSOLIDADO OPERATIVO</td>
            </tr>`;

            // Row 4: Viajes del Dia
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="text-left">Viajes del Dia</td>
                <td class="text-right">${viajes.length}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 5: Ingresos Fletes
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="text-left">Ingresos Fletes</td>
                <td class="text-right">${Math.round(totalRevenue)}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 6: Gastos del Dia
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="text-left">Gastos del Dia</td>
                <td class="text-right">${Math.round(totalExpenses)}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 7: Comisiones Chofer
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="text-left">Comisiones Chofer</td>
                <td class="text-right">${Math.round(totalComisiones)}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 8: Utilidad Neta
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="text-left">Utilidad Neta</td>
                <td class="text-right">${Math.round(netProfit)}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 9: Empty
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 10: DETALLE DE VIAJES Title
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="font-bold text-left" colspan="9">DETALLE DE VIAJES</td>
            </tr>`;

            // Row 11: DETALLE DE VIAJES Header
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="font-bold text-center">ID Viaje</td>
                <td class="font-bold text-center">Chofer</td>
                <td class="font-bold text-center">Unidad</td>
                <td class="font-bold text-center">Origen</td>
                <td class="font-bold text-center">Destino</td>
                <td class="font-bold text-center">Monto Flete</td>
                <td class="font-bold text-center">Comision Chofer</td>
                <td class="font-bold text-center">Estatus Viaje</td>
                <td></td>
            </tr>`;

            // Rows 12+: DETALLE DE VIAJES Data
            if (viajes.length === 0) {
                ssHtml += `<tr>
                    <td class="ss-row-num">${rowNum++}</td>
                    <td colspan="9" class="text-center italic">No hay viajes registrados</td>
                </tr>`;
            } else {
                viajes.forEach(v => {
                    const choferName = globalDriverMap[v.id_chofer] || v.id_chofer || 'No asignado';
                    ssHtml += `<tr>
                        <td class="ss-row-num">${rowNum++}</td>
                        <td class="text-left font-mono">${v.id_viaje}</td>
                        <td class="text-left">${choferName}</td>
                        <td class="text-center font-mono">${v.id_unidad}</td>
                        <td class="text-left">${v.origen || ''}</td>
                        <td class="text-left">${v.destino || ''}</td>
                        <td class="text-right">${v.monto_flete ? Math.round(v.monto_flete) : 0}</td>
                        <td class="text-right">${v.comision_chofer ? Math.round(v.comision_chofer) : 0}</td>
                        <td class="text-center">${v.estatus_viaje || ''}</td>
                        <td></td>
                    </tr>`;
                });
            }

            // Row for spacing
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row: DETALLE DE GASTOS Title
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="font-bold text-left" colspan="9">DETALLE DE GASTOS</td>
            </tr>`;

            // Row: DETALLE DE GASTOS Header
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="font-bold text-center">ID Gasto</td>
                <td class="font-bold text-center">Concepto</td>
                <td class="font-bold text-center">Unidad</td>
                <td class="font-bold text-center">Monto</td>
                <td class="font-bold text-center">Viaje Referencia</td>
                <td class="font-bold text-center">Forma Pago</td>
                <td class="font-bold text-center">Estatus Pago</td>
                <td></td><td></td>
            </tr>`;

            // Rows: DETALLE DE GASTOS Data
            if (gastos.length === 0) {
                ssHtml += `<tr>
                    <td class="ss-row-num">${rowNum++}</td>
                    <td colspan="9" class="text-center italic">No hay gastos registrados</td>
                </tr>`;
            } else {
                gastos.forEach(g => {
                    ssHtml += `<tr>
                        <td class="ss-row-num">${rowNum++}</td>
                        <td class="text-left font-mono">${g.id_gasto}</td>
                        <td class="text-left">${g.concepto || ''}</td>
                        <td class="text-center font-mono">${g.id_unidad || ''}</td>
                        <td class="text-right">${g.monto ? Math.round(g.monto) : 0}</td>
                        <td class="text-left font-mono">${g.id_viaje || ''}</td>
                        <td class="text-center">${g.forma_pago || ''}</td>
                        <td class="text-center">${g.estatus_pago || ''}</td>
                        <td></td><td></td>
                    </tr>`;
                });
            }

            spreadsheetTbody.innerHTML = ssHtml;
        }

        if (statusEl) {
            statusEl.innerText = 'Conectado';
            statusEl.className = 'text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest';
        }

    } catch (e) {
        console.error('Error updating daily summary:', e);
        if (statusEl) {
            statusEl.innerText = 'Error: ' + e.message;
            statusEl.className = 'text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest';
        }
    }
}

async function printDailySummary() {
    const element = document.getElementById('daily-summary-print-area');
    if (!element) return;

    const dateInput = document.getElementById('db-summary-date');
    const dateStr = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];

    if (typeof html2pdf !== 'undefined') {
        // Add generating-pdf class to body to temporarily apply print styles on-screen
        document.body.classList.add('generating-pdf');
        
        // Force layout reflow
        document.body.offsetHeight;
        
        // Wait a bit for the styles to apply
        await new Promise(resolve => setTimeout(resolve, 250));

        const opt = {
            margin:       0.3,
            filename:     `Resumen_Diario_${dateStr}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, logging: false, backgroundColor: null },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
            pagebreak:    { mode: ['css', 'legacy'] }
        };

        try {
            await html2pdf().set(opt).from(element).save();
        } catch (error) {
            console.error('Error generating PDF:', error);
            window.print();
        } finally {
            // Remove the class to restore normal screen styling
            document.body.classList.remove('generating-pdf');
        }
    } else {
        window.print();
    }
}

function shareDailySummaryOnWhatsApp() {
    const dateInput = document.getElementById('db-summary-date');
    if (!dateInput || !dateInput.value) return;

    const dateStr = dateInput.value;
    const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

    const totalRevenue = dailySummaryTrips.reduce((sum, v) => sum + (parseFloat(v.monto_flete) || 0), 0);
    const totalExpenses = dailySummaryExpenses.reduce((sum, g) => sum + (parseFloat(g.monto) || 0), 0);
    const totalComisiones = dailySummaryTrips.reduce((sum, v) => sum + (parseFloat(v.comision_chofer) || 0), 0);
    const netProfit = totalRevenue - totalExpenses - totalComisiones;

    let dieselLiters = 0;
    let dieselCost = 0;
    dailySummaryExpenses.forEach(g => {
        if (g.concepto === 'Diesel') {
            const tractoSupport = (parseFloat(g.litros_tracto) > 0 || parseFloat(g.litros_termo) > 0);
            const effectiveVol = tractoSupport ? (parseFloat(g.litros_tracto) || 0) : (parseFloat(g.litros_rellenados) || 0);
            dieselLiters += effectiveVol;
            dieselCost += parseFloat(g.monto) || 0;
        }
    });

    let text = `*📋 RESUMEN DIARIO PROCESA-T*\n`;
    text += `*📅 Fecha:* ${dateStr}\n`;
    text += `------------------------------------\n\n`;
    
    text += `🚚 *Viajes del Día:* ${dailySummaryTrips.length}\n`;
    text += `💰 *Ingresos (Fletes):* ${fmt(totalRevenue)}\n`;
    text += `💸 *Gastos Operativos:* ${fmt(totalExpenses)}\n`;
    text += `👤 *Comisiones Chofer:* ${fmt(totalComisiones)}\n`;
    text += `📈 *Utilidad Neta:* ${fmt(netProfit)}\n\n`;

    if (dieselLiters > 0) {
        text += `⛽ *Consumo Diésel:*\n`;
        text += `• Litros Totales: ${dieselLiters.toFixed(1)} L\n`;
        text += `• Costo Diésel: ${fmt(dieselCost)}\n\n`;
    }

    if (dailySummaryTrips.length > 0) {
        text += `⚓ *Detalle de Viajes:*\n`;
        dailySummaryTrips.forEach((v, idx) => {
            const choferName = globalDriverMap[v.id_chofer] || v.id_chofer || 'Sin chofer';
            text += `${idx + 1}. *${v.id_viaje}* (ECO ${v.id_unidad}) - ${choferName}\n   Ruta: ${v.origen} ➔ ${v.destino}\n   Flete: ${fmt(parseFloat(v.monto_flete) || 0)}\n`;
        });
        text += `\n`;
    }

    if (dailySummaryExpenses.length > 0) {
        text += `💵 *Detalle de Gastos:*\n`;
        dailySummaryExpenses.forEach((g, idx) => {
            text += `${idx + 1}. *${g.concepto}* (ECO ${g.id_unidad}) - ${fmt(parseFloat(g.monto) || 0)}\n`;
        });
        text += `\n`;
    }

    text += `_Generado automáticamente desde Procesa-T Admin Panel_`;

    navigator.clipboard.writeText(text).then(() => {
        // Redirigir a WhatsApp directamente
        const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
        window.open(waUrl, '_blank');
    }).catch(err => {
        console.error('Error copying text to clipboard:', err);
        const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
        window.open(waUrl, '_blank');
    });
}

function exportDailySummaryToCSV() {
    const dateInput = document.getElementById('db-summary-date');
    if (!dateInput || !dateInput.value) return;

    const dateStr = dateInput.value;

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += `RESUMEN DIARIO PROCESA-T;Fecha: ${dateStr}\n\n`;

    const totalRevenue = dailySummaryTrips.reduce((sum, v) => sum + (parseFloat(v.monto_flete) || 0), 0);
    const totalExpenses = dailySummaryExpenses.reduce((sum, g) => sum + (parseFloat(g.monto) || 0), 0);
    const totalComisiones = dailySummaryTrips.reduce((sum, v) => sum + (parseFloat(v.comision_chofer) || 0), 0);
    const netProfit = totalRevenue - totalExpenses - totalComisiones;

    csvContent += "CONSOLIDADO OPERATIVO\n";
    csvContent += `Viajes del Dia;${dailySummaryTrips.length}\n`;
    csvContent += `Ingresos Fletes;${totalRevenue}\n`;
    csvContent += `Gastos del Dia;${totalExpenses}\n`;
    csvContent += `Comisiones Chofer;${totalComisiones}\n`;
    csvContent += `Utilidad Neta;${netProfit}\n\n`;

    csvContent += "DETALLE DE VIAJES\n";
    csvContent += "ID Viaje;Chofer;Unidad;Origen;Destino;Monto Flete;Comision Chofer;Estatus Viaje\n";
    dailySummaryTrips.forEach(v => {
        const choferName = globalDriverMap[v.id_chofer] || v.id_chofer || 'No asignado';
        csvContent += `"${v.id_viaje}";"${choferName}";"${v.id_unidad}";"${v.origen}";"${v.destino}";${v.monto_flete};${v.comision_chofer};"${v.estatus_viaje}"\n`;
    });
    csvContent += "\n";

    csvContent += "DETALLE DE GASTOS\n";
    csvContent += "ID Gasto;Concepto;Unidad;Monto;Viaje Referencia;Forma Pago;Estatus Pago\n";
    dailySummaryExpenses.forEach(g => {
        csvContent += `"${g.id_gasto}";"${g.concepto}";"${g.id_unidad}";${g.monto};"${g.id_viaje || ''}";"${g.forma_pago || ''}";"${g.estatus_pago || ''}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `resumen_diario_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

window.initDailySummaryDashboard = initDailySummaryDashboard;
window.updateDailySummary = updateDailySummary;
window.printDailySummary = printDailySummary;
window.shareDailySummaryOnWhatsApp = shareDailySummaryOnWhatsApp;
window.exportDailySummaryToCSV = exportDailySummaryToCSV;

// --- RANGE SUMMARY HELPER FUNCTIONS ---
function getCurrentWeekRange() {
    const today = new Date();
    const day = today.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    return {
        start: getLocalISODate(monday),
        end: getLocalISODate(sunday)
    };
}

let rangeSummaryInitialized = false;
let rangeSummaryTrips = [];
let rangeSummaryExpenses = [];

async function initRangeSummary() {
    const startInput = document.getElementById('db-range-summary-date-start');
    const endInput = document.getElementById('db-range-summary-date-end');
    if (!startInput || !endInput) return;

    if (!startInput.value || !endInput.value) {
        const range = getCurrentWeekRange();
        startInput.value = range.start;
        endInput.value = range.end;
    }

    if (!rangeSummaryInitialized) {
        rangeSummaryInitialized = true;
    }

    updateRangeSummary();
}

async function updateRangeSummary() {
    const startInput = document.getElementById('db-range-summary-date-start');
    const endInput = document.getElementById('db-range-summary-date-end');
    if (!startInput || !endInput) return;

    const startStr = startInput.value;
    const endStr = endInput.value;
    if (!startStr || !endStr) return;

    // Set printable titles
    const printTitle = document.getElementById('print-range-summary-date-title');
    if (printTitle) printTitle.innerText = `Periodo: ${startStr} a ${endStr}`;
    const printTime = document.getElementById('print-range-generation-time');
    if (printTime) printTime.innerText = new Date().toLocaleString('es-MX');

    const statusEl = document.getElementById('conn-status');
    if (statusEl) {
        statusEl.innerText = 'Cargando Resumen...';
        statusEl.className = 'text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest animate-pulse';
    }

    try {
        const [tripsRaw, expensesRaw] = await Promise.all([
            window.supabaseClient.from(DB_CONFIG.tableViajes).select('*').gte('fecha', startStr).lte('fecha', endStr),
            window.supabaseClient.from(DB_CONFIG.tableGastos).select('*').gte('fecha', startStr).lte('fecha', endStr)
        ]);

        if (tripsRaw.error) throw tripsRaw.error;
        if (expensesRaw.error) throw expensesRaw.error;

        const viajes = tripsRaw.data || [];
        const gastos = (expensesRaw.data || []).filter(g => {
            const c = (g.concepto || '').toLowerCase();
            return c !== 'comisión chofer' && c !== 'comision chofer';
        });

        rangeSummaryTrips = viajes;
        rangeSummaryExpenses = gastos;

        // Aggregate KPIs
        const totalRevenue = viajes.reduce((sum, v) => sum + (parseFloat(v.monto_flete) || 0), 0);
        const totalExpenses = gastos.reduce((sum, g) => sum + (parseFloat(g.monto) || 0), 0);
        const totalComisiones = viajes.reduce((sum, v) => sum + (parseFloat(v.comision_chofer) || 0), 0);
        const netProfit = totalRevenue - totalExpenses - totalComisiones;

        const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

        safeSetText('db-range-summary-total-revenue', fmt(totalRevenue));
        safeSetText('db-range-summary-total-expenses', fmt(totalExpenses));
        safeSetText('db-range-summary-total-comisiones', fmt(totalComisiones));
        
        const profitEl = document.getElementById('db-range-summary-net-profit');
        if (profitEl) {
            profitEl.innerText = fmt(netProfit);
            if (netProfit >= 0) {
                profitEl.className = 'text-2xl font-black text-emerald-400';
            } else {
                profitEl.className = 'text-2xl font-black text-rose-400';
            }
        }

        // Diesel Breakdown
        let dieselLiters = 0;
        let dieselCost = 0;
        let dieselKm = 0;

        gastos.forEach(g => {
            if (g.concepto === 'Diesel') {
                const tractoSupport = (parseFloat(g.litros_tracto) > 0 || parseFloat(g.litros_termo) > 0);
                const effectiveVol = tractoSupport ? (parseFloat(g.litros_tracto) || 0) : (parseFloat(g.litros_rellenados) || 0);
                dieselLiters += effectiveVol;
                dieselCost += parseFloat(g.monto) || 0;
                dieselKm += parseFloat(g.kmts_recorridos) || 0;
            }
        });

        const avgYield = (dieselLiters > 0 && dieselKm > 0) ? (dieselKm / dieselLiters) : 0;

        safeSetText('db-range-summary-diesel-liters', `${dieselLiters.toFixed(1)} L`);
        safeSetText('db-range-summary-diesel-cost', fmt(dieselCost));
        safeSetText('db-range-summary-diesel-yield', avgYield > 0 ? `${avgYield.toFixed(2)} km/L` : '-- km/L');

        // Render Tables
        await ensureGlobalMapsLoaded();

        const tripsTbody = document.getElementById('db-range-summary-trips-table-body');
        if (tripsTbody) {
            if (viajes.length === 0) {
                tripsTbody.innerHTML = '<tr><td colspan="4" class="px-4 py-6 text-center text-slate-500 italic">No hay viajes registrados en este periodo</td></tr>';
            } else {
                tripsTbody.innerHTML = viajes.map(v => {
                    const choferName = globalDriverMap[v.id_chofer] || v.id_chofer || 'No asignado';
                    return `
                        <tr class="hover:bg-slate-800/20 transition-colors">
                            <td class="px-4 py-3">
                                <div class="font-mono font-bold text-white">${v.id_viaje}</div>
                                <div class="text-[10px] text-slate-400">${choferName}</div>
                            </td>
                            <td class="px-4 py-3">
                                <div class="font-semibold text-slate-200">ECO: ${v.id_unidad}</div>
                                <div class="text-[10px] text-slate-400 truncate max-w-[180px]">${v.origen} ➔ ${v.destino}</div>
                            </td>
                            <td class="px-4 py-3 text-right font-bold text-blue-400">${fmt(parseFloat(v.monto_flete) || 0)}</td>
                            <td class="px-4 py-3 text-center no-print">
                                <button onclick="showDetailModal('viajes', '${v.id_viaje}')" class="text-slate-400 hover:text-blue-400 p-1 cursor-pointer transition-all" title="Ver Detalle">
                                    <i class="fas fa-eye text-[11px]"></i>
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');
            }
        }

        const expensesTbody = document.getElementById('db-range-summary-expenses-table-body');
        if (expensesTbody) {
            if (gastos.length === 0) {
                expensesTbody.innerHTML = '<tr><td colspan="4" class="px-4 py-6 text-center text-slate-500 italic">No hay gastos registrados en este periodo</td></tr>';
            } else {
                expensesTbody.innerHTML = gastos.map(g => {
                    return `
                        <tr class="hover:bg-slate-800/20 transition-colors">
                            <td class="px-4 py-3">
                                <div class="font-semibold text-white">${g.concepto}</div>
                                <div class="font-mono text-[9px] text-slate-400">${g.id_gasto}</div>
                            </td>
                            <td class="px-4 py-3">
                                <div class="font-semibold text-slate-200">ECO: ${g.id_unidad}</div>
                                <div class="text-[10px] text-slate-400 truncate max-w-[180px]">${g.id_viaje ? `Viaje: ${g.id_viaje}` : 'Gasto General'}</div>
                            </td>
                            <td class="px-4 py-3 text-right font-bold text-red-400">${fmt(parseFloat(g.monto) || 0)}</td>
                            <td class="px-4 py-3 text-center no-print">
                                <button onclick="showDetailModal('gastos', '${g.id_gasto}')" class="text-slate-400 hover:text-red-400 p-1 cursor-pointer transition-all" title="Ver Detalle">
                                    <i class="fas fa-eye text-[11px]"></i>
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');
            }
        }

        // Populate spreadsheet print view table body
        const spreadsheetTbody = document.getElementById('range-spreadsheet-tbody');
        if (spreadsheetTbody) {
            let rowNum = 1;
            let ssHtml = '';

            // Row 1: Header title and Period
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="font-bold text-left" colspan="2">RESUMEN DIARIO PROCESA-T</td>
                <td class="text-left" colspan="2">Periodo: ${startStr} a ${endStr}</td>
                <td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 2: Empty
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 3: CONSOLIDADO OPERATIVO Title
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="font-bold text-left" colspan="9">CONSOLIDADO OPERATIVO</td>
            </tr>`;

            // Row 4: Viajes del Periodo
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="text-left">Viajes del Periodo</td>
                <td class="text-right">${viajes.length}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 5: Ingresos Fletes
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="text-left">Ingresos Fletes</td>
                <td class="text-right">${Math.round(totalRevenue)}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 6: Gastos del Periodo
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="text-left">Gastos del Periodo</td>
                <td class="text-right">${Math.round(totalExpenses)}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 7: Comisiones Chofer
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="text-left">Comisiones Chofer</td>
                <td class="text-right">${Math.round(totalComisiones)}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 8: Utilidad Neta
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="text-left">Utilidad Neta</td>
                <td class="text-right">${Math.round(netProfit)}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 9: Empty
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 10: DETALLE DE VIAJES Title
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="font-bold text-left" colspan="9">DETALLE DE VIAJES</td>
            </tr>`;

            // Row 11: DETALLE DE VIAJES Header
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="font-bold text-center">ID Viaje</td>
                <td class="font-bold text-center">Chofer</td>
                <td class="font-bold text-center">Unidad</td>
                <td class="font-bold text-center">Origen</td>
                <td class="font-bold text-center">Destino</td>
                <td class="font-bold text-center">Monto Flete</td>
                <td class="font-bold text-center">Comision Chofer</td>
                <td class="font-bold text-center">Estatus Viaje</td>
                <td></td>
            </tr>`;

            // Rows 12+: DETALLE DE VIAJES Data
            if (viajes.length === 0) {
                ssHtml += `<tr>
                    <td class="ss-row-num">${rowNum++}</td>
                    <td colspan="9" class="text-center italic">No hay viajes registrados</td>
                </tr>`;
            } else {
                viajes.forEach(v => {
                    const choferName = globalDriverMap[v.id_chofer] || v.id_chofer || 'No asignado';
                    ssHtml += `<tr>
                        <td class="ss-row-num">${rowNum++}</td>
                        <td class="text-left font-mono">${v.id_viaje}</td>
                        <td class="text-left">${choferName}</td>
                        <td class="text-center font-mono">${v.id_unidad}</td>
                        <td class="text-left">${v.origen || ''}</td>
                        <td class="text-left">${v.destino || ''}</td>
                        <td class="text-right">${v.monto_flete ? Math.round(v.monto_flete) : 0}</td>
                        <td class="text-right">${v.comision_chofer ? Math.round(v.comision_chofer) : 0}</td>
                        <td class="text-center">${v.estatus_viaje || ''}</td>
                        <td></td>
                    </tr>`;
                });
            }

            // Row for spacing
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row: DETALLE DE GASTOS Title
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="font-bold text-left" colspan="9">DETALLE DE GASTOS</td>
            </tr>`;

            // Row: DETALLE DE GASTOS Header
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="font-bold text-center">ID Gasto</td>
                <td class="font-bold text-center">Concepto</td>
                <td class="font-bold text-center">Unidad</td>
                <td class="font-bold text-center">Monto</td>
                <td class="font-bold text-center">Viaje Referencia</td>
                <td class="font-bold text-center">Forma Pago</td>
                <td class="font-bold text-center">Estatus Pago</td>
                <td></td><td></td>
            </tr>`;

            // Rows: DETALLE DE GASTOS Data
            if (gastos.length === 0) {
                ssHtml += `<tr>
                    <td class="ss-row-num">${rowNum++}</td>
                    <td colspan="9" class="text-center italic">No hay gastos registrados</td>
                </tr>`;
            } else {
                gastos.forEach(g => {
                    ssHtml += `<tr>
                        <td class="ss-row-num">${rowNum++}</td>
                        <td class="text-left font-mono">${g.id_gasto}</td>
                        <td class="text-left">${g.concepto || ''}</td>
                        <td class="text-center font-mono">${g.id_unidad || ''}</td>
                        <td class="text-right">${g.monto ? Math.round(g.monto) : 0}</td>
                        <td class="text-left font-mono">${g.id_viaje || ''}</td>
                        <td class="text-center">${g.forma_pago || ''}</td>
                        <td class="text-center">${g.estatus_pago || ''}</td>
                        <td></td><td></td>
                    </tr>`;
                });
            }

            spreadsheetTbody.innerHTML = ssHtml;
        }

        if (statusEl) {
            statusEl.innerText = 'Conectado';
            statusEl.className = 'text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest';
        }

    } catch (e) {
        console.error('Error updating range summary:', e);
        if (statusEl) {
            statusEl.innerText = 'Error: ' + e.message;
            statusEl.className = 'text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest';
        }
    }
}

async function printRangeSummary() {
    const element = document.getElementById('range-summary-print-area');
    if (!element) return;

    const startInput = document.getElementById('db-range-summary-date-start');
    const endInput = document.getElementById('db-range-summary-date-end');
    const startStr = startInput ? startInput.value : '';
    const endStr = endInput ? endInput.value : '';

    if (typeof html2pdf !== 'undefined') {
        document.body.classList.add('generating-pdf');
        document.body.offsetHeight;
        await new Promise(resolve => setTimeout(resolve, 250));

        const opt = {
            margin:       0.3,
            filename:     `Resumen_Periodo_${startStr}_a_${endStr}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, logging: false, backgroundColor: null },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
            pagebreak:    { mode: ['css', 'legacy'] }
        };

        try {
            await html2pdf().set(opt).from(element).save();
        } catch (error) {
            console.error('Error generating PDF:', error);
            window.print();
        } finally {
            document.body.classList.remove('generating-pdf');
        }
    } else {
        window.print();
    }
}

function shareRangeSummaryOnWhatsApp() {
    const startInput = document.getElementById('db-range-summary-date-start');
    const endInput = document.getElementById('db-range-summary-date-end');
    if (!startInput || !endInput || !startInput.value || !endInput.value) return;

    const startStr = startInput.value;
    const endStr = endInput.value;
    const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

    const totalRevenue = rangeSummaryTrips.reduce((sum, v) => sum + (parseFloat(v.monto_flete) || 0), 0);
    const totalExpenses = rangeSummaryExpenses.reduce((sum, g) => sum + (parseFloat(g.monto) || 0), 0);
    const totalComisiones = rangeSummaryTrips.reduce((sum, v) => sum + (parseFloat(v.comision_chofer) || 0), 0);
    const netProfit = totalRevenue - totalExpenses - totalComisiones;

    let dieselLiters = 0;
    let dieselCost = 0;
    rangeSummaryExpenses.forEach(g => {
        if (g.concepto === 'Diesel') {
            const tractoSupport = (parseFloat(g.litros_tracto) > 0 || parseFloat(g.litros_termo) > 0);
            const effectiveVol = tractoSupport ? (parseFloat(g.litros_tracto) || 0) : (parseFloat(g.litros_rellenados) || 0);
            dieselLiters += effectiveVol;
            dieselCost += parseFloat(g.monto) || 0;
        }
    });

    let text = `*📋 RESUMEN DE OPERACIÓN POR FECHA (PROCESA-T)*\n`;
    text += `*📅 Periodo:* ${startStr} a ${endStr}\n`;
    text += `------------------------------------\n\n`;
    
    text += `🚚 *Viajes del Periodo:* ${rangeSummaryTrips.length}\n`;
    text += `💰 *Ingresos (Fletes):* ${fmt(totalRevenue)}\n`;
    text += `💸 *Gastos del Periodo:* ${fmt(totalExpenses)}\n`;
    text += `👤 *Comisiones Chofer:* ${fmt(totalComisiones)}\n`;
    text += `📈 *Utilidad Neta:* ${fmt(netProfit)}\n\n`;

    if (dieselLiters > 0) {
        text += `⛽ *Consumo Diésel:*\n`;
        text += `• Litros Totales: ${dieselLiters.toFixed(1)} L\n`;
        text += `• Costo Diésel: ${fmt(dieselCost)}\n\n`;
    }

    if (rangeSummaryTrips.length > 0) {
        text += `⚓ *Detalle de Viajes:*\n`;
        rangeSummaryTrips.slice(0, 15).forEach((v, idx) => {
            const choferName = globalDriverMap[v.id_chofer] || v.id_chofer || 'Sin chofer';
            text += `${idx + 1}. *${v.id_viaje}* (ECO ${v.id_unidad}) - ${choferName}\n   Ruta: ${v.origen} ➔ ${v.destino}\n   Flete: ${fmt(parseFloat(v.monto_flete) || 0)}\n`;
        });
        if (rangeSummaryTrips.length > 15) {
            text += `... y ${rangeSummaryTrips.length - 15} viajes más.\n`;
        }
        text += `\n`;
    }

    if (rangeSummaryExpenses.length > 0) {
        text += `💵 *Detalle de Gastos:*\n`;
        rangeSummaryExpenses.slice(0, 15).forEach((g, idx) => {
            text += `${idx + 1}. *${g.concepto}* (ECO ${g.id_unidad}) - ${fmt(parseFloat(g.monto) || 0)}\n`;
        });
        if (rangeSummaryExpenses.length > 15) {
            text += `... y ${rangeSummaryExpenses.length - 15} gastos más.\n`;
        }
        text += `\n`;
    }

    text += `_Generado automáticamente desde Procesa-T Admin Panel_`;

    navigator.clipboard.writeText(text).then(() => {
        const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
        window.open(waUrl, '_blank');
    }).catch(err => {
        console.error('Error copying text to clipboard:', err);
        const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
        window.open(waUrl, '_blank');
    });
}

function exportRangeSummaryToCSV() {
    const startInput = document.getElementById('db-range-summary-date-start');
    const endInput = document.getElementById('db-range-summary-date-end');
    if (!startInput || !endInput || !startInput.value || !endInput.value) return;

    const startStr = startInput.value;
    const endStr = endInput.value;

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += `RESUMEN DE OPERACION PROCESA-T;Periodo: ${startStr} a ${endStr}\n\n`;

    const totalRevenue = rangeSummaryTrips.reduce((sum, v) => sum + (parseFloat(v.monto_flete) || 0), 0);
    const totalExpenses = rangeSummaryExpenses.reduce((sum, g) => sum + (parseFloat(g.monto) || 0), 0);
    const totalComisiones = rangeSummaryTrips.reduce((sum, v) => sum + (parseFloat(v.comision_chofer) || 0), 0);
    const netProfit = totalRevenue - totalExpenses - totalComisiones;

    csvContent += "CONSOLIDADO OPERATIVO\n";
    csvContent += `Viajes;${rangeSummaryTrips.length}\n`;
    csvContent += `Ingresos Fletes;${totalRevenue}\n`;
    csvContent += `Gastos del Periodo;${totalExpenses}\n`;
    csvContent += `Comisiones Chofer;${totalComisiones}\n`;
    csvContent += `Utilidad Neta;${netProfit}\n\n`;

    csvContent += "DETALLE DE VIAJES\n";
    csvContent += "ID Viaje;Chofer;Unidad;Origen;Destino;Monto Flete;Comision Chofer;Estatus Viaje\n";
    rangeSummaryTrips.forEach(v => {
        const choferName = globalDriverMap[v.id_chofer] || v.id_chofer || 'No asignado';
        csvContent += `"${v.id_viaje}";"${choferName}";"${v.id_unidad}";"${v.origen}";"${v.destino}";${v.monto_flete};${v.comision_chofer};"${v.estatus_viaje}"\n`;
    });
    csvContent += "\n";

    csvContent += "DETALLE DE GASTOS\n";
    csvContent += "ID Gasto;Concepto;Unidad;Monto;Viaje Referencia;Forma Pago;Estatus Pago\n";
    rangeSummaryExpenses.forEach(g => {
        csvContent += `"${g.id_gasto}";"${g.concepto}";"${g.id_unidad}";${g.monto};"${g.id_viaje || ''}";"${g.forma_pago || ''}";"${g.estatus_pago || ''}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `resumen_periodo_${startStr}_a_${endStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

window.initRangeSummary = initRangeSummary;
window.updateRangeSummary = updateRangeSummary;
window.printRangeSummary = printRangeSummary;
window.shareRangeSummaryOnWhatsApp = shareRangeSummaryOnWhatsApp;
window.exportRangeSummaryToCSV = exportRangeSummaryToCSV;

async function initUnitDashboard() {
    const startInput = document.getElementById('db-unit-start');
    const endInput = document.getElementById('db-unit-end');
    const unitSelect = document.getElementById('db-unit-select');
    
    if (!startInput || !endInput || !unitSelect) return;
    
    if (!startInput.value || !endInput.value) {
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        
        startInput.value = getLocalISODate(thirtyDaysAgo);
        endInput.value = getLocalISODate(today);
    }
    
    if (!unitDashboardInitialized) {
        unitDashboardInitialized = true;
        
        // Populate units select
        try {
            const units = await fetchSupabaseData(DB_CONFIG.tableUnidades);
            const activeUnits = units.filter(u => (u.estatus || 'Activo') === 'Activo');
            
            unitSelect.innerHTML = '<option value="">-- Selecciona Unidad --</option>' + 
                activeUnits.map(u => `<option value="${u.id_unidad}">${u.id_unidad} (${u.nombre_unidad || 'Sin nombre'})</option>`).join('');
        } catch (e) {
            console.error('Error populating dashboard unit select:', e);
        }
        
        // Bind event listeners
        unitSelect.addEventListener('change', () => updateUnitDashboard());
        startInput.addEventListener('change', () => updateUnitDashboard());
        endInput.addEventListener('change', () => updateUnitDashboard());
    }
    
    updateUnitDashboard();
}

async function updateUnitDashboard() {
    const unitSelect = document.getElementById('db-unit-select');
    const startInput = document.getElementById('db-unit-start');
    const endInput = document.getElementById('db-unit-end');
    const placeholder = document.getElementById('db-unit-placeholder');
    const content = document.getElementById('db-unit-content');
    
    if (!unitSelect || !startInput || !endInput) return;
    
    const unitId = unitSelect.value;
    const start = startInput.value;
    const end = endInput.value;
    
    if (!unitId) {
        if (placeholder) placeholder.classList.remove('hidden');
        if (content) content.classList.add('hidden');
        return;
    }
    
    if (placeholder) placeholder.classList.add('hidden');
    if (content) content.classList.remove('hidden');
    
    const statusEl = document.getElementById('conn-status');
    if (statusEl) {
        statusEl.innerText = 'Consultando Unidad...';
        statusEl.className = 'text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest animate-pulse';
    }
    
    try {
        const [tripsRaw, expensesRaw, unitRaw] = await Promise.all([
            window.supabaseClient.from(DB_CONFIG.tableViajes).select('*').eq('id_unidad', unitId),
            window.supabaseClient.from(DB_CONFIG.tableGastos).select('*').eq('id_unidad', unitId),
            window.supabaseClient.from(DB_CONFIG.tableUnidades).select('*').eq('id_unidad', unitId).maybeSingle()
        ]);
        
        if (tripsRaw.error) throw tripsRaw.error;
        if (expensesRaw.error) throw expensesRaw.error;
        if (unitRaw.error) throw unitRaw.error;
        
        const tripsData = tripsRaw.data || [];
        const expensesData = expensesRaw.data || [];
        const unitObj = unitRaw.data || {};
        
        const parseDate = parseDateToISO;
        
        const filterByDate = (rows, s, e) => rows.filter(r => {
            const rowDate = parseDate(r.fecha);
            return rowDate && rowDate >= s && rowDate <= e;
        });
        
        const viajes = filterByDate(tripsData, start, end);
        const gastos = filterByDate(expensesData, start, end).filter(g => {
            const c = (g.concepto || '').toLowerCase();
            return c !== 'comisión chofer' && c !== 'comision chofer';
        });
        
        currentUnitTrips = viajes;
        currentUnitExpenses = gastos;
        
        const totalTrips = viajes.length;
        const totalRevenue = viajes.reduce((acc, v) => acc + (parseFloat(v.monto_flete) || 0), 0);
        const totalExpenses = gastos.reduce((acc, g) => acc + (parseFloat(g.monto) || 0), 0);
        const totalComisiones = viajes.reduce((acc, v) => acc + (parseFloat(v.comision_chofer) || 0), 0);
        const netProfit = totalRevenue - totalExpenses - totalComisiones;
        
        let dieselLiters = 0;
        let dieselCost = 0;
        let totalKm = 0;
        
        const isMonitoringFuel = unitObj.registra_combustible !== false;

        gastos.forEach(g => {
            if (g.concepto === 'Diesel') {
                const tractoSupport = (parseFloat(g.litros_tracto) > 0 || parseFloat(g.litros_termo) > 0);
                const effectiveVol = tractoSupport ? (parseFloat(g.litros_tracto) || 0) : (parseFloat(g.litros_rellenados) || 0);
                dieselLiters += effectiveVol;
                dieselCost += parseFloat(g.monto) || 0;
                totalKm += parseFloat(g.kmts_recorridos) || 0;
            }
        });
        
        const sortedAllExpensesForYield = [...expensesData]
            .filter(g => g.concepto === 'Diesel')
            .sort((a, b) => {
                const dateA = parseDate(a.fecha) || '';
                const dateB = parseDate(b.fecha) || '';
                const dateComp = dateB.localeCompare(dateA);
                if (dateComp !== 0) return dateComp;
                const timeA = a.created_at || a.id_gasto || '';
                const timeB = b.created_at || b.id_gasto || '';
                return timeB.localeCompare(timeA);
            });
            
        let latestYieldVal = '--';
        if (!isMonitoringFuel) {
            latestYieldVal = 'No Registra';
        } else {
            for (const e of sortedAllExpensesForYield) {
                const tractoSupport = (parseFloat(e.litros_tracto) > 0 || parseFloat(e.litros_termo) > 0);
                const effectiveVol = tractoSupport ? (parseFloat(e.litros_tracto) || 0) : (parseFloat(e.litros_rellenados) || 0);
                const km = parseFloat(e.kmts_recorridos) || 0;
                if (effectiveVol > 0 && km > 0) {
                    const yld = km / effectiveVol;
                    if (yld > 0.5 && yld < 15) {
                        latestYieldVal = `${yld.toFixed(2)} km/L`;
                        break;
                    }
                }
            }
        }
        
        const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
        
        safeSetText('db-unit-total-trips', totalTrips);
        safeSetText('db-unit-total-revenue', fmt(totalRevenue));
        safeSetText('db-unit-total-expenses', fmt(totalExpenses + totalComisiones));
        safeSetText('db-unit-net-profit', fmt(netProfit));
        safeSetText('db-unit-total-km', `${totalKm.toLocaleString()} km`);
        safeSetText('db-unit-total-liters', `${dieselLiters.toFixed(1)} L`);
        safeSetText('db-unit-diesel-cost', fmt(dieselCost));
        safeSetText('db-unit-latest-yield', latestYieldVal);
        
        const tripsTbody = document.getElementById('db-unit-trips-table-body');
        if (tripsTbody) {
            if (viajes.length === 0) {
                tripsTbody.innerHTML = '<tr><td colspan="4" class="px-4 py-6 text-center text-slate-500 italic">Sin viajes en este período</td></tr>';
            } else {
                tripsTbody.innerHTML = viajes.sort((a,b) => new Date(parseDate(b.fecha)) - new Date(parseDate(a.fecha))).map(v => `
                    <tr class="hover:bg-slate-800/20 transition-colors">
                        <td class="px-4 py-3">
                            <div class="font-mono text-[10px] text-slate-400">${v.fecha}</div>
                            <div class="font-semibold text-white">${v.id_viaje}</div>
                        </td>
                        <td class="px-4 py-3">
                            <div class="text-white truncate max-w-[150px]">${v.cliente}</div>
                            <div class="text-slate-400 truncate max-w-[150px]">${v.origen} ➔ ${v.destino}</div>
                        </td>
                        <td class="px-4 py-3 text-right font-bold text-blue-400">${fmt(parseFloat(v.monto_flete) || 0)}</td>
                        <td class="px-4 py-3 text-center">
                            <button onclick="showDetailModal('viajes', '${v.id_viaje}')" class="text-slate-400 hover:text-blue-400 transition-all p-1 cursor-pointer" title="Ver Detalle">
                                <i class="fas fa-eye"></i>
                            </button>
                        </td>
                    </tr>
                `).join('');
            }
        }
        
        const expensesTbody = document.getElementById('db-unit-expenses-table-body');
        if (expensesTbody) {
            if (gastos.length === 0) {
                expensesTbody.innerHTML = '<tr><td colspan="4" class="px-4 py-6 text-center text-slate-500 italic">Sin gastos en este período</td></tr>';
            } else {
                expensesTbody.innerHTML = gastos.sort((a,b) => new Date(parseDate(b.fecha)) - new Date(parseDate(a.fecha))).map(g => `
                    <tr class="hover:bg-slate-800/20 transition-colors">
                        <td class="px-4 py-3 font-mono text-[10px] text-slate-400">${g.fecha}</td>
                        <td class="px-4 py-3">
                            <div class="font-semibold text-white">${g.concepto}</div>
                            <div class="text-slate-400 text-[10px]">${g.id_viaje ? `Viaje: ${g.id_viaje}` : 'Gasto General'}</div>
                        </td>
                        <td class="px-4 py-3 text-right font-bold text-red-400">${fmt(parseFloat(g.monto) || 0)}</td>
                        <td class="px-4 py-3 text-center">
                            <button onclick="showDetailModal('gastos', '${g.id_gasto}')" class="text-slate-400 hover:text-red-400 transition-all p-1 cursor-pointer" title="Ver Detalle">
                                <i class="fas fa-eye"></i>
                            </button>
                        </td>
                    </tr>
                `).join('');
            }
        }
        
        const dieselExpensesPeriod = isMonitoringFuel ? gastos
            .filter(g => g.concepto === 'Diesel')
            .map(e => {
                const tractoSupport = (parseFloat(e.litros_tracto) > 0 || parseFloat(e.litros_termo) > 0);
                const effectiveVol = tractoSupport ? (parseFloat(e.litros_tracto) || 0) : (parseFloat(e.litros_rellenados) || 0);
                const km = parseFloat(e.kmts_recorridos) || 0;
                let yieldVal = 0;
                if (effectiveVol > 0 && km > 0) {
                    yieldVal = km / effectiveVol;
                }
                return {
                    fecha: e.fecha,
                    yieldVal: yieldVal > 0.5 && yieldVal < 15 ? parseFloat(yieldVal.toFixed(2)) : 0
                };
            })
            .filter(item => item.yieldVal > 0)
            .sort((a, b) => (parseDate(a.fecha) || '').localeCompare(parseDate(b.fecha) || '')) : [];
            
        renderChartInstance('unitYieldHistoryChart', 'line', {
            labels: dieselExpensesPeriod.map(d => d.fecha),
            datasets: [{
                label: 'Km/L',
                data: dieselExpensesPeriod.map(d => d.yieldVal),
                borderColor: '#c084fc',
                backgroundColor: 'rgba(192, 132, 252, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 5,
                pointBackgroundColor: '#c084fc'
            }]
        });
        
        const unitExpensesGrouped = {};
        gastos.forEach(g => {
            const concept = g.concepto || 'Varios';
            unitExpensesGrouped[concept] = (unitExpensesGrouped[concept] || 0) + (parseFloat(g.monto) || 0);
        });
        
        const topUnitExpenses = Object.entries(unitExpensesGrouped)
            .sort((a, b) => b[1] - a[1]);
            
        renderChartInstance('unitExpensesChart', 'doughnut', {
            labels: topUnitExpenses.map(e => e[0]),
            datasets: [{
                data: topUnitExpenses.map(e => e[1]),
                backgroundColor: [
                    'rgba(239, 68, 68, 0.7)',
                    'rgba(59, 130, 246, 0.7)',
                    'rgba(16, 185, 129, 0.7)',
                    'rgba(245, 158, 11, 0.7)',
                    'rgba(139, 92, 246, 0.7)',
                    'rgba(107, 114, 128, 0.7)',
                    'rgba(236, 72, 153, 0.7)',
                    'rgba(20, 184, 166, 0.7)'
                ],
                borderWidth: 0
            }]
        });
        
        const tripExpensesMap = {};
        expensesData.forEach(g => {
            if (g.id_viaje) {
                tripExpensesMap[g.id_viaje] = (tripExpensesMap[g.id_viaje] || 0) + (parseFloat(g.monto) || 0);
            }
        });
        
        const tripsCompareData = viajes.map(v => {
            const income = parseFloat(v.monto_flete) || 0;
            const expense = tripExpensesMap[v.id_viaje] || 0;
            return {
                id_viaje: v.id_viaje,
                fecha: v.fecha,
                income: income,
                expense: expense
            };
        }).sort((a,b) => new Date(parseDate(a.fecha)) - new Date(parseDate(b.fecha)));
        
        renderChartInstance('unitTripsIncomeChart', 'bar', {
            labels: tripsCompareData.map(t => `${t.fecha} (${t.id_viaje})`),
            datasets: [
                {
                    label: 'Ingreso Flete',
                    data: tripsCompareData.map(t => t.income),
                    backgroundColor: 'rgba(59, 130, 246, 0.7)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Gastos Asociados',
                    data: tripsCompareData.map(t => t.expense),
                    backgroundColor: 'rgba(239, 68, 68, 0.7)',
                    borderColor: 'rgba(239, 68, 68, 1)',
                    borderWidth: 1
                }
            ]
        });
        
        // Update unit title display in top bar
        const titleDisplayEl = document.getElementById('db-unit-title-display');
        if (titleDisplayEl) {
            titleDisplayEl.innerText = `ECO-${unitId}`;
        }

        // Populate unit spreadsheet print view
        const unitSpreadsheetTbody = document.getElementById('unit-spreadsheet-tbody');
        if (unitSpreadsheetTbody) {
            let rowNum = 1;
            let ssHtml = '';

            // Row 1: Header title and Period
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="font-bold text-left" colspan="2">RESUMEN DE UNIDAD: ECO-${unitId}</td>
                <td class="text-left" colspan="2">Periodo: ${start} a ${end}</td>
                <td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 2: Empty
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 3: CONSOLIDADO OPERATIVO Title
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="font-bold text-left" colspan="9">CONSOLIDADO OPERATIVO</td>
            </tr>`;

            // Row 4: Viajes Realizados
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="text-left">Viajes Realizados</td>
                <td class="text-right">${totalTrips}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 5: Ingreso Flete
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="text-left">Ingreso Flete</td>
                <td class="text-right">${Math.round(totalRevenue)}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 6: Gasto Operativo
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="text-left">Gasto Operativo (con Comisiones)</td>
                <td class="text-right">${Math.round(totalExpenses + totalComisiones)}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 7: Ganancia Neta
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="text-left">Ganancia Neta</td>
                <td class="text-right">${Math.round(netProfit)}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 8: Distancia Recorrida
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="text-left">Distancia Recorrida</td>
                <td class="text-right">${Math.round(totalKm).toLocaleString()} km</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 9: Litros Diésel
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="text-left">Litros Diésel</td>
                <td class="text-right">${dieselLiters.toFixed(1)} L</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 10: Costo Diésel
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="text-left">Costo Diésel</td>
                <td class="text-right">${Math.round(dieselCost)}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 11: Rendimiento Promedio
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="text-left">Último Rendimiento</td>
                <td class="text-right">${latestYieldVal}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 12: Empty
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row 13: DETALLE DE VIAJES Title
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="font-bold text-left" colspan="9">DETALLE DE VIAJES</td>
            </tr>`;

            // Row 14: DETALLE DE VIAJES Header
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="font-bold text-center">Fecha</td>
                <td class="font-bold text-center">ID Viaje</td>
                <td class="font-bold text-center">Cliente</td>
                <td class="font-bold text-center">Origen</td>
                <td class="font-bold text-center">Destino</td>
                <td class="font-bold text-center">Monto Flete</td>
                <td class="font-bold text-center">Comisión Chofer</td>
                <td class="font-bold text-center">Estatus Viaje</td>
                <td></td>
            </tr>`;

            // Rows: DETALLE DE VIAJES Data
            if (viajes.length === 0) {
                ssHtml += `<tr>
                    <td class="ss-row-num">${rowNum++}</td>
                    <td colspan="9" class="text-center italic">No hay viajes registrados</td>
                </tr>`;
            } else {
                viajes.sort((a,b) => new Date(parseDate(b.fecha)) - new Date(parseDate(a.fecha))).forEach(v => {
                    ssHtml += `<tr>
                        <td class="ss-row-num">${rowNum++}</td>
                        <td class="text-center font-mono">${v.fecha || ''}</td>
                        <td class="text-left font-mono">${v.id_viaje}</td>
                        <td class="text-left">${v.cliente || ''}</td>
                        <td class="text-left">${v.origen || ''}</td>
                        <td class="text-left">${v.destino || ''}</td>
                        <td class="text-right">${v.monto_flete ? Math.round(v.monto_flete) : 0}</td>
                        <td class="text-right">${v.comision_chofer ? Math.round(v.comision_chofer) : 0}</td>
                        <td class="text-center">${v.estatus_viaje || ''}</td>
                        <td></td>
                    </tr>`;
                });
            }

            // Row for spacing
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>`;

            // Row: DETALLE DE GASTOS Title
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="font-bold text-left" colspan="9">DETALLE DE GASTOS</td>
            </tr>`;

            // Row: DETALLE DE GASTOS Header
            ssHtml += `<tr>
                <td class="ss-row-num">${rowNum++}</td>
                <td class="font-bold text-center">Fecha</td>
                <td class="font-bold text-center">ID Gasto</td>
                <td class="font-bold text-center">Concepto</td>
                <td class="font-bold text-center">Monto</td>
                <td class="font-bold text-center">Viaje Referencia</td>
                <td class="font-bold text-center">Forma Pago</td>
                <td class="font-bold text-center">Estatus Pago</td>
                <td></td><td></td>
            </tr>`;

            // Rows: DETALLE DE GASTOS Data
            if (gastos.length === 0) {
                ssHtml += `<tr>
                    <td class="ss-row-num">${rowNum++}</td>
                    <td colspan="9" class="text-center italic">No hay gastos registrados</td>
                </tr>`;
            } else {
                gastos.sort((a,b) => new Date(parseDate(b.fecha)) - new Date(parseDate(a.fecha))).forEach(g => {
                    ssHtml += `<tr>
                        <td class="ss-row-num">${rowNum++}</td>
                        <td class="text-center font-mono">${g.fecha || ''}</td>
                        <td class="text-left font-mono">${g.id_gasto}</td>
                        <td class="text-left">${g.concepto || ''}</td>
                        <td class="text-right">${g.monto ? Math.round(g.monto) : 0}</td>
                        <td class="text-left font-mono">${g.id_viaje || ''}</td>
                        <td class="text-center">${g.forma_pago || ''}</td>
                        <td class="text-center">${g.estatus_pago || ''}</td>
                        <td></td><td></td>
                    </tr>`;
                });
            }

            unitSpreadsheetTbody.innerHTML = ssHtml;
        }

        if (statusEl) {
            statusEl.innerText = 'Conectado';
            statusEl.className = 'text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest';
        }
        
    } catch (e) {
        console.error('Error updating unit dashboard:', e);
        if (statusEl) {
            statusEl.innerText = 'Error: ' + e.message;
            statusEl.className = 'text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest';
        }
    }
}

async function printUnitDashboard() {
    const element = document.getElementById('unit-summary-print-area');
    if (!element) return;

    const unitSelect = document.getElementById('db-unit-select');
    const startInput = document.getElementById('db-unit-start');
    const endInput = document.getElementById('db-unit-end');
    
    const unitId = unitSelect ? unitSelect.value : '';
    const startStr = startInput ? startInput.value : '';
    const endStr = endInput ? endInput.value : '';

    if (typeof html2pdf !== 'undefined') {
        document.body.classList.add('generating-pdf');
        document.body.offsetHeight;
        await new Promise(resolve => setTimeout(resolve, 250));

        const opt = {
            margin:       0.3,
            filename:     `Resumen_Unidad_ECO_${unitId}_Periodo_${startStr}_a_${endStr}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, logging: false, backgroundColor: null },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
            pagebreak:    { mode: ['css', 'legacy'] }
        };

        try {
            await html2pdf().set(opt).from(element).save();
        } catch (error) {
            console.error('Error generating PDF:', error);
            window.print();
        } finally {
            document.body.classList.remove('generating-pdf');
        }
    } else {
        window.print();
    }
}

window.updateUnitDashboard = updateUnitDashboard;
window.initUnitDashboard = initUnitDashboard;
window.printUnitDashboard = printUnitDashboard;

function showFullUnitTripsModal() {
    const unitSelect = document.getElementById('db-unit-select');
    if (!unitSelect || !unitSelect.value) {
        alert('Por favor selecciona una unidad primero.');
        return;
    }
    const unitEco = unitSelect.value;
    const modal = document.getElementById('detail-modal');
    const content = document.getElementById('modal-content');
    const title = document.getElementById('modal-title');
    
    if (!modal || !content || !title) return;
    
    title.innerHTML = `<i class="fas fa-route text-blue-500 mr-2"></i> Listado Completo de Viajes - Unidad ${unitEco}`;
    
    const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
    
    const parseDate = parseDateToISO;
    
    // Sort descending by date
    const sortedTrips = [...currentUnitTrips].sort((a,b) => {
        const dateA = parseDate(a.fecha) || '';
        const dateB = parseDate(b.fecha) || '';
        return dateB.localeCompare(dateA);
    });
    
    const totalFletes = sortedTrips.reduce((acc, t) => acc + (parseFloat(t.monto_flete) || 0), 0);
    const totalComisiones = sortedTrips.reduce((acc, t) => acc + (parseFloat(t.comision_chofer) || 0), 0);
    const avgFlete = sortedTrips.length > 0 ? totalFletes / sortedTrips.length : 0;
    
    let html = `
        <!-- KPI Summary row inside modal -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-slate-800/40 p-4 rounded-xl border border-white/5">
                <span class="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Viajes Registrados</span>
                <div class="text-2xl font-extrabold text-white">${sortedTrips.length}</div>
            </div>
            <div class="bg-slate-800/40 p-4 rounded-xl border border-white/5">
                <span class="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Flete Acumulado</span>
                <div class="text-2xl font-extrabold text-green-400">${fmt(totalFletes)}</div>
            </div>
            <div class="bg-slate-800/40 p-4 rounded-xl border border-white/5">
                <span class="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Comisiones Chofer</span>
                <div class="text-2xl font-extrabold text-amber-400">${fmt(totalComisiones)}</div>
            </div>
            <div class="bg-slate-800/40 p-4 rounded-xl border border-white/5">
                <span class="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Flete Promedio</span>
                <div class="text-2xl font-extrabold text-blue-400">${fmt(avgFlete)}</div>
            </div>
        </div>
        
        <!-- Large Table -->
        <div class="overflow-x-auto rounded-xl border border-white/5 bg-slate-950/40">
            <table class="w-full text-left text-xs border-collapse">
                <thead>
                    <tr class="bg-white/[0.02] text-slate-400 font-bold uppercase tracking-wider border-b border-white/5 text-[10px]">
                        <th class="px-6 py-4">ID Viaje</th>
                        <th class="px-6 py-4">Fecha</th>
                        <th class="px-6 py-4">Chofer</th>
                        <th class="px-6 py-4">Cliente</th>
                        <th class="px-6 py-4">Ruta (Origen ➔ Destino)</th>
                        <th class="px-6 py-4 text-right">Comisión Chofer</th>
                        <th class="px-6 py-4 text-right">Monto Flete</th>
                        <th class="px-6 py-4 text-center">Estatus Pago</th>
                        <th class="px-6 py-4 text-center">Estatus Viaje</th>
                        <th class="px-6 py-4 text-center">Acciones</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-white/5 text-slate-300">
    `;
    
    if (sortedTrips.length === 0) {
        html += `
            <tr>
                <td colspan="10" class="px-6 py-12 text-center text-slate-500 italic">No hay viajes registrados en el rango de fechas seleccionado.</td>
            </tr>
        `;
    } else {
        sortedTrips.forEach(t => {
            const choferName = globalDriverMap[t.id_chofer] || t.id_chofer || 'No asignado';
            const payStatus = t.estatus_pago || 'Pendiente';
            const payBadgeClass = payStatus === 'Pagado' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20';
            const tripStatus = t.estatus_viaje || 'Pendiente';
            const tripBadgeClass = tripStatus === 'Liquidado' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20';
            
            html += `
                <tr class="hover:bg-white/[0.02] transition-colors">
                    <td class="px-6 py-4 font-mono font-bold text-white">${t.id_viaje}</td>
                    <td class="px-6 py-4 font-mono text-slate-400 text-[10px]">${t.fecha}</td>
                    <td class="px-6 py-4">
                        <div class="font-medium text-white">${choferName}</div>
                        <div class="text-[9px] text-slate-500 font-mono">${t.id_chofer || ''}</div>
                    </td>
                    <td class="px-6 py-4 text-slate-200">${t.cliente || ''}</td>
                    <td class="px-6 py-4 text-slate-200">
                        <div class="flex items-center gap-1.5">
                            <span class="text-slate-300 font-semibold">${t.origen || ''}</span>
                            <span class="text-[10px] text-slate-500">➔</span>
                            <span class="text-slate-300 font-semibold">${t.destino || ''}</span>
                        </div>
                    </td>
                    <td class="px-6 py-4 text-right font-semibold text-amber-400">${fmt(parseFloat(t.comision_chofer) || 0)}</td>
                    <td class="px-6 py-4 text-right font-bold text-blue-400">${fmt(parseFloat(t.monto_flete) || 0)}</td>
                    <td class="px-6 py-4 text-center">
                        <span class="px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${payBadgeClass}">
                            ${payStatus}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-center">
                        <span class="px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${tripBadgeClass}">
                            ${tripStatus}
                        </span>
                    </td>
                    <td class="px-6 py-4 text-center">
                        <button onclick="showDetailModal('viajes', '${t.id_viaje}')" class="w-7 h-7 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 flex items-center justify-center transition-all mx-auto cursor-pointer" title="Ver Detalle">
                            <i class="fas fa-eye text-[11px]"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
    }
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    content.innerHTML = html;
    modal.classList.remove('hidden');
}

function showFullUnitExpensesModal() {
    const unitSelect = document.getElementById('db-unit-select');
    if (!unitSelect || !unitSelect.value) {
        alert('Por favor selecciona una unidad primero.');
        return;
    }
    const unitEco = unitSelect.value;
    const modal = document.getElementById('detail-modal');
    const content = document.getElementById('modal-content');
    const title = document.getElementById('modal-title');
    
    if (!modal || !content || !title) return;
    
    title.innerHTML = `<i class="fas fa-receipt text-red-500 mr-2"></i> Listado Completo de Gastos - Unidad ${unitEco}`;
    
    const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
    
    const parseDate = parseDateToISO;
    
    const sortedExpenses = [...currentUnitExpenses].sort((a,b) => {
        const dateA = parseDate(a.fecha) || '';
        const dateB = parseDate(b.fecha) || '';
        return dateB.localeCompare(dateA);
    });
    
    const totalExpenses = sortedExpenses.reduce((acc, g) => acc + (parseFloat(g.monto) || 0), 0);
    const dieselExpenses = sortedExpenses.filter(g => g.concepto === 'Diesel');
    const totalDiesel = dieselExpenses.reduce((acc, g) => acc + (parseFloat(g.monto) || 0), 0);
    
    let totalLiters = 0;
    dieselExpenses.forEach(g => {
        const tractoSupport = (parseFloat(g.litros_tracto) > 0 || parseFloat(g.litros_termo) > 0);
        const effectiveVol = tractoSupport ? (parseFloat(g.litros_tracto) || 0) : (parseFloat(g.litros_rellenados) || 0);
        totalLiters += effectiveVol;
    });
    
    let html = `
        <!-- KPI Summary row inside modal -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-slate-800/40 p-4 rounded-xl border border-white/5">
                <span class="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Gastos Registrados</span>
                <div class="text-2xl font-extrabold text-white">${sortedExpenses.length}</div>
            </div>
            <div class="bg-slate-800/40 p-4 rounded-xl border border-white/5">
                <span class="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Gasto Total Acumulado</span>
                <div class="text-2xl font-extrabold text-red-400">${fmt(totalExpenses)}</div>
            </div>
            <div class="bg-slate-800/40 p-4 rounded-xl border border-white/5">
                <span class="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Gasto Diésel</span>
                <div class="text-2xl font-extrabold text-rose-400">${fmt(totalDiesel)}</div>
            </div>
            <div class="bg-slate-800/40 p-4 rounded-xl border border-white/5">
                <span class="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Litros Totales Cargados</span>
                <div class="text-2xl font-extrabold text-purple-400">${totalLiters.toFixed(1)} L</div>
            </div>
        </div>
        
        <!-- Large Table -->
        <div class="overflow-x-auto rounded-xl border border-white/5 bg-slate-950/40">
            <table class="w-full text-left text-xs border-collapse">
                <thead>
                    <tr class="bg-white/[0.02] text-slate-400 font-bold uppercase tracking-wider border-b border-white/5 text-[10px]">
                        <th class="px-6 py-4">ID Gasto / Viaje</th>
                        <th class="px-6 py-4">Fecha</th>
                        <th class="px-6 py-4">Concepto</th>
                        <th class="px-6 py-4">Chofer / Acreedor</th>
                        <th class="px-6 py-4">Tipo / Forma Pago</th>
                        <th class="px-6 py-4 text-center">Deducible</th>
                        <th class="px-6 py-4 text-center">Estatus Aprobación</th>
                        <th class="px-6 py-4">Detalle Diésel (Litros | Kmts | Rnd)</th>
                        <th class="px-6 py-4 text-right">Monto</th>
                        <th class="px-6 py-4 text-center">Ticket</th>
                        <th class="px-6 py-4 text-center">Acciones</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-white/5 text-slate-300">
    `;
    
    if (sortedExpenses.length === 0) {
        html += `
            <tr>
                <td colspan="11" class="px-6 py-12 text-center text-slate-500 italic">No hay gastos registrados en el rango de fechas seleccionado.</td>
            </tr>
        `;
    } else {
        sortedExpenses.forEach(g => {
            const choferName = globalDriverMap[g.id_chofer] || g.id_chofer || g.acreedor_nombre || 'No asignado';
            const appStatus = g.estatus_aprobacion || 'Pendiente';
            let appBadgeClass = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
            if (appStatus === 'Aprobado') {
                appBadgeClass = 'bg-green-500/10 text-green-400 border-green-500/20';
            } else if (appStatus === 'Rechazado') {
                appBadgeClass = 'bg-red-500/10 text-red-400 border-red-500/20';
            }
            
            const deduc = g.es_deducible || 'No';
            const deducBadgeClass = deduc === 'Sí' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20';
            
            let dieselInfoHtml = '<span class="text-slate-500">-</span>';
            if (g.concepto === 'Diesel') {
                const tractoSupport = (parseFloat(g.litros_tracto) > 0 || parseFloat(g.litros_termo) > 0);
                const effectiveVol = tractoSupport ? (parseFloat(g.litros_tracto) || 0) : (parseFloat(g.litros_rellenados) || 0);
                const km = parseFloat(g.kmts_recorridos) || 0;
                const yieldVal = (effectiveVol > 0 && km > 0) ? (km / effectiveVol) : 0;
                
                dieselInfoHtml = `
                    <div class="flex flex-col text-[10px]">
                        <span class="text-slate-200 font-semibold">${effectiveVol.toFixed(1)} L | ${km} km</span>
                        <span class="text-emerald-400 font-bold">${yieldVal > 0 ? `${yieldVal.toFixed(2)} km/L` : '--'}</span>
                    </div>
                `;
            }
            
            let ticketIconHtml = '<span class="text-slate-600">-</span>';
            if (g.ticket_foto || g.foto_tacometro) {
                const urls = [];
                if (g.ticket_foto) {
                    const ticketUrl = window.supabaseClient.storage.from('tickets-gastos').getPublicUrl(g.ticket_foto).data.publicUrl;
                    urls.push(`<a href="${ticketUrl}" target="_blank" class="w-7 h-7 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 flex items-center justify-center transition-all" title="Ver Ticket"><i class="fas fa-receipt text-[11px]"></i></a>`);
                }
                if (g.foto_tacometro) {
                    const tacoUrl = window.supabaseClient.storage.from('tickets-gastos').getPublicUrl(g.foto_tacometro).data.publicUrl;
                    urls.push(`<a href="${tacoUrl}" target="_blank" class="w-7 h-7 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 flex items-center justify-center transition-all" title="Ver Tacómetro"><i class="fas fa-tachometer-alt text-[11px]"></i></a>`);
                }
                ticketIconHtml = `<div class="flex items-center gap-1.5 justify-center">${urls.join('')}</div>`;
            }
            
            html += `
                <tr class="hover:bg-white/[0.02] transition-colors">
                    <td class="px-6 py-4">
                        <div class="font-mono font-bold text-white">${g.id_gasto}</div>
                        <div class="text-[9px] text-slate-500 font-mono">${g.id_viaje ? `Viaje: ${g.id_viaje}` : 'Gasto General'}</div>
                    </td>
                    <td class="px-6 py-4 font-mono text-slate-400 text-[10px]">${g.fecha}</td>
                    <td class="px-6 py-4">
                        <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-medium border border-white/5">${g.concepto || ''}</span>
                    </td>
                    <td class="px-6 py-4 text-slate-200">
                        <div class="font-medium text-white">${choferName}</div>
                        <div class="text-[9px] text-slate-500 font-mono">${g.id_chofer || ''}</div>
                    </td>
                    <td class="px-6 py-4 text-slate-300">
                        <div class="font-semibold text-slate-200">${g.tipo_pago || 'Efectivo'}</div>
                        <div class="text-[9px] text-slate-400">${g.forma_pago || 'Contado'}</div>
                    </td>
                    <td class="px-6 py-4 text-center">
                        <span class="px-2 py-0.5 rounded border text-[9px] font-bold ${deducBadgeClass}">${deduc}</span>
                    </td>
                    <td class="px-6 py-4 text-center">
                        <span class="px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${appBadgeClass}">
                            ${appStatus}
                        </span>
                    </td>
                    <td class="px-6 py-4">${dieselInfoHtml}</td>
                    <td class="px-6 py-4 text-right font-bold text-red-400">${fmt(parseFloat(g.monto) || 0)}</td>
                    <td class="px-6 py-4 text-center">${ticketIconHtml}</td>
                    <td class="px-6 py-4 text-center">
                        <button onclick="showDetailModal('gastos', '${g.id_gasto}')" class="w-7 h-7 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 flex items-center justify-center transition-all mx-auto cursor-pointer" title="Ver Detalle">
                            <i class="fas fa-eye text-[11px]"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
    }
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    content.innerHTML = html;
    modal.classList.remove('hidden');
}

window.showFullUnitTripsModal = showFullUnitTripsModal;
window.showFullUnitExpensesModal = showFullUnitExpensesModal;
window.updateUnitDashboard = updateUnitDashboard;
window.initUnitDashboard = initUnitDashboard;

// --- DRIVER DASHBOARD ---
async function initDriverDashboard() {
    const startInput = document.getElementById('db-driver-start');
    const endInput = document.getElementById('db-driver-end');
    const driverSelect = document.getElementById('db-driver-select');
    
    if (!startInput || !endInput || !driverSelect) return;
    
    if (!startInput.value || !endInput.value) {
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        
        startInput.value = getLocalISODate(thirtyDaysAgo);
        endInput.value = getLocalISODate(today);
    }
    
    if (!driverDashboardInitialized) {
        driverDashboardInitialized = true;
        
        // Populate drivers select
        try {
            const drivers = await fetchSupabaseData(DB_CONFIG.tableChoferes);
            const activeDrivers = drivers.filter(d => (d.estatus || 'Activo') === 'Activo');
            
            driverSelect.innerHTML = '<option value="">-- Selecciona Chofer --</option>' + 
                activeDrivers.map(d => `<option value="${d.id_chofer}">${d.nombre || 'Sin nombre'} (${d.id_chofer})</option>`).join('');
        } catch (e) {
            console.error('Error populating dashboard driver select:', e);
        }
        
        // Bind event listeners
        driverSelect.addEventListener('change', () => updateDriverDashboard());
        startInput.addEventListener('change', () => updateDriverDashboard());
        endInput.addEventListener('change', () => updateDriverDashboard());
    }
    
    updateDriverDashboard();
}

async function updateDriverDashboard() {
    const driverSelect = document.getElementById('db-driver-select');
    const startInput = document.getElementById('db-driver-start');
    const endInput = document.getElementById('db-driver-end');
    const placeholder = document.getElementById('db-driver-placeholder');
    const content = document.getElementById('db-driver-content');
    
    if (!driverSelect || !startInput || !endInput) return;
    
    const driverId = driverSelect.value;
    const start = startInput.value;
    const end = endInput.value;
    
    if (!driverId) {
        if (placeholder) placeholder.classList.remove('hidden');
        if (content) content.classList.add('hidden');
        return;
    }
    
    if (placeholder) placeholder.classList.add('hidden');
    if (content) content.classList.remove('hidden');
    
    const statusEl = document.getElementById('conn-status');
    if (statusEl) {
        statusEl.innerText = 'Consultando Chofer...';
        statusEl.className = 'text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest animate-pulse';
    }
    
    try {
        const [tripsRaw, expensesRaw] = await Promise.all([
            window.supabaseClient.from(DB_CONFIG.tableViajes).select('*').eq('id_chofer', driverId),
            window.supabaseClient.from(DB_CONFIG.tableGastos).select('*').eq('id_chofer', driverId)
        ]);
        
        if (tripsRaw.error) throw tripsRaw.error;
        if (expensesRaw.error) throw expensesRaw.error;
        
        const tripsData = tripsRaw.data || [];
        const expensesData = expensesRaw.data || [];
        
        const parseDate = parseDateToISO;
        
        const filterByDate = (rows, s, e) => rows.filter(r => {
            const rowDate = parseDate(r.fecha);
            return rowDate && rowDate >= s && rowDate <= e;
        });
        
        const viajes = filterByDate(tripsData, start, end);
        const gastos = filterByDate(expensesData, start, end).filter(g => {
            const c = (g.concepto || '').toLowerCase();
            return c !== 'comisión chofer' && c !== 'comision chofer';
        });
        
        const totalTrips = viajes.length;
        const totalRevenue = viajes.reduce((acc, v) => acc + (parseFloat(v.monto_flete) || 0), 0);
        const totalComision = viajes.reduce((acc, v) => acc + (parseFloat(v.comision_chofer) || 0), 0);
        const totalExpenses = gastos.reduce((acc, g) => acc + (parseFloat(g.monto) || 0), 0);
        
        // Calcular Último Rendimiento
        const sortedAllExpensesForYield = [...expensesData]
            .filter(g => g.concepto === 'Diesel')
            .sort((a, b) => {
                const dateA = new Date(parseDate(a.fecha) || 0);
                const dateB = new Date(parseDate(b.fecha) || 0);
                return dateB - dateA;
            });
            
        let latestYieldVal = '--';
        for (const e of sortedAllExpensesForYield) {
            const tractoSupport = (parseFloat(e.litros_tracto) > 0 || parseFloat(e.litros_termo) > 0);
            const effectiveVol = tractoSupport ? (parseFloat(e.litros_tracto) || 0) : (parseFloat(e.litros_rellenados) || 0);
            const km = parseFloat(e.kmts_recorridos) || 0;
            if (effectiveVol > 0 && km > 0) {
                const yld = km / effectiveVol;
                if (yld > 0.5 && yld < 15) {
                    latestYieldVal = `${yld.toFixed(2)} km/L`;
                    break;
                }
            }
        }
        
        const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
        
        safeSetText('db-driver-total-trips', totalTrips);
        safeSetText('db-driver-total-revenue', fmt(totalRevenue));
        safeSetText('db-driver-total-comision', fmt(totalComision));
        safeSetText('db-driver-total-expenses', fmt(totalExpenses));
        safeSetText('db-driver-latest-yield', latestYieldVal);
        
        // Trips Table
        const tripsTbody = document.getElementById('db-driver-trips-table-body');
        if (tripsTbody) {
            if (viajes.length === 0) {
                tripsTbody.innerHTML = '<tr><td colspan="3" class="px-4 py-6 text-center text-slate-500 italic">Sin viajes en este período</td></tr>';
            } else {
                tripsTbody.innerHTML = viajes.sort((a,b) => new Date(parseDate(b.fecha)) - new Date(parseDate(a.fecha))).map(v => `
                    <tr class="hover:bg-slate-800/20 transition-colors">
                        <td class="px-4 py-3">
                            <div class="font-mono text-[10px] text-slate-400">${v.fecha}</div>
                            <div class="font-semibold text-white">${v.id_viaje}</div>
                        </td>
                        <td class="px-4 py-3">
                            <div class="text-white truncate max-w-[150px]">${v.cliente}</div>
                            <div class="text-slate-400 truncate max-w-[150px]">${v.origen} ➔ ${v.destino}</div>
                        </td>
                        <td class="px-4 py-3 text-right font-bold text-blue-400">${fmt(parseFloat(v.monto_flete) || 0)}</td>
                    </tr>
                `).join('');
            }
        }
        
        // Expenses Table
        const expensesTbody = document.getElementById('db-driver-expenses-table-body');
        if (expensesTbody) {
            if (gastos.length === 0) {
                expensesTbody.innerHTML = '<tr><td colspan="3" class="px-4 py-6 text-center text-slate-500 italic">Sin gastos en este período</td></tr>';
            } else {
                expensesTbody.innerHTML = gastos.sort((a,b) => new Date(parseDate(b.fecha)) - new Date(parseDate(a.fecha))).map(g => `
                    <tr class="hover:bg-slate-800/20 transition-colors">
                        <td class="px-4 py-3 font-mono text-[10px] text-slate-400">${g.fecha}</td>
                        <td class="px-4 py-3">
                            <div class="font-semibold text-white">${g.concepto}</div>
                            <div class="text-slate-400 text-[10px]">${g.id_viaje ? `Viaje: ${g.id_viaje}` : 'Gasto General'}</div>
                        </td>
                        <td class="px-4 py-3 text-right font-bold text-red-400">${fmt(parseFloat(g.monto) || 0)}</td>
                    </tr>
                `).join('');
            }
        }
        
        // Historical Yield Chart
        const dieselExpensesPeriod = gastos
            .filter(g => g.concepto === 'Diesel')
            .map(e => {
                const tractoSupport = (parseFloat(e.litros_tracto) > 0 || parseFloat(e.litros_termo) > 0);
                const effectiveVol = tractoSupport ? (parseFloat(e.litros_tracto) || 0) : (parseFloat(e.litros_rellenados) || 0);
                const km = parseFloat(e.kmts_recorridos) || 0;
                let yieldVal = 0;
                if (effectiveVol > 0 && km > 0) {
                    yieldVal = km / effectiveVol;
                }
                return {
                    fecha: e.fecha,
                    yieldVal: yieldVal > 0.5 && yieldVal < 15 ? parseFloat(yieldVal.toFixed(2)) : 0
                };
            })
            .filter(item => item.yieldVal > 0)
            .sort((a, b) => new Date(parseDate(a.fecha)) - new Date(parseDate(b.fecha)));
            
        renderChartInstance('driverYieldHistoryChart', 'line', {
            labels: dieselExpensesPeriod.map(d => d.fecha),
            datasets: [{
                label: 'Km/L',
                data: dieselExpensesPeriod.map(d => d.yieldVal),
                borderColor: '#c084fc',
                backgroundColor: 'rgba(192, 132, 252, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 5,
                pointBackgroundColor: '#c084fc'
            }]
        });
        
        // Expenses Doughnut Chart
        const driverExpensesGrouped = {};
        gastos.forEach(g => {
            const concept = g.concepto || 'Varios';
            driverExpensesGrouped[concept] = (driverExpensesGrouped[concept] || 0) + (parseFloat(g.monto) || 0);
        });
        
        const topDriverExpenses = Object.entries(driverExpensesGrouped)
            .sort((a, b) => b[1] - a[1]);
            
        renderChartInstance('driverExpensesChart', 'doughnut', {
            labels: topDriverExpenses.map(e => e[0]),
            datasets: [{
                data: topDriverExpenses.map(e => e[1]),
                backgroundColor: [
                    'rgba(239, 68, 68, 0.7)',
                    'rgba(59, 130, 246, 0.7)',
                    'rgba(16, 185, 129, 0.7)',
                    'rgba(245, 158, 11, 0.7)',
                    'rgba(139, 92, 246, 0.7)',
                    'rgba(107, 114, 128, 0.7)',
                    'rgba(236, 72, 153, 0.7)',
                    'rgba(20, 184, 166, 0.7)'
                ],
                borderWidth: 0
            }]
        });
        
        // Flete vs Comisión por Viaje
        const tripsCompareData = viajes.map(v => {
            const flete = parseFloat(v.monto_flete) || 0;
            const comision = parseFloat(v.comision_chofer) || 0;
            return {
                id_viaje: v.id_viaje,
                fecha: v.fecha,
                flete: flete,
                comision: comision
            };
        }).sort((a,b) => new Date(parseDate(a.fecha)) - new Date(parseDate(b.fecha)));
        
        renderChartInstance('driverTripsChart', 'bar', {
            labels: tripsCompareData.map(t => `${t.fecha} (${t.id_viaje})`),
            datasets: [
                {
                    label: 'Ingreso Flete',
                    data: tripsCompareData.map(t => t.flete),
                    backgroundColor: 'rgba(59, 130, 246, 0.7)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Comisión Chofer',
                    data: tripsCompareData.map(t => t.comision),
                    backgroundColor: 'rgba(245, 158, 11, 0.7)',
                    borderColor: 'rgba(245, 158, 11, 1)',
                    borderWidth: 1
                }
            ]
        });
        
        if (statusEl) {
            statusEl.innerText = 'Conectado';
            statusEl.className = 'text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest';
        }
        
    } catch (e) {
        console.error('Error updating driver dashboard:', e);
        if (statusEl) {
            statusEl.innerText = 'Error: ' + e.message;
            statusEl.className = 'text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest';
        }
    }
}

// --- EXPENSES DASHBOARD ---
async function initExpensesDashboard() {
    const startInput = document.getElementById('db-expenses-start');
    const endInput = document.getElementById('db-expenses-end');
    
    if (!startInput || !endInput) return;
    
    if (!startInput.value || !endInput.value) {
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        
        startInput.value = getLocalISODate(thirtyDaysAgo);
        endInput.value = getLocalISODate(today);
    }
    
    if (!expensesDashboardInitialized) {
        expensesDashboardInitialized = true;
        
        // Bind event listeners
        startInput.addEventListener('change', () => updateExpensesDashboard());
        endInput.addEventListener('change', () => updateExpensesDashboard());
    }
    
    updateExpensesDashboard();
}

async function updateExpensesDashboard() {
    const startInput = document.getElementById('db-expenses-start');
    const endInput = document.getElementById('db-expenses-end');
    
    if (!startInput || !endInput) return;
    
    const start = startInput.value;
    const end = endInput.value;
    
    const statusEl = document.getElementById('conn-status');
    if (statusEl) {
        statusEl.innerText = 'Consultando Gastos...';
        statusEl.className = 'text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest animate-pulse';
    }
    
    try {
        const [expensesRaw, tripsRaw, driversRaw] = await Promise.all([
            window.supabaseClient.from(DB_CONFIG.tableGastos).select('*'),
            window.supabaseClient.from(DB_CONFIG.tableViajes).select('*'),
            window.supabaseClient.from(DB_CONFIG.tableChoferes).select('id_chofer, nombre')
        ]);
        
        if (expensesRaw.error) throw expensesRaw.error;
        if (tripsRaw.error) throw tripsRaw.error;
        if (driversRaw.error) throw driversRaw.error;
        
        const expensesData = expensesRaw.data || [];
        const tripsData = tripsRaw.data || [];
        const driversData = driversRaw.data || [];
        
        const driverMap = {};
        driversData.forEach(d => {
            driverMap[d.id_chofer] = d.nombre;
        });
        
        const parseDate = parseDateToISO;
        
        const filterByDate = (rows, s, e) => rows.filter(r => {
            const rowDate = parseDate(r.fecha);
            return rowDate && rowDate >= s && rowDate <= e;
        });
        
        const gastos = filterByDate(expensesData, start, end).filter(g => {
            const c = (g.concepto || '').toLowerCase();
            return c !== 'comisión chofer' && c !== 'comision chofer';
        });
        const viajes = filterByDate(tripsData, start, end);
        
        const totalExpenses = gastos.reduce((acc, g) => acc + (parseFloat(g.monto) || 0), 0);
        const dieselExpenses = gastos.filter(g => g.concepto === 'Diesel').reduce((acc, g) => acc + (parseFloat(g.monto) || 0), 0);
        const approvedExpenses = gastos.filter(g => (g.estatus_aprobacion || '').toLowerCase() === 'aprobado').reduce((acc, g) => acc + (parseFloat(g.monto) || 0), 0);
        const pendingExpenses = gastos.filter(g => (g.estatus_aprobacion || '').toLowerCase() === 'pendiente' || !g.estatus_aprobacion).reduce((acc, g) => acc + (parseFloat(g.monto) || 0), 0);
        
        const totalTripsCount = viajes.length;
        const avgExpensePerTrip = totalTripsCount > 0 ? (totalExpenses / totalTripsCount) : 0;
        
        const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
        
        safeSetText('db-expenses-total', fmt(totalExpenses));
        safeSetText('db-expenses-diesel', fmt(dieselExpenses));
        safeSetText('db-expenses-approved', fmt(approvedExpenses));
        safeSetText('db-expenses-pending', fmt(pendingExpenses));
        safeSetText('db-expenses-avg-trip', fmt(avgExpensePerTrip));
        
        // Top 10 Expenses Table
        const topExpensesTbody = document.getElementById('db-expenses-top-table-body');
        if (topExpensesTbody) {
            const sortedTopGastos = [...gastos].sort((a, b) => (parseFloat(b.monto) || 0) - (parseFloat(a.monto) || 0)).slice(0, 10);
            if (sortedTopGastos.length === 0) {
                topExpensesTbody.innerHTML = '<tr><td colspan="6" class="px-6 py-6 text-center text-slate-500 italic">Sin gastos registrados</td></tr>';
            } else {
                topExpensesTbody.innerHTML = sortedTopGastos.map(g => {
                    const statusClass = (g.estatus_aprobacion || '').toLowerCase() === 'aprobado' ? 'bg-green-500/10 text-green-400 border border-green-500/10' :
                                      ((g.estatus_aprobacion || '').toLowerCase() === 'rechazado' ? 'bg-red-500/10 text-red-400 border border-red-500/10' : 'bg-amber-500/10 text-amber-400 border border-amber-500/10');
                    const driverName = driverMap[g.id_chofer] || g.id_chofer || '---';
                    return `
                        <tr class="hover:bg-slate-800/20 transition-colors">
                            <td class="px-6 py-4 font-mono text-slate-400">${g.fecha || '---'}</td>
                            <td class="px-6 py-4 text-white font-semibold">${driverName}</td>
                            <td class="px-6 py-4 text-slate-300 font-mono">${g.id_unidad || '---'}</td>
                            <td class="px-6 py-4">
                                <div class="text-white font-semibold">${g.concepto}</div>
                                <div class="text-[10px] text-slate-500 truncate max-w-[180px]">${g.observaciones || g.id_viaje || ''}</div>
                            </td>
                            <td class="px-6 py-4">
                                <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${statusClass}">${g.estatus_aprobacion || 'Pendiente'}</span>
                            </td>
                            <td class="px-6 py-4 text-right font-bold text-red-400">${fmt(parseFloat(g.monto) || 0)}</td>
                        </tr>
                    `;
                }).join('');
            }
        }
        
        // Chart 1: Expenses Concept Doughnut
        const conceptGrouped = {};
        gastos.forEach(g => {
            const concept = g.concepto || 'Varios';
            conceptGrouped[concept] = (conceptGrouped[concept] || 0) + (parseFloat(g.monto) || 0);
        });
        const sortedConcepts = Object.entries(conceptGrouped).sort((a,b) => b[1] - a[1]);
        
        renderChartInstance('expensesConceptChart', 'doughnut', {
            labels: sortedConcepts.map(c => c[0]),
            datasets: [{
                data: sortedConcepts.map(c => c[1]),
                backgroundColor: [
                    'rgba(239, 68, 68, 0.7)',
                    'rgba(59, 130, 246, 0.7)',
                    'rgba(16, 185, 129, 0.7)',
                    'rgba(245, 158, 11, 0.7)',
                    'rgba(139, 92, 246, 0.7)',
                    'rgba(107, 114, 128, 0.7)',
                    'rgba(236, 72, 153, 0.7)',
                    'rgba(20, 184, 166, 0.7)'
                ],
                borderWidth: 0
            }]
        });
        
        // Chart 2: Expenses Trend Line
        const trendGrouped = {};
        gastos.forEach(g => {
            const d = parseDate(g.fecha);
            if (d) {
                trendGrouped[d] = (trendGrouped[d] || 0) + (parseFloat(g.monto) || 0);
            }
        });
        const sortedTrend = Object.entries(trendGrouped).sort((a,b) => new Date(a[0]) - new Date(b[0]));
        
        renderChartInstance('expensesTrendChart', 'line', {
            labels: sortedTrend.map(t => t[0]),
            datasets: [{
                label: 'Gastos Diarios',
                data: sortedTrend.map(t => t[1]),
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: '#ef4444'
            }]
        });
        
        // Chart 3: Expenses comparison by ECO
        const ecoGrouped = {};
        gastos.forEach(g => {
            const eco = g.id_unidad || 'Sin Unidad';
            ecoGrouped[eco] = (ecoGrouped[eco] || 0) + (parseFloat(g.monto) || 0);
        });
        const sortedEco = Object.entries(ecoGrouped).sort((a,b) => b[1] - a[1]);
        
        renderChartInstance('expensesUnitChart', 'bar', {
            labels: sortedEco.map(u => u[0]),
            datasets: [{
                label: 'Total Gastado',
                data: sortedEco.map(u => u[1]),
                backgroundColor: 'rgba(168, 85, 247, 0.7)',
                borderColor: 'rgba(168, 85, 247, 1)',
                borderWidth: 1
            }]
        });
        
        if (statusEl) {
            statusEl.innerText = 'Conectado';
            statusEl.className = 'text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest';
        }
        
    } catch (e) {
        console.error('Error updating expenses dashboard:', e);
        if (statusEl) {
            statusEl.innerText = 'Error: ' + e.message;
            statusEl.className = 'text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest';
        }
    }
}

// --- DEBTS DASHBOARD ---
async function initDebtsDashboard() {
    const startInput = document.getElementById('db-debts-start');
    const endInput = document.getElementById('db-debts-end');
    
    if (!startInput || !endInput) return;
    
    if (!startInput.value || !endInput.value) {
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        
        startInput.value = getLocalISODate(thirtyDaysAgo);
        endInput.value = getLocalISODate(today);
    }
    
    if (!debtsDashboardInitialized) {
        debtsDashboardInitialized = true;
        
        // Bind event listeners
        startInput.addEventListener('change', () => updateDebtsDashboard());
        endInput.addEventListener('change', () => updateDebtsDashboard());
    }
    
    updateDebtsDashboard();
}

async function updateDebtsDashboard() {
    const startInput = document.getElementById('db-debts-start');
    const endInput = document.getElementById('db-debts-end');
    
    if (!startInput || !endInput) return;
    
    const start = startInput.value;
    const end = endInput.value;
    
    const statusEl = document.getElementById('conn-status');
    if (statusEl) {
        statusEl.innerText = 'Consultando Deudas...';
        statusEl.className = 'text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest animate-pulse';
    }
    
    try {
        const [tripsRaw, accountsRaw, driversRaw] = await Promise.all([
            window.supabaseClient.from(DB_CONFIG.tableViajes).select('*').neq('estatus_pago', 'Pagado'),
            window.supabaseClient.from(DB_CONFIG.tableCuentas).select('*').neq('estatus', 'Liquidado'),
            window.supabaseClient.from(DB_CONFIG.tableChoferes).select('id_chofer, nombre')
        ]);
        
        if (tripsRaw.error) throw tripsRaw.error;
        if (accountsRaw.error) throw accountsRaw.error;
        if (driversRaw.error) throw driversRaw.error;
        
        const tripsData = tripsRaw.data || [];
        const accountsData = accountsRaw.data || [];
        const driversData = driversRaw.data || [];
        
        const driverMap = {};
        driversData.forEach(d => {
            driverMap[d.id_chofer] = d.nombre;
        });
        
        const parseDate = parseDateToISO;
        
        const filterByDate = (rows, s, e) => rows.filter(r => {
            const rowDate = parseDate(r.fecha);
            return rowDate && rowDate >= s && rowDate <= e;
        });
        
        const fletesPendientes = filterByDate(tripsData, start, end);
        const cuentasPendientes = filterByDate(accountsData, start, end);
        
        // Saldos
        const fletesCobrar = fletesPendientes.reduce((acc, v) => acc + (parseFloat(v.monto_flete) || 0), 0);
        const anticiposRecuperar = cuentasPendientes.filter(c => c.tipo === 'A Favor').reduce((acc, c) => acc + (parseFloat(c.monto) || 0), 0);
        const cuentasPagar = cuentasPendientes.filter(c => c.tipo === 'En Contra').reduce((acc, c) => acc + (parseFloat(c.monto) || 0), 0);
        const balanceNeto = fletesCobrar + anticiposRecuperar - cuentasPagar;
        
        const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
        
        safeSetText('db-debts-fletes', fmt(fletesCobrar));
        safeSetText('db-debts-advances', fmt(anticiposRecuperar));
        safeSetText('db-debts-payable', fmt(cuentasPagar));
        safeSetText('db-debts-net', fmt(balanceNeto));
        
        // Table 1: Fletes Pendientes
        const fletesTbody = document.getElementById('db-debts-fletes-table-body');
        if (fletesTbody) {
            if (fletesPendientes.length === 0) {
                fletesTbody.innerHTML = '<tr><td colspan="2" class="px-4 py-6 text-center text-slate-500 italic">Sin fletes pendientes</td></tr>';
            } else {
                fletesTbody.innerHTML = fletesPendientes.sort((a,b) => (parseFloat(b.monto_flete) || 0) - (parseFloat(a.monto_flete) || 0)).map(v => `
                    <tr class="hover:bg-slate-800/20 transition-colors">
                        <td class="px-4 py-3">
                            <div class="font-semibold text-white">${v.cliente || '---'}</div>
                            <div class="text-[10px] text-slate-500 font-mono">${v.id_viaje} (${v.fecha})</div>
                        </td>
                        <td class="px-4 py-3 text-right font-bold text-blue-400">${fmt(parseFloat(v.monto_flete) || 0)}</td>
                    </tr>
                `).join('');
            }
        }
        
        // Table 2: Anticipos Pendientes (A Favor)
        const advancesTbody = document.getElementById('db-debts-advances-table-body');
        if (advancesTbody) {
            const anticiposList = cuentasPendientes.filter(c => c.tipo === 'A Favor');
            if (anticiposList.length === 0) {
                advancesTbody.innerHTML = '<tr><td colspan="2" class="px-4 py-6 text-center text-slate-500 italic">Sin anticipos pendientes</td></tr>';
            } else {
                advancesTbody.innerHTML = anticiposList.sort((a,b) => (parseFloat(b.monto) || 0) - (parseFloat(a.monto) || 0)).map(c => {
                    const actorName = driverMap[c.actor_nombre] || c.actor_nombre || '---';
                    return `
                        <tr class="hover:bg-slate-800/20 transition-colors">
                            <td class="px-4 py-3">
                                <div class="font-semibold text-white">${actorName}</div>
                                <div class="text-[10px] text-slate-500">${c.concepto || 'Anticipo'} (${c.fecha})</div>
                            </td>
                            <td class="px-4 py-3 text-right font-bold text-purple-400">${fmt(parseFloat(c.monto) || 0)}</td>
                        </tr>
                    `;
                }).join('');
            }
        }
        
        // Table 3: Cuentas por Pagar (En Contra)
        const payableTbody = document.getElementById('db-debts-payable-table-body');
        if (payableTbody) {
            const pagarList = cuentasPendientes.filter(c => c.tipo === 'En Contra');
            if (pagarList.length === 0) {
                payableTbody.innerHTML = '<tr><td colspan="2" class="px-4 py-6 text-center text-slate-500 italic">Sin cuentas por pagar</td></tr>';
            } else {
                payableTbody.innerHTML = pagarList.sort((a,b) => (parseFloat(b.monto) || 0) - (parseFloat(a.monto) || 0)).map(c => {
                    const actorName = driverMap[c.actor_nombre] || c.actor_nombre || '---';
                    return `
                        <tr class="hover:bg-slate-800/20 transition-colors">
                            <td class="px-4 py-3">
                                <div class="font-semibold text-white">${actorName}</div>
                                <div class="text-[10px] text-slate-500">${c.concepto || 'Proveedor/Gasto'} (${c.fecha})</div>
                            </td>
                            <td class="px-4 py-3 text-right font-bold text-rose-400">${fmt(parseFloat(c.monto) || 0)}</td>
                        </tr>
                    `;
                }).join('');
            }
        }
        
        // Chart 1: Debts Proportion Doughnut
        renderChartInstance('debtsTypeChart', 'doughnut', {
            labels: ['Fletes por Cobrar', 'Anticipos por Recuperar', 'Cuentas por Pagar'],
            datasets: [{
                data: [fletesCobrar, anticiposRecuperar, cuentasPagar],
                backgroundColor: [
                    'rgba(59, 130, 246, 0.7)',
                    'rgba(168, 85, 247, 0.7)',
                    'rgba(244, 63, 94, 0.7)'
                ],
                borderWidth: 0
            }]
        });
        
        // Chart 2: Top Actor Balances (Bar Chart horizontal)
        const actorBalances = {};
        
        // Fletes pendientes (Clientes deben al sistema - Saldo A Favor)
        fletesPendientes.forEach(v => {
            const actor = v.cliente || 'Cliente Desconocido';
            actorBalances[actor] = (actorBalances[actor] || 0) + (parseFloat(v.monto_flete) || 0);
        });
        
        // Anticipos (Choferes deben al sistema - Saldo A Favor) y Cuentas por Pagar (les debemos)
        cuentasPendientes.forEach(c => {
            const actor = driverMap[c.actor_nombre] || c.actor_nombre || 'Desconocido';
            const val = parseFloat(c.monto) || 0;
            if (c.tipo === 'A Favor') {
                actorBalances[actor] = (actorBalances[actor] || 0) + val;
            } else {
                actorBalances[actor] = (actorBalances[actor] || 0) - val;
            }
        });
        
        // Convert to array and sort by absolute balance
        const sortedActors = Object.entries(actorBalances)
            .sort((a,b) => b[1] - a[1]) // De mayor a menor
            .slice(0, 10);
            
        renderChartInstance('debtsActorChart', 'bar', {
            indexAxis: 'y',
            labels: sortedActors.map(a => a[0]),
            datasets: [{
                label: 'Saldo Neto (Positivo = Nos deben, Negativo = Debemos)',
                data: sortedActors.map(a => a[1]),
                backgroundColor: sortedActors.map(a => a[1] >= 0 ? 'rgba(59, 130, 246, 0.7)' : 'rgba(244, 63, 94, 0.7)'),
                borderColor: sortedActors.map(a => a[1] >= 0 ? 'rgba(59, 130, 246, 1)' : 'rgba(244, 63, 94, 1)'),
                borderWidth: 1
            }]
        });
        
        if (statusEl) {
            statusEl.innerText = 'Conectado';
            statusEl.className = 'text-[10px] bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest';
        }
        
    } catch (e) {
        console.error('Error updating debts dashboard:', e);
        if (statusEl) {
            statusEl.innerText = 'Error: ' + e.message;
            statusEl.className = 'text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest';
        }
    }
}

window.updateUnitDashboard = updateUnitDashboard;
window.initUnitDashboard = initUnitDashboard;
window.initDriverDashboard = initDriverDashboard;
window.updateDriverDashboard = updateDriverDashboard;
window.initExpensesDashboard = initExpensesDashboard;
window.updateExpensesDashboard = updateExpensesDashboard;
window.initDebtsDashboard = initDebtsDashboard;
window.updateDebtsDashboard = updateDebtsDashboard;

// --- MOVIMIENTOS POR PERIODO ---

function loadMovementsByPeriod() {
    const startInput = document.getElementById('mov-filter-start');
    const endInput = document.getElementById('mov-filter-end');

    if (startInput && !startInput.value) {
        const today = getLocalISODate();
        startInput.value = today;
        endInput.value = today;
    }

    updateMovementsList();
}

async function updateMovementsList() {
    const start = document.getElementById('mov-filter-start')?.value;
    const end = document.getElementById('mov-filter-end')?.value;
    const loader = document.getElementById('movements-loader');
    const tbody = document.getElementById('movements-table-body');

    if (!tbody) return;

    if (loader) loader.classList.remove('hidden');
    tbody.innerHTML = '';

    try {
        const [viajesRaw, gastosRaw, cuentasRaw, liquidacionesRaw, choferesRaw, unidadesRaw] = await Promise.all([
            fetchSupabaseData(DB_CONFIG.tableViajes, 'fecha', start, end),
            fetchSupabaseData(DB_CONFIG.tableGastos, 'fecha', start, end),
            fetchSupabaseData(DB_CONFIG.tableCuentas, 'fecha', start, end),
            fetchSupabaseData(DB_CONFIG.tableLiquidaciones, 'fecha_fin', start, end),
            fetchSupabaseData(DB_CONFIG.tableChoferes),
            fetchSupabaseData(DB_CONFIG.tableUnidades)
        ]);

        const driverMap = {};
        choferesRaw.forEach(c => driverMap[c.id_chofer] = c.nombre);
        const unitMap = {};
        unidadesRaw.forEach(u => unitMap[u.id_unidad] = u.nombre_unidad || u.id_unidad);

        const parseDate = parseDateToISO;

        const filterByDate = (rows, s, e) => rows.filter(r => {
            // reg_liquidaciones usa created_at o fecha_fin, usemos created_at simplificado a YYYY-MM-DD
            const dStr = r.fecha || r.created_at || r.fecha_fin;
            const rowDate = parseDate(dStr ? dStr.split('T')[0] : null);
            return rowDate && rowDate >= s && rowDate <= e;
        });

        const viajes = filterByDate(viajesRaw, start, end);
        const gastos = filterByDate(gastosRaw, start, end);
        const cuentas = filterByDate(cuentasRaw, start, end);
        const liquidaciones = filterByDate(liquidacionesRaw, start, end);

        const combined = [
            ...viajes.map(v => ({
                type: 'venta',
                date: v.fecha,
                ref: v.id_viaje || '---',
                concept: `${v.origen} -> ${v.destino}`,
                actor: v.cliente || (v.id_chofer ? (driverMap[v.id_chofer] ? `${driverMap[v.id_chofer]} [${v.id_chofer}]` : v.id_chofer) : '---'),
                amount: v.monto_flete
            })),
            ...gastos.map(g => {
                const dName = driverMap[g.id_chofer] ? `${driverMap[g.id_chofer]} [${g.id_chofer}]` : g.id_chofer;
                const uName = unitMap[g.id_unidad] || g.id_unidad;
                return {
                    type: 'gasto',
                    date: g.fecha,
                    ref: g.id_gasto || '---',
                    concept: g.concepto || 'Gasto',
                    actor: `${dName || '---'}${uName ? ' | ' + uName : ''}`,
                    amount: g.monto
                };
            }),
            ...cuentas.map(c => {
                let type = c.tipo === 'A Favor' ? 'anticipo' : 'deuda';
                if (c.estatus === 'Liquidado') {
                    type = c.tipo === 'A Favor' ? 'cobro' : 'pago_deuda';
                }
                const actorDisplay = driverMap[c.actor_nombre] ? `${driverMap[c.actor_nombre]} [${c.actor_nombre}]` : (unitMap[c.actor_nombre] ? `${unitMap[c.actor_nombre]} [${c.actor_nombre}]` : c.actor_nombre);
                return {
                    type: type,
                    date: c.fecha,
                    ref: c.id_cuenta || '---',
                    concept: c.concepto || 'Cuenta/Deuda',
                    actor: actorDisplay || '---',
                    amount: c.monto
                };
            }),
            ...liquidaciones.map(l => ({
                type: 'liquidacion',
                date: l.created_at ? l.created_at.split('T')[0] : l.fecha_fin,
                ref: `LIQ-${l.id}`,
                concept: `Liquidación Chofer: ${l.id_chofer}`,
                actor: driverMap[l.id_chofer] ? `${driverMap[l.id_chofer]} [${l.id_chofer}]` : (l.id_chofer || '---'),
                amount: l.monto_neto
            }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date));

        const label = document.getElementById('mov-period-label');
        if (label) label.innerText = `Periodo: ${start} al ${end}`;

        if (combined.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="p-16 text-center text-slate-500 italic">No se encontraron movimientos en este periodo.</td></tr>';
        } else {
            tbody.innerHTML = combined.map(m => {
                let badgeClass = '';
                let typeLabel = '';
                let amountClass = '';
                let sign = '';

                switch (m.type) {
                    case 'venta':
                        badgeClass = 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
                        typeLabel = 'Viaje';
                        amountClass = 'text-blue-400';
                        sign = '+';
                        break;
                    case 'gasto':
                        badgeClass = 'bg-red-500/10 text-red-400 border border-red-500/20';
                        typeLabel = 'Gasto';
                        amountClass = 'text-red-400';
                        sign = '-';
                        break;
                    case 'anticipo':
                        badgeClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                        typeLabel = 'Anticipo';
                        amountClass = 'text-emerald-400';
                        sign = '+';
                        break;
                    case 'deuda':
                        badgeClass = 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
                        typeLabel = 'Deuda/CXP';
                        amountClass = 'text-amber-400';
                        sign = '-';
                        break;
                    case 'liquidacion':
                        badgeClass = 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
                        typeLabel = 'Liquidación';
                        amountClass = 'text-purple-400';
                        sign = '-';
                        break;
                    case 'cobro':
                        badgeClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                        typeLabel = 'Cobro / Ingreso';
                        amountClass = 'text-emerald-400';
                        sign = '+';
                        break;
                    case 'pago_deuda':
                        badgeClass = 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
                        typeLabel = 'Pago / Egreso';
                        amountClass = 'text-rose-400';
                        sign = '-';
                        break;
                }

                return `
                <tr class="hover:bg-white/[0.02] transition-colors border-b border-white/5 last:border-0">
                    <td class="px-8 py-5 text-xs font-mono text-slate-400">${m.date}</td>
                    <td class="px-8 py-5">
                        <span class="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${badgeClass}">
                            ${typeLabel}
                        </span>
                    </td>
                    <td class="px-8 py-5">
                        <div class="text-sm font-bold text-white">${m.ref}</div>
                        <div class="text-[10px] text-slate-500 uppercase tracking-tighter">${m.concept}</div>
                    </td>
                    <td class="px-8 py-5 text-sm font-medium text-slate-400">${m.actor}</td>
                    <td class="px-8 py-5 text-right">
                        <span class="text-sm font-black ${amountClass}">
                            ${sign}$${(parseFloat(m.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                    </td>
                    <td class="px-8 py-5 text-right">
                        <button onclick="showDetailModal('${m.type === 'venta' ? 'viajes' : (m.type === 'gasto' ? 'gastos' : (m.type === 'liquidacion' ? 'liquidaciones' : 'cuentas'))}', '${m.ref}')" 
                            title="Ver Detalle" 
                            class="w-8 h-8 rounded-lg bg-white/5 hover:bg-indigo-500/20 text-slate-400 hover:text-indigo-400 transition-all flex items-center justify-center">
                            <i class="fas fa-eye text-xs"></i>
                        </button>
                    </td>
                </tr>
            `;
            }).join('');
        }
    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="5" class="p-16 text-center text-red-400">Error al cargar datos: ${err.message}</td></tr>`;
    } finally {
        if (loader) loader.classList.add('hidden');
    }
}

async function fetchSupabaseData(tableName, dateCol = null, start = null, end = null) {
    try {
        let query = window.supabaseClient.from(tableName).select('*');
        if (dateCol && start && end) {
            query = query.gte(dateCol, start).lte(dateCol, end);
        }
        const { data, error } = await query;

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
    const fuelExpenses = gastosData.filter(g => {
        const tractoSupport = (parseFloat(g.litros_tracto) > 0 || parseFloat(g.litros_termo) > 0);
        const effectiveVol = tractoSupport ? (parseFloat(g.litros_tracto) || 0) : (parseFloat(g.litros_rellenados) || 0);
        return g.concepto === 'Diesel' && effectiveVol > 0 && (g.id_unidad || g.id_unit_eco);
    });
    const { unitYields } = calculateFleetEfficiency(fuelExpenses, unidadesData);

    const sortedYields = Object.entries(unitYields)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);

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
    const driverFuelExpenses = gastosData.filter(g => {
        const tractoSupport = (parseFloat(g.litros_tracto) > 0 || parseFloat(g.litros_termo) > 0);
        const effectiveVol = tractoSupport ? (parseFloat(g.litros_tracto) || 0) : (parseFloat(g.litros_rellenados) || 0);
        return g.concepto === 'Diesel' && effectiveVol > 0 && g.id_chofer;
    });
    const { driverYields } = calculateDriverEfficiency(driverFuelExpenses, unidadesData);

    const allDrivers = Object.entries(driverYields);

    const bestDrivers = [...allDrivers]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    const worstDrivers = [...allDrivers]
        .sort((a, b) => a[1] - b[1])
        .slice(0, 3);

    renderChartInstance('bestDriversChart', 'bar', {
        indexAxis: 'y',
        labels: bestDrivers.map(d => globalDriverMap[d[0]] || d[0]),
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
        labels: worstDrivers.map(d => globalDriverMap[d[0]] || d[0]),
        datasets: [{
            label: 'Km/L (Menor)',
            data: worstDrivers.map(d => d[1]),
            backgroundColor: worstDrivers.map((_, i) => DIVERSE_COLORS[i % DIVERSE_COLORS.length].bg),
            borderColor: worstDrivers.map((_, i) => DIVERSE_COLORS[i % DIVERSE_COLORS.length].border),
            borderWidth: 1
        }]
    });
}

function calculateFleetEfficiency(expenses, unidadesData = []) {
    // Build a map of unit monitoring status
    const fuelMonitoringMap = {};
    unidadesData.forEach(u => {
        fuelMonitoringMap[u.id_unidad] = u.registra_combustible !== false;
    });

    // Sort expenses by date descending to get the most recent records first
    const sortedExpenses = [...expenses].sort((a, b) => {
        const dateA = parseDateToISO(a.fecha);
        const dateB = parseDateToISO(b.fecha);
        const dateComp = dateB.localeCompare(dateA);
        if (dateComp !== 0) return dateComp;
        const timeA = a.created_at || a.id_gasto || '';
        const timeB = b.created_at || b.id_gasto || '';
        return timeB.localeCompare(timeA);
    });

    const unitYields = {};
    const seenUnits = new Set();
    let totalKm = 0;
    let totalLts = 0;

    sortedExpenses.forEach(e => {
        const unitId = e.id_unidad || e.id_unit_eco;
        if (!unitId) return;
        
        // Exclude units not registering fuel monitoring
        if (fuelMonitoringMap[unitId] === false) return;
        
        if (seenUnits.has(unitId)) return;

        const tractoSupport = (parseFloat(e.litros_tracto) > 0 || parseFloat(e.litros_termo) > 0);
        const effectiveVol = tractoSupport ? (parseFloat(e.litros_tracto) || 0) : (parseFloat(e.litros_rellenados) || 0);
        const km = parseFloat(e.kmts_recorridos) || 0;

        if (effectiveVol > 0 && km > 0) {
            const yieldVal = km / effectiveVol;
            // Basic sanity check: 0.5 < yield < 15 km/l to avoid bad data outliers
            if (yieldVal > 0.5 && yieldVal < 15) {
                unitYields[unitId] = parseFloat(yieldVal.toFixed(2));
                seenUnits.add(unitId);
                totalKm += km;
                totalLts += effectiveVol;
            }
        }
    });

    const fleetAvg = totalLts > 0 ? (totalKm / totalLts) : 0;

    return {
        unitYields,
        fleetAvg
    };
}

function calculateDriverEfficiency(expenses, unidadesData = []) {
    // Build a map of unit monitoring status
    const fuelMonitoringMap = {};
    unidadesData.forEach(u => {
        fuelMonitoringMap[u.id_unidad] = u.registra_combustible !== false;
    });

    // Sort expenses by date descending to get the most recent records first
    const sortedExpenses = [...expenses].sort((a, b) => {
        const dateA = parseDateToISO(a.fecha);
        const dateB = parseDateToISO(b.fecha);
        const dateComp = dateB.localeCompare(dateA);
        if (dateComp !== 0) return dateComp;
        const timeA = a.created_at || a.id_gasto || '';
        const timeB = b.created_at || b.id_gasto || '';
        return timeB.localeCompare(timeA);
    });

    const driverYields = {};
    const seenDrivers = new Set();

    sortedExpenses.forEach(e => {
        if (!e.id_chofer) return;
        
        // Exclude expenses belonging to units not registering fuel monitoring
        const unitId = e.id_unidad || e.id_unit_eco;
        if (unitId && fuelMonitoringMap[unitId] === false) return;
        
        if (seenDrivers.has(e.id_chofer)) return;

        const tractoSupport = (parseFloat(e.litros_tracto) > 0 || parseFloat(e.litros_termo) > 0);
        const effectiveVol = tractoSupport ? (parseFloat(e.litros_tracto) || 0) : (parseFloat(e.litros_rellenados) || 0);
        const km = parseFloat(e.kmts_recorridos) || 0;

        if (effectiveVol > 0 && km > 0) {
            const yieldVal = km / effectiveVol;
            // Basic sanity check: 0.5 < yield < 15 km/l
            if (yieldVal > 0.5 && yieldVal < 15) {
                driverYields[e.id_chofer] = parseFloat(yieldVal.toFixed(2));
                seenDrivers.add(e.id_chofer);
            }
        }
    });

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

        // REGLA DE NEGOCIO: Validación Diferenciada (Chofer vs Admin)
        if (String(session.rol).toLowerCase() !== 'admin' && String(session.rol).toLowerCase() !== 'superadmin') {
            // Lógica para CHOFERES
            if (tripID) {
                // Validar existencia y estatus En Proceso
                const { data: tripCheck, error: tripCheckErr } = await window.supabaseClient
                    .from(DB_CONFIG.tableViajes)
                    .select('estatus_viaje')
                    .eq('id_viaje', tripID)
                    .single();

                if (tripCheckErr || !tripCheck) throw new Error('El ID de Viaje ingresado no existe.');

                // REGLA: Solo viajes en proceso
                if (tripCheck.estatus_viaje !== 'En Proceso') {
                    throw new Error(`El viaje ${tripID} no está en curso (Estatus: ${tripCheck.estatus_viaje}). No se pueden registrar gastos.`);
                }
            }
        }
        // Nota: Los admins y choferes pueden dejar tripID vacío para gastos generales.

        const formaPago = document.getElementById('Exp_Forma_Pago')?.value || 'Contado';

        const expenseData = {
            fecha: getVal('Fecha'),
            id_viaje: tripID || null, // Permitir NULL para admins
            id_unidad: getVal('ID_Unidad'),
            id_chofer: (document.getElementById('ID_Chofer') ? (getVal('ID_Chofer') || null) : (session.id_contacto || session.usuario)),
            concepto: getVal('Concepto'),
            monto: parseFloat(getVal('Monto')) || 0,
            litros_tracto: document.getElementById('chk-tracto')?.checked ? (parseFloat(getVal('Litros_Tracto')) || 0) : 0,
            litros_termo: document.getElementById('chk-termo')?.checked ? (parseFloat(getVal('Litros_Termo')) || 0) : 0,
            litros_rellenados: parseFloat(getVal('Litros_Rellenados')) || 0,
            kmts_anteriores: parseFloat(getVal('Kmts_Anteriores')) || 0,
            kmts_actuales: parseFloat(getVal('Kmts_Actuales')) || 0,
            kmts_recorridos: parseFloat(getVal('Kmts_Recorridos')) || 0,
            forma_pago: formaPago,
            es_deducible: getVal('Exp_Deducible') || 'Sí',
            estatus_pago: 'Pendiente' // Regla de negocio: Todo nace/renace pendiente de revisión
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

            // Auto-fill Driver from Trip if missing (Corrective Logic)
            if (!expenseData.id_chofer && expenseData.id_viaje) {
                try {
                    const { data: trip } = await window.supabaseClient
                        .from(DB_CONFIG.tableViajes)
                        .select('id_chofer')
                        .eq('id_viaje', expenseData.id_viaje)
                        .single();
                    if (trip && trip.id_chofer) expenseData.id_chofer = trip.id_chofer;
                } catch (e) { console.warn('Could not auto-fill driver', e); }
            }

            const { error: insertError } = await window.supabaseClient
                .from(DB_CONFIG.tableGastos)
                .insert([expenseData]);
            error = insertError;
        }

        if (error) throw error;

        // Auto-create CXP if payment is Crédito and it's a new expense
        if (!isEditingExpense && (expenseData.forma_pago.includes('rédito') || expenseData.forma_pago === 'Crédito')) {
            await crearCXPAutomatica({
                id_gasto: expenseData.id_gasto,
                monto: expenseData.monto,
                concepto: expenseData.concepto,
                actor: expenseData.acreedor_nombre || expenseData.id_chofer || 'Proveedor'
            });
        }

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
    if (typeof window.updateLastYieldDisplay === 'function') {
        window.updateLastYieldDisplay(unitId);
    }

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

async function editTrip(id) {
    let trip = allTripsData.find(t => t.id_viaje === id);
    if (!trip) {
        try {
            const { data, error } = await window.supabaseClient
                .from(DB_CONFIG.tableViajes)
                .select('*')
                .eq('id_viaje', id)
                .single();
            if (error) throw error;
            trip = data;
        } catch (e) {
            console.error('Error al cargar viaje para edición:', e);
            alert('Error cargando el viaje para editar.');
            return;
        }
    }
    if (!trip) return;

    isEditingTrip = true;
    editingTripId = id;

    // 1. Cambiar a la sección principal de viajes
    showSection('viajes');

    // 2. Cambiar la vista de viajes al formulario
    toggleSectionView('viajes', 'form');

    // Llenar el formulario
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

    // Cambiar texto de botón
    const btn = document.querySelector('#viaje-form button[type="submit"]');
    if (btn) btn.innerText = 'Actualizar Viaje';
}

function editExpense(id) {
    // Buscar en la lista de gastos actual (dependiendo de la tab, puede ser allExpensesData o filtered)
    // Usaremos allExpensesData si existe, o currentExpensesRaw si está definido globalmente
    let expense = null;
    if (typeof allExpensesData !== 'undefined') expense = allExpensesData.find(g => g.id_gasto === id);
    // Fallback variable
    if (!expense && typeof currentExpensesRaw !== 'undefined') expense = currentExpensesRaw.find(g => g.id_gasto === id);

    if (!expense) return;

    toggleSectionView('gastos', 'form');

    isEditingExpense = true;
    editingExpenseId = id;

    document.getElementById('ID_Gasto').value = expense.id_gasto;
    document.getElementById('Fecha').value = expense.fecha;
    document.getElementById('ID_Viaje').value = expense.id_viaje;
    document.getElementById('ID_Unidad').value = expense.id_unidad;
    if (typeof window.updateLastYieldDisplay === 'function') {
        window.updateLastYieldDisplay(expense.id_unidad);
    }
    if (document.getElementById('ID_Chofer')) document.getElementById('ID_Chofer').value = expense.id_chofer || '';
    document.getElementById('Concepto').value = expense.concepto;
    document.getElementById('Monto').value = expense.monto;
    document.getElementById('Litros_Rellenados').value = expense.litros_rellenados;
    if (document.getElementById('Litros_Tracto')) {
        document.getElementById('Litros_Tracto').value = expense.litros_tracto || '';
        document.getElementById('Litros_Termo').value = expense.litros_termo || '';
        document.getElementById('chk-tracto').checked = (parseFloat(expense.litros_tracto) > 0);
        document.getElementById('chk-termo').checked = (parseFloat(expense.litros_termo) > 0);
        document.getElementById('div-litros-tracto').classList.toggle('hidden', !document.getElementById('chk-tracto').checked);
        document.getElementById('div-litros-termo').classList.toggle('hidden', !document.getElementById('chk-termo').checked);
        if (typeof window.calcLitrosTotales === 'function') window.calcLitrosTotales();
    }
    document.getElementById('Kmts_Anteriores').value = expense.kmts_anteriores;
    document.getElementById('Kmts_Actuales').value = expense.kmts_actuales;
    document.getElementById('Kmts_Recorridos').value = expense.kmts_recorridos;

    if (typeof window.updateLiveYield === 'function') {
        window.updateLiveYield();
    }

    // Handle Forma Pago and Acreedor
    const formaPagoSelect = document.getElementById('Exp_Forma_Pago');
    if (formaPagoSelect) {
        formaPagoSelect.value = expense.forma_pago;
        toggleAcreedorField(); // Trigger visibility logic
    }

    if (document.getElementById('Exp_Deducible')) {
        document.getElementById('Exp_Deducible').value = expense.es_deducible || 'Sí';
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

            // Texto por defecto vacío o "Selecciona"
            el.innerHTML = `<option value="">-- Selecciona una opción --</option>`;

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
            console.error(`Error cargando catálogo para ${id}:`, err);
            el.innerHTML = `<option value="">Error al cargar datos</option>`;
        }
    }

    // Special case for Acreedor (Only Providers requested)
    const acreedorSelect = document.getElementById('Exp_Acreedor');
    if (acreedorSelect) {
        try {
            const [proveedores] = await Promise.all([
                fetchSupabaseData(DB_CONFIG.tableProveedores)
            ]);

            acreedorSelect.innerHTML = '<option value="">-- Selecciona Proveedor (Opcional) --</option>';
            proveedores.filter(x => (x.estatus || 'Activo') === 'Activo').forEach(x => {
                acreedorSelect.innerHTML += `<option value="${x.nombre_proveedor}">${x.nombre_proveedor}</option>`;
            });
        } catch (err) {
            console.error('Error cargando catálogo de proveedores:', err);
        }
    }

    // Auto-generar ID de Viaje al iniciar
    generateTripID();
}

function toggleAcreedorField() {
    // Disabled logic: The user requested the provider dropdown to be always visible.
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
async function showSection(sectionId) {
    const session = checkAuth();
    const isSaul = session && session.usuario && String(session.usuario).trim().toLowerCase() === 'saulrivas@gmail.com';
    if (sectionId === 'settings-chat' && isSaul) {
        console.warn('Acceso restringido a configuración de chat para Saul Rivas');
        sectionId = 'dashboard';
    }

    console.log('Navegando a sección:', sectionId);
    
    // Ocultar todas las secciones
    document.querySelectorAll('.content-section').forEach(s => s.classList.add('hidden'));
    
    // Quitar clase activa de todos los links
    document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));

    const section = document.getElementById('section-' + sectionId);
    const nav = document.getElementById('nav-' + sectionId);

    if (section) {
        section.classList.remove('hidden');
        window.scrollTo(0, 0);
    }
    if (nav) nav.classList.add('active');

    // Cerrar sidebar en móvil si está abierto
    if (typeof toggleSidebarMobile === 'function') toggleSidebarMobile();

    // Cargar datos específicos por sección
    try {
        switch (sectionId) {
            case 'dashboard':
                if (currentDashboardTab === 'unit') {
                    updateUnitDashboard();
                } else if (currentDashboardTab === 'driver') {
                    updateDriverDashboard();
                } else if (currentDashboardTab === 'expenses') {
                    updateExpensesDashboard();
                } else if (currentDashboardTab === 'debts') {
                    updateDebtsDashboard();
                } else {
                    updateDashboardByPeriod();
                }
                break;
            case 'viajes':
                if (typeof loadTripsList === 'function') loadTripsList();
                break;
            case 'gastos':
                if (typeof loadExpensesList === 'function') loadExpensesList();
                break;
            case 'tesoreria':
                if (typeof switchTreasuryTab === 'function') {
                    if (!currentTreasuryTab) currentTreasuryTab = 'favor';
                    switchTreasuryTab(currentTreasuryTab);
                }
                break;
            case 'liquidaciones':
                if (typeof loadSettlementTrips === 'function') loadSettlementTrips();
                if (typeof updateLiquidacionesMetrics === 'function') updateLiquidacionesMetrics();
                break;
            case 'ganancias':
                if (typeof loadProfitDashboard === 'function') loadProfitDashboard();
                break;
            case 'catalogos':
                if (typeof loadCatalog === 'function') loadCatalog('choferes');
                break;
            case 'movimientos':
                if (typeof loadMovementsByPeriod === 'function') loadMovementsByPeriod();
                break;
            case 'mantenimientos':
                if (typeof switchMaintTab === 'function') switchMaintTab('unidades');
                break;
            case 'tarifas':
                if (typeof loadRatesList === 'function') loadRatesList();
                break;
            case 'capital':
                if (typeof loadCapitalData === 'function') loadCapitalData();
                break;
            case 'settings-chat':
                if (typeof loadChatSettings === 'function') loadChatSettings();
                break;
        }
        
        // Inicializar catálogos si es necesario
        if (['viajes', 'gastos', 'tesoreria', 'liquidaciones'].includes(sectionId)) {
            initFormCatalogs();
        }
    } catch (err) {
        console.error('Error al cargar la sección ' + sectionId + ':', err);
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
    if (view === 'form' && section === 'gastos') {
        const form = document.getElementById('gasto-form');
        if (form) {
            form.reset();
            isEditingExpense = false;
            editingExpenseId = null;
            const btn = form.querySelector('button[type="submit"]');
            if (btn) btn.innerText = 'Registrar Gasto';
        }
        const lblLive = document.getElementById('lbl-live-yield');
        if (lblLive) lblLive.innerText = '- km/L';
        const lblLast = document.getElementById('lbl-last-yield');
        if (lblLast) lblLast.innerText = '- km/L';
    }
}

async function loadTripsList() {
    const loader = document.getElementById('trips-loader');
    const tbody = document.getElementById('trips-table-body');
    if (loader) loader.classList.remove('hidden');
    if (tbody) tbody.innerHTML = '';

    try {
        await ensureGlobalMapsLoaded();
        allTripsData = await fetchSupabaseData(DB_CONFIG.tableViajes);
        
        const filterDateStartViajes = document.getElementById('filter-date-start-viajes');
        const filterDateEndViajes = document.getElementById('filter-date-end-viajes');
        if (filterDateStartViajes && !filterDateStartViajes.value) {
            filterDateStartViajes.value = getLocalISODate();
        }
        if (filterDateEndViajes && !filterDateEndViajes.value) {
            filterDateEndViajes.value = getLocalISODate();
        }
    } catch (err) {
        console.error('Error loading trips:', err);
    }

    if (loader) loader.classList.add('hidden');
    filterTrips();
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
                <div class="flex items-center gap-2"><i class="fas fa-truck text-blue-500/50 w-3"></i> ${globalUnitMap[v.id_unidad] ? `${globalUnitMap[v.id_unidad]} [${v.id_unidad}]` : (v.id_unidad || '---')}</div>
                <div class="flex items-center gap-2"><i class="fas fa-user-tie text-blue-500/50 w-3"></i> ${globalDriverMap[v.id_chofer] ? `${globalDriverMap[v.id_chofer]} [${v.id_chofer}]` : (v.id_chofer || '---')}</div>
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
    const q = (query || document.getElementById('search-viajes')?.value || '').toLowerCase();
    const startDate = document.getElementById('filter-date-start-viajes')?.value;
    const endDate = document.getElementById('filter-date-end-viajes')?.value;
    
    let filtered = allTripsData;
    
    if (startDate || endDate) {
        filtered = filtered.filter(v => {
            if (!v.fecha) return false;
            const itemDate = v.fecha.split('T')[0];
            if (startDate && itemDate < startDate) return false;
            if (endDate && itemDate > endDate) return false;
            return true;
        });
    }
    
    if (q) {
        filtered = filtered.filter(v => {
            const driverName = (globalDriverMap[v.id_chofer] || '').toLowerCase();
            const unitName = (globalUnitMap[v.id_unidad] || '').toLowerCase();
            return String(v.id_viaje).toLowerCase().includes(q) ||
                   String(v.cliente).toLowerCase().includes(q) ||
                   String(v.id_chofer).toLowerCase().includes(q) ||
                   driverName.includes(q) ||
                   String(v.id_unidad).toLowerCase().includes(q) ||
                   unitName.includes(q);
        });
    }
    renderTripsTable(filtered);
}

// --- CATALOG MANAGEMENT LOGIC ---
let currentCatalog = 'choferes';
let catalogData = [];
let isEditingCatalog = false;
let editingCatalogId = null;

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

    // Parallel fetch: Catalog Data + Expenses (if needed for yield) + Cross-ref Data
    const promises = [fetchSupabaseData(tables[type])];
    
    // Gastos para rendimiento
    if (type === 'choferes' || type === 'unidades') {
        promises.push(fetchSupabaseData(DB_CONFIG.tableGastos));
    } else {
        promises.push(Promise.resolve([]));
    }

    // Datos extra para referencia cruzada
    if (type === 'choferes') {
        promises.push(fetchSupabaseData(DB_CONFIG.tableUnidades));
    } else if (type === 'unidades') {
        promises.push(fetchSupabaseData(DB_CONFIG.tableChoferes));
    } else {
        promises.push(Promise.resolve([]));
    }

    const [data, expenses, crossRef] = await Promise.all(promises);
    catalogData = data;

    if (loader) loader.classList.add('hidden');

    renderCatalogTable(type, catalogData, expenses || [], crossRef || []);
}

function calculateFuelMetrics(id, type, expenses) {
    // Wrapper for Catalog usage
    const m = calculateEntityFuelMetrics(expenses, id, type);
    return {
        last: m.lastStr,
        avg: m.avgStr
    };
}

function renderCatalogTable(type, data, expenses = [], crossRef = []) {
    const thead = document.getElementById('catalog-table-head');
    const tbody = document.getElementById('catalog-table-body');
    if (!thead || !tbody) return;

    const config = {
        'choferes': {
            headers: ['ID', 'Nombre', 'Licencia', 'Unidad Asignada', 'Rendimiento (Último)'],
            row: d => {
                const metrics = calculateFuelMetrics(d.id_chofer, 'choferes', expenses);
                const unit = crossRef.find(u => u.id_unidad === d.id_unidad);
                const unitDisplay = unit ? `${unit.id_unidad} (${unit.nombre_unidad || 'Sin nombre'})` : (d.id_unidad || '<span class="text-slate-600 font-normal">Sin asignar</span>');

                return `<td class="px-6 py-4 font-black text-white text-xs tracking-tight">${d.id_chofer}</td>
                       <td class="px-6 py-4 font-bold text-slate-200 text-xs">${d.nombre}</td>
                       <td class="px-6 py-4 text-slate-400 text-[11px] font-medium">${d.licencia || '-'}</td>
                       <td class="px-6 py-4 text-blue-400 font-black text-xs">${unitDisplay}</td>
                       <td class="px-6 py-4 font-black text-amber-500 text-xs">${metrics.last}</td>`;
            }
        },
        'unidades': {
            headers: ['ID', 'Unidad', 'Placas', 'Chofer Asignado', 'Rendimiento (Último)'],
            row: d => {
                const id = d.id_unidad; // Use ECO ID usually
                const metrics = calculateFuelMetrics(id, 'unidades', expenses);
                const driver = crossRef.find(c => c.id_chofer === d.id_chofer);
                const driverDisplay = driver ? `${driver.nombre} [${driver.id_chofer}]` : (d.id_chofer || '<span class="text-slate-600 font-normal">Sin asignar</span>');

                return `<td class="px-6 py-4 font-black text-white text-xs tracking-tight">${d.id_unidad}</td>
                       <td class="px-6 py-4 font-bold text-slate-200 text-xs">${d.nombre_unidad}</td>
                       <td class="px-6 py-4 text-slate-400 text-[11px] font-medium">${d.placas || '-'}</td>
                       <td class="px-6 py-4 text-emerald-400 font-black text-xs">${driverDisplay}</td>
                       <td class="px-6 py-4 font-black text-amber-500 text-xs">${metrics.last}</td>`;
            }
        },
        'clientes': {
            headers: ['Nombre', 'RFC/Razón Social', 'Contacto'],
            row: d => `<td class="px-6 py-4 font-bold text-slate-200 text-xs">${d.nombre_cliente}</td>
                       <td class="px-6 py-4 font-semibold text-slate-400 text-[11px]">${d.rfc} / ${d.razon_social}</td>
                       <td class="px-6 py-4 text-slate-500 text-[11px]">${d.contacto_nombre} <br/> ${d.email}</td>`
        },
        'proveedores': {
            headers: ['ID', 'Proveedor', 'Tipo', 'Teléfono'],
            row: d => `<td class="px-6 py-4 font-bold text-slate-200 text-xs">${d.id_proveedor}</td>
                       <td class="px-6 py-4 font-semibold text-slate-200 text-xs">${d.nombre_proveedor}</td>
                       <td class="px-6 py-4 text-slate-400 text-[11px]">${d.tipo_proveedor}</td>
                       <td class="px-6 py-4 text-slate-500 text-[11px]">${d.telefono || '-'}</td>`
        }
    };

    const c = config[type];
    thead.innerHTML = `<tr>${c.headers.map(h => `<th class="px-6 py-4">${h}</th>`).join('')}<th class="px-6 py-4">Estatus</th><th class="px-6 py-4 text-right">Acciones</th></tr>`;

    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${c.headers.length + 2}" class="px-6 py-12 text-center text-slate-400 italic">No hay registros aÃºn</td></tr>`;
        return;
    }

    tbody.innerHTML = data.map(d => {
        let id = '';
        if (type === 'choferes') id = d.id_chofer;
        else if (type === 'unidades') id = d.id_unidad;
        else if (type === 'clientes') id = d.nombre_cliente;
        else if (type === 'proveedores') id = d.id_proveedor;
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
                    <button onclick="showCatalogForm('${id}')" class="text-blue-500 hover:text-blue-700 p-1" title="Editar Registro"><i class="fas fa-edit"></i></button>
                    <button onclick="deleteItem('${DB_CONFIG['table' + type.charAt(0).toUpperCase() + type.slice(1)]}', '${id}', '${idCol}')" class="text-red-500 hover:text-red-700 p-1"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `;
    }).join('');
}

async function deleteItem(table, id, idCol) {
    if (!confirm('¿Desea eliminar definitivamente este registro?')) return;
    try {
        const { error } = await window.supabaseClient.from(table).delete().eq(idCol, id);
        if (error) throw error;
        alert('Registro eliminado.');
        location.reload(); // Recarga simple para actualizar listas
    } catch (err) {
        alert('Error al eliminar: ' + err.message);
    }
}

function showCatalogForm(itemId = null) {
    document.getElementById('catalog-list-view').classList.add('hidden');
    document.getElementById('catalog-form-view').classList.remove('hidden');

    const fieldsContainer = document.getElementById('catalog-form-fields');
    const submitBtn = document.querySelector('#catalog-form button[type="submit"]');

    if (itemId && itemId !== '[object MouseEvent]') {
        isEditingCatalog = true;
        editingCatalogId = itemId;
        if (submitBtn) submitBtn.innerText = 'Actualizar Registro';
    } else {
        isEditingCatalog = false;
        editingCatalogId = null;
        if (submitBtn) submitBtn.innerText = 'Guardar Registro';
    }

    const config = {
        'choferes': [
            { id: 'id_chofer', label: 'ID Chofer', type: 'text', placeholder: 'CHO-01', readonly: isEditingCatalog },
            { id: 'nombre', label: 'Nombre Completo', type: 'text', placeholder: 'Nombre Apellido' },
            { id: 'licencia', label: 'Num. Licencia', type: 'text', placeholder: 'LIC-000' },
            { id: 'telefono', label: 'Teléfono', type: 'tel', placeholder: '55 0000 0000' },
            { id: 'id_unidad', label: 'Unidad Asignada (ID ECO)', type: 'text', placeholder: 'ECO-01' },
            { id: 'estatus', label: 'Estatus', type: 'select', options: ['Activo', 'Inactivo'] }
        ],
        'unidades': [
            { id: 'id_unidad', label: 'ID Unidad (ECO)', type: 'text', placeholder: 'ECO-01', readonly: isEditingCatalog },
            { id: 'nombre_unidad', label: 'Nombre/Alias', type: 'text', placeholder: 'Kenworth T680' },
            { id: 'placas', label: 'Placas', type: 'text', placeholder: '00-AA-00' },
            { id: 'modelo', label: 'Modelo', type: 'text', placeholder: '2024' },
            { id: 'marca', label: 'Marca', type: 'text', placeholder: 'Freightliner' },
            { id: 'id_chofer', label: 'Chofer Asignado (ID)', type: 'text', placeholder: 'CHO-01' },
            { id: 'registra_combustible', label: '¿Lleva registro de diésel/rendimiento?', type: 'select', options: [
                { value: 'true', label: 'Sí' },
                { value: 'false', label: 'No' }
            ]},
            { id: 'estatus', label: 'Estatus', type: 'select', options: ['Activo', 'Inactivo'] }
        ],
        'clientes': [
            { id: 'nombre_cliente', label: 'Nombre Comercial', type: 'text', placeholder: 'Empresa S.A.', readonly: isEditingCatalog },
            { id: 'id_cliente', label: 'ID Cliente (Opcional)', type: 'text', placeholder: 'CLI-01' },
            { id: 'razon_social', label: 'Razón Social', type: 'text', placeholder: 'Logística Total S.A. de C.V.' },
            { id: 'rfc', label: 'RFC', type: 'text', placeholder: 'RFC000000AAA' },
            { id: 'contacto_nombre', label: 'Nombre de Contacto', type: 'text', placeholder: 'Juan Pérez' },
            { id: 'email', label: 'Email', type: 'email', placeholder: 'contacto@empresa.com' },
            { id: 'telefono', label: 'Teléfono', type: 'tel', placeholder: '55 0000 0000' },
            { id: 'estatus', label: 'Estatus', type: 'select', options: ['Activo', 'Inactivo'] }
        ],
        'proveedores': [
            { id: 'id_proveedor', label: 'ID Proveedor', type: 'text', placeholder: 'PROV-01', readonly: isEditingCatalog },
            { id: 'nombre_proveedor', label: 'Nombre/Razón Social', type: 'text', placeholder: 'Gasolinera Plus' },
            { id: 'tipo_proveedor', label: 'Tipo Proveedor', type: 'text', placeholder: 'Diesel / Refacciones' },
            { id: 'telefono', label: 'Teléfono', type: 'tel', placeholder: '55 0000 0000' },
            { id: 'estatus', label: 'Estatus', type: 'select', options: ['Activo', 'Inactivo'] }
        ]
    };

    let itemData = null;
    if (isEditingCatalog && editingCatalogId) {
        itemData = catalogData.find(d => {
            if (currentCatalog === 'choferes') return d.id_chofer === editingCatalogId;
            if (currentCatalog === 'unidades') return d.id_unidad === editingCatalogId;
            if (currentCatalog === 'clientes') return d.nombre_cliente === editingCatalogId;
            if (currentCatalog === 'proveedores') return d.id_proveedor === editingCatalogId;
            return false;
        });
    }

    fieldsContainer.innerHTML = config[currentCatalog].map(f => {
        let val = '';
        if (itemData) {
            if (f.id === 'registra_combustible') {
                val = itemData[f.id] !== false ? 'true' : 'false';
            } else {
                val = itemData[f.id] !== undefined && itemData[f.id] !== null ? itemData[f.id] : '';
            }
        } else {
            // Default value for registra_combustible when creating new
            if (f.id === 'registra_combustible') val = 'true';
            else if (f.id === 'estatus') val = 'Activo';
        }

        const readonlyAttr = f.readonly ? 'readonly cursor-not-allowed bg-slate-800/40 text-slate-400 font-semibold' : '';

        if (f.type === 'select') {
            const opts = f.options.map(o => {
                const optVal = typeof o === 'string' ? o : o.value;
                const optLabel = typeof o === 'string' ? o : o.label;
                const selected = String(val) === String(optVal) ? 'selected' : '';
                return `<option value="${optVal}" class="bg-slate-900 text-white">${optLabel}</option>`;
            }).join('');

            return `
                <div>
                    <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">${f.label}</label>
                    <select id="${f.id}" required class="w-full px-5 py-3.5 rounded-2xl input-dark outline-none cursor-pointer ${readonlyAttr}">
                        ${opts}
                    </select>
                </div>
            `;
        }

        return `
            <div>
                <label class="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">${f.label}</label>
                <input type="${f.type}" id="${f.id}" required placeholder="${f.placeholder}" value="${val}" ${f.readonly ? 'readonly' : ''}
                    class="w-full px-5 py-3.5 rounded-2xl input-dark outline-none ${readonlyAttr}">
            </div>
        `;
    }).join('');
}

function hideCatalogForm() {
    document.getElementById('catalog-list-view').classList.remove('hidden');
    document.getElementById('catalog-form-view').classList.add('hidden');
    isEditingCatalog = false;
    editingCatalogId = null;
}

async function handleCatalogSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    btn.disabled = true;

    try {
        const payload = {};
        const inputs = e.target.querySelectorAll('input, select');
        inputs.forEach(input => {
            if (input.id) {
                if (input.id === 'registra_combustible') {
                    payload[input.id] = input.value === 'true';
                } else {
                    payload[input.id] = input.value;
                }
            }
        });

        if (payload.estatus === undefined) {
            payload.estatus = 'Activo';
        }

        const tableName = 'table' + currentCatalog.charAt(0).toUpperCase() + currentCatalog.slice(1);
        const table = DB_CONFIG[tableName];
        
        if (!table) throw new Error('Tabla no configurada para ' + currentCatalog);

        let error;
        if (isEditingCatalog && editingCatalogId) {
            const idCol = currentCatalog === 'choferes' ? 'id_chofer' : (currentCatalog === 'unidades' ? 'id_unidad' : (currentCatalog === 'clientes' ? 'nombre_cliente' : 'id_proveedor'));
            const { error: updateError } = await window.supabaseClient
                .from(table)
                .update(payload)
                .eq(idCol, editingCatalogId);
            error = updateError;
        } else {
            const { error: insertError } = await window.supabaseClient
                .from(table)
                .insert([payload]);
            error = insertError;
        }

        if (error) throw error;

        hideCatalogForm();
        e.target.reset();
        await loadCatalog(currentCatalog);

    } catch (err) {
        console.error('Error guardando registro:', err);
        alert('Error al guardar: ' + err.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

window.calcLitrosTotales = function () {
    const t = parseFloat(document.getElementById('Litros_Tracto')?.value) || 0;
    const r = parseFloat(document.getElementById('Litros_Termo')?.value) || 0;
    const chkTracto = document.getElementById('chk-tracto')?.checked;
    const chkTermo = document.getElementById('chk-termo')?.checked;

    let sum = 0;
    if (chkTracto) sum += t;
    if (chkTermo) sum += r;

    const el = document.getElementById('Litros_Rellenados');
    if (el) el.value = sum > 0 ? sum.toFixed(1) : '';

    if (typeof window.updateLiveYield === 'function') {
        window.updateLiveYield();
    }
};

window.updateLiveYield = function () {
    const kmRecInput = document.getElementById('Kmts_Recorridos');
    const t = parseFloat(document.getElementById('Litros_Tracto')?.value) || 0;
    const r = parseFloat(document.getElementById('Litros_Termo')?.value) || 0;
    const chkTracto = document.getElementById('chk-tracto')?.checked;
    const chkTermo = document.getElementById('chk-termo')?.checked;
    const litrosRellenados = parseFloat(document.getElementById('Litros_Rellenados')?.value) || 0;

    const kmRec = parseFloat(kmRecInput?.value) || 0;
    const lbl = document.getElementById('lbl-live-yield');
    if (!lbl) return;

    // Determinamos volumen efectivo
    let effectiveVol = 0;
    let onlyTermo = false;

    if (chkTracto || chkTermo) {
        if (chkTracto) {
            effectiveVol = t;
        } else {
            // Solo termo
            onlyTermo = true;
        }
    } else {
        effectiveVol = litrosRellenados;
    }

    if (onlyTermo) {
        lbl.innerHTML = `<span class="text-xs text-amber-400 font-bold uppercase">N/A (Solo Termo)</span>`;
    } else if (effectiveVol > 0 && kmRec > 0) {
        const yieldVal = kmRec / effectiveVol;
        lbl.innerText = `${yieldVal.toFixed(2)} km/L`;
    } else {
        lbl.innerText = `- km/L`;
    }
};


window.updateLastYieldDisplay = async function (unitId) {
    const lbl = document.getElementById('lbl-last-yield');
    if (!lbl) return;

    if (!unitId) {
        lbl.innerText = '- km/L';
        return;
    }

    lbl.innerText = 'Cargando...';

    try {
        const { data, error } = await window.supabaseClient
            .from(DB_CONFIG.tableGastos)
            .select('kmts_recorridos, litros_tracto, litros_rellenados, litros_termo, concepto')
            .eq('id_unidad', unitId)
            .eq('concepto', 'Diesel')
            .order('fecha', { ascending: false })
            .limit(10);

        if (error) throw error;

        let lastYield = null;
        if (data && data.length > 0) {
            for (const g of data) {
                const tractoSupport = (parseFloat(g.litros_tracto) > 0 || parseFloat(g.litros_termo) > 0);
                const effectiveVol = tractoSupport ? (parseFloat(g.litros_tracto) || 0) : (parseFloat(g.litros_rellenados) || 0);
                const km = parseFloat(g.kmts_recorridos) || 0;
                if (effectiveVol > 0 && km > 0) {
                    lastYield = km / effectiveVol;
                    break;
                }
            }
        }

        if (lastYield !== null) {
            lbl.innerText = `${lastYield.toFixed(2)} km/L`;
        } else {
            lbl.innerText = 'N/A';
        }
    } catch (err) {
        console.error('Error fetching last yield:', err);
        lbl.innerText = 'Error';
    }
};


async function loadExpensesList() {
    const loader = document.getElementById('expenses-loader');
    const tbody = document.getElementById('expenses-table-body');
    if (loader) loader.classList.remove('hidden');
    if (tbody) tbody.innerHTML = '';

    try {
        await ensureGlobalMapsLoaded();
        allExpensesData = await fetchSupabaseData(DB_CONFIG.tableGastos);
        
        const filterDateStartGastos = document.getElementById('filter-date-start-gastos');
        const filterDateEndGastos = document.getElementById('filter-date-end-gastos');
        if (filterDateStartGastos && !filterDateStartGastos.value) {
            filterDateStartGastos.value = getLocalISODate();
        }
        if (filterDateEndGastos && !filterDateEndGastos.value) {
            filterDateEndGastos.value = getLocalISODate();
        }
    } catch (err) {
        console.error('Error loading expenses:', err);
    }

    // Update pending count
    const pendingCount = allExpensesData.filter(g => g.estatus_aprobacion === 'Pendiente').length;
    const badge = document.getElementById('pending-expenses-count');
    if (badge) {
        badge.innerText = pendingCount;
        badge.classList.toggle('hidden', pendingCount === 0);
    }

    if (loader) loader.classList.add('hidden');
    filterExpenses();
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

    filterExpenses();
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
                    <div class="text-sm font-semibold text-slate-700">Viaje: ${g.id_viaje || '---'}</div>
                    <div class="text-[10px] text-slate-400">Unidad: ${globalUnitMap[g.id_unidad] ? `${globalUnitMap[g.id_unidad]} [${g.id_unidad}]` : (g.id_unidad || '---')}</div>
                </td>
                <td class="px-6 py-4 text-sm text-slate-600">
                    <div class="font-bold text-slate-800 text-sm">${g.concepto}</div>
                    <div class="text-[10px] text-slate-400">Chofer: ${globalDriverMap[g.id_chofer] ? `${globalDriverMap[g.id_chofer]} [${g.id_chofer}]` : (g.id_chofer || '---')}</div>
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
    if (!confirm('¿Aprobar este gasto?')) return;
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
    const q = (query || document.getElementById('search-gastos')?.value || '').toLowerCase();
    const startDate = document.getElementById('filter-date-start-gastos')?.value;
    const endDate = document.getElementById('filter-date-end-gastos')?.value;
    
    let filtered = allExpensesData;
    
    if ((startDate || endDate) && currentExpenseTab !== 'pendientes') {
        filtered = filtered.filter(g => {
            if (!g.fecha) return false;
            const itemDate = g.fecha.split('T')[0];
            if (startDate && itemDate < startDate) return false;
            if (endDate && itemDate > endDate) return false;
            return true;
        });
    }
    
    if (q) {
        filtered = filtered.filter(g => {
            const driverName = (globalDriverMap[g.id_chofer] || '').toLowerCase();
            const unitName = (globalUnitMap[g.id_unidad] || '').toLowerCase();
            return String(g.id_viaje).toLowerCase().includes(q) ||
                   String(g.concepto).toLowerCase().includes(q) ||
                   String(g.id_chofer).toLowerCase().includes(q) ||
                   driverName.includes(q) ||
                   String(g.id_unidad).toLowerCase().includes(q) ||
                   unitName.includes(q) ||
                   String(g.id_unit_eco).toLowerCase().includes(q);
        });
    }
    renderExpensesTable(filtered);
}

// --- TESORERÃA LOGIC ---

// --- TESORERÃA LOGIC (3-TAB REFACTOR) ---

let currentTreasuryTab = 'favor';

async function initTreasuryHistoryFilters() {
    await ensureGlobalMapsLoaded();
    
    const choferSelect = document.getElementById('t-hist-chofer');
    const unidadSelect = document.getElementById('t-hist-unidad');
    
    if (choferSelect && choferSelect.children.length <= 1) {
        choferSelect.innerHTML = '<option value="" class="bg-slate-900">Todos los Choferes</option>' + 
            Object.entries(globalDriverMap).map(([id, nombre]) => {
                return `<option value="${id}" class="bg-slate-900">${nombre}</option>`;
            }).join('');
    }
    
    if (unidadSelect && unidadSelect.children.length <= 1) {
        unidadSelect.innerHTML = '<option value="" class="bg-slate-900">Todas las Unidades</option>' + 
            Object.entries(globalUnitMap).map(([id, nombre]) => {
                return `<option value="${id}" class="bg-slate-900">${nombre}</option>`;
            }).join('');
    }
}

async function switchTreasuryTab(tab) {
    currentTreasuryTab = tab;

    // Actualizar estilos de tabs con null-check
    document.querySelectorAll('.treasury-tab').forEach(btn => {
        btn.classList.remove('bg-blue-600', 'text-white', 'shadow-sm', 'shadow-blue-600/20');
        btn.classList.add('text-slate-500');
    });
    const activeBtn = document.getElementById('t-tab-' + tab);
    if (activeBtn) {
        activeBtn.classList.remove('text-slate-500');
        activeBtn.classList.add('bg-blue-600', 'text-white', 'shadow-sm');
    }

    const filtersDiv = document.getElementById('treasury-history-filters');
    if (filtersDiv) {
        if (tab === 'historial') {
            filtersDiv.classList.remove('hidden');
            await initTreasuryHistoryFilters();
        } else {
            filtersDiv.classList.add('hidden');
        }
    }

    renderTreasuryHeader(tab);
    await loadTreasuryList();
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
            <th class="px-6 py-4">Acción</th>
        </tr>`;
    } else if (tab === 'historial') {
        html = `<tr>
            <th class="px-6 py-4">Fecha / ID / Tipo</th>
            <th class="px-6 py-4">Actor / Concepto / Unidad</th>
            <th class="px-6 py-4">Monto</th>
            <th class="px-6 py-4">Estatus</th>
            <th class="px-6 py-4">Acción</th>
        </tr>`;
    } else {
        html = `<tr>
            <th class="px-6 py-4">Fecha / ID</th>
            <th class="px-6 py-4">Actor / Concepto</th>
            <th class="px-6 py-4">Monto</th>
            <th class="px-6 py-4">Estatus</th>
            <th class="px-6 py-4">Acción</th>
        </tr>`;
    }
    thead.innerHTML = html;
}

async function loadTreasuryList() {
    const tbody = document.getElementById('treasury-table-body');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="p-10 text-center text-slate-400"><i class="fas fa-spinner fa-spin mr-2"></i>Cargando...</td></tr>';

    try {
        let data = [];
        if (currentTreasuryTab === 'viajes') {
            const allTrips = await fetchSupabaseData(DB_CONFIG.tableViajes);
            data = allTrips.filter(v => v.estatus_pago !== 'Pagado');
        } else if (currentTreasuryTab === 'favor' || currentTreasuryTab === 'contra') {
            const type = currentTreasuryTab === 'favor' ? 'A Favor' : 'En Contra';
            const allData = await fetchSupabaseData(DB_CONFIG.tableCuentas);
            data = allData.filter(c => c.tipo === type && c.estatus !== 'Liquidado');
        } else if (currentTreasuryTab === 'historial') {
            // Historial: Cuentas liquidadas + Viajes pagados
            const [allCuentas, allTrips] = await Promise.all([
                fetchSupabaseData(DB_CONFIG.tableCuentas),
                fetchSupabaseData(DB_CONFIG.tableViajes)
            ]);

            const liquidatedCuentas = allCuentas.filter(c => c.estatus === 'Liquidado').map(c => ({
                isAccount: true,
                id: c.id_cuenta,
                fecha: c.fecha,
                actor: c.actor_nombre,
                concepto: c.concepto,
                tipo: c.tipo,
                monto: parseFloat(c.monto) || 0,
                estatus: c.estatus,
                id_unidad: c.id_unidad,
                id_chofer: globalDriverMap[c.actor_nombre] ? c.actor_nombre : null
            }));

            const paidTrips = allTrips.filter(v => v.estatus_pago === 'Pagado').map(v => ({
                isAccount: false,
                id: v.id_viaje,
                fecha: v.fecha,
                actor: v.id_chofer,
                concepto: `Viaje: ${v.id_viaje} - Cliente: ${v.cliente}`,
                tipo: 'Viaje (Cobro)',
                monto: parseFloat(v.monto_flete) || 0,
                estatus: v.estatus_pago,
                id_unidad: v.id_unidad,
                id_chofer: v.id_chofer
            }));

            let unified = [...liquidatedCuentas, ...paidTrips];

            // Aplicar filtros de Historial
            const startDate = document.getElementById('t-hist-start')?.value;
            const endDate = document.getElementById('t-hist-end')?.value;
            const filterChofer = document.getElementById('t-hist-chofer')?.value;
            const filterUnidad = document.getElementById('t-hist-unidad')?.value;

            if (startDate) {
                unified = unified.filter(i => i.fecha && i.fecha.split('T')[0] >= startDate);
            }
            if (endDate) {
                unified = unified.filter(i => i.fecha && i.fecha.split('T')[0] <= endDate);
            }
            if (filterChofer) {
                unified = unified.filter(i => i.id_chofer === filterChofer);
            }
            if (filterUnidad) {
                unified = unified.filter(i => i.id_unidad === filterUnidad);
            }

            // Ordenar por fecha descendente
            unified.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
            data = unified;
        }

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="p-10 text-center text-slate-500 italic">No hay registros en esta categoría.</td></tr>';
            updateTreasurySummary();
            return;
        }

        if (currentTreasuryTab === 'historial') {
            tbody.innerHTML = data.map(item => {
                const tipoColor = item.tipo === 'A Favor' ? 'text-green-400 bg-green-500/10 border-green-500/10' : 
                                  item.tipo === 'En Contra' ? 'text-red-400 bg-red-500/10 border-red-500/10' : 
                                  'text-blue-400 bg-blue-500/10 border-blue-500/10';
                return `
                    <tr class="hover:bg-white/[0.02] transition-colors border-b border-white/5 last:border-0">
                        <td class="px-6 py-4">
                            <div class="font-bold text-white text-xs">${item.id || '-'}</div>
                            <div class="text-[9px] text-slate-500 font-mono mt-0.5">${item.fecha || ''}</div>
                            <span class="inline-block mt-1 border px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${tipoColor}">${item.tipo}</span>
                        </td>
                        <td class="px-6 py-4">
                            <div class="text-sm font-bold text-slate-200">
                                ${globalDriverMap[item.actor] ? `${globalDriverMap[item.actor]} (${item.actor})` : (item.actor || '-')}
                            </div>
                            <div class="flex flex-wrap items-center gap-1.5 mt-1">
                                ${item.id_unidad ? `<span class="bg-blue-500/10 text-blue-400 border border-blue-500/10 text-[9px] px-1.5 py-0.5 rounded font-black uppercase flex items-center gap-1"><i class="fas fa-truck text-[8px]"></i>${globalUnitMap[item.id_unidad] || item.id_unidad}</span>` : ''}
                                <span class="text-[10px] text-slate-500 italic">${item.concepto || ''}</span>
                            </div>
                        </td>
                        <td class="px-6 py-4 font-bold text-white">$${item.monto.toLocaleString()}</td>
                        <td class="px-6 py-4">
                            <span class="text-[10px] font-bold text-green-500">● ${item.estatus}</span>
                        </td>
                        <td class="px-6 py-4">
                            ${item.isAccount ? 
                              `<button onclick="revertAccountLiquidation('${item.id}')" class="text-xs text-amber-500 hover:underline"><i class="fas fa-undo mr-1"></i>Revertir</button>` :
                              `<button onclick="markTripAsUnpaid('${item.id}')" class="text-xs text-amber-500 hover:underline"><i class="fas fa-undo mr-1"></i>Revertir</button>`
                            }
                        </td>
                        <td class="px-6 py-4 text-right space-x-1">
                            ${item.isAccount ? 
                              `<button onclick="deleteItem('${DB_CONFIG.tableCuentas}','${item.id}','id_cuenta')" class="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"><i class="fas fa-trash text-xs"></i></button>` :
                              `<button onclick="deleteItem('${DB_CONFIG.tableViajes}','${item.id}','id_viaje')" class="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"><i class="fas fa-trash text-xs"></i></button>`
                            }
                        </td>
                    </tr>`;
            }).join('');
        } else {
            tbody.innerHTML = data.map(item => {
                if (currentTreasuryTab === 'viajes') {
                    const isPaid = item.estatus_pago === 'Pagado';
                    return `
                        <tr class="hover:bg-white/[0.02] transition-colors border-b border-white/5 last:border-0">
                            <td class="px-6 py-4">
                                <div class="font-black text-white text-xs tracking-tight">${item.no_interno || 'S/N'}</div>
                                <div class="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-1">${item.fecha || ''}</div>
                            </td>
                            <td class="px-6 py-4">
                                <div class="text-xs font-black text-slate-200 tracking-tight">${item.cliente || '-'}</div>
                                <div class="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5 italic">${item.id_viaje || ''}</div>
                            </td>
                            <td class="px-6 py-4 font-bold text-white">$${(parseFloat(item.monto_flete) || 0).toLocaleString()}</td>
                            <td class="px-6 py-4">
                                <span class="text-[10px] font-bold ${isPaid ? 'text-green-500' : 'text-amber-500'}">● ${item.estatus_pago || 'Pendiente'}</span>
                            </td>
                            <td class="px-6 py-4">
                                ${!isPaid ? 
                                    `<button onclick="markTripAsPaid('${item.id_viaje}')" class="text-xs text-blue-500 hover:underline"><i class="fas fa-check mr-1"></i>Marcar Pagado</button>` : 
                                    `<button onclick="markTripAsUnpaid('${item.id_viaje}')" class="text-xs text-amber-500 hover:underline"><i class="fas fa-undo mr-1"></i>Marcar No Pagado</button>`
                                }
                            </td>
                            <td class="px-6 py-4 text-right space-x-1">
                                <button onclick="editTrip('${item.id_viaje}')" class="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-all"><i class="fas fa-edit text-xs"></i></button>
                                <button onclick="showDetailModal('viajes','${item.id_viaje}')" class="w-7 h-7 rounded-lg bg-white/5 text-slate-400 hover:bg-white/10 transition-all"><i class="fas fa-eye text-xs"></i></button>
                                <button onclick="deleteItem('${DB_CONFIG.tableViajes}','${item.id_viaje}','id_viaje')" class="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"><i class="fas fa-trash text-xs"></i></button>
                            </td>
                        </tr>`;
                } else {
                    const monto = parseFloat(item.monto) || 0;
                    const isLiquidated = item.estatus === 'Liquidado';
                    return `
                        <tr class="hover:bg-white/[0.02] transition-colors border-b border-white/5 last:border-0">
                            <td class="px-6 py-4">
                                <div class="font-bold text-white text-xs">${item.id_cuenta || '-'}</div>
                                <div class="text-[10px] text-slate-500 font-mono">${item.fecha || ''}</div>
                            </td>
                            <td class="px-6 py-4">
                                <div class="text-sm font-bold text-slate-200">
                                    ${globalDriverMap[item.actor_nombre] ? `${globalDriverMap[item.actor_nombre]} (${item.actor_nombre})` : (item.actor_nombre || '-')}
                                </div>
                                <div class="flex flex-wrap items-center gap-1.5 mt-1">
                                    ${item.id_unidad ? `<span class="bg-blue-500/10 text-blue-400 border border-blue-500/10 text-[9px] px-1.5 py-0.5 rounded font-black uppercase flex items-center gap-1"><i class="fas fa-truck text-[8px]"></i>${globalUnitMap[item.id_unidad] || item.id_unidad}</span>` : ''}
                                    <span class="text-[10px] text-slate-500 italic">${item.concepto || ''}</span>
                                </div>
                            </td>
                            <td class="px-6 py-4 font-bold text-white">$${monto.toLocaleString()}</td>
                            <td class="px-6 py-4">
                                <span class="text-[10px] font-bold ${isLiquidated ? 'text-green-500' : 'text-amber-500'}">● ${item.estatus || 'Pendiente'}</span>
                            </td>
                            <td class="px-6 py-4">
                                ${!isLiquidated ? `<button onclick="markAccountLiquidated('${item.id_cuenta}')" class="text-xs text-green-500 hover:underline">Liquidar</button>` : '<span class="text-slate-500">-</span>'}
                            </td>
                            <td class="px-6 py-4 text-right space-x-1">
                                ${(item.id_cuenta || '').startsWith('ACC-') ? `<button onclick="editAccount('${item.id_cuenta}')" class="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-all"><i class="fas fa-edit text-xs"></i></button>` : '<span class="w-7 h-7 inline-block"></span>'}
                                <button onclick="deleteItem('${DB_CONFIG.tableCuentas}','${item.id_cuenta}','id_cuenta')" class="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"><i class="fas fa-trash text-xs"></i></button>
                            </td>
                        </tr>`;
                }
            }).join('');
        }

        updateTreasurySummary();
    } catch (err) {
        console.error('Error en loadTreasuryList:', err);
        tbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-red-400 font-bold"><i class="fas fa-exclamation-triangle mr-2"></i>Error al cargar: ${err.message}</td></tr>`;
    }
}

// Variables globales para edición de cuenta
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

    await showAccountForm();

    // Llenar formulario
    document.getElementById('acc-tipo').value = account.tipo;
    document.getElementById('acc-fecha').value = account.fecha;
    document.getElementById('acc-concepto').value = account.concepto;
    document.getElementById('acc-monto').value = account.monto;
    document.getElementById('acc-id-viaje-cta').value = account.id_viaje || '';

    const choferSelect = document.getElementById('acc-chofer');
    const unidadSelect = document.getElementById('acc-unidad');
    const actorInput = document.getElementById('acc-actor');

    if (choferSelect && globalDriverMap[account.actor_nombre]) {
        choferSelect.value = account.actor_nombre;
    } else if (choferSelect) {
        choferSelect.value = '';
    }

    if (unidadSelect) {
        unidadSelect.value = account.id_unidad || '';
    }

    if (actorInput) {
        if (!globalDriverMap[account.actor_nombre]) {
            actorInput.value = account.actor_nombre || '';
        } else {
            actorInput.value = '';
        }
    }

    // Cambiar texto botón
    const btn = document.querySelector('#account-form button[type="submit"]');
    if (btn) btn.innerText = 'Actualizar Cuenta';
}

async function updateTreasurySummary() {
    // Calcular totales globales independientemente de la pestaña
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
        // Podríamos usar allTripsData si ya se cargó, o hacer fetch
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
        console.error('Error actualizando resumen tesorería:', err);
    }
}
// This line was incorrectly placed in the original instruction, it should not be here.
// The `|| '<tr><td colspan="6" class="p-10 text-center text-slate-400">No hay registros en esta categoría</td></tr>'`
// belongs to the `tbody.innerHTML = ...` assignment.
// The correct placement is already handled by the `join('')` part.

// The original lines for tab-specific totals should remain:
// if (currentTreasuryTab === 'favor') document.getElementById('total-favor').innerText = `$${ total.toLocaleString() }`;
// if (currentTreasuryTab === 'contra') document.getElementById('total-contra').innerText = `$${ total.toLocaleString() }`;

// These lines are now correctly placed after the `updateTreasurySummary()` call within `loadTreasuryList`.

async function markTripAsPaid(id_viaje) {
    if (!confirm('¿Desea marcar este viaje como pagado por el cliente?')) return;
    try {
        // 1. Obtener datos del viaje para el registro de movimiento
        const { data: trip } = await window.supabaseClient
            .from(DB_CONFIG.tableViajes)
            .select('*')
            .eq('id_viaje', id_viaje)
            .single();

        // 2. Actualizar estatus del viaje
        const { error } = await window.supabaseClient
            .from(DB_CONFIG.tableViajes)
            .update({ estatus_pago: 'Pagado' })
            .eq('id_viaje', id_viaje);

        if (error) throw error;

        // 3. Crear un registro de "Cobro" en reg_cuentas para que aparezca en movimientos
        if (trip) {
            const paymentData = {
                id_cuenta: 'COB-' + Date.now().toString().slice(-6),
                fecha: (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })(),
                tipo: 'A Favor',
                actor_nombre: trip.cliente || 'Cliente Genérico',
                concepto: 'Cobro de Flete: ' + (trip.no_interno || trip.id_viaje),
                monto: parseFloat(trip.monto_flete) || 0,
                id_viaje: id_viaje,
                estatus: 'Liquidado' // Se marca como liquidado de inmediato porque es el registro del pago
            };
            await window.supabaseClient.from(DB_CONFIG.tableCuentas).insert([paymentData]);
        }

        alert('✅ Viaje marcado como pagado y movimiento registrado.');
        loadTreasuryList();
        if (typeof updateMovementsList === 'function') updateMovementsList(); 
    } catch (err) {
        alert('❌ Error: ' + err.message);
    }
}

async function markTripAsUnpaid(id_viaje) {
    if (!confirm('¿Desea marcar este viaje como NO pagado por el cliente? (Se eliminará el registro de cobro asociado)')) return;
    try {
        // 1. Actualizar estatus del viaje a Pendiente
        const { error } = await window.supabaseClient
            .from(DB_CONFIG.tableViajes)
            .update({ estatus_pago: 'Pendiente' })
            .eq('id_viaje', id_viaje);

        if (error) throw error;

        // 2. Eliminar el registro de cobro automático asociado
        const { error: delError } = await window.supabaseClient
            .from(DB_CONFIG.tableCuentas)
            .delete()
            .eq('id_viaje', id_viaje)
            .like('id_cuenta', 'COB-%');

        if (delError) {
            console.error('Error eliminando cobro asociado:', delError);
        }

        alert('✅ Viaje marcado como NO pagado y registro de cobro eliminado.');
        loadTreasuryList();
        if (typeof updateMovementsList === 'function') updateMovementsList();
    } catch (err) {
        alert('❌ Error: ' + err.message);
    }
}

// La función obsoleta loadActorOptions ha sido removida y reemplazada por initTreasuryFormCatalogs.

async function prepareAdvance(viajeId, choferId) {
    showSection('tesoreria');
    switchTreasuryTab('favor');
    await showAccountForm();

    // Resetear form primero
    const form = document.getElementById('account-form');
    if (form) form.reset();

    // Pre-llenar datos
    document.getElementById('acc-tipo').value = 'A Favor';
    const d = new Date();
    document.getElementById('acc-fecha').value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    
    const viajeInput = document.getElementById('acc-id-viaje-cta');
    if (viajeInput) viajeInput.value = viajeId;

    // Configurar Chofer
    const choferSelect = document.getElementById('acc-chofer');
    if (choferSelect) {
        choferSelect.value = choferId;
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

async function initTreasuryFormCatalogs() {
    await ensureGlobalMapsLoaded();
    
    const choferSelect = document.getElementById('acc-chofer');
    const unidadSelect = document.getElementById('acc-unidad');
    
    if (choferSelect) {
        choferSelect.innerHTML = '<option value="" class="bg-slate-900">Ninguno (No ligar a liquidación)</option>' + 
            Object.entries(globalDriverMap).map(([id, nombre]) => {
                return `<option value="${id}" class="bg-slate-900">${nombre} (${id})</option>`;
            }).join('');
    }
    
    if (unidadSelect) {
        unidadSelect.innerHTML = '<option value="" class="bg-slate-900">Ninguna</option>' + 
            Object.entries(globalUnitMap).map(([id, nombre]) => {
                return `<option value="${id}" class="bg-slate-900">${nombre} (${id})</option>`;
            }).join('');
    }
}

async function showAccountForm() { 
    toggleSectionView('treasury', 'form'); 
    await initTreasuryFormCatalogs(); 
    const d = new Date();
    document.getElementById('acc-fecha').value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function hideAccountForm() { toggleSectionView('treasury', 'list'); }

async function enviarCuenta(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const original = btn.innerText;

    try {
        btn.disabled = true;
        btn.innerText = 'Guardando...';

        const getVal = id => document.getElementById(id)?.value || '';
        const choferId = getVal('acc-chofer');
        const unidadId = getVal('acc-unidad');
        const actorManual = getVal('acc-actor');

        if (!choferId && !unidadId && !actorManual) {
            throw new Error('Debe especificar al menos un chofer, una unidad o un actor manual.');
        }

        let actor = '';
        if (choferId) {
            actor = choferId;
        } else if (actorManual) {
            actor = actorManual;
        } else if (unidadId) {
            actor = unidadId;
        }

        const data = {
            fecha: getVal('acc-fecha') || (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })(),
            tipo: getVal('acc-tipo'),
            actor_nombre: actor,
            concepto: getVal('acc-concepto'),
            monto: parseFloat(getVal('acc-monto')) || 0,
            id_viaje: getVal('acc-id-viaje-cta') || null,
            id_unidad: unidadId || null,
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

        alert(isEditingAccount ? 'âœ… Cuenta actualizada.' : 'âœ… Cuenta registrada con éxito.');
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
    if (!confirm('¿Desea marcar esta cuenta como liquidada?')) return;

    // 1. Obtener datos de la cuenta para ver si está ligada a un gasto
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
        // 2. Si la cuenta era un gasto a crédito, marcar el gasto como pagado
        if (account && account.id_gasto_ref) {
            await window.supabaseClient
                .from(DB_CONFIG.tableGastos)
                .update({ estatus_pago: 'Pagado' })
                .eq('id_gasto', account.id_gasto_ref);
        }
        loadTreasuryList();
    }
}

async function revertAccountLiquidation(id) {
    if (!confirm('¿Desea revertir la liquidación de esta cuenta?')) return;

    // 1. Obtener datos de la cuenta para ver si está ligada a un gasto
    const { data: account } = await window.supabaseClient
        .from(DB_CONFIG.tableCuentas)
        .select('*')
        .eq('id_cuenta', id)
        .single();

    const { error } = await window.supabaseClient
        .from(DB_CONFIG.tableCuentas)
        .update({ estatus: 'No Liquidado' })
        .eq('id_cuenta', id);

    if (error) {
        alert('Error: ' + error.message);
    } else {
        // 2. Si la cuenta era un gasto a crédito, revertir también el gasto a Pendiente
        if (account && account.id_gasto_ref) {
            await window.supabaseClient
                .from(DB_CONFIG.tableGastos)
                .update({ estatus_pago: 'Pendiente' })
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
        concepto: 'Comisión Chofer',
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

// --- LIQUIDACIONES METRICS (KPIs) ---
async function updateLiquidacionesMetrics() {
    try {
        const startInput = document.getElementById('filter-date-start-liq');
        const endInput = document.getElementById('filter-date-end-liq');
        
        if (startInput && !startInput.value) startInput.value = getLocalISODate();
        if (endInput && !endInput.value) endInput.value = getLocalISODate();

        const startDate = startInput ? startInput.value : getLocalISODate();
        const endDate = endInput ? endInput.value : getLocalISODate();

        await ensureGlobalMapsLoaded();

        // Obtener Viajes (para comisiones)
        let trips = allTripsData && allTripsData.length ? allTripsData : await fetchSupabaseData(DB_CONFIG.tableViajes);
        
        // Obtener Cuentas (para Anticipos A Favor)
        let accounts = await fetchSupabaseData(DB_CONFIG.tableCuentas);

        // Filtrar Viajes por fecha
        let filteredTrips = trips.filter(v => {
            if (!v.fecha) return false;
            const itemDate = v.fecha.split('T')[0];
            return itemDate >= startDate && itemDate <= endDate;
        });

        // Filtrar Anticipos por fecha y tipo
        let filteredAccounts = accounts.filter(c => {
            if (c.tipo !== 'A Favor') return false;
            if (c.id_unidad) return false; // Excluir cuentas ligadas a unidades
            if (!c.fecha) return false;
            const itemDate = c.fecha.split('T')[0];
            return itemDate >= startDate && itemDate <= endDate;
        });

        // Calcular Totales
        const totalComisiones = filteredTrips.reduce((sum, v) => sum + (parseFloat(v.comision_chofer) || 0), 0);
        const totalAdelantos = filteredAccounts.reduce((sum, c) => sum + (parseFloat(c.monto) || 0), 0);

        // Actualizar UI Cards
        const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
        const domCom = document.getElementById('liq-total-comisiones');
        const domAde = document.getElementById('liq-total-adelantos');
        
        if (domCom) domCom.innerText = fmt(totalComisiones);
        if (domAde) domAde.innerText = fmt(totalAdelantos);

        // Renderizar Desglose
        renderLiquidacionesBreakdown(filteredTrips, filteredAccounts);

    } catch (err) {
        console.error('Error actualizando metricas de liquidacion:', err);
    }
}

function toggleLiquidacionesBreakdown() {
    const container = document.getElementById('liq-breakdown-container');
    if (container) {
        container.classList.toggle('hidden');
    }
}

function renderLiquidacionesBreakdown(trips, accounts) {
    const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
    const tripsTbody = document.getElementById('liq-breakdown-comisiones');
    const accTbody = document.getElementById('liq-breakdown-adelantos');

    if (tripsTbody) {
        tripsTbody.innerHTML = trips.filter(v => (parseFloat(v.comision_chofer) || 0) > 0).map(v => {
            const choferNombre = globalDriverMap[v.id_chofer] || v.id_chofer || '---';
            return `
            <tr class="border-b border-white/5 hover:bg-white/5">
                <td class="py-2 px-2 text-slate-400">${v.fecha}</td>
                <td class="py-2 px-2 font-medium text-slate-300">${choferNombre} <span class="text-[9px] text-slate-500">(${v.id_viaje})</span></td>
                <td class="py-2 px-2 text-right font-black text-amber-400">${fmt(parseFloat(v.comision_chofer))}</td>
            </tr>
            `;
        }).join('') || '<tr><td colspan="3" class="text-center py-4 text-slate-500 italic">No hay comisiones en este rango</td></tr>';
    }

    if (accTbody) {
        accTbody.innerHTML = accounts.map(c => {
            const actorNombre = c.actor_nombre || '---';
            return `
            <tr class="border-b border-white/5 hover:bg-white/5">
                <td class="py-2 px-2 text-slate-400">${c.fecha}</td>
                <td class="py-2 px-2 font-medium text-slate-300">${actorNombre} <span class="text-[9px] text-slate-500">(${c.concepto})</span></td>
                <td class="py-2 px-2 text-right font-black text-emerald-400">${fmt(parseFloat(c.monto))}</td>
            </tr>
            `;
        }).join('') || '<tr><td colspan="3" class="text-center py-4 text-slate-500 italic">No hay anticipos en este rango</td></tr>';
    }
}

async function loadSettlementTrips() {
    const list = document.getElementById('liquidation-driver-list');
    if (!list) return;
    
    try {
        list.innerHTML = '<div class="p-4 text-center text-slate-500"><i class="fas fa-spinner fa-spin"></i> Cargando choferes...</div>';

    // 1. Obtener choferes activos
    const drivers = await fetchSupabaseData(DB_CONFIG.tableChoferes);
    const activeDrivers = drivers.filter(d => (d.estatus || 'Activo') === 'Activo');

    list.innerHTML = activeDrivers.map(d => `
        <button onclick="loadDriverSettlementDetail('${d.id_chofer}')" 
            class="w-full text-left p-4 rounded-xl border border-white/5 hover:border-blue-500 hover:bg-blue-500/10 transition-all flex justify-between items-center group bg-slate-950/20">
            <div>
                <div class="font-black text-white truncate">${d.nombre}</div>
                <div class="text-[10px] text-slate-500">ID: ${d.id_chofer}</div>
            </div>
            <i class="fas fa-chevron-right text-slate-600 group-hover:text-blue-400 transition-all"></i>
        </button>
        `).join('') || '<p class="text-sm p-4 text-slate-500">No hay choferes disponibles.</p>';
    } catch (err) {
        console.error('Error en loadSettlementTrips:', err);
        list.innerHTML = `<div class="p-4 text-center text-red-500 text-xs">Error: ${err.message}</div>`;
    }
}

// Raw (unfiltered) data for the selected driver's settlement
let rawSettlementTrips = [];
let rawSettlementExpenses = [];
let rawSettlementDebts = [];

async function loadDriverSettlementDetail(id_chofer) {
    selectedDriverForSettlement = id_chofer;
    const detail = document.getElementById('settlement-detail');
    const empty = document.getElementById('settlement-empty');
    if (!detail) return;

    detail.classList.remove('hidden');
    empty.classList.add('hidden');

    // En móvil: scroll automático al panel de detalle para ver la info
    if (window.innerWidth < 768) {
        setTimeout(() => {
            detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }

    // Inicializar filtros de fecha a la semana actual (Lunes a Domingo)
    const startInput = document.getElementById('settlement-date-start');
    const endInput = document.getElementById('settlement-date-end');
    if (startInput && endInput) {
        const range = getCurrentWeekRange();
        startInput.value = range.start;
        endInput.value = range.end;
    }

    // Cargar datos: Viajes Terminados/En Proceso no liquidados + Gastos (Por Chofer O Por Viaje) + Cuentas
    // 1. Fetch Trips first to get relevant Trip IDs
    const { data: trips } = await window.supabaseClient
        .from(DB_CONFIG.tableViajes)
        .select('*')
        .eq('id_chofer', id_chofer)
        .neq('estatus_viaje', 'Liquidado');

    const activeTrips = trips || [];
    const tripIds = activeTrips.map(t => t.id_viaje);

    // 2. Fetch Expenses (By Driver OR By Trip) & Accounts
    const [expByDriver, expByTrip, accounts] = await Promise.all([
        window.supabaseClient.from(DB_CONFIG.tableGastos).select('*').eq('id_chofer', id_chofer).neq('estatus_pago', 'Pagado'),
        tripIds.length > 0 ? window.supabaseClient.from(DB_CONFIG.tableGastos).select('*').in('id_viaje', tripIds).neq('estatus_pago', 'Pagado') : { data: [] },
        window.supabaseClient.from(DB_CONFIG.tableCuentas).select('*').eq('actor_nombre', id_chofer).eq('estatus', 'No Liquidado').eq('tipo', 'A Favor')
    ]);

    // Merge and Dedup Expenses
    const allExp = [...(expByDriver.data || []), ...(expByTrip.data || [])];
    const uniqueExp = Array.from(new Map(allExp.map(item => [item.id_gasto, item])).values());

    // Guardar datos sin filtrar
    rawSettlementTrips = activeTrips;
    rawSettlementExpenses = uniqueExp;
    rawSettlementDebts = (accounts.data || []).filter(acc => !acc.id_unidad);

    // Renderizar con el filtro de fechas actual
    renderSettlementUI();
}

function applySettlementDateFilter() {
    if (!selectedDriverForSettlement) return;
    renderSettlementUI();
}

function renderSettlementUI() {
    const id_chofer = selectedDriverForSettlement;
    if (!id_chofer) return;

    // Leer rango de fechas del filtro
    const startInput = document.getElementById('settlement-date-start');
    const endInput = document.getElementById('settlement-date-end');
    const startDate = startInput ? startInput.value : '';
    const endDate = endInput ? endInput.value : '';

    // Helper para filtrar por fecha
    const filterByDateRange = (items, dateField) => {
        if (!startDate && !endDate) return items;
        return items.filter(item => {
            const d = (item[dateField] || '').split('T')[0];
            if (!d) return true; // Si no tiene fecha, incluir
            if (startDate && d < startDate) return false;
            if (endDate && d > endDate) return false;
            return true;
        });
    };

    // Aplicar filtros de fecha
    pendingTripsForDriver = filterByDateRange(rawSettlementTrips, 'fecha');
    currentExpenses = filterByDateRange(rawSettlementExpenses, 'fecha');
    currentDebts = filterByDateRange(rawSettlementDebts, 'fecha');

    // Llenar UI
    document.getElementById('set-trip-id').innerText = `LIQUIDACIÓN: ${id_chofer}`;
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

    // Filtramos SOLO los gastos QUE SEAN DEDUCIBLES (Regla Absoluta: Si es Deducible, entra)
    const reimbursableExpenses = currentExpenses.filter(g => {
        const deducible = String(g.es_deducible || '').trim().toLowerCase();
        // Allow Si, Sí, SI, sí, True, true, yes, 1, Bonificable (starts with b)
        const isDeducible = deducible.startsWith('s') || deducible === 'true' || deducible === '1' || deducible === 'yes' || deducible.startsWith('b');

        return isDeducible;
    });

    expList.innerHTML = reimbursableExpenses.map(g => {
        const estAprob = g.estatus_aprobacion || 'Pendiente';
        const isPending = estAprob === 'Pendiente';
        const aprobColor = estAprob === 'Aprobado' ? 'text-green-500' : (estAprob === 'Rechazado' ? 'text-red-500' : 'text-amber-500');

        // Solo sumamos lo que se muestra
        sumExp += parseFloat(g.monto);

        return `
            <div class="flex flex-col gap-1 border-b border-white/5 pb-2 mb-2 last:border-0 last:pb-0 last:mb-0">
                <div class="flex justify-between items-center">
                    <span class="text-xs font-semibold text-slate-200">
                        ${g.concepto} (${g.id_viaje})
                    </span>
                    <span class="font-mono font-bold text-white">$${parseFloat(g.monto).toLocaleString()}</span>
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
            </div>
        `;
    }).join('') || '<span class="text-slate-400 italic">Sin gastos a reembolsar</span>';
    document.getElementById('set-sum-expenses').innerText = `$${sumExp.toLocaleString()}`;

    // Anticipos/Deudas (Solo se restan los "A Favor" - Anticipos)
    const debtList = document.getElementById('set-debts-list');
    let sumDebtNeto = 0;
    let debtItemsHtml = currentDebts.map(d => {
        const monto = parseFloat(d.monto) || 0;
        sumDebtNeto += monto;
        return `<div class="flex justify-between text-amber-500"><span>${d.concepto} (Anticipo)</span><span class="font-mono">-$${monto.toLocaleString()}</span></div> `;
    }).join('');

    // Gastos de Nómina No Deducibles
    const nominaDeductions = currentExpenses.filter(g => 
        (g.estatus_aprobacion || 'Pendiente') === 'Aprobado' &&
        g.concepto === 'Nómina' &&
        String(g.es_deducible || 'Sí').trim() === 'No'
    );
    
    if (nominaDeductions.length > 0) {
        debtItemsHtml += nominaDeductions.map(g => {
            const monto = parseFloat(g.monto) || 0;
            sumDebtNeto += monto;
            return `<div class="flex justify-between text-red-400"><span>Nómina (Retención)</span><span class="font-mono">-$${monto.toLocaleString()}</span></div> `;
        }).join('');
    }

    debtList.innerHTML = debtItemsHtml || '<span class="text-amber-400 italic">Sin anticipos/retenciones</span>';
    document.getElementById('set-sum-debts').innerText = `- $${sumDebtNeto.toLocaleString()}`;

    // Totales finales
    const approvedExpenses = currentExpenses.filter(g => {
        const estAprob = (g.estatus_aprobacion || 'Pendiente');
        const deducible = String(g.es_deducible || '').trim().toLowerCase();
        const isDeducible = deducible.startsWith('s') || deducible === 'true' || deducible === '1' || deducible === 'yes' || deducible.startsWith('b');

        return estAprob === 'Aprobado' && isDeducible;
    });
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
    modal.classList.remove('hidden');
    title.innerText = 'Detalle Completo de Liquidación';

    // Generar tabla de Viajes
    let totalFletes = 0;
    let totalComisiones = 0;

    const tripsHtmlRows = pendingTripsForDriver.map(t => {
        const flete = parseFloat(t.monto_flete) || 0;
        const comision = parseFloat(t.comision_chofer) || 0;
        totalFletes += flete;
        totalComisiones += comision;
        
        return `
        <tr class="border-b border-white/5 text-xs text-slate-300">
            <td class="p-2 text-slate-400">${t.fecha ? new Date(t.fecha + 'T00:00:00').toLocaleDateString('es-MX', {day:'2-digit', month:'2-digit', year:'numeric'}) : '—'}</td>
            <td class="p-2 font-mono">${t.id_viaje}</td>
            <td class="p-2">${t.origen} -> ${t.destino}</td>
            <td class="p-2 text-right font-bold text-white">$${flete.toLocaleString()}</td>
            <td class="p-2 text-right text-green-400 font-bold">$${comision.toLocaleString()}</td>
            <td class="p-2 text-center">
                <button onclick="liquidarViajeIndividual('${t.id_viaje}', ${comision}, '${t.id_chofer}', '${t.id_unidad}')" class="px-2 py-1 bg-blue-600/80 hover:bg-blue-500 text-white rounded-lg text-[9px] font-bold transition-all">
                    <i class="fas fa-check-circle mr-1"></i> Liquidar
                </button>
            </td>
        </tr>
    `}).join('');

    const tripsHtml = pendingTripsForDriver.length > 0
        ? tripsHtmlRows + `
        <tr class="bg-blue-900/30 border-t-2 border-blue-500/50 text-xs">
            <td colspan="3" class="p-2 text-right font-black text-blue-300 uppercase tracking-widest">Totales</td>
            <td class="p-2 text-right font-black text-white">$${totalFletes.toLocaleString()}</td>
            <td class="p-2 text-right font-black text-green-400">$${totalComisiones.toLocaleString()}</td>
            <td class="p-2"></td>
        </tr>`
        : '<tr><td colspan="6" class="p-4 text-center text-slate-400 italic">Sin viajes pendientes</td></tr>';

    // Generar tabla de Gastos (Aprobados)
    const activeExpenses = currentExpenses.filter(g => {
        const deducible = String(g.es_deducible || '').trim().toLowerCase();
        const isDeducible = deducible.startsWith('s') || deducible === 'true' || deducible === '1' || deducible === 'yes' || deducible.startsWith('b');
        return isDeducible;
    });
    const expensesHtml = activeExpenses.map(g => `
        <tr class="border-b border-white/5 text-xs text-slate-300">
            <td class="p-2 font-mono">${g.id_gasto}</td>
            <td class="p-2">${g.concepto}</td>
            <td class="p-2 font-bold text-white">
                $${(parseFloat(g.monto) || 0).toLocaleString()}
            </td>
            <td class="p-2 text-[10px]">${g.estatus_aprobacion || 'Pendiente'}</td>
            <td class="p-2 text-center">
                <button onclick="pagarGastoIndividual('${g.id_gasto}')" class="px-2 py-1 bg-green-600/80 hover:bg-green-500 text-white rounded-lg text-[9px] font-bold transition-all">
                    <i class="fas fa-money-bill-wave mr-1"></i> Pagar
                </button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="5" class="p-4 text-center text-slate-400 italic">Sin gastos reembolsables</td></tr>';

    // Generar tabla de Deudas y Retenciones (Nómina No Deducible)
    let debtsHtmlContent = currentDebts.map(d => `
        <tr class="border-b border-white/5 text-xs text-slate-300">
            <td class="p-2 font-mono">${d.id_cuenta}</td>
            <td class="p-2">${d.concepto}</td>
            <td class="p-2 text-right font-bold text-red-400">-$${(parseFloat(d.monto) || 0).toLocaleString()}</td>
            <td class="p-2 text-center">
                <button onclick="liquidarDeudaIndividual('${d.id_cuenta}')" class="px-2 py-1 bg-red-600/80 hover:bg-red-500 text-white rounded-lg text-[9px] font-bold transition-all">
                    <i class="fas fa-check mr-1"></i> Liquidar
                </button>
            </td>
        </tr>
    `).join('');

    const nominaDeductionsDet = currentExpenses.filter(g => 
        (g.estatus_aprobacion || 'Pendiente') === 'Aprobado' &&
        g.concepto === 'Nómina' &&
        String(g.es_deducible || 'Sí').trim() === 'No'
    );
    
    if (nominaDeductionsDet.length > 0) {
        debtsHtmlContent += nominaDeductionsDet.map(g => `
            <tr class="border-b border-white/5 text-xs text-slate-300 bg-red-950/20">
                <td class="p-2 font-mono">${g.id_gasto}</td>
                <td class="p-2 text-red-400 font-bold">Nómina (Retención)</td>
                <td class="p-2 text-right font-bold text-red-400">-$${(parseFloat(g.monto) || 0).toLocaleString()}</td>
                <td class="p-2 text-center">
                    <button onclick="pagarGastoIndividual('${g.id_gasto}')" class="px-2 py-1 bg-red-600/80 hover:bg-red-500 text-white rounded-lg text-[9px] font-bold transition-all">
                        <i class="fas fa-check mr-1"></i> Liquidar
                    </button>
                </td>
            </tr>
        `).join('');
    }

    const debtsHtml = debtsHtmlContent || '<tr><td colspan="4" class="p-4 text-center text-slate-400 italic">Sin deudas/retenciones pendientes</td></tr>';

    content.innerHTML = `
        <div class="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
            <!-- Sección Viajes -->
            <div>
                <h4 class="font-bold text-blue-400 uppercase text-xs mb-2 border-b border-blue-900/30 pb-1">1. Viajes a Liquidar</h4>
                <table class="w-full text-left">
                    <thead class="bg-blue-950/40 text-[10px] uppercase font-bold text-blue-400">
                        <tr><th class="p-2">Fecha</th><th class="p-2">ID</th><th class="p-2">Ruta</th><th class="p-2 text-right">Flete</th><th class="p-2 text-right">Comisión</th><th class="p-2 text-center">Acción</th></tr>
                    </thead>
                    <tbody>${tripsHtml}</tbody>
                </table>
            </div>

            <!-- Sección Gastos -->
            <div>
                <h4 class="font-bold text-slate-400 uppercase text-xs mb-2 border-b border-slate-800/30 pb-1">2. Reembolsos (Gastos Contado)</h4>
                <table class="w-full text-left">
                    <thead class="bg-slate-950/40 text-[10px] uppercase font-bold text-slate-400">
                        <tr><th class="p-2">ID</th><th class="p-2">Concepto</th><th class="p-2">Monto</th><th class="p-2">Estado</th><th class="p-2 text-center">Acción</th></tr>
                    </thead>
                    <tbody>${expensesHtml}</tbody>
                </table>
            </div>

            <!-- Sección Deudas -->
            <div>
                <h4 class="font-bold text-amber-400 uppercase text-xs mb-2 border-b border-amber-900/30 pb-1">3. Descuentos (Adelantos/Deudas)</h4>
                <table class="w-full text-left">
                    <thead class="bg-amber-950/40 text-[10px] uppercase font-bold text-amber-400">
                        <tr><th class="p-2">ID</th><th class="p-2">Concepto</th><th class="p-2 text-right">Monto</th><th class="p-2 text-center">Acción</th></tr>
                    </thead>
                    <tbody>${debtsHtml}</tbody>
                </table>
            </div>
        </div>
        <div class="mt-6 pt-4 border-t border-white/5 text-right">
             <button onclick="closeDetailModal()" class="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-sm border border-white/5">Cerrar Detalle</button>
        </div>
    `;
}

// Funciones para liquidar/pagar registros de forma individual
async function liquidarViajeIndividual(id_viaje, comision, id_chofer, id_unidad) {
    if (!confirm(`¿Desea liquidar el viaje ${id_viaje} de forma individual?\n\nSe marcará como Liquidado y se generará el gasto de comisión de chofer ($${comision.toLocaleString()}).`)) {
        return;
    }
    try {
        // 1. Marcar el viaje como Liquidado
        const { error: vErr } = await window.supabaseClient
            .from(DB_CONFIG.tableViajes)
            .update({ estatus_viaje: 'Liquidado' })
            .eq('id_viaje', id_viaje);
        if (vErr) throw vErr;

        // 2. Generar comisión automática
        await crearGastoComisionAutomatica({
            id_viaje: id_viaje,
            monto: parseFloat(comision) || 0,
            id_chofer: id_chofer,
            id_unidad: id_unidad
        });

        // 3. Recargar detalles del chofer
        await loadDriverSettlementDetail(selectedDriverForSettlement);

        // 4. Actualizar el modal de Detalle Maestro
        showSettlementFullDetail();

        // 5. Notificar
        alert(`✅ El viaje ${id_viaje} se ha liquidado individualmente.`);
    } catch (err) {
        alert('Error al liquidar viaje individual: ' + err.message);
    }
}

async function pagarGastoIndividual(id_gasto) {
    if (!confirm(`¿Desea marcar el gasto ${id_gasto} como Pagado de forma individual?\n\nYa no se incluirá en esta liquidación.`)) {
        return;
    }
    try {
        const { error: gErr } = await window.supabaseClient
            .from(DB_CONFIG.tableGastos)
            .update({ estatus_pago: 'Pagado' })
            .eq('id_gasto', id_gasto);
        if (gErr) throw gErr;

        await loadDriverSettlementDetail(selectedDriverForSettlement);
        showSettlementFullDetail();
        alert(`✅ El gasto ${id_gasto} se ha marcado como Pagado.`);
    } catch (err) {
        alert('Error al pagar gasto individual: ' + err.message);
    }
}

async function liquidarDeudaIndividual(id_cuenta) {
    if (!confirm(`¿Desea marcar esta cuenta/deuda (${id_cuenta}) como Liquidada de forma individual?\n\nYa no se restará en esta liquidación.`)) {
        return;
    }
    try {
        const { error: dErr } = await window.supabaseClient
            .from(DB_CONFIG.tableCuentas)
            .update({ estatus: 'Liquidado' })
            .eq('id_cuenta', id_cuenta);
        if (dErr) throw dErr;

        await loadDriverSettlementDetail(selectedDriverForSettlement);
        showSettlementFullDetail();
        alert(`✅ La deuda ${id_cuenta} se ha marcado como Liquidada.`);
    } catch (err) {
        alert('Error al liquidar deuda individual: ' + err.message);
    }
}

async function finalizeSettlement() {
    if (!selectedDriverForSettlement) return;

    // Check for unapproved expenses
    const unapproved = currentExpenses.filter(g => (g.estatus_aprobacion || 'Pendiente') === 'Pendiente');
    if (unapproved.length > 0) {
        alert('âŒ No se puede finalizar la liquidación: Hay ' + unapproved.length + ' gastos pendientes de aprobación.');
        return;
    }

    const settleData = calculateCurrentSettlement();
    if (!settleData || settleData.monto_neto <= 0) {
        if (!confirm('La liquidación es de $0.00 o menor. ¿Desea continuar de todos modos?')) return;
    }

    if (!confirm(`¿Desea cerrar la liquidación para ${selectedDriverForSettlement} ?\nTotal Neto: $${settleData.monto_neto.toLocaleString()}`)) return;

    try {
        // 1. Guardar Maestro de Liquidación
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
            await window.supabaseClient.from(DB_CONFIG.tableViajes).update({ estatus_viaje: 'Liquidado' }).in('id_viaje', ids);

            // Generar gastos de comisión por cada viaje
            for (const t of pendingTripsForDriver) {
                await crearGastoComisionAutomatica({
                    id_viaje: t.id_viaje,
                    monto: parseFloat(t.comision_chofer) || 0,
                    id_chofer: t.id_chofer,
                    id_unidad: t.id_unidad
                });
            }
        }

        // 4. Marcar gastos como pagados (SOLO LOS REEMBOLSABLES: Contado o Efectivo)
        // OJO: Si pagamos todo lo 'Aprobado', podríamos pagar créditos por error si no filtramos.
        // La lógica visual solo muestra Contado/Efectivo, así que solo debemos liquidar esos.
        const approvedExpenses = currentExpenses.filter(g =>
            (g.estatus_aprobacion || 'Pendiente') === 'Aprobado' &&
            ['Contado', 'Efectivo'].includes(g.forma_pago) &&
            String(g.es_deducible || 'Sí').trim() === 'Sí'
        );

        // También marcar como pagados los gastos de Nómina No Deducibles que se usaron como retención
        const nominaDeductions = currentExpenses.filter(g => 
            (g.estatus_aprobacion || 'Pendiente') === 'Aprobado' &&
            g.concepto === 'Nómina' &&
            String(g.es_deducible || 'Sí').trim() === 'No'
        );

        const allExpensesToMarkPaid = [...approvedExpenses, ...nominaDeductions];

        if (allExpensesToMarkPaid.length > 0) {
            const ids = allExpensesToMarkPaid.map(g => g.id_gasto);
            await window.supabaseClient.from(DB_CONFIG.tableGastos).update({ estatus_pago: 'Pagado' }).in('id_gasto', ids);
        }

        alert('âœ… Liquidación consolidada guardada y cuentas cerradas.');
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
        String(g.es_deducible || 'Sí').trim() === 'Sí'
    );
    const totalGastosAprobados = approvedReimbursable.reduce((sum, g) => sum + (parseFloat(g.monto) || 0), 0);

    // totalDebts = Solo A Favor (Se recuperan de la liquidación)
    let totalDebts = currentDebts.reduce((sum, d) => {
        return d.tipo === 'A Favor' ? sum + (parseFloat(d.monto) || 0) : sum;
    }, 0);

    // Añadir Nómina No Deducible como deuda a descontar
    const nominaDeductionsCalc = currentExpenses.filter(g => 
        (g.estatus_aprobacion || 'Pendiente') === 'Aprobado' &&
        g.concepto === 'Nómina' &&
        String(g.es_deducible || 'Sí').trim() === 'No'
    ).reduce((sum, g) => sum + (parseFloat(g.monto) || 0), 0);
    
    totalDebts += nominaDeductionsCalc;

    const comm = pendingTripsForDriver.reduce((sum, t) => sum + (parseFloat(t.comision_chofer) || 0), 0);
    const neto = comm + totalGastosAprobados - totalDebts;

    return {
        total_fletes: totalFletes,
        total_gastos: totalGastosAprobados,
        monto_comision: comm,
        monto_neto: neto
    };
}


// --- FUNCIONES EXTRA (Inline Edit Helpers) ---

// --- UNIVERSAL INLINE EDITING ---

async function editCatalogInline(type, id) {
    const row = document.getElementById(`row-${type}-${id}`);
    if (!row) return;

    // Obtener datos actuales del servidor o una caché si existiera
    const tableKey = 'table' + type.charAt(0).toUpperCase() + type.slice(1);
    const table = DB_CONFIG[tableKey];

    if (!table) {
        alert('Error de configuración: No se encontró la tabla para ' + type);
        return;
    }

    const idCol = type === 'choferes' ? 'id_chofer' : (type === 'unidades' ? 'id_unidad' : (type === 'clientes' ? 'nombre_cliente' : 'id_proveedor'));
    const { data: item, error } = await window.supabaseClient.from(table).select('*').eq(idCol, id).single();

    if (error) {
        alert('Error al obtener datos: ' + error.message);
        return;
    }

    if (!item) {
        alert('Registro no encontrado en la base de datos.');
        return;
    }

    let editHtml = '';
    if (type === 'choferes') {
        editHtml = `
            <td class="px-6 py-4"><input type="text" id="edit-id-${id}" value="${item.id_chofer}" class="w-24 p-1 border rounded bg-white text-slate-900 font-bold focus:ring-2 focus:ring-blue-500"></td>
            <td class="px-6 py-4"><input type="text" id="edit-nombre-${id}" value="${item.nombre}" class="w-full p-1 border rounded bg-white text-slate-800 font-bold focus:ring-2 focus:ring-blue-500"></td>
            <td class="px-6 py-4"><input type="text" id="edit-licencia-${id}" value="${item.licencia || ''}" class="w-full p-1 border rounded text-slate-800 bg-white"></td>
            <td class="px-6 py-4"><input type="text" id="edit-unidad-${id}" value="${item.id_unidad || ''}" class="w-full p-1 border rounded text-slate-800 bg-white"></td>
            <td class="px-6 py-4 text-slate-400 text-[10px] uppercase font-bold tracking-tight">Cálculo Auto</td>
        `;
    } else if (type === 'unidades') {
        editHtml = `
            <td class="px-6 py-4"><input type="text" id="edit-id-${id}" value="${item.id_unidad}" class="w-24 p-1 border rounded bg-white text-slate-900 font-bold focus:ring-2 focus:ring-blue-500"></td>
            <td class="px-6 py-4"><input type="text" id="edit-nombre-${id}" value="${item.nombre_unidad || ''}" class="w-full p-1 border rounded bg-white"></td>
            <td class="px-6 py-4"><input type="text" id="edit-placas-${id}" value="${item.placas || ''}" class="w-full p-1 border rounded bg-white"></td>
            <td class="px-6 py-4"><input type="text" id="edit-chofer-${id}" value="${item.id_chofer || ''}" class="w-full p-1 border rounded bg-white"></td>
           <td class="px-6 py-4 text-slate-400 text-[10px] uppercase font-bold tracking-tight">Cálculo Auto</td>
        `;
    } else if (type === 'clientes') {
        editHtml = `
            <td class="px-6 py-4"><input type="text" id="edit-nombre-${id}" value="${item.nombre_cliente}" class="w-full p-1 border rounded bg-white text-slate-900 font-bold focus:ring-2 focus:ring-blue-500"></td>
            <td class="px-6 py-4"><input type="text" id="edit-rfc-${id}" value="${item.rfc || ''}" class="w-24 p-1 border rounded bg-white"></td>
            <td class="px-6 py-4"><input type="text" id="edit-contacto-${id}" value="${item.contacto_nombre || ''}" class="w-full p-1 border rounded bg-white"></td>
        `;
    } else if (type === 'proveedores') {
        editHtml = `
            <td class="px-6 py-4"><input type="text" id="edit-id-${id}" value="${item.id_proveedor}" class="w-24 p-1 border rounded bg-white text-slate-900 font-bold focus:ring-2 focus:ring-blue-500"></td>
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
        alert('Cambios guardados con éxito.');
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
            
            // Auto-select unit if driver is logged in and assigned to a unit
            const session = checkAuth();
            const driverId = session ? (session.id_chofer || session.id_contacto || session.userID) : null;
            if (driverId) {
                const assignedUnit = activeUnits.find(u => u.id_chofer === driverId);
                if (assignedUnit) {
                    unitSelect.value = assignedUnit.id_unidad;
                    if (typeof window.updateLastYieldDisplay === 'function') {
                        window.updateLastYieldDisplay(assignedUnit.id_unidad);
                    }
                    if (typeof window.updateLiveYield === 'function') {
                        window.updateLiveYield();
                    }
                }
            }
        }

        // Populate Drivers
        if (driverSelect) {
            const activeDrivers = drivers.filter(d => (d.estatus || 'Activo') === 'Activo');
            driverSelect.innerHTML = '<option value="" class="bg-slate-900">Selecciona Chofer</option>' +
                activeDrivers.map(d => `<option value="${d.id_chofer}" class="bg-slate-900">${d.nombre}</option>`).join('');

            // Auto-select current driver if session exists
            const session = checkAuth();
            const driverId = session ? (session.id_chofer || session.id_contacto || session.userID) : null;
            if (driverId) {
                const exists = activeDrivers.some(d => d.id_chofer === driverId);
                if (exists) {
                    driverSelect.value = driverId;
                }
            }
        }

    } catch (err) {
        console.error('Error populating driver form options:', err);
    }
}

// --- GESTIÓN DE TARIFAS ---

let currentRateTab = 'Trailer';

async function loadRatesList() {
    const loader = document.getElementById('rates-loader');
    const container = document.getElementById('rates-container');
    if (!container) return;

    if (loader) loader.classList.remove('hidden');
    container.innerHTML = '';

    try {
        const [rates, clients] = await Promise.all([
            fetchSupabaseData(DB_CONFIG.tableTarifas),
            fetchSupabaseData(DB_CONFIG.tableClientes)
        ]);

        // Populate client select in form if not done
        const clientSelect = document.getElementById('rate-cliente');
        if (clientSelect && clientSelect.options.length <= 1) {
            clientSelect.innerHTML = '<option value="" class="bg-slate-900">Selecciona Cliente</option>' +
                clients.sort((a,b) => (a.nombre_cliente || '').localeCompare(b.nombre_cliente || ''))
                       .map(c => `<option value="${c.nombre_cliente}" class="bg-slate-900">${c.nombre_cliente}</option>`).join('');
        }

        renderRatesList(rates);
    } catch (err) {
        console.error('Error cargando tarifas:', err);
        container.innerHTML = `<p class="text-center text-red-400">Error: ${err.message}</p>`;
    } finally {
        if (loader) loader.classList.add('hidden');
    }
}

function switchRateTab(type) {
    currentRateTab = type;
    
    // UI Update
    document.querySelectorAll('.rate-tab').forEach(btn => {
        btn.classList.remove('bg-blue-600', 'text-white', 'shadow-lg', 'shadow-blue-600/20');
        btn.classList.add('text-slate-500', 'hover:text-white');
    });

    const activeBtn = document.getElementById(`rate-tab-${type.toLowerCase()}`);
    if (activeBtn) {
        activeBtn.classList.remove('text-slate-500', 'hover:text-white');
        activeBtn.classList.add('bg-blue-600', 'text-white', 'shadow-lg', 'shadow-blue-600/20');
    }

    loadRatesList();
}

function renderRatesList(rates) {
    const container = document.getElementById('rates-container');
    if (!container) return;

    const filtered = rates.filter(r => r.tipo === currentRateTab);

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="text-center py-20 bg-white/5 rounded-[2.5rem] border border-dashed border-white/10">
                <i class="fas fa-tags text-4xl text-slate-700 mb-4"></i>
                <p class="text-slate-500 font-bold uppercase tracking-widest text-xs">No hay tarifas registradas para ${currentRateTab}</p>
            </div>
        `;
        return;
    }

    // Group by client
    const grouped = {};
    filtered.forEach(r => {
        if (!grouped[r.cliente]) grouped[r.cliente] = [];
        grouped[r.cliente].push(r);
    });

    // Sort clients alphabetically
    const sortedClients = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

    container.innerHTML = sortedClients.map(client => `
        <div class="bg-slate-900/40 backdrop-blur-xl rounded-3xl border border-white/5 overflow-hidden shadow-xl mb-10">
            <div class="bg-white/5 px-8 py-4 border-b border-white/5 flex items-center justify-between">
                <h3 class="text-xs font-black text-amber-500 uppercase tracking-[0.2em] flex items-center gap-2">
                    <i class="fas fa-building opacity-50"></i> ${client}
                </h3>
                <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">${grouped[client].length} Rutas</span>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-white/[0.02] border-b border-white/5">
                            <th class="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Origen</th>
                            <th class="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Destino</th>
                            <th class="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Flete ($)</th>
                            <th class="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right text-amber-500">Comisión ($)</th>
                            <th class="px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-white/5">
                        ${grouped[client].sort((a, b) => (a.origen || '').localeCompare(b.origen || '')).map(r => `
                            <tr class="hover:bg-white/[0.02] transition-colors group">
                                <td class="px-8 py-5">
                                    <div class="flex items-center gap-3">
                                        <div class="w-2 h-2 rounded-full bg-blue-500"></div>
                                        <span class="text-sm font-bold text-slate-200">${r.origen}</span>
                                    </div>
                                </td>
                                <td class="px-8 py-5">
                                    <div class="flex items-center gap-3">
                                        <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
                                        <span class="text-sm font-bold text-slate-200">${r.destino}</span>
                                    </div>
                                </td>
                                <td class="px-8 py-5 text-right">
                                    <span class="text-sm font-black text-white">$${parseFloat(r.monto).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                </td>
                                <td class="px-8 py-5 text-right">
                                    <span class="text-sm font-black text-amber-500">$${parseFloat(r.comision_chofer || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                </td>
                                <td class="px-8 py-5 text-right">
                                    <div class="flex justify-end gap-2">
                                        <button onclick="editRate('${r.id}')" title="Editar" class="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center hover:bg-blue-500 hover:text-white transition-all">
                                            <i class="fas fa-edit text-xs"></i>
                                        </button>
                                        <button onclick="deleteRate('${r.id}')" title="Eliminar" class="w-8 h-8 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all">
                                            <i class="fas fa-trash text-xs"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `).join('');
}

function showRateForm() {
    document.getElementById('rates-list-view').classList.add('hidden');
    document.getElementById('rates-form-view').classList.remove('hidden');
    document.getElementById('rate-form').reset();
    document.getElementById('rate-id').value = '';
    document.getElementById('rate-form-title').innerText = 'Nueva Tarifa';
    document.getElementById('rate-tipo').value = currentRateTab;
}

function hideRateForm() {
    document.getElementById('rates-list-view').classList.remove('hidden');
    document.getElementById('rates-form-view').classList.add('hidden');
}

async function editRate(id) {
    showRateForm();
    document.getElementById('rate-form-title').innerText = 'Editar Tarifa';
    
    try {
        const { data, error } = await window.supabaseClient
            .from(DB_CONFIG.tableTarifas)
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) throw error;

        document.getElementById('rate-id').value = data.id;
        document.getElementById('rate-cliente').value = data.cliente;
        document.getElementById('rate-origen').value = data.origen;
        document.getElementById('rate-destino').value = data.destino;
        document.getElementById('rate-monto').value = data.monto;
        document.getElementById('rate-comision').value = data.comision_chofer || 0;
        document.getElementById('rate-tipo').value = data.tipo;
    } catch (err) {
        alert('Error al cargar tarifa: ' + err.message);
        hideRateForm();
    }
}

async function deleteRate(id) {
    if (!confirm('¿Estás seguro de eliminar esta tarifa?')) return;

    try {
        const { error } = await window.supabaseClient
            .from(DB_CONFIG.tableTarifas)
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        alert('Tarifa eliminada.');
        loadRatesList();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function handleRateSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.innerText = 'Guardando...';
    btn.disabled = true;

    try {
        const id = document.getElementById('rate-id').value;
        const rateData = {
            cliente: document.getElementById('rate-cliente').value,
            origen: document.getElementById('rate-origen').value,
            destino: document.getElementById('rate-destino').value,
            monto: parseFloat(document.getElementById('rate-monto').value) || 0,
            comision_chofer: parseFloat(document.getElementById('rate-comision').value) || 0,
            tipo: document.getElementById('rate-tipo').value
        };

        let error;
        if (id) {
            const { error: err } = await window.supabaseClient
                .from(DB_CONFIG.tableTarifas)
                .update(rateData)
                .eq('id', id);
            error = err;
        } else {
            const { error: err } = await window.supabaseClient
                .from(DB_CONFIG.tableTarifas)
                .insert([rateData]);
            error = err;
        }

        if (error) throw error;

        alert('Tarifa guardada correctamente.');
        hideRateForm();
        loadRatesList();
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// --- LÓGICA DE MANTENIMIENTO Y TERMOS ---
let currentMaintTab = 'unidades';
let listTermosCached = [];

async function switchMaintTab(tab) {
    currentMaintTab = tab;
    document.querySelectorAll('.maint-tab').forEach(btn => {
        btn.classList.remove('bg-blue-600', 'text-white', 'shadow-lg', 'shadow-blue-600/20');
        btn.classList.add('text-slate-500', 'hover:text-white');
    });

    const activeBtn = document.getElementById(`tab-maint-${tab}`);
    if (activeBtn) {
        activeBtn.classList.add('bg-blue-600', 'text-white', 'shadow-lg', 'shadow-blue-600/20');
        activeBtn.classList.remove('text-slate-500');
    }

    if (tab === 'unidades') {
        document.getElementById('maint-unidades-view').classList.remove('hidden');
        document.getElementById('maint-termos-view').classList.add('hidden');
        await loadMaintUnidades();
    } else {
        document.getElementById('maint-unidades-view').classList.add('hidden');
        document.getElementById('maint-termos-view').classList.remove('hidden');
        await loadMaintTermos();
    }
}

async function loadMaintUnidades() {
    const loader = document.getElementById('maint-unidades-loader');
    const tbody = document.getElementById('maint-unidades-body');
    if (loader) loader.classList.remove('hidden');
    if (tbody) tbody.innerHTML = '';

    try {
        // Fetch all termos, units and drivers
        const [termosRes, unitsRes, driversRes] = await Promise.all([
            window.supabaseClient.from('cat_termos').select('*').order('id_termo'),
            window.supabaseClient.from('cat_unidades').select('*').order('id_unidad'),
            window.supabaseClient.from('cat_choferes').select('*')
        ]);

        if (unitsRes.error) throw unitsRes.error;

        listTermosCached = termosRes.data || [];
        const units = unitsRes.data || [];
        const drivers = driversRes.data || [];

        // Build driver map
        const driverMap = {};
        drivers.forEach(d => {
            driverMap[d.id_chofer] = d.nombre;
        });

        if (loader) loader.classList.add('hidden');

        if (units.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-slate-500 font-bold uppercase tracking-wider text-xs">No hay unidades registradas</td></tr>`;
            return;
        }

        tbody.innerHTML = units.map(u => {
            const kmActual = u.kilometraje_actual || 0;
            const kmUltimo = u.ultimo_cambio_aceite_km || 0;
            const recorrido = kmActual - kmUltimo;
            const isUrgent = recorrido >= 25000;

            const driverName = driverMap[u.id_chofer] ? `${driverMap[u.id_chofer]} [${u.id_chofer}]` : (u.id_chofer || '<span class="text-slate-600">Sin Chofer</span>');

            // Generate options for terms
            const termoOptions = [`<option value="">-- Sin Termo --</option>`];
            listTermosCached.forEach(t => {
                const selected = t.id_termo === u.id_termo ? 'selected' : '';
                termoOptions.push(`<option value="${t.id_termo}" ${selected}>${t.id_termo} (${t.marca || 'N/A'})</option>`);
            });

            const recorridoDisplay = isUrgent 
                ? `<span class="px-2.5 py-1 text-[9px] font-black uppercase rounded bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1 animate-pulse"><i class="fas fa-exclamation-triangle"></i> Cambio Urgente (${recorrido.toLocaleString()} km)</span>`
                : `<span class="px-2.5 py-1 text-[9px] font-black uppercase rounded bg-green-500/10 text-green-400 border border-green-500/20">${recorrido.toLocaleString()} km recorridos</span>`;

            const unitRowClass = isUrgent ? 'bg-red-500/[0.03] hover:bg-red-500/[0.05]' : 'hover:bg-white/[0.01]';

            const registersFuel = u.registra_combustible !== false;
            const monitoringBadge = registersFuel
                ? `<span class="px-2.5 py-1 text-[9px] font-black uppercase rounded bg-green-500/10 text-green-400 border border-green-500/20">Registra</span>`
                : `<span class="px-2.5 py-1 text-[9px] font-black uppercase rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">No Registra</span>`;
            const toggleButton = `
                <button onclick="toggleUnitFuelMonitoring('${u.id_unidad}', ${registersFuel})" 
                    class="w-7 h-7 rounded-lg ${registersFuel ? 'bg-rose-600/10 hover:bg-rose-600 text-rose-400' : 'bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400'} hover:text-white flex items-center justify-center transition-all active:scale-90 border border-white/5" 
                    title="${registersFuel ? 'Desactivar Monitoreo de Diésel' : 'Activar Monitoreo de Diésel'}">
                    <i class="fas ${registersFuel ? 'fa-toggle-on' : 'fa-toggle-off'} text-xs"></i>
                </button>
            `;

            return `
                <tr class="transition-colors border-b border-white/5 last:border-0 ${unitRowClass}">
                    <td class="px-6 py-4 font-black text-white text-xs tracking-tight">${u.id_unidad}</td>
                    <td class="px-6 py-4 font-bold text-slate-200 text-xs">${u.nombre_unidad || 'Sin alias'} <span class="block text-[9px] text-slate-500 font-medium tracking-normal mt-0.5">${u.marca || ''} ${u.modelo || ''}</span></td>
                    <td class="px-6 py-4 text-slate-400 text-xs font-semibold">${driverName}</td>
                    
                    <!-- Kilometraje Actual (Vivo) -->
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-2">
                            <input type="number" id="km-live-${u.id_unidad}" value="${kmActual}" 
                                class="w-24 px-2 py-1.5 rounded-lg bg-slate-950/60 border border-white/10 text-xs text-white text-center font-bold outline-none focus:border-blue-500/50">
                            <button onclick="updateLiveKilometraje('${u.id_unidad}')" title="Actualizar Kilometraje Vivo" 
                                class="w-7 h-7 rounded-lg bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white flex items-center justify-center transition-all active:scale-90 border border-emerald-500/20">
                                <i class="fas fa-check text-xs"></i>
                            </button>
                        </div>
                    </td>

                    <!-- Km Último Cambio de Aceite -->
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-2">
                            <input type="number" id="oil-km-${u.id_unidad}" value="${kmUltimo}" 
                                class="w-24 px-2 py-1.5 rounded-lg bg-slate-950/60 border border-white/10 text-xs text-white text-center font-bold outline-none focus:border-blue-500/50">
                            <button onclick="updateOilChangeMileage('${u.id_unidad}')" title="Actualizar Kilometraje de Cambio" 
                                class="w-7 h-7 rounded-lg bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white flex items-center justify-center transition-all active:scale-90 border border-blue-500/20">
                                <i class="fas fa-check text-xs"></i>
                            </button>
                        </div>
                        <div class="text-[9px] text-slate-500 mt-1 font-bold">Fecha: ${u.ultimo_cambio_aceite_fecha || 'Sin fecha'}</div>
                    </td>

                    <td class="px-6 py-4">${recorridoDisplay}</td>
                    
                    <!-- Monitoreo Diésel -->
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-2">
                            ${monitoringBadge}
                            ${toggleButton}
                        </div>
                    </td>

                    <!-- Termo Asignado -->
                    <td class="px-6 py-4">
                        <select onchange="updateUnitTermo('${u.id_unidad}', this.value)" 
                            class="px-3 py-1.5 rounded-lg bg-slate-950/60 border border-white/10 text-xs text-slate-300 outline-none focus:border-blue-500/50">
                            ${termoOptions.join('')}
                        </select>
                    </td>
                    
                    <td class="px-6 py-4">
                        <div class="flex items-center justify-center gap-2">
                            <button onclick="showUnitMaintDetail('${u.id_unidad}')" 
                                class="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white font-black text-[9px] uppercase tracking-wider transition-all active:scale-95 border border-white/5 flex items-center gap-1">
                                <i class="fas fa-eye text-blue-400"></i> Detalle
                            </button>
                            <button onclick="performOilChangeService('${u.id_unidad}')" 
                                class="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[9px] uppercase tracking-wider transition-all active:scale-95 flex items-center gap-1.5 shadow-lg shadow-emerald-600/20">
                                <i class="fas fa-oil-can"></i> Servicio
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Error al cargar mantenimiento de unidades:', err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-red-500 font-bold uppercase tracking-wider text-xs">Error al cargar datos: ${err.message}</td></tr>`;
    }
}

async function toggleUnitFuelMonitoring(id_unidad, currentStatus) {
    const session = checkAuth();
    if (!session) return;

    const newStatus = !currentStatus;
    try {
        const { error } = await window.supabaseClient
            .from('cat_unidades')
            .update({ registra_combustible: newStatus })
            .eq('id_unidad', id_unidad);

        if (error) throw error;

        showToast(newStatus ? 'Monitoreo de diésel activado.' : 'Monitoreo de diésel desactivado.');
        await loadMaintUnidades();
    } catch (err) {
        console.error('Error al cambiar monitoreo de diésel:', err);
        alert('Error al cambiar monitoreo de diésel: ' + err.message);
    }
}

async function updateLiveKilometraje(id_unidad) {
    const input = document.getElementById(`km-live-${id_unidad}`);
    if (!input) return;
    const value = parseInt(input.value) || 0;

    try {
        const { error } = await window.supabaseClient
            .from('cat_unidades')
            .update({ kilometraje_actual: value })
            .eq('id_unidad', id_unidad);

        if (error) throw error;
        showToast('Kilometraje actualizado correctamente.');
        await loadMaintUnidades();
    } catch (err) {
        alert('Error al actualizar kilometraje: ' + err.message);
    }
}

async function updateOilChangeMileage(id_unidad) {
    const input = document.getElementById(`oil-km-${id_unidad}`);
    if (!input) return;
    const value = parseInt(input.value) || 0;

    try {
        const { error } = await window.supabaseClient
            .from('cat_unidades')
            .update({ ultimo_cambio_aceite_km: value })
            .eq('id_unidad', id_unidad);

        if (error) throw error;
        showToast('Kilometraje de cambio de aceite actualizado.');
        await loadMaintUnidades();
    } catch (err) {
        alert('Error al actualizar kilometraje de cambio: ' + err.message);
    }
}

async function updateUnitTermo(id_unidad, id_termo) {
    try {
        const val = id_termo === "" ? null : id_termo;
        const { error } = await window.supabaseClient
            .from('cat_unidades')
            .update({ id_termo: val })
            .eq('id_unidad', id_unidad);

        if (error) throw error;
        showToast('Termo asignado con éxito.');
        await loadMaintUnidades();
    } catch (err) {
        alert('Error al asignar termo: ' + err.message);
    }
}

async function performOilChangeService(id_unidad) {
    if (!confirm('¿Confirmar que se realizó el cambio de aceite para esta unidad? Esto restablecerá el kilometraje recorrido.')) return;

    try {
        // 1. Obtener kilometraje actual vivo de la unidad
        const { data: unit, error: fetchErr } = await window.supabaseClient
            .from('cat_unidades')
            .select('kilometraje_actual')
            .eq('id_unidad', id_unidad)
            .single();

        if (fetchErr) throw fetchErr;

        const currentKm = unit ? (unit.kilometraje_actual || 0) : 0;
        const todayStr = new Date().toISOString().split('T')[0];

        // 2. Actualizar kilometraje de cambio al vivo y setear fecha de hoy
        const { error } = await window.supabaseClient
            .from('cat_unidades')
            .update({ 
                ultimo_cambio_aceite_km: currentKm,
                ultimo_cambio_aceite_fecha: todayStr
            })
            .eq('id_unidad', id_unidad);

        if (error) throw error;
        showToast('¡Servicio de cambio de aceite registrado con éxito!');
        await loadMaintUnidades();
    } catch (err) {
        alert('Error al registrar servicio: ' + err.message);
    }
}

async function showUnitMaintDetail(id_unidad) {
    const modal = document.getElementById('detail-modal');
    const content = document.getElementById('modal-content');
    const title = document.getElementById('modal-title');

    if (!modal || !content || !title) return;

    title.innerHTML = `<i class="fas fa-oil-can text-blue-500"></i> Detalle de Kilometraje y Aceite - ECO: ${id_unidad}`;
    modal.classList.remove('hidden');

    content.innerHTML = `
        <div class="flex items-center justify-center p-20">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span class="ml-3 text-xs font-bold uppercase tracking-wider text-slate-400">Cargando historial de unidad...</span>
        </div>
    `;

    try {
        const [unitRes, tripsRes, expensesRes, driversRes] = await Promise.all([
            window.supabaseClient.from('cat_unidades').select('*').eq('id_unidad', id_unidad).single(),
            window.supabaseClient.from('reg_viajes').select('*').eq('id_unidad', id_unidad).order('fecha', { ascending: false }),
            window.supabaseClient.from('reg_gastos').select('*').eq('id_unidad', id_unidad).order('fecha', { ascending: false }),
            window.supabaseClient.from('cat_choferes').select('*')
        ]);

        if (unitRes.error) throw unitRes.error;
        if (tripsRes.error) throw tripsRes.error;
        if (expensesRes.error) throw expensesRes.error;

        const u = unitRes.data;
        const trips = tripsRes.data || [];
        const expenses = expensesRes.data || [];
        const drivers = driversRes.data || [];

        const driverMap = {};
        drivers.forEach(d => { driverMap[d.id_chofer] = d.nombre; });

        const driverName = driverMap[u.id_chofer] || u.id_chofer || 'Sin chofer asignado';
        const kmActual = u.kilometraje_actual || 0;
        const kmUltimo = u.ultimo_cambio_aceite_km || 0;
        const recorrido = kmActual - kmUltimo;
        const limiteKm = 25000;
        const restante = limiteKm - recorrido;
        const isUrgent = recorrido >= limiteKm;

        let recorridoColorClass = 'text-green-400';
        if (recorrido >= 25000) {
            recorridoColorClass = 'text-red-500 animate-pulse';
        } else if (recorrido >= 15000) {
            recorridoColorClass = 'text-yellow-400';
        }

        const lastChangeDate = u.ultimo_cambio_aceite_fecha || 'No registrada';

        // Filtrar viajes realizados desde la fecha del último cambio de aceite
        let tripsSinceLastChange = [];
        if (u.ultimo_cambio_aceite_fecha) {
            tripsSinceLastChange = trips.filter(v => v.fecha >= u.ultimo_cambio_aceite_fecha);
        } else {
            tripsSinceLastChange = trips;
        }

        // Filtrar gastos que tengan registros de odómetro
        const odoExpenses = expenses.filter(g => g.kmts_actuales > 0 || g.kmts_anteriores > 0);

        let html = `
            <div class="space-y-8">
                <!-- Resumen Mantenimiento Cards -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <!-- Tarjeta Km Actual -->
                    <div class="bg-slate-950/40 p-5 rounded-2xl border border-white/5 flex flex-col justify-between">
                        <span class="text-[9px] text-slate-500 uppercase font-black tracking-widest font-mono">Kilometraje Vivo</span>
                        <div class="text-xl font-bold text-white mt-1">${kmActual.toLocaleString()} km</div>
                        <span class="text-[9px] text-slate-400 mt-1">Última lectura en base de datos</span>
                    </div>

                    <!-- Tarjeta Último Cambio -->
                    <div class="bg-slate-950/40 p-5 rounded-2xl border border-white/5 flex flex-col justify-between">
                        <span class="text-[9px] text-slate-500 uppercase font-black tracking-widest font-mono">Último Cambio</span>
                        <div class="text-xl font-bold text-white mt-1">${kmUltimo.toLocaleString()} km</div>
                        <span class="text-[9px] text-slate-400 mt-1">Fecha: ${lastChangeDate}</span>
                    </div>

                    <!-- Tarjeta Recorrido -->
                    <div class="bg-slate-950/40 p-5 rounded-2xl border border-white/5 flex flex-col justify-between">
                        <span class="text-[9px] text-slate-500 uppercase font-black tracking-widest font-mono">Distancia Recorrida</span>
                        <div class="text-xl font-bold ${recorridoColorClass} mt-1">${recorrido.toLocaleString()} km</div>
                        <span class="text-[9px] text-slate-400 mt-1">Kilómetros acumulados</span>
                    </div>

                    <!-- Tarjeta Estatus / Restante -->
                    <div class="bg-slate-950/40 p-5 rounded-2xl border border-white/5 flex flex-col justify-between">
                        <span class="text-[9px] text-slate-500 uppercase font-black tracking-widest font-mono">Estatus Servicio</span>
                        <div class="text-base font-black ${isUrgent ? 'text-red-400' : 'text-blue-400'} mt-1">
                            ${isUrgent ? '¡CAMBIO URGENTE!' : restante > 0 ? `${restante.toLocaleString()} km restan` : 'Excedido'}
                        </div>
                        <span class="text-[9px] text-slate-400 mt-1">Límite: ${limiteKm.toLocaleString()} km</span>
                    </div>
                </div>

                <!-- Info Chofer -->
                <div class="bg-slate-950/20 p-4 rounded-xl border border-white/5 flex items-center justify-between text-xs">
                    <div>
                        <span class="text-slate-500 font-bold uppercase tracking-wider mr-2">Chofer Asignado:</span>
                        <span class="text-white font-black">${driverName}</span>
                    </div>
                    <div>
                        <span class="text-slate-500 font-bold uppercase tracking-wider mr-2">Placas:</span>
                        <span class="text-slate-300 font-mono">${u.placas || 'N/A'}</span>
                    </div>
                </div>

                <!-- Tablas de Detalle -->
                <div class="space-y-6">
                    <!-- Viajes desde el último cambio de aceite -->
                    <div>
                        <div class="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
                            <h4 class="font-black text-white text-xs uppercase tracking-wider flex items-center gap-2">
                                <i class="fas fa-route text-blue-500"></i> 
                                Viajes Registrados desde Último Cambio (${tripsSinceLastChange.length})
                            </h4>
                            <span class="text-[9px] text-slate-500 font-bold">Desde: ${lastChangeDate}</span>
                        </div>
                        
                        <div class="max-h-60 overflow-y-auto rounded-xl border border-white/5">
                            <table class="w-full text-left text-xs">
                                <thead class="bg-white/[0.02] text-slate-500 text-[9px] uppercase font-black tracking-widest text-center">
                                    <tr>
                                        <th class="px-4 py-3 text-left">Fecha</th>
                                        <th class="px-4 py-3 text-left">ID Viaje</th>
                                        <th class="px-4 py-3 text-left">Cliente</th>
                                        <th class="px-4 py-3 text-left">Ruta</th>
                                        <th class="px-4 py-3 text-left">Chofer</th>
                                        <th class="px-4 py-3 text-right">Flete</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-white/5 text-slate-300">
                                    ${tripsSinceLastChange.length === 0 ? `
                                        <tr><td colspan="6" class="p-6 text-center italic text-slate-500">No hay viajes registrados desde el último cambio de aceite.</td></tr>
                                    ` : tripsSinceLastChange.map(v => `
                                        <tr class="hover:bg-white/[0.01]">
                                            <td class="px-4 py-3 font-semibold">${v.fecha}</td>
                                            <td class="px-4 py-3 font-mono font-bold text-white">${v.id_viaje}</td>
                                            <td class="px-4 py-3">${v.cliente}</td>
                                            <td class="px-4 py-3 text-slate-400">${v.origen} → ${v.destino}</td>
                                            <td class="px-4 py-3">${driverMap[v.id_chofer] || v.id_chofer || '-'}</td>
                                            <td class="px-4 py-3 text-right font-bold text-blue-400 font-mono">$${(parseFloat(v.monto_flete) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Lecturas de Odómetro en Cargas de Diésel / Gastos -->
                    <div>
                        <div class="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
                            <h4 class="font-black text-white text-xs uppercase tracking-wider flex items-center gap-2">
                                <i class="fas fa-tachometer-alt text-emerald-500"></i> 
                                Lecturas de Odómetro y Combustible (${odoExpenses.length})
                            </h4>
                        </div>
                        
                        <div class="max-h-60 overflow-y-auto rounded-xl border border-white/5">
                            <table class="w-full text-left text-xs">
                                <thead class="bg-white/[0.02] text-slate-500 text-[9px] uppercase font-black tracking-widest text-center">
                                    <tr>
                                        <th class="px-4 py-3 text-left">Fecha</th>
                                        <th class="px-4 py-3 text-left">Concepto</th>
                                        <th class="px-4 py-3 text-center">Odómetro Ant.</th>
                                        <th class="px-4 py-3 text-center">Odómetro Act.</th>
                                        <th class="px-4 py-3 text-center">Km Recorridos</th>
                                        <th class="px-4 py-3 text-center">Litros</th>
                                        <th class="px-4 py-3 text-left">Acreedor / Chofer</th>
                                        <th class="px-4 py-3 text-right">Monto</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-white/5 text-slate-300">
                                    ${odoExpenses.length === 0 ? `
                                        <tr><td colspan="8" class="p-6 text-center italic text-slate-500">No hay lecturas de odómetro registradas en gastos para esta unidad.</td></tr>
                                    ` : odoExpenses.map(g => {
                                        const isNewerThanService = lastChangeDate !== 'No registrada' && g.fecha >= lastChangeDate;
                                        const rowHighlight = isNewerThanService ? 'bg-blue-500/[0.02] text-white' : 'text-slate-400';
                                        return `
                                            <tr class="hover:bg-white/[0.01] ${rowHighlight}">
                                                <td class="px-4 py-3 font-semibold">${g.fecha} ${isNewerThanService ? '<span class="text-[7px] bg-blue-500/20 text-blue-400 px-1 py-0.5 rounded font-black uppercase ml-1">Nuevo</span>' : ''}</td>
                                                <td class="px-4 py-3 font-bold">${g.concepto}</td>
                                                <td class="px-4 py-3 text-center font-mono font-medium">${(g.kmts_anteriores || 0).toLocaleString()}</td>
                                                <td class="px-4 py-3 text-center font-mono font-bold text-slate-200">${(g.kmts_actuales || 0).toLocaleString()}</td>
                                                <td class="px-4 py-3 text-center font-mono font-bold text-emerald-400">+${(g.kmts_recorridos || 0).toLocaleString()}</td>
                                                <td class="px-4 py-3 text-center font-mono">${(g.litros_rellenados || 0).toLocaleString()} L</td>
                                                <td class="px-4 py-3">${g.acreedor_nombre || driverMap[g.id_chofer] || g.id_chofer || '-'}</td>
                                                <td class="px-4 py-3 text-right font-bold font-mono text-amber-500">$${(parseFloat(g.monto) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
        content.innerHTML = html;

    } catch (err) {
        console.error('Error al cargar detalle de mantenimiento:', err);
        content.innerHTML = `
            <div class="p-8 text-center text-red-500 font-bold uppercase tracking-wider text-xs">
                <i class="fas fa-exclamation-circle text-2xl mb-2"></i><br>
                Error al cargar datos del detalle: ${err.message}
            </div>
        `;
    }
}

async function loadMaintTermos() {
    const loader = document.getElementById('maint-termos-loader');
    const tbody = document.getElementById('maint-termos-body');
    if (loader) loader.classList.remove('hidden');
    if (tbody) tbody.innerHTML = '';

    try {
        const { data: termos, error } = await window.supabaseClient
            .from('cat_termos')
            .select('*')
            .order('id_termo');

        if (error) throw error;

        if (loader) loader.classList.add('hidden');

        if (!termos || termos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-500 font-bold uppercase tracking-wider text-xs">No hay termos registrados</td></tr>`;
            return;
        }

        tbody.innerHTML = termos.map(t => `
            <tr class="hover:bg-white/[0.01] transition-colors border-b border-white/5 last:border-0">
                <td class="px-6 py-4 font-black text-white text-xs tracking-tight">${t.id_termo}</td>
                <td class="px-6 py-4 font-bold text-slate-200 text-xs">${t.marca || '-'}</td>
                <td class="px-6 py-4 text-slate-400 text-xs font-semibold">${t.modelo || '-'}</td>
                <td class="px-6 py-4">
                    <span class="text-[10px] font-bold ${t.estatus === 'Activo' ? 'text-green-500' : 'text-slate-400'} uppercase">
                        ● ${t.estatus || 'Activo'}
                    </span>
                </td>
                <td class="px-6 py-4 text-right">
                    <button onclick="eliminarTermo('${t.id_termo}')" title="Eliminar Termo" 
                        class="text-red-500 hover:text-red-400 p-2 hover:bg-red-500/10 rounded-lg transition-all">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Error al cargar termos:', err);
        if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-500 font-bold uppercase tracking-wider text-xs">Error al cargar datos: ${err.message}</td></tr>`;
    }
}

function showTermoForm() {
    document.getElementById('termo-list-container').classList.add('hidden');
    document.getElementById('termo-form-container').classList.remove('hidden');
}

function hideTermoForm() {
    document.getElementById('termo-list-container').classList.remove('hidden');
    document.getElementById('termo-form-container').classList.add('hidden');
    document.getElementById('termo-form').reset();
}

async function registrarTermo(e) {
    e.preventDefault();
    const btn = document.getElementById('termo-submit-btn');
    const originalText = btn.innerText;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    btn.disabled = true;

    const payload = {
        id_termo: document.getElementById('termo-id').value.trim(),
        marca: document.getElementById('termo-marca').value.trim(),
        modelo: document.getElementById('termo-modelo').value.trim(),
        estatus: 'Activo'
    };

    try {
        const { error } = await window.supabaseClient
            .from('cat_termos')
            .insert([payload]);

        if (error) throw error;

        showToast('¡Termo registrado con éxito!');
        hideTermoForm();
        await loadMaintTermos();
    } catch (err) {
        alert('Error al registrar termo: ' + err.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

async function eliminarTermo(id) {
    if (!confirm(`¿Desea eliminar definitivamente el termo "${id}"?`)) return;

    try {
        const { error } = await window.supabaseClient
            .from('cat_termos')
            .delete()
            .eq('id_termo', id);

        if (error) throw error;

        showToast('Termo eliminado.');
        await loadMaintTermos();
    } catch (err) {
        alert('Error al eliminar termo: ' + err.message);
    }
}

// Auxiliar para mostrar pequeñas notificaciones toast
function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = "fixed bottom-5 left-5 bg-slate-900 border border-white/10 text-white px-5 py-3 rounded-2xl shadow-2xl z-[11000] text-xs font-bold uppercase tracking-wider animate-in slide-in-from-bottom duration-300";
    toast.innerHTML = `<i class="fas fa-check-circle text-green-500 mr-2"></i> ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('animate-out', 'fade-out', 'slide-out-to-bottom');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

async function loadSaulConnectionStatus() {
    const statusDot = document.getElementById('saul-conn-dot');
    const statusTime = document.getElementById('saul-conn-time');
    if (!statusTime) return;

    try {
        const { data, error } = await window.supabaseClient
            .from(DB_CONFIG.tableUsuarios)
            .select('ultimo_acceso')
            .eq('usuario', 'saulrivas@gmail.com')
            .single();

        if (error) throw error;

        if (data && data.ultimo_acceso) {
            const lastAccess = new Date(data.ultimo_acceso);
            const now = new Date();
            const diffMs = now - lastAccess;
            const diffMins = Math.floor(diffMs / 60000);

            // Formatear hora y fecha
            const timeStr = lastAccess.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const dateStr = lastAccess.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' });

            if (diffMins < 5) {
                // Conectado hace menos de 5 minutos: Activo
                if (statusDot) {
                    statusDot.className = 'w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse';
                }
                statusTime.innerHTML = `Activo ahora (${timeStr})`;
            } else {
                // Inactivo
                if (statusDot) {
                    statusDot.className = 'w-2.5 h-2.5 bg-slate-500 rounded-full';
                }
                statusTime.innerHTML = `Visto hace ${diffMins} min (${dateStr} ${timeStr})`;
            }
        } else {
            if (statusDot) {
                statusDot.className = 'w-2.5 h-2.5 bg-slate-500 rounded-full';
            }
            statusTime.innerHTML = 'Nunca';
        }
    } catch (e) {
        console.error('Error al cargar conexión de Saúl:', e);
        statusTime.innerHTML = 'Error';
    }
}

// --- TABLERO DE GANANCIAS Y RENTABILIDAD POR UNIDAD ---
function setupGananciasDateFilters() {
    const startInput = document.getElementById('ganancias-filter-start');
    const endInput = document.getElementById('ganancias-filter-end');
    if (!startInput || !endInput) return;

    const today = new Date();
    const lastMonth = new Date();
    lastMonth.setDate(today.getDate() - 30);

    startInput.value = getLocalISODate(lastMonth);
    endInput.value = getLocalISODate(today);
}

let earningsChartInstance = null;

async function loadProfitDashboard() {
    const start = document.getElementById('ganancias-filter-start')?.value;
    const end = document.getElementById('ganancias-filter-end')?.value;
    const periodLabel = document.getElementById('ganancias-period-label');
    const tableBody = document.getElementById('ganancias-table-body');
    if (!start || !end) return;

    if (periodLabel) periodLabel.innerText = `Periodo: ${start} al ${end}`;
    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" class="px-8 py-10 text-center text-slate-400">
                    <div class="flex items-center justify-center gap-3">
                        <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500"></div>
                        <span class="text-xs font-bold uppercase tracking-wider font-mono">Calculando rentabilidad de flota...</span>
                    </div>
                </td>
            </tr>
        `;
    }

    try {
        // Cargar datos en paralelo
        const [viajesRaw, gastosRaw, unidadesRaw, choferesRaw] = await Promise.all([
            fetchSupabaseData(DB_CONFIG.tableViajes, 'fecha', start, end),
            fetchSupabaseData(DB_CONFIG.tableGastos, 'fecha', start, end),
            fetchSupabaseData(DB_CONFIG.tableUnidades),
            fetchSupabaseData(DB_CONFIG.tableChoferes)
        ]);

        // Almacenar en window para reutilizar en el modal de detalles
        window.gananciasViajesRaw = viajesRaw;
        window.gananciasGastosRaw = gastosRaw;
        window.gananciasUnidadesRaw = unidadesRaw;
        window.gananciasChoferesRaw = choferesRaw;
        window.gananciasPeriodStart = start;
        window.gananciasPeriodEnd = end;

        // Mapeo de IDs de operadores a nombres para fácil acceso
        const driverMap = {};
        choferesRaw.forEach(c => {
            driverMap[c.id_chofer] = c.nombre;
        });

        // Totales globales de consolidación
        let totalIngresos = 0;
        let totalGastosDirectos = 0;
        let totalGastosGenerales = 0;
        let totalComisiones = 0;

        // Estructura para agrupar por ECO
        const unitProfitMap = {};

        // Inicializar el mapa con las unidades del catálogo para reflejar ECOs inactivas
        unidadesRaw.forEach(unit => {
            const driverName = driverMap[unit.id_chofer] || unit.id_chofer || 'Sin asignar';
            unitProfitMap[unit.id_unidad] = {
                id_unidad: unit.id_unidad,
                alias: unit.nombre_unidad || 'Sin alias',
                chofer: driverName,
                viajes: 0,
                ingresos: 0,
                gastos: 0,
                comisiones: 0,
                ganancia: 0,
                margen: 0
            };
        });

        // Consolidar ingresos y comisiones desde viajes
        viajesRaw.forEach(v => {
            const flete = parseFloat(v.monto_flete) || 0;
            const comision = parseFloat(v.comision_chofer) || 0;
            totalIngresos += flete;
            totalComisiones += comision;

            const unitId = v.id_unidad;
            if (unitId) {
                if (!unitProfitMap[unitId]) {
                    unitProfitMap[unitId] = {
                        id_unidad: unitId,
                        alias: 'Desconocida',
                        chofer: 'Sin asignar',
                        viajes: 0,
                        ingresos: 0,
                        gastos: 0,
                        comisiones: 0,
                        ganancia: 0,
                        margen: 0
                    };
                }
                unitProfitMap[unitId].viajes += 1;
                unitProfitMap[unitId].ingresos += flete;
                unitProfitMap[unitId].comisiones += comision;
            }
        });

        // Consolidar gastos (Directos vs Generales/Indirectos)
        gastosRaw.forEach(g => {
            // EXCLUSIÓN DE NÓMINA Y COMISIONES: No debe afectar las ganancias netas ya que se descuentan de comisiones
            const concepto = g.concepto || '';
            const conceptoLower = concepto.toLowerCase();
            if (conceptoLower === 'nómina' || conceptoLower === 'nomina' || conceptoLower === 'comisión chofer' || conceptoLower === 'comision chofer') {
                return;
            }

            const monto = parseFloat(g.monto) || 0;
            const unitId = g.id_unidad;

            if (unitId) {
                totalGastosDirectos += monto;
                if (!unitProfitMap[unitId]) {
                    unitProfitMap[unitId] = {
                        id_unidad: unitId,
                        alias: 'Desconocida',
                        chofer: 'Sin asignar',
                        viajes: 0,
                        ingresos: 0,
                        gastos: 0,
                        comisiones: 0,
                        ganancia: 0,
                        margen: 0
                    };
                }
                unitProfitMap[unitId].gastos += monto;
            } else {
                totalGastosGenerales += monto;
            }
        });

        // Calcular ganancias netas y márgenes de rentabilidad individuales
        const unitsArray = Object.values(unitProfitMap);
        unitsArray.forEach(up => {
            up.ganancia = up.ingresos - up.gastos - up.comisiones;
            up.margen = up.ingresos > 0 ? (up.ganancia / up.ingresos) * 100 : 0;
        });

        // Calcular totales acumulados
        const totalGastosTodos = totalGastosDirectos + totalGastosGenerales;
        const gananciaNetaGlobal = totalIngresos - totalGastosTodos - totalComisiones;
        const margenGlobal = totalIngresos > 0 ? (gananciaNetaGlobal / totalIngresos) * 100 : 0;

        // Renderizar KPIs
        const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
        
        safeSetText('ganancias-kpi-ingresos', fmt(totalIngresos));
        safeSetText('ganancias-kpi-gastos-directos', fmt(totalGastosDirectos));
        safeSetText('ganancias-kpi-gastos-generales', fmt(totalGastosGenerales));
        safeSetText('ganancias-kpi-comisiones', fmt(totalComisiones));
        safeSetText('ganancias-kpi-neta', fmt(gananciaNetaGlobal));

        const margenEl = document.getElementById('ganancias-kpi-margen');
        if (margenEl) {
            margenEl.innerText = `Margen: ${margenGlobal.toFixed(1)}%`;
            if (gananciaNetaGlobal < 0) {
                margenEl.className = 'text-[9px] text-red-400 block mt-1 font-bold';
            } else {
                margenEl.className = 'text-[9px] text-green-500 block mt-1 font-bold';
            }
        }

        // Renderizar tabla
        if (tableBody) {
            if (unitsArray.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="9" class="px-8 py-10 text-center text-slate-500 italic">
                            No hay unidades configuradas en el catálogo.
                        </td>
                    </tr>
                `;
            } else {
                // Ordenar por Ganancia Neta de manera descendente
                unitsArray.sort((a, b) => b.ganancia - a.ganancia);

                tableBody.innerHTML = unitsArray.map(up => {
                    const gananciaClass = up.ganancia < 0 ? 'text-red-400 font-bold' : (up.ganancia > 0 ? 'text-green-400 font-bold' : 'text-slate-400');
                    const margenClass = up.margen < 0 ? 'bg-red-500/10 text-red-400 border border-red-500/15' : (up.margen > 15 ? 'bg-green-500/10 text-green-400 border border-green-500/15' : 'bg-blue-500/10 text-blue-400 border border-blue-500/15');
                    
                    return `
                        <tr class="hover:bg-white/[0.02] transition-colors">
                            <td class="px-6 py-4">
                                <div class="font-black text-white text-xs tracking-tight">${up.id_unidad}</div>
                                <div class="text-[9px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">${up.alias}</div>
                            </td>
                            <td class="px-6 py-4 font-bold text-slate-300 text-xs">${up.chofer}</td>
                            <td class="px-6 py-4 text-center font-bold text-slate-400 text-xs">${up.viajes}</td>
                            <td class="px-6 py-4 text-right font-semibold text-blue-400 font-mono text-xs">${fmt(up.ingresos)}</td>
                            <td class="px-6 py-4 text-right font-semibold text-amber-500 font-mono text-xs">${fmt(up.gastos)}</td>
                            <td class="px-6 py-4 text-right font-semibold text-purple-400 font-mono text-xs">${fmt(up.comisiones)}</td>
                            <td class="px-6 py-4 text-right font-mono text-xs ${gananciaClass}">${fmt(up.ganancia)}</td>
                            <td class="px-6 py-4 text-center">
                                <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${margenClass}">
                                    ${up.margen.toFixed(1)}%
                                </span>
                            </td>
                            <td class="px-6 py-4 text-center">
                                <button onclick="showUnitProfitDetail('${up.id_unidad}')"
                                    class="px-4 py-1.5 bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] uppercase tracking-widest rounded-lg border border-white/5 transition-all active:scale-95">
                                    Ver Detalle
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');
            }
        }

        // Renderizar o actualizar gráfico
        renderProfitChart(unitsArray);

    } catch (err) {
        console.error('Error al calcular rentabilidad de flota:', err);
        showToast('Error: ' + err.message);
    }
}

function renderProfitChart(unitsArray) {
    const canvas = document.getElementById('earningsChart');
    if (!canvas) return;

    // Solo graficar unidades con algún tipo de movimiento
    const activeUnits = unitsArray.filter(u => u.viajes > 0 || u.ingresos > 0 || u.gastos > 0);
    activeUnits.sort((a, b) => b.ganancia - a.ganancia);

    const labels = activeUnits.map(u => `${u.id_unidad} (${u.chofer})`);
    const ingresosData = activeUnits.map(u => u.ingresos);
    const costosData = activeUnits.map(u => u.gastos + u.comisiones);
    const gananciasData = activeUnits.map(u => u.ganancia);

    if (earningsChartInstance) {
        earningsChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    earningsChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Ingresos (Fletes)',
                    data: ingresosData,
                    backgroundColor: 'rgba(59, 130, 246, 0.5)',
                    borderColor: 'rgb(59, 130, 246)',
                    borderWidth: 1.5,
                    borderRadius: 6
                },
                {
                    label: 'Costos (Gastos + Comisiones)',
                    data: costosData,
                    backgroundColor: 'rgba(239, 68, 68, 0.5)',
                    borderColor: 'rgb(239, 68, 68)',
                    borderWidth: 1.5,
                    borderRadius: 6
                },
                {
                    label: 'Ganancia Neta',
                    data: gananciasData,
                    backgroundColor: 'rgba(34, 197, 94, 0.6)',
                    borderColor: 'rgb(34, 197, 94)',
                    borderWidth: 1.5,
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#94a3b8',
                        font: {
                            family: 'Outfit, sans-serif',
                            weight: 'bold',
                            size: 11
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: '#94a3b8',
                        font: { family: 'Outfit, sans-serif', weight: 'bold' }
                    }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#94a3b8',
                        font: { family: 'Outfit, sans-serif', weight: 'bold' },
                        callback: function(value) {
                            return '$' + value.toLocaleString();
                        }
                    }
                }
            }
        }
    });
}

function showUnitProfitDetail(id_unidad) {
    const modal = document.getElementById('detail-modal');
    const content = document.getElementById('modal-content');
    const title = document.getElementById('modal-title');

    if (!modal || !content || !title) return;

    // Filtrar viajes y gastos en memoria
    const viajes = (window.gananciasViajesRaw || []).filter(v => String(v.id_unidad) == String(id_unidad));
    const gastos = (window.gananciasGastosRaw || []).filter(g => {
        const concepto = g.concepto || '';
        const conceptoLower = concepto.toLowerCase();
        const isNomina = conceptoLower === 'nómina' || conceptoLower === 'nomina';
        const isComision = conceptoLower === 'comisión chofer' || conceptoLower === 'comision chofer';
        return String(g.id_unidad) == String(id_unidad) && !isNomina && !isComision;
    });
    const start = window.gananciasPeriodStart || '';
    const end = window.gananciasPeriodEnd || '';

    title.innerHTML = `<i class="fas fa-chart-line text-green-500"></i> Desglose Rentabilidad ECO: ${id_unidad}`;
    modal.classList.remove('hidden');

    const fmt = (n) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);

    // Sumatorias específicas
    const totalVentas = viajes.reduce((acc, v) => acc + (parseFloat(v.monto_flete) || 0), 0);
    const totalComis = viajes.reduce((acc, v) => acc + (parseFloat(v.comision_chofer) || 0), 0);
    const totalGastos = gastos.reduce((acc, g) => acc + (parseFloat(g.monto) || 0), 0);
    const gananciaNeta = totalVentas - totalGastos - totalComis;
    const margen = totalVentas > 0 ? (gananciaNeta / totalVentas) * 100 : 0;

    let html = `
        <div class="space-y-8">
            <!-- Periodo Info -->
            <div class="flex flex-wrap items-center justify-between gap-4 bg-slate-950/40 p-5 rounded-2xl border border-white/5">
                <div>
                    <span class="text-[10px] text-slate-500 uppercase font-black tracking-widest font-mono">Periodo de Análisis</span>
                    <div class="text-sm font-bold text-white mt-1">${start} al ${end}</div>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-6 text-right">
                    <div>
                        <span class="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Ingresos</span>
                        <div class="text-xs font-black text-blue-400 font-mono mt-0.5">${fmt(totalVentas)}</div>
                    </div>
                    <div>
                        <span class="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Gastos Directos</span>
                        <div class="text-xs font-black text-amber-500 font-mono mt-0.5">${fmt(totalGastos)}</div>
                    </div>
                    <div>
                        <span class="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Comisiones</span>
                        <div class="text-xs font-black text-purple-400 font-mono mt-0.5">${fmt(totalComis)}</div>
                    </div>
                    <div>
                        <span class="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Neto (${margen.toFixed(1)}%)</span>
                        <div class="text-xs font-black font-mono mt-0.5 ${gananciaNeta < 0 ? 'text-red-400' : 'text-green-400'}">${fmt(gananciaNeta)}</div>
                    </div>
                </div>
            </div>

            <!-- Tabla de Viajes -->
            <div class="bg-slate-950/20 rounded-2xl border border-white/5 overflow-hidden">
                <div class="p-6 border-b border-white/5 bg-white/[0.01]">
                    <h4 class="font-black text-white text-sm uppercase tracking-wider flex items-center gap-2">
                        <i class="fas fa-route text-blue-400"></i> Viajes Realizados (${viajes.length})
                    </h4>
                </div>
                <div class="max-h-[300px] overflow-y-auto custom-scrollbar">
                    <table class="w-full text-left text-xs text-slate-300">
                        <thead class="bg-white/[0.02] text-[9px] uppercase font-black text-slate-500 tracking-widest sticky top-0 bg-slate-900 z-10 border-b border-white/5">
                            <tr>
                                <th class="px-6 py-3">ID Viaje</th>
                                <th class="px-6 py-3">Fecha</th>
                                <th class="px-6 py-3">Operador</th>
                                <th class="px-6 py-3">Cliente</th>
                                <th class="px-6 py-3">Ruta (Origen / Destino)</th>
                                <th class="px-6 py-3 text-right">Flete</th>
                                <th class="px-6 py-3 text-right">Comisión</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-white/5">
                            ${viajes.length === 0 ? `
                                <tr>
                                    <td colspan="7" class="p-6 text-center text-slate-500 italic">No se registraron viajes para esta unidad en el periodo.</td>
                                </tr>
                            ` : viajes.map(v => `
                                <tr class="hover:bg-white/[0.01] transition-colors">
                                    <td class="px-6 py-3 font-bold text-white">${v.id_viaje}</td>
                                    <td class="px-6 py-3 font-mono">${v.fecha}</td>
                                    <td class="px-6 py-3">${globalDriverMap[v.id_chofer] || v.id_chofer || '-'}</td>
                                    <td class="px-6 py-3">${v.cliente || '-'}</td>
                                    <td class="px-6 py-3 truncate max-w-[200px]">${v.origen || '-'} a ${v.destino || '-'}</td>
                                    <td class="px-6 py-3 text-right text-blue-400 font-mono font-bold">${fmt(v.monto_flete)}</td>
                                    <td class="px-6 py-3 text-right text-purple-400 font-mono">${fmt(v.comision_chofer)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Tabla de Gastos -->
            <div class="bg-slate-950/20 rounded-2xl border border-white/5 overflow-hidden">
                <div class="p-6 border-b border-white/5 bg-white/[0.01]">
                    <h4 class="font-black text-white text-sm uppercase tracking-wider flex items-center gap-2">
                        <i class="fas fa-file-invoice-dollar text-amber-500"></i> Gastos Directos (${gastos.length})
                    </h4>
                </div>
                <div class="max-h-[300px] overflow-y-auto custom-scrollbar">
                    <table class="w-full text-left text-xs text-slate-300">
                        <thead class="bg-white/[0.02] text-[9px] uppercase font-black text-slate-500 tracking-widest sticky top-0 bg-slate-900 z-10 border-b border-white/5">
                            <tr>
                                <th class="px-6 py-3">Concepto</th>
                                <th class="px-6 py-3">Fecha</th>
                                <th class="px-6 py-3">Operador</th>
                                <th class="px-6 py-3">Detalle / Notas</th>
                                <th class="px-6 py-3 text-right">Monto</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-white/5">
                            ${gastos.length === 0 ? `
                                <tr>
                                    <td colspan="5" class="p-6 text-center text-slate-500 italic">No se registraron gastos directos para esta unidad en el periodo.</td>
                                </tr>
                            ` : gastos.map(g => `
                                <tr class="hover:bg-white/[0.01] transition-colors">
                                    <td class="px-6 py-3 font-bold text-white">${g.concepto || 'Gasto'}</td>
                                    <td class="px-6 py-3 font-mono">${g.fecha}</td>
                                    <td class="px-6 py-3">${globalDriverMap[g.id_chofer] || g.id_chofer || '-'}</td>
                                    <td class="px-6 py-3 truncate max-w-[200px]">${g.notas || '-'}</td>
                                    <td class="px-6 py-3 text-right text-amber-500 font-mono font-bold">${fmt(g.monto)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    content.innerHTML = html;
}

// --- LÓGICA DE CONFIGURACIÓN DEL CHAT DE IA ---
function updateModelOptions(provider) {
    const modelSelect = document.getElementById('chat-model-name');
    if (!modelSelect) return;
    
    modelSelect.innerHTML = '';
    if (provider === 'groq') {
        modelSelect.innerHTML = `
            <option value="llama-3.3-70b-versatile" class="bg-slate-900">llama-3.3-70b-versatile (Recomendado - Excelente Inteligencia)</option>
            <option value="llama-3.1-8b-instant" class="bg-slate-900">llama-3.1-8b-instant (Rápido y eficiente)</option>
            <option value="mixtral-8x7b-32768" class="bg-slate-900">mixtral-8x7b-32768 (Mixtral 8x7B)</option>
        `;
    } else if (provider === 'deepseek') {
        modelSelect.innerHTML = `
            <option value="deepseek-v4-pro" class="bg-slate-900">DeepSeek-V4-Pro (Con Thinking Mode - Recomendado)</option>
            <option value="deepseek-v4-flash" class="bg-slate-900">DeepSeek-V4-Flash (Rápido y económico)</option>
            <option value="deepseek-chat" class="bg-slate-900">deepseek-chat (DeepSeek-V3)</option>
            <option value="deepseek-reasoner" class="bg-slate-900">deepseek-reasoner (DeepSeek-R1)</option>
        `;
    } else {
        modelSelect.innerHTML = `
            <option value="gemini-1.5-flash" class="bg-slate-900">gemini-1.5-flash (Estable y rápido)</option>
            <option value="gemini-2.5-flash" class="bg-slate-900">gemini-2.5-flash (Nueva generación rápida)</option>
            <option value="gemini-2.5-flash-lite" class="bg-slate-900">gemini-2.5-flash-lite (Ligero y de bajo consumo)</option>
            <option value="gemini-1.5-pro" class="bg-slate-900">gemini-1.5-pro (Inteligencia avanzada v1.5)</option>
            <option value="gemini-2.5-pro" class="bg-slate-900">gemini-2.5-pro (Máxima inteligencia v2.5)</option>
        `;
    }
}

async function loadChatSettings() {
    console.log('Cargando ajustes de chat...');
    if (!window.supabaseClient) {
        console.error('El cliente de Supabase no está inicializado.');
        return;
    }

    try {
        const { data, error } = await window.supabaseClient
            .from('chat_config')
            .select('*')
            .eq('id', 1)
            .single();

        if (error) {
            console.error('Error al consultar chat_config:', error);
            return;
        }

        if (data) {
            const providerSelect = document.getElementById('chat-provider');
            providerSelect.value = data.provider || 'gemini';
            
            if (!providerSelect.dataset.listenerAttached) {
                providerSelect.addEventListener('change', (e) => {
                    updateModelOptions(e.target.value);
                });
                providerSelect.dataset.listenerAttached = 'true';
            }
            
            updateModelOptions(data.provider || 'gemini');
            document.getElementById('chat-model-name').value = data.model_name || 'gemini-2.5-flash';
            document.getElementById('chat-api-key').value = data.api_key || '';
            document.getElementById('chat-system-instruction').value = data.system_instruction || '';
        }
    } catch (err) {
        console.error('Excepción al cargar ajustes de chat:', err);
    }
}

async function saveChatSettings(e) {
    if (e) e.preventDefault();
    console.log('Guardando ajustes de chat...');

    const btn = document.getElementById('btn-save-chat-settings');
    const originalText = btn.innerHTML;

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Guardando...';

        const provider = document.getElementById('chat-provider').value;
        const model_name = document.getElementById('chat-model-name').value;
        const api_key = document.getElementById('chat-api-key').value.trim();
        const system_instruction = document.getElementById('chat-system-instruction').value.trim();

        const { error } = await window.supabaseClient
            .from('chat_config')
            .update({
                provider,
                model_name,
                api_key,
                system_instruction,
                updated_at: new Date().toISOString()
            })
            .eq('id', 1);

        if (error) throw error;

        alert('✅ Configuración del asistente guardada exitosamente.');
    } catch (err) {
        console.error('Error al guardar ajustes de chat:', err);
        alert('❌ Error al guardar la configuración: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Inicializar manejadores de eventos del chat
function initChatSettingsListeners() {
    const form = document.getElementById('chat-settings-form');
    if (form) {
        form.addEventListener('submit', saveChatSettings);
    }

    const toggleBtn = document.getElementById('toggle-chat-key');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
            const input = document.getElementById('chat-api-key');
            const icon = this.querySelector('i');
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        });
    }
}

// Ejecutar inicialización de escuchas al cargar el archivo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatSettingsListeners);
} else {
    initChatSettingsListeners();
}


// --- LÓGICA DE CAPITAL E INVENTARIO ---

let currentCapitalTab = 'consumibles';
let allCapitalItems = [];
let allCapitalMovements = [];

async function loadCapitalData() {
    console.log('Cargando datos de Capital e Inventario...');
    try {
        // Fetch items and movements
        const [items, movements] = await Promise.all([
            fetchSupabaseData('inventario_capital'),
            fetchSupabaseData('inventario_movimientos')
        ]);
        
        allCapitalItems = items || [];
        // Sort movements by date desc
        allCapitalMovements = (movements || []).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

        renderCapitalKPIs();
        renderCapitalTables();
        populateCapitalDropdowns();
    } catch (err) {
        console.error('Error al cargar datos de capital:', err);
    }
}

function renderCapitalKPIs() {
    // KPI 1: Total Bienes Físicos (Value: quantity * costo_promedio)
    const physicalItems = allCapitalItems.filter(i => i.tipo === 'Bien Físico');
    const totalValueBienes = physicalItems.reduce((acc, curr) => acc + (parseFloat(curr.cantidad || 0) * parseFloat(curr.costo_promedio || 0)), 0);
    const kpiBienes = document.getElementById('kpi-cap-bienes-valor');
    if (kpiBienes) {
        kpiBienes.innerText = '$' + totalValueBienes.toLocaleString('es-MX', { minimumFractionDigits: 2 });
    }

    // KPI 2: Types of Consumibles
    const consumables = allCapitalItems.filter(i => i.tipo === 'Consumible');
    const kpiConsumibles = document.getElementById('kpi-cap-consumibles-tipos');
    if (kpiConsumibles) {
        kpiConsumibles.innerText = consumables.length.toString();
    }

    // KPI 3: Total movements
    const kpiMovimientos = document.getElementById('kpi-cap-movimientos-totales');
    if (kpiMovimientos) {
        kpiMovimientos.innerText = allCapitalMovements.length.toString();
    }
}

function renderCapitalTables() {
    const consumablesTable = document.getElementById('cap-table-consumibles');
    const physicalTable = document.getElementById('cap-table-bienes');
    const movementsTable = document.getElementById('cap-table-movimientos');

    // 1. Render Consumables
    if (consumablesTable) {
        const consumables = allCapitalItems.filter(i => i.tipo === 'Consumible');
        if (consumables.length === 0) {
            consumablesTable.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-slate-500 uppercase tracking-wider font-bold text-xs">No hay consumibles registrados</td></tr>`;
        } else {
            consumablesTable.innerHTML = consumables.map(c => `
                <tr class="hover:bg-white/[0.02] transition-colors border-b border-white/5">
                    <td class="py-4 px-6 font-mono font-bold text-white">${c.id_item}</td>
                    <td class="py-4 px-6 font-bold text-slate-200">${c.nombre}</td>
                    <td class="py-4 px-6 text-slate-400 text-xs">${c.descripcion || '-'}</td>
                    <td class="py-4 px-6 text-right font-mono font-bold ${parseFloat(c.cantidad) <= 5 ? 'text-red-400' : 'text-emerald-400'}">${parseFloat(c.cantidad).toLocaleString('es-MX')} <span class="text-[10px] text-slate-500 font-semibold uppercase">${c.unidad_medida}</span></td>
                    <td class="py-4 px-6 text-right font-mono text-slate-300 font-semibold">$${parseFloat(c.costo_promedio || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                    <td class="py-4 px-6 text-center font-bold">
                        <div class="flex items-center justify-center gap-2">
                            <button onclick="quickActionCapital('uso', '${c.id_item}')" title="Registrar Uso" class="w-7 h-7 rounded-lg bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 flex items-center justify-center transition-all cursor-pointer border-0"><i class="fas fa-wrench text-xs"></i></button>
                            <button onclick="quickActionCapital('entrada', '${c.id_item}')" title="Registrar Entrada/Compra" class="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 flex items-center justify-center transition-all cursor-pointer border-0"><i class="fas fa-dolly text-xs"></i></button>
                        </div>
                    </td>
                </tr>
            `).join('');
        }
    }

    // 2. Render Physical Assets
    if (physicalTable) {
        const physical = allCapitalItems.filter(i => i.tipo === 'Bien Físico');
        if (physical.length === 0) {
            physicalTable.innerHTML = `<tr><td colspan="6" class="p-10 text-center text-slate-500 uppercase tracking-wider font-bold text-xs">No hay bienes físicos registrados</td></tr>`;
        } else {
            physicalTable.innerHTML = physical.map(p => `
                <tr class="hover:bg-white/[0.02] transition-colors border-b border-white/5">
                    <td class="py-4 px-6 font-mono font-bold text-white">${p.id_item}</td>
                    <td class="py-4 px-6 font-bold text-slate-200">${p.nombre}</td>
                    <td class="py-4 px-6 text-slate-400 text-xs">${p.descripcion || '-'}</td>
                    <td class="py-4 px-6 text-right font-mono text-slate-300 font-bold">${parseFloat(p.cantidad).toLocaleString('es-MX')} <span class="text-[10px] text-slate-500 font-semibold uppercase">${p.unidad_medida}</span></td>
                    <td class="py-4 px-6 text-right font-mono text-blue-400 font-black">$${(parseFloat(p.cantidad) * parseFloat(p.costo_promedio || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                    <td class="py-4 px-6 text-center font-bold">
                        <div class="flex items-center justify-center gap-2">
                            <button onclick="quickActionCapital('entrada', '${p.id_item}')" title="Aumentar Stock / Compra" class="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 flex items-center justify-center transition-all cursor-pointer border-0"><i class="fas fa-plus text-xs"></i></button>
                            <button onclick="quickActionCapital('uso', '${p.id_item}')" title="Dar de Baja / Retirar" class="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition-all cursor-pointer border-0"><i class="fas fa-minus text-xs"></i></button>
                        </div>
                    </td>
                </tr>
            `).join('');
        }
    }

    // 3. Render Movements
    renderMovementsTable(allCapitalMovements);
}

function renderMovementsTable(movements) {
    const movementsTable = document.getElementById('cap-table-movimientos');
    if (!movementsTable) return;

    if (movements.length === 0) {
        movementsTable.innerHTML = `<tr><td colspan="7" class="p-10 text-center text-slate-500 uppercase tracking-wider font-bold text-xs">No hay movimientos registrados</td></tr>`;
    } else {
        movementsTable.innerHTML = movements.map(m => {
            const item = allCapitalItems.find(i => i.id_item === m.id_item) || { nombre: m.id_item, unidad_medida: '' };
            const total = parseFloat(m.cantidad) * parseFloat(m.precio_unitario || 0);
            const badge = m.tipo_movimiento === 'Entrada' 
                ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-green-500/10 text-green-400 border border-green-500/20"><i class="fas fa-arrow-down mr-1"></i>Entrada</span>`
                : `<span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-500/10 text-orange-400 border border-orange-500/20"><i class="fas fa-arrow-up mr-1"></i>Salida</span>`;
            
            return `
                <tr class="hover:bg-white/[0.02] transition-colors border-b border-white/5">
                    <td class="py-4 px-6 text-slate-400 text-xs font-mono">${m.fecha}</td>
                    <td class="py-4 px-6 font-bold text-slate-200">${item.nombre} <span class="text-[9px] text-slate-500 font-mono font-bold block">${m.id_item}</span></td>
                    <td class="py-4 px-6">${badge}</td>
                    <td class="py-4 px-6 text-right font-mono font-bold text-slate-300">${m.tipo_movimiento === 'Entrada' ? '+' : '-'}${parseFloat(m.cantidad).toLocaleString('es-MX')} <span class="text-[10px] text-slate-500 uppercase">${item.unidad_medida}</span></td>
                    <td class="py-4 px-6 text-right font-mono text-slate-400">$${parseFloat(m.precio_unitario || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                    <td class="py-4 px-6 text-right font-mono font-semibold text-slate-300">$${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                    <td class="py-4 px-6 text-slate-400 text-xs truncate max-w-[200px]" title="${m.observaciones || ''}">
                        ${m.observaciones || '-'}
                        ${m.id_unidad ? `<span class="block text-[9px] text-blue-400 font-semibold font-mono">Unidad: ${m.id_unidad}</span>` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    }
}

function filterCapitalMovements() {
    const q = document.getElementById('cap-search-mov')?.value.trim().toLowerCase();
    if (!q) {
        renderMovementsTable(allCapitalMovements);
        return;
    }

    const filtered = allCapitalMovements.filter(m => {
        const item = allCapitalItems.find(i => i.id_item === m.id_item) || { nombre: '', descripcion: '' };
        return m.id_item.toLowerCase().includes(q) || 
               item.nombre.toLowerCase().includes(q) || 
               (m.observaciones || '').toLowerCase().includes(q);
    });

    renderMovementsTable(filtered);
}

function switchCapitalTab(tabName) {
    currentCapitalTab = tabName;
    
    // Toggle active classes on tab buttons
    document.querySelectorAll('.cap-tab').forEach(b => {
        b.classList.remove('bg-blue-600', 'text-white', 'shadow-lg');
        b.classList.add('text-slate-500', 'hover:text-white');
    });

    const activeBtn = document.getElementById('cap-tab-' + tabName);
    if (activeBtn) {
        activeBtn.classList.remove('text-slate-500', 'hover:text-white');
        activeBtn.classList.add('bg-blue-600', 'text-white', 'shadow-lg');
    }

    // Toggle active sections
    document.querySelectorAll('.cap-view').forEach(v => v.classList.add('hidden'));
    const activeView = document.getElementById('cap-view-' + tabName);
    if (activeView) activeView.classList.remove('hidden');
}

function openCapitalModal(modalType) {
    const modal = document.getElementById('capital-modal-' + modalType);
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        
        // Reset form
        const form = document.getElementById('capital-form-' + modalType);
        if (form) form.reset();

        // Set default dates to today
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        if (modalType === 'entrada') {
            document.getElementById('cap-ent-fecha').value = todayStr;
        } else if (modalType === 'uso') {
            document.getElementById('cap-uso-fecha').value = todayStr;
        }
    }
}

function closeCapitalModal(modalType) {
    const modal = document.getElementById('capital-modal-' + modalType);
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

async function populateCapitalDropdowns() {
    const entItemSelect = document.getElementById('cap-ent-item');
    const usoItemSelect = document.getElementById('cap-uso-item');
    const usoChoferSelect = document.getElementById('cap-uso-chofer');
    const usoUnidadSelect = document.getElementById('cap-uso-unidad');

    // Populate Item selectors
    if (entItemSelect) {
        entItemSelect.innerHTML = '<option value="" class="bg-slate-900">Selecciona producto...</option>' +
            allCapitalItems.map(i => `<option value="${i.id_item}" class="bg-slate-900">${i.id_item} - ${i.nombre} (${i.tipo})</option>`).join('');
    }

    if (usoItemSelect) {
        usoItemSelect.innerHTML = '<option value="" class="bg-slate-900">Selecciona producto...</option>' +
            allCapitalItems.map(i => `<option value="${i.id_item}" class="bg-slate-900">${i.id_item} - ${i.nombre} (${i.tipo})</option>`).join('');
    }

    // Populate Choferes & Unidades using standard CRM collections
    try {
        const [units, drivers] = await Promise.all([
            fetchSupabaseData(DB_CONFIG.tableUnidades),
            fetchSupabaseData(DB_CONFIG.tableChoferes)
        ]);

        if (usoChoferSelect) {
            const activeDrivers = (drivers || []).filter(d => (d.estatus || 'Activo') === 'Activo');
            usoChoferSelect.innerHTML = '<option value="" class="bg-slate-900">-- Selecciona Chofer --</option>' +
                activeDrivers.map(d => `<option value="${d.id_chofer}" class="bg-slate-900">${d.nombre}</option>`).join('');
        }

        if (usoUnidadSelect) {
            const activeUnits = (units || []).filter(u => (u.estatus || 'Activo') === 'Activo');
            usoUnidadSelect.innerHTML = '<option value="" class="bg-slate-900">-- Selecciona Unidad --</option>' +
                activeUnits.map(u => `<option value="${u.id_unidad}" class="bg-slate-900">${u.id_unidad} - ${u.nombre_unidad}</option>`).join('');
        }
    } catch(err) {
        console.warn('Could not populate units and drivers in capital forms:', err);
    }
}

function quickActionCapital(modalType, itemId) {
    openCapitalModal(modalType);
    if (modalType === 'entrada') {
        const select = document.getElementById('cap-ent-item');
        if (select) select.value = itemId;
    } else if (modalType === 'uso') {
        const select = document.getElementById('cap-uso-item');
        if (select) select.value = itemId;
    }
}

async function handleCapitalSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...';

    const newItem = {
        id_item: document.getElementById('cap-add-id').value.trim().toUpperCase(),
        nombre: document.getElementById('cap-add-nombre').value.trim(),
        descripcion: document.getElementById('cap-add-descripcion').value.trim() || null,
        tipo: document.getElementById('cap-add-tipo').value,
        unidad_medida: document.getElementById('cap-add-unidad').value,
        cantidad: 0,
        costo_promedio: 0
    };

    try {
        // Validation: check if id already exists
        const exists = allCapitalItems.some(i => i.id_item === newItem.id_item);
        if (exists) {
            alert(`El código ${newItem.id_item} ya se encuentra registrado.`);
            return;
        }

        const { error } = await window.supabaseClient
            .from('inventario_capital')
            .insert(newItem);

        if (error) throw error;

        alert('Producto registrado con éxito en el catálogo.');
        closeCapitalModal('add');
        await loadCapitalData();
    } catch (err) {
        console.error('Error saving capital product:', err);
        alert('Error: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function handleMovementSubmit(e, tipo) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    let id_item, cantidad, precio_unitario, fecha, observaciones, id_unidad = null, id_chofer = null;

    if (tipo === 'Entrada') {
        id_item = document.getElementById('cap-ent-item').value;
        cantidad = parseFloat(document.getElementById('cap-ent-cantidad').value);
        precio_unitario = parseFloat(document.getElementById('cap-ent-precio').value) || 0;
        fecha = document.getElementById('cap-ent-fecha').value;
        observaciones = document.getElementById('cap-ent-observaciones').value.trim() || null;
    } else {
        id_item = document.getElementById('cap-uso-item').value;
        cantidad = parseFloat(document.getElementById('cap-uso-cantidad').value);
        precio_unitario = 0; // Exits don't have purchase price
        fecha = document.getElementById('cap-uso-fecha').value;
        observaciones = document.getElementById('cap-uso-observaciones').value.trim() || null;
        id_unidad = document.getElementById('cap-uso-unidad').value || null;
        id_chofer = document.getElementById('cap-uso-chofer').value || null;
    }

    try {
        const item = allCapitalItems.find(i => i.id_item === id_item);
        if (!item) throw new Error('Producto no encontrado');

        // Validation for stock exits
        if (tipo === 'Salida' && parseFloat(item.cantidad) < cantidad) {
            alert(`No hay stock suficiente para realizar esta salida. Stock actual: ${item.cantidad} ${item.unidad_medida}.`);
            return;
        }

        // 1. Insert Movement record
        const { error: errMov } = await window.supabaseClient
            .from('inventario_movimientos')
            .insert({
                id_item,
                tipo_movimiento: tipo,
                cantidad,
                precio_unitario,
                fecha,
                id_unidad,
                id_chofer,
                observaciones
            });

        if (errMov) throw errMov;

        // 2. Update stock atomics
        const currentStock = parseFloat(item.cantidad);
        const newStock = tipo === 'Entrada' ? currentStock + cantidad : currentStock - cantidad;

        const updateData = { cantidad: newStock };

        // For entries, we calculate new weighted average cost
        if (tipo === 'Entrada') {
            const currentCostVal = parseFloat(item.costo_promedio || 0) * currentStock;
            const newCostVal = precio_unitario * cantidad;
            const finalAvgCost = newStock > 0 ? (currentCostVal + newCostVal) / newStock : 0;
            updateData.costo_promedio = parseFloat(finalAvgCost.toFixed(2));
        }

        const { error: errStock } = await window.supabaseClient
            .from('inventario_capital')
            .update(updateData)
            .eq('id_item', id_item);

        if (errStock) throw errStock;

        alert(`Movimiento de ${tipo} registrado con éxito.`);
        closeCapitalModal(tipo === 'Entrada' ? 'entrada' : 'uso');
        await loadCapitalData();
    } catch (err) {
        console.error('Error saving inventory movement:', err);
        alert('Error: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}



