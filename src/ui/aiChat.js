import { askAgent } from '../ai/agent.js';
import store from '../data/store.js';

let isChatOpen = false;
let messageHistory = []; // to maintain conversation context

export function renderAiChatWidget() {
  // Container
  const container = document.createElement('div');
  container.className = 'ai-chat-container';

  // Toggle Button (FAB)
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'ai-chat-toggle btn btn-primary';
  toggleBtn.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
    </svg>
  `;
  toggleBtn.title = "Ask the Scheduling Assistant";

  // Chat Window
  const chatWindow = document.createElement('div');
  chatWindow.className = 'ai-chat-window hidden';
  chatWindow.innerHTML = `
    <div class="ai-chat-header">
      <div class="header-content">
        <span class="ai-avatar">🤖</span>
        <div class="header-text">
          <h3 data-i18n="appTitle">Scheduling Assistant</h3>
          <span class="status-indicator" data-i18n="aiStatus">${store.t('aiStatus')}</span>
        </div>
      </div>
      <button class="ai-close-btn btn-icon">&times;</button>
    </div>
    <div class="ai-chat-messages" id="ai-chat-messages">
      <div class="ai-message-bubble system" data-i18n="aiGreeting">
        ${store.t('aiGreeting')}
      </div>
    </div>
    <form class="ai-chat-input-area" id="ai-chat-form">
      <input type="text" id="ai-chat-input" placeholder="e.g., What happens if I add an order of 2000 pieces?" required autocomplete="off" data-i18n-placeholder="aiChatInputPlaceholder" />
      <button type="submit" class="ai-send-btn btn btn-accent">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      </button>
    </form>
  `;

  document.body.appendChild(container);
  container.appendChild(toggleBtn);
  container.appendChild(chatWindow);

  // Logic
  const msgContainer = document.getElementById('ai-chat-messages');
  const chatForm = document.getElementById('ai-chat-form');
  const chatInput = document.getElementById('ai-chat-input');
  const closeBtn = chatWindow.querySelector('.ai-close-btn');

  // Toggle UI
  const toggleChat = () => {
    isChatOpen = !isChatOpen;
    chatWindow.classList.toggle('hidden', !isChatOpen);
    if (isChatOpen) setTimeout(() => chatInput.focus(), 100);
  };

  toggleBtn.addEventListener('click', toggleChat);
  closeBtn.addEventListener('click', toggleChat);

  // Handle Send
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;

    // Append User Message
    appendMessage('user', text);
    chatInput.value = '';

    // Append Loading Indicator
    const loadingId = appendLoading();

    try {
      // Fetch AI response
      const answer = await askAgent(text, messageHistory);

      // Save to history (so AI remembers the conversation)
      messageHistory.push({ role: 'user', content: text });
      messageHistory.push({ role: 'assistant', content: answer });

      // Replace Loading with actual answer
      replaceLoadingWithHTML(loadingId, renderMarkdownLike(answer));
    } catch (err) {
      console.error(err);
      replaceLoadingWithHTML(loadingId, store.t('aiError'));
    }
  });

  // Helpers
  function appendMessage(role, text) {
    const div = document.createElement('div');
    div.className = `ai-message-bubble ${role}`;
    div.innerText = text;
    msgContainer.appendChild(div);
    scrollToBottom();
  }

  function appendLoading() {
    const div = document.createElement('div');
    div.className = 'ai-message-bubble system ai-loading';
    div.id = 'loading-' + Date.now();
    div.innerHTML = `< span class="dot" ></span ><span class="dot"></span><span class="dot"></span>`;
    msgContainer.appendChild(div);
    scrollToBottom();
    return div.id;
  }

  function replaceLoadingWithHTML(id, html) {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('ai-loading');
      el.innerHTML = html;
      scrollToBottom();
    }
  }

  function scrollToBottom() {
    msgContainer.scrollTop = msgContainer.scrollHeight;
  }

  // Very basic markdown parser for bolding and bullets
  function renderMarkdownLike(text) {
    let html = text.replace(/\\n/g, '<br/>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/- (.*?)<br\/>/g, '<li>$1</li>');
    return html;
  }
}
