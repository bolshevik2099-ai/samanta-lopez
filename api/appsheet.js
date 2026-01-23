/**
 * Vercel Proxy para AppSheet + GAS Bridge (Versión con Diagnóstico)
 */

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { table, action, rows, bridgeUrl } = req.body;

    // Prioridad: URL enviada por el front > Variable de Entorno > AppSheet directo
    // NOTA: Para este caso, vamos a forzar el uso del Bridge si está disponible, ya que AppSheet está fallando.
    const effectiveBridgeUrl = bridgeUrl || process.env.GAS_BRIDGE_URL || 'https://script.google.com/macros/s/AKfycbyZom0VOyWN7zNiI8X_VpzHVVI_g6stDKhxbBErcPTard_THUsDCUmnbrtfsCw0IGOg8g/exec';

    // --- MODO: PROXY A GAS BRIDGE ---
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
                // A veces Google devuelve redirecciones o errores HTML
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

    // --- FALLBACK: APPSHEET API ESTÁNDAR (Si no hay bridge) ---
    const APPSHEET_APP_ID = req.body.appId || process.env.APPSHEET_APP_ID;
