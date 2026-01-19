/**
 * Procesa-T CRM - Lógica de Formulario de Gastos
 */

document.addEventListener('DOMContentLoaded', () => {
    // Verificar sesión al cargar
    const session = checkAuth();
    if (session) {
        const userNameDisp = document.getElementById('user-name-display');
        if (userNameDisp) userNameDisp.innerText = session.nombre;
    }

    const gastoForm = document.getElementById('gasto-form');
    if (gastoForm) {
        gastoForm.addEventListener('submit', enviarGasto);
    }
});

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

        const formData = {
            ID_Chofer: session.userID,
            Fecha: document.getElementById('fecha').value,
            Concepto: document.getElementById('concepto').value,
            Monto: parseFloat(document.getElementById('monto').value),
            Comentarios: document.getElementById('comentarios').value,
            // Agregamos Timestamp para control
            Timestamp: new Date().toISOString()
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
