/**
 * End-to-end test: loads the unpacked extension into Chromium, points
 * www.google.com at a local HTTPS server serving a mock results page, and
 * checks both halves of the extension actually work.
 *
 *   npm run test:e2e
 *
 * Requires Playwright's Chromium build (npm install, then npx playwright install
 * chromium if it is not already present).
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:https';
import { readFileSync, mkdtempSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (err) {
  console.error(
    'Playwright is not installed. Run "npm install" (and, if needed, ' +
      '"npx playwright install chromium") before running the e2e test.'
  );
  process.exit(2);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = readFileSync(join(root, 'test/fixtures/serp.html'));

const results = [];
/**
 * @param {string} name
 * @param {boolean} condition
 * @param {string} [detail]
 */
function check(name, condition, detail) {
  results.push({ name, ok: !!condition, detail });
  console.log(`${condition ? 'pass' : 'FAIL'}  ${name}${condition || !detail ? '' : ` - ${detail}`}`);
}

/** Creates a throwaway self-signed certificate for the mock server. */
function makeCertificate() {
  const dir = mkdtempSync(join(tmpdir(), 'gaib-cert-'));
  const key = join(dir, 'key.pem');
  const cert = join(dir, 'cert.pem');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', key, '-out', cert, '-days', '1',
    '-subj', '/CN=www.google.com',
    '-addext', 'subjectAltName=DNS:www.google.com'
  ], { stdio: 'ignore' });
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

async function main() {
  const { key, cert } = makeCertificate();
  const server = createServer({ key, cert }, (req, res) => {
    if (!req.url.startsWith('/search')) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fixture);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const userDataDir = mkdtempSync(join(tmpdir(), 'gaib-profile-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    ignoreHTTPSErrors: true,
    args: [
      `--disable-extensions-except=${root}`,
      `--load-extension=${root}`,
      `--host-resolver-rules=MAP www.google.com 127.0.0.1:${port}`,
      '--ignore-certificate-errors',
      // The sandbox exports a proxy; the mock server is local.
      '--no-proxy-server'
    ]
  });

  try {
    // Give the extension's service worker time to register its ruleset.
    if (context.serviceWorkers().length === 0) {
      await context.waitForEvent('serviceworker', { timeout: 10000 }).catch(() => {});
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const page = await context.newPage();

    // 1. A plain search is rewritten to the Web filter, so no overview is ever
    //    generated server-side.
    await page.goto('https://www.google.com/search?q=test', { waitUntil: 'load' });
    check(
      'plain search is rewritten to &udm=14',
      new URL(page.url()).searchParams.get('udm') === '14',
      page.url()
    );

    // 2. Other verticals are left alone.
    await page.goto('https://www.google.com/search?q=test&udm=2', { waitUntil: 'load' });
    check(
      'image search (udm=2) is left alone',
      new URL(page.url()).searchParams.get('udm') === '2',
      page.url()
    );

    // 3. DOM removal, on a page that still serves an overview.
    await page.goto('https://www.google.com/search?q=test&udm=14', { waitUntil: 'load' });
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-late-injected') === 'true',
      null,
      { timeout: 5000 }
    );
    await page.waitForTimeout(500);

    const dom = await page.evaluate(() => ({
      attr: !!document.getElementById('aio-attr'),
      label: !!document.getElementById('aio-label'),
      aria: !!document.getElementById('aio-aria'),
      late: !!document.getElementById('aio-late'),
      aiModeTab: !!document.getElementById('tab-ai-mode'),
      webTab: !!document.getElementById('tab-web'),
      imagesTab: !!document.getElementById('tab-images'),
      result1: !!document.getElementById('result-1'),
      result2: !!document.getElementById('result-2'),
      rso: !!document.getElementById('rso'),
      centerCol: !!document.getElementById('center_col')
    }));

    check('AI Overview matched by attribute is removed', !dom.attr);
    check('AI Overview matched by localised heading is removed', !dom.label);
    check('AI Overview matched by aria-label is removed', !dom.aria);
    check('late-injected AI Overview is removed', !dom.late);
    check('AI Mode tab is removed', !dom.aiModeTab);
    check('Web tab survives', dom.webTab);
    check('Images tab survives', dom.imagesTab);
    check('first organic result survives', dom.result1);
    check('second organic result survives', dom.result2);
    check('results container survives', dom.rso && dom.centerCol);

    // 4. Turning the network rule off stops the rewrite.
    const worker = context.serviceWorkers()[0];
    if (worker) {
      await worker.evaluate(() => chrome.storage.sync.set({ skipAiOverview: false }));
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await page.goto('https://www.google.com/search?q=test', { waitUntil: 'load' });
      check(
        'disabling the setting stops the rewrite',
        new URL(page.url()).searchParams.get('udm') === null,
        page.url()
      );
      await worker.evaluate(() => chrome.storage.sync.set({ skipAiOverview: true }));
    } else {
      check('service worker is reachable', false, 'no service worker found');
    }
  } finally {
    await context.close();
    server.close();
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
