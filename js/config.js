/**
 * Procesa-T CRM - Configuración Dinámica
 * 
 * Este archivo NO debe contener llaves privadas hardcodeadas.
 * Las llaves se leen de localStorage por seguridad en despliegues estáticos.
 */

const DB_CONFIG = {
    // Configuración de Tablas (Supabase)
    tableGastos: 'reg_gastos',
    tableUsuarios: 'usuarios',
    tableViajes: 'reg_viajes',
    tableChoferes: 'cat_choferes',
    tableUnidades: 'cat_unidades',
    tableClientes: 'cat_clientes',
    tableProveedores: 'cat_proveedores',
    tableCuentas: 'reg_cuentas',
    tableLiquidaciones: 'reg_liquidaciones',
    tableTarifas: 'cat_tarifas'
};

const SUPABASE_CONFIG = {
    url: 'https://jglptpkrqbwvnhpoockb.supabase.co',
    anonKey: 'sb_publishable_PR54H17KFdtc5sxPBeACeA_zhmE1j8w'
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
