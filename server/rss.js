import Parser from 'rss-parser';

const parser = new Parser({ timeout: 8000 });

const FEEDS = [
  { name: 'BBC World',  url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'Reuters',    url: 'https://feeds.reuters.com/reuters/worldNews' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'Guardian',   url: 'https://www.theguardian.com/world/rss' },
];

export async function fetchRSSArticles() {
  const results = await Promise.allSettled(
    FEEDS.map(async feed => {
      const parsed = await parser.parseURL(feed.url);
      return parsed.items.map(item => ({
        title:   item.title?.trim() ?? '',
        snippet: item.contentSnippet?.slice(0, 300) ?? item.summary?.slice(0, 300) ?? '',
        source:  feed.name,
        pubDate: item.pubDate ?? item.isoDate ?? new Date().toISOString(),
        url:     item.link ?? '',
      }));
    })
  );

  const seen = new Set();
  const articles = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') {
      console.warn('[RSS] feed failed:', r.reason?.message);
      continue;
    }
    for (const a of r.value) {
      if (!a.title || seen.has(a.title)) continue;
      seen.add(a.title);
      articles.push(a);
    }
  }
  return articles;
}

export function filterArticlesForSituation(articles, searchTerms) {
  const terms = searchTerms.toLowerCase().split(' ').filter(Boolean);
  return articles.filter(a => {
    const text = (a.title + ' ' + a.snippet).toLowerCase();
    return terms.some(t => text.includes(t));
  });
}

export function relativeTime(pubDate) {
  const ms = Date.now() - new Date(pubDate).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1)  return `${Math.floor(ms / 60_000)} мин. назад`;
  if (h < 24) return `${h} ч. назад`;
  return `${Math.floor(h / 24)} дн. назад`;
}
