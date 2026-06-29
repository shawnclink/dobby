// ThesisGlow Lite · Background Service Worker
// 职责：API 代理 + 词汇记忆 + 状态管理

const API_BASE = 'http://localhost:8848';

// ── 词汇记忆 ──────────────────────────────────
const WORD_STORE = 'tgl_vocabulary'; // {word: {seen, lastSeen, status}}

async function getVocabulary() {
  const data = await chrome.storage.local.get(WORD_STORE);
  return data[WORD_STORE] || {};
}

async function updateVocabulary(annotations) {
  const vocab = await getVocabulary();
  const now = Date.now();
  let changed = false;

  for (const a of annotations) {
    const word = a.word.toLowerCase();
    if (!vocab[word]) {
      vocab[word] = { seen: 1, lastSeen: now, status: 'learning' };
      changed = true;
    } else {
      vocab[word].seen += 1;
      vocab[word].lastSeen = now;
      // Auto-promote: 3+ sightings → known (skip)
      if (vocab[word].seen >= 3 && vocab[word].status === 'learning') {
        vocab[word].status = 'known';
      }
      changed = true;
    }
  }

  if (changed) {
    await chrome.storage.local.set({ [WORD_STORE]: vocab });
  }
  return vocab;
}

// ── API 调用 ──────────────────────────────────
async function callGlowAPI(text, options = {}) {
  const vocab = await getVocabulary();
  const knownWords = Object.entries(vocab)
    .filter(([, v]) => v.status === 'known')
    .map(([w]) => w);

  try {
    const resp = await fetch(`${API_BASE}/api/glow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        known_words: knownWords,
        level: options.level || 'intermediate',
      }),
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const annotations = data.annotations || [];

    // Filter out known words
    const filtered = annotations.filter(
      a => !knownWords.includes(a.word.toLowerCase())
    );

    // Update vocabulary with new annotations
    await updateVocabulary(filtered);

    return { annotations: filtered, vocab };
  } catch (e) {
    throw new Error(`Glow API: ${e.message}`);
  }
}

// ── 消息路由 ──────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'glow') {
    callGlowAPI(msg.text, msg.options || {})
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // async response
  }

  if (msg.type === 'getVocab') {
    getVocabulary().then(vocab => sendResponse({ ok: true, vocab }));
    return true;
  }

  if (msg.type === 'markWord') {
    chrome.storage.local.get(WORD_STORE).then(data => {
      const vocab = data[WORD_STORE] || {};
      const word = msg.word.toLowerCase();
      if (vocab[word]) {
        vocab[word].status = msg.status; // 'known' | 'learning' | 'unknown'
        vocab[word].lastSeen = Date.now();
      } else {
        vocab[word] = { seen: 1, lastSeen: Date.now(), status: msg.status };
      }
      return chrome.storage.local.set({ [WORD_STORE]: vocab });
    }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'resetVocab') {
    chrome.storage.local.remove(WORD_STORE).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'checkServer') {
    fetch(`${API_BASE}/api/health`)
      .then(r => r.json())
      .then(d => sendResponse({ ok: true, server: d }))
      .catch(() => sendResponse({ ok: false, error: 'Server not running' }));
    return true;
  }
});

// ── 启动时清理过期数据（>30天未见的词降级）─
async function cleanupVocabulary() {
  const vocab = await getVocabulary();
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  let changed = false;

  for (const [word, data] of Object.entries(vocab)) {
    if (data.status === 'known' && (now - data.lastSeen) > thirtyDays) {
      vocab[word].status = 'learning';
      changed = true;
    }
  }

  if (changed) {
    await chrome.storage.local.set({ [WORD_STORE]: vocab });
  }
}

cleanupVocabulary();
