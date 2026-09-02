/**
 * Background service worker.
 *
 * Owns two things:
 *  - whether the declarativeNetRequest ruleset that rewrites searches to the
 *    "Web" filter (&udm=14) is enabled;
 *  - the toolbar badge and the running "blocked" counter.
 */
'use strict';

importScripts('../shared/defaults.js');

const RULESET_ID = 'skip-ai-overview';
const BADGE_COLOUR = '#1a73e8';

/** Serialises read-modify-write updates of the counter. */
let statsQueue = Promise.resolve();

/**
 * Enables or disables the redirect ruleset to match the current setting.
 * @param {boolean} enabled
 */
async function syncRuleset(enabled) {
  try {
    const active = await chrome.declarativeNetRequest.getEnabledRulesets();
    const isActive = active.includes(RULESET_ID);
    if (enabled === isActive) return;
    await chrome.declarativeNetRequest.updateEnabledRulesets(
      enabled
        ? { enableRulesetIds: [RULESET_ID] }
        : { disableRulesetIds: [RULESET_ID] }
    );
  } catch (err) {
    console.error('[GoogleAIBlocker] could not update ruleset', err);
  }
}

async function syncFromSettings() {
  const settings = await self.GAIB_loadSettings();
  await syncRuleset(settings.skipAiOverview);
  if (!settings.showBadge) await clearAllBadges();
  return settings;
}

async function clearAllBadges() {
  try {
    await chrome.action.setBadgeText({ text: '' });
    const tabs = await chrome.tabs.query({});
    await Promise.all(
      tabs.map((tab) =>
        chrome.action.setBadgeText({ tabId: tab.id, text: '' }).catch(() => {})
      )
    );
  } catch (err) {
    // Tabs may disappear mid-flight; harmless.
  }
}

/**
 * @param {number} count number of blocks removed in this batch
 */
function recordBlocked(count) {
  statsQueue = statsQueue
    .then(async () => {
      const { blockedTotal = 0 } = await chrome.storage.local.get('blockedTotal');
      await chrome.storage.local.set({ blockedTotal: blockedTotal + count });
    })
    .catch(() => {});
  return statsQueue;
}

chrome.runtime.onInstalled.addListener(async () => {
  // Persist defaults so the options page and popup show real values.
  const settings = await self.GAIB_loadSettings();
  await chrome.storage.sync.set(settings);
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOUR });
  await syncRuleset(settings.skipAiOverview);
});

chrome.runtime.onStartup.addListener(() => {
  chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOUR }).catch(() => {});
  syncFromSettings();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if ('skipAiOverview' in changes || 'showBadge' in changes) syncFromSettings();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'gaib:removed') return undefined;

  const count = Number(message.count) || 0;
  const total = Number(message.total) || count;
  if (count > 0) recordBlocked(count);

  self.GAIB_loadSettings().then((settings) => {
    const tabId = sender.tab && sender.tab.id;
    if (!settings.showBadge || tabId === undefined) return;
    chrome.action
      .setBadgeText({ tabId, text: total > 0 ? String(Math.min(total, 99)) : '' })
      .catch(() => {});
    chrome.action
      .setTitle({ tabId, title: `Google AI Blocker - removed ${total} AI Overview block(s)` })
      .catch(() => {});
  });

  sendResponse({ ok: true });
  return false;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'loading') return;
  chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
});

// The worker can be started for any of the reasons above; make sure the
// ruleset always reflects the stored setting.
syncFromSettings();
