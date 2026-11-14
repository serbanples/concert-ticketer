import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTour } from '../src/discovery.js';
import { tick } from '../src/runner.js';
import { openStore } from '../src/state.js';
import { validateConfig } from '../src/config.js';

const row = (city, href, text = 'BUY TICKETS', cls = '') => `<div class="tour-container ${cls}"><div class="place">${city}, Hungary</div><div class="date">??</div><div class="venue">??</div><div class="link-table"><a href="${href}">${text}</a></div></div>`;
const config = { eventId: 'maluma-budapest-2027', discoveryUrl: 'https://maluma.online/tour/', city: 'Budapest', stateDirectory: 'var', intervalSeconds: 300, maxBackoffSeconds: 3600, dryRun: false, seller: { baseUrl: 'https://tickets.example/api/', eventId: 'seller-event', ticketHost: 'tickets.example' }, purchase: { quantity: 2, category: 'standing', currency: 'HUF', maxTotalMinor: 10000, customer: { email: 'test@example.com' }, paymentMethodRef: 'stored-method' } };
function setup(overrides = {}) {
  let state = {}, purchases = 0;
  const quote = { id: 'quote-1', eventId: 'seller-event', available: true, quantity: 2, category: 'standing', currency: 'HUF', totalMinor: 9000, expiresAt: new Date(Date.now() + 60000).toISOString() };
  const ctx = {
    config: structuredClone(config),
    store: { read: async () => structuredClone(state), write: async value => { state = structuredClone(value); } },
    discover: async () => ({ status: 'ticket_link_published', ticketUrl: 'https://tickets.example/maluma', date: 'TBA', venue: 'TBA' }),
    notify: async () => {},
    seller: { quote: async () => ({ ...quote, ...overrides }), purchase: async () => { purchases++; return { status: 'confirmed', orderId: 'order-1' }; }, reconcile: async () => ({ status: 'pending' }) }
  };
  return { ctx, getState: () => state, count: () => purchases };
}

test('discovery isolates Budapest and ignores placeholder, sold out and unsafe URLs', () => {
  const parse = html => parseTour(html, 'Budapest', config.discoveryUrl);
  assert.equal(parse(row('Vienna', 'https://other.example') + row('Budapest', '#', '???')).ticketUrl, null);
  assert.equal(parse(row('Budapest', 'javascript:alert(1)')).ticketUrl, null);
  assert.equal(parse(row('Budapest', 'https://tickets.example', 'BUY TICKETS', 'sold-out')).ticketUrl, null);
  assert.equal(parse(row('Budapest', 'https://tickets.example')).status, 'ticket_link_published');
  assert.throws(() => parse('<h1>Access denied</h1>'));
  assert.throws(() => parse(row('Budapest', '#') + row('Budapest', '#')));
});

test('live configuration requires concrete purchase inputs', () => {
  assert.equal(validateConfig(config), config);
  assert.throws(() => validateConfig({ ...config, purchase: { ...config.purchase, maxTotalMinor: 0 } }));
});

test('confirmed purchase is persisted and never repeated', async () => {
  const h = setup();
  assert.equal(await tick(h.ctx), 'purchased');
  assert.equal(await tick(h.ctx), 'stopped');
  assert.equal(h.count(), 1);
});

test('dry run and mismatched seller never submit', async () => {
  const h = setup(); h.ctx.config.dryRun = true;
  assert.equal(await tick(h.ctx), 'dry_run'); assert.equal(h.count(), 0);
  h.ctx.config.seller.ticketHost = 'other.example';
  assert.equal(await tick(h.ctx), 'needs_seller_integration'); assert.equal(h.count(), 0);
});

for (const [name, override] of Object.entries({ budget: { totalMinor: 10001 }, event: { eventId: 'other' }, quantity: { quantity: 1 }, category: { category: 'vip' }, currency: { currency: 'EUR' }, price: { totalMinor: -1 }, expired: { expiresAt: '2000-01-01' } })) {
  test(`reject ${name} mismatch before submission`, async () => {
    const h = setup(override);
    await assert.rejects(tick(h.ctx)); assert.equal(h.count(), 0);
  });
}

test('ambiguous response reconciles after restart without resubmission', async () => {
  const h = setup(); let calls = 0;
  h.ctx.seller.purchase = async () => { calls++; assert.ok(h.getState().attempt.key); throw new Error('timeout after charge'); };
  assert.equal(await tick(h.ctx), 'uncertain');
  h.ctx.seller.reconcile = async key => { assert.equal(key, h.getState().attempt.key); return { status: 'confirmed', orderId: 'recovered' }; };
  assert.equal(await tick(h.ctx), 'purchased'); assert.equal(calls, 1);
});

test('pending checkout stops rather than charging again', async () => {
  const h = setup(); h.ctx.seller.purchase = async () => ({ status: 'requires_action' });
  assert.equal(await tick(h.ctx), 'stopped'); assert.equal(h.getState().halted, true);
});

test('notification failure after confirmation cannot duplicate purchase', async () => {
  const h = setup(); let notifications = 0;
  h.ctx.notify = async () => { if (++notifications > 1) throw new Error('Discord down'); };
  await assert.rejects(tick(h.ctx));
  assert.equal(await tick(h.ctx), 'stopped'); assert.equal(h.count(), 1);
});

test('store survives reopening and prevents two local workers', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ticketer-'));
  try {
    const first = await openStore(dir);
    await assert.rejects(openStore(dir), { code: 'EEXIST' });
    await first.write({ attempt: { key: 'persisted' } }); await first.close();
    const second = await openStore(dir);
    assert.equal((await second.read()).attempt.key, 'persisted'); await second.close();
  } finally { await rm(dir, { recursive: true, force: true }); }
});
