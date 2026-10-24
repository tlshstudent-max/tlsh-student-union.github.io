export const publicRoot = 'https://tlshstudent-max.github.io/tlsh-student-union.github.io/';

// Identity comes from a confirmed public record, never from arbitrary URL parameters.
export function articleMetadata(item, kind) {
    const url = new URL('announcement.html', publicRoot);
    url.searchParams.set('id', item.id);
    if (kind === 'document') url.searchParams.set('kind', kind);
    return {
        url: url.href,
        title: `${item.title} | 斗六高中學生會`,
        description: String(item.summary || item.body || `閱讀斗六高中學生會的${kind === 'document' ? '公開文件' : '公告'}：${item.title}`).replace(/\s+/g, ' ').slice(0, 160),
    };
}

export function setPublicArticleMetadata(item, kind) {
    const meta = articleMetadata(item, kind);
    document.title = meta.title;
    const canonical = document.createElement('link');
    canonical.rel = 'canonical'; canonical.href = meta.url; document.head.append(canonical);
    for (const [selector, value] of [
        ['meta[name="description"]', meta.description], ['meta[property="og:title"]', meta.title],
        ['meta[property="og:description"]', meta.description], ['meta[property="og:url"]', meta.url],
        ['meta[property="og:type"]', 'article'], ['meta[name="twitter:title"]', meta.title],
        ['meta[name="twitter:description"]', meta.description], ['meta[name="robots"]', 'index, follow, max-image-preview:large'],
    ]) document.querySelector(selector)?.setAttribute('content', value);
    const data = document.createElement('script');
    data.type = 'application/ld+json';
    data.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: item.title, description: meta.description, url: meta.url, inLanguage: 'zh-TW', datePublished: item.date, publisher: { '@type': 'Organization', name: '斗六高中學生會', url: publicRoot }, mainEntityOfPage: meta.url });
    document.head.append(data);
}
