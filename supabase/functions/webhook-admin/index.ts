import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Manejar solicitudes preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Obtener datos del cuerpo de la petición
    const { message, userId, sessionId } = await req.json()
    if (!message) {
      return new Response(JSON.stringify({ error: 'Falta el mensaje.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    // 1.1. Verificar rol del usuario en la base de datos para restringir acceso a administradores
    if (userId) {
      const { data: userRecord, error: userError } = await supabaseClient
        .from('usuarios')
        .select('rol')
        .or(`usuario.eq."${userId}",id_contacto.eq."${userId}"`)
        .maybeSingle();

      const userRol = String(userRecord.rol).trim().toLowerCase();
      if (userError || !userRecord || !(userRol === 'admin' || userRol === 'superadmin' || userRol === 'super admin')) {
        console.warn(`Intento de acceso no autorizado de userId: ${userId} con rol: ${userRecord.rol}`);
        return new Response(JSON.stringify({ 
          reply: '⚠️ Acceso denegado: No tienes permisos de administrador para interactuar con este asistente.' 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        });
      }
    } else {
      console.warn("Llamada al webhook de administración sin userId.");
      return new Response(JSON.stringify({ 
        reply: '⚠️ Acceso denegado: ID de usuario no especificado.' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // 2. Obtener configuración del Chat de la base de datos
    const { data: config, error: configError } = await supabaseClient
      .from('chat_config')
      .select('*')
      .eq('id', 1)
      .single()

    if (configError || !config || !config.api_key) {
      console.error("Config Error:", configError);
      return new Response(JSON.stringify({ 
        reply: '⚠️ Error: Configuración de IA no encontrada. Por favor ingresa tu API Key en la sección "Configuración Chat" en el portal de administración.' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 // Respondemos 200 con el mensaje de error formateado para el chat
      })
    }

    const apiKey = config.api_key;
    const systemInstruction = config.system_instruction || "Eres Samanta, el asistente inteligente de Procesa-T CRM.";
    const modelName = config.model_name || "gemini-1.5-flash";

    // 3. Consultar últimos 6 mensajes del historial en la base de datos para dar contexto
    const { data: chatHistory } = await supabaseClient
      .from('chat_logs')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(6);

    // 4. Preparar el arreglo de "contents" para Gemini
    const contents: any[] = [];
    if (chatHistory && chatHistory.length > 0) {
      chatHistory.forEach(log => {
        contents.push({ role: 'user', parts: [{ text: log.message }] });
        contents.push({ role: 'model', parts: [{ text: log.response }] });
      });
    }
    // Agregar el mensaje actual del usuario
    contents.push({ role: 'user', parts: [{ text: message }] });

    // 5. Definir herramientas (Functions Declarations)
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

    // 6. Loop de ejecución para manejar Tool Calling recurrentemente
    let finalResponseText = '';
    let loopCount = 0;
    const maxLoops = 4;

    while (loopCount < maxLoops) {
      console.log(`Llamando a Gemini (Iteración ${loopCount + 1})...`);
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
        console.error("Gemini API Error:", errorText);
        throw new Error(`API de Gemini retornó error: ${apiResponse.statusText}`);
      }

      const responseJson = await apiResponse.json();
      const candidate = responseJson.candidates?.[0];
      const modelContent = candidate?.content;
      const parts = modelContent?.parts || [];

      // Guardar el mensaje del modelo en el historial de la conversación actual
      contents.push(modelContent);

      // Comprobar si hay llamadas a funciones (tool calling)
      const functionCallPart = parts.find((p: any) => p.functionCall);
      
      if (functionCallPart) {
        const { name, args } = functionCallPart.functionCall;
        console.log(`Ejecutando herramienta requerida: ${name} con argumentos:`, args);

        let executionResult: any;

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
              fecha: new Date().toLocaleDateString('en-CA'), // YYYY-MM-DD
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
        } catch (dbErr: any) {
          console.error(`Error ejecutando herramienta ${name}:`, dbErr);
          executionResult = { error: dbErr.message || 'Error en base de datos.' };
        }

        // Agregar el resultado de la función al contexto para la IA
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
        // Si no hay más llamadas a función, la respuesta actual contiene el texto final
        const textPart = parts.find((p: any) => p.text);
        finalResponseText = textPart?.text || 'No pude procesar la respuesta.';
        break;
      }
    }

    if (!finalResponseText) {
      finalResponseText = 'Se alcanzó el límite de llamadas a la base de datos sin una respuesta textual de la IA.';
    }

    // 7. Guardar log de la conversación en chat_logs
    await supabaseClient.from('chat_logs').insert([
      {
        session_id: sessionId,
        user_id: userId || null,
        message: message,
        response: finalResponseText
      }
    ]);

    // 8. Responder con la respuesta final de la IA
    return new Response(JSON.stringify({ reply: finalResponseText }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (err: any) {
    console.error("General Edge Function Error:", err);
    return new Response(JSON.stringify({ 
      reply: `⚠️ Ocurrió un error en el servidor del asistente: ${err.message}` 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 // Respondemos con 200 para que aparezca elegantemente en la interfaz del chat
    })
  }
})
