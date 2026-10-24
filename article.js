import { publishedContent } from './backend.js';
import { safeHttpsUrl, normalizeDate } from './lib/content.js';
import { departments } from './lib/publication.js';
import { setPublicArticleMetadata } from './lib/seo.js';

const status = document.getElementById('article-status'), feedback = document.getElementById('article-feedback');
const article = document.getElementById('article'), retry = document.getElementById('article-retry');
const params = new URLSearchParams(location.search), id = params.get('id'), kind = params.get('kind') || 'announcement';
let loading = false;
const copy = document.getElementById('article-copy'), copyStatus = document.getElementById('article-copy-status');
const copyFallback = document.getElementById('article-copy-fallback'), copyUrl = document.getElementById('article-copy-url');
copy.addEventListener('click', async () => {
    if (copy.disabled || article.hidden) return;
    const url = new URL('announcement.html', import.meta.url);
    url.searchParams.set('id', id);
    if (kind === 'document') url.searchParams.set('kind', kind);
    copy.disabled = true; copyStatus.textContent = ''; copyFallback.hidden = true;
    try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(url.href);
        copyStatus.textContent = '連結已複製，可貼到班群分享。';
    } catch {
        copyStatus.textContent = '目前無法自動複製，請選取下方連結。';
        copyUrl.value = url.href; copyFallback.hidden = false; copyUrl.focus(); copyUrl.select();
    } finally { copy.disabled = false; }
});
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
            document.querySelector('meta[name="robots"]').content = 'noindex, follow';
            status.textContent = '這個內容連結無效，請返回列表重新選擇。';
            return;
        }
        const [item] = await publishedContent(kind, id);
        if (!item) {
            document.querySelector('meta[name="robots"]').content = 'noindex, follow';
            status.textContent = '這份內容目前未公開，或已經下架。';
            return;
        }
        setPublicArticleMetadata(item, kind);
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
