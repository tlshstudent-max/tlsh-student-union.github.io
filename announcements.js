import { fetchAnnouncements } from './public-data.js';
import { announcementCard } from './lib/public-cards.js';
(() => {
    const container = document.getElementById('announcement-grid');
    const status = document.getElementById('announcement-status');
    if (!container) return;

    let loading = false;
    async function loadAnnouncements() {
        if (loading) return;
        loading = true;
        container.replaceChildren();
        container.setAttribute('aria-busy', 'true');
        status.classList.remove('is-warning');
        status.textContent = '正在讀取公開消息…';
        try {
            const announcements = (await fetchAnnouncements())
                .sort((a, b) => (b.date?.timestamp || 0) - (a.date?.timestamp || 0));

            if (!announcements.length) {
                container.replaceChildren();
                status.textContent = '目前沒有最新公告。';
                return;
            }

            container.replaceChildren(...announcements.map(item => announcementCard(item)));
            status.textContent = `已同步 ${announcements.length} 則公開消息`;
        } catch (error) {
            console.error('公告讀取失敗：', error);
            status.textContent = '最新消息暫時無法讀取，請重新載入。';
            status.classList.add('is-warning');
            const retry = document.createElement('button');
            retry.className = 'button button-secondary';
            retry.textContent = '重新載入';
            retry.addEventListener('click', loadAnnouncements);
            status.append(' ', retry);
        } finally {
            loading = false;
            container.setAttribute('aria-busy', 'false');
        }
    }

    loadAnnouncements();
})();
