export async function notify(message) {
  console.log(JSON.stringify({ time: new Date().toISOString(), message }));
  if (!process.env.DISCORD_WEBHOOK_URL) return;
  const response = await fetch(process.env.DISCORD_WEBHOOK_URL, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: message.slice(0, 1900), allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Discord HTTP ${response.status}`);
}
