import { contentHref, departments, publication } from './publication.js';

export function announcementCard(item, articlePath = 'announcement.html') {
    const href = contentHref(item, articlePath);
    const card = document.createElement(href ? 'a' : 'article');
    card.className = 'news-card';
    if (href) {
        card.href = href;
        if (new URL(href, location.href).origin !== location.origin) {
            card.target = '_blank'; card.rel = 'noopener noreferrer';
        }
    }
    const { department } = publication(item);
    const label = department === 'union' ? item.category : `${departments[department].label} · ${item.category}`;
    for (const [tag, value, className] of [['span', label, 'category-tag'], ['h3', item.title], ['p', item.summary]]) {
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
