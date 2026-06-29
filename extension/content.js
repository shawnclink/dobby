// ThesisGlow Lite · Content Script
// 职责：扫描页面英文文本块 + 触发 Glow + 渲染行间翻译

let autoScanEnabled = false;
let scanObserver = null;
let processedBlocks = new WeakSet();

// ── 英文文本块检测 ──────────────────────────
function isEnglishText(text) {
  // 至少 30 个字符，英文比例 > 70%
  if (!text || text.length < 30) return false;
  const alpha = text.replace(/[^a-zA-Z]/g, '').length;
  return alpha / text.length > 0.70;
}

function findEnglishBlocks() {
  const blocks = [];
  const selectors = 'p, article, section, div, li, td, th, blockquote, pre, h1, h2, h3, h4, h5, h6, span, dd, dt, figcaption';

  document.querySelectorAll(selectors).forEach(el => {
    // Skip tiny elements, already processed, or non-visible
    if (el.offsetHeight === 0 || el.offsetWidth === 0) return;
    if (el.closest('.tgl-word, .tgl-float-btn, script, style, noscript, nav, footer, header')) return;
    if (processedBlocks.has(el)) return;

    const text = el.textContent?.trim() || '';
    if (isEnglishText(text)) {
      blocks.push(el);
    }
  });

  return blocks;
}

// ── 浮动按钮 ────────────────────────────────
function addFloatButton(el) {
  // Ensure relative positioning
  const origPos = getComputedStyle(el).position;
  if (origPos === 'static') {
    el.style.position = 'relative';
  }
  el.classList.add('tgl-scannable');

  // Remove existing button
  const existing = el.querySelector('.tgl-float-btn');
  if (existing) existing.remove();

  const btn = document.createElement('button');
  btn.className = 'tgl-float-btn';
  btn.textContent = '✨ Glow';
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();
    await glowBlock(el, btn);
  });

  el.appendChild(btn);

  // Show on hover
  el.addEventListener('mouseenter', () => btn.classList.add('visible'));
  el.addEventListener('mouseleave', () => btn.classList.remove('visible'));
}

// ── 执行 Glow ────────────────────────────────
async function glowBlock(el, btn) {
  const text = el.textContent?.trim() || '';
  if (!text) return;

  // Save original HTML
  if (!el.dataset.tglOriginal) {
    el.dataset.tglOriginal = el.innerHTML;
  }

  // Loading state
  if (btn) {
    btn.textContent = '⏳ ...';
    btn.classList.add('tgl-loading');
  }

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'glow',
      text: text,
      options: { level: 'intermediate' },
    });

    if (!result.ok) {
      throw new Error(result.error);
    }

    renderGlow(el, text, result.annotations);

    if (btn) {
      btn.textContent = `✓ ${result.annotations.length} words`;
      btn.classList.remove('tgl-loading');
      setTimeout(() => {
        btn.textContent = '✨ Glow';
        btn.classList.remove('visible');
      }, 2000);
    }
  } catch (err) {
    if (btn) {
      btn.textContent = '✗ Retry';
      btn.classList.remove('tgl-loading');
    }
    console.error('ThesisGlow:', err.message);
  }
}

function renderGlow(el, original, annotations) {
  const lookup = new Map();
  for (const a of annotations) {
    if (a.word && a.translation) {
      lookup.set(a.word.trim(), a.translation.trim());
    }
  }

  // Tokenize and rebuild HTML
  const tokens = tokenize(original);
  let html = '';

  for (const token of tokens) {
    if (token.type === 'word' && lookup.has(token.text)) {
      html += `<span class="tgl-word"><span class="tgl-trans">${esc(lookup.get(token.text))}</span>${esc(token.text)}</span>`;
    } else if (token.type === 'word') {
      html += esc(token.text);
    } else {
      html += token.text;
    }
    // Only annotate first occurrence
    if (token.type === 'word') lookup.delete(token.text);
  }

  el.innerHTML = html;
  el.classList.add('tgl-processed');
  processedBlocks.add(el);
}

function tokenize(text) {
  const re = /([a-zA-Z]+(?:[''][a-zA-Z]+)?)|([^a-zA-Z]+)/g;
  const tokens = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) tokens.push({ type: 'word', text: m[1] });
    else if (m[2]) tokens.push({ type: 'other', text: m[2] });
  }
  return tokens;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── 全局扫描模式 ────────────────────────────
function showIndicator(text) {
  let ind = document.querySelector('.tgl-indicator');
  if (!ind) {
    ind = document.createElement('div');
    ind.className = 'tgl-indicator';
    document.body.appendChild(ind);
  }
  ind.textContent = text;
  ind.classList.add('visible');
}

function hideIndicator() {
  const ind = document.querySelector('.tgl-indicator');
  if (ind) ind.classList.remove('visible');
}

function scanAndAttach() {
  const blocks = findEnglishBlocks();
  for (const block of blocks) {
    if (!processedBlocks.has(block)) {
      addFloatButton(block);
    }
  }
  return blocks.length;
}

function enableAutoScan() {
  autoScanEnabled = true;
  scanAndAttach();
  showIndicator('🔍 Auto-Scan ON');

  // Watch for DOM changes (new content loading)
  scanObserver = new MutationObserver(() => {
    scanAndAttach();
  });
  scanObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function disableAutoScan() {
  autoScanEnabled = false;
  if (scanObserver) {
    scanObserver.disconnect();
    scanObserver = null;
  }
  hideIndicator();

  // Remove float buttons
  document.querySelectorAll('.tgl-float-btn').forEach(b => b.remove());
}

// ── 消息监听 ──────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'scan') {
    const count = scanAndAttach();
    sendResponse({ ok: true, blocks: count });
  }

  if (msg.type === 'toggleAutoScan') {
    if (msg.enabled) {
      enableAutoScan();
    } else {
      disableAutoScan();
    }
    sendResponse({ ok: true });
  }

  if (msg.type === 'glowAll') {
    glowAll();
    sendResponse({ ok: true });
  }

  if (msg.type === 'restore') {
    restoreAll();
    sendResponse({ ok: true });
  }
});

async function glowAll() {
  const blocks = findEnglishBlocks();
  showIndicator(`Glowing ${blocks.length} blocks...`);
  for (let i = 0; i < blocks.length; i++) {
    const btn = blocks[i].querySelector('.tgl-float-btn');
    await glowBlock(blocks[i], btn);
    showIndicator(`Glowing ${i + 1}/${blocks.length}...`);
  }
  hideIndicator();
}

function restoreAll() {
  document.querySelectorAll('.tgl-processed').forEach(el => {
    if (el.dataset.tglOriginal) {
      el.innerHTML = el.dataset.tglOriginal;
      el.classList.remove('tgl-processed');
      delete el.dataset.tglOriginal;
    }
  });
  processedBlocks = new WeakSet();
  document.querySelectorAll('.tgl-float-btn').forEach(b => b.remove());
}

// ── 初始化 ────────────────────────────────────
// Attach float buttons to visible English text (non-auto mode)
scanAndAttach();
