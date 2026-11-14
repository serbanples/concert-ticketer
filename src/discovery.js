import { load } from 'cheerio';

export function parseTour(html, city, sourceUrl) {
  const $ = load(html);
  const rows = $('.tour-container').filter((_, el) =>
    $(el).find('.place').text().trim().toLowerCase().startsWith(`${city.toLowerCase()},`));
  if (rows.length !== 1) throw new Error('Expected one matching city row; tour markup needs review');
  const row = rows.first();
  const link = row.find('.link-table a').first();
  const href = link.attr('href')?.trim();
  let ticketUrl = null;
  if (href && !href.startsWith('#')) {
    const candidate = new URL(href, sourceUrl);
    if (candidate.protocol === 'https:' && /buy tickets|comprar|jegy/i.test(link.text()) &&
        !row.hasClass('sold-out')) ticketUrl = candidate.href;
  }
  return {
    status: ticketUrl ? 'ticket_link_published' : 'not_on_sale',
    date: row.find('.date').text().replace(/\s+/g, ' ').trim(),
    venue: row.find('.venue').text().trim(), ticketUrl
  };
}

export async function discover(config, fetcher = fetch) {
  const response = await fetcher(config.discoveryUrl, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Tour HTTP ${response.status}`);
  return parseTour(await response.text(), config.city, config.discoveryUrl);
}
