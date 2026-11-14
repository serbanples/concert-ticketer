// Contract for an authorized seller integration, NOT a real Hungarian seller API.
// Replace this adapter when the official checkout is published.
export class JsonApiSeller {
  constructor(config, fetcher = fetch) { this.config = config; this.fetcher = fetcher; }
  async request(path, body, key) {
    const response = await this.fetcher(new URL(path, this.config.baseUrl), {
      method: body ? 'POST' : 'GET', redirect: 'error',
      headers: {
        accept: 'application/json',
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(process.env.SELLER_API_TOKEN ? { authorization: `Bearer ${process.env.SELLER_API_TOKEN}` } : {}),
        ...(key ? { 'idempotency-key': key } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`Seller HTTP ${response.status}`);
    return response.json();
  }
  quote(purchase) {
    return this.request('quote', {
      eventId: this.config.eventId, quantity: purchase.quantity, category: purchase.category
    });
  }
  purchase(quote, purchase, key) {
    return this.request('orders', {
      quoteId: quote.id, eventId: this.config.eventId,
      quantity: purchase.quantity, category: purchase.category,
      currency: purchase.currency, maxTotalMinor: purchase.maxTotalMinor,
      customer: purchase.customer, paymentMethodRef: purchase.paymentMethodRef
    }, key);
  }
  reconcile(key) { return this.request(`orders/by-idempotency-key/${encodeURIComponent(key)}`); }
}
