const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jglptpkrqbwvnhpoockb.supabase.co';
const anonKey = 'sb_publishable_PR54H17KFdtc5sxPBeACeA_zhmE1j8w';
const supabase = createClient(supabaseUrl, anonKey);

async function check() {
    const resA = await supabase.from('cat_choferes').select('*');
    console.log("Choferes:", resA.data);
    const resB = await supabase.from('cat_unidades').select('*');
    console.log("Unidades:", resB.data);
    const resC = await supabase.from('cat_clientes').select('*');
    console.log("Clientes:", resC.data);
}
check();
