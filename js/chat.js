/**
 * Procesa-T - Asistente Virtual (IA)
 * Conexión con Supabase Edge Function (Gemini)
 */

const GEMINI_CHAT_URL = `${SUPABASE_CONFIG.url}/functions/v1/gemini-chat`;

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

        // Obtener sesión para el ID de usuario
        const session = typeof checkAuth === 'function' ? checkAuth() : null;
        const userId = session ? session.userID : null;

        // Añadir mensaje del usuario
        appendMessage('user', message);
        input.value = '';

        // Indicador de escritura
        const typingId = appendMessage('bot', '<i class="fas fa-circle-notch fa-spin text-slate-400"></i>', true);

        try {
            console.log('Enviando mensaje a Gemini via Supabase:', GEMINI_CHAT_URL);
            const response = await fetch(GEMINI_CHAT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_CONFIG.anonKey
                },
                body: JSON.stringify({
                    message: message,
                    userId: userId,
                    timestamp: new Date().toISOString()
                })
            });

            const data = await response.json();
            console.log('Respuesta de Gemini:', data);

            removeMessage(typingId);

            if (response.ok) {
                const aiMessage = data.reply || 'Lo siento, no pude procesar tu solicitud.';
                appendMessage('bot', aiMessage);
            } else {
                console.error('Edge Function Error:', response.status, data);
                appendMessage('bot', `Error ${response.status}: ${data.error || 'Problema en el servidor'}`);
            }
        } catch (error) {
            removeMessage(typingId);
            let userMsg = 'Hubo un problema al conectar con el asistente.';
            if (error.message.includes('Failed to fetch')) {
                userMsg = 'Error de Red: No se pudo contactar con el servidor. ¿La función está desplegada?';
            }
            appendMessage('bot', userMsg + ' (Ver consola para detalles)');
            console.error('Chat Error Detail:', error);
        }
    });

    function appendMessage(sender, text, isTyping = false) {
        const id = 'msg-' + Date.now();
        const div = document.createElement('div');
        div.id = id;
        div.className = `flex ${sender === 'user' ? 'justify-end' : 'justify-start'} mb-4`;

        const inner = `
            <div class="max-w-[80%] rounded-2xl px-4 py-2 ${sender === 'user' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800'} text-sm shadow-sm ring-1 ring-slate-900/5">
                ${text}
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
}

document.addEventListener('DOMContentLoaded', initChat);
