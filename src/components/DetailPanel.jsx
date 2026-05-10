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
  const data = detail ?? situation;

  return (
    <div className={`detail-panel${isOpen ? ' open' : ''}`}>
      {isOpen && (
        <>
          <div className="dp-hero">
            {detail?.photos?.[0]
              ? <img src={detail.photos[0].url} alt={detail.photos[0].caption} className="dp-hero-img" />
              : <div className="dp-hero-placeholder" />
            }
            <div className="dp-hero-overlay">
              <button className="dp-back-btn" onClick={onClose}>← Все ситуации</button>
            </div>
          </div>

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
