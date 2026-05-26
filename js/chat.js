const VENTAS_URL = `${SUPABASE_CONFIG.url}/functions/v1/webhook-ventas`;
const ADMIN_URL = `${SUPABASE_CONFIG.url}/functions/v1/webhook-admin`;

// ID de sesión para persistencia de memoria
let sessionId = localStorage.getItem('chat_session_id');
if (!sessionId) {
    sessionId = 'sess-' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('chat_session_id', sessionId);
}

function initChat() {
    const chatBtn = document.getElementById('chat-toggle');
    const chatWindow = document.getElementById('chat-window');
    const chatClose = document.getElementById('chat-close');
    const chatForm = document.getElementById('chat-form');
    const chatMessages = document.getElementById('chat-messages');

    if (!chatBtn || !chatWindow) return;

    chatBtn.addEventListener('click', () => {
        chatWindow.classList.toggle('hidden');
        chatWindow.classList.toggle('chat-open');
    });

    chatClose.addEventListener('click', () => {
        chatWindow.classList.add('hidden');
        chatWindow.classList.remove('chat-open');
    });

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        if (!message) return;

        appendMessage('user', message);
        input.value = '';

        const typingId = appendMessage('bot', '<i class="fas fa-circle-notch fa-spin text-slate-400"></i>', true);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout para llamadas con herramientas

        try {
            const session = typeof checkAuth === 'function' ? checkAuth() : null;
            const isAdmin = session && (session.rol === 'admin' || session.rol === 'superadmin' || session.rol === 'super admin');
            const userId = session ? session.userID : null;

            // Si es administrador, ejecutamos del lado del cliente de forma rápida y segura
            if (isAdmin) {
                // 1. Obtener la configuración de la IA de la base de datos
                const { data: config, error: configError } = await window.supabaseClient
                    .from('chat_config')
                    .select('*')
                    .eq('id', 1)
                    .single();

                if (configError || !config || !config.api_key) {
                    clearTimeout(timeoutId);
                    removeMessage(typingId);
                    appendMessage('bot', '⚠️ Configuración de IA no encontrada. Por favor ingresa tu API Key de Gemini en la barra lateral "Configuración Chat".');
                    return;
                }

                // 2. Obtener el historial corto para dar contexto a la IA
                const { data: chatHistory } = await window.supabaseClient
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

                // 3. Declaración de herramientas (Tool Calling)
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
                        `https://generativelanguage.googleapis.com/v1beta/models/${config.model_name || 'gemini-1.5-flash'}:generateContent?key=${config.api_key}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: contents,
                                systemInstruction: { parts: [{ text: config.system_instruction || "Eres Samanta, el asistente inteligente de Procesa-T CRM." }] },
                                tools: tools
                            }),
                            signal: controller.signal
                        }
                    );

                    if (!apiResponse.ok) {
                        const errorText = await apiResponse.text();
                        throw new Error(`API Gemini Error: ${errorText}`);
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
                        console.log(`[Samanta Tool] Ejecutando: ${name}`, args);

                        let executionResult;

                        try {
                            if (name === "consultar_viajes") {
                                let query = window.supabaseClient.from('reg_viajes').select('*');
                                if (args.id_chofer) query = query.ilike('id_chofer', `%${args.id_chofer}%`);
                                if (args.cliente) query = query.ilike('cliente', `%${args.cliente}%`);
                                if (args.estatus_viaje) query = query.eq('estatus_viaje', args.estatus_viaje);
                                const { data } = await query.order('fecha', { ascending: false }).limit(10);
                                executionResult = data || [];

                            } else if (name === "consultar_gastos") {
                                let query = window.supabaseClient.from('reg_gastos').select('*');
                                if (args.id_chofer) query = query.ilike('id_chofer', `%${args.id_chofer}%`);
                                if (args.id_unidad) query = query.eq('id_unidad', args.id_unidad);
                                if (args.concepto) query = query.ilike('concepto', `%${args.concepto}%`);
                                const { data } = await query.order('fecha', { ascending: false }).limit(10);
                                executionResult = data || [];

                            } else if (name === "consultar_choferes") {
                                const { data } = await window.supabaseClient.from('cat_choferes').select('*');
                                executionResult = data || [];

                            } else if (name === "consultar_unidades") {
                                const { data } = await window.supabaseClient.from('cat_unidades').select('*');
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
                                const { data, error: insertError } = await window.supabaseClient
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
                                const { data, error: insertError } = await window.supabaseClient
                                    .from('reg_viajes')
                                    .insert([viajeData])
                                    .select();
                                if (insertError) throw insertError;
                                executionResult = { success: true, message: "Viaje registrado exitosamente", data: data?.[0] };
                            } else {
                                executionResult = { error: `Herramienta ${name} no disponible.` };
                            }
                        } catch (dbErr) {
                            console.error(`Error ejecutando herramienta ${name}:`, dbErr);
                            executionResult = { error: dbErr.message || 'Error en base de datos.' };
                        }

                        // Retroalimentar respuesta de la herramienta
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
                    finalResponseText = 'Límite de bucles alcanzado sin respuesta final de la IA.';
                }

                // Guardar registro histórico
                await window.supabaseClient.from('chat_logs').insert([
                    {
                        session_id: sessionId,
                        user_id: userId || null,
                        message: message,
                        response: finalResponseText
                    }
                ]);

                clearTimeout(timeoutId);
                removeMessage(typingId);
                appendMessage('bot', finalResponseText);
            } else {
                // Si es chofer o no admin, seguimos usando el webhook original de ventas
                const response = await fetch(VENTAS_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': SUPABASE_CONFIG.anonKey,
                        'Authorization': session ? `Bearer ${session.access_token}` : ''
                    },
                    body: JSON.stringify({
                        message: message,
                        userId: userId,
                        sessionId: sessionId,
                        localDate: new Date().toLocaleDateString('en-CA')
                    }),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);
                const data = await response.json();
                removeMessage(typingId);

                if (response.ok) {
                    appendMessage('bot', data.reply || 'Sin respuesta.');
                } else {
                    appendMessage('bot', `Error ${response.status}: ${data.error || 'Problema en servidor'}`);
                }
            }
        } catch (error) {
            clearTimeout(timeoutId);
            removeMessage(typingId);
            if (error.name === 'AbortError') {
                appendMessage('bot', 'La respuesta está tardando demasiado. Por favor, intenta de nuevo.');
            } else {
                appendMessage('bot', 'Error de conexión con el asistente: ' + error.message);
            }
            console.error('Chat Error:', error);
        }
    });

    function appendMessage(sender, text, isTyping = false) {
        const id = 'msg-' + Date.now();
        const div = document.createElement('div');
        div.id = id;
        div.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'} mb-4`;

        // Procesar enlaces para que sean clickeables
        let processedText = text;
        if (!isTyping) {
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            processedText = text.replace(urlRegex, (url) => {
                return `<a href="${url}" target="_blank" class="text-blue-600 underline hover:text-blue-800 break-all">${url}</a>`;
            });
            // También procesar saltos de línea
            processedText = processedText.replace(/\n/g, '<br>');
        }

        const inner = `
            <div class="max-w-[85%] rounded-2xl px-4 py-2 ${sender === 'user' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800'} text-sm shadow-sm ring-1 ring-slate-900/5">
                ${processedText}
            </div>
        `;
        div.innerHTML = inner;
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return id;
    }

    function removeMessage(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    // CARGAR HISTORIAL AL INICIAR
    async function loadHistory() {
        if (!window.supabaseClient) {
            console.warn('Supabase client no cargado aún.');
            return;
        }

        try {
            const { data, error } = await window.supabaseClient
                .from('chat_logs')
                .select('*')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: true })
                .limit(10); // Cargamos los últimos 10 mensajes

            if (error) throw error;

            if (data && data.length > 0) {
                // Limpiar mensajes de bienvenida si hay historial
                chatMessages.innerHTML = '';
                data.forEach(log => {
                    appendMessage('user', log.message);
                    appendMessage('bot', log.response);
                });
            }
        } catch (err) {
            console.error('Error loading chat history:', err);
        }
    }

    // Ejecutar carga de historial
    loadHistory();
}

document.addEventListener('DOMContentLoaded', initChat);
