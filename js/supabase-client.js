/**
 * Procesa-T CRM - Inicialización de Supabase
 */

const { createClient } = supabase;

const _supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

console.log('Supabase: Cliente inicializado correctamente.');

window.supabaseClient = _supabase;
