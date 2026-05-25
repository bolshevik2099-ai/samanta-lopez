const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jglptpkrqbwvnhpoockb.supabase.co';
const supabaseKey = 'sb_publishable_PR54H17KFdtc5sxPBeACeA_zhmE1j8w';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('--- COMISION CHOFER IN GASTOS ---');
    const { data, error } = await supabase.from('reg_gastos').select('*').eq('concepto', 'Comisión Chofer').limit(5);
    if (error) console.error(error);
    else console.log('Gastos Comisión Chofer:', data);

    console.log('--- COMISION CHOFER IN VIAJES ---');
    const { data: viajes, error: vError } = await supabase.from('reg_viajes').select('id_viaje, comision_chofer').gt('comision_chofer', 0).limit(5);
    if (vError) console.error(vError);
    else console.log('Viajes with comision:', viajes);
}

run();
