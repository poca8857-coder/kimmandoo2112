// Barcelona Tourism Chatbot Application Logic

const API_KEY = 'AQ.Ab8RN6LG2sBmfCYsRKYP3yEDSwYzbJf9HsXkGfV5EeHLvpophg';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

// System Instructions to guide the Gemini Model
const SYSTEM_INSTRUCTION = `
You are 'Bari' (바리), a passionate, friendly, and expert local travel guide in Barcelona.
Your mission is to help tourists have the absolute best experience in Barcelona.
Provide useful information, including:
1. Practical travel advice: opening hours, official websites, public transport routes, ticket booking tips (e.g., booking Sagrada Familia weeks in advance is mandatory).
2. Local insights: hidden spots, local food recommendations (tapas, paella, churros), safety tips (like pickpocket awareness in La Rambla).
3. Tone: Enthusiastic, warm, and helpful. Use emojis!
4. Response Language: Always match the user's language. If they speak Korean, respond in Korean. If they speak English, respond in English.
`;

// App State
let chatHistory = []; // format: { role: 'user' | 'model', parts: [{ text: string }] }
let isGenerating = false;

// DOM Elements
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const themeToggle = document.getElementById('theme-toggle');
const welcomeTime = document.getElementById('welcome-time');

// Set current time for the welcome message
function updateWelcomeTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  if (welcomeTime) {
    welcomeTime.textContent = `${hours}:${minutes}`;
  }
}

// 1. Theme Toggle Management
function initTheme() {
  const savedTheme = localStorage.getItem('barcelona-theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.remove('dark-mode');
    document.body.classList.add('light-mode');
  } else {
    document.body.classList.remove('light-mode');
    document.body.classList.add('dark-mode');
  }
}

themeToggle.addEventListener('click', () => {
  if (document.body.classList.contains('dark-mode')) {
    document.body.classList.remove('dark-mode');
    document.body.classList.add('light-mode');
    localStorage.setItem('barcelona-theme', 'light');
  } else {
    document.body.classList.remove('light-mode');
    document.body.classList.add('dark-mode');
    localStorage.setItem('barcelona-theme', 'dark');
  }
});

// 2. Custom Markdown Parser (Simple)
function parseMarkdown(text) {
  let html = text;

  // Escape HTML tags to prevent XSS
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Convert Bold (**text** or __text__)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

  // Convert Bullet lists (- item or * item)
  // Process block level lists
  const lines = html.split('\n');
  let inList = false;
  let resultLines = [];

  for (let line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const itemContent = trimmed.substring(2);
      if (!inList) {
        resultLines.push('<ul>');
        inList = true;
      }
      resultLines.push(`<li>${itemContent}</li>`);
    } else if (trimmed.match(/^\d+\.\s(.*)/)) {
      // Ordered lists (1. item)
      const itemContent = trimmed.replace(/^\d+\.\s/, '');
      if (!inList) {
        resultLines.push('<ol>');
        inList = true;
      }
      resultLines.push(`<li>${itemContent}</li>`);
    } else {
      if (inList) {
        // Close list
        const lastOpen = resultLines[resultLines.length - 1];
        if (resultLines.join('').includes('<ul>')) {
          resultLines.push('</ul>');
        } else {
          resultLines.push('</ol>');
        }
        inList = false;
      }
      resultLines.push(line);
    }
  }
  if (inList) {
    resultLines.push('</ul>');
  }
  
  html = resultLines.join('\n');

  // Convert Headings (### title)
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Convert Inline Code (`code`)
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');

  // Convert remaining line breaks to <p> where appropriate
  // Split by double line breaks for paragraphs
  const paragraphs = html.split(/\n\n+/);
  html = paragraphs
    .map(p => {
      p = p.trim();
      if (!p) return '';
      // Don't wrap list items or headers in paragraph tags
      if (p.startsWith('<ul') || p.startsWith('<ol') || p.startsWith('<h') || p.startsWith('<li')) {
        return p;
      }
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    })
    .filter(p => p !== '')
    .join('');

  return html;
}

// 3. Render Message in UI
function appendMessage(sender, text, isMarkdown = false) {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message', sender === 'user' ? 'user-message' : 'bot-message');

  const contentDiv = document.createElement('div');
  contentDiv.classList.add('message-content');
  
  if (isMarkdown) {
    contentDiv.innerHTML = parseMarkdown(text);
  } else {
    // Normal text paragraph
    const p = document.createElement('p');
    p.textContent = text;
    contentDiv.appendChild(p);
  }

  const timeSpan = document.createElement('span');
  timeSpan.classList.add('message-time');
  const now = new Date();
  timeSpan.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  messageDiv.appendChild(contentDiv);
  messageDiv.appendChild(timeSpan);
  chatMessages.appendChild(messageDiv);
  
  // Auto scroll
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 4. Show/Hide Typing Indicator
let typingIndicatorElement = null;

function showTypingIndicator() {
  if (typingIndicatorElement) return;

  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message', 'bot-message', 'typing-message');

  const contentDiv = document.createElement('div');
  contentDiv.classList.add('message-content');

  const indicator = document.createElement('div');
  indicator.classList.add('typing-indicator');
  indicator.innerHTML = `
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
  `;

  contentDiv.appendChild(indicator);
  messageDiv.appendChild(contentDiv);
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  typingIndicatorElement = messageDiv;
}

function hideTypingIndicator() {
  if (typingIndicatorElement) {
    typingIndicatorElement.remove();
    typingIndicatorElement = null;
  }
}

// 5. Call Gemini API
async function callGemini(promptText) {
  showTypingIndicator();
  isGenerating = true;
  sendBtn.disabled = true;

  // Add the user message to history
  chatHistory.push({
    role: 'user',
    parts: [{ text: promptText }]
  });

  const payload = {
    contents: chatHistory,
    systemInstruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }]
    },
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1000
    }
  };

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('API Error:', errorData);
      throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const botText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    hideTypingIndicator();

    if (botText) {
      // Add response to history
      chatHistory.push({
        role: 'model',
        parts: [{ text: botText }]
      });

      appendMessage('bot', botText, true);
    } else {
      appendMessage('bot', '죄송합니다. 답변을 생성하는 중에 문제가 발생했습니다. 다시 시도해 주세요.');
    }
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    hideTypingIndicator();
    appendMessage('bot', '죄송합니다. Gemini API와의 통신이 원활하지 않습니다. API 키가 활성화되었는지 혹은 네트워크 상태를 확인해 주세요.');
    // Remove last message from history since it failed
    chatHistory.pop();
  } finally {
    isGenerating = false;
    sendBtn.disabled = false;
  }
}

// 6. Form Submission
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (isGenerating) return;

  const text = chatInput.value.trim();
  if (!text) return;

  // Render User Message
  appendMessage('user', text);
  chatInput.value = '';
  chatInput.style.height = 'auto'; // Reset textarea height

  // Send to API
  callGemini(text);
});

// Auto-grow textarea height
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = (chatInput.scrollHeight) + 'px';
});

// Keypress handler (Shift + Enter for new lines, Enter to submit)
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event('submit'));
  }
});

// 7. Interactive Elements Setup
// Suggestion Chips (welcome message buttons)
document.addEventListener('click', (e) => {
  const chip = e.target.closest('.suggest-chip');
  if (chip) {
    const query = chip.getAttribute('data-query');
    if (query && !isGenerating) {
      appendMessage('user', query);
      callGemini(query);
    }
  }
});

// Attraction Cards clicks
document.addEventListener('click', (e) => {
  const card = e.target.closest('.attraction-card');
  if (card) {
    const attractionName = card.getAttribute('data-attraction');
    if (attractionName && !isGenerating) {
      const query = `바르셀로나의 대표 명소인 '${attractionName}'에 대해 자세히 소개해 주고, 방문할 때 알아야 하는 예약 및 여행 팁을 상세히 알려줘!`;
      appendMessage('user', `'${attractionName}' 명소 정보 물어보기`);
      callGemini(query);
    }
  }
});

// Handle key presses on attraction cards for accessibility (Enter/Space to trigger)
document.addEventListener('keydown', (e) => {
  const card = e.target.closest('.attraction-card');
  if (card && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    card.click();
  }
});

// Initialize
initTheme();
updateWelcomeTime();
