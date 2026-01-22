
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

    if (!isConfigValid()) {
        alert('⚠️ Error: Falta configuración de AppSheet. Haz clic en el engranaje abajo a la derecha en la página de inicio para configurar tu App ID y Access Key.');
        return;
    }

    const statusEl = document.getElementById('conn-status');
    if (statusEl) {
        statusEl.innerText = 'Consultando...';
        statusEl.className = 'text-[10px] bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest animate-pulse';
    }

    if (loader) loader.classList.remove('hidden');

    try {
        console.log('Cargando datos para el periodo:', start, 'al', end);

        // Fetch de datos maestros
        const [viajesRaw, gastosRaw] = await Promise.all([
            fetchAppSheetData(APPSHEET_CONFIG.tableViajes || 'REG_VIAJES'),
            fetchAppSheetData(APPSHEET_CONFIG.tableName || 'REG_GASTOS')
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
            statusEl.innerText = 'Error API';
            statusEl.className = 'text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest';
        }
        alert('❌ Error al conectar con AppSheet:\n' + error.message + '\n\nVerifica tus credenciales en el inicio.');
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

        if (result && (result.Rows || Array.isArray(result))) {
            return Array.isArray(result) ? result : result.Rows;
        } else {
            console.error(`Error en respuesta de ${tableName}:`, result);
            return [];
        }
    } catch (e) {
        console.error(`Error de red en ${tableName}:`, e);
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

        console.log('Enviando Viaje:', formData);

        const response = await fetch('/api/appsheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                table: APPSHEET_CONFIG.tableViajes || 'REG_VIAJES',
                action: 'Add', rows: [formData],
                appId: APPSHEET_CONFIG.appId, accessKey: APPSHEET_CONFIG.accessKey
            })
        });

        const result = await response.json();
        console.log('Respuesta AppSheet:', result);

        if (response.ok && result && result.Success !== false) {
            alert('✅ REGISTRO EXITOSO (v1.2)\n\nAppSheet confirmó el viaje. Si NO aparece en el Excel, revisa que los nombres de las columnas coincidan.');
            e.target.reset();
            // Resetear fecha a hoy tras limpiar el form
            document.getElementById('V_Fecha').value = new Date().toLocaleDateString('en-CA');
            if (typeof updateDashboardByPeriod === 'function') updateDashboardByPeriod();
        } else {
            const errorDetail = result.ErrorDescription || result.error || JSON.stringify(result);
            alert('❌ ERROR DE APPSHEET:\n\n' + errorDetail);
        }
    } catch (err) {
        alert('❌ ERROR CRÍTICO:\n\n' + err.message);
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
                table: APPSHEET_CONFIG.tableName || 'REG_GASTOS',
                action: 'Add', rows: [formData],
                appId: APPSHEET_CONFIG.appId, accessKey: APPSHEET_CONFIG.accessKey
            })
        });

        const result = await response.json();

        if (response.ok && result.Success !== false) {
            alert('✅ ¡Gasto registrado con éxito!');
            e.target.reset();
            if (typeof updateDashboardByPeriod === 'function') updateDashboardByPeriod();
        } else {
            const errorDetail = result.ErrorDescription || result.error || 'Error desconocido';
            alert('❌ Error de AppSheet al guardar gasto: ' + errorDetail);
            console.error('Error result (gasto):', result);
        }
    } catch (err) {
        alert('❌ Error de red al guardar gasto: ' + err.message);
    }
    finally { btn.disabled = false; btn.innerHTML = originalText; }
}

function checkAuth() {
    const session = localStorage.getItem('crm_session');
    return session ? JSON.parse(session) : null;
}

