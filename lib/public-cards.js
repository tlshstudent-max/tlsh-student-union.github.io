export function announcementCard(item, articlePath = 'announcement.html') {
    const href = item.id ? `${articlePath}?id=${encodeURIComponent(item.id)}` : item.url;
    const card = document.createElement(href ? 'a' : 'article');
    card.className = 'news-card';
    if (href) {
        card.href = href;
        if (new URL(href, location.href).origin !== location.origin) {
            card.target = '_blank'; card.rel = 'noopener noreferrer';
        }
    }
    for (const [tag, value, className] of [['span', item.category, 'category-tag'], ['h3', item.title], ['p', item.summary]]) {
        const node = document.createElement(tag);
        node.textContent = value || '';
        if (className) node.className = className;
        card.append(node);
    }
    if (item.date) {
        const time = document.createElement('time');
        time.className = 'news-date'; time.dateTime = item.date.iso;
        time.textContent = item.date.label;
        card.append(time);
    }
    return card;
}
