export default function HistorySection({ history }) {
  if (!history) return null;
  const paragraphs = Array.isArray(history) ? history.filter(Boolean) : history.split('\n\n').filter(Boolean);
  return (
    <div className="dp-history">
      {paragraphs.map((p, i) => (
        <p key={i} className={`dp-body-p${i === 0 ? ' first' : ''}`}>{p}</p>
      ))}
    </div>
  );
}
