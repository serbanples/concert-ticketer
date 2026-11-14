import { setTimeout as delay } from 'node:timers/promises';
import { loadConfig } from './config.js';
import { openStore } from './state.js';
import { discover } from './discovery.js';
import { notify } from './notify.js';
import { tick } from './runner.js';
import { JsonApiSeller } from './adapters/json-api.js';

const config = await loadConfig(process.env.CONFIG_PATH || 'config/local.json');
const store = await openStore(config.stateDirectory);
const abort = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => abort.abort());
const seller = config.seller ? new JsonApiSeller(config.seller) : null;
let failures = 0;
try {
  do {
    try {
      const status = await tick({ config, store, discover, seller, notify });
      console.log(JSON.stringify({ time: new Date().toISOString(), status }));
      failures = 0;
      if (['purchased', 'stopped'].includes(status)) break;
    } catch {
      failures++;
      // Avoid printing HTTP bodies, tokens, customer details or webhook URLs.
      console.error(JSON.stringify({ time: new Date().toISOString(), error: 'Check failed; inspect configuration, connectivity or seller integration', failures }));
      if (failures === 1) {
        try { await notify('Ticket monitor check failed. It will retry with backoff; check the running app.'); }
        catch { console.error('Alert delivery also failed'); }
      }
      if (process.argv.includes('--once')) process.exitCode = 1;
    }
    if (process.argv.includes('--once') || abort.signal.aborted) break;
    const seconds = Math.min(config.maxBackoffSeconds, config.intervalSeconds * 2 ** Math.min(failures, 10));
    await delay((seconds + Math.random() * seconds * 0.1) * 1000, null, { signal: abort.signal }).catch(e => { if (e.name !== 'AbortError') throw e; });
  } while (!abort.signal.aborted);
} finally { await store.close(); }
