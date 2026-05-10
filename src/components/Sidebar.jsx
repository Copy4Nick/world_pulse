import { FILTERS } from '../data/situations';

export default function Sidebar({ situations, filter, setFilter, selected, onSelect, fetchedAt }) {
  const visible = filter === 'all' ? situations : situations.filter(s => s.type === filter);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-label">Активных ситуаций</div>
        <div className="sidebar-count">
          {visible.length}
          <span> в мире</span>
        </div>
        {fetchedAt && (
          <div className="fetched-at">
            обновлено: {fetchedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}

        <div className="filters">
          {FILTERS.map(f => (
            <button
              key={f.id}
              className={`filter-btn ${filter === f.id ? 'active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sit-list">
        {visible.map(s => (
          <div
            key={s.id}
            className={`sit-card ${selected?.id === s.id ? 'active' : ''}`}
            onClick={() => onSelect(selected?.id === s.id ? null : s)}
          >
            <div className="sit-card-top">
              <span className="sit-tag" style={{ background: s.color + '22', color: s.color }}>
                {s.tag}
              </span>
              <span className="sit-dur">{s.duration}</span>
            </div>
            <div className="sit-name">{s.name}</div>
            <div className="sit-desc">{s.desc}</div>

            {selected?.id === s.id && (
              <div className="sit-detail">
                <p className="sit-summary">{s.summary}</p>
                <div className="effects-label">Последствия</div>
                {s.effects.map((e, i) => (
                  <div key={i} className="effect-row">
                    <div className="effect-dot" style={{ background: s.color }} />
                    {e}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
