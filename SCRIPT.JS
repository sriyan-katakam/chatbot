const STORAGE_KEY = "offline-chatbot-memory";
const TONE_KEY = "offline-chatbot-tone";
const SPEAK_KEY = "offline-chatbot-speak-replies";
const VOICE_STYLE_KEY = "offline-chatbot-voice-style";
const MEMORY_ENABLED_KEY = "offline-chatbot-memory-enabled";
const SETTINGS_OPEN_KEY = "offline-chatbot-settings-open";
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const elements = {
  settingsToggle: document.querySelector("#settingsToggle"),
  settingsContent: document.querySelector("#settingsContent"),
  modeButtons: document.querySelectorAll(".mode-button"),
  quickChips: document.querySelectorAll(".quick-chip"),
  speakReplies: document.querySelector("#speakReplies"),
  voiceStyle: document.querySelector("#voiceStyle"),
  stopSpeech: document.querySelector("#stopSpeech"),
  voiceStatus: document.querySelector("#voiceStatus"),
  voiceButton: document.querySelector("#voiceButton"),
  forgetMemory: document.querySelector("#forgetMemory"),
  memoryEnabled: document.querySelector("#memoryEnabled"),
  memoryName: document.querySelector("#memoryName"),
  memoryFact: document.querySelector("#memoryFact"),
  saveMemorySettings: document.querySelector("#saveMemorySettings"),
  memorySummary: document.querySelector("#memorySummary"),
  statusBadge: document.querySelector("#statusBadge"),
  messages: document.querySelector("#messages"),
  chatForm: document.querySelector("#chatForm"),
  userInput: document.querySelector("#userInput"),
  sendButton: document.querySelector("#sendButton")
};

const botState = {
  tone: localStorage.getItem(TONE_KEY) || "friendly",
  voiceStyle: localStorage.getItem(VOICE_STYLE_KEY) || "neo",
  voices: [],
  memory: readMemory(),
  memoryEnabled: localStorage.getItem(MEMORY_ENABLED_KEY) !== "false",
  isListening: false,
  recognition: null
};

const knowledge = {
  capabilities: [
    "I can answer from built-in rules, listen through your microphone, speak replies aloud, create simple lists, solve basic math, share study tips, tell the date or time, and remember small facts in this browser.",
    "I do not call APIs, so I cannot search the internet or generate true AI answers. Everything happens locally in JavaScript."
  ],
  greetings: [
    "Hi! I am ready.",
    "Hello! What are we working on?",
    "Hey there. Ask me something."
  ],
  thanks: [
    "You are welcome!",
    "Anytime.",
    "Glad I could help."
  ],
  studyTips: [
    "Use a 25 minute focus block, then take a 5 minute break. Write one tiny goal before each block.",
    "After reading, close the notes and explain the idea out loud in your own words.",
    "Practice with questions before rereading. Retrieval beats highlighting."
  ],
  motivation: [
    "Start with the smallest next action. Momentum usually arrives after you begin.",
    "You do not need a perfect plan to make progress. Pick one useful step and do that now.",
    "A messy first attempt is still data. Make it exist, then improve it."
  ],
  fallback: [
    "I am NEO, an offline rule-based bot, so I may miss some questions. Try asking for math, time, study help, a todo list, or something you want me to remember.",
    "I do not know that one yet, but I can still help shape it. Ask me to make a list, summarize your idea, or calculate something.",
    "That is outside my tiny local brain. Give me a simpler version and I will try again."
  ]
};

const stopWords = new Set([
  "a", "an", "and", "are", "as", "at", "be", "for", "from", "i", "in", "is", "it", "me", "my",
  "of", "on", "or", "that", "the", "this", "to", "with", "you"
]);

init();

function init() {
  migrateMemory();
  rememberDefaultName();
  updateMemorySummary();
  syncMemorySettings();
  setActiveTone(botState.tone);
  initVoice();
  initSettingsPanel();

  elements.settingsToggle.addEventListener("click", toggleSettings);

  elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      botState.tone = button.dataset.tone;
      localStorage.setItem(TONE_KEY, botState.tone);
      setActiveTone(botState.tone);
      appendBot(`Tone changed to ${button.textContent}.`);
    });
  });

  elements.quickChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      elements.userInput.value = chip.textContent;
      resizeComposer();
      elements.chatForm.requestSubmit();
    });
  });

  elements.forgetMemory.addEventListener("click", () => {
    botState.memory = {};
    localStorage.removeItem(STORAGE_KEY);
    syncMemorySettings();
    appendBot("I forgot the saved browser memory.");
  });

  elements.memoryEnabled.addEventListener("change", () => {
    botState.memoryEnabled = elements.memoryEnabled.checked;
    localStorage.setItem(MEMORY_ENABLED_KEY, String(botState.memoryEnabled));
    updateMemorySummary();
    appendBot(botState.memoryEnabled ? "Memory is on." : "Memory is off.");
  });

  elements.saveMemorySettings.addEventListener("click", saveMemoryFromSettings);

  elements.chatForm.addEventListener("submit", handleSubmit);
  elements.userInput.addEventListener("input", resizeComposer);
  elements.userInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      elements.chatForm.requestSubmit();
    }
  });
}

function initSettingsPanel() {
  const savedState = localStorage.getItem(SETTINGS_OPEN_KEY);
  const isOpen = savedState === "true";
  elements.settingsToggle.setAttribute("aria-expanded", String(isOpen));
  elements.settingsContent.hidden = !isOpen;
}

function toggleSettings() {
  const isOpen = elements.settingsToggle.getAttribute("aria-expanded") === "true";
  const nextState = !isOpen;
  elements.settingsToggle.setAttribute("aria-expanded", String(nextState));
  elements.settingsContent.hidden = !nextState;
  localStorage.setItem(SETTINGS_OPEN_KEY, String(nextState));
}

function initVoice() {
  const savedSpeak = localStorage.getItem(SPEAK_KEY);
  elements.speakReplies.checked = savedSpeak === null ? true : savedSpeak === "true";
  elements.voiceStyle.value = botState.voiceStyle;
  setVoiceButtonIdle();

  if (!("speechSynthesis" in window)) {
    elements.speakReplies.checked = false;
    elements.speakReplies.disabled = true;
    elements.voiceStyle.disabled = true;
    elements.stopSpeech.disabled = true;
  } else {
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
  }

  elements.speakReplies.addEventListener("change", () => {
    localStorage.setItem(SPEAK_KEY, String(elements.speakReplies.checked));
    if (!elements.speakReplies.checked) {
      stopSpeaking();
    }
  });

  elements.voiceStyle.addEventListener("change", () => {
    botState.voiceStyle = elements.voiceStyle.value;
    localStorage.setItem(VOICE_STYLE_KEY, botState.voiceStyle);
    speak("NEO voice updated.");
  });

  elements.stopSpeech.addEventListener("click", stopSpeaking);

  if (!SpeechRecognition) {
    elements.voiceButton.disabled = true;
    elements.voiceButton.title = "Voice input is not supported in this browser";
    elements.voiceStatus.textContent = "Voice input is not supported in this browser. Spoken replies may still work.";
    return;
  }

  botState.recognition = new SpeechRecognition();
  botState.recognition.lang = "en-US";
  botState.recognition.interimResults = true;
  botState.recognition.continuous = false;

  botState.recognition.addEventListener("start", () => {
    botState.isListening = true;
    elements.voiceButton.classList.add("listening");
    elements.voiceButton.textContent = "Stop";
    elements.voiceButton.setAttribute("aria-label", "Stop voice input");
    elements.voiceStatus.textContent = "Listening...";
    setStatus("Listening", false);
  });

  botState.recognition.addEventListener("result", (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join("")
      .trim();

    elements.userInput.value = transcript;
    resizeComposer();

    const lastResult = event.results[event.results.length - 1];
    if (lastResult.isFinal && transcript) {
      window.setTimeout(() => elements.chatForm.requestSubmit(), 150);
    }
  });

  botState.recognition.addEventListener("error", (event) => {
    elements.voiceStatus.textContent = formatVoiceError(event.error);
    setStatus("Voice error", true);
  });

  botState.recognition.addEventListener("end", () => {
    botState.isListening = false;
    elements.voiceButton.classList.remove("listening");
    setVoiceButtonIdle();
    elements.voiceButton.setAttribute("aria-label", "Start voice input");
    if (elements.statusBadge.textContent === "Listening") {
      setStatus("Offline", false);
    }
    if (elements.voiceStatus.textContent === "Listening...") {
      elements.voiceStatus.textContent = "Voice is ready.";
    }
  });

  elements.voiceButton.addEventListener("click", toggleListening);
}

function toggleListening() {
  if (!botState.recognition) {
    return;
  }

  if (botState.isListening) {
    botState.recognition.stop();
    return;
  }

  stopSpeaking();
  try {
    botState.recognition.start();
  } catch {
    elements.voiceStatus.textContent = "Voice input is already starting.";
  }
}

function handleSubmit(event) {
  event.preventDefault();

  const text = elements.userInput.value.trim();
  if (!text) {
    return;
  }

  appendMessage("user", text);
  elements.userInput.value = "";
  resizeComposer();
  setStatus("Thinking", false);

  const loadingNode = appendMessage("bot", "Thinking...", true);

  window.setTimeout(() => {
    const reply = createReply(text);
    loadingNode.querySelector(".bubble").textContent = reply;
    loadingNode.classList.remove("loading");
    setStatus("Offline", false);
    speak(reply);
  }, 350);
}

function createReply(input) {
  const original = input.trim();
  const normalized = normalize(original);

  const memoryReply = handleMemory(original, normalized);
  if (memoryReply) {
    return stylize(memoryReply);
  }

  const mathReply = handleMath(original, normalized);
  if (mathReply) {
    return stylize(mathReply);
  }

  if (matches(normalized, ["what is your name", "what's your name", "who are you", "your name"])) {
    const nameTail = botState.memoryEnabled && botState.memory.name ? ` I remember you as ${botState.memory.name}.` : "";
    return stylize(`I am NEO, your local voice assistant.${nameTail}`);
  }

  if (matches(normalized, ["who built you", "who builded you", "who made you", "who created you", "who developed you"])) {
    return stylize("I was build by a developer called sriyan katakam.");
  }

  if (matches(normalized, ["how are you", "how are you doing"])) {
    return stylize("I am doing great and ready to help.");
  }

  if (matches(normalized, ["hello", "hi", "hey", "good morning", "good afternoon", "good evening"])) {
    return stylize(withName(randomItem(knowledge.greetings)));
  }

  if (matches(normalized, ["thank", "thanks", "thank you"])) {
    return stylize(randomItem(knowledge.thanks));
  }

  if (matches(normalized, ["nice to meet you", "nice to met you", "glad to meet you", "pleased to meet you"])) {
    return stylize(withName("Nice to meet you too! I am NEO, and I am ready to help."));
  }

  if (matches(normalized, ["what can you do", "help", "features", "capabilities"])) {
    return stylize(knowledge.capabilities.join("\n\n"));
  }

  if (matches(normalized, ["time", "clock"])) {
    return stylize(`Your local time is ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`);
  }

  if (matches(normalized, ["date", "today", "day"])) {
    return stylize(`Today is ${new Date().toLocaleDateString([], { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`);
  }

  if (matches(normalized, ["study", "learn", "exam", "revision"])) {
    return stylize(randomItem(knowledge.studyTips));
  }

  if (matches(normalized, ["motivate", "motivation", "stuck", "tired", "procrastinate"])) {
    return stylize(randomItem(knowledge.motivation));
  }

  if (matches(normalized, ["todo", "to do", "task list", "checklist"])) {
    return stylize(makeTodoList(original));
  }

  if (matches(normalized, ["summary", "summarize", "explain this"])) {
    return stylize(summarizeText(original));
  }

  if (matches(normalized, ["joke", "funny"])) {
    return stylize("Why did the function return early? Because it had commitment issues with the rest of the code.");
  }

  if (matches(normalized, ["bye", "goodbye", "see you"])) {
    return stylize("Bye! I will be here in this browser when you come back.");
  }

  return stylize(randomItem(knowledge.fallback));
}

function handleMemory(original, normalized) {
  if (!botState.memoryEnabled) {
    if (matches(normalized, ["what is my name", "who am i", "do you know my name", "what do you remember", "memory", "remembered"])) {
      return "Memory is turned off in settings.";
    }

    if (matches(normalized, ["remember", "save", "note"])) {
      return "Memory is turned off. Turn on Use memory in settings if you want me to save that.";
    }
  }

  const rememberMatch = original.match(/\b(?:remember|save|note)\b\s+(?:that\s+)?(.+)/i);
  if (rememberMatch) {
    const fact = rememberMatch[1].trim().replace(/[.!?]+$/, "");
    const nameMatch = fact.match(/\b(?:my name is|i am|i'm)\s+([a-z][a-z\s-]{1,40})$/i);

    if (nameMatch) {
      botState.memory.name = toTitleCase(nameMatch[1].trim());
    } else {
      botState.memory.fact = fact;
    }

    saveMemory();
    syncMemorySettings();
    return `Saved: ${fact}.`;
  }

  const nameQuestion = matches(normalized, ["what is my name", "who am i", "do you know my name"]);
  if (nameQuestion) {
    return botState.memory.name ? `Your name is ${botState.memory.name}.` : "I do not know your name yet. Say: remember my name is Sriyan.";
  }

  if (matches(normalized, ["what do you remember", "memory", "remembered"])) {
    const parts = [];
    if (botState.memory.name) {
      parts.push(`your name is ${botState.memory.name}`);
    }
    if (botState.memory.fact) {
      parts.push(botState.memory.fact);
    }
    return parts.length ? `I remember that ${parts.join(" and ")}.` : "I do not have anything saved yet.";
  }

  return null;
}

function handleMath(original, normalized) {
  const hasMathIntent = matches(normalized, ["calculate", "math", "solve"]) || /[0-9]\s*[-+*/%^]\s*[0-9]/.test(original);
  if (!hasMathIntent) {
    return null;
  }

  const expression = original
    .replace(/calculate|math|solve|what is|equals|=/gi, "")
    .replace(/\bplus\b/gi, "+")
    .replace(/\bminus\b/gi, "-")
    .replace(/\btimes\b|\bmultiplied by\b/gi, "*")
    .replace(/\bdivided by\b/gi, "/")
    .replace(/\bpercent\b/gi, "%")
    .trim();

  if (!/^[\d\s+\-*/().%^]+$/.test(expression)) {
    return "I can only calculate simple arithmetic with numbers and + - * / %.";
  }

  try {
    const safeExpression = expression.replace(/\^/g, "**");
    const result = Function(`"use strict"; return (${safeExpression});`)();
    if (!Number.isFinite(result)) {
      return "That calculation does not produce a finite number.";
    }
    return `${expression} = ${roundNumber(result)}`;
  } catch {
    return "I could not parse that calculation. Try something like: calculate 24 * 18.";
  }
}

function makeTodoList(original) {
  const topic = original
    .replace(/make|create|todo|to do|task list|checklist|for|me/gi, "")
    .trim();

  if (!topic) {
    return "Todo list:\n1. Pick the goal\n2. Break it into 3 small tasks\n3. Do the first task for 10 minutes\n4. Check what is left\n5. Finish or schedule the next block";
  }

  return `Todo list for ${topic}:\n1. Define the result you want\n2. Gather what you need\n3. Do the smallest useful step\n4. Review and fix gaps\n5. Mark it complete`;
}

function summarizeText(original) {
  const text = original.replace(/summarize|summary|explain this/gi, "").trim();
  if (text.length < 25) {
    return "Send a longer sentence or paragraph after the word summarize, and I will make a simple local summary.";
  }

  const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
  const first = sentences[0].trim();
  const keywords = extractKeywords(text).slice(0, 4);
  return `Short summary: ${first}\nKeywords: ${keywords.join(", ") || "none"}`;
}

function stylize(reply) {
  if (botState.tone === "brief") {
    return reply.split("\n\n")[0];
  }

  if (botState.tone === "coach") {
    return `${reply}\n\nNext step: try one small action and tell me what happened.`;
  }

  return reply;
}

function matches(text, terms) {
  return terms.some((term) => text.includes(term));
}

function normalize(text) {
  return text.toLowerCase().replace(/[^\w\s+\-*/().%^]/g, " ").replace(/\s+/g, " ").trim();
}

function extractKeywords(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stopWords.has(word))
    .filter((word, index, words) => words.indexOf(word) === index);
}

function withName(reply) {
  return botState.memory.name ? `${reply} ${botState.memory.name}.` : reply;
}

function migrateMemory() {
  if (botState.memory.name && botState.memory.name.toLowerCase() === "sriya") {
    botState.memory.name = "Sriyan";
    saveMemory();
  }
}

function rememberDefaultName() {
  if (!botState.memory.name) {
    botState.memory.name = "Sriyan";
    saveMemory();
  }
}

function readMemory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return {};
  }
}

function saveMemory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(botState.memory));
}

function updateMemorySummary() {
  elements.memoryEnabled.checked = botState.memoryEnabled;

  if (!botState.memoryEnabled) {
    elements.memorySummary.textContent = "Memory is off.";
    return;
  }

  const parts = [];
  if (botState.memory.name) {
    parts.push(`Name: ${botState.memory.name}`);
  }
  if (botState.memory.fact) {
    parts.push(`Fact: ${botState.memory.fact}`);
  }
  elements.memorySummary.textContent = parts.join(" | ") || "Nothing saved yet.";
}

function syncMemorySettings() {
  elements.memoryEnabled.checked = botState.memoryEnabled;
  elements.memoryName.value = botState.memory.name || "";
  elements.memoryFact.value = botState.memory.fact || "";
  updateMemorySummary();
}

function saveMemoryFromSettings() {
  botState.memoryEnabled = elements.memoryEnabled.checked;
  localStorage.setItem(MEMORY_ENABLED_KEY, String(botState.memoryEnabled));

  const name = elements.memoryName.value.trim();
  const fact = elements.memoryFact.value.trim();

  botState.memory = {};
  if (name) {
    botState.memory.name = toTitleCase(name);
  }
  if (fact) {
    botState.memory.fact = fact.replace(/[.!?]+$/, "");
  }

  saveMemory();
  syncMemorySettings();
  appendBot("Memory settings saved.");
}

function setActiveTone(tone) {
  elements.modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tone === tone);
  });
}

function appendBot(text) {
  const reply = stylize(text);
  appendMessage("bot", reply);
  speak(reply);
  setStatus("Offline", false);
}

function appendMessage(role, text, loading = false) {
  const message = document.createElement("article");
  message.className = `message ${role}${loading ? " loading" : ""}`;

  const avatar = createAvatar(role);

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  message.append(avatar, bubble);
  elements.messages.appendChild(message);
  elements.messages.scrollTop = elements.messages.scrollHeight;

  return message;
}

function createAvatar(role) {
  const avatar = document.createElement("div");
  avatar.className = role === "user" ? "avatar user-avatar" : "avatar neo-avatar";
  avatar.setAttribute("aria-label", role === "user" ? "Sriyan profile photo" : "NEO robot profile photo");

  if (role === "user") {
    const image = document.createElement("img");
    image.src = "sriyan.png";
    image.alt = "Sriyan";
    avatar.appendChild(image);
    return avatar;
  }

  const image = document.createElement("img");
  image.src = "robot-photo.png";
  image.alt = "NEO robot";
  avatar.appendChild(image);
  return avatar;
}

function setVoiceButtonIdle() {
  elements.voiceButton.innerHTML = "&#127908;";
}

function setStatus(text, isError) {
  elements.statusBadge.textContent = text;
  elements.statusBadge.classList.toggle("error", isError);
}

function speak(text) {
  if (!elements.speakReplies.checked || !("speechSynthesis" in window)) {
    return;
  }

  stopSpeaking();
  const utterance = new SpeechSynthesisUtterance(text.replace(/\n+/g, ". "));
  applyVoiceStyle(utterance);
  utterance.lang = "en-US";
  window.speechSynthesis.speak(utterance);
}

function loadVoices() {
  botState.voices = window.speechSynthesis.getVoices();
}

function applyVoiceStyle(utterance) {
  const styles = {
    neo: { rate: 0.88, pitch: 0.72, voiceHints: ["david", "mark", "guy", "male"] },
    warm: { rate: 0.96, pitch: 0.98, voiceHints: ["zira", "susan", "female", "samantha"] },
    bright: { rate: 1.08, pitch: 1.18, voiceHints: ["zira", "samantha", "female"] },
    calm: { rate: 0.82, pitch: 0.86, voiceHints: ["david", "mark", "susan"] }
  };
  const style = styles[botState.voiceStyle] || styles.neo;

  utterance.rate = botState.tone === "brief" ? Math.min(style.rate + 0.08, 1.2) : style.rate;
  utterance.pitch = botState.tone === "coach" ? Math.min(style.pitch + 0.06, 1.3) : style.pitch;
  utterance.voice = pickVoice(style.voiceHints);
}

function pickVoice(hints) {
  if (!botState.voices.length) {
    return null;
  }

  return botState.voices.find((voice) => {
    const name = voice.name.toLowerCase();
    return voice.lang.toLowerCase().startsWith("en") && hints.some((hint) => name.includes(hint));
  }) || botState.voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) || null;
}

function stopSpeaking() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function formatVoiceError(error) {
  const messages = {
    "not-allowed": "Microphone permission was blocked.",
    "no-speech": "I did not hear anything. Try again.",
    "audio-capture": "No microphone was found.",
    network: "Voice recognition had a browser network issue."
  };

  return messages[error] || "Voice input stopped unexpectedly.";
}

function resizeComposer() {
  elements.userInput.style.height = "auto";
  elements.userInput.style.height = `${Math.min(elements.userInput.scrollHeight, 150)}px`;
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function roundNumber(value) {
  return Number.isInteger(value) ? value : Number(value.toFixed(8));
}

function toTitleCase(text) {
  return text.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}
