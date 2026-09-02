/**
 * Checks the declarativeNetRequest regexes match exactly the URLs they should.
 * Pure Node, no dependencies: node test/rules.test.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rules = JSON.parse(readFileSync(join(root, 'rules/network-rules.json'), 'utf8'));

const redirectRule = rules.find((rule) => rule.action.type === 'redirect');
const allowRule = rules.find((rule) => rule.action.type === 'allow');

// declarativeNetRequest matches case-insensitively unless told otherwise.
const redirect = new RegExp(redirectRule.condition.regexFilter, 'i');
const allow = new RegExp(allowRule.condition.regexFilter, 'i');

/** [url, matches redirect rule, matches allow rule] */
const cases = [
  ['https://www.google.com/search?q=cats', true, false],
  ['https://www.google.com/search?client=firefox-b-d&q=cats', true, false],
  ['https://google.de/search?q=katzen&sourceid=chrome&ie=UTF-8', true, false],
  ['https://www.google.co.uk/search?q=x', true, false],
  ['https://www.google.com.au/search?q=x', true, false],
  ['http://www.google.com/search?q=x', true, false],
  // Already filtered, or a different vertical: left alone by the allow rule.
  ['https://www.google.com/search?q=cats&udm=14', true, true],
  ['https://www.google.com/search?udm=2&q=cats', true, true],
  ['https://www.google.com/search?q=cats&tbm=isch', true, true],
  ['https://www.google.com/search?tbm=nws&q=x', true, true],
  ['https://www.google.com/search?q=cats&udm=50', true, true],
  // Out of scope entirely.
  ['https://scholar.google.com/search?q=x', false, false],
  ['https://news.google.com/search?q=x', false, false],
  ['https://www.google.com/maps?q=x', false, false],
  ['https://www.google.com/search?sca_esv=1', false, false],
  // Lookalike hosts must never be rewritten.
  ['https://www.google.com.evil.io/search?q=x', false, false],
  ['https://www.google.com@evil.io/search?q=x', false, false],
  ['https://notgoogle.com/search?q=x', false, false]
];

let failures = 0;
for (const [url, expectRedirect, expectAllow] of cases) {
  const gotRedirect = redirect.test(url);
  const gotAllow = allow.test(url);
  if (gotRedirect !== expectRedirect || gotAllow !== expectAllow) {
    failures += 1;
    console.error(
      `FAIL ${url}\n  redirect: got ${gotRedirect}, want ${expectRedirect}` +
        `\n  allow:    got ${gotAllow}, want ${expectAllow}`
    );
  }
}

// The allow rule must win, otherwise the redirect would loop.
if (!(allowRule.priority > redirectRule.priority)) {
  failures += 1;
  console.error('FAIL allow rule must have a higher priority than the redirect rule');
}

if (failures > 0) {
  console.error(`\n${failures} failing case(s)`);
  process.exit(1);
}
console.log(`rules: ${cases.length} URL cases pass`);
