import test from 'node:test';
import assert from 'node:assert/strict';
import { JsonApiSeller } from '../src/adapters/json-api.js';

test('seller requests send quote, bounded order and stable idempotency key', async () => {
  const calls = [];
  const seller = new JsonApiSeller({ baseUrl: 'https://seller.example/api/', eventId: 'maluma' }, async (url, options) => {
    calls.push({ url: String(url), ...options });
    return new Response(JSON.stringify({ status: 'confirmed', orderId: 'test' }), { headers: { 'content-type': 'application/json' } });
  });
  const purchase = { quantity: 2, category: 'standing', currency: 'HUF', maxTotalMinor: 10000, customer: { email: 'test@example.com' }, paymentMethodRef: 'token' };
  await seller.quote(purchase);
  await seller.purchase({ id: 'q1' }, purchase, 'attempt-1');
  await seller.reconcile('attempt-1');
  assert.equal(calls[0].url, 'https://seller.example/api/quote');
  assert.equal(calls[1].headers['idempotency-key'], 'attempt-1');
  assert.equal(JSON.parse(calls[1].body).maxTotalMinor, 10000);
  assert.equal(calls[2].url, 'https://seller.example/api/orders/by-idempotency-key/attempt-1');
  assert.equal(calls[2].method, 'GET');
  assert.equal(calls[1].redirect, 'error');
});

test('seller errors are surfaced without response body or token', async () => {
  const seller = new JsonApiSeller({ baseUrl: 'https://seller.example/api/' }, async () => new Response('sensitive details', { status: 429 }));
  await assert.rejects(seller.quote({}), { message: 'Seller HTTP 429' });
});
