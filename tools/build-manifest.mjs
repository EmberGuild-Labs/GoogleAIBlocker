/**
 * Regenerates manifest.json from manifest.base.json plus the Google domain
 * list, so the (long) match-pattern arrays never have to be edited by hand.
 *
 *   node tools/build-manifest.mjs          # write manifest.json
 *   node tools/build-manifest.mjs --check  # fail if manifest.json is stale
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const domains = JSON.parse(readFileSync(join(root, 'tools/google-domains.json'), 'utf8'));
const base = JSON.parse(readFileSync(join(root, 'manifest.base.json'), 'utf8'));

const searchMatches = domains.map((domain) => `*://*.${domain}/search*`);
const hostPermissions = domains.map((domain) => `*://*.${domain}/search*`);

const manifest = { ...base };
manifest.host_permissions = hostPermissions;
manifest.content_scripts = base.content_scripts.map((script) => ({
  ...script,
  matches: searchMatches
}));

const json = JSON.stringify(manifest, null, 2) + '\n';
const target = join(root, 'manifest.json');

if (process.argv.includes('--check')) {
  const current = readFileSync(target, 'utf8');
  if (current !== json) {
    console.error('manifest.json is out of date; run: node tools/build-manifest.mjs');
    process.exit(1);
  }
  console.log('manifest.json is up to date');
} else {
  writeFileSync(target, json);
  console.log(`manifest.json written (${domains.length} domains)`);
}
