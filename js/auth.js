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
        if (typeof isConfigValid === 'function' && !isConfigValid()) {
            alert('Configuración de AppSheet no encontrada. Por favor, recarga la página de inicio para configurar.');
            return;
        }

        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validando...';
        errorMsg.classList.add('hidden');

        // Consultar a través del Proxy de Vercel (Evita CORS y asegura llaves)
        const response = await fetch('/api/appsheet', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                table: APPSHEET_CONFIG.tableUsuarios,
                action: 'Find',
                rows: []
            })
        });

        if (!response.ok) {
            // Capturar error del proxy o de AppSheet
            let errorMessage = 'Error en el servidor';
            try {
                const errData = await response.json();
                errorMessage = errData.error || errData.details?.error || errorMessage;
            } catch (e) {
                errorMessage = `Error ${response.status}: ${response.statusText}`;
            }
            throw new Error(errorMessage);
        }

        const responseData = await response.json();
        console.log('Datos recibidos del Proxy:', responseData);

        let users = [];
        if (Array.isArray(responseData)) {
            users = responseData;
        } else if (responseData && Array.isArray(responseData.Rows)) {
            users = responseData.Rows;
        } else {
            console.error('La respuesta no tiene el formato esperado:', responseData);
            throw new Error('La respuesta de AppSheet no contiene una lista de usuarios válida.');
        }

        // Buscar el usuario que coincida
        const foundUser = users.find(u =>
            (u.Email === userVal || u.Usuario === userVal) &&
            String(u.Password) === passVal
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
            const span = errorMsg.querySelector('span');
            if (span) span.innerText = 'Credenciales inválidas. Verifica tu usuario y contraseña.';
        }

    } catch (error) {
        console.error('Login Error Detail:', error);
        alert(`Fallo en el inicio de sesión: ${error.message}`);
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
            window.location.href = 'index.html';
    }
}

/**
 * Verifica si hay una sesión activa (Protección de rutas)
 */
function checkAuth() {
    const session = localStorage.getItem('crm_session');

    // Si no hay sesión y no estamos en index.html, redirige
    if (!session && !window.location.pathname.includes('index.html')) {
        window.location.href = 'index.html';
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
    window.location.href = 'index.html';
}
