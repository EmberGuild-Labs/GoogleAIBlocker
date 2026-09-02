'use strict';

const TOGGLES = ['skipAiOverview', 'removeAiOverview', 'hideAiModeTab', 'showBadge'];

/** @param {string} text */
function setStatus(text) {
  const status = document.getElementById('status');
  status.textContent = text;
  if (text) setTimeout(() => { status.textContent = ''; }, 1500);
}

async function render() {
  const settings = await globalThis.GAIB_loadSettings();
  for (const key of TOGGLES) {
    document.getElementById(key).checked = settings[key];
  }
  const { blockedTotal = 0 } = await chrome.storage.local.get('blockedTotal');
  document.getElementById('blockedTotal').textContent = String(blockedTotal);
}

for (const key of TOGGLES) {
  document.getElementById(key).addEventListener('change', async (event) => {
    await chrome.storage.sync.set({ [key]: event.target.checked });
    setStatus('Saved');
  });
}

document.getElementById('openOptions').addEventListener('click', (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

render();
