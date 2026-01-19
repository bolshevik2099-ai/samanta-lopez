/**
 * Procesa-T CRM - Lógica Principal
 */

document.addEventListener('DOMContentLoaded', () => {
    // Verificar sesión y cargar datos de usuario
    const session = typeof checkAuth === 'function' ? checkAuth() : null;

    if (session) {
        // Actualizar visualización del nombre
        const displayChofer = document.getElementById('display-chofer');
        if (displayChofer) {
            displayChofer.innerText = session.nombre;
        }
    }

    const form = document.getElementById('gasto-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await enviarGasto();
        });
    }
});

/**
 * Recolecta los datos del formulario y los envía a AppSheet
 */
async function enviarGasto() {
    const btn = document.getElementById('submit-btn');
    if (!btn) return;

    const originalContent = btn.innerHTML;
    const session = JSON.parse(localStorage.getItem('crm_session'));

    if (!session) {
        alert('Sesión expirada. Por favor inicia sesión de nuevo.');
        window.location.href = 'login.html';
        return;
    }

    try {
        // Bloquear botón y mostrar cargando
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

        // Recolectar datos de la interfaz
        const idViaje = document.getElementById('ID_Viaje').value;
        const idUnidad = document.getElementById('ID_Unidad').value;
        const concepto = document.getElementById('Concepto').value;
        const monto = parseFloat(document.getElementById('Monto').value);
        const tipoPago = document.querySelector('input[name="Tipo_Pago"]:checked').value;
        const kmts = parseInt(document.getElementById('Kmts_Actuales').value);
        const litros = document.getElementById('Litros_Rellenados').value;

        // Fotos
        const ticketFoto = document.getElementById('Ticket_Foto').value;
        const fotoTacometro = document.getElementById('Foto_tacometro').value;

        // Datos Automáticos y de Sesión
        const idGasto = 'GST-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        const fecha = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
        const idChofer = session.userID; // USANDO EL ID DEL LOGIN

        // Construir JSON para AppSheet
        const payload = {
            "Action": "Add",
            "Properties": {
                "Locale": "es-MX",
                "Timezone": "Central Standard Time (Mexico)"
            },
            "Rows": [
                {
                    "ID_Gasto": idGasto,
                    "Fecha": fecha,
                    "ID_Chofer": idChofer,
                    "ID_Viaje": idViaje,
                    "ID_Unidad": idUnidad,
                    "Concepto": concepto,
                    "Monto": monto,
                    "Tipo_Pago": tipoPago,
                    "Kmts_Actuales": kmts,
                    "Litros_Rellenados": litros || 0,
                    "Ticket_Foto": ticketFoto,
                    "Foto_tacometro": fotoTacometro
                }
            ]
        };

        const url = `https://api.appsheet.com/api/v1/apps/${APPSHEET_CONFIG.appId}/tables/${APPSHEET_CONFIG.tableName}/Action`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'ApplicationToken': APPSHEET_CONFIG.accessKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`Error en la API: ${response.statusText}`);

        const result = await response.json();
        console.log('Respuesta AppSheet:', result);

        showToast('¡Registro enviado con éxito!');
        document.getElementById('gasto-form').reset();

    } catch (error) {
        console.error('Error al enviar gasto:', error);
        alert('Hubo un error al enviar los datos. Revisa la consola.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

/**
 * Muestra un mensaje temporal en pantalla
 */
function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.innerText = message;
    toast.classList.remove('opacity-0', 'pointer-events-none');
    toast.classList.add('opacity-100');

    setTimeout(() => {
        toast.classList.remove('opacity-100');
        toast.classList.add('opacity-0', 'pointer-events-none');
    }, 4000);
}
