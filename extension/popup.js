// ThesisGlow Lite · Popup Controller

const els = {
  serverDot: () => document.getElementById('serverDot'),
  serverText: () => document.getElementById('serverText'),
  autoToggle: () => document.getElementById('autoToggle'),
  btnScan: () => document.getElementById('btnScan'),
  btnGlowAll: () => document.getElementById('btnGlowAll'),
  btnRestore: () => document.getElementById('btnRestore'),
  btnResetVocab: () => document.getElementById('btnResetVocab'),
  vocabTotal: () => document.getElementById('vocabTotal'),
  vocabKnown: () => document.getElementById('vocabKnown'),
  vocabLearning: () => document.getElementById('vocabLearning'),
};

let autoScanOn = false;

// ── Server check ──────────────────────────────
async function checkServer() {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'checkServer' });
    if (resp.ok) {
      els.serverDot().className = 'status-dot online';
      els.serverText().textContent = 'localhost:8848 ✓';
    } else {
      throw new Error(resp.error);
    }
  } catch (e) {
    els.serverDot().className = 'status-dot offline';
    els.serverText().textContent = 'Server not running — cd ~/thesisglow-lite && python3 server.py';
  }
}

// ── Vocab stats ──────────────────────────────
async function loadVocab() {
  const resp = await chrome.runtime.sendMessage({ type: 'getVocab' });
  if (resp.ok) {
    const vocab = resp.vocab;
    const entries = Object.entries(vocab);
    const known = entries.filter(([, v]) => v.status === 'known').length;
    const learning = entries.filter(([, v]) => v.status === 'learning').length;
    els.vocabTotal().textContent = `${entries.length} total`;
    els.vocabKnown().textContent = `${known} known`;
    els.vocabLearning().textContent = `${learning} learning`;
  }
}

// ── Tab query helper ──────────────────────────
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// ── Event handlers ────────────────────────────
els.autoToggle().addEventListener('click', async () => {
  autoScanOn = !autoScanOn;
  if (autoScanOn) {
    els.autoToggle().classList.add('on');
  } else {
    els.autoToggle().classList.remove('on');
  }
  const tab = await getActiveTab();
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'toggleAutoScan', enabled: autoScanOn });
  }
});

els.btnScan().addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (tab.id) {
    const resp = await chrome.tabs.sendMessage(tab.id, { type: 'scan' });
    if (resp?.ok) {
      window.close();
    }
  }
});

els.btnGlowAll().addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (tab.id) {
    await chrome.tabs.sendMessage(tab.id, { type: 'glowAll' });
    window.close();
  }
});

els.btnRestore().addEventListener('click', async () => {
  const tab = await getActiveTab();
  if (tab.id) {
    await chrome.tabs.sendMessage(tab.id, { type: 'restore' });
    window.close();
  }
});

els.btnResetVocab().addEventListener('click', async () => {
  if (confirm('Reset all vocabulary data?')) {
    await chrome.runtime.sendMessage({ type: 'resetVocab' });
    loadVocab();
  }
});

// ── Init ──────────────────────────────────────
checkServer();
loadVocab();
