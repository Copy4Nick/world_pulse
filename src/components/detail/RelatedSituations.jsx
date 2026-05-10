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
