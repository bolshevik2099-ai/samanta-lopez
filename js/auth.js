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
            alert('Configuración incompleta. Por favor ingresa el App ID y Access Key en el panel superior.');
            return;
        }

        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validando...';
        errorMsg.classList.add('hidden');

        // Consultar a través del Proxy de Vercel
        const response = await fetch('/api/appsheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                table: APPSHEET_CONFIG.tableUsuarios,
                action: 'Find',
                rows: [],
                appId: APPSHEET_CONFIG.appId,
                accessKey: APPSHEET_CONFIG.accessKey
            })
        });

        const responseData = await response.json();

        // Manejo detallado de errores
        if (!response.ok || responseData.error || responseData.Success === false) {
            const msg = responseData.details || responseData.error || 'Error desconocido';
            const debug = responseData.debug ? `\n\nOrigen: ${responseData.debug.source}\nAppID check: ${responseData.debug.appIdUsed}` : '';

            throw new Error(`${msg}${debug}`);
        }

        let users = [];
        if (Array.isArray(responseData)) {
            users = responseData;
        } else if (responseData && typeof responseData === 'object') {
            const arrayKey = Object.keys(responseData).find(k => Array.isArray(responseData[k]));
            if (arrayKey) users = responseData[arrayKey];
            else throw new Error('No se encontró lista de usuarios en la respuesta.');
        } else {
            throw new Error('Formato de datos inválido.');
        }

        const foundUser = users.find(u =>
            (u.Email === userVal || u.Usuario === userVal) &&
            String(u.Password) === passVal
        );

        if (foundUser) {
            const sessionData = {
                userID: foundUser.ID_Contacto,
                nombre: foundUser.Nombre || foundUser.Usuario,
                rol: foundUser.Rol,
                timestamp: new Date().getTime()
            };
            localStorage.setItem('crm_session', JSON.stringify(sessionData));
            redirectByRol(foundUser.Rol);
        } else {
            errorMsg.classList.remove('hidden');
            const span = errorMsg.querySelector('span');
            if (span) span.innerText = 'Email o Contraseña incorrectos.';
        }

    } catch (error) {
        console.error('LOGIN ERROR:', error);
        alert(`FALLO DE CONEXIÓN:\n\n${error.message}\n\nRECOMENDACIÓN: Verifica en AppSheet que la API esté habilitada y las llaves sean exactas.`);
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = originalText;
    }
}

function redirectByRol(rol) {
    const routes = {
        'Chofer': 'vista-chofer.html',
        'Admin': 'vista-admin.html',
        'Super Admin': 'vista-superadmin.html'
    };
    window.location.href = routes[rol] || 'index.html';
}

function checkAuth() {
    const session = localStorage.getItem('crm_session');
    if (!session && !window.location.pathname.includes('index.html')) {
        window.location.href = 'index.html';
        return null;
    }
    return session ? JSON.parse(session) : null;
}

function logout() {
    localStorage.removeItem('crm_session');
    window.location.href = 'index.html';
}
