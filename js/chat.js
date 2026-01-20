/**
 * Procesa-T - Asistente Virtual (IA)
 * Conexión con Make.com Webhook
 */

const MAKE_WEBHOOK_URL = 'https://hook.us2.make.com/pg1ul97reeytpz6m7gf336drlm8a5ryi';

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

        // Añadir mensaje del usuario
        appendMessage('user', message);
        input.value = '';

        // Indicador de escritura
        const typingId = appendMessage('bot', '<i class="fas fa-circle-notch fa-spin text-slate-400"></i>', true);

        try {
            console.log('Enviando mensaje a:', MAKE_WEBHOOK_URL);
            const response = await fetch(MAKE_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: message,
                    sender: 'Webchat',
                    timestamp: new Date().toISOString()
                })
            });

            const rawText = await response.text();
            console.log('Respuesta cruda de Make:', rawText);

            if (response.ok) {
                let data;
                try {
                    data = JSON.parse(rawText);
                } catch (e) {
                    console.warn('La respuesta no es JSON válido:', rawText);
                    data = { respuesta: rawText }; // Fallback a texto plano
                }

                removeMessage(typingId);
                const aiMessage = data.respuesta || data.reply || data.message || (typeof data === 'string' ? data : 'Lo siento, no pude procesar tu solicitud.');
                appendMessage('bot', aiMessage);
            } else {
                console.error('Webhook Error:', response.status, response.statusText, rawText);
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            removeMessage(typingId);
            let userMsg = 'Hubo un problema al conectar con el asistente.';
            if (error.message.includes('Failed to fetch')) {
                userMsg = 'Error de Red: No se pudo contactar con Make.com. ¿El Webhook es correcto?';
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
