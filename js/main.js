/**
 * Procesa-T CRM - Lógica de Formulario de Gastos
 */

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

    const gastoForm = document.getElementById('gasto-form');
    if (gastoForm) {
        gastoForm.addEventListener('submit', enviarGasto);
    }

    const viajeForm = document.getElementById('viaje-form');
    if (viajeForm) {
        viajeForm.addEventListener('submit', enviarViaje);
    }

    // Inicializar dashboard si estamos en la vista admin
    if (document.getElementById('pizarra-operaciones')) {
        initAdminDashboard();
    }
});

async function initAdminDashboard() {
    const loader = document.getElementById('loader-operaciones');
    const tableBody = document.getElementById('pizarra-operaciones');

    try {
        if (!isConfigValid()) return;

        if (loader) loader.classList.remove('hidden');
        if (tableBody) tableBody.innerHTML = '';

        const today = new Date().toLocaleDateString('en-CA');

        // Fetch de Viajes y Gastos en paralelo para eficiencia
        const [viajesRes, gastosRes] = await Promise.all([
            fetchAppSheetData(APPSHEET_CONFIG.tableViajes || 'REG_VIAJES'),
            fetchAppSheetData(APPSHEET_CONFIG.tableName || 'REG_GASTOS')
        ]);

        const viajes = (viajesRes || []).filter(v => v.Fecha === today);
        const gastos = (gastosRes || []).filter(g => g.Fecha === today);

        updateKPIs(viajes, gastos);
        renderPizarra(viajes, gastos);

    } catch (error) {
        console.error('Error al cargar dashboard:', error);
    } finally {
        if (loader) loader.classList.add('hidden');
    }
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
        return Array.isArray(result) ? result : [];
    } catch (e) {
        return [];
    }
}

function updateKPIs(viajes, gastos) {
    const venta = viajes.reduce((acc, v) => acc + (parseFloat(v.Monto_Flete) || 0), 0);
    const gasto = gastos.reduce((acc, g) => acc + (parseFloat(g.Monto) || 0), 0);
    const ganancia = venta - gasto;

    const fmt = (num) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(num);

    if (document.getElementById('stat-venta')) document.getElementById('stat-venta').innerText = fmt(venta);
    if (document.getElementById('stat-gasto')) document.getElementById('stat-gasto').innerText = fmt(gasto);
    if (document.getElementById('stat-ganancia')) {
        const el = document.getElementById('stat-ganancia');
        el.innerText = fmt(ganancia);
        el.className = `text-2xl font-bold ${ganancia >= 0 ? 'text-slate-800' : 'text-red-600'}`;
    }
}

function renderPizarra(viajes, gastos) {
    const tableBody = document.getElementById('pizarra-operaciones');
    if (!tableBody) return;

    // Combinar y ordenar por fecha (aunque sean de hoy)
    const combined = [
        ...viajes.map(v => ({ type: 'venta', date: v.Fecha, detail: `${v.ID_Viaje} - ${v.Cliente}`, amount: v.Monto_Flete, cat: 'Viaje' })),
        ...gastos.map(g => ({ type: 'gasto', date: g.Fecha, detail: `${g.Concepto} (${g.ID_Unidad})`, amount: g.Monto, cat: 'Gasto' }))
    ];

    if (combined.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="4" class="px-6 py-10 text-center text-slate-400 italic">No hay operaciones hoy.</td></tr>';
        return;
    }

    combined.forEach(op => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50/50 transition-colors";
        tr.innerHTML = `
            <td class="px-6 py-4 text-xs font-medium text-slate-500">${op.date}</td>
            <td class="px-6 py-4">
                <div class="text-sm font-bold text-slate-800">${op.detail}</div>
            </td>
            <td class="px-6 py-4">
                <span class="text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide ${op.type === 'venta' ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'}">
                    ${op.cat}
                </span>
            </td>
            <td class="px-6 py-4 text-right">
                <span class="text-sm font-bold ${op.type === 'venta' ? 'text-green-600' : 'text-red-500'}">
                    ${op.type === 'venta' ? '+' : '-'}${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(op.amount)}
                </span>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

async function enviarViaje(e) {
    e.preventDefault();
    const session = checkAuth();
    if (!session) return;

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;

    try {
        if (!isConfigValid()) {
            alert('Configuración de AppSheet no encontrada.');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

        const getVal = (id) => document.getElementById(id) ? document.getElementById(id).value : '';

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
            Registrado_Por: session.nombre || session.userID
        };

        const response = await fetch('/api/appsheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                table: APPSHEET_CONFIG.tableViajes || 'REG_VIAJES',
                action: 'Add',
                rows: [formData],
                appId: APPSHEET_CONFIG.appId,
                accessKey: APPSHEET_CONFIG.accessKey
            })
        });

        const result = await response.json();

        if (response.ok && result.Success !== false) {
            alert('¡Viaje registrado con éxito!');
            e.target.reset();
            // Reset date to today after reset
            const dateInput = document.getElementById('V_Fecha');
            if (dateInput) dateInput.value = new Date().toLocaleDateString('en-CA');
        } else {
            const errorDetail = result.ErrorDescription || result.error || 'Error desconocido';
            throw new Error(errorDetail);
        }

    } catch (error) {
        console.error('Error al enviar viaje:', error);
        alert('Error al registrar viaje: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function enviarGasto(e) {
    e.preventDefault();

    const session = checkAuth();
    if (!session) return;

    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;

    try {
        if (!isConfigValid()) {
            alert('Configuración de AppSheet no encontrada.');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

        const getVal = (id) => document.getElementById(id) ? document.getElementById(id).value : '';
        const tipoPago = document.querySelector('input[name="Tipo_Pago"]:checked');

        const formData = {
            ID_Chofer: getVal('ID_Chofer') || session.userID, // Use input if exists (admin view), otherwise session
            ID_Viaje: getVal('ID_Viaje'),
            ID_Unidad: getVal('ID_Unidad'),
            Concepto: getVal('Concepto'),
            Monto: parseFloat(getVal('Monto')) || 0,
            Tipo_Pago: tipoPago ? tipoPago.value : 'Efectivo',
            Kmts_Actuales: parseInt(getVal('Kmts_Actuales')) || 0,
            Litros_Rellenados: parseFloat(getVal('Litros_Rellenados')) || 0,
            Fecha: new Date().toLocaleDateString('en-CA') // Formato YYYY-MM-DD
        };

        // Enviar a través del Proxy de Vercel
        const response = await fetch('/api/appsheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                table: APPSHEET_CONFIG.tableName, // REG_GASTOS
                action: 'Add',
                rows: [formData],
                appId: APPSHEET_CONFIG.appId,
                accessKey: APPSHEET_CONFIG.accessKey
            })
        });

        const result = await response.json();

        if (response.ok && result.Success !== false) {
            alert('¡Gasto registrado con éxito!');
            e.target.reset();
        } else {
            const errorDetail = result.ErrorDescription || result.error || 'Error desconocido';
            throw new Error(errorDetail);
        }

    } catch (error) {
        console.error('Error al enviar gasto:', error);
        alert('Error al registrar gasto: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Auxiliar para checkAuth (aunque ya esté en auth.js, por si acaso se cargan por separado)
function checkAuth() {
    const session = localStorage.getItem('crm_session');
    return session ? JSON.parse(session) : null;
}
