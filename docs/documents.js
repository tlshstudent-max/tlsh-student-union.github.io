import { fetchDocuments } from '../public-data.js';
import { contentHref } from '../lib/publication.js';
(() => {
    const elements = {
        list: document.getElementById('archive-list'),
        status: document.getElementById('archive-status'),
        count: document.getElementById('document-count'),
        search: document.getElementById('document-search'),
        category: document.getElementById('category-filter'),
        year: document.getElementById('year-filter'),
        sort: document.getElementById('sort-order'),
        controls: document.getElementById('archive-controls'),
        filterCount: document.getElementById('active-filter-count'),
    };

    if (!elements.list) return;
    let documents = [];
    let loading = false;

    function resetFilters() {
        elements.search.value = elements.category.value = elements.year.value = '';
        elements.sort.value = 'newest';
        render();
    }
    document.getElementById('reset-document-filters').addEventListener('click', resetFilters);

    function appendOptions(select, values) {
        values.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            select.append(option);
        });
    }

    function createDocumentItem(item) {
        const article = document.createElement('article');
        article.className = 'archive-item';

        const meta = document.createElement('div');
        meta.className = 'document-meta';
        const date = document.createElement('time');
        date.className = 'date';
        date.dateTime = item.isoDate;
        date.textContent = item.date;
        const year = document.createElement('span');
        year.className = 'document-year';
        year.textContent = item.year ? `${item.year} 學年度` : '';
        meta.append(date, year);

        const body = document.createElement('div');
        body.className = 'document-body';
        const category = document.createElement('span');
        category.className = 'document-category';
        category.textContent = item.category;
        const title = document.createElement('h3');
        title.className = 'title';
        title.textContent = item.title;
        body.append(category, title);
        if (item.description) {
            const description = document.createElement('p');
            description.className = 'document-description';
            description.textContent = item.description;
            body.append(description);
        }

        const link = document.createElement('a');
        link.className = 'download-link';
        const href = contentHref(item, '../announcement.html');
        link.href = href;
        if (new URL(href, location.href).origin !== location.origin) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
        link.textContent = '檢視文件 ↗';
        link.setAttribute('aria-label', `檢視文件：${item.title}`);
        article.append(meta, body, link);
        return article;
    }

    function render() {
        if (loading) return;
        const query = elements.search.value.trim().toLocaleLowerCase('zh-TW');
        const category = elements.category.value;
        const year = elements.year.value;
        const direction = elements.sort.value === 'oldest' ? 1 : -1;

        const filtered = documents
            .filter(item => !category || item.category === category)
            .filter(item => !year || item.year === year)
            .filter(item => !query || [item.title, item.description, item.category, item.year].join(' ').toLocaleLowerCase('zh-TW').includes(query))
            .sort((a, b) => (a.timestamp - b.timestamp) * direction);

        elements.list.replaceChildren(...filtered.map(createDocumentItem));
        elements.controls.hidden = !documents.length;
        elements.count.textContent = documents.length ? `${filtered.length} 份公開文件` : '';
        const active = Number(Boolean(category)) + Number(Boolean(year)) + Number(elements.sort.value !== 'newest');
        elements.filterCount.textContent = active ? `已套用 ${active} 項` : '';
        elements.status.className = 'archive-status';
        elements.status.textContent = !documents.length ? '目前尚無公開文件，正式文件將於整理完成後上架。'
            : filtered.length ? '' : '目前沒有符合條件的公開文件。';
        if (documents.length && !filtered.length) {
            const reset = document.createElement('button');
            reset.className = 'button button-secondary'; reset.textContent = '清除搜尋與篩選';
            reset.addEventListener('click', resetFilters); elements.status.append(' ', reset);
        }
    }

    async function loadDocuments() {
        if (loading) return;
        loading = true;
        documents = []; elements.list.replaceChildren(); elements.controls.hidden = true;
        elements.count.textContent = '';
        elements.status.className = 'archive-status';
        elements.status.textContent = '正在讀取公開文件…';
        elements.list.setAttribute('aria-busy', 'true');
        try {
            documents = await fetchDocuments();
            elements.category.replaceChildren(new Option('全部類別', ''));
            elements.year.replaceChildren(new Option('全部年度', ''));
            appendOptions(elements.category, [...new Set(documents.map(item => item.category))].sort());
            appendOptions(elements.year, [...new Set(documents.map(item => item.year).filter(Boolean))].sort((a, b) => b.localeCompare(a, 'zh-TW', { numeric: true })));
            loading = false;
            render();
        } catch (error) {
            console.error('公開文件載入失敗：', error);
            elements.status.className = 'archive-status is-error';
            elements.status.textContent = '文件庫暫時無法讀取。請重試，或聯絡學生會文書組。';
            const retry = document.createElement('button');
            retry.className = 'button button-secondary';
            retry.textContent = '重新載入';
            retry.addEventListener('click', () => { retry.disabled = true; loadDocuments(); });
            elements.status.append(' ', retry);
            elements.count.textContent = '';
        } finally {
            loading = false;
            elements.list.setAttribute('aria-busy', 'false');
        }
    }

    elements.search.addEventListener('input', render);
    [elements.category, elements.year, elements.sort].forEach(control => control.addEventListener('change', render));

    loadDocuments();
})();
