/**
 * Vercel Proxy para AppSheet API - Versión Corregida (Headers)
 */

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { table, action, rows, properties, appId: clientAppId, accessKey: clientAccessKey } = req.body;

    // Priorizar llaves enviadas por el navegador (panel naranja)
    const APP_ID = clientAppId || process.env.APPSHEET_APP_ID;
    const ACCESS_KEY = clientAccessKey || process.env.APPSHEET_ACCESS_KEY;

    if (!APP_ID || !ACCESS_KEY) {
        return res.status(400).json({
            error: 'Faltan credenciales.',
            details: 'No se encontraron llaves en Vercel ni en el navegador.'
        });
    }

    const url = `https://api.appsheet.com/api/v1/apps/${APP_ID}/tables/${table}/Action`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                // Según el error y docs recientes, el nombre exacto es ApplicationAccessKey
                'ApplicationAccessKey': ACCESS_KEY,
                'ApplicationToken': ACCESS_KEY, // Backup para versiones antiguas
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                Action: action || 'Find',
                Properties: properties || { Locale: 'es-MX' },
                Rows: rows || []
            })
        });

        const data = await response.json();

        const debugInfo = {
            usingProxy: true,
            source: clientAppId ? 'Navegador' : 'Vercel',
            appIdSnippet: APP_ID.substring(0, 5) + '...',
            headerUsed: 'ApplicationAccessKey'
        };

        if (!response.ok || data.Success === false) {
            return res.status(response.status || 401).json({
                error: 'AppSheet rechazó la petición',
                details: data.ErrorDescription || 'Error de autenticación.',
                debug: debugInfo
            });
        }

        return res.status(200).json(data);

    } catch (error) {
        console.error('Proxy Error:', error);
        return res.status(500).json({
            error: 'Error interno del Proxy',
            details: error.message
        });
    }
}
