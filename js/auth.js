/**
 * Procesa-T CRM - Lógica de Autenticación con Puente de Seguridad
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
        if (!isConfigValid()) {
            alert('Configuración incompleta. Usa el icono de engranaje para configurar.');
            return;
        }

        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validando...';
        errorMsg.classList.add('hidden');

        let foundUser = null;

        // --- MÉTODO 1: GOOGLE SHEETS BRIDGE (Prioritario si está configurado) ---
        if (APPSHEET_CONFIG.bridgeUrl) {
            console.log('Intentando login vía Proxy -> GAS Bridge...');
            try {
                const response = await fetch('/api/appsheet', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'login',
                        username: userVal,
                        password: passVal,
                        bridgeUrl: APPSHEET_CONFIG.bridgeUrl
                    })
                });

                const bridgeData = await response.json();
                if (bridgeData && bridgeData.success && bridgeData.user) {
                    foundUser = bridgeData.user;
                }
            } catch (err) {
                console.warn('Error en Bridge Proxy, intentando AppSheet directo...', err);
            }
        }

        // --- MÉTODO 2: APPSHEET DIRECTO (Fallback si el Bridge falló o no existe) ---
        if (!foundUser) {
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

            if (response.ok && responseData.Success !== false) {
                let users = [];
                if (Array.isArray(responseData.RowValues)) users = responseData.RowValues;
                else if (Array.isArray(responseData.Rows)) users = responseData.Rows;

                if (users.length > 0) {
                    foundUser = users.find(u =>
                        String(u.Usuario).trim() === userVal &&
                        String(u.Password).trim() === passVal
                    );
                }

                // Si AppSheet devolvió null pero la conexión fue éxito, es un problema de plan
                if (!foundUser && responseData.RowValues === null && responseData.Success === true) {
                    alert("AVISO: AppSheet bloqueó la lectura de usuarios (restricción de plan).\n\nActiva el 'Puente de Google Sheets' para solucionar esto.");
                }
            }
        }

        // Si después de todo encontramos al usuario
        if (foundUser) {
            const sessionData = {
                userID: foundUser.ID_Contacto || foundUser.Usuario,
                nombre: foundUser.Usuario,
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
        alert(`ERROR DE LOGIN:\n\n${error.message}`);
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = originalText;
    }
}

function redirectByRol(rol) {
    const r = String(rol).toLowerCase();
    const routes = {
        'chofer': 'vista-chofer.html',
        'admin': 'vista-admin.html',
        'superadmin': 'vista-superadmin.html',
        'super admin': 'vista-superadmin.html'
    };
    window.location.href = routes[r] || 'index.html';
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
