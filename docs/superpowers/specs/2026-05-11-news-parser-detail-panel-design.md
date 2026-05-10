# World Pulse — News Parser + Detail Panel

**Дата:** 2026-05-11  
**Статус:** Approved for implementation

---

## Контекст

Текущий World Pulse использует платный NewsAPI (лимиты без подписки) и показывает ситуации только в виде коротких карточек в сайдбаре. Нужно: (1) заменить NewsAPI на бесплатные источники, (2) добавить детальную страницу события в NYT-стиле со скользящей панелью.

---

## Цель

Каждое событие на глобусе открывает полноценный лонгрид: свежие новости из RSS, исторический контекст из Wikipedia, фото из Wikimedia Commons, динамический таймлайн, статистика и связанные ситуации. Контент генерируется LLM на основе реальных данных, подаётся нейтрально — с позициями обеих сторон там, где они есть.

---

## Архитектура

```
Browser (React)
    │  GET /api/situations          — список (глобус + сайдбар)
    │  GET /api/situations/:slug    — детальный лонгрид
    │  POST /api/situations/refresh — сброс кеша
    ▼
Express (server.js)
    ├─ RSS Parser    → BBC, Reuters, Al Jazeera, Guardian
    ├─ Wikipedia API → исторический контекст, таймлайн, базовые факты
    ├─ Wikimedia     → фотографии (свободная лицензия)
    └─ OpenRouter/Gemini → анализ, матчинг, генерация текста
```

---

## 1. Источники данных (бесплатные)

### RSS-ленты
| Источник     | URL |
|---|---|
| BBC World    | `https://feeds.bbci.co.uk/news/world/rss.xml` |
| Reuters      | `https://feeds.reuters.com/reuters/worldNews` |
| Al Jazeera   | `https://www.aljazeera.com/xml/rss/all.xml` |
| Guardian     | `https://www.theguardian.com/world/rss` |

Пакет: `rss-parser` (npm). Парсим каждые 10 минут, складываем в кеш. Из каждой статьи берём: `title`, `contentSnippet`, `pubDate`, `source`.

### Wikipedia API
- Endpoint: `https://en.wikipedia.org/api/rest_v1/page/summary/{title}`
- Используем для: исторического резюме, ключевых дат, базовых цифр
- Дополнительно: `https://en.wikipedia.org/w/api.php?action=query&prop=images` для списка фото

### Wikimedia Commons
- API: `https://commons.wikimedia.org/w/api.php`
- Берём только свободные лицензии (CC-BY, CC-BY-SA, Public Domain)
- Максимум 3 фото на ситуацию

### Кеш
| Данные | TTL |
|---|---|
| RSS-статьи (глобально) | 10 мин |
| Детальный лонгрид (история + фото) | 24 ч |
| Список ситуаций | 10 мин |

---

## 2. База известных конфликтов

Жёстко заданный список ситуаций, которые всегда присутствуют на глобусе — даже если в RSS нет свежих новостей. LLM дополняет их актуальными сигналами.

```js
const KNOWN_SITUATIONS = [
  { slug: 'ukraine-war',      name: 'Война в Украине',          type: 'conflict',  lat: 48.4,  lng: 31.2  },
  { slug: 'gaza-war',         name: 'Война в Газе',             type: 'conflict',  lat: 31.5,  lng: 34.4  },
  { slug: 'sudan-war',        name: 'Война в Судане',           type: 'conflict',  lat: 15.5,  lng: 32.5  },
  { slug: 'myanmar-conflict', name: 'Гражданская война в Мьянме', type: 'conflict', lat: 19.7, lng: 96.1  },
  { slug: 'yemen-war',        name: 'Война в Йемене',           type: 'conflict',  lat: 15.5,  lng: 48.5  },
  { slug: 'syria-conflict',   name: 'Война в Сирии',            type: 'conflict',  lat: 34.8,  lng: 38.9  },
  { slug: 'sahel-crisis',     name: 'Нестабильность в Сахеле',  type: 'conflict',  lat: 15.0,  lng: -2.0  },
  { slug: 'taiwan-strait',    name: 'Тайваньский пролив',       type: 'political', lat: 23.5,  lng: 121.0 },
  { slug: 'north-korea',      name: 'Северная Корея',           type: 'political', lat: 40.0,  lng: 127.0 },
  { slug: 'ethiopia-tigray',  name: 'Конфликт в Эфиопии',       type: 'conflict',  lat: 14.0,  lng: 38.5  },
];
```

Итого на глобусе: 10 постоянных + до 5 новых из RSS-анализа = максимум 15.

---

## 3. Роль LLM (Gemini 2.0 Flash)

LLM запускается в двух сценариях:

### 3a. Обновление списка (каждые 10 мин)
Вход: заголовки RSS (до 200 статей).  
Задача:
1. Сопоставить статьи с известными ситуациями
2. Найти новые ситуации (не из базового списка), достаточно значимые для глобуса
3. Для каждой ситуации вернуть: `{ slug, name, lat, lng, type, scale, duration, desc, summary, effects[] }`

### 3b. Генерация лонгрида (при первом запросе `/api/situations/:slug`, кеш 24ч)
Вход: Wikipedia summary + ключевые даты + свежие RSS-статьи по теме.  
Задача:
1. Написать `history` — 3–4 абзаца исторического контекста, нейтрально, с позициями сторон
2. Составить `timeline[]` — переменное число событий (от 3 до 15), каждое: `{ year, title, desc, major: bool }`
3. Заполнить `stats{}` — ключевые цифры (потери, беженцы, ущерб и т.д.)
4. Написать `outlook` — 2 абзаца о перспективах
5. Выбрать `related[]` — 2–4 связанных ситуации из базового списка

**Правило нейтральности в промпте:** если у сторон конфликта есть разные названия или интерпретации — указывать обе. Не навязывать вывод.

---

## 4. Новые API-эндпоинты

### `GET /api/situations`
Существующий эндпоинт, расширяется: гарантирует наличие всех KNOWN_SITUATIONS даже без свежих новостей.

### `GET /api/situations/:slug`
Возвращает полный объект для лонгрида:
```json
{
  "slug": "ukraine-war",
  "name": "Война в Украине",
  "type": "conflict",
  "lat": 48.4, "lng": 31.2,
  "news": [
    { "time": "2 ч. назад", "text": "...", "source": "Reuters", "url": "..." }
  ],
  "stats": { "casualties": "~200K", "refugees": "6.7M", "damage": "$486B", "frontline": "~1000 км" },
  "history": "Исторический контекст...",
  "timeline": [
    { "year": "1991", "title": "Независимость", "desc": "...", "major": false },
    { "year": "2022", "title": "Вторжение", "desc": "...", "major": true }
  ],
  "photos": [
    { "url": "https://upload.wikimedia.org/...", "caption": "...", "license": "CC-BY-SA" }
  ],
  "outlook": "Перспективы...",
  "related": ["gaza-war", "sahel-crisis"],
  "fetchedAt": 1234567890
}
```

### `POST /api/situations/refresh`
Сбрасывает все кеши (существующий эндпоинт, без изменений).

---

## 5. UI — Detail Panel

### Поведение
- Клик на точку глобуса или карточку сайдбара → панель выезжает справа
- Глобус сжимается: занимает 36% ширины (было 100%)
- Сайдбар скрывается
- Кнопка «← Все ситуации» закрывает панель, глобус возвращается
- Глобус при открытии панели центрируется на выбранной точке и останавливает авторотацию

### Компоненты (новые)

**`DetailPanel.jsx`** — обёртка панели, управляет slide-анимацией и fetch `/api/situations/:slug`

**`ArticleHero.jsx`** — фото-шапка (первое фото из Wikimedia или серый градиент-заглушка)

**`NewsFeed.jsx`** — список свежих RSS-новостей, формат: время + текст + источник

**`StatsRow.jsx`** — сетка из 3–4 ячеек с ключевыми цифрами

**`HistorySection.jsx`** — исторические абзацы с drop-cap на первом

**`Timeline.jsx`** — динамический таймлайн, рендерится из массива, major-события золотой точкой

**`PullQuote.jsx`** — цитата с большой типографской кавычкой

**`RelatedSituations.jsx`** — 2–4 карточки в 2 колонки, клик → открывает другую ситуацию

### Дизайн-токены
```css
--bg:       #181818;   /* графитовый фон */
--bg-mid:   #202020;
--border:   #303030;
--text-1:   #e2dbd0;   /* основной текст */
--text-2:   #9a9490;   /* вторичный */
--text-3:   #5e5a56;   /* мелкий / мутед */
--gold:     #b8903a;   /* акцент (таймлайн, кикер) */
```

### Типографика
- Заголовки: `Playfair Display` (serif, Google Fonts)
- Тело: `Lora` (serif, Google Fonts)
- UI-элементы: `Source Sans 3` (sans, Google Fonts)

---

## 6. Изменения существующих компонентов

| Компонент | Изменение |
|---|---|
| `App.jsx` | Добавить `panelOpen` state; при открытии скрывать сайдбар, менять layout |
| `GlobeView.jsx` | Принимать `compact` prop (36% vs 100% ширины), CSS-переход 0.4s |
| `Sidebar.jsx` | Скрываться при `panelOpen === true` |
| `server.js` | Заменить `fetchNewsHeadlines()` на RSS-парсер; добавить эндпоинт `/:slug` |

---

## 7. Что не входит в скоп

- Авторизация / пользовательские аккаунты
- Push-уведомления об изменениях
- Комментарии или UGC
- Мобильная адаптация (отдельная задача)
- Полнотекстовый парсинг статей (только заголовок + лид из RSS)

---

## 8. Зависимости (новые npm-пакеты)

```
rss-parser    — парсинг RSS-лент
```

`node-fetch` не нужен — проект на Node 18+, встроенный `fetch` уже есть.

**Примечание по RSS:** URL-адреса лент нужно проверить при реализации — Reuters периодически меняет адреса. Если лента недоступна, пропускаем её молча и логируем предупреждение.

**Примечание по Wikipedia Images API:** `prop=images` возвращает только имена файлов. Для получения URL нужен второй запрос с `prop=imageinfo&iiprop=url`. Реализовать как отдельную утилиту `getWikimediaPhoto(filename)`.
