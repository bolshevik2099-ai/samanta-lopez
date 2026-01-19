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
            alert('Configuración incompleta. Usa el icono de engranaje para configurar.');
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
        console.log('DEBUG - Response Data:', responseData);

        if (!response.ok) {
            const err = responseData.details?.error || responseData.error || responseData.ErrorDescription || 'Error de conexión';
            throw new Error(err);
        }

        // Si AppSheet devuelve explícitamente Success: false
        if (responseData && responseData.Success === false) {
            throw new Error(responseData.ErrorDescription || 'AppSheet reportó un error desconocido.');
        }

        let users = [];
        // Lógica de extracción SÚPER robusta
        if (Array.isArray(responseData)) {
            users = responseData;
        } else if (responseData && typeof responseData === 'object') {
            // Caso 1: La data está en .Rows (estándar AppSheet)
            if (Array.isArray(responseData.Rows)) {
                users = responseData.Rows;
            }
            // Caso 2: Cualquier otra clave que sea un array
            else {
                const arrayKey = Object.keys(responseData).find(k => Array.isArray(responseData[k]));
                if (arrayKey) {
                    users = responseData[arrayKey];
                } else {
                    // SI NO HAY ARRAY, PUEDE SER QUE LA TABLA ESTÉ VACÍA O EL FILTRO NO COINCIDA
                    // Si el objeto existe pero no hay arrays, mostramos qué hay dentro para diagnosticar.
                    console.error('Keys encontradas:', Object.keys(responseData));
                    const raw = JSON.stringify(responseData).substring(0, 150);
                    throw new Error(`Datos no reconocidos. Recibido de AppSheet: ${raw}`);
                }
            }
        }

        if (users.length === 0) {
            throw new Error('La tabla de usuarios está vacía o no se devolvieron datos. Verifica tu AppSheet.');
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
        console.error('LOGIN ERROR:', error);
        alert(`FALLO DE CONEXIÓN:\n\n${error.message}\n\nRECOMENDACIÓN: Verifica en AppSheet que la tabla 'USUARIOS' tenga datos y que 'Password' sea una columna de texto.`);
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
