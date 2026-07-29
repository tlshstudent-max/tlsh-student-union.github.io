(() => {
    const container = document.getElementById('announcement-grid');
    const status = document.getElementById('announcement-status');
    if (!container || !window.StudentUnionData) return;

    function rowToAnnouncement(cols) {
        const title = (cols[9] || '').trim();
        if (!title) return null;
        const date = StudentUnionData.normalizeDate(cols[7] || '');
        return {
            date,
            category: (cols[8] || '學生會公告').trim(),
            title,
            summary: (cols[10] || '').trim(),
            url: StudentUnionData.safeHttpsUrl(cols[11] || ''),
        };
    }

    function createAnnouncement(item) {
        const card = document.createElement(item.url ? 'a' : 'article');
        card.className = 'news-card';
        if (item.url) {
            card.href = item.url;
            if (new URL(item.url).origin !== window.location.origin) {
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
            const rows = await StudentUnionData.fetchRows();
            const announcements = rows.slice(1)
                .map(rowToAnnouncement)
                .filter(Boolean)
                .sort((a, b) => (b.date?.timestamp || 0) - (a.date?.timestamp || 0));

            if (!announcements.length) {
                status.textContent = '目前沒有最新公告。';
                return;
            }

            container.replaceChildren(...announcements.map(createAnnouncement));
            status.textContent = `已同步 ${announcements.length} 則公開消息`;
        } catch (error) {
            console.error('公告讀取失敗：', error);
            status.textContent = '即時更新暫時無法讀取，以下保留最近同步內容。';
            status.classList.add('is-warning');
        } finally {
            container.setAttribute('aria-busy', 'false');
        }
    }

    loadAnnouncements();
})();
