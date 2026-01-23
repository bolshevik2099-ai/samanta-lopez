/**
 * Procesa-T CRM - Configuración Dinámica
 * 
 * Este archivo NO debe contener llaves privadas hardcodeadas.
 * Las llaves se leen de localStorage por seguridad en despliegues estáticos.
 */

const APPSHEET_CONFIG = {
    // Intentar leer de localStorage (persistente en el navegador)
    appId: localStorage.getItem('APPSHEET_APP_ID') || '',
    accessKey: localStorage.getItem('APPSHEET_ACCESS_KEY') || '',
    // URL del Puente GAS provista por el usuario
    bridgeUrl: localStorage.getItem('GAS_BRIDGE_URL') || 'https://script.google.com/macros/s/AKfycbyZom0VOyWN7zNiI8X_VpzHVVI_g6stDKhxbBErcPTard_THUsDCUmnbrtfsCw0IGOg8g/exec',

    // Configuración de Tablas
    tableName: 'REG_GASTOS',
    tableUsuarios: 'Usuarios',
    tableViajes: 'REG_VIAJES'
};

/**
 * Guarda las credenciales en localStorage y recarga la página
 */
function saveAppSheetCredentials(appId, accessKey) {
    if (!appId || !accessKey) {
        alert('Por favor, ingresa tanto el App ID como la Access Key.');
        return;
    }

    localStorage.setItem('APPSHEET_APP_ID', appId.trim());
    localStorage.setItem('APPSHEET_ACCESS_KEY', accessKey.trim());

    alert('Configuración guardada correctamente.');
    window.location.reload();
}

/**
 * Verifica si la configuración es válida
 */
function isConfigValid() {
    return APPSHEET_CONFIG.appId !== '' && APPSHEET_CONFIG.accessKey !== '';
}

/* 
Referencia de Tablas:
- USUARIOS: Control de acceso y roles.
- REG_GASTOS: Registro de tickets y costos operativos por los choferes.
- REG_VIAJES: Operación maestra de rutas.
- CAT_CHOFERES: Base de datos de operadores.
- CAT_UNIDADES: Inventario de flota.
- Control_Deudas: Gestión financiera y cobranza.
*/
