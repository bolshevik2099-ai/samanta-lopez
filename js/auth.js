/**
 * Procesa-T CRM - Lógica de Autenticación con Puente de Seguridad (Diagnóstico Pro)
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
        let bridgeUsed = false;
        let bridgeError = null;

        // --- MÉTODO 1: GOOGLE SHEETS BRIDGE (Prioritario) ---
        if (APPSHEET_CONFIG.bridgeUrl && APPSHEET_CONFIG.bridgeUrl.includes('script.google.com')) {
            bridgeUsed = true;
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

                if (!response.ok) {
                    throw new Error(bridgeData.error || `Error ${response.status}`);
                }

                if (bridgeData && bridgeData.success && bridgeData.user) {
                    foundUser = bridgeData.user;
                } else if (bridgeData && bridgeData.success === false) {
                    bridgeError = "Usuario o contraseña no encontrados en el Excel.";
                }
            } catch (err) {
                console.error('Error crítico en Bridge:', err);
                bridgeError = err.message;
            }
        }

        // --- MÉTODO 2: APPSHEET DIRECTO (Fallback) ---
        if (!foundUser) {
            console.log('Intentando login vía AppSheet directo...');
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
                    if (!bridgeUsed) {
                        alert("⚠️ BLOQUEO DE PLAN detectado.\n\nAppSheet no permite leer usuarios. Por favor, configura el 'URL Puente (GAS)' en los ajustes para solucionar esto.");
                    } else if (bridgeError) {
                        alert(`❌ ERROR EN EL PUENTE:\n${bridgeError}\n\nRecomendación: Asegúrate de usar la URL de la 'Aplicación Web' que termina en /exec y que el script esté publicado para 'Cualquiera'.`);
                    } else {
                        alert("⚠️ USUARIO NO ENCONTRADO.\n\nEl puente funcionó pero no encontramos a '" + userVal + "' en tu hoja de Excel.");
                    }
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
        alert(`ERROR CRÍTICO:\n\n${error.message}`);
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
