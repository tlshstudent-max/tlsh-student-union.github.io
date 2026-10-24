import { fetchDepartmentContent } from './public-data.js';
import { announcementCard } from './lib/public-cards.js';
import { departments } from './lib/publication.js';

for (const section of document.querySelectorAll('[data-department-feed]')) {
    const department = section.dataset.departmentFeed;
    const list = section.querySelector('.department-list'), status = section.querySelector('.department-status');
    let loading = false;
    async function load() {
        if (loading) return;
        section.hidden = false;
        loading = true; list.replaceChildren(); list.setAttribute('aria-busy', 'true');
        status.textContent = '正在讀取公開內容…';
        try {
            const items = await fetchDepartmentContent(department, section.dataset.kind || undefined);
            list.replaceChildren(...items.map(item => announcementCard(item, '../announcement.html')));
            status.textContent = items.length ? `共 ${items.length} 筆已發布內容` : `${departments[department].label}目前尚無已發布內容。`;
            section.hidden = !items.length && section.hasAttribute('data-hide-empty');
        } catch {
            status.textContent = '公開內容暫時無法讀取，請重新載入。';
            const retry = document.createElement('button');
            retry.className = 'button button-secondary'; retry.textContent = '重新載入';
            retry.addEventListener('click', load); status.append(' ', retry);
        } finally { loading = false; list.setAttribute('aria-busy', 'false'); }
    }
    load();
}
