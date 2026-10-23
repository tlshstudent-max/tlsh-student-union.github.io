import { fetchAnnouncements } from './public-data.js';
(() => {
    const container = document.getElementById('announcement-grid');
    const status = document.getElementById('announcement-status');
    if (!container) return;

    function createAnnouncement(item) {
        const href = item.id && item.body ? `announcement.html?id=${encodeURIComponent(item.id)}` : item.url;
        const card = document.createElement(href ? 'a' : 'article');
        card.className = 'news-card';
        if (href) {
            card.href = href;
            if (new URL(href, location.href).origin !== window.location.origin) {
                card.target = '_blank';
                card.rel = 'noopener noreferrer';
            }
        }

        const tag = document.createElement('span');
        tag.className = 'category-tag';
        tag.textContent = item.category;

        const title = document.createElement('h3');
        title.textContent = item.title;

        const summary = document.createElement('p');
        summary.textContent = item.summary;
        card.append(tag, title, summary);

        if (item.date) {
            const time = document.createElement('time');
            time.className = 'news-date';
            time.dateTime = item.date.iso;
            time.textContent = item.date.label;
            card.append(time);
        }
        return card;
    }

    async function loadAnnouncements() {
        try {
            const announcements = (await fetchAnnouncements())
                .sort((a, b) => (b.date?.timestamp || 0) - (a.date?.timestamp || 0));

            if (!announcements.length) {
                container.replaceChildren();
                status.textContent = '目前沒有最新公告。';
                return;
            }

            container.replaceChildren(...announcements.map(createAnnouncement));
            status.textContent = `已同步 ${announcements.length} 則公開消息`;
        } catch (error) {
            console.error('公告讀取失敗：', error);
            status.textContent = '暫時無法更新。下方為網站預設公告，日期請以各則公告標示為準。';
            status.classList.add('is-warning');
        } finally {
            container.setAttribute('aria-busy', 'false');
        }
    }

    loadAnnouncements();
})();
