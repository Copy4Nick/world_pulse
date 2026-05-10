import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';

// Load .env.example (rename to .env when ready)
try {
  const lines = readFileSync('.env.example', 'utf8').split('\n');
  for (const line of lines) {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] ??= v.join('=').trim();
  }
} catch {}

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const NEWS_API_KEY = process.env.NEWS_API_KEY;

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

// Cache: refresh every 10 minutes
let cache = { data: null, fetchedAt: 0 };
const CACHE_TTL = 10 * 60 * 1000;

async function fetchNewsHeadlines() {
  const queries = [
    'war OR conflict OR ceasefire OR military OR airstrike',
    'protest OR coup OR election OR sanctions OR diplomacy',
    'earthquake OR flood OR hurricane OR disaster OR famine',
    'recession OR inflation OR trade war OR debt crisis OR currency',
  ];

  const sources = 'bbc-news,reuters,associated-press,al-jazeera-english,the-guardian-uk';
  const from = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0];

  const results = await Promise.allSettled(
    queries.map(q => {
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&sources=${sources}&language=en&pageSize=100&sortBy=relevancy&from=${from}&apiKey=${NEWS_API_KEY}`;
      return fetch(url).then(r => r.json());
    })
  );

  const seen = new Set();
  const articles = [];
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value.articles) continue;
    for (const a of r.value.articles) {
      if (!a.title || !a.description || seen.has(a.title)) continue;
      seen.add(a.title);
      articles.push(`[${a.source?.name ?? ''}] ${a.title}. ${a.description}`);
    }
  }

  return articles.slice(0, 200).join('\n');
}

async function analyzeWithLLM(headlines) {
  const prompt = `You are a senior geopolitical analyst. Today's date: ${new Date().toISOString().slice(0, 10)}.

TASK: Produce a briefing of exactly 15 active global situations that matter right now.

You have two sources of knowledge:
1. RECENT NEWS SIGNALS (article titles from the last 48h, attached below) — use these to know what is flaring up TODAY
2. YOUR OWN KNOWLEDGE of the world — use this to include major ongoing conflicts and crises that are always relevant (Ukraine war, Gaza, Sudan, Sahel instability, Taiwan Strait, North Korea, etc.) even if they don't appear in today's headlines

The final list should be a MIX: some driven by today's news signals, some from your background knowledge of persistent crises. Between both sources you should always find 15 genuinely important situations.

For each situation, output a JSON object:
{
  "id": <number 1–15>,
  "type": <"conflict"|"protest"|"nature"|"economic"|"political">,
  "name": <short name in Russian, max 30 chars>,
  "lat": <latitude of the epicenter>,
  "lng": <longitude of the epicenter>,
  "scale": <0.0–1.0, human impact × global significance>,
  "duration": <how long active, in Russian: "3 года", "6 мес.", "2 нед.", "активен">,
  "desc": <one punchy line in Russian capturing the essence, max 70 chars>,
  "summary": <3–4 sentences in Russian — what's happening NOW, why it matters, root cause, what could tip it either way. Write as analyst, not journalist.>,
  "effects": [
    <concrete consequence: economic / humanitarian / military / diplomatic — use specific numbers or names>,
    <second-order effect or link to another crisis in this list>,
    <near-future risk, fragile equilibrium, or escalation scenario>
  ]
}

Hard rules:
- Exactly 15 items
- No two items at the same location
- effects[] must be specific — no platitudes like "situation remains tense"
- Output ONLY the raw JSON array. No markdown fences, no explanation.

NEWS SIGNALS (last 48h):
${headlines}`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'X-Title': 'World Pulse',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash-001',
      max_tokens: 6000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }

  const json = await res.json();
  const text = json.choices[0].message.content.trim();

  // Strip markdown code fences if model adds them anyway
  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  const parsed = JSON.parse(cleaned);

  return parsed.map((s, i) => ({
    ...s,
    id: i + 1,
    color: TYPE_COLORS[s.type] ?? '#8b5cf6',
    tag:   TYPE_TAGS[s.type]   ?? 'событие',
  }));
}

app.get('/api/situations', async (req, res) => {
  try {
    const now = Date.now();
    if (cache.data && now - cache.fetchedAt < CACHE_TTL) {
      return res.json({ situations: cache.data, cached: true, fetchedAt: cache.fetchedAt });
    }

    const headlines = await fetchNewsHeadlines();
    const situations = await analyzeWithLLM(headlines);
    cache = { data: situations, fetchedAt: now };
    res.json({ situations, cached: false, fetchedAt: now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/situations/refresh', async (req, res) => {
  cache = { data: null, fetchedAt: 0 };
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`World Pulse server → http://localhost:${PORT}`);
  if (!NEWS_API_KEY)       console.warn('⚠  NEWS_API_KEY not set');
  if (!OPENROUTER_API_KEY) console.warn('⚠  OPENROUTER_API_KEY not set');
});
