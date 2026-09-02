# Google AI Blocker

A Chrome (Manifest V3) extension that gets rid of Google's **AI Overview**.

It works on two levels:

1. **Prevention (default).** Every Google search is rewritten to Google's own
   "Web" results filter by adding `&udm=14` to the URL. On that filter Google
   returns plain blue links and **never generates an AI Overview at all**, so no
   model is run for your query. This is the energy-saving path: nothing is
   produced, so nothing has to be thrown away.
2. **Removal (fallback).** A content script deletes any AI Overview that still
   turns up — a different layout, a search the redirect did not cover, or the
   prevention step switched off. A stylesheet is injected before the page paints,
   so nothing flashes into view first.

Both layers are independent and can be toggled from the toolbar popup.

---

## Install

### From source (unpacked)

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome (or Edge, Brave, Opera, Vivaldi).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the repository folder — the one containing
   `manifest.json`.

The extension takes effect on the next search; existing tabs need a reload.

### As a packaged zip

```bash
npm run package     # writes dist/google-ai-blocker-<version>.zip
```

That zip is what you would upload to the Chrome Web Store dashboard. It contains
only `manifest.json`, `rules/`, `src/`, `icons/` and `LICENSE`.

---

## Settings

Click the toolbar icon for the common toggles, or open **More settings** for the
full options page.

| Setting | Default | What it does |
| --- | --- | --- |
| Never generate an AI Overview | on | Adds `&udm=14` to `google.*/search?q=…` via a declarativeNetRequest rule, so Google serves the "Web" filter and skips the overview entirely. |
| Remove any AI Overview on the page | on | Content script deletes the overview block from the results page if one appears. |
| Hide the "AI Mode" tab | on | Removes links to `udm=50` (the AI Mode entry point) from the results tab bar. |
| Show a count on the toolbar icon | on | Badges the icon with the number of overviews removed on the current page. |
| Log matches to the page console | off | Prints every removed element, prefixed with `[GoogleAIBlocker]`. |
| Extra selectors | empty | Additional CSS selectors to remove, one per line. Invalid selectors are rejected on save. |

### What `&udm=14` changes

`udm=14` is Google's own "Web" search filter, the one behind the **Web** tab that
Google added in May 2024. It is a supported, first-party mode — this extension
does not fake or intercept anything, it just always asks for that mode.

Trade-offs worth knowing about:

- The results page becomes text links only: no AI Overview, and also no knowledge
  panel, no inline images, videos, maps or "People also ask" boxes.
- The **All** tab effectively becomes **Web**. The **Images**, **Videos**, **News**
  and **Shopping** tabs keep working normally — the rule leaves any search that
  already carries a `udm=` or `tbm=` parameter untouched.
- If you want the rich results back but still no AI Overview, turn the first
  toggle off and keep the second one on. You then get the normal page with the
  overview removed client-side (which does not save any generation work).

---

## How detection works

Google's search markup is machine-generated and its class names rotate
constantly, so nothing here depends on a hashed class name. `src/content/detector.js`
matches on two stable signals:

- **Structural attributes** — `[data-subtree="aio"]`, `[data-attrid="SGE"]`,
  `[data-attrid^="SGE/"]` and friends.
- **The block's label** — the visible heading or `aria-label`, matched against a
  list of localised forms of "AI Overview" (`AI-overzicht`, `KI-Übersicht`,
  `Resumen con IA`, `AI による概要`, `AI 개요`, and about twenty more), plus a loose
  fallback pattern. Only short strings (64 characters or fewer) are considered, so
  a snippet that merely mentions the phrase is never matched.

Whatever matches is walked up the tree to the outermost element that still sits
inside a results container (`#rso`, `#center_col`, `#search`, …) and that element
is removed, so the whole card goes rather than just its heading. The walk stops at
those containers and refuses to return anything that would swallow the results
list itself, so a bad match can never blank the page.

A `MutationObserver` re-runs the scan as Google streams content in, throttled to
one scan per 100 ms, and detaches itself after 20 seconds of quiet (re-arming on
click, keypress or navigation) so idle tabs cost nothing.

### If Google changes the layout

Turn on **Log matches to the page console**, search for something, and see what is
(not) being matched. Then add a selector for the new container in **Extra
selectors** on the options page — it is applied to both the pre-paint stylesheet
and the removal pass, so no code change or reload of the extension is needed.

---

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Store your settings and the removal counter. |
| `declarativeNetRequest` | The static rule that adds `&udm=14`. Declarative: Chrome applies the rule, the extension never sees your requests. |
| `*://*.google.<tld>/search*` | Run the content script and the redirect rule on Google search result pages, on all 189 Google country domains. The host permission is scoped to the `/search` path, so the extension has no access to Gmail, Drive, Docs or any other Google service. |

### Privacy

The extension has no server, no analytics and no network calls of its own. Nothing
about your searches leaves your browser. The only data it stores are your settings
(in `chrome.storage.sync`, so they follow your Chrome profile) and a single integer
counting how many overviews have been removed (in `chrome.storage.local`).

---

## Repository layout

```
manifest.json            generated - do not edit by hand
manifest.base.json       manifest without the long domain lists
rules/network-rules.json declarativeNetRequest rules (the &udm=14 rewrite)
src/shared/defaults.js   settings schema, defaults, load/normalise helpers
src/shared/ui.css        styles shared by the popup and options page
src/content/detector.js  finds the AI Overview block (no DOM mutation)
src/content/content.js   injects the stylesheet, runs the observer, removes blocks
src/background/service-worker.js  toggles the ruleset, owns the badge and counter
src/popup/               toolbar popup
src/options/             options page
tools/google-domains.json  the 189 Google ccTLDs
tools/build-manifest.mjs   regenerates manifest.json
tools/make-icons.py        regenerates the PNG icons (no dependencies)
tools/package.sh           builds the upload zip
test/                      tests
```

### The network rule

`rules/network-rules.json` holds two rules:

- **Rule 1 (redirect, priority 1)** matches `https?://(www.)?google.<tld>/search?…q=…`
  on main-frame navigations and rewrites the query string with
  `addOrReplaceParams: udm=14`.
- **Rule 2 (allow, priority 2)** matches the same URLs when they already carry a
  `udm=` or `tbm=` parameter. `allow` outranks the redirect, which both preserves
  the other search verticals and makes a redirect loop impossible.

The host pattern is anchored so lookalike hosts (`www.google.com.evil.example`,
`www.google.com@evil.example`, `scholar.google.com`) never match; `test/rules.test.mjs`
asserts this.

---

## Development

```bash
npm install               # only needed for the e2e test (Playwright)

npm run test:rules        # URL matching for the network rules - no dependencies
npm run test:e2e          # loads the extension into real Chromium
npm test                  # both

npm run build:manifest    # regenerate manifest.json from manifest.base.json
npm run check:manifest    # fail if manifest.json is stale
npm run build:icons       # regenerate icons/*.png
```

`manifest.json` is generated: edit `manifest.base.json` or
`tools/google-domains.json` and re-run `npm run build:manifest`.

### About the e2e test

`test/e2e.test.mjs` launches Chromium with the unpacked extension, starts a local
HTTPS server holding a mock results page (`test/fixtures/serp.html`), and points
`www.google.com` at it with `--host-resolver-rules`. It then asserts, against the
real browser rather than a mock:

- a plain search is rewritten to `udm=14`;
- an image search (`udm=2`) is left alone;
- overviews matched by attribute, by localised heading and by `aria-label` are all
  removed, including one injected 300 ms after load;
- the AI Mode tab is removed while the other tabs survive;
- organic results and the results containers survive;
- turning the setting off stops the rewrite.

---

## Limitations

- Only the AI Overview and the AI Mode tab are touched. Gemini elsewhere in
  Google's products is out of scope.
- Google changes its markup often. The prevention layer is unaffected by that, but
  the removal layer may need a new selector — see *If Google changes the layout*.
- Chromium browsers only. Firefox uses a different `declarativeNetRequest`
  surface and would need a separate manifest.

## License

MIT — see [LICENSE](LICENSE).
