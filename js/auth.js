/**
 * Procesa-T CRM - Lógica de Autenticación con Puente de Seguridad (Versión Final Robusta)
 */

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
});

async function handleLogin(e) {
    if (e) e.preventDefault();

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
                console.log('Respuesta cruda del Bridge:', bridgeData);

                if (response.ok && bridgeData && bridgeData.success && bridgeData.user) {
                    foundUser = bridgeData.user;
                    console.log('Usuario encontrado vía Bridge:', foundUser);
                } else if (bridgeData && bridgeData.success === false) {
                    bridgeError = bridgeData.error || "Credenciales no válidas en el Excel.";
                }
            } catch (err) {
                console.error('Error en fetch Bridge:', err);
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
            }
        }

        // --- RESULTADO ---
        if (foundUser) {
            console.log('¡Login Exitoso! Guardando sesión para:', foundUser.Usuario);
            const sessionData = {
                userID: foundUser.ID_Contacto || foundUser.Usuario,
                nombre: foundUser.Usuario,
                rol: foundUser.Rol,
                timestamp: new Date().getTime()
            };
            localStorage.setItem('crm_session', JSON.stringify(sessionData));

            // Pequeña pausa para asegurar que el localStorage se guarde
            setTimeout(() => {
                redirectByRol(foundUser.Rol);
            }, 100);

        } else {
            // Si el puente falló explícitamente, avisamos
            if (bridgeUsed && bridgeError && !bridgeError.includes("incorrectos")) {
                alert(`❌ ERROR EN EL PUENTE:\n${bridgeError}`);
            } else {
                errorMsg.classList.remove('hidden');
                const span = errorMsg.querySelector('span');
                if (span) span.innerText = 'Usuario o contraseña incorrectos.';
            }
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
    if (!rol) {
        alert("Error: El usuario no tiene un Rol asignado en el Excel.");
        window.location.href = 'index.html';
        return;
    }

    const r = String(rol).trim().toLowerCase();
    console.log('Redirigiendo para el rol:', r);

    const routes = {
        'chofer': 'vista-chofer.html',
        'admin': 'vista-admin.html',
        'superadmin': 'vista-superadmin.html',
        'super admin': 'vista-superadmin.html'
    };

    const target = routes[r];

    if (target) {
        console.log('Destino encontrado:', target);
        window.location.href = target;
    } else {
        alert(`Error: El rol "${rol}" no tiene una vista asignada.\nRoles válidos: Chofer, Admin, SuperAdmin.`);
        window.location.href = 'index.html';
    }
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
