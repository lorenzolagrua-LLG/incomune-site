// node --test scripts/scarica.test.mjs
// Pagina /scarica/ (destinazione dei QR): link store, copy, esclusione dagli
// Universal Links e riconoscimento del telefono che mette in evidenza lo store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const html = readFileSync(root + 'scarica/index.html', 'utf8');
const aasa = readFileSync(root + '.well-known/apple-app-site-association', 'utf8');

function loadStoreFor({ ua = '', platform = '', touch = 0 } = {}) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const src = scripts.find((s) => s.includes('/* storeFor */'));
  assert.ok(src, 'script inline con /* storeFor */ assente');
  const added = [];
  const document = { documentElement: { classList: { add: (c) => added.push(c) } } };
  const navigator = { userAgent: ua, platform, maxTouchPoints: touch };
  const storeFor = new Function('document', 'navigator', src + '\nreturn storeFor;')(document, navigator);
  return { storeFor, added };
}

test('link ai due store', () => {
  assert.ok(html.includes('href="https://apps.apple.com/app/id6761307454"'));
  assert.ok(html.includes('href="https://play.google.com/store/apps/details?id=app.incomune"'));
  assert.match(html, /data-store="ios"/);
  assert.match(html, /data-store="android"/);
});

test('ordine DOM: ogni «Hai un...?» subito prima del suo pulsante (lettori di schermo)', () => {
  // Solo nel <body>: gli stessi attributi compaiono anche nei selettori CSS del <head>.
  const body = html.slice(html.indexOf('<body'));
  const at = (re) => body.search(re);
  const order = [
    at(/class="alt-hint" data-for="ios"/),
    at(/data-store="ios"/),
    at(/class="alt-hint" data-for="android"/),
    at(/data-store="android"/),
  ];
  assert.ok(order.every((i) => i >= 0), 'elemento mancante');
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test('copy: niente em dash', () => {
  assert.ok(!html.includes('—'));
});

test('mai Universal Link: si apre sempre nel browser', () => {
  assert.ok(!aasa.includes('/scarica'));
});

test('canonical e pagina indicizzabile', () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/incomune\.app\/scarica\/">/);
  assert.ok(!/noindex/.test(html));
});

test('storeFor: iPhone, iPad recente, Mac, Android in-app, Windows', () => {
  const { storeFor } = loadStoreFor();
  assert.equal(storeFor('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone', 5), 'ios');
  assert.equal(storeFor('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5), 'ios');
  assert.equal(storeFor('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0), null);
  assert.equal(storeFor('Mozilla/5.0 (Linux; Android 14; M2101K6G) [FBAN/FB4A;FBAV/480.0]', 'Linux armv8l', 5), 'android');
  assert.equal(storeFor('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32', 0), null);
});

test('classe su <html> solo quando il telefono si riconosce', () => {
  assert.deepEqual(loadStoreFor({ ua: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Linux armv8l', touch: 5 }).added, ['is-android']);
  assert.deepEqual(loadStoreFor({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', touch: 5 }).added, ['is-ios']);
  assert.deepEqual(loadStoreFor({ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', touch: 0 }).added, []);
});
