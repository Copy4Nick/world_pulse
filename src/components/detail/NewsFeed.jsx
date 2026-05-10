export default function NewsFeed({ news }) {
  if (!news?.length) return null;
  return (
    <div className="dp-news-feed">
      {news.map((item, i) => (
        <div key={i} className="dp-news-item">
          <span className="dp-news-time">{item.time}</span>
          <div className="dp-news-body">
            <p className="dp-news-text">{item.text}</p>
            <span className="dp-news-src">{item.source}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
