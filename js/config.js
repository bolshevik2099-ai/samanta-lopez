/**
 * Procesa-T CRM - Configuración Dinámica
 * 
 * Este archivo NO debe contener llaves privadas hardcodeadas.
 * Las llaves se leen de localStorage por seguridad en despliegues estáticos.
 */

const DB_CONFIG = {
    // Configuración de Tablas (Supabase)
    tableGastos: 'reg_gastos',   // app_reg_gastos_v1
    tableUsuarios: 'usuarios',     // app_usuarios_v1
    tableViajes: 'reg_viajes',      // app_reg_viajes_v1
    tableChoferes: 'cat_choferes',
    tableUnidades: 'cat_unidades',
    tableClientes: 'cat_clientes',
    tableProveedores: 'cat_proveedores'
};

const SUPABASE_CONFIG = {
    url: 'https://mjaiggtclxycjarfeewd.supabase.co',
    anonKey: 'sb_publishable_uCvLBKSsOn-NNpdVmyq-yA_RX0NFll-'
};


/* 
Referencia de Tablas:
- USUARIOS: Control de acceso y roles.
- REG_GASTOS: Registro de tickets y costos operativos por los choferes.
- REG_VIAJES: Operación maestra de rutas.
- CAT_CHOFERES: Base de datos de operadores.
- CAT_UNIDADES: Inventario de flota.
- Control_Deudas: Gestión financiera y cobranza.
*/
