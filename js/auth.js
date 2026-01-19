/**
 * Procesa-T CRM - Lógica de Autenticación
 */

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
});

/**
 * Maneja el proceso de inicio de sesión
 */
async function handleLogin(e) {
    e.preventDefault();

    const userVal = document.getElementById('username').value.trim();
    const passVal = document.getElementById('password').value.trim();
    const loginBtn = document.getElementById('login-btn');
    const errorMsg = document.getElementById('error-msg');

    const originalText = loginBtn.innerHTML;

    try {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validando...';
        errorMsg.classList.add('hidden');

        // Consultar la tabla USUARIOS en AppSheet
        // Usamos la acción 'Find' o simplemente traemos los datos.
        // Por seguridad y simplicidad en este ejemplo, traemos y filtramos.
        // IMPORTANTE: En producción real, es mejor usar la acción Filter de AppSheet.
        const url = `https://api.appsheet.com/api/v1/apps/${APPSHEET_CONFIG.appId}/tables/${APPSHEET_CONFIG.tableUsuarios}/Action`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'ApplicationToken': APPSHEET_CONFIG.accessKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                "Action": "Find",
                "Properties": {
                    "Locale": "es-MX"
                },
                "Rows": [] // Dejar vacío para que traiga (según configuración de AppSheet puede requerir parámetros)
                // Si Find no funciona sin parámetros, usaremos una técnica de fetch alternativo o Filter.
            })
        });

        if (!response.ok) throw new Error('Error al conectar con el servidor');

        const users = await response.json();

        // Buscar el usuario que coincida
        const foundUser = users.find(u =>
            (u.Email === userVal || u.Usuario === userVal) &&
            u.Password === passVal
        );

        if (foundUser) {
            // Guardar en LocalStorage
            const sessionData = {
                userID: foundUser.ID_Contacto,
                nombre: foundUser.Nombre || foundUser.Usuario,
                rol: foundUser.Rol,
                timestamp: new Date().getTime()
            };

            localStorage.setItem('crm_session', JSON.stringify(sessionData));

            // Redirección basada en Rol
            redirectByRol(foundUser.Rol);
        } else {
            errorMsg.classList.remove('hidden');
        }

    } catch (error) {
        console.error('Login Error:', error);
        alert('Hubo un problema al conectar con el servicio de autenticación.');
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = originalText;
    }
}

/**
 * Redirige al usuario según su rol
 */
function redirectByRol(rol) {
    switch (rol) {
        case 'Chofer':
            window.location.href = 'vista-chofer.html';
            break;
        case 'Admin':
            window.location.href = 'vista-admin.html';
            break;
        case 'Super Admin':
            window.location.href = 'vista-superadmin.html';
            break;
        default:
            alert('Rol no reconocido. Contacta al administrador.');
            localStorage.removeItem('crm_session');
            window.location.href = 'login.html';
    }
}

/**
 * Verifica si hay una sesión activa (Protección de rutas)
 */
function checkAuth() {
    const session = localStorage.getItem('crm_session');

    // Si no hay sesión y no estamos en login.html, redirige
    if (!session && !window.location.pathname.includes('login.html')) {
        window.location.href = 'login.html';
        return null;
    }

    if (session) {
        return JSON.parse(session);
    }
    return null;
}

/**
 * Cierra la sesión
 */
function logout() {
    localStorage.removeItem('crm_session');
    window.location.href = 'login.html';
}
