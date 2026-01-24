/**
 * Procesa-T CRM - Lógica de Autenticación con Puente de Seguridad (Versión Final Robusta)
 */

document.addEventListener('DOMContentLoaded', () => {
    // Verificar si estamos en una página protegida
    const isLoginPage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/';
    const session = checkAuth();

    if (!session && !isLoginPage) {
        console.warn('Acceso denegado: Redirigiendo a inicio.');
        window.location.href = 'index.html';
        return;
    }

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
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validando...';
        errorMsg.classList.add('hidden');

        let foundUser = null;

        // --- MÉTODO: SUPABASE (SQL) ---
        console.log('Intentando login vía Supabase...');
        try {
            const { data, error } = await window.supabaseClient
                .from(DB_CONFIG.tableUsuarios)
                .select('*')
                .eq('Usuario', userVal)
                .eq('Password', passVal)
                .single();

            if (data && !error) {
                foundUser = data;
                console.log('Usuario encontrado en Supabase:', foundUser);
            } else {
                console.warn('Supabase no encontró al usuario o credenciales incorrectas.');
            }
        } catch (err) {
            console.error('Error en fetch Supabase Auth:', err);
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

            setTimeout(() => {
                redirectByRol(foundUser.Rol);
            }, 100);

        } else {
            errorMsg.classList.remove('hidden');
            const span = errorMsg.querySelector('span');
            if (span) span.innerText = 'Credenciales incorrectas.';
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
        alert("Error: El usuario no tiene un Rol asignado.");
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
