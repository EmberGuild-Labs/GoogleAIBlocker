'use strict';

const TOGGLES = [
  'skipAiOverview',
  'removeAiOverview',
  'hideAiModeTab',
  'showBadge',
  'debug'
];

/** @param {string} text */
function setStatus(text) {
  const status = document.getElementById('status');
  status.textContent = text;
  if (text) setTimeout(() => { status.textContent = ''; }, 2000);
}

/**
 * @param {string} value textarea contents
 * @returns {{selectors: string[], invalid: string[]}}
 */
function parseSelectors(value) {
  const selectors = [];
  const invalid = [];
  for (const line of value.split('\n')) {
    const selector = line.trim();
    if (!selector || selector.startsWith('#!')) continue;
    try {
      document.querySelector(selector);
      selectors.push(selector);
    } catch (err) {
      invalid.push(selector);
    }
  }
  return { selectors, invalid };
}

async function render() {
  const settings = await globalThis.GAIB_loadSettings();
  for (const key of TOGGLES) {
    document.getElementById(key).checked = settings[key];
  }
  document.getElementById('customSelectors').value =
    settings.customSelectors.join('\n');
  const { blockedTotal = 0 } = await chrome.storage.local.get('blockedTotal');
  document.getElementById('blockedTotal').textContent = String(blockedTotal);
}

for (const key of TOGGLES) {
  document.getElementById(key).addEventListener('change', async (event) => {
    await chrome.storage.sync.set({ [key]: event.target.checked });
    setStatus('Saved');
  });
}

document.getElementById('save').addEventListener('click', async () => {
  const { selectors, invalid } = parseSelectors(
    document.getElementById('customSelectors').value
  );
  await chrome.storage.sync.set({ customSelectors: selectors });
  setStatus(
    invalid.length
      ? `Saved ${selectors.length}; ignored invalid: ${invalid.join(', ')}`
      : `Saved ${selectors.length} selector(s)`
  );
});

document.getElementById('resetStats').addEventListener('click', async () => {
  await chrome.storage.local.set({ blockedTotal: 0 });
  document.getElementById('blockedTotal').textContent = '0';
  setStatus('Counter reset');
});

document.getElementById('resetSettings').addEventListener('click', async () => {
  await chrome.storage.sync.set(globalThis.GAIB_DEFAULTS);
  await render();
  setStatus('Defaults restored');
});

render();
