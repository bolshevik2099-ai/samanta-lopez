const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
    // Configurar CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const supabaseUrl = 'https://jglptpkrqbwvnhpoockb.supabase.co';
        // Leer de la variable de entorno de Vercel por seguridad
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

        const { message, userId, sessionId } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Falta el mensaje.' });
        }

        // 1. Verificar rol del usuario en la base de datos para restringir acceso a administradores
        if (userId) {
            const { data: userRecord, error: userError } = await supabaseClient
                .from('usuarios')
                .select('rol')
                .or(`usuario.eq."${userId}",id_contacto.eq."${userId}"`)
                .maybeSingle();

            const userRol = String(userRecord.rol).trim().toLowerCase();
            if (userError || !userRecord || !(userRol === 'admin' || userRol === 'superadmin' || userRol === 'super admin')) {
                console.warn(`Acceso denegado para el usuario: ${userId} con rol: ${userRecord.rol}`);
                return res.status(200).json({ 
                    reply: '⚠️ Acceso denegado: No tienes permisos de administrador para interactuar con este asistente.' 
                });
            }
        } else {
            return res.status(200).json({ 
                reply: '⚠️ Acceso denegado: ID de usuario no especificado.' 
            });
        }

        // 2. Obtener configuración del Chat de la base de datos
        const { data: config, error: configError } = await supabaseClient
            .from('chat_config')
            .select('*')
            .eq('id', 1)
            .single();

        if (configError || !config || !config.api_key) {
            return res.status(200).json({ 
                reply: '⚠️ Configuración de IA no encontrada. Por favor ingresa tu API Key en la barra lateral "Configuración Chat" en el portal de administración.' 
            });
        }

        const apiKey = config.api_key;
        const systemInstruction = config.system_instruction || "Eres Samanta, el asistente inteligente de Procesa-T CRM.";
        const modelName = config.model_name || "gemini-1.5-flash";

        // 3. Obtener historial corto
        const { data: chatHistory } = await supabaseClient
            .from('chat_logs')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true })
            .limit(6);

        const contents = [];
        if (chatHistory && chatHistory.length > 0) {
            chatHistory.forEach(log => {
                contents.push({ role: 'user', parts: [{ text: log.message }] });
                contents.push({ role: 'model', parts: [{ text: log.response }] });
            });
        }
        contents.push({ role: 'user', parts: [{ text: message }] });

        // 4. Declaración de herramientas (Tool Calling)
        const tools = [
            {
                functionDeclarations: [
                    {
                        name: "consultar_viajes",
                        description: "Busca la lista de viajes registrados en el sistema. Opcionalmente filtra por chofer, cliente o estatus.",
                        parameters: {
                            type: "OBJECT",
                            properties: {
                                id_chofer: { type: "STRING", description: "Nombre o ID del chofer para filtrar" },
                                cliente: { type: "STRING", description: "Nombre del cliente para filtrar" },
                                estatus_viaje: { type: "STRING", description: "Estatus (Pendiente, Liquidado)" }
                            }
                        }
                    },
                    {
                        name: "consultar_gastos",
                        description: "Busca la lista de gastos registrados en el sistema. Filtra por chofer, unidad o concepto.",
                        parameters: {
                            type: "OBJECT",
                            properties: {
                                id_chofer: { type: "STRING", description: "Nombre o ID del chofer para filtrar" },
                                id_unidad: { type: "STRING", description: "Identificador de la unidad (ECO) para filtrar" },
                                concepto: { type: "STRING", description: "Concepto de gasto (Diesel, Casetas, etc.)" }
                            }
                        }
                    },
                    {
                        name: "consultar_choferes",
                        description: "Obtiene una lista de todos los choferes y operadores registrados en el sistema.",
                        parameters: { type: "OBJECT", properties: {} }
                    },
                    {
                        name: "consultar_unidades",
                        description: "Obtiene la lista de camiones y unidades de la flota.",
                        parameters: { type: "OBJECT", properties: {} }
                    },
                    {
                        name: "registrar_gasto",
                        description: "Registra un nuevo gasto operativo en el sistema.",
                        parameters: {
                            type: "OBJECT",
                            properties: {
                                concepto: { type: "STRING", description: "Concepto del gasto (ej. Diesel, Casetas, Comida)" },
                                monto: { type: "NUMBER", description: "Monto total del gasto en pesos" },
                                id_unidad: { type: "STRING", description: "Identificador ecológico de la unidad (ECO)" },
                                id_chofer: { type: "STRING", description: "Nombre o ID del chofer que realizó el gasto" },
                                tipo_pago: { type: "STRING", description: "Tipo de pago (Efectivo, Transferencia, Tarjeta)" }
                            },
                            required: ["concepto", "monto", "id_unidad"]
                        }
                    },
                    {
                        name: "registrar_viaje",
                        description: "Registra un nuevo servicio de viaje o ruta en el sistema.",
                        parameters: {
                            type: "OBJECT",
                            properties: {
                                cliente: { type: "STRING", description: "Nombre del cliente" },
                                origen: { type: "STRING", description: "Ciudad o lugar de origen" },
                                destino: { type: "STRING", description: "Ciudad o lugar de destino" },
                                monto_flete: { type: "NUMBER", description: "Monto cobrado por el flete en pesos" },
                                id_chofer: { type: "STRING", description: "ID o nombre del chofer asignado" },
                                id_unidad: { type: "STRING", description: "ID de la unidad asignada" }
                            },
                            required: ["cliente", "origen", "destino", "monto_flete"]
                        }
                    }
                ]
            }
        ];

        let finalResponseText = '';
        let loopCount = 0;
        const maxLoops = 4;

        while (loopCount < maxLoops) {
            const apiResponse = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: contents,
                        systemInstruction: { parts: [{ text: systemInstruction }] },
                        tools: tools
                    })
                }
            );

            if (!apiResponse.ok) {
                const errorText = await apiResponse.text();
                throw new Error(`API de Gemini retornó error: ${apiResponse.statusText}. Detalle: ${errorText}`);
            }

            const responseJson = await apiResponse.json();
            const candidate = responseJson.candidates?.[0];
            const modelContent = candidate?.content;
            const parts = modelContent?.parts || [];

            contents.push(modelContent);

            // Verificar si la IA solicita ejecutar una función
            const functionCallPart = parts.find(p => p.functionCall);
            
            if (functionCallPart) {
                const { name, args } = functionCallPart.functionCall;
                let executionResult;

                try {
                    if (name === "consultar_viajes") {
                        let query = supabaseClient.from('reg_viajes').select('*');
                        if (args.id_chofer) query = query.ilike('id_chofer', `%${args.id_chofer}%`);
                        if (args.cliente) query = query.ilike('cliente', `%${args.cliente}%`);
                        if (args.estatus_viaje) query = query.eq('estatus_viaje', args.estatus_viaje);
                        const { data } = await query.order('fecha', { ascending: false }).limit(10);
                        executionResult = data || [];

                    } else if (name === "consultar_gastos") {
                        let query = supabaseClient.from('reg_gastos').select('*');
                        if (args.id_chofer) query = query.ilike('id_chofer', `%${args.id_chofer}%`);
                        if (args.id_unidad) query = query.eq('id_unidad', args.id_unidad);
                        if (args.concepto) query = query.ilike('concepto', `%${args.concepto}%`);
                        const { data } = await query.order('fecha', { ascending: false }).limit(10);
                        executionResult = data || [];

                    } else if (name === "consultar_choferes") {
                        const { data } = await supabaseClient.from('cat_choferes').select('*');
                        executionResult = data || [];

                    } else if (name === "consultar_unidades") {
                        const { data } = await supabaseClient.from('cat_unidades').select('*');
                        executionResult = data || [];

                    } else if (name === "registrar_gasto") {
                        const idGasto = 'GAS-' + Math.floor(100000 + Math.random() * 900000);
                        const gastoData = {
                            id_gasto: idGasto,
                            fecha: new Date().toLocaleDateString('en-CA'),
                            concepto: args.concepto,
                            monto: args.monto,
                            id_unidad: args.id_unidad,
                            id_chofer: args.id_chofer || null,
                            tipo_pago: args.tipo_pago || 'Efectivo',
                            estatus_aprobacion: 'Pendiente',
                            estatus_pago: 'Pendiente'
                        };
                        const { data, error: insertError } = await supabaseClient
                            .from('reg_gastos')
                            .insert([gastoData])
                            .select();
                        if (insertError) throw insertError;
                        executionResult = { success: true, message: "Gasto registrado exitosamente", data: data?.[0] };

                    } else if (name === "registrar_viaje") {
                        const idViaje = 'VIA-' + Math.floor(100000 + Math.random() * 900000);
                        const viajeData = {
                            id_viaje: idViaje,
                            fecha: new Date().toLocaleDateString('en-CA'),
                            cliente: args.cliente,
                            origen: args.origen,
                            destino: args.destino,
                            monto_flete: args.monto_flete,
                            id_chofer: args.id_chofer || null,
                            id_unidad: args.id_unidad || null,
                            estatus_viaje: 'Pendiente',
                            estatus_pago: 'Pendiente'
                        };
                        const { data, error: insertError } = await supabaseClient
                            .from('reg_viajes')
                            .insert([viajeData])
                            .select();
                        if (insertError) throw insertError;
                        executionResult = { success: true, message: "Viaje registrado exitosamente", data: data?.[0] };
                    } else {
                        executionResult = { error: `Herramienta ${name} no disponible.` };
                    }
                } catch (dbErr) {
                    executionResult = { error: dbErr.message || 'Error en base de datos.' };
                }

                contents.push({
                    role: 'function',
                    parts: [{
                        functionResponse: {
                            name: name,
                            response: { output: executionResult }
                        }
                    }]
                });

                loopCount++;
            } else {
                const textPart = parts.find(p => p.text);
                finalResponseText = textPart?.text || 'No pude procesar la respuesta.';
                break;
            }
        }

        if (!finalResponseText) {
            finalResponseText = 'Límite de bucles alcanzado sin respuesta.';
        }

        // Guardar log
        await supabaseClient.from('chat_logs').insert([
            {
                session_id: sessionId,
                user_id: userId || null,
                message: message,
                response: finalResponseText
            }
        ]);

        return res.status(200).json({ reply: finalResponseText });

    } catch (err) {
        console.error("Vercel Serverless Function Error:", err);
        return res.status(200).json({ reply: `⚠️ Error de comunicación con el asistente: ${err.message}` });
    }
};
