import { publishedContent } from './backend.js';
import { safeHttpsUrl, normalizeDate } from './lib/content.js';
import { departments } from './lib/publication.js';

const status = document.getElementById('article-status'), feedback = document.getElementById('article-feedback');
const article = document.getElementById('article'), retry = document.getElementById('article-retry');
const params = new URLSearchParams(location.search), id = params.get('id'), kind = params.get('kind') || 'announcement';
let loading = false;
if (kind === 'document') {
    document.getElementById('article-back').href = 'docs/';
    document.getElementById('article-back').textContent = '← 返回公開文件';
}

async function loadArticle() {
    if (loading) return;
    loading = true; retry.disabled = true; retry.hidden = true; feedback.hidden = false; article.hidden = true;
    status.textContent = '正在讀取內容…'; article.setAttribute('aria-busy', 'true');
    try {
        if (!['announcement', 'document'].includes(kind) || !/^[0-9a-f-]{36}$/i.test(id || '')) {
            status.textContent = '這個內容連結無效，請返回列表重新選擇。';
            return;
        }
        const [item] = await publishedContent(kind, id);
        if (!item) {
            status.textContent = '這份內容目前未公開，或已經下架。';
            return;
        }
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
        article.hidden = false; feedback.hidden = true; status.textContent = '';
    } catch {
        status.textContent = '目前無法讀取這份內容，請重新載入，或返回列表。';
        retry.hidden = false;
    } finally {
        loading = false; retry.disabled = false; article.setAttribute('aria-busy', 'false');
    }
}
retry.addEventListener('click', loadArticle);
loadArticle();
