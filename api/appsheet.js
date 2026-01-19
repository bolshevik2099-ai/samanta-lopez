/**
 * Vercel Proxy para AppSheet API - Versión de Diagnóstico
 */

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { table, action, rows, properties, appId: clientAppId, accessKey: clientAccessKey } = req.body;

    // PRIORIDAD: Si el usuario escribió algo en el panel naranja, usaremos eso.
    // Esto permite corregir errores de Vercel sin tener que redeployar.
    const APP_ID = clientAppId || process.env.APPSHEET_APP_ID;
    const ACCESS_KEY = clientAccessKey || process.env.APPSHEET_ACCESS_KEY;

    if (!APP_ID || !ACCESS_KEY) {
        return res.status(400).json({
            error: 'Credenciales ausentes.',
            details: 'No hay llaves en Vercel ni se recibieron desde el navegador.'
        });
    }

    const url = `https://api.appsheet.com/api/v1/apps/${APP_ID}/tables/${table}/Action`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'ApplicationToken': ACCESS_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                Action: action || 'Find',
                Properties: properties || { Locale: 'es-MX' },
                Rows: rows || []
            })
        });

        const data = await response.json();

        // Enviar un resumen de qué llaves se usaron (ofuscadas) para debug
        const usedConfig = {
            usingProxy: true,
            appIdUsed: APP_ID.substring(0, 5) + '...',
            accessKeyUsed: ACCESS_KEY.substring(0, 5) + '...',
            source: clientAppId ? 'Cargado desde navegador (Panel Naranja)' : 'Cargado desde Vercel (Env Vars)'
        };

        if (!response.ok || data.Success === false) {
            return res.status(response.status || 401).json({
                error: 'AppSheet rechazó las llaves',
                details: data.ErrorDescription || 'Error de autenticación anónimo.',
                debug: usedConfig
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
