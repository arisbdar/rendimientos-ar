// Fetches latest finance news from Google News RSS
const https = require('https');
const { URL } = require('url');

const FEEDS = [
  'https://news.google.com/rss/search?q=when:3h+mercados+OR+dolar+OR+bolsa+OR+wall+street+OR+bitcoin+OR+acciones+OR+bonos&hl=es-419&gl=AR&ceid=AR:es-419',
];

function fetchFeed(feedUrl) {
  return new Promise((resolve) => {
    const parsed = new URL(feedUrl);
    const req = https.get({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000,
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve(data));
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

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

    // Clean CDATA and HTML entities
    const cleanTitle = title
      .replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/ - [^-]+$/, ''); // Remove " - Source" at end

    if (cleanTitle) {
      items.push({
        title: cleanTitle.trim(),
        source: source.replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
        link: link.trim(),
        date: pubDate.trim(),
      });
    }
  }
  return items;
}

exports.handler = async function(event) {
  try {
    const xml = await fetchFeed(FEEDS[0]);
    if (!xml) throw new Error('Empty response');

    const items = parseRSS(xml).slice(0, 20);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=120', // 2 min cache
      },
      body: JSON.stringify({ data: items, updated: new Date().toISOString() }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
