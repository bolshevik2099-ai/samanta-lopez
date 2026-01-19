/**
 * Vercel Proxy para AppSheet API - Versión Híbrida
 */

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    // Recibir datos del cliente, incluyendo posibles llaves de fallback
    const { table, action, rows, properties, appId: clientAppId, accessKey: clientAccessKey } = req.body;

    // Priorizar variables de entorno de Vercel, luego las enviadas por el cliente
    const APP_ID = process.env.APPSHEET_APP_ID || clientAppId;
    const ACCESS_KEY = process.env.APPSHEET_ACCESS_KEY || clientAccessKey;

    if (!APP_ID || !ACCESS_KEY) {
        return res.status(400).json({
            error: 'Credenciales faltantes.',
            message: 'No se encontraron llaves en Vercel ni se enviaron desde el cliente.'
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

        // Registrar error en logs de Vercel (solo visible para el dueño)
        if (!response.ok || data.Success === false) {
            console.error(`AppSheet API Error (${table}):`, data.ErrorDescription || 'Sin descripción');
        }

        // Devolvemos el status original y la data completa
        return res.status(response.status).json(data);

    } catch (error) {
        console.error('Proxy Internal Error:', error);
        return res.status(500).json({
            error: 'Error interno del Proxy',
            details: error.message
        });
    }
}
