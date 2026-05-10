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
