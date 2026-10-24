import { fetchAnnouncements } from '../public-data.js';
import { announcementCard } from '../lib/public-cards.js';

const list = document.getElementById('activity-list');
const status = document.getElementById('activity-status');
let loading = false;
async function load() {
    if (loading) return;
    loading = true; list.replaceChildren(); list.setAttribute('aria-busy', 'true');
    status.textContent = '正在讀取活動公告…';
    try {
        const items = (await fetchAnnouncements()).filter(item => ['校園活動', '活動公告'].includes(item.category))
            .sort((a, b) => (b.date?.timestamp || 0) - (a.date?.timestamp || 0));
        list.replaceChildren(...items.map(item => announcementCard(item, '../announcement.html')));
        status.textContent = items.length ? '以下日期為公告發布日期，活動時間請查看公告內文。'
            : '近期活動待公告。時間、地點及報名方式將隨正式活動公告公布。';
    } catch {
        status.textContent = '活動公告暫時無法讀取，請重新載入。';
        const retry = document.createElement('button');
        retry.className = 'button button-secondary'; retry.textContent = '重新載入';
        retry.addEventListener('click', load); status.append(' ', retry);
    } finally { loading = false; list.setAttribute('aria-busy', 'false'); }
}
load();
