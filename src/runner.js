import { randomUUID } from 'node:crypto';

export function validateQuote(q, config) {
  const p = config.purchase;
  if (q.available !== true) return false;
  if (!q.id || q.eventId !== config.seller.eventId || q.quantity !== p.quantity ||
      q.category !== p.category || q.currency !== p.currency ||
      !Number.isSafeInteger(q.totalMinor) || q.totalMinor <= 0 || q.totalMinor > p.maxTotalMinor ||
      !Number.isFinite(Date.parse(q.expiresAt)) || Date.parse(q.expiresAt) <= Date.now()) {
    throw new Error('Quote does not match event, quantity, category, currency, budget or expiry');
  }
  return true;
}

export async function tick({ config, store, discover, seller, notify }) {
  const state = await store.read();
  if (state.eventId && state.eventId !== config.eventId) throw new Error('State belongs to another event; use a separate state directory');
  state.eventId = config.eventId;
  if (state.order?.status === 'confirmed' || state.halted) return 'stopped';
  // An interrupted/ambiguous submission is never retried automatically.
  if (state.attempt) {
    if (!seller) throw new Error('Pending purchase requires original seller adapter');
    const result = await seller.reconcile(state.attempt.key);
    if (result.status === 'confirmed' && result.orderId) {
      state.order = result;
      await store.write(state);
      await notify('Tickets purchased successfully. Check the seller account for your order.');
      return 'purchased';
    }
    state.halted = true;
    await store.write(state);
    await notify('Purchase status is uncertain. Check your seller account before restarting; automatic purchasing is paused.');
    return 'stopped';
  }
  const discovery = await discover(config);
  const signature = JSON.stringify(discovery);
  if (state.lastDiscovery !== signature) {
    await notify(`Maluma Budapest update: ${discovery.status}; date: ${discovery.date}; venue: ${discovery.venue}${discovery.ticketUrl ? `; ${discovery.ticketUrl}` : ''}`);
    state.lastDiscovery = signature;
    await store.write(state);
  }
  if (!discovery.ticketUrl) return 'waiting';
  if (!seller || new URL(discovery.ticketUrl).hostname !== config.seller.ticketHost) {
    return 'needs_seller_integration';
  }
  const quote = await seller.quote(config.purchase);
  if (!validateQuote(quote, config)) return 'waiting';
  if (config.dryRun) {
    if (state.dryRunQuote !== quote.id) {
      await notify('Matching tickets available within budget. Dry run: no purchase submitted.');
      state.dryRunQuote = quote.id;
      await store.write(state);
    }
    return 'dry_run';
  }
  state.attempt = { key: randomUUID(), quoteId: quote.id, at: new Date().toISOString() };
  await store.write(state); // Durable BEFORE any potentially chargeable request.
  let result;
  try { result = await seller.purchase(quote, config.purchase, state.attempt.key); }
  catch { await notify('Checkout response was interrupted. Next check will reconcile the order, without submitting again.'); return 'uncertain'; }
  if (result.status !== 'confirmed' || !result.orderId) {
    state.halted = true;
    await store.write(state);
    await notify('Checkout needs attention (possibly login, payment authentication or queue). Check seller account; purchasing paused.');
    return 'stopped';
  }
  state.order = result;
  await store.write(state);
  await notify('Tickets purchased successfully. Check the seller account for your order.');
  return 'purchased';
}
