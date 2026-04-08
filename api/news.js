// Fetches latest finance news from Google News RSS
const FEEDS = [
  'https://news.google.com/rss/search?q=when:3h+mercados+OR+dolar+OR+bolsa+OR+wall+street+OR+bitcoin+OR+acciones+OR+bonos&hl=es-419&gl=AR&ceid=AR:es-419',
];

function parseRSS(xml) {
  const items = [];
  const regex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const block = match[1];
    const title = (block.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
    const link = (block.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
    const pubDate = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
    const source = (block.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || '';
    const cleanTitle = title
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/ - [^-]+$/, '');
    if (cleanTitle) {
      items.push({
        title: cleanTitle.trim(),
        source: source.replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
        link: link.trim(), date: pubDate.trim(),
      });
    }
  }
  return items;
}

export default async function handler(req, res) {
  try {
    const r = await fetch(FEEDS[0], { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
    const xml = await r.text();
    if (!xml) throw new Error('Empty response');
    const items = parseRSS(xml).slice(0, 20);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=120');
    res.status(200).json({ data: items, updated: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
