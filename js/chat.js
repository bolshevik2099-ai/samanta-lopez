const VENTAS_URL = `${SUPABASE_CONFIG.url}/functions/v1/webhook-ventas`;
const ADMIN_URL = `${SUPABASE_CONFIG.url}/functions/v1/webhook-admin`;

// Inject Markdown CSS Styles for Chat Window
const chatStyle = document.createElement('style');
chatStyle.innerHTML = `
    .chat-markdown {
        word-break: break-word;
    }
    .chat-markdown table {
        display: block;
        width: 100%;
        overflow-x: auto;
        border-collapse: collapse;
        margin: 10px 0;
        font-size: 11px;
        line-height: 1.4;
        border-radius: 8px;
        border: 1px solid rgba(0, 0, 0, 0.08);
    }
    .chat-markdown th, .chat-markdown td {
        padding: 6px 8px;
        border: 1px solid rgba(0, 0, 0, 0.08);
        text-align: left;
    }
    .chat-markdown th {
        background: rgba(15, 23, 42, 0.05);
        font-weight: 700;
        text-transform: uppercase;
        font-size: 10px;
        letter-spacing: 0.05em;
    }
    .chat-markdown tr:nth-child(even) {
        background: rgba(0, 0, 0, 0.02);
    }
    
    /* Dark mode styling for user messages */
    .bg-slate-900 .chat-markdown table {
        border-color: rgba(255, 255, 255, 0.15);
    }
    .bg-slate-900 .chat-markdown th, .bg-slate-900 .chat-markdown td {
        border-color: rgba(255, 255, 255, 0.15);
    }
    .bg-slate-900 .chat-markdown th {
        background: rgba(255, 255, 255, 0.15);
    }
    .bg-slate-900 .chat-markdown tr:nth-child(even) {
        background: rgba(255, 255, 255, 0.05);
    }
    
    .chat-markdown p {
        margin: 4px 0;
    }
    .chat-markdown p:first-child {
        margin-top: 0;
    }
    .chat-markdown p:last-child {
        margin-bottom: 0;
    }
    .chat-markdown ul {
        margin: 6px 0;
        padding-left: 20px;
        list-style-type: disc;
    }
    .chat-markdown ol {
        margin: 6px 0;
        padding-left: 20px;
        list-style-type: decimal;
    }
    .chat-markdown li {
        margin: 2px 0;
    }
    
    /* Custom scrollbar for tables inside chat */
    .chat-markdown table::-webkit-scrollbar {
        height: 4px;
    }
    .chat-markdown table::-webkit-scrollbar-track {
        background: transparent;
    }
    .chat-markdown table::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.2);
        border-radius: 2px;
    }
    .bg-slate-900 .chat-markdown table::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
    }
`;
document.head.appendChild(chatStyle);

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
        const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 min timeout para llamadas con herramientas y modo pensamiento largo

        try {
            const session = typeof checkAuth === 'function' ? checkAuth() : null;
            const userRol = session && session.rol ? String(session.rol).trim().toLowerCase() : '';
            const isAdmin = userRol === 'admin' || userRol === 'superadmin' || userRol === 'super admin';
            const userId = session ? session.userID : null;

            // Si es administrador, ejecutamos vía Vercel Serverless Function Proxy para evitar errores de CORS
            if (isAdmin) {
                let targetUrl = '/api/webhook-admin';
                if (window.location.protocol === 'file:' || !window.location.hostname) {
                    targetUrl = 'https://crm-samanta.vercel.app/api/webhook-admin';
                }

                const response = await fetch(targetUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: message,
                        userId: userId,
                        sessionId: sessionId
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
            } else if (error.message && error.message.includes('Failed to fetch')) {
                appendMessage('bot', '⚠️ <b>Error de conexión (Failed to fetch):</b> No se pudo establecer contacto con el servidor.<br><br>' +
                    '<b>Causas comunes:</b><br>' +
                    '1. <b>Pruebas Locales:</b> Si abriste el archivo <code>vista-admin.html</code> directamente haciendo doble clic (usando la ruta <code>file://</code>) o con un servidor estático simple, las peticiones a la API local (<code>/api/...</code>) fallarán. Para probar localmente con funciones API, debes ejecutar <code>npx vercel dev</code> en la consola.<br>' +
                    '2. <b>Protección de Vercel:</b> Si estás usando el enlace de vista previa de Vercel, es probable que tenga activado <b>Deployment Protection</b> (Autenticación de Vercel), lo cual bloquea las llamadas API externas. Puedes desactivar esto en la pestaña <i>Settings -> Deployment Protection</i> de tu proyecto en el panel de Vercel.<br>' +
                    '3. <b>CORS o Servidor apagado:</b> Si estás intentando acceder de forma externa, asegúrate de que el servidor permita peticiones CORS.');
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
            if (typeof marked !== 'undefined') {
                processedText = marked.parse(text, {
                    breaks: true,
                    gfm: true
                });
            } else {
                const urlRegex = /(https?:\/\/[^\s]+)/g;
                processedText = text.replace(urlRegex, (url) => {
                    return `<a href="${url}" target="_blank" class="text-blue-600 underline hover:text-blue-800 break-all">${url}</a>`;
                });
                // También procesar saltos de línea
                processedText = processedText.replace(/\n/g, '<br>');
            }
        }

        const inner = `
            <div class="max-w-[85%] rounded-2xl px-4 py-2 ${sender === 'user' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800'} text-sm shadow-sm ring-1 ring-slate-900/5">
                <div class="chat-markdown">${processedText}</div>
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
