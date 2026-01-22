
let mainChart = null; // Instancia global para el gráfico

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

    if (loader) loader.classList.remove('hidden');

    try {
        if (!isConfigValid()) return;

        // Fetch de datos maestros
        const [viajesRaw, gastosRaw] = await Promise.all([
            fetchAppSheetData(APPSHEET_CONFIG.tableViajes || 'REG_VIA_MAESTRO' || 'REG_VIAJES'),
            fetchAppSheetData(APPSHEET_CONFIG.tableName || 'REG_GASTOS')
        ]);

        // Filtro por fecha (YYYY-MM-DD)
        const filterByDate = (rows, s, e) => rows.filter(r => r.Fecha >= s && r.Fecha <= e);

        const viajes = filterByDate(viajesRaw || [], start, end);
        const gastos = filterByDate(gastosRaw || [], start, end);

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
        ...viajes.map(v => ({ type: 'venta', date: v.Fecha, detail: v.ID_Viaje, amount: v.Monto_Flete })),
        ...gastos.map(g => ({ type: 'gasto', date: g.Fecha, detail: g.Concepto, amount: g.Monto }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 15);

    tableBody.innerHTML = combined.map(op => `
        <tr class="hover:bg-slate-50 transition-colors">
            <td class="px-6 py-3">
                <div class="text-[10px] text-slate-400 font-mono">${op.date}</div>
                <div class="text-sm font-bold text-slate-800 truncate max-w-[150px]">${op.detail}</div>
            </td>
            <td class="px-6 py-3 text-right">
                <span class="text-xs font-bold ${op.type === 'venta' ? 'text-blue-600' : 'text-red-500'}">
                    ${op.type === 'venta' ? '+' : '-'}${new Intl.NumberFormat('es-MX').format(op.amount)}
                </span>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="2" class="p-8 text-center text-slate-400 italic">Sin datos</td></tr>';
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

async function fetchAppSheetData(tableName) {
    try {
        const response = await fetch('/api/appsheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                table: tableName,
                action: 'Find',
                appId: APPSHEET_CONFIG.appId,
                accessKey: APPSHEET_CONFIG.accessKey,
                Properties: { Locale: 'es-MX' }
            })
        });
        const result = await response.json();
        return Array.isArray(result) ? result : (result.Rows || []);
    } catch (e) {
        console.error(`Error en ${tableName}:`, e);
        return [];
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
        if (!isConfigValid()) return alert('Error de Configuración');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

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
            Estatus_Pago: getVal('V_Estatus_Pago'),
            Registrado_Por: session.nombre
        };

        const response = await fetch('/api/appsheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                table: APPSHEET_CONFIG.tableViajes || 'REG_VIAJES',
                action: 'Add', rows: [formData],
                appId: APPSHEET_CONFIG.appId, accessKey: APPSHEET_CONFIG.accessKey
            })
        });

        if (response.ok) {
            alert('¡Viaje registrado!');
            e.target.reset();
            updateDashboardByPeriod();
        }
    } catch (err) { alert('Error: ' + err.message); }
    finally { btn.disabled = false; btn.innerHTML = originalText; }
}

async function enviarGasto(e) {
    e.preventDefault();
    const session = checkAuth();
    if (!session) return;
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;

    try {
        if (!isConfigValid()) return alert('Configuración no válida');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

        const getVal = (id) => document.getElementById(id)?.value || '';
        const tipoPago = document.querySelector('input[name="Tipo_Pago"]:checked')?.value || 'Efectivo';

        const formData = {
            ID_Chofer: getVal('ID_Chofer') || session.userID,
            ID_Viaje: getVal('ID_Viaje'),
            ID_Unidad: getVal('ID_Unidad'),
            Concepto: getVal('Concepto'),
            Monto: parseFloat(getVal('Monto')) || 0,
            Tipo_Pago: tipoPago,
            Kmts_Actuales: parseInt(getVal('Kmts_Actuales')) || 0,
            Litros_Rellenados: parseFloat(getVal('Litros_Rellenados')) || 0,
            Fecha: new Date().toLocaleDateString('en-CA')
        };

        const response = await fetch('/api/appsheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                table: APPSHEET_CONFIG.tableName,
                action: 'Add', rows: [formData],
                appId: APPSHEET_CONFIG.appId, accessKey: APPSHEET_CONFIG.accessKey
            })
        });

        if (response.ok) {
            alert('¡Gasto registrado!');
            e.target.reset();
            updateDashboardByPeriod();
        }
    } catch (err) { alert('Error: ' + err.message); }
    finally { btn.disabled = false; btn.innerHTML = originalText; }
}

function checkAuth() {
    const session = localStorage.getItem('crm_session');
    return session ? JSON.parse(session) : null;
}

