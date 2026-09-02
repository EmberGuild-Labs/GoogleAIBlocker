/**
 * Default settings, shared by the service worker, content scripts, popup and
 * options page. Loaded as a classic script in every context, so it exports by
 * assigning onto the global object rather than using ES module syntax
 * (MV3 content scripts cannot be modules).
 */
'use strict';

(function (global) {
  /** @type {{skipAiOverview: boolean, removeAiOverview: boolean, hideAiModeTab: boolean, showBadge: boolean, debug: boolean, customSelectors: string[]}} */
  const DEFAULTS = {
    // Rewrite Google searches to the "Web" results filter (&udm=14) so the AI
    // Overview is never generated in the first place. This is the setting that
    // actually saves work (and energy) on Google's side.
    skipAiOverview: true,
    // Belt-and-braces: strip any AI Overview that still makes it onto the page.
    removeAiOverview: true,
    // Hide the "AI Mode" entry in the search-tools tab bar (udm=50).
    hideAiModeTab: true,
    // Show the number of removed AI Overviews on the toolbar icon.
    showBadge: true,
    // Log what the content script matches and removes to the page console.
    debug: false,
    // Extra CSS selectors supplied by the user from the options page.
    customSelectors: []
  };

  const KEYS = Object.keys(DEFAULTS);

  /**
   * Reads settings from chrome.storage.sync, filling in defaults for anything
   * missing or of the wrong type.
   * @returns {Promise<typeof DEFAULTS>}
   */
  async function loadSettings() {
    let stored = {};
    try {
      stored = await chrome.storage.sync.get(KEYS);
    } catch (err) {
      // Storage can be unavailable while the extension is being updated.
      stored = {};
    }
    return normalizeSettings(stored);
  }

  /**
   * @param {Record<string, unknown>} stored
   * @returns {typeof DEFAULTS}
   */
  function normalizeSettings(stored) {
    const out = Object.assign({}, DEFAULTS);
    for (const key of KEYS) {
      const value = stored ? stored[key] : undefined;
      if (value === undefined || value === null) continue;
      if (Array.isArray(DEFAULTS[key])) {
        if (Array.isArray(value)) {
          out[key] = value.filter((item) => typeof item === 'string' && item.trim() !== '');
        }
      } else if (typeof value === typeof DEFAULTS[key]) {
        out[key] = value;
      }
    }
    return out;
  }

  global.GAIB_DEFAULTS = DEFAULTS;
  global.GAIB_SETTING_KEYS = KEYS;
  global.GAIB_loadSettings = loadSettings;
  global.GAIB_normalizeSettings = normalizeSettings;
})(typeof globalThis !== 'undefined' ? globalThis : self);
