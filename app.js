// JavaScript logic for UniversalTranslate

// Supported languages list
const languages = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  zh: "Chinese (Simplified)",
  ja: "Japanese",
  ko: "Korean",
  hi: "Hindi",
  ar: "Arabic",
  tr: "Turkish",
  nl: "Dutch",
  pl: "Polish",
  vi: "Vietnamese",
  th: "Thai",
  id: "Indonesian",
  el: "Greek",
  he: "Hebrew",
  sv: "Swedish",
};

// Speech Synthesis & Recognition locales mapping
const voiceLocales = {
  en: "en-US",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
  pt: "pt-PT",
  ru: "ru-RU",
  zh: "zh-CN",
  ja: "ja-JP",
  ko: "ko-KR",
  hi: "hi-IN",
  ar: "ar-SA",
  tr: "tr-TR",
  nl: "nl-NL",
  pl: "pl-PL",
  vi: "vi-VN",
  th: "th-TH",
  id: "id-ID",
  el: "el-GR",
  he: "he-IL",
  sv: "sv-SE",
};

// DOM Elements
const sourceLangSelect = document.getElementById("source-lang-select");
const targetLangSelect = document.getElementById("target-lang-select");
const swapLangsBtn = document.getElementById("swap-langs-btn");
const sourceTextarea = document.getElementById("source-text");
const targetTextarea = document.getElementById("target-text");
const clearInputBtn = document.getElementById("clear-input-btn");
const translateBtn = document.getElementById("translate-btn");
const speechInputBtn = document.getElementById("speech-input-btn");
const readSourceBtn = document.getElementById("read-source-btn");
const readTargetBtn = document.getElementById("read-target-btn");
const copyBtn = document.getElementById("copy-btn");
const copyToastMini = document.getElementById("copy-toast-mini");
const detectedBadge = document.getElementById("detected-badge");
const charCountSpan = document.getElementById("char-count");
const skeletonLoader = document.getElementById("skeleton-loader");
const targetWrapper = document.querySelector(".target-wrapper");
const themeToggleBtn = document.getElementById("theme-toggle");
const historyToggleBtn = document.getElementById("history-toggle");
const closeHistoryBtn = document.getElementById("close-history");
const historyPanel = document.getElementById("history-panel");
const historyList = document.getElementById("history-list");
const clearHistoryBtn = document.getElementById("clear-history-btn");
const toastContainer = document.getElementById("toast-container");

// App State
let debounceTimer;
let translationHistory =
  JSON.parse(localStorage.getItem("trans_history")) || [];
let speechRecognition = null;
let isListening = false;

// Initialize Web Speech APIs
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  speechRecognition = new SpeechRecognition();
  speechRecognition.continuous = false;
  speechRecognition.interimResults = false;
}

// ==========================================================================
// Initialization
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
  populateLanguages();
  setupTheme();
  renderHistory();

  // Auto-focus input
  sourceTextarea.focus();

  // Load voices into memory (needed for some browsers)
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }
});

// Populate language select options
function populateLanguages() {
  // Populate source select (keeping "Auto-Detect Language" as first option)
  for (const [code, name] of Object.entries(languages)) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = name;
    sourceLangSelect.appendChild(option);
  }

  // Populate target select (defaulting to Spanish as first choice)
  for (const [code, name] of Object.entries(languages)) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = name;
    if (code === "es") {
      option.selected = true;
    }
    targetLangSelect.appendChild(option);
  }
}

// Set up visual theme (light / dark)
function setupTheme() {
  const savedTheme = localStorage.getItem("app-theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
}

// ==========================================================================
// Toast Notification Utility
// ==========================================================================
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  // Icon
  const svgIcon =
    type === "success"
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`;

  toast.innerHTML = `${svgIcon}<span>${message}</span>`;
  toastContainer.appendChild(toast);

  // Remove toast after 3 seconds
  setTimeout(() => {
    toast.classList.add("fade-out");
    toast.addEventListener("animationend", () => {
      toast.remove();
    });
  }, 3000);
}

// ==========================================================================
// Core Translation Logic
// ==========================================================================
async function performTranslation() {
  const text = sourceTextarea.value.trim();
  const sourceLang = sourceLangSelect.value;
  const targetLang = targetLangSelect.value;

  if (!text) {
    targetTextarea.value = "";
    detectedBadge.style.display = "none";
    return;
  }

  // Toggle loading state
  targetWrapper.classList.add("loading");

  try {
    const translatedText = await fetchTranslation(text, sourceLang, targetLang);
    targetTextarea.value = translatedText;

    // Add to history
    saveToHistory(text, translatedText, sourceLang, targetLang);
  } catch (error) {
    console.error("Translation error:", error);
    showToast(
      "Translation failed. Please check your internet connection.",
      "error",
    );
    targetTextarea.value =
      "Error: Unable to fetch translation. Please try again.";
  } finally {
    targetWrapper.classList.remove("loading");
  }
}

// Fetch from API (Dual fallback structure)
async function fetchTranslation(text, source, target) {
  // 1. Try Google Translate GTX API (Unofficial but highly stable and CORS-free)
  const googleUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;

  try {
    const response = await fetch(googleUrl);
    if (!response.ok)
      throw new Error("Google API response status: " + response.status);

    const data = await response.json();

    // Parse Google GTX Format
    let translatedText = "";
    if (data && data[0]) {
      data[0].forEach((sentence) => {
        if (sentence[0]) {
          translatedText += sentence[0];
        }
      });
    }

    // Show auto-detected language badge if applicable
    if (source === "auto" && data[2]) {
      const detectedLangCode = data[2];
      const detectedLangName = languages[detectedLangCode] || detectedLangCode;
      detectedBadge.textContent = `Detected: ${detectedLangName}`;
      detectedBadge.style.display = "inline-block";
    } else {
      detectedBadge.style.display = "none";
    }

    if (translatedText) return translatedText;
    throw new Error("Parsed translated text is empty");
  } catch (googleError) {
    console.warn(
      "Google Translate GTX failed, falling back to MyMemory API...",
      googleError,
    );

    // 2. Fallback to MyMemory API
    const langPair = `${source === "auto" ? "autodetect" : source}|${target}`;
    const myMemoryUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;

    const response = await fetch(myMemoryUrl);
    if (!response.ok)
      throw new Error("MyMemory API returned: " + response.status);

    const data = await response.json();
    if (data && data.responseData && data.responseData.translatedText) {
      detectedBadge.style.display = "none";
      return data.responseData.translatedText;
    }

    throw new Error("All translation APIs failed to return a result");
  }
}

// Debounce automatic translation
function triggerDebouncedTranslation() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    performTranslation();
  }, 900);
}

// ==========================================================================
// Speech Functions
// ==========================================================================

// Text to Speech (Read Aloud)
let ttsAudioQueue = [];
let currentAudio = null;

function speakText(text, langCode) {
  if (!text.trim()) {
    showToast("No text to read aloud.", "error");
    return;
  }

  if (langCode === "auto") {
    const badgeText = detectedBadge.textContent;
    if (badgeText.startsWith("Detected: ")) {
      const detectedName = badgeText.replace("Detected: ", "");
      const foundCode = Object.keys(languages).find(
        (key) => languages[key] === detectedName,
      );
      langCode = foundCode || "en";
    } else {
      langCode = "en";
    }
  }

  speakViaNativeTTS(text, langCode);
  
}

// Play audio using Google Translate TTS API (bulletproof online player)
function speakViaGoogleTTS(text, langCode) {
  ttsAudioQueue = [];
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  // Split text into chunks of max 180 chars (Google TTS API length restriction)
  const chunks = chunkTextForTTS(text, 180);
  ttsAudioQueue = chunks.map(
    (chunk) =>
      `https://translate.google.com/translate_tts?ie=UTF-8&tl=${langCode}&client=tw-ob&q=${encodeURIComponent(chunk)}`,
  );

  playTTSQueue();
}

// Sequential playback helper
function playTTSQueue() {
  if (ttsAudioQueue.length === 0) {
    currentAudio = null;
    return;
  }

  const url = ttsAudioQueue.shift();
  try {
    // Create audio dynamically and strip referrers to prevent Google Translate from returning 403 Forbidden on localhost/Live Server
    currentAudio = document.createElement("audio");
    currentAudio.setAttribute("referrerpolicy", "no-referrer");
    currentAudio.src = url;

    currentAudio.onended = playTTSQueue;

    currentAudio.onerror = (e) => {
      console.error("Audio chunk load failed:", e);
      showToast("Failed to load voice audio from translator service.", "error");
      playTTSQueue();
    };

    currentAudio.play().catch((err) => {
      console.error("Audio playback error:", err);
      showToast(
        `Playback blocked: ${err.message || "Check browser audio permissions"}`,
        "error",
      );
      currentAudio = null;
    });
  } catch (err) {
    console.error("Audio creation failed:", err);
    playTTSQueue();
  }
}

// Split text by punctuation into chunks (handles Chinese, Japanese, Hindi, English)
function chunkTextForTTS(text, maxLength) {
  const sentences = text.match(/[^.!?;\n|]+[.!?;\n|]*/g) || [text];
  const chunks = [];
  let currentChunk = "";

  sentences.forEach((sentence) => {
    if ((currentChunk + sentence).length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      let s = sentence;
      while (s.length > maxLength) {
        chunks.push(s.substring(0, maxLength).trim());
        s = s.substring(maxLength);
      }
      currentChunk = s;
    } else {
      currentChunk += sentence;
    }
  });
  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks;
}

// Fallback: Native Browser SpeechSynthesis (Offline Mode)
function speakViaNativeTTS(text, langCode) {
  if (!window.speechSynthesis) {
    showToast("Text-to-Speech is not supported in this browser.", "error");
    return;
  }

  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  window.speechSynthesis.cancel();

  const speakLang = voiceLocales[langCode] || langCode;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = speakLang;

  const voices = window.speechSynthesis.getVoices();
  let matchedVoice = voices.find(
    (voice) => voice.lang.toLowerCase() === speakLang.toLowerCase(),
  );

  if (!matchedVoice) {
    matchedVoice = voices.find(
      (voice) =>
        voice.lang.toLowerCase().startsWith(langCode.toLowerCase()) ||
        voice.lang
          .replace("_", "-")
          .toLowerCase()
          .startsWith(speakLang.substring(0, 2).toLowerCase()),
    );
  }

  if (matchedVoice) {
    utterance.voice = matchedVoice;
  }

  utterance.onerror = (e) => {
    console.error("SpeechSynthesis error:", e);
    showToast("Failed to play audio speech.", "error");
  };

  window.speechSynthesis.speak(utterance);
}

// Speech to Text (Voice Input)
function startVoiceInput() {
  if (!speechRecognition) {
    showToast(
      "Voice input is not supported in your current browser. Try Google Chrome or Microsoft Edge.",
      "error",
    );
    return;
  }

  if (isListening) {
    speechRecognition.stop();
    return;
  }

  const sourceLang = sourceLangSelect.value;
  speechRecognition.lang =
    voiceLocales[sourceLang] || (sourceLang === "auto" ? "en-US" : sourceLang);

  speechRecognition.onstart = () => {
    isListening = true;
    speechInputBtn.classList.add("listening");
    showToast("Listening... Speak now.", "success");
  };

  speechRecognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    if (event.error === "not-allowed") {
      showToast("Microphone access denied. Please enable permission.", "error");
    } else {
      showToast(`Voice input error: ${event.error}`, "error");
    }
    stopListeningState();
  };

  speechRecognition.onend = () => {
    stopListeningState();
  };

  speechRecognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    if (sourceTextarea.value) {
      sourceTextarea.value += " " + transcript;
    } else {
      sourceTextarea.value = transcript;
    }
    updateCharCounter();
    performTranslation();
  };

  speechRecognition.start();
}

function stopListeningState() {
  isListening = false;
  speechInputBtn.classList.remove("listening");
}

// ==========================================================================
// Translation History Management
// ==========================================================================
function saveToHistory(sourceText, targetText, sourceLang, targetLang) {
  if (translationHistory.length > 0) {
    const lastItem = translationHistory[0];
    if (
      lastItem.sourceText === sourceText &&
      lastItem.targetLang === targetLang
    ) {
      return;
    }
  }

  const sourceLangName =
    sourceLang === "auto"
      ? detectedBadge.textContent.replace("Detected: ", "") || "Auto"
      : languages[sourceLang];
  const targetLangName = languages[targetLang];

  const historyItem = {
    id: Date.now(),
    sourceText,
    targetText,
    sourceLangCode: sourceLang,
    targetLangCode: targetLang,
    sourceLangName,
    targetLangName,
    timestamp: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };

  translationHistory.unshift(historyItem);
  if (translationHistory.length > 20) {
    translationHistory.pop();
  }

  localStorage.setItem("trans_history", JSON.stringify(translationHistory));
  renderHistory();
}

function renderHistory() {
  historyList.innerHTML = "";

  if (translationHistory.length === 0) {
    historyList.innerHTML = `<div class="no-history-msg">No translation history yet. Your translations will be saved here locally.</div>`;
    return;
  }

  translationHistory.forEach((item) => {
    const historyItemEl = document.createElement("div");
    historyItemEl.className = "history-item";
    historyItemEl.dataset.id = item.id;

    historyItemEl.innerHTML = `
            <div class="item-langs">
                <span>${item.sourceLangName}</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" x2="19" y1="12" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                <span>${item.targetLangName}</span>
            </div>
            <div class="item-text-src">${escapeHtml(item.sourceText)}</div>
            <div class="item-text-tgt">${escapeHtml(item.targetText)}</div>
            <button class="item-delete-btn" title="Delete record" data-id="${item.id}">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
            </button>
        `;

    historyItemEl.addEventListener("click", (e) => {
      if (e.target.closest(".item-delete-btn")) return;
      loadHistoryItem(item);
    });

    const delBtn = historyItemEl.querySelector(".item-delete-btn");
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteHistoryItem(item.id);
    });

    historyList.appendChild(historyItemEl);
  });
}

function loadHistoryItem(item) {
  sourceLangSelect.value = item.sourceLangCode;
  targetLangSelect.value = item.targetLangCode;
  sourceTextarea.value = item.sourceText;
  targetTextarea.value = item.targetText;

  updateCharCounter();

  if (item.sourceLangCode === "auto") {
    detectedBadge.textContent = `Detected: ${item.sourceLangName}`;
    detectedBadge.style.display = "inline-block";
  } else {
    detectedBadge.style.display = "none";
  }

  historyPanel.classList.remove("open");
  showToast("Translation loaded from history.");
}

function deleteHistoryItem(id) {
  translationHistory = translationHistory.filter((item) => item.id !== id);
  localStorage.setItem("trans_history", JSON.stringify(translationHistory));
  renderHistory();
  showToast("Record deleted from history.");
}

function clearAllHistory() {
  if (confirm("Are you sure you want to clear all translation history?")) {
    translationHistory = [];
    localStorage.setItem("trans_history", JSON.stringify(translationHistory));
    renderHistory();
    showToast("History cleared.");
  }
}

function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, function (m) {
    return map[m];
  });
}

// ==========================================================================
// Event Listeners & Helper Actions
// ==========================================================================

sourceTextarea.addEventListener("input", () => {
  updateCharCounter();

  if (sourceTextarea.value.length > 5000) {
    sourceTextarea.value = sourceTextarea.value.slice(0, 5000);
    updateCharCounter();
  }

  if (!sourceTextarea.value.trim()) {
    targetTextarea.value = "";
    detectedBadge.style.display = "none";
    clearTimeout(debounceTimer);
    return;
  }

  triggerDebouncedTranslation();
});

function updateCharCounter() {
  const count = sourceTextarea.value.length;
  charCountSpan.textContent = count;
}

sourceLangSelect.addEventListener("change", () => {
  performTranslation();
});

targetLangSelect.addEventListener("change", () => {
  performTranslation();
});

swapLangsBtn.addEventListener("click", () => {
  const sourceVal = sourceLangSelect.value;
  const targetVal = targetLangSelect.value;

  if (sourceVal === "auto") {
    showToast("Select a specific source language to swap.", "error");
    return;
  }

  sourceLangSelect.value = targetVal;
  targetLangSelect.value = sourceVal;

  const sourceTxt = sourceTextarea.value;
  const targetTxt = targetTextarea.value;

  sourceTextarea.value = targetTxt;
  targetTextarea.value = sourceTxt;

  updateCharCounter();
  detectedBadge.style.display = "none";

  performTranslation();
});

clearInputBtn.addEventListener("click", () => {
  sourceTextarea.value = "";
  targetTextarea.value = "";
  updateCharCounter();
  detectedBadge.style.display = "none";
  sourceTextarea.focus();
});

translateBtn.addEventListener("click", () => {
  performTranslation();
});

readSourceBtn.addEventListener("click", () => {
  speakText(sourceTextarea.value, sourceLangSelect.value);
});

readTargetBtn.addEventListener("click", () => {
  speakText(targetTextarea.value, targetLangSelect.value);
});

speechInputBtn.addEventListener("click", () => {
  startVoiceInput();
});

copyBtn.addEventListener("click", () => {
  const text = targetTextarea.value.trim();
  if (!text) {
    showToast("No text to copy.", "error");
    return;
  }

  navigator.clipboard
    .writeText(text)
    .then(() => {
      copyToastMini.classList.add("show");
      setTimeout(() => {
        copyToastMini.classList.remove("show");
      }, 2000);
      showToast("Copied to clipboard!");
    })
    .catch((err) => {
      console.error("Clipboard copy error:", err);
      showToast("Failed to copy text.", "error");
    });
});

themeToggleBtn.addEventListener("click", () => {
  const currentTheme = document.documentElement.getAttribute("data-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";

  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem("app-theme", newTheme);
  showToast(`Switched to ${newTheme === "dark" ? "Dark" : "Light"} Mode`);
});

historyToggleBtn.addEventListener("click", () => {
  historyPanel.classList.add("open");
});

closeHistoryBtn.addEventListener("click", () => {
  historyPanel.classList.remove("open");
});

clearHistoryBtn.addEventListener("click", () => {
  clearAllHistory();
});
