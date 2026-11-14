// Entirely local demonstration. No network requests or payments.
import { tick } from '../src/runner.js';
let state = {};
const context = {
  config: { eventId: 'demo', dryRun: false, seller: { eventId: 'demo', ticketHost: 'tickets.example' }, purchase: { quantity: 2, category: 'standing', currency: 'HUF', maxTotalMinor: 10000 } },
  store: { read: async () => state, write: async value => { state = value; } },
  discover: async () => ({ ticketUrl: 'https://tickets.example/demo', status: 'ticket_link_published', date: 'demo', venue: 'demo' }),
  notify: async message => console.log(message),
  seller: {
    quote: async () => ({ id: 'demo-quote', available: true, eventId: 'demo', quantity: 2, category: 'standing', currency: 'HUF', totalMinor: 9000, expiresAt: new Date(Date.now() + 60000).toISOString() }),
    purchase: async () => ({ status: 'confirmed', orderId: 'DEMO-NOT-A-REAL-ORDER' })
  }
};
console.log(await tick(context));
console.log('Second run:', await tick(context));
