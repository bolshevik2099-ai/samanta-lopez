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
    const systemInstructionBase = config.system_instruction || "Eres Samanta, el asistente inteligente de Procesa-T CRM.";
    
    // Obtener la fecha actual en formato YYYY-MM-DD en la zona horaria de México
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const day = String(new Date().getDate()).padStart(2, '0');
    const dateStringYYYYMMDD = `${year}-${month}-${day}`;

    const isSaul = userId && String(userId).trim().toLowerCase() === 'saulrivas@gmail.com';

    let systemInstruction = systemInstructionBase + `\n\n` + 
        `[INFORMACIÓN DEL ENTORNO]\n` + 
        `- Fecha actual de hoy: ${dateStringYYYYMMDD} (formato YYYY-MM-DD)\n` +
        `\n` +
        `[REGLAS DE OPERACIÓN]\n` +
        `1. Utiliza únicamente las herramientas provistas. NO intentes inventar herramientas ni parámetros.\n` +
        `2. Si el usuario te pregunta por datos de 'hoy', utiliza el parámetro 'fecha' en 'consultar_gastos' o 'consultar_viajes' con el valor exacto de la fecha actual de hoy: '${dateStringYYYYMMDD}'.\n` +
        `3. Si el usuario te pide un cálculo o análisis complejo (como el rendimiento de unidades, el chofer que más consume diésel, etc.) para el cual no existe una herramienta directa, primero haz la consulta de la información base usando las herramientas correspondientes (ej: 'consultar_gastos' o 'consultar_unidades') SIN filtros de fecha para poder analizar todo el histórico, y luego haz el cálculo o análisis en tu respuesta de texto final.\n` +
        `4. Si una pregunta no se puede responder directamente con una herramienta, o consideras que no tienes herramientas aptas, NO intentes forzar una llamada a función errónea. Explica amigablemente en tu respuesta de texto lo que necesitas o las limitaciones del sistema en base a los datos disponibles.\n` +
        `5. Asegúrate de dar respuestas analíticas, completas, bien estructuradas y formales en español basándote en la información extraída.`;

    if (isSaul) {
      systemInstruction += `\n6. [RESTRICCIÓN CRÍTICA] El usuario actual (saulrivas@gmail.com) no tiene permitido registrar viajes. Si te pide registrar un viaje, debes responderle claramente en español que esta función no está disponible para su cuenta y que no es posible realizarla.`;
    }

    const modelName = config.model_name || "gemini-2.5-flash";

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
            description: "Busca la lista de viajes registrados en el sistema. Opcionalmente filtra por chofer, cliente, estatus o fecha.",
            parameters: {
              type: "OBJECT",
              properties: {
                id_chofer: { type: "STRING", description: "Nombre o ID del chofer para filtrar" },
                cliente: { type: "STRING", description: "Nombre del cliente para filtrar" },
                estatus_viaje: { type: "STRING", description: "Estatus (Pendiente, Liquidado)" },
                fecha: { type: "STRING", description: "Fecha en formato YYYY-MM-DD para filtrar viajes de un día específico" }
              }
            }
          },
          {
            name: "consultar_gastos",
            description: "Busca la lista de gastos registrados en el sistema. Filtra por chofer, unidad, concepto o fecha.",
            parameters: {
              type: "OBJECT",
              properties: {
                id_chofer: { type: "STRING", description: "Nombre o ID del chofer para filtrar" },
                id_unidad: { type: "STRING", description: "Identificador de la unidad (ECO) para filtrar" },
                concepto: { type: "STRING", description: "Concepto de gasto (Diesel, Casetas, etc.)" },
                fecha: { type: "STRING", description: "Fecha en formato YYYY-MM-DD para filtrar gastos de un día específico" }
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

    if (isSaul) {
      tools[0].functionDeclarations = tools[0].functionDeclarations.filter(fd => fd.name !== 'registrar_viaje');
    }

    // 6. Loop de ejecución para manejar Tool Calling
    const provider = (config.provider || 'gemini').trim().toLowerCase();
    let finalResponseText = '';

    if (provider === 'groq') {
      const messages = [
        { role: 'system', content: systemInstruction }
      ];
      if (chatHistory && chatHistory.length > 0) {
        chatHistory.forEach(log => {
          messages.push({ role: 'user', content: log.message });
          messages.push({ role: 'assistant', content: log.response });
        });
      }
      messages.push({ role: 'user', content: message });

      const groqTools = tools[0].functionDeclarations.map(fd => {
        const mappedFd = JSON.parse(JSON.stringify(fd));
        if (mappedFd.parameters) {
          if (mappedFd.parameters.type) {
            mappedFd.parameters.type = mappedFd.parameters.type.toLowerCase();
          }
          if (mappedFd.parameters.properties) {
            for (const key in mappedFd.parameters.properties) {
              const prop = mappedFd.parameters.properties[key];
              if (prop.type) {
                prop.type = prop.type.toLowerCase();
              }
            }
          }
        }
        return {
          type: 'function',
          function: mappedFd
        };
      });

      let groqModel = modelName;
      if (!groqModel || groqModel.startsWith('gemini')) {
        groqModel = 'llama-3.3-70b-versatile';
      }

      let loopCount = 0;
      const maxLoops = 4;

      while (loopCount < maxLoops) {
        console.log(`Llamando a Groq (${groqModel}) - Iteración ${loopCount + 1}...`);
        const apiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: groqModel,
            messages: messages,
            tools: groqTools,
            tool_choice: 'auto'
          })
        });

        if (!apiResponse.ok) {
          const errorText = await apiResponse.text();
          throw new Error(`API de Groq retornó error: ${apiResponse.statusText}`);
        }

        const responseJson = await apiResponse.json();
        const assistantMessage = responseJson.choices?.[0]?.message;
        messages.push(assistantMessage);

        const toolCalls = assistantMessage?.tool_calls;
        if (toolCalls && toolCalls.length > 0) {
          for (const toolCall of toolCalls) {
            const { name, arguments: argsString } = toolCall.function;
            const args = JSON.parse(argsString || '{}');
            
            console.log(`Ejecutando herramienta (Groq): ${name}`);
            const executionResult = await executeTool(name, args, supabaseClient, userId);

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              name: name,
              content: JSON.stringify(executionResult)
            });
          }
          loopCount++;
        } else {
          finalResponseText = assistantMessage?.content || 'No pude procesar la respuesta.';
          break;
        }
      }

      if (!finalResponseText) {
        finalResponseText = 'Se alcanzó el límite de llamadas a Groq sin respuesta.';
      }

    } else {
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

        contents.push(modelContent);

        const functionCallPart = parts.find((p: any) => p.functionCall);
        
        if (functionCallPart) {
          const { name, args } = functionCallPart.functionCall;
          console.log(`Ejecutando herramienta (Gemini): ${name}`);
          
          const executionResult = await executeTool(name, args, supabaseClient, userId);

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
          const textPart = parts.find((p: any) => p.text);
          finalResponseText = textPart?.text || 'No pude procesar la respuesta.';
          break;
        }
      }

      if (!finalResponseText) {
        finalResponseText = 'Se alcanzó el límite de llamadas a Gemini sin respuesta.';
      }
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
      status: 200
    })
  }
})

// Función auxiliar compartida para ejecutar herramientas
async function executeTool(name: string, args: any, supabaseClient: any, userId: string | null) {
  try {
    if (name === "consultar_viajes") {
      let query = supabaseClient.from('reg_viajes').select('*', { count: 'exact' });
      if (args.id_chofer) query = query.ilike('id_chofer', `%${args.id_chofer}%`);
      if (args.cliente) query = query.ilike('cliente', `%${args.cliente}%`);
      if (args.estatus_viaje) query = query.eq('estatus_viaje', args.estatus_viaje);
      if (args.fecha) query = query.eq('fecha', args.fecha);
      const { data, count, error } = await query.order('fecha', { ascending: false }).limit(20);
      if (error) throw error;
      return {
        total_registros_encontrados: count || 0,
        registros_muestra: data || []
      };

    } else if (name === "consultar_gastos") {
      let query = supabaseClient.from('reg_gastos').select('*', { count: 'exact' });
      if (args.id_chofer) query = query.ilike('id_chofer', `%${args.id_chofer}%`);
      if (args.id_unidad) query = query.eq('id_unidad', args.id_unidad);
      if (args.concepto) query = query.ilike('concepto', `%${args.concepto}%`);
      if (args.fecha) query = query.eq('fecha', args.fecha);
      const { data, count, error } = await query.order('fecha', { ascending: false }).limit(20);
      if (error) throw error;
      return {
        total_registros_encontrados: count || 0,
        registros_muestra: data || []
      };

    } else if (name === "consultar_choferes") {
      const { data } = await supabaseClient.from('cat_choferes').select('*');
      return data || [];

    } else if (name === "consultar_unidades") {
      const { data } = await supabaseClient.from('cat_unidades').select('*');
      return data || [];

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
      return { success: true, message: "Gasto registrado exitosamente", data: data?.[0] };

    } else if (name === "registrar_viaje") {
      const isSaul = userId && String(userId).trim().toLowerCase() === 'saulrivas@gmail.com';
      if (isSaul) {
        return { error: "No tienes permisos para registrar viajes. Esta función no es posible para tu usuario." };
      }
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
      return { success: true, message: "Viaje registrado exitosamente", data: data?.[0] };
    } else {
      return { error: `Herramienta ${name} no disponible.` };
    }
  } catch (err: any) {
    return { error: err.message || 'Error en base de datos.' };
  }
}
