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

export async function analyzeWithLLM(articles) {
  const headlines = articles
    .slice(0, 200)
    .map(a => `[${a.source}] ${a.title}. ${a.snippet}`)
    .join('\n');

  const prompt = `You are a senior geopolitical analyst. Today: ${new Date().toISOString().slice(0, 10)}.

TASK: Produce 10–25 active global situations in two categories:

CATEGORY 1 — ONGOING (breaking: false):
All 10 permanent conflicts listed below. Always include every one.
${KNOWN_SLUGS.join(', ')}

CATEGORY 2 — BREAKING (breaking: true):
Up to 15 situations driven by TODAY's news: new crises, sudden escalations, disasters, coups, major attacks.
Only include if genuinely newsworthy in the last 48h. Can be 0 if nothing significant.

For each situation output a JSON object:
{
  "id": <sequential number>,
  "slug": <kebab-case; use exact existing slug for known situations>,
  "type": <"conflict"|"protest"|"nature"|"economic"|"political">,
  "name": <short name in Russian, max 30 chars>,
  "lat": <latitude>,
  "lng": <longitude>,
  "scale": <0.0–1.0, human impact × global significance>,
  "duration": <in Russian: "3 года", "6 мес.", "2 дня", "сегодня">,
  "desc": <one punchy line in Russian, max 70 chars>,
  "summary": <3–4 sentences in Russian — what's happening NOW, why it matters>,
  "effects": [<3 specific consequences in Russian>],
  "breaking": <true for category 2, false for category 1>
}

Hard rules:
- All 10 permanent situations must be included (breaking: false)
- Breaking situations: only from last 48h, must have actual news signal
- No two items at the same location
- Use exact known slugs for permanent situations; new slugs for breaking events
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
  "related": <array of 2–4 slugs from this list that are thematically connected: ${KNOWN_SLUGS.join(', ')}>,
  "newsRu": <array of translated news items — same length as the input news array. Each item: { "title": string (translated headline in Russian, max 120 chars), "snippet": string (translated lead in Russian, max 200 chars) }>
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
