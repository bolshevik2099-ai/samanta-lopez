/**
 * Procesa-T CRM - Lógica de Autenticación (Versión de Diagnóstico Final)
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

        // Si RowValues es null pero Success es true, significa que la tabla está vacía o no hay permisos de lectura
        if (responseData.RowValues === null && responseData.Success === true) {
            throw new Error("LA TABLA ESTÁ VACÍA O SIN PERMISOS. AppSheet conectó pero no devolvió ninguna fila. Verifica que la tabla 'USUARIOS' tenga datos y permisos de LECTURA (Read) habilitados en la API.");
        }

        if (Array.isArray(responseData)) {
            users = responseData;
        } else if (responseData && typeof responseData === 'object') {
            if (Array.isArray(responseData.Rows)) {
                users = responseData.Rows;
            } else {
                const arrayKey = Object.keys(responseData).find(k => Array.isArray(responseData[k]));
                if (arrayKey) {
                    users = responseData[arrayKey];
                } else {
                    const raw = JSON.stringify(responseData).substring(0, 100);
                    throw new Error(`Formato no reconocido. Recibido: ${raw}`);
                }
            }
        }

        if (users.length === 0) {
            throw new Error("No se encontraron usuarios en la tabla. Asegúrate de tener al menos una fila en la hoja 'USUARIOS'.");
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
            if (span) span.innerText = 'Usuario o contraseña no encontrados.';
        }

    } catch (error) {
        console.error('LOGIN ERROR:', error);
        alert(`ERROR CRÍTICO:\n\n${error.message}`);
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
