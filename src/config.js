import { readFile } from 'node:fs/promises';

export function validateConfig(c) {
  const positive = n => Number.isSafeInteger(n) && n > 0;
  if (!c.eventId || !c.city || !c.stateDirectory) throw new Error('Missing eventId, city or stateDirectory');
  if (new URL(c.discoveryUrl).protocol !== 'https:') throw new Error('Discovery requires HTTPS');
  if (!positive(c.intervalSeconds) || c.intervalSeconds < 30 ||
      !positive(c.maxBackoffSeconds) || c.maxBackoffSeconds < c.intervalSeconds) throw new Error('Invalid polling intervals (minimum 30 seconds)');
  if (typeof c.dryRun !== 'boolean') throw new Error('dryRun must be boolean');
  const p = c.purchase;
  if (!p || !positive(p.quantity) || !Number.isSafeInteger(p.maxTotalMinor) || p.maxTotalMinor < 0 ||
      !/^[A-Z]{3}$/.test(p.currency)) throw new Error('Invalid purchase configuration');
  if (!c.dryRun && (!c.seller || !positive(p.maxTotalMinor) || !p.category || !p.paymentMethodRef || !p.customer?.email)) {
    throw new Error('Live mode requires seller, budget, category, payment reference and customer email');
  }
  if (c.seller) {
    if (new URL(c.seller.baseUrl).protocol !== 'https:' || !c.seller.eventId || !c.seller.ticketHost) throw new Error('Invalid seller configuration');
  }
  return c;
}

export async function loadConfig(path) {
  return validateConfig(JSON.parse(await readFile(path, 'utf8')));
}
