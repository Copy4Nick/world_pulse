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
