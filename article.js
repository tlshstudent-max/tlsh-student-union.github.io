import { publishedContent } from './backend.js';
import { safeHttpsUrl, normalizeDate } from './lib/content.js';
const status = document.getElementById('article-status');
try {
    const id = new URLSearchParams(location.search).get('id');
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) throw new Error('not found');
    const [item] = await publishedContent('announcement', id);
    if (!item) {
        status.textContent = '這則公告目前未公開，或已經下架。';
    } else {
        document.title = `${item.title} | 斗六高中學生會`;
        for (const field of ['category', 'title', 'summary', 'body']) document.getElementById(`article-${field}`).textContent = item[field];
        const date = normalizeDate(item.date);
        document.getElementById('article-date').textContent = date?.label || '';
        if (date) document.getElementById('article-date').dateTime = date.iso;
        const url = safeHttpsUrl(item.url);
        if (url) { document.getElementById('article-link').href = url; document.getElementById('article-link').hidden = false; }
        document.getElementById('article').hidden = false;
        status.textContent = '';
    }
} catch { status.textContent = '目前無法讀取這則公告，請稍後再試或返回最新消息。'; }
