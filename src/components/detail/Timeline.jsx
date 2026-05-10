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
