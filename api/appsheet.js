/**
 * Vercel Proxy para AppSheet API
 * 
 * Este endpoint actúa como intermediario para evitar errores de CORS
 * y manejar las variables de entorno de forma segura.
 */

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { table, action, rows, properties } = req.body;

    const APP_ID = process.env.APPSHEET_APP_ID;
    const ACCESS_KEY = process.env.APPSHEET_ACCESS_KEY;

    if (!APP_ID || !ACCESS_KEY) {
        return res.status(500).json({
            error: 'Configuración de servidor incompleta (Variables de entorno faltantes en Vercel).'
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

        if (!response.ok) {
            return res.status(response.status).json({
                error: 'Error de AppSheet',
                details: data
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
