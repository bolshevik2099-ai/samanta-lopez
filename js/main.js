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
});

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
