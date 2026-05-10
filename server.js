import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';

try {
  const lines = readFileSync('.env', 'utf8').split('\n');
  for (const line of lines) {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] ??= v.join('=').trim();
  }
} catch {}

import { KNOWN_SITUATIONS } from './server/knownSituations.js';
import { fetchRSSArticles, filterArticlesForSituation, relativeTime } from './server/rss.js';
import { fetchWikipediaSummary, fetchWikimediaPhotos } from './server/wikipedia.js';
import { analyzeWithLLM, generateSituationDetail } from './server/llm.js';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;

if (!process.env.OPENROUTER_API_KEY) console.warn('⚠  OPENROUTER_API_KEY not set');

const LIST_TTL   = 10 * 60 * 1000;
const DETAIL_TTL = 24 * 60 * 60 * 1000;

let listCache = { data: null, fetchedAt: 0 };
const detailCache = new Map();

app.get('/api/situations', async (req, res) => {
  try {
    const now = Date.now();
    if (listCache.data && now - listCache.fetchedAt < LIST_TTL) {
      return res.json({ situations: listCache.data, cached: true, fetchedAt: listCache.fetchedAt });
    }

    const articles = await fetchRSSArticles();
    const situations = await analyzeWithLLM(articles);

    const slugsInResult = new Set(situations.map(s => s.slug));
    for (const known of KNOWN_SITUATIONS) {
      if (!slugsInResult.has(known.slug)) {
        situations.push({
          id: situations.length + 1,
          slug: known.slug,
          name: known.name,
          type: known.type,
          lat: known.lat,
          lng: known.lng,
          scale: 0.5,
          duration: 'активен',
          desc: 'Данные обновляются',
          summary: '',
          effects: [],
          color: '#8b5cf6',
          tag: 'событие',
        });
      }
    }

    listCache = { data: situations, fetchedAt: now };
    res.json({ situations, cached: false, fetchedAt: now });
  } catch (err) {
    console.error('[/api/situations]', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/situations/:slug', async (req, res) => {
  const { slug } = req.params;
  const now = Date.now();

  const cached = detailCache.get(slug);
  if (cached && now - cached.fetchedAt < DETAIL_TTL) {
    return res.json({ ...cached.data, cached: true });
  }

  const listSit  = listCache.data?.find(s => s.slug === slug);
  const knownSit = KNOWN_SITUATIONS.find(s => s.slug === slug);
  const situation = listSit ?? knownSit;

  if (!situation) return res.status(404).json({ error: 'Situation not found' });

  try {
    const wikiSlug    = knownSit?.wikiSlug;
    const searchTerms = knownSit?.searchTerms ?? situation.name;

    const [wikiData, photos, allArticles] = await Promise.all([
      wikiSlug ? fetchWikipediaSummary(wikiSlug) : Promise.resolve(null),
      fetchWikimediaPhotos(searchTerms, 3),
      fetchRSSArticles(),
    ]);

    const recentArticles = filterArticlesForSituation(allArticles, searchTerms).slice(0, 30);

    const detail = await generateSituationDetail(situation, wikiData?.extract, recentArticles);

    const news = recentArticles.slice(0, 6).map(a => ({
      time:   relativeTime(a.pubDate),
      text:   a.title + (a.snippet ? '. ' + a.snippet : ''),
      source: a.source,
      url:    a.url,
    }));

    const result = {
      ...situation,
      news,
      photos,
      history:   detail.history,
      timeline:  detail.timeline,
      stats:     detail.stats,
      outlook:   detail.outlook,
      related:   detail.related ?? [],
      fetchedAt: now,
    };

    detailCache.set(slug, { data: result, fetchedAt: now });
    res.json(result);
  } catch (err) {
    console.error(`[/api/situations/${slug}]`, err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/situations/refresh', (req, res) => {
  listCache = { data: null, fetchedAt: 0 };
  detailCache.clear();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`World Pulse server → http://localhost:${PORT}`);
});
