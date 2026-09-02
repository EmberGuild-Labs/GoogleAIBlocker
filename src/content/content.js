/**
 * Removes the AI Overview from Google search results.
 *
 * Runs at document_start: a stylesheet hiding the known AI Overview containers
 * is injected before the page paints, so nothing flashes up before the observer
 * gets a chance to delete it. The observer then removes matched blocks from the
 * DOM entirely, which also stops their images and scripts from doing work.
 */
'use strict';

(function () {
  const STYLE_ID = 'gaib-hide-style';
  const detector = globalThis.GAIB_DETECTOR;

  const state = {
    settings: globalThis.GAIB_DEFAULTS,
    styleEl: null,
    observer: null,
    scheduled: false,
    lastScan: 0,
    removed: 0,
    idleSince: Date.now()
  };

  const SCAN_THROTTLE_MS = 100;
  /** Stop observing after this much quiet time; re-armed by user interaction. */
  const OBSERVER_IDLE_MS = 20000;

  function log(...args) {
    if (state.settings.debug) console.log('[GoogleAIBlocker]', ...args);
  }

  /** @returns {string} the CSS used for the pre-paint hide. */
  function buildCss() {
    const rules = [];
    if (state.settings.removeAiOverview) {
      const selectors = detector.CONTAINER_SELECTORS.concat(
        state.settings.customSelectors || []
      );
      rules.push(selectors.join(',\n') + ' { display: none !important; }');
    }
    if (state.settings.hideAiModeTab) {
      rules.push(
        detector.AI_MODE_SELECTORS.join(',\n') + ' { display: none !important; }'
      );
    }
    return rules.join('\n');
  }

  function applyStyle() {
    const css = buildCss();
    if (!css) {
      if (state.styleEl) {
        state.styleEl.remove();
        state.styleEl = null;
      }
      return;
    }
    if (!state.styleEl || !state.styleEl.isConnected) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
      state.styleEl = style;
    }
    state.styleEl.textContent = css;
  }

  /** Removes every AI Overview block currently in the document. */
  function scan() {
    state.lastScan = Date.now();
    let removed = 0;

    if (state.settings.removeAiOverview) {
      for (const block of detector.findAiOverviewBlocks(
        document,
        state.settings.customSelectors
      )) {
        log('removing AI Overview block', block);
        block.remove();
        removed += 1;
      }
    }

    if (state.settings.hideAiModeTab) {
      for (const item of detector.findAiModeLinks(document)) {
        log('removing AI Mode tab', item);
        item.remove();
      }
    }

    if (removed > 0) {
      state.removed += removed;
      state.idleSince = Date.now();
      report(removed);
    }
    return removed;
  }

  /** Tells the service worker how many blocks were removed, for the badge. */
  function report(count) {
    try {
      const sending = chrome.runtime.sendMessage({
        type: 'gaib:removed',
        count,
        total: state.removed
      });
      if (sending && typeof sending.catch === 'function') sending.catch(() => {});
    } catch (err) {
      // The extension context can be invalidated on update; nothing to do.
    }
  }

  function scheduleScan() {
    if (state.scheduled) return;
    state.scheduled = true;
    const run = () => {
      state.scheduled = false;
      scan();
    };
    const wait = Math.max(0, SCAN_THROTTLE_MS - (Date.now() - state.lastScan));
    setTimeout(run, wait);
  }

  function startObserver() {
    if (state.observer) return;
    state.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0 || mutation.type === 'attributes') {
          scheduleScan();
          return;
        }
      }
    });
    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-subtree', 'data-attrid', 'aria-label']
    });
    log('observer started');
  }

  function stopObserver() {
    if (!state.observer) return;
    state.observer.disconnect();
    state.observer = null;
    log('observer stopped');
  }

  function isEnabled() {
    return state.settings.removeAiOverview || state.settings.hideAiModeTab;
  }

  function apply() {
    applyStyle();
    if (isEnabled()) {
      startObserver();
      scheduleScan();
    } else {
      stopObserver();
    }
  }

  /**
   * Google keeps its results page alive across in-page navigations, but once a
   * page has settled there is no reason to keep an observer attached. It is
   * re-armed whenever the user interacts with the page or the URL changes.
   */
  function armIdleTimer() {
    setInterval(() => {
      if (!state.observer) return;
      if (Date.now() - state.idleSince > OBSERVER_IDLE_MS) stopObserver();
    }, OBSERVER_IDLE_MS);

    const wake = () => {
      state.idleSince = Date.now();
      if (isEnabled()) {
        startObserver();
        scheduleScan();
      }
    };
    for (const type of ['click', 'keydown', 'popstate', 'pageshow']) {
      window.addEventListener(type, wake, { capture: true, passive: true });
    }
  }

  // Hide first, ask questions later: the stylesheet goes in synchronously with
  // default settings so there is no window where the overview is visible.
  applyStyle();

  globalThis
    .GAIB_loadSettings()
    .then((settings) => {
      state.settings = settings;
      apply();
      armIdleTimer();
    })
    .catch(() => {
      apply();
      armIdleTimer();
    });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    const next = Object.assign({}, state.settings);
    for (const [key, change] of Object.entries(changes)) {
      next[key] = change.newValue;
    }
    state.settings = globalThis.GAIB_normalizeSettings(next);
    state.idleSince = Date.now();
    apply();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleScan, { once: true });
  }
  window.addEventListener('load', scheduleScan, { once: true });
})();
