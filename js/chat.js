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

        try {
            const session = typeof checkAuth === 'function' ? checkAuth() : null;
            const isAdmin = session && (session.rol === 'admin' || session.rol === 'superadmin');
            const targetUrl = isAdmin ? ADMIN_URL : VENTAS_URL;
            const userId = session ? session.userID : null;

            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_CONFIG.anonKey,
                    'Authorization': session ? `Bearer ${session.access_token}` : ''
                },
                body: JSON.stringify({
                    message: message,
                    userId: userId,
                    sessionId: sessionId
                })
            });

            const data = await response.json();
            removeMessage(typingId);

            if (response.ok) {
                appendMessage('bot', data.reply || 'Sin respuesta.');
            } else {
                appendMessage('bot', `Error ${response.status}: ${data.error || 'Problema en servidor'}`);
            }
        } catch (error) {
            removeMessage(typingId);
            appendMessage('bot', 'Error de conexión con el asistente.');
            console.error('Chat Error:', error);
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
