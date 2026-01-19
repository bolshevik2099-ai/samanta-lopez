/**
 * Procesa-T CRM - Lógica de Autenticación (Versión Final con Campos Validados)
 */

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
});

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

        if (!response.ok) {
            const err = responseData.details || responseData.error || 'Error de conexión';
            throw new Error(err);
        }

        if (responseData && responseData.Success === false) {
            throw new Error(responseData.ErrorDescription || 'Error en AppSheet.');
        }

        // --- LÓGICA DE DETECCIÓN DE FILAS ---
        let users = [];

        // Si RowValues es null pero Success es true, es un problema de permisos de lectura
        if (responseData.RowValues === null && responseData.Success === true) {
            throw new Error("PERMISO DE LECTURA DENEGADO. AppSheet conectó pero no devolvió datos. Por favor, ve a AppSheet -> Manage -> Integrations -> IN: add-on, API -> Tables y activa el check de 'Read' para la tabla USUARIOS.");
        }

        if (Array.isArray(responseData)) {
            users = responseData;
        } else if (responseData && typeof responseData === 'object') {
            if (Array.isArray(responseData.Rows)) {
                users = responseData.Rows;
            } else if (Array.isArray(responseData.RowValues)) {
                users = responseData.RowValues;
            } else {
                const arrayKey = Object.keys(responseData).find(k => Array.isArray(responseData[k]));
                if (arrayKey) {
                    users = responseData[arrayKey];
                }
            }
        }

        if (users.length === 0) {
            throw new Error("No se encontraron usuarios. Verifica que la tabla tenga datos y permisos de lectura.");
        }

        // Buscar el usuario usando los campos VALIDADOS en la terminal
        // Campos: Usuario, Password, Rol, ID_Contacto
        const foundUser = users.find(u =>
            String(u.Usuario).trim() === userVal &&
            String(u.Password).trim() === passVal
        );

        if (foundUser) {
            const sessionData = {
                userID: foundUser.ID_Contacto || foundUser.Usuario,
                nombre: foundUser.Usuario, // Usamos Usuario ya que 'Nombre' no existe
                rol: foundUser.Rol,
                timestamp: new Date().getTime()
            };
            localStorage.setItem('crm_session', JSON.stringify(sessionData));
            redirectByRol(foundUser.Rol);
        } else {
            errorMsg.classList.remove('hidden');
            const span = errorMsg.querySelector('span');
            if (span) span.innerText = 'Usuario o contraseña incorrectos.';
        }

    } catch (error) {
        console.error('LOGIN ERROR:', error);
        alert(`AVISO IMPORTANTE:\n\n${error.message}`);
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
