import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('RIM loads Supabase from a same-origin bundle before runtime bootstrap', () => {
  const html = read('../index.html');
  assert.match(html, /assets\/js\/supabase-client\.bundle\.js/);
  assert.doesNotMatch(html, /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/);
  assert.ok(html.indexOf('supabase-client.bundle.js') < html.indexOf('rim-runtime-bootstrap.js'));
});

test('build emits the pinned Supabase client as a browser asset', () => {
  const pkg = JSON.parse(read('../package.json'));
  const build = read('../scripts/build-cloudflare.mjs');
  const entry = read('../scripts/supabase-browser-entry.js');
  assert.equal(pkg.dependencies['@supabase/supabase-js'], '2.49.8');
  assert.match(entry, /import \{ createClient \} from '@supabase\/supabase-js'/);
  assert.match(build, /supabase-client\.bundle\.js/);
});
