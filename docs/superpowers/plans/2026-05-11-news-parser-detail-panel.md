# News Parser + Detail Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить платный NewsAPI на RSS + Wikipedia/Wikimedia, добавить эндпоинт `/api/situations/:slug` и NYT-стайл детальную панель, выезжающую справа поверх глобуса.

**Architecture:** Бэкенд разбивается на четыре модуля в `server/` (knownSituations, rss, wikipedia, llm). Фронтенд получает новый `DetailPanel` с семью суб-компонентами; `App.jsx` управляет `panelOpen` state и переключает layout.

**Tech Stack:** Node.js ESM, Express 5, rss-parser, fetch (встроенный), React 19, Vite, CSS variables, Google Fonts (Playfair Display + Lora + Source Sans 3).

---

## Карта файлов

| Действие | Файл |
|---|---|
| Create | `server/knownSituations.js` |
| Create | `server/rss.js` |
| Create | `server/wikipedia.js` |
| Create | `server/llm.js` |
| Modify | `server.js` |
| Modify | `index.html` |
| Modify | `src/index.css` |
| Create | `src/components/detail/NewsFeed.jsx` |
| Create | `src/components/detail/StatsRow.jsx` |
| Create | `src/components/detail/Timeline.jsx` |
| Create | `src/components/detail/HistorySection.jsx` |
| Create | `src/components/detail/RelatedSituations.jsx` |
| Create | `src/components/DetailPanel.jsx` |
| Modify | `src/App.jsx` |
| Modify | `src/components/GlobeView.jsx` |
| Modify | `src/components/Sidebar.jsx` |

---

## Task 1: Установить rss-parser и создать базовый список ситуаций

**Files:**
- Create: `server/knownSituations.js`

- [ ] **Установить пакет**

```bash
npm install rss-parser
```

Ожидание: `+ rss-parser@X.X.X` в выводе.

- [ ] **Создать `server/knownSituations.js`**

```js
// Постоянные ситуации — всегда на глобусе, даже без свежих новостей.
// LLM добавляет к ним актуальные данные из RSS.
// Wikipedia slug — заголовок статьи en.wikipedia.org/wiki/<slug>
export const KNOWN_SITUATIONS = [
  {
    slug: 'ukraine-war',
    name: 'Война в Украине',
    type: 'conflict',
    lat: 48.4, lng: 31.2,
    wikiSlug: 'Russian_invasion_of_Ukraine',
    searchTerms: 'Ukraine war Russia invasion front',
  },
  {
    slug: 'gaza-war',
    name: 'Война в Газе',
    type: 'conflict',
    lat: 31.5, lng: 34.4,
    wikiSlug: 'Gaza_war',
    searchTerms: 'Gaza Israel Hamas war ceasefire',
  },
  {
    slug: 'sudan-war',
    name: 'Война в Судане',
    type: 'conflict',
    lat: 15.5, lng: 32.5,
    wikiSlug: 'Sudanese_civil_war_(2023–present)',
    searchTerms: 'Sudan civil war RSF SAF Khartoum',
  },
  {
    slug: 'myanmar-conflict',
    name: 'Гражданская война в Мьянме',
    type: 'conflict',
    lat: 19.7, lng: 96.1,
    wikiSlug: 'Myanmar_civil_war_(2021–present)',
    searchTerms: 'Myanmar Burma civil war junta',
  },
  {
    slug: 'yemen-war',
    name: 'Война в Йемене',
    type: 'conflict',
    lat: 15.5, lng: 48.5,
    wikiSlug: 'Yemeni_civil_war_(2014–present)',
    searchTerms: 'Yemen Houthi war ceasefire Saudi',
  },
  {
    slug: 'syria-conflict',
    name: 'Война в Сирии',
    type: 'conflict',
    lat: 34.8, lng: 38.9,
    wikiSlug: 'Syrian_civil_war',
    searchTerms: 'Syria war Assad rebel offensive',
  },
  {
    slug: 'sahel-crisis',
    name: 'Нестабильность в Сахеле',
    type: 'conflict',
    lat: 15.0, lng: -2.0,
    wikiSlug: 'Sahel_conflict',
    searchTerms: 'Sahel Mali Burkina Faso Niger coup jihadist',
  },
  {
    slug: 'taiwan-strait',
    name: 'Тайваньский пролив',
    type: 'political',
    lat: 23.5, lng: 121.0,
    wikiSlug: 'Cross-strait_relations',
    searchTerms: 'Taiwan China strait tension military PLA',
  },
  {
    slug: 'north-korea',
    name: 'Северная Корея',
    type: 'political',
    lat: 40.0, lng: 127.0,
    wikiSlug: 'North_Korea',
    searchTerms: 'North Korea missile nuclear Kim Jong-un',
  },
  {
    slug: 'ethiopia-tigray',
    name: 'Конфликт в Эфиопии',
    type: 'conflict',
    lat: 14.0, lng: 38.5,
    wikiSlug: 'Tigray_War',
    searchTerms: 'Ethiopia Tigray war famine conflict Amhara',
  },
];

export const KNOWN_SLUGS = KNOWN_SITUATIONS.map(s => s.slug);
```

- [ ] **Проверить синтаксис**

```bash
node --input-type=module <<'EOF'
import { KNOWN_SITUATIONS } from './server/knownSituations.js';
console.log('OK:', KNOWN_SITUATIONS.length, 'situations');
EOF
```

Ожидание: `OK: 10 situations`

- [ ] **Коммит**

```bash
git add server/knownSituations.js package.json package-lock.json
git commit -m "feat: add known situations base list and install rss-parser"
```

---

## Task 2: RSS-парсер

**Files:**
- Create: `server/rss.js`

- [ ] **Создать `server/rss.js`**

```js
import Parser from 'rss-parser';

const parser = new Parser({ timeout: 8000 });

const FEEDS = [
  { name: 'BBC World',  url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { name: 'Reuters',    url: 'https://feeds.reuters.com/reuters/worldNews' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'Guardian',   url: 'https://www.theguardian.com/world/rss' },
];

// Возвращает массив { title, snippet, source, pubDate, url }
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
  return articles; // до ~400 статей
}

// Фильтрует статьи по ключевым словам ситуации
export function filterArticlesForSituation(articles, searchTerms) {
  const terms = searchTerms.toLowerCase().split(' ').filter(Boolean);
  return articles.filter(a => {
    const text = (a.title + ' ' + a.snippet).toLowerCase();
    return terms.some(t => text.includes(t));
  });
}

// Форматирует относительное время для фронта
export function relativeTime(pubDate) {
  const ms = Date.now() - new Date(pubDate).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1)  return `${Math.floor(ms / 60_000)} мин. назад`;
  if (h < 24) return `${h} ч. назад`;
  return `${Math.floor(h / 24)} дн. назад`;
}
```

- [ ] **Проверить, что хотя бы один фид работает**

```bash
node --input-type=module <<'EOF'
import { fetchRSSArticles } from './server/rss.js';
const articles = await fetchRSSArticles();
console.log('Articles fetched:', articles.length);
console.log('First:', articles[0]?.title);
EOF
```

Ожидание: `Articles fetched: 100+` и заголовок первой статьи.

- [ ] **Коммит**

```bash
git add server/rss.js
git commit -m "feat: add RSS parser for BBC, Reuters, Al Jazeera, Guardian"
```

---

## Task 3: Wikipedia + Wikimedia API

**Files:**
- Create: `server/wikipedia.js`

- [ ] **Создать `server/wikipedia.js`**

```js
const WIKI_API = 'https://en.wikipedia.org/api/rest_v1/page/summary';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

// Возвращает { extract, title } из Wikipedia
export async function fetchWikipediaSummary(wikiSlug) {
  try {
    const res = await fetch(`${WIKI_API}/${encodeURIComponent(wikiSlug)}`, {
      headers: { 'User-Agent': 'WorldPulse/1.0 (educational project)' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { extract: data.extract ?? '', title: data.title ?? wikiSlug };
  } catch (err) {
    console.warn('[Wikipedia] failed for', wikiSlug, err.message);
    return null;
  }
}

// Возвращает массив { url, caption, license } из Wikimedia Commons
// Ищет по searchTerm, возвращает maxPhotos свободных фото
export async function fetchWikimediaPhotos(searchTerm, maxPhotos = 3) {
  try {
    const searchUrl = new URL(COMMONS_API);
    searchUrl.searchParams.set('action', 'query');
    searchUrl.searchParams.set('generator', 'search');
    searchUrl.searchParams.set('gsrnamespace', '6'); // File namespace
    searchUrl.searchParams.set('gsrsearch', `${searchTerm} -logo -map -flag`);
    searchUrl.searchParams.set('gsrlimit', String(maxPhotos * 3));
    searchUrl.searchParams.set('prop', 'imageinfo');
    searchUrl.searchParams.set('iiprop', 'url|extmetadata');
    searchUrl.searchParams.set('iiurlwidth', '800');
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('origin', '*');

    const res = await fetch(searchUrl.toString(), {
      headers: { 'User-Agent': 'WorldPulse/1.0 (educational project)' },
    });
    if (!res.ok) return [];

    const data = await res.json();
    const pages = Object.values(data.query?.pages ?? {});

    const photos = [];
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      if (!info?.url) continue;

      const meta = info.extmetadata ?? {};
      const license = meta.LicenseShortName?.value ?? '';
      // Только свободные лицензии
      if (!license.match(/CC|Public Domain|PD/i)) continue;

      const caption = meta.ImageDescription?.value?.replace(/<[^>]+>/g, '').slice(0, 120)
        ?? meta.ObjectName?.value
        ?? '';

      photos.push({ url: info.url, caption, license });
      if (photos.length >= maxPhotos) break;
    }
    return photos;
  } catch (err) {
    console.warn('[Wikimedia] failed for', searchTerm, err.message);
    return [];
  }
}
```

- [ ] **Проверить Wikipedia**

```bash
node --input-type=module <<'EOF'
import { fetchWikipediaSummary } from './server/wikipedia.js';
const result = await fetchWikipediaSummary('Russian_invasion_of_Ukraine');
console.log('Extract length:', result?.extract?.length);
console.log('First 200 chars:', result?.extract?.slice(0, 200));
EOF
```

Ожидание: `Extract length: 500+` и начало текста о войне.

- [ ] **Проверить Wikimedia**

```bash
node --input-type=module <<'EOF'
import { fetchWikimediaPhotos } from './server/wikipedia.js';
const photos = await fetchWikimediaPhotos('Ukraine war 2022', 2);
console.log('Photos:', photos.length);
if (photos[0]) console.log('URL starts with:', photos[0].url.slice(0, 50));
EOF
```

Ожидание: `Photos: 1` или больше, URL начинается с `https://upload.wikimedia.org/`.

- [ ] **Коммит**

```bash
git add server/wikipedia.js
git commit -m "feat: add Wikipedia summary and Wikimedia Commons photo fetcher"
```

---

## Task 4: LLM-модуль — анализ списка и генерация лонгрида

**Files:**
- Create: `server/llm.js`

- [ ] **Создать `server/llm.js`**

```js
import { KNOWN_SLUGS } from './knownSituations.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'google/gemini-2.0-flash-001';

const TYPE_COLORS = {
  conflict:  '#ef4444',
  protest:   '#f59e0b',
  nature:    '#3b82f6',
  economic:  '#14b8a6',
  political: '#8b5cf6',
};

const TYPE_TAGS = {
  conflict:  'конфликт',
  protest:   'протест',
  nature:    'природа',
  economic:  'экономика',
  political: 'политика',
};

async function callLLM(prompt, maxTokens = 6000) {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'X-Title': 'World Pulse',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = json.choices[0].message.content.trim();
  return text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
}

// 3a. Анализ RSS → список ситуаций (вызывается каждые 10 мин)
export async function analyzeWithLLM(articles) {
  const headlines = articles
    .slice(0, 200)
    .map(a => `[${a.source}] ${a.title}. ${a.snippet}`)
    .join('\n');

  const prompt = `You are a senior geopolitical analyst. Today: ${new Date().toISOString().slice(0, 10)}.

TASK: Produce exactly 15 active global situations that matter right now.

Known permanent situations (always include all of them, update with latest news):
${KNOWN_SLUGS.join(', ')}

You may add up to 5 NEW situations from today's news if they are globally significant.

For each situation output a JSON object:
{
  "id": <1–15>,
  "slug": <kebab-case, use existing slug for known situations>,
  "type": <"conflict"|"protest"|"nature"|"economic"|"political">,
  "name": <short name in Russian, max 30 chars>,
  "lat": <latitude>,
  "lng": <longitude>,
  "scale": <0.0–1.0>,
  "duration": <in Russian: "3 года", "6 мес.", "активен">,
  "desc": <one line in Russian, max 70 chars>,
  "summary": <3–4 sentences in Russian — what's happening NOW, why it matters>,
  "effects": [<3 specific consequences in Russian>]
}

Hard rules:
- Exactly 15 items total
- No two items at the same location
- Use the exact known slugs for permanent situations
- Output ONLY the raw JSON array, no markdown

NEWS SIGNALS:
${headlines}`;

  const text = await callLLM(prompt, 6000);
  const parsed = JSON.parse(text);
  return parsed.map((s, i) => ({
    ...s,
    id:    i + 1,
    color: TYPE_COLORS[s.type] ?? '#8b5cf6',
    tag:   TYPE_TAGS[s.type]   ?? 'событие',
  }));
}

// 3b. Генерация детального лонгрида (вызывается по запросу, кеш 24ч)
export async function generateSituationDetail(situation, wikiExtract, recentArticles) {
  const newsBlock = recentArticles
    .slice(0, 20)
    .map(a => `[${a.source}, ${a.pubDate}] ${a.title}. ${a.snippet}`)
    .join('\n');

  const prompt = `You are a senior geopolitical analyst writing for an international news platform.

SITUATION: ${situation.name} (slug: ${situation.slug})
TYPE: ${situation.type}
COORDINATES: ${situation.lat}, ${situation.lng}

WIKIPEDIA SUMMARY:
${wikiExtract ?? 'No Wikipedia data available.'}

RECENT NEWS (last 7 days):
${newsBlock || 'No recent news found.'}

TASK: Generate a detailed longread about this situation in Russian.

Output a JSON object with these exact fields:
{
  "history": <3–5 paragraphs in Russian. Historical roots, key turning points, why it matters globally. Neutral — present different sides' interpretations where they exist. Each paragraph as a string, joined by \\n\\n>,
  "timeline": <array of { "year": string, "title": string (max 60 chars), "desc": string (1–2 sentences), "major": boolean }. Variable length 4–12 items depending on how much history exists. major=true for watershed moments>,
  "stats": <object with 3–4 key metrics, keys and values in Russian. Example: { "Погибших": "~200K", "Беженцев": "6.7M", "Длина фронта": "~1000 км" }>,
  "outlook": <2 paragraphs in Russian about likely scenarios and risk factors>,
  "related": <array of 2–4 slugs from this list that are thematically connected: ${KNOWN_SLUGS.join(', ')}>
}

Rules:
- All text fields in Russian
- history and outlook: full paragraphs, not bullet points  
- timeline: only include events that actually happened (don't invent)
- stats: use real numbers from Wikipedia or news, mark estimates with ~
- Output ONLY the raw JSON object, no markdown fences`;

  const text = await callLLM(prompt, 8000);
  return JSON.parse(text);
}
```

- [ ] **Проверить импорт (без реального LLM-вызова)**

```bash
node --input-type=module <<'EOF'
import { analyzeWithLLM, generateSituationDetail } from './server/llm.js';
console.log('analyzeWithLLM:', typeof analyzeWithLLM);
console.log('generateSituationDetail:', typeof generateSituationDetail);
EOF
```

Ожидание: `analyzeWithLLM: function` и `generateSituationDetail: function`.

- [ ] **Коммит**

```bash
git add server/llm.js
git commit -m "feat: add LLM module with situation list analysis and longread generation"
```

---

## Task 5: Обновить server.js — новые эндпоинты и RSS вместо NewsAPI

**Files:**
- Modify: `server.js`

- [ ] **Заменить содержимое `server.js`**

```js
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

// ── Cache ──────────────────────────────────────────────────────────
const LIST_TTL   = 10 * 60 * 1000; // 10 мин — список ситуаций
const DETAIL_TTL = 24 * 60 * 60 * 1000; // 24ч — лонгрид

let listCache = { data: null, fetchedAt: 0 };
const detailCache = new Map(); // slug → { data, fetchedAt }

// ── GET /api/situations ────────────────────────────────────────────
app.get('/api/situations', async (req, res) => {
  try {
    const now = Date.now();
    if (listCache.data && now - listCache.fetchedAt < LIST_TTL) {
      return res.json({ situations: listCache.data, cached: true, fetchedAt: listCache.fetchedAt });
    }

    const articles = await fetchRSSArticles();
    const situations = await analyzeWithLLM(articles);

    // Гарантируем наличие всех known situations
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

// ── GET /api/situations/:slug ──────────────────────────────────────
app.get('/api/situations/:slug', async (req, res) => {
  const { slug } = req.params;
  const now = Date.now();

  // Проверяем кеш
  const cached = detailCache.get(slug);
  if (cached && now - cached.fetchedAt < DETAIL_TTL) {
    return res.json({ ...cached.data, cached: true });
  }

  // Находим ситуацию (в списке или в known)
  const listSit = listCache.data?.find(s => s.slug === slug);
  const knownSit = KNOWN_SITUATIONS.find(s => s.slug === slug);
  const situation = listSit ?? knownSit;

  if (!situation) return res.status(404).json({ error: 'Situation not found' });

  try {
    // Параллельно: Wikipedia + Wikimedia + RSS для этой ситуации
    const wikiSlug = knownSit?.wikiSlug;
    const searchTerms = knownSit?.searchTerms ?? situation.name;

    const [wikiData, photos, allArticles] = await Promise.all([
      wikiSlug ? fetchWikipediaSummary(wikiSlug) : Promise.resolve(null),
      fetchWikimediaPhotos(searchTerms, 3),
      fetchRSSArticles(),
    ]);

    const recentArticles = filterArticlesForSituation(allArticles, searchTerms)
      .slice(0, 30);

    // LLM генерирует историю, таймлайн, статистику, перспективы
    const detail = await generateSituationDetail(situation, wikiData?.extract, recentArticles);

    // Форматируем новости для фронта
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

// ── POST /api/situations/refresh ───────────────────────────────────
app.post('/api/situations/refresh', (req, res) => {
  listCache = { data: null, fetchedAt: 0 };
  detailCache.clear();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`World Pulse server → http://localhost:${PORT}`);
});
```

- [ ] **Запустить сервер и проверить список**

```bash
npm run server &
sleep 3
curl -s http://localhost:3001/api/situations | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
console.log('situations:', d.situations?.length);
console.log('first slug:', d.situations?.[0]?.slug);
"
```

Ожидание: `situations: 15`, и slug первой ситуации.

- [ ] **Проверить детальный эндпоинт (займёт 10–20 сек из-за LLM)**

```bash
curl -s http://localhost:3001/api/situations/ukraine-war | node -e "
const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
console.log('news items:', d.news?.length);
console.log('timeline items:', d.timeline?.length);
console.log('photos:', d.photos?.length);
console.log('has history:', d.history?.length > 100);
"
```

Ожидание: `news items: 1+`, `timeline items: 4+`, `has history: true`.

- [ ] **Остановить фоновый сервер, коммит**

```bash
kill %1 2>/dev/null || true
git add server.js
git commit -m "feat: replace NewsAPI with RSS parser, add /api/situations/:slug endpoint"
```

---

## Task 6: Google Fonts + CSS-токены и базовые стили панели

**Files:**
- Modify: `index.html`
- Modify: `src/index.css`

- [ ] **Добавить Google Fonts в `index.html`**

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>World Pulse</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&family=Lora:ital,wght@0,400;0,500;1,400&family=Source+Sans+3:wght@300;400;600&display=swap" rel="stylesheet">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Добавить CSS-переменные и стили панели в начало `src/index.css`**

Вставить в самое начало файла (перед существующими стилями):

```css
/* ── Design tokens ─────────────────────────────── */
:root {
  --dp-bg:      #181818;
  --dp-mid:     #202020;
  --dp-light:   #282828;
  --dp-border:  #303030;
  --dp-border2: #252525;
  --dp-text-1:  #e2dbd0;
  --dp-text-2:  #9a9490;
  --dp-text-3:  #5e5a56;
  --dp-text-4:  #3a3632;
  --dp-gold:    #b8903a;
  --dp-gold-d:  #6a5222;
}

/* ── App layout when panel is open ─────────────── */
.app.panel-open .globe-area {
  width: 36%;
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.app.panel-open .sidebar {
  display: none;
}
.globe-area {
  width: 100%;
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

/* ── Detail panel shell ─────────────────────────── */
.detail-panel {
  position: fixed;
  top: 0; right: 0;
  width: 64%;
  height: 100vh;
  background: var(--dp-bg);
  border-left: 1px solid var(--dp-border);
  overflow-y: auto;
  transform: translateX(100%);
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 50;
  scrollbar-width: thin;
  scrollbar-color: #2a2a2a transparent;
}
.detail-panel.open {
  transform: translateX(0);
}
.detail-panel::-webkit-scrollbar { width: 3px; }
.detail-panel::-webkit-scrollbar-thumb { background: #2a2a2a; }
```

- [ ] **Коммит**

```bash
git add index.html src/index.css
git commit -m "style: add Google Fonts and detail panel CSS tokens"
```

---

## Task 7: Суб-компоненты детальной панели

**Files:**
- Create: `src/components/detail/NewsFeed.jsx`
- Create: `src/components/detail/StatsRow.jsx`
- Create: `src/components/detail/Timeline.jsx`
- Create: `src/components/detail/HistorySection.jsx`
- Create: `src/components/detail/RelatedSituations.jsx`

- [ ] **Создать `src/components/detail/NewsFeed.jsx`**

```jsx
export default function NewsFeed({ news }) {
  if (!news?.length) return null;
  return (
    <div className="dp-news-feed">
      {news.map((item, i) => (
        <div key={i} className="dp-news-item">
          <span className="dp-news-time">{item.time}</span>
          <div className="dp-news-body">
            <p className="dp-news-text">{item.text}</p>
            <span className="dp-news-src">{item.source}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Создать `src/components/detail/StatsRow.jsx`**

```jsx
export default function StatsRow({ stats }) {
  if (!stats) return null;
  const entries = Object.entries(stats);
  if (!entries.length) return null;
  return (
    <div className="dp-stats" style={{ gridTemplateColumns: `repeat(${entries.length}, 1fr)` }}>
      {entries.map(([label, value]) => (
        <div key={label} className="dp-stat">
          <span className="dp-stat-n">{value}</span>
          <span className="dp-stat-l">{label}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Создать `src/components/detail/Timeline.jsx`**

```jsx
export default function Timeline({ timeline }) {
  if (!timeline?.length) return null;
  return (
    <div className="dp-timeline">
      {timeline.map((item, i) => (
        <div key={i} className={`dp-tl-item${i === timeline.length - 1 ? ' last' : ''}`}>
          <span className="dp-tl-year">{item.year}</span>
          <div className="dp-tl-dot-wrap">
            <div className={`dp-tl-dot${item.major ? ' major' : ''}`} />
          </div>
          <div className="dp-tl-content">
            <div className="dp-tl-title">{item.title}</div>
            <div className="dp-tl-desc">{item.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Создать `src/components/detail/HistorySection.jsx`**

```jsx
export default function HistorySection({ history }) {
  if (!history) return null;
  const paragraphs = history.split('\n\n').filter(Boolean);
  return (
    <div className="dp-history">
      {paragraphs.map((p, i) => (
        <p key={i} className={`dp-body-p${i === 0 ? ' first' : ''}`}>{p}</p>
      ))}
    </div>
  );
}
```

- [ ] **Создать `src/components/detail/RelatedSituations.jsx`**

```jsx
export default function RelatedSituations({ related, allSituations, onSelect }) {
  if (!related?.length || !allSituations?.length) return null;
  const items = related
    .map(slug => allSituations.find(s => s.slug === slug))
    .filter(Boolean)
    .slice(0, 4);
  if (!items.length) return null;
  return (
    <div className="dp-related">
      {items.map(s => (
        <button key={s.slug} className="dp-rel-card" onClick={() => onSelect(s)}>
          <div className="dp-rel-type">{s.tag}</div>
          <div className="dp-rel-name">{s.name}</div>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Добавить CSS для суб-компонентов в `src/index.css`** (дописать в конец файла)

```css
/* ── Detail sub-components ─────────────────────── */

/* News feed */
.dp-news-feed { margin-bottom: 28px; }
.dp-news-item { padding: 12px 0; border-bottom: 1px solid var(--dp-border2); display: flex; gap: 16px; }
.dp-news-item:first-child { border-top: 1px solid var(--dp-border2); }
.dp-news-time { font-family: 'Source Sans 3', sans-serif; font-size: 10px; font-weight: 300; color: var(--dp-text-3); min-width: 60px; white-space: nowrap; padding-top: 3px; }
.dp-news-body { flex: 1; }
.dp-news-text { font-family: 'Lora', serif; font-size: 13px; line-height: 1.6; color: var(--dp-text-1); margin-bottom: 4px; }
.dp-news-src  { font-family: 'Source Sans 3', sans-serif; font-size: 9px; font-weight: 300; letter-spacing: 1px; text-transform: uppercase; color: var(--dp-text-3); }

/* Stats */
.dp-stats { display: grid; gap: 1px; background: var(--dp-border); border: 1px solid var(--dp-border); margin-bottom: 30px; }
.dp-stat  { background: var(--dp-mid); padding: 14px 12px; text-align: center; }
.dp-stat-n { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 700; color: var(--dp-text-1); display: block; letter-spacing: -.5px; }
.dp-stat-l { font-family: 'Source Sans 3', sans-serif; font-size: 9px; font-weight: 300; letter-spacing: 2px; text-transform: uppercase; color: var(--dp-text-3); display: block; margin-top: 4px; }

/* Timeline */
.dp-timeline { margin: 4px 0 28px; }
.dp-tl-item { display: flex; gap: 16px; padding-bottom: 18px; position: relative; }
.dp-tl-item:not(.last)::after { content: ''; position: absolute; left: 50px; top: 18px; bottom: 0; width: 1px; background: var(--dp-border); }
.dp-tl-year { font-family: 'Playfair Display', serif; font-size: 13px; font-weight: 700; color: var(--dp-text-3); min-width: 44px; text-align: right; padding-top: 1px; }
.dp-tl-dot-wrap { display: flex; align-items: flex-start; padding-top: 4px; position: relative; z-index: 1; }
.dp-tl-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--dp-light); border: 1px solid var(--dp-text-3); flex-shrink: 0; }
.dp-tl-dot.major { background: var(--dp-gold-d); border-color: var(--dp-gold); box-shadow: 0 0 6px rgba(184,144,58,.3); }
.dp-tl-content { flex: 1; }
.dp-tl-title { font-family: 'Lora', serif; font-size: 13px; font-weight: 500; color: var(--dp-text-1); margin-bottom: 3px; }
.dp-tl-desc  { font-family: 'Lora', serif; font-size: 12px; line-height: 1.6; color: var(--dp-text-3); }

/* History */
.dp-body-p { font-family: 'Lora', serif; font-size: 14px; line-height: 1.9; color: #a8a09a; margin-bottom: 18px; }
.dp-body-p strong { color: var(--dp-text-1); font-weight: 500; }
.dp-body-p.first::first-letter { font-family: 'Playfair Display', serif; font-size: 52px; font-weight: 900; float: left; line-height: .82; margin: 4px 10px 0 0; color: var(--dp-text-1); }

/* Related */
.dp-related { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.dp-rel-card { background: var(--dp-mid); border: 1px solid var(--dp-border); padding: 12px 14px; cursor: pointer; text-align: left; transition: border-color .15s; }
.dp-rel-card:hover { border-color: var(--dp-text-3); }
.dp-rel-type { font-family: 'Source Sans 3', sans-serif; font-size: 8px; letter-spacing: 2px; text-transform: uppercase; color: var(--dp-text-4); margin-bottom: 5px; }
.dp-rel-name { font-family: 'Playfair Display', serif; font-size: 14px; color: var(--dp-text-2); line-height: 1.3; }

/* Section labels */
.dp-slabel { font-family: 'Source Sans 3', sans-serif; font-size: 9px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; color: var(--dp-text-3); margin-bottom: 14px; display: flex; align-items: center; gap: 12px; }
.dp-slabel::before { content: ''; width: 18px; height: 1px; background: var(--dp-text-3); }
.dp-chapter { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 700; color: var(--dp-text-1); margin: 30px 0 14px; line-height: 1.2; }
.dp-divider { border: none; border-top: 1px solid var(--dp-border); margin: 28px 0; }
```

- [ ] **Коммит**

```bash
git add src/components/detail/ src/index.css
git commit -m "feat: add detail panel sub-components and CSS"
```

---

## Task 8: DetailPanel.jsx — главный компонент панели

**Files:**
- Create: `src/components/DetailPanel.jsx`

- [ ] **Создать `src/components/DetailPanel.jsx`**

```jsx
import { useState, useEffect } from 'react';
import NewsFeed from './detail/NewsFeed';
import StatsRow from './detail/StatsRow';
import Timeline from './detail/Timeline';
import HistorySection from './detail/HistorySection';
import RelatedSituations from './detail/RelatedSituations';

export default function DetailPanel({ situation, situations, onClose, onSelect }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!situation?.slug) return;
    setDetail(null);
    setError(null);
    setLoading(true);

    fetch(`/api/situations/${situation.slug}`)
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then(data => { setDetail(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [situation?.slug]);

  const isOpen = !!situation;
  const data = detail ?? situation; // показываем базовые данные пока грузится детальное

  return (
    <div className={`detail-panel${isOpen ? ' open' : ''}`}>
      {isOpen && (
        <>
          {/* Hero */}
          <div className="dp-hero">
            {detail?.photos?.[0]
              ? <img src={detail.photos[0].url} alt={detail.photos[0].caption} className="dp-hero-img" />
              : <div className="dp-hero-placeholder" />
            }
            <div className="dp-hero-overlay">
              <button className="dp-back-btn" onClick={onClose}>← Все ситуации</button>
            </div>
          </div>

          {/* Article */}
          <div className="dp-wrap">
            <div className="dp-kicker">
              {data.tag} · {data.duration}
              {loading && <span className="dp-loading-badge">обновляется…</span>}
            </div>

            <h1 className="dp-headline">{data.name}</h1>

            <p className="dp-deck">{data.summary}</p>

            <div className="dp-meta">
              <span>Обновлено {new Date(data.fetchedAt ?? Date.now()).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</span>
            </div>

            {error && <p className="dp-error">Не удалось загрузить детали: {error}</p>}

            {detail && (
              <>
                <div className="dp-slabel">Последние события</div>
                <NewsFeed news={detail.news} />

                <StatsRow stats={detail.stats} />

                <div className="dp-chapter">Что происходит сейчас</div>
                <p className="dp-body-p">{data.desc}</p>

                <div className="dp-chapter">История и контекст</div>
                <HistorySection history={detail.history} />

                <div className="dp-chapter">Хронология</div>
                <div className="dp-slabel">Ключевые события</div>
                <Timeline timeline={detail.timeline} />

                <hr className="dp-divider" />

                <div className="dp-chapter">Перспективы</div>
                <HistorySection history={detail.outlook} />

                {detail.related?.length > 0 && (
                  <>
                    <hr className="dp-divider" />
                    <div className="dp-slabel">Связанные ситуации</div>
                    <RelatedSituations
                      related={detail.related}
                      allSituations={situations}
                      onSelect={s => { onClose(); setTimeout(() => onSelect(s), 50); }}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Добавить стили DetailPanel в конец `src/index.css`**

```css
/* ── DetailPanel layout ─────────────────────────── */
.dp-hero { height: 260px; position: relative; overflow: hidden; background: #0a1018; flex-shrink: 0; }
.dp-hero-img { width: 100%; height: 100%; object-fit: cover; opacity: .75; }
.dp-hero-placeholder { width: 100%; height: 100%; background: linear-gradient(135deg, #1a3550 0%, #0d1e30 50%, #060e18 100%); }
.dp-hero-overlay { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,.3) 0%, var(--dp-bg) 100%); display: flex; flex-direction: column; justify-content: flex-end; padding: 16px 20px; }
.dp-back-btn { font-family: 'Source Sans 3', sans-serif; font-size: 11px; font-weight: 300; letter-spacing: 2px; text-transform: uppercase; color: var(--dp-text-3); background: none; border: none; cursor: pointer; padding: 0; align-self: flex-start; }
.dp-back-btn:hover { color: var(--dp-text-2); }

.dp-wrap { padding: 0 36px 80px; }

.dp-kicker { font-family: 'Source Sans 3', sans-serif; font-size: 9px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; color: var(--dp-gold-d); margin: 20px 0 14px; display: flex; align-items: center; gap: 10px; }
.dp-kicker::after { content: ''; flex: 1; height: 1px; background: var(--dp-border2); }
.dp-loading-badge { font-size: 9px; letter-spacing: 1px; color: var(--dp-text-3); font-weight: 300; animation: dp-pulse 1.5s ease-in-out infinite; }
@keyframes dp-pulse { 0%, 100% { opacity: .4; } 50% { opacity: 1; } }

.dp-headline { font-family: 'Playfair Display', serif; font-size: 38px; font-weight: 900; line-height: 1.05; color: var(--dp-text-1); margin-bottom: 16px; letter-spacing: -.5px; }
.dp-deck { font-family: 'Lora', serif; font-size: 15px; font-style: italic; line-height: 1.65; color: var(--dp-text-2); margin-bottom: 18px; padding-bottom: 18px; border-bottom: 1px solid var(--dp-border); }
.dp-meta { font-family: 'Source Sans 3', sans-serif; font-size: 10px; font-weight: 300; letter-spacing: 1.5px; text-transform: uppercase; color: var(--dp-text-3); margin-bottom: 28px; }
.dp-error { font-family: 'Source Sans 3', sans-serif; font-size: 12px; color: #ef4444; margin-bottom: 16px; }
```

- [ ] **Коммит**

```bash
git add src/components/DetailPanel.jsx src/index.css
git commit -m "feat: add DetailPanel with hero, news, history, timeline, related sections"
```

---

## Task 9: Обновить App.jsx — state панели и layout

**Files:**
- Modify: `src/App.jsx`

- [ ] **Заменить содержимое `src/App.jsx`**

```jsx
import { useState, useEffect, useCallback } from 'react';
import GlobeView from './components/GlobeView';
import Sidebar from './components/Sidebar';
import DetailPanel from './components/DetailPanel';

const POLL_INTERVAL = 10 * 60 * 1000;

export default function App() {
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [clock, setClock] = useState('');
  const [situations, setSituations] = useState([]);
  const [status, setStatus] = useState('loading');
  const [fetchedAt, setFetchedAt] = useState(null);

  useEffect(() => {
    const tick = () => {
      const n = new Date();
      const h = String(n.getUTCHours()).padStart(2, '0');
      const m = String(n.getUTCMinutes()).padStart(2, '0');
      const s = String(n.getUTCSeconds()).padStart(2, '0');
      setClock(`${h}:${m}:${s} UTC`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const loadSituations = useCallback(async () => {
    try {
      setStatus('loading');
      const res = await fetch('/api/situations');
      if (!res.ok) throw new Error(await res.text());
      const { situations: data, fetchedAt: ts } = await res.json();
      setSituations(data);
      setFetchedAt(new Date(ts));
      setStatus('ok');
    } catch (err) {
      console.error('Failed to load situations:', err);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    loadSituations();
    const id = setInterval(loadSituations, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [loadSituations]);

  const handleRefresh = async () => {
    await fetch('/api/situations/refresh', { method: 'POST' });
    loadSituations();
  };

  const handleSelect = (sit) => {
    setSelected(sit);
    setPanelOpen(!!sit);
  };

  const handleClosePanel = () => {
    setPanelOpen(false);
    setSelected(null);
  };

  return (
    <div className={`app${panelOpen ? ' panel-open' : ''}`}>
      <header>
        <div className="logo">
          <div className="logo-pulse" />
          World Pulse
        </div>
        <div className="header-right">
          {status === 'loading' && (
            <div className="live-badge" style={{ opacity: 0.6 }}>
              <div className="live-dot" style={{ animationPlayState: 'running' }} />
              загрузка…
            </div>
          )}
          {status === 'ok' && (
            <div className="live-badge">
              <div className="live-dot" />
              live
            </div>
          )}
          {status === 'error' && (
            <div className="live-badge" style={{ color: '#ef4444' }}>ошибка</div>
          )}
          <button className="refresh-btn" onClick={handleRefresh} title="Обновить данные">↻</button>
          <div className="clock">{clock}</div>
        </div>
      </header>

      <div className="globe-area">
        <GlobeView
          situations={situations}
          filter={filter}
          selected={selected}
          onSelect={handleSelect}
          compact={panelOpen}
        />
      </div>

      <Sidebar
        situations={situations}
        filter={filter}
        setFilter={setFilter}
        selected={selected}
        onSelect={handleSelect}
        fetchedAt={fetchedAt}
      />

      <DetailPanel
        situation={selected}
        situations={situations}
        onClose={handleClosePanel}
        onSelect={handleSelect}
      />

      <div className="legend">
        {[
          { color: '#ef4444', label: 'вооружённый конфликт' },
          { color: '#f59e0b', label: 'протест / переворот' },
          { color: '#3b82f6', label: 'природная катастрофа' },
          { color: '#14b8a6', label: 'экономический кризис' },
          { color: '#8b5cf6', label: 'политический кризис' },
        ].map(({ color, label }) => (
          <div key={label} className="leg-row">
            <div className="leg-dot" style={{ background: color }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Коммит**

```bash
git add src/App.jsx
git commit -m "feat: add panelOpen state and DetailPanel integration to App"
```

---

## Task 10: Обновить GlobeView.jsx и Sidebar.jsx

**Files:**
- Modify: `src/components/GlobeView.jsx`
- Modify: `src/components/Sidebar.jsx`

- [ ] **Добавить `compact` prop в GlobeView** — глобус перерисовывается при изменении размера через `ResizeObserver`, поэтому достаточно только CSS. Добавить одну строку в JSX:

В `src/components/GlobeView.jsx` найти строку:
```jsx
return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
```
Заменить на:
```jsx
return (
  <div
    ref={mountRef}
    style={{ width: '100%', height: '100%', transition: 'width 0.4s ease' }}
  />
);
```

Пропс `compact` принимать в сигнатуре, но не использовать — ResizeObserver в `useEffect` уже реагирует на изменение размера контейнера:

```jsx
export default function GlobeView({ situations, filter, onSelect, selected, compact }) {
```

- [ ] **Sidebar уже скрывается через CSS** (`.panel-open .sidebar { display: none }`), изменений в JSX не требуется. Проверить что класс `sidebar` есть на корневом элементе `Sidebar.jsx`:

Убедиться что первая строка `return` в Sidebar.jsx выглядит так:
```jsx
return (
  <aside className="sidebar">
```
Если да — ничего менять не нужно.

- [ ] **Коммит**

```bash
git add src/components/GlobeView.jsx
git commit -m "style: pass compact prop to GlobeView for panel layout"
```

---

## Task 11: Интеграционное тестирование

- [ ] **Запустить бэкенд**

```bash
npm run server
```

Ожидание: `World Pulse server → http://localhost:3001`

- [ ] **Запустить фронтенд**

```bash
npm run dev
```

Ожидание: `Local: http://localhost:5173`

- [ ] **Проверить в браузере**

1. Открыть `http://localhost:5173`
2. Глобус вращается, через 10–30 сек появляются точки
3. Кликнуть на точку → сайдбар исчезает, глобус сжимается влево (36%), панель выезжает справа
4. В панели виден заголовок и базовые данные сразу, затем через 10–20 сек догружается детальный контент (новости, таймлайн, история)
5. Кнопка «← Все ситуации» закрывает панель, глобус возвращается на полную ширину
6. Кликнуть на связанную ситуацию в конце панели → открывается другая ситуация

- [ ] **Проверить кеш детального эндпоинта**

```bash
# Первый запрос — медленный (LLM)
time curl -s http://localhost:3001/api/situations/ukraine-war | node -e \
  "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('cached:',d.cached)"

# Второй запрос — быстрый (из кеша)
time curl -s http://localhost:3001/api/situations/ukraine-war | node -e \
  "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('cached:',d.cached)"
```

Ожидание: первый `cached: false` (~10с), второй `cached: true` (<0.1с).

- [ ] **Финальный коммит**

```bash
git add -A
git commit -m "feat: complete news parser and detail panel — RSS + Wikipedia + NYT-style UI"
git push origin main
```
