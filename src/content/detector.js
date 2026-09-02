/**
 * Finds the AI Overview block on a Google results page.
 *
 * Google's markup is generated and its class names are rotated frequently, so
 * this deliberately does not rely on hashed class names. Two signals are used:
 *
 *   1. Structural attributes that have proven stable (`data-subtree="aio"`,
 *      `data-attrid` values in the SGE family).
 *   2. The visible label / aria-label of the block, which is always some
 *      localised form of "AI Overview".
 *
 * Whatever matches is then walked up to the top-level result block so the whole
 * card is taken out rather than just its heading.
 */
'use strict';

(function (global) {
  /**
   * Attribute-based hooks for the AI Overview container itself.
   * Kept small on purpose: every entry here is a structural attribute, not a
   * generated class name.
   */
  const CONTAINER_SELECTORS = [
    '[data-subtree="aio"]',
    '[data-attrid="SGE"]',
    '[data-attrid^="SGE/"]',
    '[data-attrid="AIOverview"]',
    'div[jsname][data-mcpr="aio"]',
    '#eob_ai_overview'
  ];

  /** Selectors for the "AI Mode" entry point in the tab bar. */
  const AI_MODE_SELECTORS = [
    'a[href*="udm=50"]',
    'a[href*="udm%3D50"]'
  ];

  /**
   * Localised forms of "AI Overview". Matched against the trimmed text or
   * aria-label of small elements only, so a stray mention inside a result
   * snippet cannot trigger a removal.
   */
  const LABEL_PATTERNS = [
    /^ai\s*overview$/i,
    /^ai[\s-]*overzicht$/i,
    /^(ki[\s-]*übersicht|übersicht mit ki)$/i,
    /^resumen (con|de) ia$/i,
    /^(vista|visión|vision) (general )?creada con ia$/i,
    /^visão geral criada (com|por) ia$/i,
    /^aperçu (ia|de l'ia|par l'ia)$/i,
    /^panoramica (ai|con ia)$/i,
    /^przegląd (ai|od ai)$/i,
    /^ai[\s-]*översikt$/i,
    /^ai[\s-]*overblik$/i,
    /^tekoälyn yhteenveto$/i,
    /^yapay zek[aâ] (destekli )?genel bakış$/i,
    /^ai\s*による概要$/,
    /^ai\s*摘要$/,
    /^ai\s*(概览|概述)$/,
    /^ai\s*개요$/,
    /^ringkasan ai$/i,
    /^tổng quan do ai tạo$/i,
    /^ภาพรวมจาก\s*ai$/,
    /^نظرة عامة من الذكاء الاصطناعي$/,
    /^(סקירה כללית של ai|סקירת ai)$/,
    /^ai-?generert oversikt$/i,
    // Loose fallback for wordings not covered above.
    /\bai\b[\s :_-]{0,3}overview\b/i
  ];

  /** Elements we must never climb past or remove. */
  const BOUNDARY_SELECTORS = [
    '#rso',
    '#rcnt',
    '#center_col',
    '#search',
    '#main',
    '#appbar',
    '#botstuff',
    '#topstuff',
    '[role="main"]',
    'body',
    'html'
  ];

  const BOUNDARY_SELECTOR = BOUNDARY_SELECTORS.join(',');
  /** Containers that must never end up inside a removed block. */
  const NEVER_SWALLOW = '#rso, #center_col, #botstuff, #search';
  const MAX_ASCENT = 12;
  /** Longest text we are willing to treat as a label rather than content. */
  const MAX_LABEL_LENGTH = 64;

  /**
   * @param {Element} el
   * @returns {boolean}
   */
  function isBoundary(el) {
    return !!el && typeof el.matches === 'function' && el.matches(BOUNDARY_SELECTOR);
  }

  /**
   * @param {string | null | undefined} text
   * @returns {boolean}
   */
  function isAiOverviewLabel(text) {
    if (!text) return false;
    const value = text.replace(/\s+/g, ' ').trim();
    if (!value || value.length > MAX_LABEL_LENGTH) return false;
    return LABEL_PATTERNS.some((pattern) => pattern.test(value));
  }

  /**
   * Walks up from a matched node to the outermost element that still sits
   * inside a results container, so the entire card is returned.
   * @param {Element} el
   * @returns {Element | null}
   */
  function ascendToBlock(el) {
    if (!el || isBoundary(el)) return null;
    let node = el;
    for (let i = 0; i < MAX_ASCENT; i += 1) {
      const parent = node.parentElement;
      if (!parent) return null;
      if (isBoundary(parent)) {
        return node.querySelector(NEVER_SWALLOW) ? null : node;
      }
      node = parent;
    }
    return null;
  }

  /**
   * @param {Element} el
   * @returns {Element | null}
   */
  function resolveBlock(el) {
    const block = ascendToBlock(el);
    if (block) return block;
    // No boundary above it: only fall back to the node itself if it is clearly
    // a self-contained container rather than a bare label.
    if (el.matches && el.matches(CONTAINER_SELECTORS.join(','))) {
      return el.querySelector(NEVER_SWALLOW) ? null : el;
    }
    return null;
  }

  /**
   * @param {ParentNode} root
   * @param {string[]} selectors
   * @returns {Element[]}
   */
  function queryAll(root, selectors) {
    const found = [];
    for (const selector of selectors) {
      let matches;
      try {
        matches = root.querySelectorAll(selector);
      } catch (err) {
        continue; // Ignore invalid user-supplied selectors.
      }
      for (const el of matches) found.push(el);
    }
    return found;
  }

  /**
   * Finds every AI Overview block currently in the document.
   * @param {Document | Element} [root]
   * @param {string[]} [customSelectors] extra selectors from the options page
   * @returns {Element[]}
   */
  function findAiOverviewBlocks(root, customSelectors) {
    const scope = root || document;
    const blocks = new Set();

    const selectors = CONTAINER_SELECTORS.concat(
      Array.isArray(customSelectors) ? customSelectors : []
    );
    for (const el of queryAll(scope, selectors)) {
      const block = resolveBlock(el);
      if (block) blocks.add(block);
    }

    const labelled = queryAll(scope, [
      '[aria-label]',
      '[role="heading"]',
      'h1',
      'h2',
      'h3',
      'strong'
    ]);
    for (const el of labelled) {
      const label = el.getAttribute('aria-label') || el.textContent;
      if (!isAiOverviewLabel(label)) continue;
      const block = resolveBlock(el);
      if (block) blocks.add(block);
    }

    // Drop any block that is an ancestor of another match, so nested hits do
    // not remove more of the page than necessary.
    const result = [];
    for (const block of blocks) {
      let redundant = false;
      for (const other of blocks) {
        if (other !== block && block.contains(other)) {
          redundant = true;
          break;
        }
      }
      if (!redundant) result.push(block);
    }
    return result;
  }

  /**
   * @param {ParentNode} [root]
   * @returns {Element[]}
   */
  function findAiModeLinks(root) {
    const scope = root || document;
    return queryAll(scope, AI_MODE_SELECTORS).map((link) => {
      // The tab is usually a list item wrapping the link.
      const item = link.closest('[role="listitem"], li');
      return item && !isBoundary(item) ? item : link;
    });
  }

  const api = {
    CONTAINER_SELECTORS,
    AI_MODE_SELECTORS,
    LABEL_PATTERNS,
    BOUNDARY_SELECTORS,
    isAiOverviewLabel,
    ascendToBlock,
    findAiOverviewBlocks,
    findAiModeLinks
  };

  global.GAIB_DETECTOR = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
