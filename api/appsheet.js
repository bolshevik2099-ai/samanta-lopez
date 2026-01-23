export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { table, action, rows, bridgeUrl } = req.body;

    // Prioridad: URL enviada por el front > Variable de Entorno > AppSheet directo
    const effectiveBridgeUrl = bridgeUrl || process.env.GAS_BRIDGE_URL || 'https://script.google.com/macros/s/AKfycbyZom0VOyWN7zNiI8X_VpzHVVI_g6stDKhxbBErcPTard_THUsDCUmnbrtfsCw0IGOg8g/exec';

    // --- MODO: PROXY A GAS BRIDGE (Prioritario) ---
    if (effectiveBridgeUrl) {
        try {
            console.log('Proxy: Redirigiendo a GAS Bridge:', effectiveBridgeUrl);

            // Re-estructurar payload para que coincida con lo que espera el script GAS
            const gasPayload = {
                action: action,
                table: table,
                rows: rows,
                username: req.body.username, // Para login
                password: req.body.password  // Para login
            };

            const gasResponse = await fetch(effectiveBridgeUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(gasPayload)
            });

            const text = await gasResponse.text();
            let gasData;

            try {
                gasData = JSON.parse(text);
            } catch (e) {
                console.error('GAS Bridge devolvió HTML/Texto, no JSON:', text.substring(0, 150));
                return res.status(502).json({
                    error: 'Error de respuesta del script de Google',
                    details: 'Posiblemente URL incorrecta o permisos insuficientes.',
                    raw: text.substring(0, 100)
                });
            }

            return res.status(200).json(gasData);

        } catch (error) {
            console.error('GAS Bridge Network Error:', error);
            return res.status(500).json({ error: `Error conectando con Google: ${error.message}` });
        }
    }

    // --- FALLBACK: APPSHEET API ESTÁNDAR (Legacy) ---
    const APPSHEET_APP_ID = req.body.appId || process.env.APPSHEET_APP_ID;
    const APPSHEET_ACCESS_KEY = req.body.accessKey || process.env.APPSHEET_ACCESS_KEY;

    if (!APPSHEET_APP_ID || !APPSHEET_ACCESS_KEY) {
        return res.status(400).json({ error: 'Configuración de AppSheet faltante' });
    }

    const apiUrl = `https://api.appsheet.com/api/v1/apps/${APPSHEET_APP_ID}/tables/${table}/Action`;

    try {
        const payload = {
            Action: action,
            Properties: req.body.Properties || {}
        };
        if (rows && rows.length > 0) payload.Rows = rows;

        const appsheetResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'ApplicationAccessKey': APPSHEET_ACCESS_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await appsheetResponse.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error('AppSheet Proxy Error:', error);
        return res.status(500).json({ error: 'Error al contactar con AppSheet' });
    }
}
