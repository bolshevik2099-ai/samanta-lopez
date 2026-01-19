/**
 * Vercel Proxy para AppSheet + GAS Bridge
 */

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { table, action, rows, appId, accessKey, bridgeUrl } = req.body;

    // --- CASO 1: LOGIN VÍA BRIDGE (GOOGLE SHEETS) ---
    if (bridgeUrl && action === 'login') {
        try {
            console.log('Proxy: Redirigiendo login a GAS Bridge...');
            const gasResponse = await fetch(bridgeUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(req.body)
            });
            const gasData = await gasResponse.json();
            return res.status(200).json(gasData);
        } catch (error) {
            console.error('GAS Bridge Proxy Error:', error);
            return res.status(500).json({ error: 'Error al contactar el puente de Google Sheets' });
        }
    }

    // --- CASO 2: APPSHEET API ESTÁNDAR ---
    const APPSHEET_APP_ID = appId || process.env.APPSHEET_APP_ID;
    const APPSHEET_ACCESS_KEY = accessKey || process.env.APPSHEET_ACCESS_KEY;

    if (!APPSHEET_APP_ID || !APPSHEET_ACCESS_KEY) {
        return res.status(400).json({ error: 'Configuración de AppSheet faltante' });
    }

    const apiUrl = `https://api.appsheet.com/api/v1/apps/${APPSHEET_APP_ID}/tables/${table}/Action`;

    try {
        const appsheetResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'ApplicationAccessKey': APPSHEET_ACCESS_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                Action: action,
                Properties: { Locale: 'es-MX' },
                Rows: rows || []
            })
        });

        const data = await appsheetResponse.json();

        // Log para diagnóstico
        console.log(`AppSheet Proxy [${action} on ${table}]: Success=${data.Success}`);

        return res.status(200).json(data);
    } catch (error) {
        console.error('AppSheet Proxy Error:', error);
        return res.status(500).json({ error: 'Error al contactar con AppSheet' });
    }
}
