# Concert Ticketer

Node.js 22+ monitor for Maluma's Budapest tour listing, with Discord notifications and a configurable automatic-purchase runner.

**Current integration status:** the official tour page currently has placeholders for Budapest's date, venue and ticket link (checked November 15, 2026). Discovery is implemented against that page's actual HTML. No Hungarian ticket seller is identified yet. The purchase engine is implemented and tested with simulated sellers, but **cannot buy real tickets until an actual seller adapter is implemented and verified**. A published ticket link is a discovery signal, not proof of inventory.

## Start monitoring

```sh
npm ci
cp config/example.json config/local.json
cp .env.example .env
# Set DISCORD_WEBHOOK_URL in .env to your private Discord webhook.
npm run check
npm start
```

The first check runs immediately. Subsequent checks run every five minutes plus up to 10% jitter, sequentially without overlap. Failures use capped exponential backoff. Ctrl+C/SIGTERM stops cleanly after the active check. `npm run check` runs once; it uses the same purchase settings as `npm start`. Leave `dryRun: true` when testing. Keep the process running on your own machine/VPS; committing this repository does not start a hosted monitor.

Defaults: two tickets, HUF, Discord via `.env`, no configured category or spending allowance. Discord is optional; without a webhook, messages go to the console. Notifications occur on listing changes, matching dry-run offers, purchases, ambiguous responses and check failures. Customer/payment data is not included in alerts.

## Purchase configuration

All seller-required customer fields can be placed in `purchase.customer`; their exact names depend on the seller. Use `config/local.json` (ignored by Git), not the tracked example. Do not paste card numbers, CVV, passwords or webhook tokens into the public repository. Use a seller-supported stored/tokenized payment reference. A seller adapter may require a locally authenticated session instead.

| Field | Meaning |
| --- | --- |
| `quantity` | Exact number of tickets; default 2 |
| `category` | Exact seller category identifier; no automatic category substitution |
| `currency` | Exact expected currency |
| `maxTotalMinor` | Maximum total for all tickets **including all seller fees**, in the currency's minor units; 0 disables live buying |
| `customer` | Configurable seller-required billing/contact/attendee data |
| `paymentMethodRef` | Seller-supported payment reference; never raw card details |
| `dryRun` | True checks quotes without submitting purchases |

The engine rejects quotes with mismatched event, quantity, category, currency, invalid/expired quote or total over budget. Seller integration must ensure the final charge uses the quoted total or enforces the supplied limit, and must honor idempotency keys. Adjacent seating, accessibility, attendee fields, presale codes and ticket limits must be implemented in the seller adapter if required. Queues, CAPTCHA, login and 3-D Secure may require human interaction; no bypass is included.

## Seller adapter

`src/adapters/json-api.js` is an integration contract for a seller-authorized API, **not a discovered API from a real ticket seller**. Do not point it at an arbitrary ticket website and expect checkout to work. Replace it with the actual seller's supported checkout/API integration after the Budapest ticket link is published.

Configure `seller` only for a verified integration:

```json
{
  "baseUrl": "https://your-authorized-integration.example/api/",
  "eventId": "seller-event-id",
  "ticketHost": "official-ticket-host.example"
}
```

The generic JSON adapter uses these relative paths (base URL should end in `/`):

- `POST quote`: accepts eventId, quantity, category. Returns `{ id, available, eventId, quantity, category, currency, totalMinor, expiresAt }`. Total includes fees; expiry is an ISO timestamp.
- `POST orders`: receives quoteId, eventId, quantity, category, currency, maxTotalMinor, customer and paymentMethodRef; header `Idempotency-Key` must be honored. Returns `{ status: "confirmed", orderId }`, or a nonconfirmed status requiring attention.
- `GET orders/by-idempotency-key/:key`: reconciles interrupted submissions. Returns the same order status. A 404/network failure does not authorize resubmission.
- Optional API authentication: `SELLER_API_TOKEN` environment variable.

Only a discovery link whose hostname exactly matches `seller.ticketHost` can trigger quotation. Discovered links are never automatically trusted as API endpoints. There is no seller-host auto-enrollment.

## Duplicate protection and recovery

A durable purchase attempt and unique key are written before submission. On restart/timeout the app reconciles that attempt rather than submitting again. Pending/unknown/nonconfirmed results pause purchasing. Confirmed orders stop the worker. Notification failures never remove purchase state.

One worker is allowed per state directory. Persist `var/` across restarts/deployments. Do not run workers with separate state directories for the same purchase or delete state to retry. After an abnormal crash, a stale `var/process.lock` may remain: verify no worker is alive before removing only that lock file. For uncertain purchases, inspect seller order history and resolve the original order before manually editing state. State is local; this is not a distributed lock.

## Verification

```sh
npm test
npm run demo
```

Tests cover city-specific HTML parsing, placeholder/sold-out links, quote limits, dry runs, one-order behavior, ambiguous checkout recovery, notification failures and persistent locking. The demo uses no network or real payments. Real checkout validation must be done when the seller is announced.

## Next configuration needed

- Maximum total budget and currency, standing versus seated/category, and whether seats must be adjacent.
- Official seller/event URL once available.
- Discord webhook configured locally; exact buyer/attendee fields and payment session determined by seller.

Official source: https://maluma.online/tour/
