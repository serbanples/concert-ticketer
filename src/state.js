import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';

export async function openStore(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lockPath = join(directory, 'process.lock');
  const lock = await open(lockPath, 'wx', 0o600);
  await lock.writeFile(String(process.pid));
  const statePath = join(directory, 'state.json');
  return {
    async read() {
      try { return JSON.parse(await readFile(statePath, 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
    },
    async write(state) {
      const temp = `${statePath}.tmp`;
      const handle = await open(temp, 'w', 0o600);
      try { await handle.writeFile(JSON.stringify(state, null, 2)); await handle.sync(); }
      finally { await handle.close(); }
      await rename(temp, statePath);
      const dir = await open(directory, 'r');
      try { await dir.sync(); } finally { await dir.close(); }
    },
    async close() { await lock.close(); await unlink(lockPath); }
  };
}
