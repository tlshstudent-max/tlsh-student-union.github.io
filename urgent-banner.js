import { usesSupabaseForContent } from './backend.js';
import { publishedUrgentContent } from './urgent-data.js';
import { activeUrgent, urgentTimeLabel } from './lib/urgent.js';

export function mountUrgentNotices(anchor) {
    if (!usesSupabaseForContent) return;
    const region = document.createElement('section');
    region.className = 'urgent-banner'; region.hidden = true;
    region.setAttribute('aria-label', '緊急通告'); region.setAttribute('aria-live', 'polite');
    anchor.after(region);
    const root = new URL('./', import.meta.url), storageKey = `tlsh-urgent-collapse:${root.href}`;
    let items = [], failed = false, busy = false, expiryTimer, rendered = '';
    const node = (tag, text, className) => {
        const element = document.createElement(tag);
        if (text !== undefined) element.textContent = text;
        if (className) element.className = className;
        return element;
    };
    function render() {
        clearTimeout(expiryTimer);
        items = items.filter(item => activeUrgent(item));
        if (items.length) expiryTimer = setTimeout(render, Math.min(2147483647, Math.max(1, Math.min(...items.map(item => new Date(item.urgent_until).getTime())) - Date.now())));
        const signature = JSON.stringify(items.map(({id,updated_at,title,summary,urgent_until}) => [id,updated_at,title,summary,urgent_until]));
        const state = `${signature}:${failed}`;
        if (state === rendered) return;
        rendered = state;
        region.hidden = !items.length && !failed;
        region.replaceChildren();
        if (items.length) {
            const details = node('details'), heading = node('summary');
            try { details.open = sessionStorage.getItem(storageKey) !== signature; } catch { details.open = true; }
            heading.append(node('strong', `！緊急通告 · ${items.length} 則`), node('span', '展開／收合', 'urgent-toggle-hint'));
            details.append(heading);
            const list = node('ul');
            for (const item of items) {
                const row = node('li'), title = node('a', item.title, 'urgent-title');
                title.href = new URL(`announcement.html?id=${encodeURIComponent(item.id)}`, root).href;
                row.append(title);
                if (item.summary) row.append(node('p', item.summary, 'urgent-summary'));
                const meta = node('div', undefined, 'urgent-meta');
                meta.append(node('span', `提示至 ${urgentTimeLabel(item.urgent_until)}（台灣時間）`));
                const link = node('a', '查看詳情 ↗'); link.href = title.href;
                link.setAttribute('aria-label', `查看詳情：${item.title}`);
                meta.append(link); row.append(meta); list.append(row);
            }
            details.append(list);
            // Persist during activation; the native asynchronous toggle event can be lost on navigation.
            heading.addEventListener('click', event => {
                event.preventDefault(); details.open = !details.open;
                try { if (details.open) sessionStorage.removeItem(storageKey); else sessionStorage.setItem(storageKey, signature); } catch { /* Optional convenience only. */ }
            });
            region.append(details);
        }
        if (failed) {
            const status = node('p', items.length ? '暫時無法確認最新通告，以下次更新為準。' : '緊急通告暫時無法讀取。', 'urgent-error');
            const retry = node('button', '重試'); retry.type = 'button'; retry.addEventListener('click', refresh);
            status.append(' ', retry); region.append(status);
        }
    }
    async function refresh() {
        render(); // Expire cached notices even if the next request fails.
        if (busy) return;
        busy = true;
        try { items = await publishedUrgentContent(); failed = false; }
        catch { failed = true; }
        finally { busy = false; render(); }
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    setInterval(() => { if (!document.hidden) refresh(); }, 60000);
    refresh();
}
