import { publishedContent } from './backend.js';
import { safeHttpsUrl, normalizeDate } from './lib/content.js';
import { departments } from './lib/publication.js';
const status = document.getElementById('article-status');
try {
    const params = new URLSearchParams(location.search), id = params.get('id');
    const kind = params.get('kind') || 'announcement';
    if (!['announcement', 'document'].includes(kind)) throw new Error('not found');
    if (kind === 'document') {
        document.getElementById('article-back').href = 'docs/';
        document.getElementById('article-back').textContent = '← 返回公開文件';
    }
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) throw new Error('not found');
    const [item] = await publishedContent(kind, id);
    if (!item) {
        status.textContent = '這份內容目前未公開，或已經下架。';
    } else {
        document.title = `${item.title} | 斗六高中學生會`;
        for (const field of ['category', 'title', 'summary', 'body']) document.getElementById(`article-${field}`).textContent = item[field];
        if (item.department !== 'union') document.getElementById('article-category').textContent = `${departments[item.department].label} · ${item.category}`;
        if (kind === 'announcement' && item.department !== 'union') {
            document.getElementById('article-back').href = departments[item.department].path;
            document.getElementById('article-back').textContent = `← 返回${departments[item.department].label}`;
        }
        const date = normalizeDate(item.date);
        document.getElementById('article-date').textContent = date?.label || '';
        if (date) document.getElementById('article-date').dateTime = date.iso;
        const url = safeHttpsUrl(item.url);
        if (url) { document.getElementById('article-link').href = url; document.getElementById('article-link').hidden = false; }
        document.getElementById('article').hidden = false;
        status.textContent = '';
    }
} catch { status.textContent = '目前無法讀取這份內容，請稍後再試或返回最新消息。'; }
