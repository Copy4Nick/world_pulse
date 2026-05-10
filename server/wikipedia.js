const WIKI_API = 'https://en.wikipedia.org/api/rest_v1/page/summary';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

export async function fetchWikipediaSummary(wikiSlug) {
  try {
    const res = await fetch(`${WIKI_API}/${encodeURIComponent(wikiSlug)}`, {
      headers: { 'User-Agent': 'WorldPulse/1.0 (educational project)' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { extract: data.extract ?? '', title: data.title ?? wikiSlug };
  } catch (err) {
    console.warn('[Wikipedia] failed for', wikiSlug, err.message);
    return null;
  }
}

export async function fetchWikimediaPhotos(searchTerm, maxPhotos = 3) {
  try {
    const searchUrl = new URL(COMMONS_API);
    searchUrl.searchParams.set('action', 'query');
    searchUrl.searchParams.set('generator', 'search');
    searchUrl.searchParams.set('gsrnamespace', '6');
    searchUrl.searchParams.set('gsrsearch', `${searchTerm} -logo -map -flag`);
    searchUrl.searchParams.set('gsrlimit', String(maxPhotos * 3));
    searchUrl.searchParams.set('prop', 'imageinfo');
    searchUrl.searchParams.set('iiprop', 'url|extmetadata');
    searchUrl.searchParams.set('iiurlwidth', '800');
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('origin', '*');

    const res = await fetch(searchUrl.toString(), {
      headers: { 'User-Agent': 'WorldPulse/1.0 (educational project)' },
    });
    if (!res.ok) return [];

    const data = await res.json();
    const pages = Object.values(data.query?.pages ?? {});

    const photos = [];
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      if (!info?.url) continue;

      const meta = info.extmetadata ?? {};
      const license = meta.LicenseShortName?.value ?? '';
      if (!license.match(/CC|Public Domain|PD/i)) continue;

      const caption = meta.ImageDescription?.value?.replace(/<[^>]+>/g, '').slice(0, 120)
        ?? meta.ObjectName?.value
        ?? '';

      photos.push({ url: info.url, caption, license });
      if (photos.length >= maxPhotos) break;
    }
    return photos;
  } catch (err) {
    console.warn('[Wikimedia] failed for', searchTerm, err.message);
    return [];
  }
}
