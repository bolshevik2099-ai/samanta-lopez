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
                rows: []
            })
        });

        if (!response.ok) {
            let errorMessage = 'Error en el servidor';
            try {
                const errData = await response.json();
                errorMessage = errData.error || errData.details?.error || errorMessage;
            } catch (e) {
                errorMessage = `Status ${response.status}: ${response.statusText}`;
            }
            throw new Error(errorMessage);
        }

        const responseData = await response.json();
        console.log('DEBUG - Datos recibidos:', responseData);

        let users = [];
        // Lógica de extracción ultra-robusta
        if (Array.isArray(responseData)) {
            users = responseData;
        } else if (responseData && typeof responseData === 'object') {
            // Intentar encontrar cualquier clave que sea un array (Rows, rows, data, etc.)
            const arrayKey = Object.keys(responseData).find(k => Array.isArray(responseData[k]));
            if (arrayKey) {
                users = responseData[arrayKey];
                console.log(`DEBUG - Usando lista encontrada en clave: ${arrayKey}`);
            } else {
                const raw = JSON.stringify(responseData).substring(0, 100);
                throw new Error(`Estructura incompatible. Keys: ${Object.keys(responseData).join(', ')}. Raw: ${raw}`);
            }
        } else {
            throw new Error(`Tipo de respuesta inválido: ${typeof responseData}`);
        }

        // Buscar el usuario
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
        console.error('CRITICAL LOGIN ERROR:', error);
        alert(`ERROR TÉCNICO: ${error.message}\n\nSi el error persiste, revisa que la columna 'Password' exista en AppSheet.`);
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
